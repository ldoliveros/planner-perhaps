"use server";

import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import type { AssetType } from "@/types";

export interface PublicationFormState {
  error: string | null;
  savedAt: number | null;
}

interface DestinationInput {
  clientAccountId: string;
}

interface ManualAssetInput {
  id?: string;
  type: AssetType;
  filename: string;
  driveFileUrl: string | null;
}

function parseJsonArray<T>(raw: FormDataEntryValue | null): T[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(String(raw));
    return Array.isArray(parsed) ? (parsed as T[]) : [];
  } catch {
    return [];
  }
}

export async function savePublication(
  _prevState: PublicationFormState,
  formData: FormData
): Promise<PublicationFormState> {
  const id = formData.get("id") ? String(formData.get("id")) : null;
  const calendarId = String(formData.get("calendarId") ?? "");
  const title = String(formData.get("title") ?? "").trim();
  const campaign = String(formData.get("campaign") ?? "").trim() || null;
  const contentTypeId = String(formData.get("contentTypeId") ?? "");
  const publicationDate = String(formData.get("publicationDate") ?? "");
  const publicationTime = String(formData.get("publicationTime") ?? "").trim() || null;
  const copy = String(formData.get("copy") ?? "");
  const cta = String(formData.get("cta") ?? "").trim() || null;
  const externalUrl = String(formData.get("externalUrl") ?? "").trim() || null;
  const internalNotes = String(formData.get("internalNotes") ?? "").trim() || null;
  const statusId = String(formData.get("statusId") ?? "");
  const driveFolderUrl = String(formData.get("driveFolderUrl") ?? "").trim() || null;
  const destinations = parseJsonArray<DestinationInput>(formData.get("destinations"));
  const manualAssets = parseJsonArray<ManualAssetInput>(formData.get("manualAssets"));
  const removedAssetIds = parseJsonArray<string>(formData.get("removedAssetIds"));
  const thumbnail = formData.get("thumbnail");

  if (!calendarId || !title || !contentTypeId || !publicationDate || !statusId) {
    return { error: "Completá título, fecha, tipo de contenido y estado.", savedAt: null };
  }
  if (destinations.length === 0) {
    return { error: "Elegí al menos un canal de destino.", savedAt: null };
  }

  const supabase = await createClient();
  const publicationPayload = {
    calendar_id: calendarId,
    title,
    campaign,
    content_type_id: contentTypeId,
    publication_date: publicationDate,
    publication_time: publicationTime,
    copy,
    cta,
    external_url: externalUrl,
    internal_notes: internalNotes,
    status_id: statusId,
    drive_folder_url: driveFolderUrl,
  };

  let publicationId = id;

  if (publicationId) {
    const { error } = await supabase.from("publications").update(publicationPayload).eq("id", publicationId);
    if (error) return { error: error.message, savedAt: null };
  } else {
    const { data, error } = await supabase
      .from("publications")
      .insert(publicationPayload)
      .select("id")
      .single();
    if (error) return { error: error.message, savedAt: null };
    publicationId = data.id;
  }

  const { data: pubRow, error: pubReadError } = await supabase
    .from("publications")
    .select("client_id")
    .eq("id", publicationId)
    .single();
  if (pubReadError || !pubRow) {
    return { error: pubReadError?.message ?? "No se pudo leer la publicación.", savedAt: null };
  }
  const clientId = pubRow.client_id;

  // Destinos: reemplazo completo. Simple y correcto para un conjunto chico por publicación.
  const { error: deleteDestError } = await supabase
    .from("publication_destinations")
    .delete()
    .eq("publication_id", publicationId);
  if (deleteDestError) return { error: deleteDestError.message, savedAt: null };

  const { error: insertDestError } = await supabase.from("publication_destinations").insert(
    destinations.map((d) => ({
      publication_id: publicationId as string,
      client_account_id: d.clientAccountId,
    }))
  );
  if (insertDestError) return { error: insertDestError.message, savedAt: null };

  // Assets eliminados por el usuario en el form.
  if (removedAssetIds.length > 0) {
    await supabase.from("publication_assets").delete().in("id", removedAssetIds);
  }

  // Assets manuales (metadata + URL de Drive manual, sin archivo real todavía).
  for (const asset of manualAssets) {
    if (asset.id) {
      await supabase
        .from("publication_assets")
        .update({ type: asset.type, filename: asset.filename, drive_file_url: asset.driveFileUrl })
        .eq("id", asset.id);
    } else {
      await supabase.from("publication_assets").insert({
        publication_id: publicationId,
        type: asset.type,
        filename: asset.filename,
        drive_file_url: asset.driveFileUrl,
      });
    }
  }

  // Portada / thumbnail: se optimiza y sube al bucket privado de Supabase.
  if (thumbnail instanceof File && thumbnail.size > 0) {
    const buffer = Buffer.from(await thumbnail.arrayBuffer());
    const optimized = await sharp(buffer)
      .resize({ width: 1200, withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer();
    const path = `${clientId}/${publicationId}/cover-${Date.now()}.webp`;

    const { error: uploadError } = await supabase.storage
      .from("thumbnails")
      .upload(path, optimized, { contentType: "image/webp", upsert: true });
    if (uploadError) return { error: uploadError.message, savedAt: null };

    const { data: existingPrimary } = await supabase
      .from("publication_assets")
      .select("id")
      .eq("publication_id", publicationId)
      .eq("is_primary", true)
      .maybeSingle();

    if (existingPrimary) {
      await supabase.from("publication_assets").update({ thumbnail_url: path }).eq("id", existingPrimary.id);
    } else {
      await supabase.from("publication_assets").insert({
        publication_id: publicationId,
        type: "image",
        filename: thumbnail.name || "portada.webp",
        thumbnail_url: path,
        is_primary: true,
      });
    }
  }

  revalidatePath(`/admin/clients/${clientId}/planner`);
  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath("/admin/calendars");
  return { error: null, savedAt: Date.now() };
}

export async function deletePublication(publicationId: string, clientId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("publications").delete().eq("id", publicationId);
  if (error) return { error: error.message };

  revalidatePath(`/admin/clients/${clientId}/planner`);
  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath("/admin/calendars");
  return { error: null };
}
