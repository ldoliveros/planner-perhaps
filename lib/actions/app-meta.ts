"use server";

import { createClient } from "@/lib/supabase/server";

/**
 * v1.2 Bloque A — marca que el usuario actual ya vio el banner de novedades
 * de `version`. Escritura sobre su propia fila (profiles_update_own ya lo
 * permite; protect_profiles solo congela role/client_id/email, no esta
 * columna). Requiere que exista profiles.last_seen_version — ver
 * supabase/migrations/20260917000001_last_seen_version.sql.
 */
export async function markVersionSeen(version: string): Promise<{ error: string | null }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "No autenticado." };

  const { error } = await supabase.from("profiles").update({ last_seen_version: version }).eq("id", user.id);
  if (error) return { error: error.message };
  return { error: null };
}
