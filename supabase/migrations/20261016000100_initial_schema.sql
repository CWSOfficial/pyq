-- PYQ Cloud initial data model. All user-owned data is protected by RLS.
create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  full_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  subject text not null,
  year smallint not null check (year between 1900 and 2100),
  exam text not null default 'UPSC CSE Prelims',
  topic text not null,
  prompt text not null,
  options jsonb not null check (jsonb_typeof(options) = 'array' and jsonb_array_length(options) >= 2),
  correct_option smallint not null check (correct_option >= 0),
  explanation text not null default '',
  question_number smallint,
  created_at timestamptz not null default now(),
  constraint questions_correct_option_in_range check (correct_option < jsonb_array_length(options))
);

create index if not exists questions_subject_year_idx on public.questions (subject, year desc);

create table if not exists public.bookmarks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (user_id, question_id)
);

create table if not exists public.question_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  selected_option smallint not null check (selected_option >= 0),
  is_correct boolean not null,
  duration_seconds integer check (duration_seconds is null or duration_seconds >= 0),
  attempted_at timestamptz not null default now()
);

create index if not exists question_attempts_user_date_idx on public.question_attempts (user_id, attempted_at desc);

create table if not exists public.notes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  title text not null default '',
  content text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  target_amount integer not null default 1 check (target_amount > 0),
  unit text not null default 'completion',
  active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (user_id, name)
);

create table if not exists public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  habit_id uuid not null references public.habits (id) on delete cascade,
  log_date date not null default current_date,
  completed boolean not null default true,
  amount integer not null default 1 check (amount >= 0),
  created_at timestamptz not null default now(),
  unique (user_id, habit_id, log_date)
);

alter table public.profiles enable row level security;
alter table public.questions enable row level security;
alter table public.bookmarks enable row level security;
alter table public.question_attempts enable row level security;
alter table public.notes enable row level security;
alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;

grant select on public.questions to anon, authenticated;
grant select, insert, update, delete on public.profiles, public.bookmarks, public.question_attempts, public.notes, public.habits, public.habit_logs to authenticated;

drop policy if exists "Questions are readable by everyone" on public.questions;
create policy "Questions are readable by everyone" on public.questions
  for select to anon, authenticated using (true);

drop policy if exists "Users can view their own profile" on public.profiles;
create policy "Users can view their own profile" on public.profiles
  for select to authenticated using ((select auth.uid()) = id);
drop policy if exists "Users can insert their own profile" on public.profiles;
create policy "Users can insert their own profile" on public.profiles
  for insert to authenticated with check ((select auth.uid()) = id);
drop policy if exists "Users can update their own profile" on public.profiles;
create policy "Users can update their own profile" on public.profiles
  for update to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);

drop policy if exists "Users manage their own bookmarks" on public.bookmarks;
create policy "Users manage their own bookmarks" on public.bookmarks
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users manage their own attempts" on public.question_attempts;
create policy "Users manage their own attempts" on public.question_attempts
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users manage their own notes" on public.notes;
create policy "Users manage their own notes" on public.notes
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users manage their own habits" on public.habits;
create policy "Users manage their own habits" on public.habits
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists "Users manage their own habit logs" on public.habit_logs;
create policy "Users manage their own habit logs" on public.habit_logs
  for all to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name')
  )
  on conflict (id) do update set email = excluded.email;
  return new;
end;
$$;

revoke all on function public.handle_new_user() from public, anon, authenticated;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

insert into public.questions (subject, year, topic, prompt, options, correct_option, explanation, question_number)
values
  ('Polity', 2023, 'Fundamental Rights', 'Which of the following statements about the Right to Equality is correct?', '["It is available only to citizens", "It is available to every person in India", "It can never be restricted", "It applies only to public employment"]'::jsonb, 1, 'Articles 14 to 18 use the term person in several guarantees, so this protection is not limited to citizens.', 1),
  ('History', 2022, 'Modern India', 'The first session of the Indian National Congress was held in which city?', '["Calcutta", "Madras", "Bombay", "Allahabad"]'::jsonb, 2, 'The first session was held in Bombay in December 1885, presided over by W. C. Bonnerjee.', 1),
  ('Geography', 2021, 'Indian Rivers', 'Which river is known as the Dakshin Ganga?', '["Krishna", "Godavari", "Kaveri", "Narmada"]'::jsonb, 1, 'The Godavari is the longest river of peninsular India and is often called the Dakshin Ganga.', 1)
on conflict do nothing;
