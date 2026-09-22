"use server";

import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { listPublicationsInRange } from "@/lib/supabase/queries";
import type { Publication } from "@/types";

export interface PublicationFormState {
  error: string | null;
  savedAt: number | null;
}

interface DestinationInput {
  clientAccountId: string;
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
  const campaignId = String(formData.get("campaignId") ?? "").trim() || null;
  const contentTypeId = String(formData.get("contentTypeId") ?? "");
  const publicationDate = String(formData.get("publicationDate") ?? "");
  const publicationTime = String(formData.get("publicationTime") ?? "").trim() || null;
  const copy = String(formData.get("copy") ?? "");
  const cta = String(formData.get("cta") ?? "").trim() || null;
  const externalUrl = String(formData.get("externalUrl") ?? "").trim() || null;
  // internal_notes ya no se edita desde este formulario (ver v1.2 — ajuste
  // previo al Bloque C). Si el campo no viene en el formData en absoluto, NO
  // se incluye en el payload — así nunca se pisa con null un valor histórico
  // ya guardado. Solo se tocaría si en el futuro algún formulario SÍ lo envía.
  const internalNotesRaw = formData.get("internalNotes");
  const internalNotes = internalNotesRaw === null ? undefined : String(internalNotesRaw).trim() || null;
  const statusId = String(formData.get("statusId") ?? "");
  const driveFolderUrl = String(formData.get("driveFolderUrl") ?? "").trim() || null;
  const destinations = parseJsonArray<DestinationInput>(formData.get("destinations"));
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
    campaign_id: campaignId,
    content_type_id: contentTypeId,
    publication_date: publicationDate,
    publication_time: publicationTime,
    copy,
    cta,
    external_url: externalUrl,
    status_id: statusId,
    drive_folder_url: driveFolderUrl,
    ...(internalNotes !== undefined ? { internal_notes: internalNotes } : {}),
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
  revalidatePath("/admin/publications");
  return { error: null, savedAt: Date.now() };
}

/**
 * Actualiza ÚNICAMENTE el estado de una publicación (Bloque C — acciones
 * rápidas desde las cards). No toca ningún otro campo. El permiso real lo
 * sigue resolviendo RLS (publications_manage / can_manage_client) a través
 * del cliente autenticado — igual que savePublication/deletePublication, acá
 * no se reimplementa ni se relaja esa verificación. Si RLS bloquea el
 * update (ej. Client User intentando esto), el .select() posterior a la
 * escritura viene vacío y se lo tratamos como error explícito en vez de un
 * éxito silencioso que no cambió nada.
 */
export async function setPublicationStatus(
  publicationId: string,
  statusId: string
): Promise<{ error: string | null }> {
  const supabase = await createClient();

  const { data: validStatus } = await supabase.from("statuses").select("id").eq("id", statusId).maybeSingle();
  if (!validStatus) {
    return { error: "Estado inválido." };
  }

  const { data: updated, error } = await supabase
    .from("publications")
    .update({ status_id: statusId })
    .eq("id", publicationId)
    .select("id, client_id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!updated) return { error: "No se pudo actualizar el estado: publicación no encontrada o sin permisos." };

  revalidatePath(`/admin/clients/${updated.client_id}/planner`);
  revalidatePath(`/admin/clients/${updated.client_id}`);
  revalidatePath("/admin/calendars");
  revalidatePath("/admin/publications");
  return { error: null };
}

/**
 * Mueve una publicación a otro día (Bloque D — Drag & Drop en Semana).
 * Actualiza ÚNICAMENTE `publication_date`: hora, calendario, campaña, estado,
 * destinos y demás campos quedan intactos. Mismo criterio de permisos que
 * setPublicationStatus: lo resuelve RLS vía el cliente autenticado y un update
 * bloqueado (0 filas) se devuelve como error explícito.
 */
export async function movePublicationToDate(
  publicationId: string,
  newDate: string
): Promise<{ error: string | null }> {
  const parsed = /^\d{4}-\d{2}-\d{2}$/.test(newDate) ? new Date(`${newDate}T00:00:00Z`) : null;
  if (!parsed || Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== newDate) {
    return { error: "Fecha inválida." };
  }

  const supabase = await createClient();
  const { data: updated, error } = await supabase
    .from("publications")
    .update({ publication_date: newDate })
    .eq("id", publicationId)
    .select("id, client_id")
    .maybeSingle();

  if (error) return { error: error.message };
  if (!updated) return { error: "No se pudo mover la publicación: no encontrada o sin permisos." };

  revalidatePath(`/admin/clients/${updated.client_id}/planner`);
  revalidatePath(`/admin/clients/${updated.client_id}`);
  revalidatePath("/admin/calendars");
  revalidatePath("/admin/publications");
  return { error: null };
}

export async function deletePublication(publicationId: string, clientId: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const { error } = await supabase.from("publications").delete().eq("id", publicationId);
  if (error) return { error: error.message };

  revalidatePath(`/admin/clients/${clientId}/planner`);
  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath("/admin/calendars");
  revalidatePath("/admin/publications");
  return { error: null };
}

/**
 * Trae publicaciones de un rango de fechas para Publicaciones (calendario global). La llama CalendarScreen en
 * modo "global" cuando el usuario navega a un período fuera del rango ya cargado, o amplía Desde/Hasta en
 * Lista más allá de lo que ya tiene — nunca al solo cambiar de vista (Semana/Mes/Lista) dentro de lo ya
 * cargado, eso sigue siendo 100% local. No es una mutación: es una lectura acotada por fecha, expuesta como
 * Server Action (en vez de un Route Handler) para reusar el mismo mecanismo de serialización y RLS que el
 * resto de las acciones del proyecto.
 */
export async function fetchPublicationsInRange(from: string, to: string): Promise<{ publications: Publication[] }> {
  const publications = await listPublicationsInRange(from, to);
  return { publications };
}
