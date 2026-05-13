import { supabase } from '../lib/supabase';
import type { Bookmark, Question, QuestionType, UserState } from '../types';
import { QUESTIONS } from '../data/questions';

const EMPTY_PROGRESS: Record<QuestionType, number> = {
  N5V: 0,
  N5G: 0,
  N5R: 0,
  N5L: 0,
};

export function emptyUserState(): UserState {
  return {
    level: 1,
    xp: 0,
    streak: 0,
    progress: { ...EMPTY_PROGRESS },
    mistakeWeights: { ...EMPTY_PROGRESS },
    bookmarks: [],
    bookmarkedQuestions: [],
    history: [],
  };
}

function coerceProgress(raw: unknown): Record<QuestionType, number> {
  const base = { ...EMPTY_PROGRESS };
  if (!raw || typeof raw !== 'object') return base;
  for (const k of Object.keys(EMPTY_PROGRESS) as QuestionType[]) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === 'number' && !Number.isNaN(v)) base[k] = v;
  }
  return base;
}

function historyToMistakeWeights(
  history: UserState['history'],
): Record<QuestionType, number> {
  const out = { ...EMPTY_PROGRESS };
  for (const cat of Object.keys(EMPTY_PROGRESS) as QuestionType[]) {
    const typeHistory = history.filter((h) => h.type === cat);
    if (typeHistory.length === 0) {
      out[cat] = 0;
      continue;
    }
    const mistakes = typeHistory.filter((h) => !h.isCorrect).length;
    out[cat] = mistakes / typeHistory.length;
  }
  return out;
}

function hydrateQuestion(row: {
  question_id: string;
  question_snapshot: unknown;
}): Question | null {
  if (row.question_snapshot && typeof row.question_snapshot === 'object') {
    return row.question_snapshot as Question;
  }
  return QUESTIONS.find((q) => q.id === row.question_id) ?? null;
}

export async function loadCloudState(userId: string): Promise<{
  userState: UserState;
  hasSolvedAny: boolean;
}> {
  const [profileRes, historyRes, wordsRes, questionsRes] = await Promise.all([
    supabase.from('user_learning_profile').select('*').eq('user_id', userId).maybeSingle(),
    supabase
      .from('answer_history')
      .select('question_id, question_type, is_correct, answered_at')
      .eq('user_id', userId)
      .order('answered_at', { ascending: true })
      .limit(8000),
    supabase.from('word_bookmarks').select('word, meaning, created_at').eq('user_id', userId),
    supabase.from('question_bookmarks').select('question_id, question_snapshot').eq('user_id', userId),
  ]);

  const historyRows = historyRes.data ?? [];
  const history: UserState['history'] = historyRows.map((row) => ({
    questionId: row.question_id,
    type: row.question_type as QuestionType,
    isCorrect: row.is_correct,
    timestamp: new Date(row.answered_at).getTime(),
  }));

  const profile = profileRes.data;
  let userState: UserState;

  if (profile) {
    userState = {
      level: profile.level,
      xp: profile.xp,
      streak: profile.streak,
      progress: coerceProgress(profile.progress),
      mistakeWeights: coerceProgress(profile.mistake_weights),
      bookmarks: (wordsRes.data ?? []).map((w) => ({
        word: w.word,
        meaning: w.meaning ?? '',
        timestamp: new Date(w.created_at).getTime(),
      })),
      bookmarkedQuestions: (questionsRes.data ?? [])
        .map((r) => hydrateQuestion(r))
        .filter((q): q is Question => q != null),
      history,
    };
  } else {
    userState = {
      ...emptyUserState(),
      history,
      mistakeWeights: historyToMistakeWeights(history),
      bookmarks: (wordsRes.data ?? []).map((w) => ({
        word: w.word,
        meaning: w.meaning ?? '',
        timestamp: new Date(w.created_at).getTime(),
      })),
      bookmarkedQuestions: (questionsRes.data ?? [])
        .map((r) => hydrateQuestion(r))
        .filter((q): q is Question => q != null),
    };
    for (const h of history) {
      userState.progress[h.type] = (userState.progress[h.type] || 0) + 1;
      if (h.isCorrect) userState.xp += 20;
    }
    userState.level = Math.floor(userState.xp / 100) + 1;
    let streak = 0;
    for (const h of history) {
      streak = h.isCorrect ? streak + 1 : 0;
    }
    userState.streak = streak;
  }

  const solvedSum = Object.values(userState.progress).reduce((a, b) => a + b, 0);
  return {
    userState,
    hasSolvedAny: historyRows.length > 0 || solvedSum > 0,
  };
}

export async function upsertLearningProfile(userId: string, state: UserState) {
  const { error } = await supabase.from('user_learning_profile').upsert(
    {
      user_id: userId,
      level: state.level,
      xp: state.xp,
      streak: state.streak,
      progress: state.progress,
      mistake_weights: state.mistakeWeights,
    },
    { onConflict: 'user_id' },
  );
  if (error) console.error('upsertLearningProfile', error);
}

export async function insertAnswerHistory(
  userId: string,
  questionId: string,
  questionType: QuestionType,
  isCorrect: boolean,
) {
  const { error } = await supabase.from('answer_history').insert({
    user_id: userId,
    question_id: questionId,
    question_type: questionType,
    is_correct: isCorrect,
  });
  if (error) console.error('insertAnswerHistory', error);
}

export async function syncWordBookmark(
  userId: string,
  word: string,
  meaning: string,
  add: boolean,
) {
  if (add) {
    const { error } = await supabase.from('word_bookmarks').upsert(
      { user_id: userId, word, meaning: meaning || '' },
      { onConflict: 'user_id,word' },
    );
    if (error) console.error('syncWordBookmark upsert', error);
  } else {
    const { error } = await supabase.from('word_bookmarks').delete().eq('user_id', userId).eq('word', word);
    if (error) console.error('syncWordBookmark delete', error);
  }
}

export async function syncQuestionBookmark(userId: string, question: Question, add: boolean) {
  if (add) {
    const inCatalog = QUESTIONS.some((q) => q.id === question.id);
    const snapshot = inCatalog ? null : JSON.parse(JSON.stringify(question));
    const { error } = await supabase.from('question_bookmarks').upsert(
      {
        user_id: userId,
        question_id: question.id,
        question_snapshot: snapshot,
      },
      { onConflict: 'user_id,question_id' },
    );
    if (error) console.error('syncQuestionBookmark upsert', error);
  } else {
    const { error } = await supabase
      .from('question_bookmarks')
      .delete()
      .eq('user_id', userId)
      .eq('question_id', question.id);
    if (error) console.error('syncQuestionBookmark delete', error);
  }
}

export async function resetCloudLearning(userId: string) {
  await supabase.from('answer_history').delete().eq('user_id', userId);
  await supabase.from('word_bookmarks').delete().eq('user_id', userId);
  await supabase.from('question_bookmarks').delete().eq('user_id', userId);
  await supabase.from('user_learning_profile').upsert(
    {
      user_id: userId,
      level: 1,
      xp: 0,
      streak: 0,
      progress: { ...EMPTY_PROGRESS },
      mistake_weights: { ...EMPTY_PROGRESS },
    },
    { onConflict: 'user_id' },
  );
  const { error } = await supabase.from('profiles').update({ total_answer_events: 0 }).eq('id', userId);
  if (error) console.error('resetCloudLearning profiles', error);
}
