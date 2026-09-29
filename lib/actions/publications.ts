"use server";

import { revalidatePath } from "next/cache";
import sharp from "sharp";
import { createClient } from "@/lib/supabase/server";
import { getCurrentProfile, getPublicationById, listPublicationsInRange } from "@/lib/supabase/queries";
import { mapPublicationAsset } from "@/lib/supabase/mappers";
import type { Publication, PublicationAsset } from "@/types";

const THUMBNAILS_BUCKET = "thumbnails";
const SIGNED_URL_TTL_SECONDS = 60 * 60;
const MAX_CAROUSEL_IMAGES = 10;

export interface PublicationFormState {
  error: string | null;
  savedAt: number | null;
  /** Solo poblado cuando se guardó un carrusel — permite al cliente reconciliar assetIds/URLs reales
   * (asignados por el server) sin volver a subir archivos ya guardados en el próximo save. */
  assets?: PublicationAsset[];
  /** Publicación completa recién guardada (INSERT o UPDATE), lista para usar sin depender de que
   * router.refresh() re-sincronice el estado local de PublicationScreen (ver CalendarScreen, modo global). */
  publication?: Publication;
}

interface DestinationInput {
  clientAccountId: string;
}

/** Un slot del carrusel, en el orden final deseado: o una imagen existente que se conserva/reordena,
 * o el índice del File nuevo (dentro de `carouselImages`) que hay que subir en esa posición. */
interface CarouselSlotInput {
  assetId?: string;
  fileIndex?: number;
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

