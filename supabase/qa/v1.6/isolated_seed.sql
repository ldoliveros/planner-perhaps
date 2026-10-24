-- v1.6 — Datos ficticios mínimos para un proyecto Supabase AISLADO de QA (nunca para producción).
--
-- NO es una migración. Se ejecuta UNA vez en el SQL Editor del proyecto aislado, DESPUÉS de reproducir el
-- esquema de v1.5.1 (todas las migraciones hasta 20260926000001) y ANTES de aplicar las de v1.6 — así el
-- proyecto aislado queda igual que producción antes de F1. Procedimiento completo: QA_STRATEGY.md §B.
--
-- Guardas (aborta sin cambios si algo no cuadra):
--   * La base tiene que estar VACÍA de clientes: producción tiene clientes, así que este script no puede
--     ejecutarse ahí por error.
--   * Los 4 usuarios tienen que existir en Auth (creados antes desde Dashboard → Authentication → Add user, con
--     "Auto Confirm User"). El trigger handle_new_user ya les creó su fila en profiles (role 'client').
--   * Los lookups sembrados por las migraciones (platforms, content_types, statuses) tienen que estar.
--
-- Contraseñas: se eligen al crear los usuarios en el Dashboard del proyecto aislado; no se guardan en el repo.
-- Todo es ficticio: emails @perhaps-planner-qa.com, ningún dato de clientes reales.

do $$
declare
  v_sa uuid; v_am uuid; v_cu uuid; v_cu2 uuid;
  v_qa uuid; v_other uuid;
  v_cal_general uuid; v_cal_alt uuid; v_cal_other uuid;
  v_ig uuid; v_fb uuid; v_li uuid;
  v_acc_ig uuid; v_acc_ig_alt uuid; v_acc_fb uuid; v_acc_li uuid; v_acc_other uuid;
  v_campaign uuid;
  v_post uuid; v_reel uuid;
  v_draft uuid; v_review uuid; v_approved uuid; v_published uuid;
  v_pub uuid;
