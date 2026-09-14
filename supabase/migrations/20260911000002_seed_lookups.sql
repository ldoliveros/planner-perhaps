-- Seeds iniciales. platforms son solo los canales de arranque — se pueden
-- agregar más (TikTok, X, Blog, Newsletter, ...) desde administración sin
-- tocar el esquema de publications.
insert into public.platforms (name, slug, icon, color, requires_account_type, sort_order) values
  ('Instagram', 'instagram', 'instagram', '#E4405F', true, 1),
  ('Facebook', 'facebook', 'facebook', '#1877F2', true, 2),
  ('LinkedIn', 'linkedin', 'linkedin', '#0A66C2', true, 3)
on conflict (slug) do nothing;

insert into public.account_types (name, slug, sort_order) values
  ('Empresa', 'empresa', 1),
  ('Personal', 'personal', 2)
on conflict (slug) do nothing;

insert into public.content_types (key, label, sort_order) values
  ('post', 'Post', 1),
  ('reel', 'Reel', 2),
  ('story', 'Story', 3),
  ('carousel', 'Carrusel', 4),
  ('video', 'Video', 5),
  ('article', 'Artículo', 6),
  ('other', 'Otro', 7)
on conflict (key) do nothing;

insert into public.statuses (key, label, color, sort_order, is_default) values
  ('idea', 'Idea', '#94A3B8', 1, true),
  ('in_production', 'En producción', '#3B82F6', 2, false),
  ('in_review', 'Listo para revisión', '#F59E0B', 3, false),
  ('approved', 'Aprobado', '#8B5CF6', 4, false),
  ('published', 'Publicado', '#22C55E', 5, false),
  ('cancelled', 'Cancelado', '#EF4444', 6, false)
on conflict (key) do nothing;
