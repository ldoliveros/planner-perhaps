import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient } from "./server";
import type { Database } from "./database.types";

/**
 * Cliente con la service_role key: bypassea RLS por completo. Solo para usar
 * server-side en acciones puntuales que lo requieran explícitamente (Admin
 * API de Supabase Auth) — nunca para queries de datos normales.
 */
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

/**
 * Verifica que la sesión actual sea de un admin. Server Functions no heredan
 * protección de proxy.ts automáticamente (ver docs de Next.js sobre Proxy) —
 * cualquier acción que use createAdminClient() debe llamar esto primero.
 */
export async function requireAdmin(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado.");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "admin") throw new Error("No autorizado.");
}