begin
  if exists (select 1 from public.clients) then
    raise exception 'isolated_seed: la base ya tiene clientes — este script es solo para un proyecto aislado vacío; abortado.';
  end if;

  select id into v_sa from auth.users where email = 'qa-super-admin@perhaps-planner-qa.com';
  select id into v_am from auth.users where email = 'qa-account-manager@perhaps-planner-qa.com';
  select id into v_cu from auth.users where email = 'qa-client-user@perhaps-planner-qa.com';
  select id into v_cu2 from auth.users where email = 'qa-other-client-user@perhaps-planner-qa.com';
  if v_sa is null or v_am is null or v_cu is null or v_cu2 is null then
    raise exception 'isolated_seed: faltan usuarios en Auth (crear los 4 desde el Dashboard con Auto Confirm); abortado.';
  end if;
  if (select count(*) from public.profiles where id in (v_sa, v_am, v_cu, v_cu2)) <> 4 then
    raise exception 'isolated_seed: faltan filas en profiles (¿trigger handle_new_user?); abortado.';
  end if;

  select id into v_ig from public.platforms where slug = 'instagram';
  select id into v_fb from public.platforms where slug = 'facebook';
  select id into v_li from public.platforms where slug = 'linkedin';
  select id into v_post from public.content_types where key = 'post';
  select id into v_reel from public.content_types where key = 'reel';
  select id into v_draft from public.statuses where key = 'draft';
  select id into v_review from public.statuses where key = 'in_review';
  select id into v_approved from public.statuses where key = 'approved';
  select id into v_published from public.statuses where key = 'published';
  if v_ig is null or v_fb is null or v_li is null or v_post is null or v_draft is null or v_review is null
     or v_approved is null or v_published is null then
    raise exception 'isolated_seed: faltan lookups (¿se aplicaron todas las migraciones de v1.5.1?); abortado.';
  end if;

  -- Clientes: el de QA (mismo slug que en producción) y uno "ajeno" para las pruebas negativas.
  insert into public.clients (name, slug, color, active) values ('QA Sandbox', 'qa-sandbox', '#16A34A', true)
    returning id into v_qa;
  insert into public.clients (name, slug, color, active) values ('QA Otro Cliente', 'qa-otro-cliente', '#3B82F6', true)
    returning id into v_other;

  insert into public.calendars (client_id, name, slug, status) values (v_qa, 'QA General', 'qa-general', 'active')
    returning id into v_cal_general;
  insert into public.calendars (client_id, name, slug, status) values (v_qa, 'QA Alterno', 'qa-alterno', 'active')
    returning id into v_cal_alt;
  insert into public.calendars (client_id, name, slug, status) values (v_other, 'Otro General', 'otro-general', 'active')
    returning id into v_cal_other;

  -- Cuentas: handle obligatorio y SIN @ (mismo set que el QA Sandbox de producción, ver CLAUDE.md).
  insert into public.client_accounts (client_id, platform_id, handle, sort_order) values (v_qa, v_ig, 'qa.sandbox', 1)
    returning id into v_acc_ig;
  insert into public.client_accounts (client_id, platform_id, handle, sort_order) values (v_qa, v_ig, 'qa.sandbox.alt', 2)
    returning id into v_acc_ig_alt;
  insert into public.client_accounts (client_id, platform_id, name, handle, sort_order) values (v_qa, v_fb, 'QA Sandbox', 'qa.sandbox', 3)
    returning id into v_acc_fb;
  insert into public.client_accounts (client_id, platform_id, handle, sort_order) values (v_qa, v_li, 'qa-sandbox', 4)
    returning id into v_acc_li;
  insert into public.client_accounts (client_id, platform_id, handle, sort_order) values (v_other, v_ig, 'otro.cliente', 1)
    returning id into v_acc_other;

  insert into public.campaigns (client_id, name) values (v_qa, 'QA Lanzamiento') returning id into v_campaign;

  -- Roles: SQL directo (postgres) → protect_profiles permite cambiar role/client_id (auth.role() no es de usuario).
  update public.profiles set role = 'super_admin', client_id = null, full_name = 'QA Super Admin' where id = v_sa;
  update public.profiles set role = 'account_manager', client_id = null, full_name = 'QA Account Manager' where id = v_am;
  update public.profiles set role = 'client', client_id = v_qa, full_name = 'QA Client User' where id = v_cu;
  update public.profiles set role = 'client', client_id = v_other, full_name = 'QA Otro Cliente User' where id = v_cu2;

  -- Asignaciones: AM solo a QA Sandbox (como en producción). El Super Admin queda SIN asignar a propósito, para
  -- probar que comenta pero no aparece como mencionable; asignarlo a mano para el caso contrario.
  insert into public.user_client_assignments (user_id, client_id, created_by) values (v_am, v_qa, v_sa);

  -- Publicaciones de ejemplo en distintos estados (la de En revisión es la base del QA de comentarios).
  insert into public.publications (calendar_id, client_id, title, publication_date, content_type_id, status_id, campaign_id, copy)
    values (v_cal_general, v_qa, 'QA Borrador', current_date + 1, v_post, v_draft, v_campaign, 'Texto de prueba (borrador).')
    returning id into v_pub;
  insert into public.publication_destinations (publication_id, client_account_id) values (v_pub, v_acc_ig);

  insert into public.publications (calendar_id, client_id, title, publication_date, content_type_id, status_id, campaign_id, copy)
    values (v_cal_general, v_qa, 'QA En revisión', current_date + 2, v_post, v_review, v_campaign, 'Texto de prueba para comentar.')
    returning id into v_pub;
  insert into public.publication_destinations (publication_id, client_account_id) values (v_pub, v_acc_ig), (v_pub, v_acc_fb);

  insert into public.publications (calendar_id, client_id, title, publication_date, content_type_id, status_id, copy)
    values (v_cal_alt, v_qa, 'QA Aprobada', current_date + 3, v_reel, v_approved, 'Texto de prueba (aprobada).')
    returning id into v_pub;
  insert into public.publication_destinations (publication_id, client_account_id) values (v_pub, v_acc_li);

  insert into public.publications (calendar_id, client_id, title, publication_date, content_type_id, status_id, copy)
    values (v_cal_other, v_other, 'Otro cliente — no debe verse desde QA Sandbox', current_date + 2, v_post, v_review, 'Ajeno.')
    returning id into v_pub;
  insert into public.publication_destinations (publication_id, client_account_id) values (v_pub, v_acc_other);

  raise notice 'isolated_seed: OK — 2 clientes, 3 calendarios, 5 cuentas, 1 campaña, 4 publicaciones, 4 perfiles.';
end $$;
