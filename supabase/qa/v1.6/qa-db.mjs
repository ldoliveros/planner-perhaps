#!/usr/bin/env node
// v1.6 — Guard para operar SOLO contra el proyecto Supabase aislado de QA (planner-qa-v16).
//
// Por qué existe: el CLI de este repo está enlazado (`supabase link`) a PRODUCCIÓN. Un `db push` sin `--db-url`
// — o con la URL equivocada — aplicaría migraciones en producción. Este script es la única vía documentada para
// tocar la base de QA y se niega a ejecutar si el destino no es inequívocamente el proyecto QA.
//
// Uso (desde la raíz del repo, rama feature/v1.6-collaboration):
//   node supabase/qa/v1.6/qa-db.mjs app-env                                valida .env.development.local (app → QA)
//   node supabase/qa/v1.6/qa-db.mjs check                                  valida la URL, no se conecta
//   node supabase/qa/v1.6/qa-db.mjs list     [--workdir <repo>]            supabase migration list (solo lectura)
//   node supabase/qa/v1.6/qa-db.mjs pg-version                             versión de Postgres (consulta fija, solo lectura)
//   node supabase/qa/v1.6/qa-db.mjs push-dry [--workdir <repo>]            supabase db push --dry-run
//   node supabase/qa/v1.6/qa-db.mjs push --workdir <repo> --expect-last <versión> --confirm <ref QA>
//   node supabase/qa/v1.6/qa-db.mjs flag-status | notifications-recent      consultas fijas de solo lectura
//   node supabase/qa/v1.6/qa-db.mjs flag-enable-qa-sandbox --confirm <ref QA>  v16_notifications solo para QA Sandbox
//   node supabase/qa/v1.6/qa-db.mjs dry-run-comment-reads --confirm <ref QA>   dry-run transaccional (ROLLBACK) de
//        migrations/20261013000001 + security_checks_comment_reads.sql (ya aplicada en QA: su guard aborta)
//   node supabase/qa/v1.6/qa-db.mjs rehearse-rollback --block A|CR|RX|RP|RT|PC|AR|EM --confirm <ref QA>  ensayo transaccional (ROLLBACK)
//   node supabase/qa/v1.6/qa-db.mjs dry-run-archive --confirm <ref QA>  dry-run (ROLLBACK) de pending 20261017000001/2 + security_checks_archive.sql
//   node supabase/qa/v1.6/qa-db.mjs dry-run-replies-reactions --confirm <ref QA>  dry-run (ROLLBACK) de pending 20261014000001/2
//   node supabase/qa/v1.6/qa-db.mjs dry-run-collab-emails --confirm <ref QA>  dry-run (ROLLBACK) de pending 20261018000001 + security_checks_collab_emails.sql
//   node supabase/qa/v1.6/qa-db.mjs security-checks --suite core|comment-reads|replies-reactions|archive|collab-emails|collab-integration --confirm <ref QA>  pruebas (revertidas)
//
// La URL de la base NUNCA va en el repo ni en el chat: se lee de la variable de entorno QA_DB_URL o del archivo
// `.env.qa.local` en la raíz del repo (gitignoreado por `.env*`; Next no lo carga). Nunca se imprime completa.
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const QA_PROJECT_REF = "wxkbkdoaohywqabmyqjk"; // planner-qa-v16
const KNOWN_PROD_REFS = ["mglbzsysgsdrsbqlovwd"]; // producción (planner.perhaps.com.ar)

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

function fail(message) {
  console.error(`\n✖ qa-db: ${message}\n  No se ejecutó nada.`);
  process.exit(1);
}

function arg(name) {
  const i = process.argv.indexOf(name);
  return i > -1 ? process.argv[i + 1] : undefined;
}

/** Refs de producción conocidas + la del proyecto enlazado localmente (supabase/.temp/project-ref). */
function prodRefs() {
  const refs = new Set(KNOWN_PROD_REFS);
  const linked = join(repoRoot, "supabase", ".temp", "project-ref");
  if (existsSync(linked)) refs.add(readFileSync(linked, "utf8").trim());
  refs.delete(QA_PROJECT_REF);
  return [...refs].filter(Boolean);
}

