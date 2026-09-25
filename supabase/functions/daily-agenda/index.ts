// Edge Function "daily-agenda" — Etapa 2 (sin Cron todavía).
//
// Invocación: SOLO con la secret key del proyecto (service_role) en el header `apikey` — `withSupabase`
// (paquete oficial de Supabase) la exige antes de correr el handler y rechaza cualquier otra credencial
// (incl. la anon key, pública). No es un endpoint público: es exactamente el mismo mecanismo que va a usar
// el futuro Cron (Bearer/apikey = service_role, guardado en Vault) — probarla ahora a mano con esa misma
// key prueba el camino real, no un atajo aparte. Por eso este archivo NO agrega ningún chequeo de
// autorización propio: withSupabase ya es la barrera.
//
// Body opcional (JSON), solo para QA (ver agenda.ts):
//   { "testUserId": "<uuid>", "dryRun": true, "overrideEmail": "qa@ejemplo.com" }
// - testUserId: acota la corrida a un único profile (nunca se usa en la invocación real).
// - dryRun: no llama a Resend ni escribe en daily_agenda_log, devuelve el HTML para revisar.
// - overrideEmail: fuerza el envío real a esta dirección en vez del email del profile; requiere
//   testUserId (agenda.ts lo rechaza si no). Nunca se usa en la invocación real vía Cron.
//
// Requiere verify_jwt=false para esta función (ver supabase/config.toml) — auth:'secret' valida por
// API key, no por JWT de usuario.
import { withSupabase } from "npm:@supabase/server@1";
import { runDailyAgenda } from "./agenda.ts";

const FROM_ADDRESS = "Planner <agenda@perhaps.com.ar>";

export default {
  fetch: withSupabase({ auth: "secret" }, async (req: Request, ctx: any) => {
    let body: { testUserId?: string; dryRun?: boolean; overrideEmail?: string } = {};
    try {
      if (req.method === "POST") body = await req.json();
    } catch {
      // sin body o body inválido -> corrida real (testUserId/dryRun ausentes)
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const siteUrl = Deno.env.get("SITE_URL");
    if (!resendApiKey || !siteUrl) {
      return Response.json({ error: "Faltan secrets: RESEND_API_KEY y/o SITE_URL." }, { status: 500 });
    }

    try {
      const result = await runDailyAgenda({
        supabase: ctx.supabaseAdmin,
        resendApiKey,
        fromAddress: FROM_ADDRESS,
        siteUrl,
        testUserId: body.testUserId,
        dryRun: body.dryRun,
        overrideEmail: body.overrideEmail,
      });
      return Response.json(result);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return Response.json({ error: message }, { status: 500 });
    }
  }),
};
