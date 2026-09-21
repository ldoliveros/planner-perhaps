"use server";

import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";

export interface ProfileFormState {
  error: string | null;
  savedAt: number | null;
}

/**
 * Edición del propio perfil (cualquier rol autenticado). Usa el cliente
 * normal (RLS), nunca service_role: la policy profiles_update_own + el
 * trigger protect_profiles (que congela role/client_id/email en updates
 * hechos como "authenticated") son la barrera real, no esta función.
 */
export async function updateOwnProfile(
  _prevState: ProfileFormState,
  formData: FormData
): Promise<ProfileFormState> {
  const fullName = String(formData.get("fullName") ?? "").trim() || null;
  const avatar = formData.get("avatar");

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado.", savedAt: null };

  const payload: { full_name: string | null; avatar_url?: string } = { full_name: fullName };

  if (avatar instanceof File && avatar.size > 0) {
    const buffer = Buffer.from(await avatar.arrayBuffer());
    const optimized = await sharp(buffer)
      .resize({ width: 256, height: 256, fit: "cover" })
      .webp({ quality: 85 })
      .toBuffer();
    const path = `${user.id}/avatar-${Date.now()}.webp`;

    // upsert: false — el path ya es único (timestamp) y el upsert exige un SELECT sobre storage.objects
    // que la policy avatars_select (eliminada en 20260916000002) ya no concede.
    const { error: uploadError } = await supabase.storage
      .from("avatars")
      .upload(path, optimized, { contentType: "image/webp", upsert: false });
    if (uploadError) return { error: uploadError.message, savedAt: null };

    payload.avatar_url = supabase.storage.from("avatars").getPublicUrl(path).data.publicUrl;
  }

  const { error } = await supabase.from("profiles").update(payload).eq("id", user.id);
  if (error) return { error: error.message, savedAt: null };

  revalidatePath("/admin", "layout");
  revalidatePath("/client", "layout");
  return { error: null, savedAt: Date.now() };
}
