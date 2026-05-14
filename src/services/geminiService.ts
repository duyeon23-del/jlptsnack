/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Question, QuestionType } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

function escapeRegExp(s: string) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** 한글 음절(가-힣) 및 자모 — 문제 표면(title/question/context/options)에서 제거·치환 */
const HANGUL_SYLLABLE_RE = /[\uAC00-\uD7A3]/g;
const HANGUL_JAMO_RE = /[\u3131-\u318E]/g;

/**
 * 모델이 일본어 문장에 한국어 조사·어미를 섞을 때(예: 은→は). 긴 패턴부터 적용.
 * explanation/tip/keywords에는 적용하지 않음.
 */
const KOREAN_LEAK_TO_JAPANESE: ReadonlyArray<readonly [string, string]> = [
  ['에서', 'で'],
  ['에게', 'に'],
  ['부터', 'から'],
  ['까지', 'まで'],
  ['으로', 'で'],
  ['와 ', 'と '],
  ['과 ', 'と '],
  ['의 ', 'の '],
  ['도 ', 'も '],
  ['만 ', 'だけ '],
  ['가も', 'がも'],
  ['은', 'は'],
  ['는', 'は'],
  ['을', 'を'],
  ['를', 'を'],
  ['에 ', 'に '],
  ['에', 'に'],
  ['의', 'の'],
  ['가', 'が'],
  ['나', 'な'],
  ['다', 'だ'],
  ['라', 'ら'],
  ['마', 'ま'],
  ['바', 'ば'],
  ['사', 'さ'],
  ['아', 'あ'],
  ['자', 'じ'],
  ['차', 'ち'],
  ['카', 'か'],
  ['타', 'た'],
  ['파', 'ぱ'],
  ['하', 'は'],
];

const sortedKoreanLeakFixes = [...KOREAN_LEAK_TO_JAPANESE].sort((a, b) => b[0].length - a[0].length);

/** 漢字(...) / 漢字（…） の読み部分に混入したハングルを修正・除去 */
function repairHangulInsideFuriganaInner(inner: string): string {
  let s = inner;
  for (const [from, to] of sortedKoreanLeakFixes) {
    if (from.length === 0) continue;
    s = s.split(from).join(to);
  }
  return s.replace(HANGUL_SYLLABLE_RE, '').replace(HANGUL_JAMO_RE, '');
}

function repairHangulInKanjiFurigana(text: string): string {
  const half = /([\u3005-\u9faf\u3400-\u4dbf\uf900-\ufaff]+)\(([^)]+)\)/g;
  const full = /([\u3005-\u9faf\u3400-\u4dbf\uf900-\ufaff]+)（([^）]+)）/g;
  return text
    .replace(half, (_, k: string, inner: string) => `${k}(${repairHangulInsideFuriganaInner(inner)})`)
    .replace(full, (_, k: string, inner: string) => `${k}（${repairHangulInsideFuriganaInner(inner)}）`);
}

function scrubJapaneseSurfaceText(text: string): string {
  let s = repairHangulInKanjiFurigana(text);
  for (const [from, to] of sortedKoreanLeakFixes) {
    if (from.length === 0) continue;
    s = s.split(from).join(to);
  }
  s = s.replace(HANGUL_SYLLABLE_RE, '').replace(HANGUL_JAMO_RE, '');
  s = repairHangulInKanjiFurigana(s);
  return s.replace(/[ \t]{2,}/g, ' ');
}

export function scrubJapaneseQuestionSurfaces(q: Question): Question {
  return {
    ...q,
    title: scrubJapaneseSurfaceText(q.title),
    question: scrubJapaneseSurfaceText(q.question),
    context:
      q.context != null && q.context !== ''
        ? scrubJapaneseSurfaceText(q.context)
        : q.context,
    options: q.options.map((o) => scrubJapaneseSurfaceText(o)),
  };
}

