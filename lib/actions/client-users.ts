"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, requireSuperAdmin } from "@/lib/supabase/admin";
import { getSiteURL } from "@/lib/site-url";
import { friendlyInviteError } from "@/lib/friendly-errors";

export interface InviteClientUserState {
  error: string | null;
  savedAt: number | null;
}

export async function inviteClientUser(
  _prevState: InviteClientUserState,
  formData: FormData
): Promise<InviteClientUserState> {
  const email = String(formData.get("email") ?? "").trim();
  const fullName = String(formData.get("fullName") ?? "").trim() || null;
  const clientId = String(formData.get("clientId") ?? "");

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

  revalidatePath(`/admin/clients/${clientId}`);
  return { error: null, savedAt: Date.now() };
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
