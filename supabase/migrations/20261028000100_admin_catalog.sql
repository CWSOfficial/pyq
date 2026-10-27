-- Public users can read active practice catalog items. Only the verified admin
-- server routes write the JSON catalogue with the server-only Supabase key.
drop policy if exists "Public can read practice catalogue" on public.app_settings;
create policy "Public can read practice catalogue" on public.app_settings
  for select to anon, authenticated using (key = 'catalog');

insert into public.app_settings (key, value)
values (
  'catalog',
  '{"subjects":[{"value":"Polity","active":true},{"value":"Economy","active":true},{"value":"Geography","active":true},{"value":"History","active":true},{"value":"Art and Culture","active":true},{"value":"International relations","active":true},{"value":"Science and Technology","active":true},{"value":"Environment","active":true},{"value":"Current Affairs","active":true},{"value":"Miscellaneous","active":true}],"years":[{"value":"2026","active":true},{"value":"2025","active":true},{"value":"2024","active":true},{"value":"2023","active":true},{"value":"2022","active":true},{"value":"2021","active":true},{"value":"2020","active":true},{"value":"2019","active":true},{"value":"2018","active":true},{"value":"2017","active":true},{"value":"2016","active":true},{"value":"2015","active":true},{"value":"2014","active":true},{"value":"2013","active":true},{"value":"2012","active":true},{"value":"2011","active":true}]}'::jsonb
)
on conflict (key) do nothing;
