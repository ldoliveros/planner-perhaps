"use server";

import { revalidatePath } from "next/cache";
import {
  countOtherActiveSuperAdmins,
  countOtherSuperAdmins,
  createAdminClient,
  requireSuperAdmin,
} from "@/lib/supabase/admin";
import { getSiteURL } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";

export interface TeamActionState {
  error: string | null;
  savedAt: number | null;
}

type TeamRole = "super_admin" | "account_manager";

function parseJsonArray<T>(raw: FormDataEntryValue | null): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

async function getCallerId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

async function findInvalidClientIds(
  admin: ReturnType<typeof createAdminClient>,
  clientIds: string[]
): Promise<string | null> {
  if (clientIds.length === 0) return null;
  const { data: existing, error } = await admin.from("clients").select("id").in("id", clientIds);
  if (error) return error.message;
  if ((existing?.length ?? 0) !== clientIds.length) {
    return "Uno o más clientes seleccionados no existen.";
  }
  return null;
}

async function getTeamMemberTarget(
  admin: ReturnType<typeof createAdminClient>,
  userId: string
): Promise<{ error: string | null; role: TeamRole | null }> {
  const { data: target, error } = await admin.from("profiles").select("id, role").eq("id", userId).maybeSingle();
  if (error) return { error: error.message, role: null };
  if (!target) return { error: "El usuario no existe.", role: null };
  if (target.role !== "super_admin" && target.role !== "account_manager") {
    return { error: "Este usuario no pertenece al equipo interno.", role: null };
  }
  return { error: null, role: target.role };
}

async function replaceAssignments(
  admin: ReturnType<typeof createAdminClient>,
  userId: string,
  clientIds: string[]
): Promise<string | null> {
  const { error: deleteError } = await admin.from("user_client_assignments").delete().eq("user_id", userId);
  if (deleteError) return deleteError.message;

  if (clientIds.length > 0) {
    const callerId = await getCallerId();
    const { error: insertError } = await admin
      .from("user_client_assignments")
      .insert(clientIds.map((clientId) => ({ user_id: userId, client_id: clientId, created_by: callerId })));
    if (insertError) return insertError.message;
  }
  return null;
}

export async function inviteTeamMember(
  _prevState: TeamActionState,
  formData: FormData
): Promise<TeamActionState> {
  const email = String(formData.get("email") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim() || null;
  const role = String(formData.get("role") ?? "");
  const clientIds = Array.from(new Set(parseJsonArray<string>(formData.get("clientIds"))));

  if (!email) {
    return { error: "Completá el email.", savedAt: null };
  }
  if (role !== "super_admin" && role !== "account_manager") {
    return { error: "Elegí un rol válido.", savedAt: null };
  }

  try {
    await requireSuperAdmin();
  } catch {
    return { error: "No autorizado.", savedAt: null };
  }

  const admin = createAdminClient();

  // Un Super Admin tiene acceso global: no se le crean asignaciones aunque
  // el form las mande (defensa extra, la UI ya no las muestra para este rol).
  const effectiveClientIds = role === "account_manager" ? clientIds : [];
  if (effectiveClientIds.length > 0) {
    const clientsError = await findInvalidClientIds(admin, effectiveClientIds);
    if (clientsError) return { error: clientsError, savedAt: null };
  }

  const siteURL = await getSiteURL();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: fullName ? { full_name: fullName } : undefined,
    redirectTo: `${siteURL}/auth/callback`,
  });
  if (error) {
    return { error: error.message, savedAt: null };
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({ role, client_id: null, full_name: fullName })
    .eq("id", data.user.id);
  if (profileError) {
    return { error: profileError.message, savedAt: null };
  }

  if (effectiveClientIds.length > 0) {
    const assignError = await replaceAssignments(admin, data.user.id, effectiveClientIds);
    if (assignError) return { error: assignError, savedAt: null };
  }

  revalidatePath("/admin/team");
  return { error: null, savedAt: Date.now() };
}

export async function updateTeamMemberName(userId: string, fullName: string): Promise<{ error: string | null }> {
  try {
    await requireSuperAdmin();
  } catch {
    return { error: "No autorizado." };
  }

  const admin = createAdminClient();
  const target = await getTeamMemberTarget(admin, userId);
  if (target.error) return { error: target.error };

  const { error } = await admin.from("profiles").update({ full_name: fullName.trim() || null }).eq("id", userId);
  if (error) return { error: error.message };

  revalidatePath("/admin/team");
  return { error: null };
}