/** 漢字(よみ) 중 よみ이 정답 읽기와 같으면 괄호 부분 제거 — 읽기 문제에서 정답 누설 방지 */
function stripFuriganaWhenReadingMatchesAnswer(text: string, answerText: string): string {
  const t = answerText.trim();
  if (!t) return text;
  const r = escapeRegExp(t);
  const half = new RegExp(`([\\u3005-\\u9faf\\u3400-\\u4dbf\\uf900-\\ufaff]+)\\(${r}\\)`, 'g');
  const full = new RegExp(`([\\u3005-\\u9faf\\u3400-\\u4dbf\\uf900-\\ufaff]+)（${r}）`, 'g');
  return text.replace(half, '$1').replace(full, '$1');
}

function stripAllFurigana(text: string): string {
  return text
    .replace(/([\u3005-\u9faf\u3400-\u4dbf\uf900-\ufaff]+)\([^)]+\)/g, '$1')
    .replace(/([\u3005-\u9faf\u3400-\u4dbf\uf900-\ufaff]+)（[^）]+）/g, '$1');
}

const STAR_ORDERING_RE = /[★＊]/;

function normalizeForLeakSearch(s: string): string {
  return s.replace(/[\s　]/g, '');
}

/** ★(語順) 문제에서 지문 문장이 보기(2글자 이상)를 모두 풀어 쓴 경우 → 정답 노출 */
function orderingContextSentenceRevealsAllChunks(sentence: string, options: string[]): boolean {
  const sn = normalizeForLeakSearch(stripAllFurigana(sentence));
  const frags = options
    .map((o) => normalizeForLeakSearch(stripAllFurigana(o.trim())))
    .filter((f) => f.length >= 2);
  if (frags.length < 2) return false;
  return frags.every((f) => sn.includes(f));
}

/** context에서 완성된 스크램블 문장(보기 전부 등장) 제거 */
function removeOrderingAnswerFromContext(q: Question): Question {
  if (!q.context?.trim() || !STAR_ORDERING_RE.test(q.question)) return q;
  const ctx = q.context.trim();

  if (!ctx.includes('。')) {
    if (orderingContextSentenceRevealsAllChunks(ctx, q.options)) {
      return { ...q, context: undefined };
    }
    return q;
  }

  const parts = ctx
    .split('。')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  const kept = parts.filter((p) => !orderingContextSentenceRevealsAllChunks(`${p}。`, q.options));
  if (kept.length === 0) return { ...q, context: undefined };
  return { ...q, context: `${kept.join('。')}。` };
}

function poolHasCorrectAnswer(q: Question): boolean {
  const correct = (q.options[q.answerIndex] ?? '').trim();
  if (!correct || correct.length < 2) return false;
  const pool = `${q.title}\n${q.context ?? ''}\n${q.question}`;
  return pool.includes(correct);
}

const singleKanjiCharRe = /^[\u3005-\u9faf\u3400-\u4dbf\uf900-\ufaff]$/;

/** 4지선다가 모두 한 글자 한자일 때(書き方 유형): 문장에 히라가나로 읽기가 나오면 정답 누설 */
function optionsAreAllSingleKanji(opts: string[]): boolean {
  return opts.length >= 2 && opts.every((o) => singleKanjiCharRe.test(o.trim()));
}

/**
 * 정답 한자의 흔한 히라가나 표기(2글자 이상만). 1글자 읽기는 오탐이 많아 프롬프트에 맡김.
 */
const KANJI_TO_HIRAGANA_LEAKS: Record<string, string[]> = {
  水: ['みず'],
  火: ['ほのお'],
  土: ['つち'],
  金: ['かね'],
  川: ['かわ'],
  山: ['やま'],
  石: ['いし'],
  車: ['くるま'],
  門: ['もん'],
  力: ['ちから'],
  女: ['おんな'],
  男: ['おとこ'],
  子: ['こども'],
  雨: ['あめ'],
  雪: ['ゆき'],
  風: ['かぜ'],
  空: ['そら'],
  海: ['うみ'],
  天: ['てん'],
  花: ['はな'],
  草: ['くさ'],
  虫: ['むし'],
  犬: ['いぬ'],
  猫: ['ねこ'],
  鳥: ['とり'],
  魚: ['さかな'],
  肉: ['にく'],
  米: ['こめ'],
  茶: ['おちゃ'],
  牛: ['うし'],
  馬: ['うま'],
  羊: ['ひつじ'],
  豚: ['ぶた'],
};

