#!/usr/bin/env node
// Agenda diaria — comprobaciones reproducibles de supabase/functions/daily-agenda/agenda.ts SIN red ni base: el mismo
// archivo que despliega la Edge Function, con un cliente Supabase en memoria (dryRun). Cubre el aviso de notificaciones
// sin leer: destinatario (recipient_id), acceso vigente, días anteriores, leídas, singular/plural, HTML y texto, envío
// sin contenidos del día, bloque omitido en 0 y base sin la tabla `notifications`.
//
// Uso (raíz del repo, Node ≥ 22.18 / 23.6 por el type stripping de .ts):
//   node supabase/qa/v1.6/agenda/agenda-checks.mjs
// Sale con código 1 si alguna comprobación falla.
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
globalThis.fetch = () => {
  throw new Error("sin red en estas comprobaciones");
};
const { runDailyAgenda } = await import(pathToFileURL(join(repoRoot, "supabase/functions/daily-agenda/agenda.ts")).href);

const today = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Buenos_Aires" }).format(new Date());
const SA = "sa", AM = "am", AM2 = "am2", CLIENT_USER = "cu";
const A = "client-a", B = "client-b";

/** Cliente Supabase mínimo en memoria: from().select().eq/in/is/order/single, conteo con head, auth.admin.listUsers. */
function makeDb({ notifications, missingNotifications = false }) {
  const tables = {
    profiles: [
      { id: SA, email: "sa@x", full_name: "Super Uno", role: "super_admin", daily_agenda_enabled: true },
      { id: AM, email: "am@x", full_name: "Account Dos", role: "account_manager", daily_agenda_enabled: true },
      { id: AM2, email: "am2@x", full_name: "Account Tres", role: "account_manager", daily_agenda_enabled: true },
      { id: CLIENT_USER, email: "cu@x", full_name: "Cliente Cuatro", role: "client", daily_agenda_enabled: false },
    ],
    statuses: [
      { id: "s-draft", key: "draft", label: "Borrador", color: "#94A3B8" },
      { id: "s-rev", key: "in_review", label: "En revisión", color: "#F59E0B" },
      { id: "s-appr", key: "approved", label: "Aprobado", color: "#8B5CF6" },
    ],
    clients: [
      { id: A, name: "Cliente A", color: "#000000" },
      { id: B, name: "Cliente B", color: null },
    ],
    user_client_assignments: [{ user_id: AM, client_id: A }],
    publications: [
      { id: "p1", client_id: B, title: "Solo B hoy", publication_time: "10:00:00", status_id: "s-rev", publication_date: today, archived_at: null },
    ],
    notifications,
  };
  const from = (table) => {
    const filters = [];
    let head = false;
    const api = {
      select(_cols, opts) {
        head = Boolean(opts?.head);
        return api;
      },
      eq(col, val) {
        filters.push((r) => r[col] === val);
        return api;
      },
      in(col, vals) {
        filters.push((r) => vals.includes(r[col]));
        return api;
      },
      is(col, val) {
        filters.push((r) => (r[col] ?? null) === val);
        return api;
      },
      order() {
        return api;
      },
      single() {
        return api.then((res) => ({ data: res.data?.[0] ?? null, error: res.error }));
      },
      then(resolveFn, rejectFn) {
        if (table === "notifications" && missingNotifications) {
          return Promise.resolve({ data: null, count: null, error: { code: "42P01", message: "relation does not exist" } }).then(resolveFn, rejectFn);
        }
        const rows = (tables[table] ?? []).filter((r) => filters.every((f) => f(r)));
        return Promise.resolve(head ? { data: null, count: rows.length, error: null } : { data: rows, error: null }).then(resolveFn, rejectFn);
      },
    };
    return api;
  };
  return {
    from,
    auth: {
      admin: {
        listUsers: async () => ({ data: { users: tables.profiles.map((p) => ({ id: p.id, email_confirmed_at: "2026-01-01" })) }, error: null }),
      },
    },
  };
}

