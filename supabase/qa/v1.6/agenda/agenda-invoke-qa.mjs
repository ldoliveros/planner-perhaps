#!/usr/bin/env node
// Agenda diaria — invoca la Edge Function `daily-agenda` DESPLEGADA en QA (planner-qa-v16, wxkbkdoaohywqabmyqjk).
// Nunca producción, y nunca una corrida general: TODA llamada con credencial válida lleva `testUserId` (un usuario QA).
//
// La función (withSupabase auth:'secret') solo acepta las claves NUEVAS `sb_secret_…`: la service_role legacy (JWT) de
// .env.development.local se rechaza con 401 INVALID_API_KEY. La secret key de QA se lee de QA_AGENDA_SECRET_KEY en
// `.env.qa.local` (gitignoreado por .env*; la carga el usuario desde Dashboard → Project Settings → API Keys de QA).
//
// Uso (raíz del repo; claves leídas de .env.development.local y .env.qa.local, nunca impresas):
//   node supabase/qa/v1.6/agenda/agenda-invoke-qa.mjs auth
//        sin credencial, con la anon key y con un JWT de usuario falso → todas deben rechazarse (401/403)
//   node supabase/qa/v1.6/agenda/agenda-invoke-qa.mjs dryrun <email QA> [carpeta-de-salida]
//        corrida acotada a ese usuario en dryRun (no llama a Resend ni escribe daily_agenda_log)
//   node supabase/qa/v1.6/agenda/agenda-invoke-qa.mjs send <email QA> --to <dirección> --confirm-send wxkbkdoaohywqabmyqjk
//        UN envío real (Resend) con los datos de ese usuario QA, forzado a <dirección> (overrideEmail). Registra el
//        envío del día en daily_agenda_log de QA, así que un segundo intento ese día se saltea (skipped_already_sent).
import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const QA_REF = "wxkbkdoaohywqabmyqjk";
const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "..");
const [mode, email, ...rest] = process.argv.slice(2);
const opt = (name) => {
  const i = rest.indexOf(name);
  return i >= 0 ? rest[i + 1] : undefined;
};

const env = Object.fromEntries(
  readFileSync(join(repoRoot, ".env.development.local"), "utf8")
    .split(/\r?\n/)
    .filter((l) => /^[A-Z_]+=/.test(l))
    .map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1).trim()])
);
const url = env.NEXT_PUBLIC_SUPABASE_URL;
if (!url || new URL(url).hostname !== `${QA_REF}.supabase.co`) throw new Error("La app local no apunta a QA: abortado.");
const fnUrl = `${url}/functions/v1/daily-agenda`;

function qaSecretKey() {
  let raw = "";
  try {
    raw = readFileSync(join(repoRoot, ".env.qa.local"), "utf8");
  } catch {
    // sin archivo
  }
  const line = raw.split(String.fromCharCode(10)).map((l) => l.trim()).find((l) => l.startsWith("QA_AGENDA_SECRET_KEY="));
  const value = line?.slice("QA_AGENDA_SECRET_KEY=".length).trim() ?? "";
  if (!value.startsWith("sb_secret_")) {
    throw new Error("Falta QA_AGENDA_SECRET_KEY=sb_secret_… (secret key del proyecto QA) en .env.qa.local.");
  }
  return value;
}

async function call(headers, body) {
  const res = await fetch(fnUrl, { method: "POST", headers: { "Content-Type": "application/json", ...headers }, body: JSON.stringify(body) });
  const text = await res.text();
  let json = null;
  try {
    json = JSON.parse(text);
  } catch {
    // no JSON
  }
  return { status: res.status, json, text };
}

async function qaUserId(address) {
  if (!address?.endsWith("@perhaps-planner-qa.com")) throw new Error("Indicar el email de un usuario QA persistente.");
  const require = createRequire(join(repoRoot, "package.json"));
  const { createClient } = require("@supabase/supabase-js");
  const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
  const { data, error } = await admin.from("profiles").select("id, role").eq("email", address).single();
  if (error) throw error;
  return data;
}

const summarize = (r) =>
  r.json?.recipients
    ? r.json.recipients.map((x) => ({
        role: x.role,
        result: x.result,
        totalCount: x.totalCount,
        unreadNotifications: x.unreadNotifications,
        resendEmailId: x.resendEmailId ? "(presente)" : undefined,
        error: x.error,
      }))
    : (r.json ?? r.text.slice(0, 300));

if (mode === "auth") {
  // Un body de QA inofensivo por si alguna credencial pasara: acotado y en dryRun.
  const body = { testUserId: "00000000-0000-0000-0000-000000000000", dryRun: true };
  const fakeJwt = "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ4Iiwicm9sZSI6ImF1dGhlbnRpY2F0ZWQifQ.invalid";
  const cases = [
    ["sin credencial", {}],
    ["anon key (apikey)", { apikey: env.NEXT_PUBLIC_SUPABASE_ANON_KEY }],
    ["anon key (Bearer)", { Authorization: `Bearer ${env.NEXT_PUBLIC_SUPABASE_ANON_KEY}` }],
    ["JWT de usuario inválido", { Authorization: `Bearer ${fakeJwt}` }],
    ["service_role legacy (JWT)", { apikey: env.SUPABASE_SERVICE_ROLE_KEY }],
  ];
  let ok = true;
  for (const [name, headers] of cases) {
    const r = await call(headers, body);
    const rejected = r.status === 401 || r.status === 403;
    ok &&= rejected;
    console.log(`${rejected ? "OK  " : "FAIL"} ${name}: HTTP ${r.status}`);
  }
  process.exitCode = ok ? 0 : 1;
} else if (mode === "dryrun") {
  const profile = await qaUserId(email);
  const r = await call({ apikey: qaSecretKey() }, { testUserId: profile.id, dryRun: true });
  console.log(`HTTP ${r.status}`, JSON.stringify(summarize(r)));
  const outDir = rest[0];
  if (outDir && r.json?.recipients?.[0]?.html) {
    writeFileSync(join(outDir, "deployed.html"), r.json.recipients[0].html);
    writeFileSync(join(outDir, "deployed.txt"), r.json.recipients[0].text ?? "");
  }
} else if (mode === "send") {
  const to = opt("--to");
  if (opt("--confirm-send") !== QA_REF) throw new Error(`send exige --confirm-send ${QA_REF}.`);
  if (!to || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(to)) throw new Error("send exige --to <dirección>.");
  const profile = await qaUserId(email);
  const r = await call(
    { apikey: qaSecretKey() },
    { testUserId: profile.id, dryRun: false, overrideEmail: to }
  );
  console.log(`HTTP ${r.status}`, JSON.stringify(summarize(r)));
} else {
  throw new Error("Modo: auth | dryrun <email QA> | send <email QA> --to <dirección> --confirm-send " + QA_REF);
}