function redactHiraganaReadingOfCorrectKanji(text: string, correctKanji: string): string {
  const raw = KANJI_TO_HIRAGANA_LEAKS[correctKanji];
  if (!raw?.length) return text;
  const readings = [...new Set(raw)].filter((r) => r.length >= 2).sort((a, b) => b.length - a.length);
  if (!readings.length) return text;
  let out = text;
  const particles = ['を', 'が', 'に', 'へ', 'と', 'で', 'も', 'は', 'の'] as const;
  for (const r of readings) {
    const escaped = escapeRegExp(r);
    for (const p of particles) {
      out = out.replace(new RegExp(`${escaped}\\s*${escapeRegExp(p)}`, 'g'), `（　　）${p}`);
    }
  }
  return out;
}

function sanitizeQuestionNoAnswerLeak(q: Question): Question {
  const correct = (q.options[q.answerIndex] ?? '').trim();
  if (!correct) return q;
  let question = stripFuriganaWhenReadingMatchesAnswer(q.question, correct);
  let context = q.context ? stripFuriganaWhenReadingMatchesAnswer(q.context, correct) : q.context;
  let title = stripFuriganaWhenReadingMatchesAnswer(q.title, correct);
  let next: Question = { ...q, question, context, title };
  if (poolHasCorrectAnswer(next)) {
    next = {
      ...next,
      question: stripAllFurigana(next.question),
      context: next.context ? stripAllFurigana(next.context) : next.context,
      title: stripAllFurigana(next.title),
    };
  }
  if (optionsAreAllSingleKanji(next.options) && singleKanjiCharRe.test(correct)) {
    next = {
      ...next,
      question: redactHiraganaReadingOfCorrectKanji(next.question, correct),
      context: next.context ? redactHiraganaReadingOfCorrectKanji(next.context, correct) : next.context,
      title: redactHiraganaReadingOfCorrectKanji(next.title, correct),
    };
  }
  return next;
}

const questionSchema = {
  type: Type.OBJECT,
  properties: {
    id: { type: Type.STRING },
    type: { type: Type.STRING },
    title: { type: Type.STRING },
    context: { type: Type.STRING },
    question: { type: Type.STRING },
    options: {
      type: Type.ARRAY,
      items: { type: Type.STRING }
    },
    answerIndex: { type: Type.INTEGER },
    explanation: { type: Type.STRING },
    tip: { type: Type.STRING },
    difficulty: { type: Type.INTEGER },
    keywords: {
      type: Type.ARRAY,
      items: { type: Type.STRING }
    }
  },
  required: ["id", "type", "title", "question", "options", "answerIndex", "explanation", "tip", "difficulty", "keywords"]
};

