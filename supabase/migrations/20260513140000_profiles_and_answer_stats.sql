-- 회원 가입 시각(profiles) + 풀이 건수 집계
-- answer_history / word_bookmarks 는 기존 테이블로 "누가 어떤 문제를 언제" / "누가 어떤 단어를" 조회

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  joined_at timestamptz NOT NULL,
  total_answer_events integer NOT NULL DEFAULT 0
);

CREATE INDEX idx_profiles_joined_at ON public.profiles (joined_at DESC);

INSERT INTO public.profiles (id, joined_at, total_answer_events)
SELECT u.id, u.created_at, 0
FROM auth.users AS u
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.handle_new_user_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, joined_at, total_answer_events)
  VALUES (NEW.id, NEW.created_at, 0)
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created_profile
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user_profile();

CREATE OR REPLACE FUNCTION public.bump_profile_answer_count()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, joined_at, total_answer_events)
  VALUES (NEW.user_id, now(), 1)
  ON CONFLICT (id) DO UPDATE
  SET total_answer_events = public.profiles.total_answer_events + 1;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_answer_history_bump_profile
  AFTER INSERT ON public.answer_history
  FOR EACH ROW
  EXECUTE FUNCTION public.bump_profile_answer_count();

UPDATE public.profiles p
SET total_answer_events = s.cnt
FROM (
  SELECT user_id, COUNT(*)::integer AS cnt
  FROM public.answer_history
  GROUP BY user_id
) s
WHERE p.id = s.user_id;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (auth.uid() = id);

GRANT SELECT ON public.profiles TO authenticated;

REVOKE ALL ON FUNCTION public.handle_new_user_profile() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.bump_profile_answer_count() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.handle_new_user_profile() FROM anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.bump_profile_answer_count() FROM anon, authenticated;
