#!/usr/bin/env node
// v1.6 — Genera el script de DRY-RUN transaccional de F1 (no ejecuta nada, solo imprime SQL).
//
//   node supabase/qa/v1.6/build-dry-run.mjs            > dry_run_f1.sql   (core + pruebas de seguridad)
//   node supabase/qa/v1.6/build-dry-run.mjs --worker   > dry_run_f1.sql   (además, RPCs del worker de F5)
//
// El SQL resultante aplica la migración y corre security_checks.sql DENTRO de una sola transacción que termina
// en ROLLBACK: valida sintaxis, grants, RLS, RPCs y el trigger contra el esquema y los datos reales de QA
// Sandbox, sin dejar rastro. Se pega en el SQL Editor SOLO con autorización (ver supabase/qa/v1.6/QA_STRATEGY.md).
// Siempre se genera desde los archivos actuales, así nunca queda desincronizado de la migración.
// Efectos que el ROLLBACK NO revierte (locks durante la transacción, secuencia de pg_graphql, logs, historial del
// SQL Editor): ver QA_STRATEGY.md §A. El script no incluye Realtime, cron, extensiones ni llamadas HTTP.
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const read = (relative) => readFileSync(join(root, relative), "utf8");

const core = read("migrations/20261008000001_v16_collab_core.sql");
const worker = process.argv.includes("--worker")
  ? read("pending-migrations/v1.6/20261008000003_v16_email_outbox_worker.sql")
  : "";
const checks = read("qa/v1.6/security_checks.sql");

// security_checks.sql trae su propio begin/rollback: acá se usa la transacción externa.
const checksBody = checks.replace(/^begin;\s*$/m, "-- (begin del archivo omitido: transacción externa)").replace(
  /^rollback;\s*$/m,
  "-- (rollback del archivo omitido: transacción externa)"
);
if (checksBody === checks) {
  console.error("No se encontraron begin;/rollback; en security_checks.sql — revisar antes de usar.");
  process.exit(1);
}

process.stdout.write(`-- DRY-RUN v1.6 F1 — generado ${new Date().toISOString()} desde los archivos de la rama.
-- TODO corre en una transacción que termina en ROLLBACK: no deja tablas, funciones, trigger ni datos.
-- Si algo falla, el editor muestra el error y la transacción queda abortada: ejecutar \`rollback;\` y la
-- verificación del final del archivo QA_STRATEGY.md.
begin;
-- No esperar locks (si alguien está guardando una publicación, falla rápido en vez de bloquear la app).
set local lock_timeout = '3s';
set local statement_timeout = '120s';

${core}

${worker}

${checksBody}

rollback;
-- Verificación posterior (debe devolver todo null / false):
select to_regclass('public.notifications') as notifications_table,
       to_regclass('public.publication_comments') as comments_table,
       exists (select 1 from pg_trigger where tgname = 'publications_status_event') as trigger_exists;
`);
