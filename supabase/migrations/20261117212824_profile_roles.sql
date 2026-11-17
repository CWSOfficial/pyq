-- Store authorization roles on each Supabase profile.
alter table public.profiles
  add column if not exists role text not null default 'user';

alter table public.profiles
  drop constraint if exists profiles_role_check;

alter table public.profiles
  add constraint profiles_role_check check (role in ('user', 'admin'));

-- Backfill profiles for any existing Auth users that predate the signup trigger.
insert into public.profiles (id, email, full_name)
select
  users.id,
  users.email,
  coalesce(users.raw_user_meta_data ->> 'full_name', users.raw_user_meta_data ->> 'name')
from auth.users as users
on conflict (id) do nothing;

-- Users may edit their own profile text, but only a trusted dashboard/server
-- context can create profiles or change the role column.
revoke insert, update on public.profiles from authenticated;
grant select on public.profiles to authenticated;
grant update (full_name, updated_at) on public.profiles to authenticated;
grant select, insert, update, delete on public.profiles to service_role;
