"use server";

import { createClient } from "@/lib/supabase/server";
import type { PublicationActivity, PublicationActivityChanges } from "@/types";

/**
 * Actividad de una publicación (20261126000003_publication_activity). Solo lectura: los eventos los registran
 * triggers de la base con el usuario de la sesión; no hay forma de escribirlos desde la app. La RLS decide qué ve
 * cada usuario (misma regla que comentarios). Sin la migración aplicada: `unavailable` (la cronología muestra solo
 * comentarios, sin error).
 */

interface ActivityRow {
  id: string;
  publication_id: string;
  actor_id: string | null;
  actor_name: string;
  actor_avatar_url: string | null;
  actor_role: string | null;
  changes: PublicationActivityChanges | null;
  created_at: string;
  updated_at: string;
}

interface ActivityQuery extends PromiseLike<{ data: ActivityRow[] | null; error: { code?: string; message: string } | null }> {
  eq(column: string, value: string): ActivityQuery;
  order(column: string, opts: { ascending: boolean }): ActivityQuery;
  limit(count: number): ActivityQuery;
}

interface ActivityClient {
  from(table: "publication_activity"): { select(columns: string): ActivityQuery };
}

const COLUMNS = "id, publication_id, actor_id, actor_name, actor_avatar_url, actor_role, changes, created_at, updated_at";
const MAX_EVENTS = 200;

function mapActivity(row: ActivityRow): PublicationActivity {
  return {
    id: row.id,
    publicationId: row.publication_id,
    actorId: row.actor_id,
    actorName: row.actor_name,
    actorAvatarUrl: row.actor_avatar_url,
    actorRole: row.actor_role,
    changes: row.changes ?? {},
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function isMissingObject(code: string | undefined): boolean {
  return code === "42P01" || code === "PGRST205" || code === "42703" || code === "PGRST204";
}

export async function listPublicationActivity(
  publicationId: string
): Promise<{ activity: PublicationActivity[]; error: string | null; unavailable: boolean }> {
  const supabase = (await createClient()) as unknown as ActivityClient;
  const { data, error } = await supabase
    .from("publication_activity")
    .select(COLUMNS)
    .eq("publication_id", publicationId)
    .order("created_at", { ascending: false })
    .limit(MAX_EVENTS);
  if (error) {
    if (isMissingObject(error.code)) return { activity: [], error: null, unavailable: true };
    return { activity: [], error: "No se pudo cargar la actividad.", unavailable: false };
  }
  return { activity: (data ?? []).map(mapActivity), error: null, unavailable: false };
}

export async function getPublicationActivity(activityId: string): Promise<PublicationActivity | null> {
  const supabase = (await createClient()) as unknown as ActivityClient;
  const { data } = await supabase.from("publication_activity").select(COLUMNS).eq("id", activityId).limit(1);
  return data?.[0] ? mapActivity(data[0]) : null;
}
