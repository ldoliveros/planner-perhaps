"use server";

import { revalidatePath } from "next/cache";
import { createAdminClient, requireSuperAdmin } from "@/lib/supabase/admin";
import { getSiteURL } from "@/lib/site-url";
import { friendlyInviteError } from "@/lib/friendly-errors";

/**
 * Reenvía la invitación a un usuario que todavía no confirmó su acceso (Equipo o
 * Client User). Reutiliza el mismo mecanismo que las altas (inviteUserByEmail +
 * el mismo redirectTo): sobre un usuario invitado sin confirmar conserva el
 * mismo user.id, así que no duplica usuarios ni toca su perfil/rol/asignaciones.
 * Solo Super Admin, igual que invitar.
 */
export async function resendInvitation(userId: string): Promise<{ error: string | null; email: string | null }> {
  try {
    await requireSuperAdmin();
  } catch {
    return { error: "No autorizado.", email: null };
  }

  const admin = createAdminClient();

  const { data: profile, error: profileError } = await admin
    .from("profiles")
    .select("id, email, full_name, client_id")
    .eq("id", userId)
    .maybeSingle();
  if (profileError) return { error: "No se pudo leer el usuario.", email: null };
  if (!profile) return { error: "El usuario no existe.", email: null };

  const { data: authData, error: authError } = await admin.auth.admin.getUserById(userId);
  if (authError || !authData.user) return { error: "El usuario no existe.", email: null };
  const authUser = authData.user;

  if (authUser.banned_until && new Date(authUser.banned_until).getTime() > Date.now()) {
    return { error: "Este usuario está desactivado. Reactivá su acceso antes de reenviar la invitación.", email: null };
  }
  if (authUser.email_confirmed_at) {
    return { error: "Este usuario ya confirmó su acceso.", email: null };
  }

  const email = profile.email ?? authUser.email;
  if (!email) return { error: "Este usuario no tiene un email registrado.", email: null };

  // Mismo client_name que en el alta original (inviteClientUser): si es Client User, se vuelve a
  // resolver desde `clients` (no se persiste en profiles); si es de Equipo, `client_id` es null y no se
  // envía client_name — la plantilla de Supabase distingue por la presencia de esa key en user_metadata.
  let clientName: string | null = null;
  if (profile.client_id) {
    const { data: client } = await admin.from("clients").select("name").eq("id", profile.client_id).maybeSingle();
    clientName = client?.name ?? null;
  }

  const siteURL = await getSiteURL();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: { ...(profile.full_name ? { full_name: profile.full_name } : {}), ...(clientName ? { client_name: clientName } : {}) },
    redirectTo: `${siteURL}/auth/callback`,
  });
  if (error) return { error: friendlyInviteError(error, { resend: true }), email: null };
  if (data.user.id !== userId) {
    return { error: "No se pudo reenviar la invitación: el usuario devuelto no coincide.", email: null };
  }

  revalidatePath("/admin/team");
  if (profile.client_id) revalidatePath(`/admin/clients/${profile.client_id}`);
  return { error: null, email };
}
