#!/usr/bin/env node
// Agenda diaria — corre supabase/functions/daily-agenda/agenda.ts (el mismo archivo que despliega la Edge Function)
// contra la base de QA (planner-qa-v16, wxkbkdoaohywqabmyqjk), SIEMPRE en dryRun y para UN usuario QA. Verifica la
// lógica con datos reales; NO prueba el runtime de Deno, el despliegue ni el envío por Resend.
//
// Barreras: aborta si `.env.development.local` no apunta a QA; bloquea cualquier fetch fuera de QA (Resend incluido) y
// toda escritura REST (POST/PATCH/PUT/DELETE). La service key se lee de ese archivo y nunca se imprime.
//
// Uso (raíz del repo):
//   node supabase/qa/v1.6/agenda/agenda-qa-dryrun.mjs qa-account-manager@perhaps-planner-qa.com [carpeta-de-salida]
// Imprime role / result / totalCount / unreadNotifications y la cantidad independiente de notificaciones sin leer con
// recipient_id = usuario (y de clientes que hoy puede ver), para compararlas. Con carpeta, guarda el HTML y el texto.
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const [email, outDir] = process.argv.slice(2);
if (!email || !email.endsWith("@perhaps-planner-qa.com")) throw new Error("Indicar el email de un usuario QA persistente.");
const QA_REF = "wxkbkdoaohywqabmyqjk";
const env = Object.fromEntries(
  readFileSync(join(repoRoot, ".env.development.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || new URL(url).hostname !== `${QA_REF}.supabase.co`) throw new Error("La app local no apunta a QA: abortado.");

const realFetch = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const target = typeof input === "string" ? input : input.url;
  if (!target.startsWith(url)) throw new Error(`fetch bloqueado fuera de QA: ${new URL(target).hostname}`);
  const method = (init?.method ?? "GET").toUpperCase();
  if (target.includes("/rest/v1/") && !["GET", "HEAD"].includes(method)) throw new Error(`escritura bloqueada: ${method}`);
  return realFetch(input, init);
};

const require = createRequire(join(repoRoot, "package.json"));
const { createClient } = require("@supabase/supabase-js");
const supabase = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const { runDailyAgenda } = await import(pathToFileURL(join(repoRoot, "supabase/functions/daily-agenda/agenda.ts")).href);

const { data: profile, error } = await supabase.from("profiles").select("id, role").eq("email", email).single();
if (error) throw error;

// Conteo independiente (no usa agenda.ts): sin leer, recipient_id = usuario, clientes visibles hoy.
let independent = supabase.from("notifications").select("id", { count: "exact", head: true }).eq("recipient_id", profile.id).is("read_at", null);
if (profile.role !== "super_admin") {
  const { data: assigned } = await supabase.from("user_client_assignments").select("client_id").eq("user_id", profile.id);
  independent = independent.in("client_id", (assigned ?? []).map((a) => a.client_id).concat("00000000-0000-0000-0000-000000000000"));
}
const { count: independentCount } = await independent;
// Para contexto: sin leer de OTROS destinatarios (no deben influir).
const { count: othersCount } = await supabase
  .from("notifications")
  .select("id", { count: "exact", head: true })
  .neq("recipient_id", profile.id)
  .is("read_at", null);

const result = await runDailyAgenda({
  supabase,
  resendApiKey: "bloqueada",
  fromAddress: "Planner <agenda@example.invalid>",
  siteUrl: "https://planner.example.invalid",
  testUserId: profile.id,
  dryRun: true,
});
for (const r of result.recipients) {
  console.log(
    JSON.stringify({
      role: r.role,
      result: r.result,
      totalCount: r.totalCount,
      unreadNotifications: r.unreadNotifications,
      independentUnreadForRecipient: independentCount,
      unreadOfOtherRecipients: othersCount,
      matches: r.unreadNotifications === independentCount,
    })
  );
  if (outDir && r.html) {
    writeFileSync(join(outDir, `${r.role}.html`), r.html);
    writeFileSync(join(outDir, `${r.role}.txt`), r.text);
  }
}
