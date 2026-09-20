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
  // El handle se guarda SIN "@" (es presentación): se recorta y se quita el "@" inicial que el usuario pueda haber escrito.
  const handle = String(formData.get("handle") ?? "").trim().replace(/^@+/, "");
  const name = String(formData.get("name") ?? "").trim() || null;
  const url = String(formData.get("url") ?? "").trim() || null;
  const accountTypeIdRaw = String(formData.get("accountTypeId") ?? "").trim();
  const accountTypeId = accountTypeIdRaw && accountTypeIdRaw !== "__none__" ? accountTypeIdRaw : null;
  const active = formData.get("active") === "on";

  if (!clientId || !platformId) {
    return { error: "Elegí una plataforma.", savedAt: null };
  }
  if (!handle) {
    return { error: "Ingresá el handle de la cuenta.", savedAt: null };
  }
  if (/\s/.test(handle)) {
    return { error: "El handle no puede contener espacios.", savedAt: null };
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
  if (error) {
    // La DB es la última barrera: unicidad (cliente, plataforma, handle sin distinguir mayúsculas) y formato.
    if (error.code === "23505") {
      return { error: "Ya existe una cuenta con ese handle para este cliente y plataforma.", savedAt: null };
    }
    if (error.code === "23514") {
      return { error: "Handle inválido: no puede estar vacío, empezar con @ ni contener espacios.", savedAt: null };
    }
    return { error: error.message, savedAt: null };
  }

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

/**
 * Solo permite eliminar cuentas/canales que nunca fueron usados en una
 * publicación. Si tienen destinos históricos, se bloquea acá mismo en vez de
 * dejar que el ON DELETE CASCADE de publication_destinations borre en
 * silencio a qué canal se publicó cada contenido pasado.
 */
export async function deleteClientAccount(accountId: string, clientId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { count, error: countError } = await supabase
    .from("publication_destinations")
    .select("id", { count: "exact", head: true })
    .eq("client_account_id", accountId);
  if (countError) return { error: countError.message };
  if ((count ?? 0) > 0) {
    return {
      error: "Esta cuenta fue utilizada en publicaciones y no puede eliminarse. Podés desactivarla para conservar el historial.",
    };
  }

  const { error } = await supabase.from("client_accounts").delete().eq("id", accountId);
  if (error) return { error: error.message };

  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath(`/admin/clients/${clientId}/planner`);
  return { error: null };
}