export async function saveTeamMemberAssignments(
  userId: string,
  clientIds: string[]
): Promise<{ error: string | null }> {
  try {
    await requireSuperAdmin();
  } catch {
    return { error: "No autorizado." };
  }

  const admin = createAdminClient();
  const target = await getTeamMemberTarget(admin, userId);
  if (target.error) return { error: target.error };
  if (target.role !== "account_manager") {
    return { error: "Un Super Admin tiene acceso global: no se le asignan clientes." };
  }

  const uniqueClientIds = Array.from(new Set(clientIds));
  const clientsError = await findInvalidClientIds(admin, uniqueClientIds);
  if (clientsError) return { error: clientsError };

  const assignError = await replaceAssignments(admin, userId, uniqueClientIds);
  if (assignError) return { error: assignError };

  revalidatePath("/admin/team");
  return { error: null };
}

/**
 * Cambia el rol de un miembro del equipo interno (Super Admin <-> Account
 * Manager). Protecciones:
 * - degradar a Account Manager exige al menos 1 cliente asignado.
 * - nunca deja el sistema en 0 Super Admin (chequeo acá para un mensaje
 *   claro; el trigger protect_profiles en DB es la red de seguridad real,
 *   incluso si esta función tuviera un bug).
 */
export async function changeTeamMemberRole(
  userId: string,
  newRole: TeamRole,
  clientIds: string[]
): Promise<{ error: string | null }> {
  try {
    await requireSuperAdmin();
  } catch {
    return { error: "No autorizado." };
  }

  const admin = createAdminClient();
  const target = await getTeamMemberTarget(admin, userId);
  if (target.error) return { error: target.error };
  if (target.role === newRole) return { error: null };

  if (newRole === "account_manager") {
    const uniqueClientIds = Array.from(new Set(clientIds));
    if (uniqueClientIds.length === 0) {
      return { error: "Elegí al menos un cliente antes de degradar a Account Manager." };
    }
    const clientsError = await findInvalidClientIds(admin, uniqueClientIds);
    if (clientsError) return { error: clientsError };

    const remaining = await countOtherSuperAdmins(userId);
    if (remaining === 0) {
      return { error: "No podés degradar al último Super Admin del sistema." };
    }

    const { error: roleError } = await admin.from("profiles").update({ role: "account_manager" }).eq("id", userId);
    if (roleError) return { error: roleError.message };

    const assignError = await replaceAssignments(admin, userId, uniqueClientIds);
    if (assignError) return { error: assignError };
  } else {
    // account_manager -> super_admin: las asignaciones existentes quedan en
    // DB (no condicionan más su acceso, ya tiene acceso global).
    const { error: roleError } = await admin.from("profiles").update({ role: "super_admin" }).eq("id", userId);
    if (roleError) return { error: roleError.message };
  }

  revalidatePath("/admin/team");
  return { error: null };
}

/**
 * Activa/desactiva el acceso vía ban_duration real de Supabase Auth — no
 * borra usuario, asignaciones ni contenido, no toca profiles.role. Antes de
 * desactivar a un Super Admin, valida que no sea el último activo (incluye
 * el caso de auto-desactivación).
 */
export async function setTeamMemberActive(userId: string, active: boolean): Promise<{ error: string | null }> {
  try {
    await requireSuperAdmin();
  } catch {
    return { error: "No autorizado." };
  }

  const admin = createAdminClient();
  const target = await getTeamMemberTarget(admin, userId);
  if (target.error) return { error: target.error };

  if (!active && target.role === "super_admin") {
    const remainingActive = await countOtherActiveSuperAdmins(userId);
    if (remainingActive === 0) {
      return { error: "No podés desactivar al último Super Admin activo." };
    }
  }

  const { error } = await admin.auth.admin.updateUserById(userId, {
    ban_duration: active ? "none" : "876000h",
  });
  if (error) return { error: error.message };

  revalidatePath("/admin/team");
  return { error: null };
}

/**
 * Le manda al miembro del equipo el mismo link oficial de "¿Olvidaste tu
 * contraseña?" que ya existe en /login — el Super Admin nunca genera, ve ni
 * transmite ninguna contraseña, solo dispara el mecanismo de Supabase Auth
 * en nombre de otro usuario.
 */
export async function sendTeamMemberPasswordReset(userId: string): Promise<{ error: string | null }> {
  try {
    await requireSuperAdmin();
  } catch {
    return { error: "No autorizado." };
  }

  const admin = createAdminClient();
  const target = await getTeamMemberTarget(admin, userId);
  if (target.error) return { error: target.error };

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("email")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) return { error: profileError.message };
  if (!profile?.email) return { error: "Este usuario no tiene un email registrado." };

  const siteURL = await getSiteURL();
  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(profile.email, {
    redirectTo: `${siteURL}/auth/callback?next=/auth/reset-password`,
  });
  if (error) return { error: error.message };

  return { error: null };
}
