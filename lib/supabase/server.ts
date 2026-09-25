import { cache } from "react";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { Database } from "./database.types";

// cache() de React: dedupea por request/render (no es un cache global entre requests — Next.js resetea
// ese scope en cada request nueva), así que todas las llamadas a createClient() dentro de un mismo
// Server Component render o Server Action reciben la MISMA instancia ya autenticada, en vez de disparar
// su propio getUser() cada una. Sin esto, una sola navegación a Planner de cliente (8-9 createClient()
// en paralelo entre layout + queries) podría terminar pegándole a Auth 8-9 veces en el peor caso.
export const createClient = cache(async () => {
  const cookieStore = await cookies();

  const supabase = createServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Llamado desde un Server Component: el middleware se encarga de refrescar la sesión.
          }
        },
      },
    }
  );

  // Fuerza el refresh on-demand ANTES de devolver el cliente: si el access token de la cookie venció,
  // getUser() lo renueva acá mismo (con el refresh token ya presente) y persiste el nuevo par vía
  // `setAll` de arriba — dentro de una Server Action esto sí escribe la cookie (a diferencia de
  // proxy.ts, cuyo refresh llega en la respuesta DESPUÉS de que la Action ya leyó las cookies viejas,
  // que es la causa real de "la mutación falla una vez tras inactividad, F5 la arregla"). Se usa
  // getUser() y no getSession() porque valida el token contra el servidor de Auth, no solo localmente.
  await supabase.auth.getUser();

  return supabase;
});
