"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

export interface ClientFormState {
  error: string | null;
  savedAt: number | null;
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-+|-+$)/g, "");
}

export async function saveClient(_prevState: ClientFormState, formData: FormData): Promise<ClientFormState> {
  const id = formData.get("id") ? String(formData.get("id")) : null;
  const name = String(formData.get("name") ?? "").trim();
  const color = String(formData.get("color") ?? "#16A34A").trim() || "#16A34A";
  const active = formData.get("active") === "on";
  const driveFolderUrl = String(formData.get("driveFolderUrl") ?? "").trim() || null;

  if (!name) {
    return { error: "El nombre es obligatorio.", savedAt: null };
  }

  const supabase = await createClient();

  if (id) {
    const { error } = await supabase
      .from("clients")
      .update({ name, color, active, drive_folder_url: driveFolderUrl })
      .eq("id", id);
    if (error) return { error: error.message, savedAt: null };
  } else {
    const slug = slugify(name);
    const { error } = await supabase.from("clients").insert({
      name,
      slug,
      color,
      active,
      drive_folder_url: driveFolderUrl,
    });
    if (error) return { error: error.message, savedAt: null };
  }

  revalidatePath("/admin/clients");
  revalidatePath("/admin/calendars");
  return { error: null, savedAt: Date.now() };
}
