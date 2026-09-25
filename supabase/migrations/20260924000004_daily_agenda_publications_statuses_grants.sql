-- Corrige un GRANT faltante detectado al probar daily-agenda (Etapa 2): service_role no podía
-- leer publications ni statuses. El gap de publications ya estaba documentado como pendiente en
-- 20260918000001_campaigns.sql ("hallazgo detectado en la auditoría de Campaña — queda pendiente,
-- deliberadamente fuera de esta migración"); el de statuses no se había necesitado hasta ahora
-- porque ningún flujo con service_role la había consultado antes de daily-agenda.

grant select on public.publications to service_role;
grant select on public.statuses to service_role;
