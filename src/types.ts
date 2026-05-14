/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

export type QuestionType = 'N5V' | 'N5G' | 'N5R' | 'N5L';

export interface Question {
  id: string;
  type: QuestionType;
  title: string;
  context?: string; // For reading/listening
  question: string;
  options: string[];
  answerIndex: number;
  explanation: string;
  tip: string;
  difficulty: number; // 1 to 5
  keywords: string[];
}

export interface Bookmark {
  word: string;
  meaning: string;
  timestamp: number;
}

export interface UserState {
  level: number;
  xp: number;
  streak: number;
  progress: Record<QuestionType, number>; // Count of questions solved per category
  mistakeWeights: Record<QuestionType, number>; // Weight for adaptive learning
  bookmarks: Bookmark[];
  bookmarkedQuestions: Question[];
  history: {
    questionId: string;
    type: QuestionType;
    isCorrect: boolean;
    timestamp: number;
  }[];
}

/** 이어서 하기 — 이탈·로그아웃 직전 화면 복원용 */
export interface SessionResume {
  questionBuffer: Question[];
  currentIdx: number;
  selectedOption: number | null;
  isLocked: boolean;
  updatedAt: number;
}
