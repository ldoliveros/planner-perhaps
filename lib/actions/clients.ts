"use server";

import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { slugify } from "@/lib/slugify";

export interface ClientFormState {
  error: string | null;
  savedAt: number | null;
}

export async function saveClient(_prevState: ClientFormState, formData: FormData): Promise<ClientFormState> {
  const id = formData.get("id") ? String(formData.get("id")) : null;
  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? "#16A34A").trim() || "#16A34A";
  const active = formData.get("active") === "on";
  const driveFolderUrl = String(formData.get("driveFolderUrl") ?? "").trim() || null;
  const logo = formData.get("logo");

  if (!name) {
    return { error: "El nombre es obligatorio.", savedAt: null };
  }

  const supabase = await createClient();
  let clientId = id;

  if (clientId) {
    const { error } = await supabase
      .from("clients")
      .update({ name, color, active, drive_folder_url: driveFolderUrl })
      .eq("id", clientId);
    if (error) return { error: error.message, savedAt: null };
  } else {
    const slug = slugify(name);
    const { data, error } = await supabase
      .from("clients")
      .insert({ name, slug, color, active, drive_folder_url: driveFolderUrl })
      .select("id")
      .single();
    if (error) return { error: error.message, savedAt: null };
    clientId = data.id;
  }

  if (logo instanceof File && logo.size > 0) {
    const buffer = Buffer.from(await logo.arrayBuffer());
    const optimized = await sharp(buffer)
      .resize({ width: 400, height: 400, fit: "inside", withoutEnlargement: true })
      .webp({ quality: 90 })
      .toBuffer();
    const path = `${clientId}/logo-${Date.now()}.webp`;

    const { error: uploadError } = await supabase.storage
      .from("client-logos")
      .upload(path, optimized, { contentType: "image/webp", upsert: true });
    if (uploadError) return { error: uploadError.message, savedAt: null };

    const { error: logoUpdateError } = await supabase.from("clients").update({ logo_url: path }).eq("id", clientId);
    if (logoUpdateError) return { error: logoUpdateError.message, savedAt: null };
  }

  revalidatePath("/admin/clients");
  revalidatePath("/admin/calendars");
  return { error: null, savedAt: Date.now() };
}

export async function setClientActive(clientId: string, active: boolean): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("clients").update({ active }).eq("id", clientId);
  if (error) return { error: error.message };

  revalidatePath("/admin/clients");
  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath("/admin/calendars");
  return { error: null };
}

/**
 * Solo permite eliminar clientes ya archivados y sin historial (calendarios o
 * usuarios asociados). Nunca cascadea sobre contenido editorial: si tiene
 * calendarios, por transitividad puede tener publicaciones, así que se
 * bloquea ahí mismo en vez de dejar que el ON DELETE CASCADE de la FK borre
 * historial en silencio.
 */
export async function deleteClient(clientId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { data: client, error: clientError } = await supabase
    .from("clients")
    .select("active")
    .eq("id", clientId)
    .maybeSingle();
  if (clientError) return { error: clientError.message };
  if (!client) return { error: "El cliente no existe." };
  if (client.active) return { error: "Solo se pueden eliminar clientes archivados." };

  const { count: calendarCount, error: calendarsError } = await supabase
    .from("calendars")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId);
  if (calendarsError) return { error: calendarsError.message };
  if ((calendarCount ?? 0) > 0) {
    return {
      error: `Este cliente tiene ${calendarCount} calendario${calendarCount === 1 ? "" : "s"} con historial y no puede eliminarse definitivamente. Mantenelo archivado para conservarlo.`,
    };
  }

  const { count: usersCount, error: usersError } = await supabase
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId);
  if (usersError) return { error: usersError.message };
  if ((usersCount ?? 0) > 0) {
    return {
      error: `Este cliente tiene ${usersCount} usuario${usersCount === 1 ? "" : "s"} de cliente asociado${usersCount === 1 ? "" : "s"} y no puede eliminarse.`,
    };
  }

  const { error } = await supabase.from("clients").delete().eq("id", clientId);
  if (error) return { error: error.message };

  revalidatePath("/admin/clients");
  return { error: null };
}