const n = (recipient_id, client_id, read_at = null, created_at = "2026-11-01T10:00:00Z", suppressed_at = null) => ({
  recipient_id,
  client_id,
  read_at,
  created_at,
  suppressed_at,
});
const notifications = [
  // AM: 4 sin leer de su cliente A (2 de días anteriores), 1 leída y 2 sin leer de B (no asignado hoy: no cuentan).
  n(AM, A), n(AM, A), n(AM, A, null, "2026-10-01T10:00:00Z"), n(AM, A, null, "2026-09-15T10:00:00Z"),
  n(AM, A, "2026-11-20T00:00:00Z"), n(AM, B), n(AM, B),
  // AM: 1 sin leer pero SUPRIMIDA (publicación archivada): fuera de pendientes, como en la campanita.
  n(AM, A, null, "2026-11-01T10:00:00Z", "2026-11-02T00:00:00Z"),
  // Otros destinatarios en el MISMO cliente A: nunca cuentan para AM ni para SA (recipient_id).
  n(AM2, A), n(AM2, A), n(CLIENT_USER, A), n(CLIENT_USER, A), n(CLIENT_USER, B),
  // SA: 1 sin leer (cliente B; Super Admin ve todos los clientes).
  n(SA, B),
];

const run = async (db, testUserId) =>
  (await runDailyAgenda({ supabase: db, resendApiKey: "x", fromAddress: "x", siteUrl: "https://s", testUserId, dryRun: true })).recipients[0];

const checks = [];
const check = (name, ok, detail = "") => checks.push({ name, ok, detail });

const am = await run(makeDb({ notifications }), AM);
check("AM: 4 pendientes (solo recipient_id = AM; excluye cliente no asignado, leídas y suprimidas por archivado; incluye días anteriores)", am.unreadNotifications === 4, am.unreadNotifications);
check("AM: sin contenidos de hoy (la de hoy es de B) pero se envía", am.result === "dry_run" && am.totalCount === 0, am.result);
check("AM: plural en HTML", am.html.includes("Tenés 4 notificaciones pendientes de revisión."));
check("AM: plural en texto", am.text.includes("Tenés 4 notificaciones pendientes de revisión."));
check("AM: enlace en HTML y texto", am.html.includes('href="https://s/admin/notifications"') && am.text.includes("https://s/admin/notifications"));
check("AM: sin CTA de agenda cuando no hay contenidos", !am.html.includes("Ver agenda en Planner") && !am.text.includes("Ver agenda en Planner"));

const sa = await run(makeDb({ notifications }), SA);
check("SA: 1 sin leer (solo las suyas; no suma las de AM, AM2 ni del Client User)", sa.unreadNotifications === 1, sa.unreadNotifications);
check("SA: contenido de hoy + singular en HTML y texto", sa.totalCount === 1 && sa.html.includes("Tenés 1 notificación pendiente de revisión.") && sa.text.includes("Tenés 1 notificación pendiente de revisión."));
check("SA: agenda + CTA en HTML y texto", sa.html.includes("Ver agenda en Planner") && sa.text.includes("Solo B hoy") && sa.text.includes("Ver agenda en Planner"));

const am2 = await run(makeDb({ notifications }), AM2);
check("AM2 sin clientes asignados: sus notificaciones de A no cuentan y se omite", am2.result === "skipped_no_pending" && am2.unreadNotifications === 0, am2.result);

const sa0 = await run(makeDb({ notifications: [] }), SA);
check("SA sin pendientes: bloque omitido, agenda igual", sa0.totalCount === 1 && !sa0.html.includes("pendiente de revisión") && !sa0.text.includes("pendiente de revisión") && !sa0.html.includes("admin/notifications"));

const amNoTable = await run(makeDb({ notifications, missingNotifications: true }), AM);
check("Sin tabla notifications (42P01): 0 y se omite", amNoTable.result === "skipped_no_pending" && amNoTable.unreadNotifications === 0, amNoTable.result);

let clientRejected = false;
try {
  await run(makeDb({ notifications }), CLIENT_USER);
} catch {
  clientRejected = true;
}
check("Client User nunca recibe agenda (testUserId rechazado)", clientRejected);

for (const c of checks) console.log(`${c.ok ? "OK  " : "FAIL"} ${c.name}${c.ok ? "" : ` → ${c.detail}`}`);
const failed = checks.filter((c) => !c.ok).length;
console.log(failed ? `\n✖ ${failed} de ${checks.length} comprobaciones fallaron.` : `\n✔ ${checks.length} comprobaciones OK.`);
process.exitCode = failed ? 1 : 0;
