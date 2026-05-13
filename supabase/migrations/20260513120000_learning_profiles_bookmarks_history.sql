-- jlptsnack: 학습 프로필, 단어/문제 북마크, 답안 이력
-- 전제: Supabase Auth 로그인(익명 포함). RLS는 auth.uid() 기준.

-- ---------------------------------------------------------------------------
-- 1) 학습 프로필 (UserState 중 서버에 두기 좋은 스칼라/집계)
--    history 전량은 answer_history 로 이전 가능; mistake_weights 는
--    클라이언트 재계산 또는 서버에서 주기적 갱신.
-- ---------------------------------------------------------------------------
CREATE TABLE public.user_learning_profile (
  user_id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  level integer NOT NULL DEFAULT 1,
  xp integer NOT NULL DEFAULT 0,
  streak integer NOT NULL DEFAULT 0,
  progress jsonb NOT NULL DEFAULT '{"N5V": 0, "N5G": 0, "N5R": 0, "N5L": 0}'::jsonb,
  mistake_weights jsonb NOT NULL DEFAULT '{"N5V": 0, "N5G": 0, "N5R": 0, "N5L": 0}'::jsonb,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT user_learning_profile_progress_object CHECK (jsonb_typeof(progress) = 'object'),
  CONSTRAINT user_learning_profile_mistake_object CHECK (jsonb_typeof(mistake_weights) = 'object')
);

CREATE OR REPLACE FUNCTION public.set_user_learning_profile_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_user_learning_profile_updated_at
  BEFORE UPDATE ON public.user_learning_profile
  FOR EACH ROW
  EXECUTE FUNCTION public.set_user_learning_profile_updated_at();

-- ---------------------------------------------------------------------------
-- 2) 단어 북마크 (Bookmark: word, meaning)
-- ---------------------------------------------------------------------------
CREATE TABLE public.word_bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  word text NOT NULL,
  meaning text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT word_bookmarks_word_nonempty CHECK (length(trim(word)) > 0),
  CONSTRAINT word_bookmarks_unique_user_word UNIQUE (user_id, word)
);

CREATE INDEX idx_word_bookmarks_user_created ON public.word_bookmarks (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 3) 문제 북마크 — 정적 문제는 question_id 만으로 복원 가능,
--    Gemini 생성 문제는 question_snapshot 에 전체 Question JSON 저장 권장.
-- ---------------------------------------------------------------------------
CREATE TABLE public.question_bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  question_id text NOT NULL,
  question_snapshot jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT question_bookmarks_id_nonempty CHECK (length(trim(question_id)) > 0),
  CONSTRAINT question_bookmarks_unique_user_qid UNIQUE (user_id, question_id)
);

CREATE INDEX idx_question_bookmarks_user_created ON public.question_bookmarks (user_id, created_at DESC);

-- ---------------------------------------------------------------------------
-- 4) 답안 이력 (history[] — 동기화·분석용 append-only 에 가깝게)
-- ---------------------------------------------------------------------------
CREATE TABLE public.answer_history (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES auth.users (id) ON DELETE CASCADE,
  question_id text NOT NULL,
  question_type text NOT NULL,
  is_correct boolean NOT NULL,
  answered_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT answer_history_type CHECK (
    question_type IN ('N5V', 'N5G', 'N5R', 'N5L')
  )
);

CREATE INDEX idx_answer_history_user_time ON public.answer_history (user_id, answered_at DESC);
CREATE INDEX idx_answer_history_user_type ON public.answer_history (user_id, question_type);

-- ---------------------------------------------------------------------------
-- 5) RLS
-- ---------------------------------------------------------------------------
ALTER TABLE public.user_learning_profile ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.word_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.question_bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.answer_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_learning_profile_select_own ON public.user_learning_profile
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY user_learning_profile_insert_own ON public.user_learning_profile
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_learning_profile_update_own ON public.user_learning_profile
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY user_learning_profile_delete_own ON public.user_learning_profile
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY word_bookmarks_select_own ON public.word_bookmarks
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY word_bookmarks_insert_own ON public.word_bookmarks
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY word_bookmarks_update_own ON public.word_bookmarks
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY word_bookmarks_delete_own ON public.word_bookmarks
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY question_bookmarks_select_own ON public.question_bookmarks
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY question_bookmarks_insert_own ON public.question_bookmarks
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY question_bookmarks_update_own ON public.question_bookmarks
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY question_bookmarks_delete_own ON public.question_bookmarks
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY answer_history_select_own ON public.answer_history
  FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY answer_history_insert_own ON public.answer_history
  FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY answer_history_update_own ON public.answer_history
  FOR UPDATE TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY answer_history_delete_own ON public.answer_history
  FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_learning_profile TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.word_bookmarks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.question_bookmarks TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.answer_history TO authenticated;
