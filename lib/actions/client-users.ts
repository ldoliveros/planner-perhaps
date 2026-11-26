"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, requireSuperAdmin } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { getSiteURL } from "@/lib/site-url";
import { friendlyInviteError } from "@/lib/friendly-errors";
import { FIRST_NAME_REQUIRED_ERROR, joinPersonName } from "@/lib/person-name";

export interface InviteClientUserState {
  error: string | null;
  savedAt: number | null;
}

export async function inviteClientUser(
  _prevState: InviteClientUserState,
  formData: FormData
): Promise<InviteClientUserState> {
  const email = String(formData.get("email") ?? "").trim();
  // Nombre (obligatorio) + Apellido (opcional) → full_name, con espacio solo si hay Apellido.
  const fullName = joinPersonName(String(formData.get("firstName") ?? ""), String(formData.get("lastName") ?? ""));
  const clientId = String(formData.get("clientId") ?? "");
  const canEditPublications = formData.get("canEditPublications") === "on";

  if (!fullName) {
    return { error: FIRST_NAME_REQUIRED_ERROR, savedAt: null };
  }
  if (!email || !clientId) {
    return { error: "Completá el email.", savedAt: null };
  }

  try {
    await requireSuperAdmin();
  } catch {
    return { error: "No autorizado.", savedAt: null };
  }

  const admin = createAdminClient();

  // El cliente destino debe existir: evita crear una invitación (usuario Auth
  // ya creado y con mail enviado) huérfana, sin profile asociado, por un
  // clientId inválido o de un cliente ya eliminado. `name` viaja como
  // client_name en el user_metadata de la invitación (ver más abajo), para
  // que la plantilla de Supabase pueda personalizar el email por cliente.
  const { data: targetClient } = await admin.from("clients").select("id, name").eq("id", clientId).maybeSingle();
  if (!targetClient) {
    return { error: "El cliente indicado no existe.", savedAt: null };
  }

  const siteURL = await getSiteURL();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { ...(fullName ? { full_name: fullName } : {}), client_name: targetClient.name },
    redirectTo: `${siteURL}/auth/callback`,
  });
  if (error) {
    return { error: friendlyInviteError(error), savedAt: null };
  }

  const { error: profileError } = await admin
    .from("profiles")
    .update({ role: "client", client_id: clientId, full_name: fullName })
    .eq("id", data.user.id);
  if (profileError) {
    return { error: profileError.message, savedAt: null };
  }

  if (canEditPublications) {
    const permissionError = await writePublicationPermission(data.user.id, clientId, true);
    if (permissionError) {
      revalidatePath(`/admin/clients/${clientId}`);
      return { error: `La invitación se envió, pero no se pudo guardar el permiso Editor: ${permissionError}`, savedAt: null };
    }
  }

  revalidatePath(`/admin/clients/${clientId}`);
  return { error: null, savedAt: Date.now() };
}

/** Tabla nueva (20261126000002), fuera de database.types.ts. */
interface EditorsAdminTable {
  from(table: "client_publication_editors"): {
    upsert(
      row: { client_id: string; user_id: string; granted_by: string | null },
      opts: { onConflict: string; ignoreDuplicates: boolean }
    ): PromiseLike<{ error: { message: string } | null }>;
    delete(): {
      eq(column: "client_id", value: string): { eq(column: "user_id", value: string): PromiseLike<{ error: { message: string } | null }> };
    };
  };
}

/** Escribe el permiso con service_role (la tabla no tiene grants de escritura para usuarios). */
async function writePublicationPermission(userId: string, clientId: string, canEdit: boolean): Promise<string | null> {
  const admin = createAdminClient() as unknown as EditorsAdminTable;
  if (canEdit) {
    const grantedBy = await currentUserId();
    const { error } = await admin
      .from("client_publication_editors")
      .upsert({ client_id: clientId, user_id: userId, granted_by: grantedBy }, { onConflict: "client_id,user_id", ignoreDuplicates: true });
    return error?.message ?? null;
  }
  const { error } = await admin.from("client_publication_editors").delete().eq("client_id", clientId).eq("user_id", userId);
  return error?.message ?? null;
}

async function currentUserId(): Promise<string | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return user?.id ?? null;
}

/**
 * Permiso Lector / Editor de un Client User en SU cliente. Solo Super Admin (quien administra los usuarios del
 * cliente). El usuario tiene que ser Client User de ese mismo cliente: un clientId manipulado no habilita nada.
 */
export async function setClientUserPublicationPermission(
  userId: string,
  clientId: string,
  canEdit: boolean
): Promise<{ error: string | null }> {
  try {
    await requireSuperAdmin();
  } catch {
    return { error: "No autorizado." };
  }
  const admin = createAdminClient();
  const { data: target, error: targetError } = await admin
    .from("profiles")
    .select("id, role, client_id")
    .eq("id", userId)
    .maybeSingle();
  if (targetError) return { error: "No se pudo leer el usuario." };
  if (!target) return { error: "El usuario no existe." };
  if (target.role !== "client" || target.client_id !== clientId) {
    return { error: "Este usuario no pertenece al cliente indicado." };
  }
  const error = await writePublicationPermission(userId, clientId, canEdit);
  if (error) return { error: "No se pudo guardar el permiso." };
  revalidatePath(`/admin/clients/${clientId}`);
  return { error: null };
}

export async function deleteClientUser(userId: string, clientId: string): Promise<{ error: string | null }> {
  try {
    await requireSuperAdmin();
  } catch {
    return { error: "No autorizado." };
  }

  const admin = createAdminClient();

  // Antes de borrar el auth.user: confirmar que el usuario objetivo existe,
  // que es efectivamente un Client User, y que pertenece al cliente esperado
  // (el mismo clientId que la UI mostraba). Sin esto, un clientId manipulado
  // en el request permitiría borrar la cuenta de un usuario de OTRO cliente.
  const { data: targetProfile, error: profileError } = await admin
    .from("profiles")
    .select("id, role, client_id")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) return { error: profileError.message };
  if (!targetProfile) return { error: "El usuario no existe." };
  if (targetProfile.role !== "client" || targetProfile.client_id !== clientId) {
    return { error: "Este usuario no pertenece al cliente indicado." };
  }

  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { error: error.message };

  revalidatePath(`/admin/clients/${clientId}`);
  return { error: null };
}
