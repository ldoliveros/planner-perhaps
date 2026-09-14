"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { createAdminClient, requireAdmin } from "@/lib/supabase/admin";

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
    await requireAdmin();
  } catch {
    return { error: "No autorizado.", savedAt: null };
  }

  const origin = (await headers()).get("origin");
  const admin = createAdminClient();
  const { data, error } = await admin.auth.admin.inviteUserByEmail(email, {
    data: fullName ? { full_name: fullName } : undefined,
    redirectTo: `${origin}/auth/callback`,
  });
  if (error) {
    return { error: error.message, savedAt: null };
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
    await requireAdmin();
  } catch {
    return { error: "No autorizado." };
  }

  const admin = createAdminClient();
  const { error } = await admin.auth.admin.deleteUser(userId);
  if (error) return { error: error.message };

  revalidatePath(`/admin/clients/${clientId}`);
  return { error: null };
}
