-- 세션 이어하기: 마지막으로 보던 문제 버퍼·인덱스·선택 상태
ALTER TABLE public.user_learning_profile
  ADD COLUMN IF NOT EXISTS session_resume jsonb;
