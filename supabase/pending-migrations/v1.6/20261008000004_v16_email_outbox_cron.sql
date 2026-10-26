-- v1.6 — F5: Supabase Cron que dispara el worker de emails cada 15 minutos.
--
-- PREPARADA, NO APLICADA. Fuera de supabase/migrations/ hasta autorización explícita.
-- Orden obligatorio: 20261008000003 aplicada -> Edge Function `email-outbox` desplegada y probada ->
-- secrets de Vault creados -> recién entonces esta migración.
--
-- Precondiciones (la migración aborta si faltan, sin crear nada):
--   * Extensiones pg_cron y pg_net habilitadas (confirmado disponible en el plan Free).
--   * Vault: secret `planner_project_url` (https://<ref>.supabase.co) y `planner_email_outbox_key` (la
--     secret key que acepta withSupabase({ auth: 'secret' }), igual que daily-agenda). Se crean a mano
--     desde el Dashboard (nunca en un archivo versionado).
--
-- '*/15 * * * *' = 96 invocaciones/día (~2.900/mes) + los disparos inmediatos de avisos.
-- pg_net es asíncrono: el job solo encola el request HTTP; la respuesta queda en net._http_response.
-- Rollback: select cron.unschedule('planner-email-outbox');
do $$
begin
  if not exists (select 1 from pg_extension where extname = 'pg_cron') then
    raise exception 'v16_email_outbox_cron: falta la extensión pg_cron; abortado.';
  end if;
  if not exists (select 1 from pg_extension where extname = 'pg_net') then
    raise exception 'v16_email_outbox_cron: falta la extensión pg_net; abortado.';
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'planner_project_url') then
    raise exception 'v16_email_outbox_cron: falta el secret de Vault planner_project_url; abortado.';
  end if;
  if not exists (select 1 from vault.decrypted_secrets where name = 'planner_email_outbox_key') then
    raise exception 'v16_email_outbox_cron: falta el secret de Vault planner_email_outbox_key; abortado.';
  end if;
end $$;

-- cron.schedule con un nombre existente actualiza el job (idempotente).
select cron.schedule(
  'planner-email-outbox',
  '*/15 * * * *',
  $cmd$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'planner_project_url')
           || '/functions/v1/email-outbox',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', (select decrypted_secret from vault.decrypted_secrets where name = 'planner_email_outbox_key')
    ),
    body := jsonb_build_object('source', 'cron'),
    timeout_milliseconds := 10000
  );
  $cmd$
);