export async function generateN5Questions(category: QuestionType, count: number = 5): Promise<Question[]> {
  const categoryNames = {
    N5V: "Vocabulary (文字・語彙)",
    N5G: "Grammar (文法)",
    N5R: "Reading (読解)",
    N5L: "Listening Text (聴解 텍스트 상황)"
  };

  const prompt = `Generate ${count} JLPT N5 style practice questions for the category: ${categoryNames[category]}.
  
  STRICT RULES:
  1. CRITICAL: THE "title", "question", "context", AND "options" FIELDS MUST BE 100% IN JAPANESE. THERE MUST BE ABSOLUTELY NO KOREAN CHARACTERS IN THESE FIELDS.
     Example of expected Japanese content: "私(わたし)は 毎日(まいにち) 学校(がっこう)へ 行(い)きます。"
     Example of strictly forbidden content: "私(わたし)은 毎日 학교へ 行(い)きます。"
  2. FURIGANA: Use KANJI(FURIGANA) for most kanji (e.g., 学校(がっこう)). The reading inside parentheses MUST be hiragana or katakana ONLY — NEVER Korean Hangul (wrong: 学校(가っこう), correct: 学校(がっこう)).
  3. ABSOLUTE ANSWER LEAK BAN: The exact text of the CORRECT option (options[answerIndex]) MUST NEVER appear in "title", "question", or "context" — including inside furigana after the target kanji.
     - If asking for 読み方(よみかた) of a word, write that word as PLAIN KANJI ONLY (e.g. 天気) — never 天気(てんき) when てんき is the correct option.
     - Wrong distractors may still use KANJI(FURIGANA) as usual.
     - If every option is a SINGLE kanji (漢字の書き方 / 正しい漢字を選ぶ), the sentence MUST NOT write that word in hiragana or katakana at the blank position — that reveals the answer. Use a placeholder: 「（　　）を 飲(の)みましょう」 or 「□□を 飲(の)みましょう」. Forbidden when 水 is correct: 「みずを 飲(の)みましょう」.
  3b. ZERO HANGUL IN JAPANESE FIELDS: "title", "question", "context", and "options" MUST contain ONLY Japanese-appropriate characters (kanji, hiragana, katakana, Latin digits/letters if needed, Japanese punctuation). NEVER insert Korean Hangul (e.g. 은, 는, 을, 의, 에) — use は, が, を, の, に instead. Wrong: 「映画(えいが)은 あまり」 — correct: 「映画(えいが)は あまり」.
  4. The "explanation", "tip", and "keywords" MUST be in Korean.
  5. For N5G (Grammar), include "sentence ordering" (★) questions.
  6. For N5L (Listening), provide a situational dialogue in Japanese text in "context" field.
  7. For N5R (Reading), keep it short (3-5 sentences).
  7b. STAR ★ ORDER (語順・並び替え): If "question" contains ★ (or ＊) for word-order tasks, "context" MUST NOT include the same clause with every option already in the correct solved order — that exposes the answer. Example forbidden: context says 「机の上にきれいな並べて本が三冊あります」 while the question asks to place ★ among blanks with those same fragments as options. Use only setup sentences in context, or a passage that omits that clause entirely.
  8. IDs should be unique.
  9. Difficulty should be 1-3 for N5 level.
  10. "keywords" MUST be 3 essential words extracted ONLY from the "question", "context", or "options" of this specific question.
     Format each keyword string as: "Kanji(Furigana): Meaning in Korean" (e.g., "学校(がっこう): 학교").
  
  Return the response as a JSON array of objects matching the schema.`;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: questionSchema
        }
      }
    });

    const jsonStr = response.text;
    if (!jsonStr) throw new Error("No response from AI");
    
    const raw = JSON.parse(jsonStr) as Question[];

    const cleaned = raw
      .map((q) =>
        sanitizeQuestionNoAnswerLeak(
          removeOrderingAnswerFromContext(scrubJapaneseQuestionSurfaces({ ...q, type: category }))
        )
      )
      .filter((q) => !poolHasCorrectAnswer(q));

    if (cleaned.length === 0) {
      throw new Error('생성된 문항이 모두 정답 누설 검사에 걸렸습니다. 다시 시도해 주세요.');
    }

    return cleaned.map((q) => ({
      ...q,
      id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `gen-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`,
    }));
  } catch (error) {
    console.error("Error generating questions:", error);
    throw error;
  }
}

export async function getTextToSpeech(text: string): Promise<string> {
  try {
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-tts-preview",
      contents: [{ parts: [{ text: `Read this Japanese text clearly and slowly for a JLPT N5 level student: ${text}` }] }],
      config: {
        responseModalities: [Modality.AUDIO],
        speechConfig: {
          voiceConfig: {
            prebuiltVoiceConfig: { voiceName: 'Kore' }, // Kore is a good default clear voice
          },
        },
      },
    });

    const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
    if (!base64Audio) throw new Error("Failed to generate TTS audio");
    
    return base64Audio;
  } catch (error) {
    console.error("TTS Error:", error);
    throw error;
  }
}
