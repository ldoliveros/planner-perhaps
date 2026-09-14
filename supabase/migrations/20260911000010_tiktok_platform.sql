-- Suma TikTok como canal disponible.
insert into public.platforms (name, slug, icon, color, requires_account_type, sort_order) values
  ('TikTok', 'tiktok', 'tiktok', '#000000', true, 8)
on conflict (slug) do nothing;
