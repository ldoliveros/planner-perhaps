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
 * Verifica que la sesión actual sea de un Super Admin. Server Functions no
 * heredan protección de proxy.ts automáticamente (ver docs de Next.js sobre
 * Proxy) — cualquier acción que use createAdminClient() debe llamar esto
 * primero. Reservado a Super Admin: toda operación que use la service_role
 * (Auth Admin API) es un bypass total de RLS, así que la única barrera real
 * es este chequeo — nunca delegar en Account Manager sin volver a evaluar
 * el riesgo puntualmente.
 */
export async function requireSuperAdmin(): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("No autenticado.");

  const { data: profile } = await supabase.from("profiles").select("role").eq("id", user.id).maybeSingle();
  if (profile?.role !== "super_admin") throw new Error("No autorizado.");
}

/**
 * Cuántos Super Admin (fila en `profiles`) existen además de `excludeUserId`.
 * Refleja exactamente la misma condición que bloquea el trigger
 * `protect_profiles` en DB (degradar/eliminar) — se usa acá para devolver un
 * error legible desde la Server Action en vez de dejar que reviente el
 * trigger con un mensaje de Postgres crudo.
 */
export async function countOtherSuperAdmins(excludeUserId: string): Promise<number> {
  const admin = createAdminClient();
  const { count } = await admin
    .from("profiles")
    .select("id", { count: "exact", head: true })
    .eq("role", "super_admin")
    .neq("id", excludeUserId);
  return count ?? 0;
}

/**
 * Cuántos Super Admin además de `excludeUserId` están activos (no baneados)
 * en Auth ahora mismo. banned_until vive en auth.users, así que a diferencia
 * de countOtherSuperAdmins esto sí necesita la Auth Admin API — se acota con
 * timeout (mismo patrón que listTeamMembers) y, si no responde a tiempo,
 * cuenta a todos como activos (fail-open: no bloquear una operación válida
 * por una lentitud puntual de la API, en vez de arriesgar dejar el sistema
 * sin Super Admin activo esto solo relaja el caso raro doble-coincidencia).
 */
export async function countOtherActiveSuperAdmins(excludeUserId: string): Promise<number> {
  const admin = createAdminClient();
  const { data: superAdmins } = await admin
    .from("profiles")
    .select("id")
    .eq("role", "super_admin")
    .neq("id", excludeUserId);
  const ids = (superAdmins ?? []).map((p) => p.id);
  if (ids.length === 0) return 0;

  const authUsers = await Promise.race([
    admin.auth.admin.listUsers({ perPage: 200 }).then((res) => res.data.users),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 5000)),
  ]);
  if (!authUsers) return ids.length;

  const bannedIds = new Set(
    authUsers.filter((u) => u.banned_until && new Date(u.banned_until).getTime() > Date.now()).map((u) => u.id)
  );
  return ids.filter((id) => !bannedIds.has(id)).length;
}
