import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "./database.types";
import type { Client, Publication } from "@/types";

const THUMBNAILS_BUCKET = "thumbnails";
const CLIENT_LOGOS_BUCKET = "client-logos";
const SIGNED_URL_TTL_SECONDS = 60 * 60;

/**
 * publication_assets.thumbnail_url guarda el PATH dentro del bucket privado
 * (ej: "{client_id}/{publication_id}/cover-123.webp"), no una URL pública.
 * Esto resuelve todos los paths de una tanda de publicaciones a signed URLs
 * de una sola vez, respetando las policies de Storage (RLS) del usuario actual.
 */
export async function withSignedThumbnails(
  supabase: SupabaseClient<Database>,
  publications: Publication[]
): Promise<Publication[]> {
  const paths = new Set<string>();
  for (const pub of publications) {
    for (const asset of pub.assets) {
      if (asset.thumbnailUrl) paths.add(asset.thumbnailUrl);
    }
  }
  if (paths.size === 0) return publications;

  const { data } = await supabase.storage
    .from(THUMBNAILS_BUCKET)
    .createSignedUrls(Array.from(paths), SIGNED_URL_TTL_SECONDS);

  const urlByPath = new Map<string, string>();
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) urlByPath.set(item.path, item.signedUrl);
  }

  return publications.map((pub) => ({
    ...pub,
    assets: pub.assets.map((asset) => ({
      ...asset,
      thumbnailUrl: asset.thumbnailUrl ? (urlByPath.get(asset.thumbnailUrl) ?? null) : null,
    })),
  }));
}

/**
 * clients.logo_url guarda el PATH dentro del bucket privado "client-logos"
 * (ej: "{client_id}/logo-123.webp"), no una URL pública. Mismo patrón que
 * withSignedThumbnails.
 */
export async function withSignedClientLogos(
  supabase: SupabaseClient<Database>,
  clients: Client[]
): Promise<Client[]> {
  const paths = clients.map((c) => c.logoUrl).filter((p): p is string => Boolean(p));
  if (paths.length === 0) return clients;

  const { data } = await supabase.storage.from(CLIENT_LOGOS_BUCKET).createSignedUrls(paths, SIGNED_URL_TTL_SECONDS);

  const urlByPath = new Map<string, string>();
  for (const item of data ?? []) {
    if (item.path && item.signedUrl) urlByPath.set(item.path, item.signedUrl);
  }

  return clients.map((c) => ({
    ...c,
    logoUrl: c.logoUrl ? (urlByPath.get(c.logoUrl) ?? null) : null,
  }));
}