function readQaDbUrl() {
  if (process.env.QA_DB_URL) return { url: process.env.QA_DB_URL.trim(), source: "variable QA_DB_URL" };
  const file = join(repoRoot, ".env.qa.local");
  if (!existsSync(file)) fail("falta QA_DB_URL (variable de entorno o archivo .env.qa.local en la raíz del repo).");
  const line = readFileSync(file, "utf8")
    .split(/\r?\n/)
    .find((l) => /^\s*QA_DB_URL\s*=/.test(l));
  if (!line) fail(".env.qa.local no define QA_DB_URL.");
  const value = line.replace(/^\s*QA_DB_URL\s*=\s*/, "").trim().replace(/^["']|["']$/g, "");
  return { url: value, source: ".env.qa.local" };
}

function redact(url) {
  return url.replace(/(\/\/[^:/@]+):[^@]*@/, "$1:***@");
}

/** Valida que la URL apunte al proyecto QA y a nada más. Devuelve un resumen sin secretos. */
function validateQaDbUrl(raw) {
  for (const ref of prodRefs()) {
    if (raw.includes(ref)) fail(`la URL contiene el identificador de PRODUCCIÓN (${ref}).`);
  }
  let url;
  try {
    url = new URL(raw);
  } catch {
    fail("QA_DB_URL no es una URL válida (¿password sin percent-encoding?).");
  }
  if (url.protocol !== "postgresql:" && url.protocol !== "postgres:") fail("QA_DB_URL tiene que empezar con postgresql://");
  if (!url.password) fail("QA_DB_URL no trae password (el CLI la pediría por consola).");

  const user = decodeURIComponent(url.username);
  const host = url.hostname;
  let refFromUrl = null;
  let mode = null;
  if (/^aws-\d+-[a-z0-9-]+\.pooler\.supabase\.com$/.test(host) && user.startsWith("postgres.")) {
    refFromUrl = user.slice("postgres.".length);
    mode = "session pooler";
  } else if (host === `db.${QA_PROJECT_REF}.supabase.co` && user === "postgres") {
    refFromUrl = QA_PROJECT_REF;
    mode = "conexión directa";
  } else {
    fail(`host/usuario no reconocidos (${user}@${host}). Usar el "Session pooler" del Dashboard del proyecto QA.`);
  }
  if (refFromUrl !== QA_PROJECT_REF) fail(`el destino es el proyecto "${refFromUrl}", no el de QA (${QA_PROJECT_REF}).`);
  if (url.port && url.port !== "5432") {
    fail(`puerto ${url.port}: el Transaction pooler (6543) no sirve para migraciones; usar el Session pooler (5432).`);
  }
  if (url.pathname !== "/postgres") fail(`base "${url.pathname.slice(1)}": se esperaba "postgres".`);
  return { mode, user, host, ref: refFromUrl };
}

function migrationsOf(workdir) {
  const dir = join(workdir, "supabase", "migrations");
  if (!existsSync(dir)) fail(`no existe ${dir}.`);
  return readdirSync(dir)
    .filter((f) => /^\d{14}_.+\.sql$/.test(f))
    .sort();
}

function cliEntry() {
  const candidates = [
    process.env.SUPABASE_CLI_JS,
    process.env.APPDATA && join(process.env.APPDATA, "npm", "node_modules", "supabase", "dist", "supabase.js"),
  ].filter(Boolean);
  const found = candidates.find((p) => existsSync(p));
  if (!found) fail("no se encontró el CLI de Supabase (definir SUPABASE_CLI_JS con la ruta a dist/supabase.js).");
  return found;
}

/** Ejecuta el CLI SIN shell (la URL viaja como argumento intacto: cmd.exe no interpreta % & ^). */
function runCli(args, workdir) {
  const entry = cliEntry();
  const shown = args.map((a) => (a.startsWith("postgres") ? redact(a) : a)).join(" ");
  console.log(`\n→ supabase ${shown}\n  (workdir: ${workdir})\n`);
  const result = spawnSync(process.execPath, [entry, ...args, "--workdir", workdir], { stdio: "inherit", shell: false });
  process.exit(result.status ?? 1);
}

/**
 * App local → QA: `.env.development.local` (lo usa `next dev` por encima de `.env.local`) tiene que apuntar al
 * proyecto QA. Las claves con formato JWT (anon / service_role legacy) traen el claim `ref`: se compara sin
 * imprimir la clave. Las claves nuevas (sb_publishable_ / sb_secret_) son opacas: solo se valida el prefijo.
 */
function checkAppEnv() {
  const file = join(repoRoot, ".env.development.local");
  if (!existsSync(file)) fail("no existe .env.development.local (ver QA_STRATEGY.md §B6).");
  const env = Object.fromEntries(
    readFileSync(file, "utf8")
      .split(/\r?\n/)
      .map((l) => l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/))
      .filter(Boolean)
      .map((m) => [m[1], m[2].replace(/^["']|["']$/g, "")])
  );
  const expectedUrl = `https://${QA_PROJECT_REF}.supabase.co`;
  if (env.NEXT_PUBLIC_SUPABASE_URL !== expectedUrl) {
    fail(`NEXT_PUBLIC_SUPABASE_URL debe ser ${expectedUrl} (es: ${env.NEXT_PUBLIC_SUPABASE_URL ?? "—"}).`);
  }
  for (const key of ["NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY"]) {
    const value = env[key];
    if (!value) fail(`.env.development.local no define ${key}.`);
    for (const ref of prodRefs()) if (value.includes(ref)) fail(`${key} contiene el identificador de PRODUCCIÓN.`);
    if (value.split(".").length === 3) {
      let claims;
      try {
        claims = JSON.parse(Buffer.from(value.split(".")[1], "base64url").toString("utf8"));
      } catch {
        fail(`${key} no es un JWT legible.`);
      }
      if (claims.ref !== QA_PROJECT_REF) fail(`${key} pertenece al proyecto "${claims.ref}", no al de QA.`);
      const expectedRole = key === "SUPABASE_SERVICE_ROLE_KEY" ? "service_role" : "anon";
      if (claims.role !== expectedRole) fail(`${key} tiene rol "${claims.role}", se esperaba "${expectedRole}".`);
    } else if (!/^sb_(publishable|secret)_/.test(value)) {
      fail(`${key} no tiene un formato de clave de Supabase reconocible.`);
    }
  }
  // next dev carga TAMBIÉN .env.local (prioridad menor): si acá no se define, la key real de .env.local seguiría
  // activa. Definida y vacía, la anula: la app responde "Falta configurar RESEND_API_KEY" en vez de enviar.
  if (!("RESEND_API_KEY" in env)) fail("definir RESEND_API_KEY= (vacía) en .env.development.local para anular la de .env.local.");
  if (env.RESEND_API_KEY) fail("RESEND_API_KEY tiene que quedar VACÍA en .env.development.local durante el QA (evita envíos reales).");
  console.log(`✔ .env.development.local apunta a ${expectedUrl}; claves del proyecto QA; RESEND_API_KEY anulada.`);
}

// ---------------------------------------------------------------------------------------------------------
const command = process.argv[2];
if (command === "app-env") {
  checkAppEnv();
  process.exit(0);
}
const workdir = resolve(arg("--workdir") ?? repoRoot);
const { url, source } = readQaDbUrl();
const target = validateQaDbUrl(url);
const migrations = migrationsOf(workdir);

console.log(`✔ Destino QA verificado (${source}): ${target.user}@${target.host} [${target.mode}] → ref ${target.ref}`);
console.log(`  Producción bloqueada: ${prodRefs().join(", ") || "(ninguna conocida)"}`);
console.log(`  Migraciones locales en ${workdir}: ${migrations.length} (última: ${migrations.at(-1) ?? "—"})`);

switch (command) {
  case "check":
    console.log("\n  Solo validación: no se abrió ninguna conexión.");
    break;
  case "list":
    runCli(["migration", "list", "--db-url", url], workdir);
    break;
  case "pg-version":
    // Consulta FIJA de solo lectura (no acepta SQL arbitrario): versión del servidor de QA.
    runCli(
      [
        "db",
        "query",
        "select current_setting('server_version') as server_version, current_setting('server_version_num') as server_version_num, version() as version",
        "--db-url",
        url,
      ],
      workdir
    );
    break;
  case "push-dry":
    runCli(["db", "push", "--dry-run", "--db-url", url], workdir);
    break;
  case "flag-status":
    // Consulta FIJA de solo lectura: estado del flag v16_notifications y slugs de los clientes habilitados.
    runCli(
      [
        "db",
        "query",
        "select f.key, f.enabled, coalesce(array_agg(c.slug order by c.slug) filter (where c.slug is not null), '{}') as client_slugs, cardinality(f.client_ids) as client_ids_count, f.updated_at from public.planner_feature_flags f left join public.clients c on c.id = any (f.client_ids) where f.key = 'v16_notifications' group by f.key, f.enabled, f.client_ids, f.updated_at",
        "--db-url",
        url,
      ],
      workdir
    );
    break;
  case "notifications-recent":
    // Consulta FIJA de solo lectura: últimas 30 notificaciones de QA Sandbox (destinatario, tipo, autor, lectura)
    // para verificar destinatarios, duplicados y notificaciones propias después de una prueba manual.
    runCli(
      [
        "db",
        "query",
        "select n.created_at, n.type, r.email as recipient, r.role as recipient_role, a.email as actor, n.event_key, n.read_at is not null as read, (n.recipient_id = n.actor_id) as own from public.notifications n join public.clients c on c.id = n.client_id and c.slug = 'qa-sandbox' left join public.profiles r on r.id = n.recipient_id left join public.profiles a on a.id = n.actor_id order by n.created_at desc limit 30",
        "--db-url",
        url,
      ],
      workdir
    );
    break;
  case "dry-run-comment-reads": {
    // DRY-RUN TRANSACCIONAL en UN solo statement (el CLI usa el protocolo extendido: un comando por consulta): un
    // DO que ejecuta la migración y las pruebas y termina SIEMPRE con una excepción centinela, que aborta y revierte
    // todo (efectos mínimos no revertibles: QA_STRATEGY.md §A). Éxito = la excepción es el centinela
    // DRY_RUN_OK; cualquier otro error (SQL o "FAIL CR..") también revierte todo. Después, una consulta de solo
    // lectura aparte confirma que no quedó nada.
    if (arg("--confirm") !== QA_PROJECT_REF) fail(`dry-run-comment-reads exige --confirm ${QA_PROJECT_REF}.`);
    const migration = readFileSync(join(repoRoot, "supabase", "migrations", "20261013000001_v16_comment_reads.sql"), "utf8");
    const checks = readFileSync(join(repoRoot, "supabase", "qa", "v1.6", "security_checks_comment_reads.sql"), "utf8");
    const checksBody = checks
      .replace(/^begin;\s*$/m, "-- (begin del archivo omitido: transacción del DO)")
      .replace(/^rollback;\s*$/m, "-- (rollback del archivo omitido: lo hace la excepción centinela)");
    // COMMIT / END TRANSACTION|WORK de nivel superior (no los `end;` de los bloques PL/pgSQL).
    if (/^\s*(commit|end\s+(transaction|work))\b/im.test(migration + checksBody)) {
      fail("el SQL contiene COMMIT / END TRANSACTION: el dry-run no puede confirmarse.");
    }
    for (const tag of ["$dryrun$", "$mig$", "$chk$"]) {
      if ((migration + checksBody).includes(tag)) fail(`el SQL contiene el delimitador reservado ${tag}.`);
    }
    const sql = [
      "do $dryrun$",
      "begin",
      "  execute $mig$" + migration + "$mig$;",
      "  execute $chk$" + checksBody + "$chk$;",
      "  raise exception 'DRY_RUN_OK: migración y pruebas sin errores; transacción revertida';",
      "end",
      "$dryrun$;",
    ].join("\n");
    const verify =
      "select to_regclass('public.publication_comment_reads') is null as tabla_revertida, " +
      "to_regprocedure('public.mark_publication_comments_read(uuid, uuid[])') is null " +
      "and to_regprocedure('public.list_unread_publication_comments(uuid)') is null " +
      "and to_regprocedure('public.comment_reads_baseline()') is null as funciones_revertidas, " +
      "(select count(*) from public.publications where title like 'QA v1.6 lecturas%') as publicaciones_temporales, " +
      "(select count(*) from public.publication_comments where body in ('viejo', 'nuevo del AM', 'nuevo del cliente', 'otra publicación')) as comentarios_temporales";
    const dir = mkdtempSync(join(tmpdir(), "qa-dry-run-"));
    const file = join(dir, "dry_run_comment_reads.sql");
    writeFileSync(file, sql, "utf8");
    try {
      const entry = cliEntry();
      console.log(`\n→ [1/2] dry-run: supabase db query --file <temporal> --db-url ${redact(url)}\n`);
      const run = spawnSync(process.execPath, [entry, "db", "query", "--file", file, "--db-url", url, "--workdir", workdir], {
        encoding: "utf8",
        shell: false,
      });
      const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
      console.log(output.trim());
      const ok = output.includes("DRY_RUN_OK");
      console.log(ok ? "\n✔ Dry-run OK (terminó en el centinela: todo revertido)." : "\n✖ Dry-run con errores (revertido igual).");
      console.log(`\n→ [2/2] verificación de solo lectura posterior\n`);
      const check = spawnSync(process.execPath, [entry, "db", "query", verify, "--db-url", url, "--workdir", workdir], {
        stdio: "inherit",
        shell: false,
      });
      process.exitCode = ok && check.status === 0 ? 0 : 1;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    break;
  }
  case "dry-run-replies-reactions":
  case "dry-run-archive":
  case "dry-run-collab-emails": {
    // DRY-RUN TRANSACCIONAL de un conjunto de migraciones + su batería de pruebas, en UN statement (excepción centinela
    // = todo revertido) y una verificación de solo lectura posterior. SOLO con autorización.
    //   dry-run-replies-reactions: migrations/20261014000001 + 20261014000002 (ya aplicadas en QA: sus guardas abortan)
    //   dry-run-archive: pending-migrations/v1.6/20261017000001 (archivado) + 20261017000002 (avisos por cliente)
    if (arg("--confirm") !== QA_PROJECT_REF) fail(`${command} exige --confirm ${QA_PROJECT_REF}.`);
    //   dry-run-collab-emails: pending-migrations/v1.6/20261018000001 (pausa de emails de colaboración)
    const isArchive = command === "dry-run-archive";
    const isCollabEmails = command === "dry-run-collab-emails";
    // Archivado y respuestas/reacciones ya están aplicados en QA (2026-10-13): sus guardas abortan si se repite.
    const base = isCollabEmails
      ? join(repoRoot, "supabase", "pending-migrations", "v1.6")
      : join(repoRoot, "supabase", "migrations");
    const migrationFiles = isCollabEmails
      ? ["20261018000001_v16_pause_collab_emails.sql"]
      : isArchive
        ? ["20261017000001_v16_publication_archive.sql", "20261017000002_v16_publication_changes.sql"]
        : ["20261014000001_v16_comment_replies.sql", "20261014000002_v16_comment_reactions.sql"];
    const checksFile = isCollabEmails
      ? "security_checks_collab_emails.sql"
      : isArchive
        ? "security_checks_archive.sql"
        : "security_checks_replies_reactions.sql";
    const parts = [
      ...migrationFiles.map((f) => readFileSync(join(base, f), "utf8")),
      readFileSync(join(repoRoot, "supabase", "qa", "v1.6", checksFile), "utf8")
        .replace(/^begin;\s*$/m, "-- (begin del archivo omitido: transacción del DO)")
        .replace(/^rollback;\s*$/m, "-- (rollback del archivo omitido: lo hace la excepción centinela)"),
    ];
    const all = parts.join("\n");
    if (/^\s*(commit|end\s+(transaction|work))\b/im.test(all)) fail("el SQL contiene COMMIT / END TRANSACTION.");
    const tags = ["$dryrun$", "$p1$", "$p2$", "$p3$"];
    for (const tag of tags) if (all.includes(tag)) fail(`el SQL contiene el delimitador reservado ${tag}.`);
    const sql = [
      "do $dryrun$",
      "begin",
      ...parts.map((part, i) => `  execute $p${i + 1}$${part}$p${i + 1}$;`),
      "  raise exception 'DRY_RUN_OK: migraciones y pruebas sin errores; transacción revertida';",
      "end",
      "$dryrun$;",
    ].join("\n");
    const verify = isCollabEmails
      ? "select to_regprocedure('public.collab_emails_enabled_for(uuid)') is null as lectura_revertida, " +
        "not exists (select 1 from public.planner_feature_flags where key = 'v16_collab_emails') as flag_revertido, " +
        "not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('enqueue_comment_digest', 'request_status_email') and p.prosrc ilike '%collab_emails_enabled_for%') as funciones_originales, " +
        "(select count(*) from public.email_outbox) as outbox, " +
        "(select count(*) from public.publications where title like 'QA v1.6 EM%') as publicaciones_temporales"
      : isArchive
      ? "select not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'publications' and column_name in ('archived_at', 'archived_by')) as columnas_revertidas, " +
        "to_regclass('public.publication_changes') is null as avisos_revertidos, " +
        "(select string_agg(tablename, ',' order by tablename) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public') as realtime_tables, " +
        "(select count(*) from public.publications where title like 'QA v1.6 AR%') as publicaciones_temporales"
      : "select not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'publication_comments' and column_name = 'reply_to_comment_id') as columna_revertida, " +
      "to_regclass('public.publication_comment_reactions') is null as tabla_revertida, " +
      "to_regprocedure('public.add_publication_comment(uuid, text, uuid[], uuid)') is not null and to_regprocedure('public.add_publication_comment(uuid, text, uuid[], uuid, uuid)') is null as firma_original, " +
      "(select count(*) from public.publications where title like 'QA v1.6 RX%') as publicaciones_temporales";
    const dir = mkdtempSync(join(tmpdir(), "qa-dry-run-"));
    const file = join(dir, `${command}.sql`);
    writeFileSync(file, sql, "utf8");
    try {
      const entry = cliEntry();
      console.log(`\n→ [1/2] dry-run: supabase db query --file <temporal> --db-url ${redact(url)}\n`);
      const run = spawnSync(process.execPath, [entry, "db", "query", "--file", file, "--db-url", url, "--workdir", workdir], {
        encoding: "utf8",
        shell: false,
      });
      const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
      console.log(output.trim());
      const ok = output.includes("DRY_RUN_OK");
      console.log(ok ? "\n✔ Dry-run OK (terminó en el centinela: todo revertido)." : "\n✖ Dry-run con errores (revertido igual).");
      console.log(`\n→ [2/2] verificación de solo lectura posterior\n`);
      const check = spawnSync(process.execPath, [entry, "db", "query", verify, "--db-url", url, "--workdir", workdir], {
        stdio: "inherit",
        shell: false,
      });
      process.exitCode = ok && check.status === 0 ? 0 : 1;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    break;
  }
  case "schema-status":
    // Consulta FIJA de solo lectura: estado de respuestas/reacciones/lecturas (columna, tabla, grants, firmas, Realtime).
    runCli(
      [
        "db",
        "query",
        "select " +
          "exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'publication_comments' and column_name = 'reply_to_comment_id') as reply_column, " +
          "to_regclass('public.publication_comment_reactions') is not null as reactions_table, " +
          "(select relrowsecurity from pg_class where oid = to_regclass('public.publication_comment_reactions')) as reactions_rls, " +
          "has_table_privilege('authenticated', 'public.publication_comment_reactions', 'select') as auth_select, " +
          "has_table_privilege('authenticated', 'public.publication_comment_reactions', 'insert') or has_table_privilege('authenticated', 'public.publication_comment_reactions', 'update') or has_table_privilege('authenticated', 'public.publication_comment_reactions', 'delete') as auth_write, " +
          "has_table_privilege('anon', 'public.publication_comment_reactions', 'select') as anon_select, " +
          "has_function_privilege('authenticated', 'public.set_comment_reaction(uuid, text, boolean)', 'execute') as auth_exec_reaction, " +
          "has_function_privilege('anon', 'public.set_comment_reaction(uuid, text, boolean)', 'execute') as anon_exec_reaction, " +
          "(select string_agg(pg_get_function_identity_arguments(p.oid), ' | ') from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = 'add_publication_comment') as add_comment_signatures, " +
          "has_function_privilege('authenticated', 'public.add_publication_comment(uuid, text, uuid[], uuid, uuid)', 'execute') as auth_exec_add_comment, " +
          "has_function_privilege('anon', 'public.add_publication_comment(uuid, text, uuid[], uuid, uuid)', 'execute') as anon_exec_add_comment, " +
          "exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and tablename = 'publication_comment_reactions') as reactions_realtime, " +
          "(select count(*) from public.publication_comment_reactions) as reactions_rows",
        "--db-url",
        url,
      ],
      workdir
    );
    break;
  case "dry-run-publications-realtime": {
    // DRY-RUN TRANSACCIONAL de pending-migrations/v1.6/20261015000001 (publicaciones en Realtime): ejecuta la migración,
    // verifica el resultado (tabla publicada, RLS activa, replica identity DEFAULT, sin otras tablas nuevas) y termina
    // en la excepción centinela DRY_RUN_OK (todo revertido). SOLO con autorización.
    if (arg("--confirm") !== QA_PROJECT_REF) fail(`dry-run-publications-realtime exige --confirm ${QA_PROJECT_REF}.`);
    const migration = readFileSync(
      // Ya aplicada en QA (2026-10-13): repetir el dry-run es inocuo (la migración es idempotente).
      join(repoRoot, "supabase", "migrations", "20261015000001_v16_publications_realtime.sql"),
      "utf8"
    );
    if (/^\s*(commit|end\s+(transaction|work))\s*;/im.test(migration)) fail("el SQL contiene COMMIT / END TRANSACTION.");
    if (migration.includes("$dryrun$") || migration.includes("$mig$")) fail("el SQL contiene un delimitador reservado.");
    const sql = [
      "do $dryrun$",
      "declare v_before int; v_after int;",
      "begin",
      "  select count(*) into v_before from pg_publication_tables where pubname = 'supabase_realtime';",
      "  execute $mig$" + migration + "$mig$;",
      "  select count(*) into v_after from pg_publication_tables where pubname = 'supabase_realtime';",
      "  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'publications') then",
      "    raise exception 'FAIL RT1: publications no quedó en supabase_realtime';",
      "  end if;",
      "  if v_after <> v_before + 1 then raise exception 'FAIL RT2: cambió más de una tabla publicada (% → %)', v_before, v_after; end if;",
      "  if not exists (select 1 from pg_class where oid = 'public.publications'::regclass and relrowsecurity and relreplident = 'd') then",
      "    raise exception 'FAIL RT3: publications sin RLS o con replica identity distinta de DEFAULT';",
      "  end if;",
      "  -- Idempotencia: aplicar de nuevo no falla ni duplica.",
      "  execute $mig$" + migration + "$mig$;",
      "  raise exception 'DRY_RUN_OK: migración y verificaciones sin errores; transacción revertida';",
      "end",
      "$dryrun$;",
    ].join("\n");
    const dir = mkdtempSync(join(tmpdir(), "qa-dry-run-"));
    const file = join(dir, "dry_run_publications_realtime.sql");
    writeFileSync(file, sql, "utf8");
    try {
      console.log(`\n→ dry-run: supabase db query --file <temporal> --db-url ${redact(url)}\n`);
      const run = spawnSync(process.execPath, [cliEntry(), "db", "query", "--file", file, "--db-url", url, "--workdir", workdir], {
        encoding: "utf8",
        shell: false,
      });
      const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
      console.log(output.trim());
      const ok = output.includes("DRY_RUN_OK");
      console.log(ok ? "\n✔ Dry-run OK (revertido)." : "\n✖ Dry-run con errores (revertido igual).");
      console.log("  Confirmar después con: state-snapshot (solo lectura).");
      process.exitCode = ok ? 0 : 1;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    break;
  }
  case "internal-notes-status":
    // Consulta FIJA de solo lectura: ¿existe publications.internal_notes, cuántas filas tienen contenido y qué objetos
    // de la base la referencian (vistas, funciones, políticas)? No devuelve el contenido de las notas.
    runCli(
      [
        "db",
        "query",
        "select " +
          "exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'publications' and column_name = 'internal_notes') as column_exists, " +
          "(select count(*) from public.publications where nullif(btrim(internal_notes), '') is not null) as rows_with_notes, " +
          "(select count(*) from public.publications) as publications_total, " +
          "(select count(*) from information_schema.view_column_usage where table_schema = 'public' and table_name = 'publications' and column_name = 'internal_notes') as views_using, " +
          "(select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.prosrc ilike '%internal_notes%') as functions_using, " +
          "(select count(*) from pg_policies where schemaname = 'public' and (coalesce(qual, '') ilike '%internal_notes%' or coalesce(with_check, '') ilike '%internal_notes%')) as policies_using, " +
          "(select count(*) from pg_trigger t join pg_class c on c.oid = t.tgrelid where c.relname = 'publications' and not t.tgisinternal and pg_get_triggerdef(t.oid) ilike '%internal_notes%') as triggers_using",
        "--db-url",
        url,
      ],
      workdir
    );
    break;
  case "state-snapshot":
    // Consulta FIJA de solo lectura: "huella" del estado de v1.6 para comparar antes/después de un ensayo — políticas,
    // funciones (firma + ACL), triggers (estado), tablas en Realtime, columnas, flag y conteos de filas.
    runCli(
      [
        "db",
        "query",
        "select " +
          "(select md5(string_agg(tablename || ':' || policyname || ':' || cmd || ':' || coalesce(qual, '') || ':' || coalesce(with_check, ''), '|' order by tablename, policyname)) from pg_policies where schemaname = 'public') as policies_md5, " +
          "(select count(*) from pg_policies where schemaname = 'public') as policies_count, " +
          "(select md5(string_agg(p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')' || coalesce(p.proacl::text, ''), '|' order by p.proname, pg_get_function_identity_arguments(p.oid))) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public') as functions_md5, " +
          "(select count(*) from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public') as functions_count, " +
          "(select md5(string_agg(c.relname || '.' || t.tgname || ':' || t.tgenabled::text, '|' order by c.relname, t.tgname)) from pg_trigger t join pg_class c on c.oid = t.tgrelid join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and not t.tgisinternal) as triggers_md5, " +
          "(select tgenabled::text from pg_trigger where tgname = 'publications_status_event') as status_trigger, " +
          "(select string_agg(tablename, ',' order by tablename) from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public') as realtime_tables, " +
          "(select md5(string_agg(table_name || '.' || column_name || ':' || data_type, '|' order by table_name, column_name)) from information_schema.columns where table_schema = 'public') as columns_md5, " +
          "(select md5(string_agg(c.relname || ':' || coalesce(c.relacl::text, ''), '|' order by c.relname)) from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r') as table_grants_md5, " +
          "(select enabled::text || ':' || cardinality(client_ids) from public.planner_feature_flags where key = 'v16_notifications') as flag, " +
          "(select count(*) from supabase_migrations.schema_migrations) as migrations, " +
          "(select count(*) from public.publications) as publications, " +
          "(select count(*) from public.publication_comments) as comments, " +
          "(select count(*) from public.notifications) as notifications, " +
          "(select count(*) from public.publication_comment_reads) as comment_reads, " +
          "(select count(*) from public.publication_comment_reactions) as reactions, " +
          "(select count(*) from public.publication_status_events) as status_events, " +
          "(select count(*) from public.email_outbox) as outbox, " +
          "(select count(*) from public.email_outbox where status = 'cancelled') as outbox_cancelled",
        "--db-url",
        url,
      ],
      workdir
    );
    break;
  case "rehearse-rollback": {
    // ENSAYO TRANSACCIONAL de un bloque de supabase/rollback/v1.6/rollback_v16.sql (QA_STRATEGY.md §B11 paso 1).
    // Toma el SQL TAL CUAL del archivo (no una copia), lo ejecuta dentro de un DO con sus verificaciones y termina en la
    // excepción centinela ROLLBACK_REHEARSAL_OK: todo se revierte. SOLO con autorización.
    //   --block A  : A0–A5 + verificación A6 (flag apagado sin clientes, trigger 'D', 0 cron, 0 pendientes, 0 grants)
    //   --block CR | RX | RP : bloque parcial (descomentado), verificando que su objeto ya no existe
    if (arg("--confirm") !== QA_PROJECT_REF) fail(`rehearse-rollback exige --confirm ${QA_PROJECT_REF}.`);
    const block = arg("--block");
    const source = readFileSync(join(repoRoot, "supabase", "rollback", "v1.6", "rollback_v16.sql"), "utf8");
    const between = (start, end) => {
      const a = source.indexOf(start);
      const b = source.indexOf(end, a + start.length);
      if (a < 0 || b < 0) fail(`no se encontró el bloque "${start}" en rollback_v16.sql.`);
      return source.slice(a, b);
    };
    const uncomment = (text) => {
      const lines = text.split(/\r?\n/);
      const from = lines.findIndex((l) => l.trim() === "-- begin;");
      const to = lines.findIndex((l, i) => i > from && l.trim() === "-- commit;");
      if (from < 0 || to < 0) fail("el bloque parcial no tiene '-- begin;' / '-- commit;'.");
      return lines
        .slice(from + 1, to)
        .map((l) => l.replace(/^-- ?/, ""))
        .join("\n");
    };
    let body;
    let checks;
    if (block === "A") {
      body = between("-- A0)", "-- A6)");
      const a6 = between("-- A6)", "-- ============================================================\n-- R)")
        .split(/\r?\n/)
        .filter((l) => !/^\s*--/.test(l))
        .join("\n")
        .trim()
        .replace(/;\s*$/, "");
      checks = [
        "declare r record;",
        "begin",
        `  execute $a6$${a6}$a6$ into r;`,
        "  if r.flag_enabled is not false or r.flag_client_ids <> '{}'::uuid[] or r.trigger_state <> 'D' or r.cron_jobs <> 0",
        "     or r.outbox_pending <> 0 or r.v16_rpc_grants <> 0 then",
        "    raise exception 'FAIL A6: %', row_to_json(r);",
        "  end if;",
      ].join("\n");
    } else if (block === "CR" || block === "RX" || block === "RP" || block === "RT" || block === "PC" || block === "AR" || block === "EM") {
      const headers = { CR: "-- CR)", RX: "-- RX)", RP: "-- RP)", RT: "-- RT)", PC: "-- PC)", AR: "-- AR)", EM: "-- EM)" };
      const rest = source.slice(source.indexOf(headers[block]));
      const next = rest.slice(headers[block].length).search(/\n-- (CR|RX|RP|RT|IN|PC|AR|EM)\)/);
      body = uncomment(next < 0 ? rest : rest.slice(0, next + headers[block].length));
      const gone = {
        CR: "to_regclass('public.publication_comment_reads') is null and to_regprocedure('public.mark_publication_comments_read(uuid, uuid[])') is null",
        RX: "to_regclass('public.publication_comment_reactions') is null and to_regprocedure('public.set_comment_reaction(uuid, text, boolean)') is null",
        RP: "not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'publication_comments' and column_name = 'reply_to_comment_id') and to_regprocedure('public.add_publication_comment(uuid, text, uuid[], uuid)') is not null and to_regprocedure('public.add_publication_comment(uuid, text, uuid[], uuid, uuid)') is null",
        RT: "not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'publications')",
        PC: "to_regclass('public.publication_changes') is null and exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'publications')",
        AR: "not exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = 'publications' and column_name in ('archived_at', 'archived_by'))",
        EM: "to_regprocedure('public.collab_emails_enabled_for(uuid)') is null and not exists (select 1 from public.planner_feature_flags where key = 'v16_collab_emails') and not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname in ('enqueue_comment_digest', 'request_status_email') and p.prosrc ilike '%collab_emails_enabled_for%')",
      }[block];
      checks = ["begin", `  if not (${gone}) then raise exception 'FAIL ${block}: el bloque no dejó el estado esperado'; end if;`].join("\n");
    } else {
      fail("rehearse-rollback exige --block A | CR | RX | RP | RT | PC | AR | EM.");
    }
    if (/^\s*(commit|end\s+(transaction|work))\s*;/im.test(body)) fail("el bloque contiene COMMIT / END TRANSACTION.");
    if (body.includes("$rb$") || body.includes("$blk$")) fail("el bloque contiene un delimitador reservado.");
    const sql = [
      "do $rb$",
      // El bloque se ejecuta primero; después, sus verificaciones.
      // Reemplazo con FUNCIÓN: con un string, replace() interpreta "$$" (los `do $$` del bloque) como "$".
      checks.replace("begin", () => "begin\n  execute $blk$" + body + "$blk$;"),
      `  raise exception 'ROLLBACK_REHEARSAL_OK: bloque ${block} sin errores; transacción revertida';`,
      "end",
      "$rb$;",
    ].join("\n");
    const dir = mkdtempSync(join(tmpdir(), "qa-rollback-"));
    const file = join(dir, "rehearse_rollback.sql");
    writeFileSync(file, sql, "utf8");
    try {
      console.log(`\n→ ensayo del bloque ${block}: supabase db query --file <temporal> --db-url ${redact(url)}\n`);
      const run = spawnSync(process.execPath, [cliEntry(), "db", "query", "--file", file, "--db-url", url, "--workdir", workdir], {
        encoding: "utf8",
        shell: false,
      });
      const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
      console.log(output.trim());
      const ok = output.includes("ROLLBACK_REHEARSAL_OK");
      console.log(ok ? `\n✔ Bloque ${block}: OK (revertido).` : `\n✖ Bloque ${block}: con errores (revertido igual).`);
      console.log("  Confirmar después con: schema-status · flag-status · list (solo lectura).");
      process.exitCode = ok ? 0 : 1;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    break;
  }
  case "security-checks": {
    // Pruebas de seguridad (archivos fijos del repo) en UN statement: DO que las ejecuta y termina en la excepción
    // centinela CHECKS_OK — todo lo que crean (publicaciones, comentarios, notificaciones temporales) se revierte.
    // Una aserción fallida aborta antes con su propio "FAIL ..." (también revertido).
    if (arg("--confirm") !== QA_PROJECT_REF) fail(`security-checks exige --confirm ${QA_PROJECT_REF}.`);
    const suites = {
      archive: "security_checks_archive.sql",
      core: "security_checks.sql",
      "comment-reads": "security_checks_comment_reads.sql",
      "replies-reactions": "security_checks_replies_reactions.sql",
      "collab-emails": "security_checks_collab_emails.sql",
      "collab-integration": "integration_collab_emails_paused.sql",
    };
    const suite = arg("--suite");
    if (!suites[suite]) fail(`security-checks exige --suite ${Object.keys(suites).join(" | ")}.`);
    const checks = readFileSync(join(repoRoot, "supabase", "qa", "v1.6", suites[suite]), "utf8");
    const body = checks
      .replace(/^begin;\s*$/m, "-- (begin del archivo omitido: transacción del DO)")
      .replace(/^rollback;\s*$/m, "-- (rollback del archivo omitido: lo hace la excepción centinela)");
    if (/^\s*(commit|end\s+(transaction|work))\b/im.test(body)) fail("el SQL contiene COMMIT / END TRANSACTION.");
    if (body.includes("$chk$") || body.includes("$secchk$")) fail("el SQL contiene un delimitador reservado.");
    const sql = [
      "do $secchk$",
      "begin",
      "  execute $chk$" + body + "$chk$;",
      `  raise exception 'CHECKS_OK: ${suites[suite]} sin fallas; transacción revertida';`,
      "end",
      "$secchk$;",
    ].join("\n");
    const dir = mkdtempSync(join(tmpdir(), "qa-checks-"));
    const file = join(dir, "security_checks.sql");
    writeFileSync(file, sql, "utf8");
    try {
      console.log(`\n→ ${suites[suite]}: supabase db query --file <temporal> --db-url ${redact(url)}\n`);
      const run = spawnSync(process.execPath, [cliEntry(), "db", "query", "--file", file, "--db-url", url, "--workdir", workdir], {
        encoding: "utf8",
        shell: false,
      });
      const output = `${run.stdout ?? ""}${run.stderr ?? ""}`;
      console.log(output.trim());
      const ok = output.includes("CHECKS_OK");
      console.log(ok ? `\n✔ ${suites[suite]}: OK (revertido).` : `\n✖ ${suites[suite]}: con fallas (revertido igual).`);
      process.exitCode = ok ? 0 : 1;
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
    break;
  }
  case "flag-enable-qa-sandbox": {
    // Escritura FIJA (B8.4 de QA_STRATEGY.md): v16_notifications SOLO para QA Sandbox. No toca `enabled` (sigue false:
    // nunca activa para todos) y no hace nada si QA Sandbox no existe o si el flag ya estuviera activo para todos.
    if (arg("--confirm") !== QA_PROJECT_REF) fail(`flag-enable-qa-sandbox exige --confirm ${QA_PROJECT_REF}.`);
    runCli(
      [
        "db",
        "query",
        "update public.planner_feature_flags f set client_ids = array[c.id] from (select id from public.clients where slug = 'qa-sandbox') c where f.key = 'v16_notifications' and f.enabled = false returning f.key, f.enabled, cardinality(f.client_ids) as client_ids_count",
        "--db-url",
        url,
      ],
      workdir
    );
    break;
  }
  case "push": {
    const expectLast = arg("--expect-last");
    const confirm = arg("--confirm");
    if (!arg("--workdir")) fail("push exige --workdir explícito (raíz del checkout cuyas migraciones se aplican).");
    if (!expectLast) fail("push exige --expect-last <versión> (p. ej. 20260926000001 para la base v1.5.1).");
    const last = migrations.at(-1)?.slice(0, 14);
    if (last !== expectLast) fail(`la última migración local es ${last}, no ${expectLast}: ¿checkout equivocado?`);
    if (confirm !== QA_PROJECT_REF) fail(`push exige --confirm ${QA_PROJECT_REF}.`);
    runCli(["db", "push", "--db-url", url], workdir);
    break;
  }
  default:
    fail('comando desconocido. Usar: check | app-env | list | pg-version | push-dry | push | flag-status | flag-enable-qa-sandbox | notifications-recent | dry-run-comment-reads | dry-run-replies-reactions | dry-run-archive | dry-run-collab-emails | security-checks | schema-status | rehearse-rollback (ver encabezado del archivo).');
}