  // Carrusel: se valida ANTES de escribir nada. Un input file vacío igual viaja como un File de size 0
  // (p. ej. si el <form> se reseteó tras un guardado fallido), así que se descartan; y si el manifest
  // referencia un archivo que no llegó, se corta acá en vez de dejar la publicación guardada a medias.
  const carouselManifestRaw = formData.get("carouselManifest");
  const manifest = parseJsonArray<CarouselSlotInput>(carouselManifestRaw);
  const newFiles = formData.getAll("carouselImages").filter((f): f is File => f instanceof File && f.size > 0);
  if (carouselManifestRaw !== null) {
    if (manifest.length > MAX_CAROUSEL_IMAGES) {
      return { error: `Un carrusel admite hasta ${MAX_CAROUSEL_IMAGES} imágenes.`, savedAt: null };
    }
    const missingFile = manifest.some((slot) => !slot.assetId && typeof slot.fileIndex === "number" && !newFiles[slot.fileIndex]);
    if (missingFile) {
      return { error: "No llegaron algunas imágenes nuevas del carrusel. Volvé a intentar el guardado.", savedAt: null };
    }
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

  let responseAssets: PublicationAsset[] | undefined;

  if (carouselManifestRaw !== null) {
    // Carrusel: el manifest describe el set final de imágenes, en orden. Cada slot es una imagen
    // existente que se conserva/reordena (assetId) o un File nuevo a subir en esa posición (fileIndex).
    // Cambio mínimo sobre el esquema actual: sigue siendo N filas en publication_assets, solo que ahora
    // puede haber más de una por publicación (la tabla ya lo soportaba, sort_order/is_primary incluidos).
    const { data: existingAssets, error: existingAssetsError } = await supabase
      .from("publication_assets")
      .select("id, thumbnail_url")
      .eq("publication_id", publicationId);
    if (existingAssetsError) return { error: existingAssetsError.message, savedAt: null };

    const existingIds = new Set((existingAssets ?? []).map((a) => a.id));
    const keptIds = new Set<string>();

    for (let index = 0; index < manifest.length; index++) {
      const slot = manifest[index];
      const isPrimary = index === 0;

      if (slot.assetId && existingIds.has(slot.assetId)) {
        keptIds.add(slot.assetId);
        const { error } = await supabase
          .from("publication_assets")
          .update({ sort_order: index, is_primary: isPrimary })
          .eq("id", slot.assetId);
        if (error) return { error: error.message, savedAt: null };
        continue;
      }

      const file = typeof slot.fileIndex === "number" ? newFiles[slot.fileIndex] : undefined;
      if (!file) continue;

      const buffer = Buffer.from(await file.arrayBuffer());
      const optimized = await sharp(buffer)
        .resize({ width: 1200, withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer();
      const assetId = crypto.randomUUID();
      const path = `${clientId}/${publicationId}/${assetId}-${Date.now()}.webp`;

      const { error: uploadError } = await supabase.storage
        .from("thumbnails")
        .upload(path, optimized, { contentType: "image/webp", upsert: true });
      if (uploadError) return { error: uploadError.message, savedAt: null };

      const { error: insertError } = await supabase.from("publication_assets").insert({
        id: assetId,
        publication_id: publicationId,
        type: "image",
        filename: file.name || "imagen.webp",
        thumbnail_url: path,
        sort_order: index,
        is_primary: isPrimary,
      });
      if (insertError) return { error: insertError.message, savedAt: null };
      keptIds.add(assetId);
    }

    // Imágenes que el usuario sacó del carrusel: se borran la fila y el archivo en Storage, para no
    // dejar ni referencias DB rotas ni objetos huérfanos en el bucket. Si falla el borrado en Storage,
    // se aborta ACÁ (antes de tocar la fila) para no dejar un archivo huérfano de forma silenciosa —
    // la fila sigue apuntando a un asset que sigue existiendo, así que no hay inconsistencia: el usuario
    // ve el error y puede reintentar el guardado.
    const removed = (existingAssets ?? []).filter((a) => !keptIds.has(a.id));
    if (removed.length > 0) {
      const removedPaths = removed.map((a) => a.thumbnail_url).filter((p): p is string => Boolean(p));
      if (removedPaths.length > 0) {
        const { error: removeStorageError } = await supabase.storage.from(THUMBNAILS_BUCKET).remove(removedPaths);
        if (removeStorageError) {
          return { error: `No se pudieron eliminar imágenes del almacenamiento: ${removeStorageError.message}`, savedAt: null };
        }
      }
      const { error: deleteAssetsError } = await supabase
        .from("publication_assets")
        .delete()
        .in("id", removed.map((a) => a.id));
      if (deleteAssetsError) return { error: deleteAssetsError.message, savedAt: null };
    }

    // El cliente necesita los assetId/URLs reales asignados acá para no volver a subir estas mismas
    // imágenes como "nuevas" en el próximo save (ver PublicationView).
    const { data: freshAssets, error: freshAssetsError } = await supabase
      .from("publication_assets")
      .select("*")
      .eq("publication_id", publicationId)
      .order("sort_order", { ascending: true });
    if (freshAssetsError) return { error: freshAssetsError.message, savedAt: null };

    const freshPaths = (freshAssets ?? []).map((a) => a.thumbnail_url).filter((p): p is string => Boolean(p));
    const urlByPath = new Map<string, string>();
    if (freshPaths.length > 0) {
      const { data: signed } = await supabase.storage
        .from(THUMBNAILS_BUCKET)
        .createSignedUrls(freshPaths, SIGNED_URL_TTL_SECONDS);
      for (const item of signed ?? []) {
        if (item.path && item.signedUrl) urlByPath.set(item.path, item.signedUrl);
      }
    }
    responseAssets = (freshAssets ?? []).map((row) => {
      const mapped = mapPublicationAsset(row);
      return { ...mapped, thumbnailUrl: mapped.thumbnailUrl ? (urlByPath.get(mapped.thumbnailUrl) ?? null) : null };
    });
  } else if (thumbnail instanceof File && thumbnail.size > 0) {
    // Portada única (Post/Reel/Story/etc.): se optimiza y sube al bucket privado de Supabase. Sin
    // cambios respecto al comportamiento actual.
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
  // Reutiliza getPublicationById tal cual (misma query que ya usa /p/[id], ya scopeada por RLS y con
  // thumbnails firmados) — evita reconstruir a mano el Publication completo (destinos + assets) acá.
  const publication = await getPublicationById(publicationId);
  return { error: null, savedAt: Date.now(), assets: responseAssets, publication: publication ?? undefined };
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

/**
 * Elimina la publicación y, después, sus archivos propios en Storage (bucket thumbnails).
 *
 * Alcance del borrado de archivos, estrictamente acotado a esta publicación:
 * - candidatos = paths de sus publication_assets + lo que haya en su carpeta `{client_id}/{publication_id}/`
 *   (cubre portadas reemplazadas que quedaron huérfanas en guardados anteriores);
 * - solo se aceptan paths cuya segunda carpeta es EXACTAMENTE este publication_id;
 * - se excluye cualquier path que otra publicación siga referenciando.
 *
 * Orden: primero la fila (publication_assets cae por ON DELETE CASCADE) y recién si se confirmó el borrado
 * (RLS puede bloquearlo con 0 filas y sin error) se tocan los archivos — nunca se borran archivos de una
 * publicación que sigue existiendo. Si Storage falla, la publicación ya no existe: se devuelve
 * `storageError` para que la UI lo muestre (no se oculta), sin revertir ni marcar el borrado como fallido.
 */
export async function deletePublication(
  publicationId: string,
  clientId: string
): Promise<{ error: string | null; storageError?: string }> {
  const supabase = await createClient();

  const { data: pubRow, error: readError } = await supabase
    .from("publications")
    .select("client_id")
    .eq("id", publicationId)
    .maybeSingle();
  if (readError) return { error: readError.message };
  if (!pubRow) return { error: "No se pudo eliminar: publicación no encontrada o sin permisos." };

  const { data: assetRows, error: assetsError } = await supabase
    .from("publication_assets")
    .select("thumbnail_url")
    .eq("publication_id", publicationId);
  if (assetsError) return { error: assetsError.message };

  const candidatePaths = new Set<string>();
  for (const asset of assetRows ?? []) {
    if (asset.thumbnail_url) candidatePaths.add(asset.thumbnail_url);
  }
  const folder = `${pubRow.client_id}/${publicationId}`;
  const { data: folderFiles, error: listError } = await supabase.storage.from(THUMBNAILS_BUCKET).list(folder, { limit: 1000 });
  for (const file of folderFiles ?? []) {
    // Las subcarpetas vienen sin id; acá solo interesan objetos.
    if (file.id) candidatePaths.add(`${folder}/${file.name}`);
  }
  const ownPaths = [...candidatePaths].filter((path) => path.split("/")[1] === publicationId);

  let sharedPaths = new Set<string>();
  let sharedCheckFailed = false;
  if (ownPaths.length > 0) {
    const { data: sharedRows, error: sharedError } = await supabase
      .from("publication_assets")
      .select("thumbnail_url")
      .in("thumbnail_url", ownPaths)
      .neq("publication_id", publicationId);
    // Sin poder confirmar que no están compartidos, no se borra ningún archivo (se informa abajo).
    if (sharedError) sharedCheckFailed = true;
    else sharedPaths = new Set((sharedRows ?? []).map((r) => r.thumbnail_url).filter((p): p is string => Boolean(p)));
  }
  const pathsToRemove = sharedCheckFailed ? [] : ownPaths.filter((path) => !sharedPaths.has(path));

  const { data: deleted, error } = await supabase.from("publications").delete().eq("id", publicationId).select("id");
  if (error) return { error: error.message };
  if (!deleted || deleted.length === 0) {
    return { error: "No se pudo eliminar: publicación no encontrada o sin permisos." };
  }

  let storageError: string | undefined;
  if (listError) storageError = `No se pudieron listar los archivos de la publicación: ${listError.message}`;
  else if (sharedCheckFailed) {
    storageError = "No se pudo verificar si los archivos estaban compartidos; se conservaron en el almacenamiento.";
  }
  if (pathsToRemove.length > 0) {
    const { error: removeError } = await supabase.storage.from(THUMBNAILS_BUCKET).remove(pathsToRemove);
    if (removeError) storageError = `No se pudieron eliminar los archivos del almacenamiento: ${removeError.message}`;
  }

  revalidatePath(`/admin/clients/${clientId}/planner`);
  revalidatePath(`/admin/clients/${clientId}`);
  revalidatePath("/admin/calendars");
  revalidatePath("/admin/publications");
  return { error: null, storageError };
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
  // Solo staff: una Server Action es invocable directo desde el navegador, y RLS acota filas pero no
  // columnas — sin este gate un Client User podría leer sus publicaciones con internalNotes incluidas.
  const profile = await getCurrentProfile();
  if (profile?.role !== "super_admin" && profile?.role !== "account_manager") return { publications: [] };
  const publications = await listPublicationsInRange(from, to);
  return { publications };
}
