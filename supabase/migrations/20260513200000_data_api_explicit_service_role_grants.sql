-- Supabase Data API (PostgREST): explicit privileges for service_role.
-- See Supabase notice (May 2026): new projects require explicit GRANTs on public tables;
-- authenticated grants were already set in prior migrations; service_role was not.

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_learning_profile TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.word_bookmarks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_bookmarks TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.answer_history TO service_role;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.profiles TO service_role;
