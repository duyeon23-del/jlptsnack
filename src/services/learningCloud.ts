import { supabase } from '../lib/supabase';
import type { Bookmark, Question, QuestionType, SessionResume, UserState } from '../types';
import { QUESTIONS } from '../data/questions';

const SESSION_STORAGE_PREFIX = 'jlptsnack_session_resume_v1:';

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

function parseMinimalQuestion(raw: unknown): Question | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const id = typeof o.id === 'string' ? o.id : null;
  const type = o.type as QuestionType;
  const title = typeof o.title === 'string' ? o.title : null;
  const question = typeof o.question === 'string' ? o.question : null;
  const options = o.options;
  const answerIndex = o.answerIndex;
  const explanation = typeof o.explanation === 'string' ? o.explanation : null;
  const tip = typeof o.tip === 'string' ? o.tip : null;
  const difficulty = typeof o.difficulty === 'number' ? o.difficulty : null;
  const keywords = o.keywords;
  if (
    !id ||
    (type !== 'N5V' && type !== 'N5G' && type !== 'N5R' && type !== 'N5L') ||
    !title ||
    !question ||
    !Array.isArray(options) ||
    !options.every((x) => typeof x === 'string') ||
    typeof answerIndex !== 'number' ||
    answerIndex < 0 ||
    answerIndex >= options.length ||
    !explanation ||
    !tip ||
    typeof difficulty !== 'number' ||
    !Array.isArray(keywords) ||
    !keywords.every((x) => typeof x === 'string')
  ) {
    return null;
  }
  const context = typeof o.context === 'string' ? o.context : undefined;
  return {
    id,
    type,
    title,
    context,
    question,
    options: options as string[],
    answerIndex,
    explanation,
    tip,
    difficulty,
    keywords: keywords as string[],
  };
}

export function parseSessionResume(raw: unknown): SessionResume | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const buf = o.questionBuffer;
  if (!Array.isArray(buf) || buf.length === 0) return null;
  const questionBuffer: Question[] = [];
  for (const item of buf) {
    const q = parseMinimalQuestion(item);
    if (!q) return null;
    questionBuffer.push(q);
  }
  let currentIdx = typeof o.currentIdx === 'number' && Number.isFinite(o.currentIdx) ? Math.floor(o.currentIdx) : 0;
  currentIdx = Math.max(0, Math.min(currentIdx, questionBuffer.length - 1));
  const curOpts = questionBuffer[currentIdx]!.options;
  let safeSelected: number | null = null;
  if (typeof o.selectedOption === 'number' && Number.isInteger(o.selectedOption)) {
    const si = o.selectedOption;
    if (si >= 0 && si < curOpts.length) safeSelected = si;
  }
  const isLocked = o.isLocked === true && safeSelected !== null;
  const updatedAt =
    typeof o.updatedAt === 'number' && Number.isFinite(o.updatedAt) ? o.updatedAt : 0;
  return {
    questionBuffer,
    currentIdx,
    selectedOption: safeSelected,
    isLocked,
    updatedAt,
  };
}

export function pickNewerSessionResume(
  a: SessionResume | null,
  b: SessionResume | null,
): SessionResume | null {
  if (!a) return b;
  if (!b) return a;
  return a.updatedAt >= b.updatedAt ? a : b;
}

export function readSessionResumeFromStorage(userId: string): SessionResume | null {
  try {
    const raw = sessionStorage.getItem(`${SESSION_STORAGE_PREFIX}${userId}`);
    if (!raw) return null;
    return parseSessionResume(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function writeSessionResumeToStorage(userId: string, session: SessionResume): void {
  try {
    sessionStorage.setItem(`${SESSION_STORAGE_PREFIX}${userId}`, JSON.stringify(session));
  } catch {
    /* quota / private mode */
  }
}

export function clearSessionResumeStorage(userId: string): void {
  try {
    sessionStorage.removeItem(`${SESSION_STORAGE_PREFIX}${userId}`);
  } catch {
    /* ignore */
  }
}

export async function saveSessionResumeRemote(userId: string, session: SessionResume): Promise<void> {
  const { data: row, error: selErr } = await supabase
    .from('user_learning_profile')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle();
  if (selErr) {
    console.error('saveSessionResumeRemote select', selErr);
    return;
  }
  if (!row) return;
  const { error } = await supabase
    .from('user_learning_profile')
    .update({ session_resume: session })
    .eq('user_id', userId);
  if (error) console.error('saveSessionResumeRemote update', error);
}

export async function clearSessionResumeRemote(userId: string): Promise<void> {
  const { error } = await supabase
    .from('user_learning_profile')
    .update({ session_resume: null })
    .eq('user_id', userId);
  if (error) console.error('clearSessionResumeRemote', error);
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
  sessionResume: SessionResume | null;
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
  const profileRow = profile as { session_resume?: unknown } | null;
  const fromServer = parseSessionResume(profileRow?.session_resume ?? null);
  const fromStorage = readSessionResumeFromStorage(userId);
  const sessionResume = pickNewerSessionResume(fromServer, fromStorage);
  return {
    userState,
    hasSolvedAny: historyRows.length > 0 || solvedSum > 0,
    sessionResume,
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
      session_resume: null,
    },
    { onConflict: 'user_id' },
  );
  const { error } = await supabase.from('profiles').update({ total_answer_events: 0 }).eq('id', userId);
  if (error) console.error('resetCloudLearning profiles', error);
}
