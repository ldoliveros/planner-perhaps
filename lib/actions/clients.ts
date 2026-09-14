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
