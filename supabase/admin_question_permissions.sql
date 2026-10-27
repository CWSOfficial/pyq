-- Run once in the SQL Editor for the Supabase project used by this app.
-- Admin writes only run in the server route after a verified email allowlist check.
-- Keep SUPABASE_SECRET_KEY server-side; never put it in a NEXT_PUBLIC_ variable.
grant select, insert, update, delete on table public.questions to service_role;
grant select on table public.bookmarks, public.question_attempts to service_role;
