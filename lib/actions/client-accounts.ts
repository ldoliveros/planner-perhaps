"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface ClientAccountFormState {
  error: string | null;
  savedAt: number | null;
}

export async function saveClientAccount(
  _prevState: ClientAccountFormState,
  formData: FormData
): Promise<ClientAccountFormState> {
  const id = formData.get("id") ? String(formData.get("id")) : null;
  const clientId = String(formData.get("clientId") ?? "");
  const platformId = String(formData.get("platformId") ?? "");
  const name = String(formData.get("name") ?? "").trim();
  const handle = String(formData.get("handle") ?? "").trim() || null;
  const url = String(formData.get("url") ?? "").trim() || null;
  const accountTypeIdRaw = String(formData.get("accountTypeId") ?? "").trim();
  const accountTypeId = accountTypeIdRaw && accountTypeIdRaw !== "__none__" ? accountTypeIdRaw : null;
  const active = formData.get("active") === "on";

  if (!clientId || !platformId || !name) {
    return { error: "Completá plataforma y nombre.", savedAt: null };
  }

  const supabase = await createClient();
  const payload = {
    client_id: clientId,
    platform_id: platformId,
    name,
    handle,
    url,
    account_type_id: accountTypeId,
    active,
  };

  const { error } = id
    ? await supabase.from("client_accounts").update(payload).eq("id", id)
    : await supabase.from("client_accounts").insert(payload);
  if (error) return { error: error.message, savedAt: null };

  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath(`/admin/clients/${clientId}/planner`);
  return { error: null, savedAt: Date.now() };
}

export async function setClientAccountActive(
  accountId: string,
  clientId: string,
  active: boolean
): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("client_accounts").update({ active }).eq("id", accountId);
  if (error) return { error: error.message };

  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath(`/admin/clients/${clientId}/planner`);
  return { error: null };
}
