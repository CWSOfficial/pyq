create table if not exists public.app_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

alter table public.app_settings enable row level security;
grant select on public.app_settings to anon, authenticated;
drop policy if exists "Public can read music configuration" on public.app_settings;
create policy "Public can read music configuration" on public.app_settings
  for select to anon, authenticated using (key = 'music');

insert into public.app_settings (key, value)
values ('music', '{"enabled":true,"trackUrl":"/audio/pyq-focus.wav","volume":0.28}'::jsonb)
on conflict (key) do nothing;
