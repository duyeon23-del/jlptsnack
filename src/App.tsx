/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo, useCallback, useRef, type FC } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2, Bookmark as BookmarkIcon, X } from 'lucide-react';
import { Question, UserState, QuestionType, Bookmark, SessionResume } from './types';
import { AuthHeaderButton } from './components/AuthHeaderButton';
import { QuestionCard, Feedback } from './components/TutorComponents';
import { useSupabaseAuth } from './hooks/useSupabaseAuth';
import { supabase } from './lib/supabase';
import { generateN5Questions } from './services/geminiService';
import { getOrFetchListeningTtsFloat32, listeningTtsTextFromQuestion } from './services/listeningTtsCache';
import {
  clearSessionResumeRemote,
  clearSessionResumeStorage,
  emptyUserState,
  insertAnswerHistory,
  loadCloudState,
  pickNewerSessionResume,
  readSessionResumeFromStorage,
  resetCloudLearning,
  saveSessionResumeRemote,
  syncQuestionBookmark,
  syncWordBookmark,
  upsertLearningProfile,
  writeSessionResumeToStorage,
} from './services/learningCloud';
import { QUESTIONS } from './data/questions';

const CATEGORIES: QuestionType[] = ['N5V', 'N5G', 'N5R', 'N5L'];

const N5_KANJI_LIST = [
  { kanji: '一', furigana: 'いち', meaning: '하나' }, { kanji: '二', furigana: 'に', meaning: '둘' }, { kanji: '三', furigana: 'さん', meaning: '셋' },
  { kanji: '四', furigana: 'よん', meaning: '넷' }, { kanji: '五', furigana: 'ご', meaning: '다섯' }, { kanji: '六', furigana: 'ろく', meaning: '여섯' },
  { kanji: '七', furigana: 'なな', meaning: '일곱' }, { kanji: '八', furigana: 'はち', meaning: '여덟' }, { kanji: '九', furigana: 'きゅう', meaning: '아홉' },
  { kanji: '十', furigana: 'じゅう', meaning: '열' }, { kanji: '百', furigana: 'ひゃく', meaning: '백' }, { kanji: '千', furigana: 'せん', meaning: '천' },
  { kanji: '万', furigana: 'まん', meaning: '만' }, { kanji: '円', furigana: 'えん', meaning: '원' }, { kanji: '日', furigana: 'ひ', meaning: '날/해' },
  { kanji: '月', furigana: 'つき', meaning: '달/월' }, { kanji: '火', furigana: 'ひ', meaning: '불/화' }, { kanji: '水', furigana: 'みず', meaning: '물/수' },
  { kanji: '木', furigana: 'き', meaning: '나무/목' }, { kanji: '金', furigana: 'かね', meaning: '돈/금' }, { kanji: '土', furigana: 'つち', meaning: '흙/토' },
  { kanji: '山', furigana: 'やま', meaning: '산' }, { kanji: '川', furigana: 'かわ', meaning: '강' }, { kanji: '田', furigana: 'た', meaning: '밭' },
  { kanji: '人', furigana: 'ひと', meaning: '사람' }, { kanji: '子', furigana: 'こ', meaning: '아이' }, { kanji: '女', furigana: 'おんな', meaning: '여자' },
  { kanji: '男', furigana: 'おとこ', meaning: '남자' }, { kanji: '先', furigana: 'さき', meaning: '먼저' }, { kanji: '生', furigana: 'せい', meaning: '살다/나다' },
  { kanji: '学', furigana: 'がく', meaning: '배우다' }, { kanji: '校', furigana: 'こう', meaning: '학교' }, { kanji: '上', furigana: 'うえ', meaning: '위' },
  { kanji: '下', furigana: 'した', meaning: '아래' }, { kanji: '中', furigana: 'なか', meaning: '안/가운데' }, { kanji: '外', furigana: 'そと', meaning: '밖' },
  { kanji: '前', furigana: 'まえ', meaning: '앞' }, { kanji: '後', furigana: 'あと', meaning: '뒤/후' }, { kanji: '右', furigana: 'みぎ', meaning: '오른쪽' },
  { kanji: '左', furigana: 'ひだり', meaning: '왼쪽' }, { kanji: '大', furigana: 'おお', meaning: '크다' }, { kanji: '小', furigana: 'ちい', meaning: '작다' },
  { kanji: '本', furigana: 'ほん', meaning: '책/본래' }, { kanji: '名', furigana: 'な', meaning: '이름' }, { kanji: '何', furigana: 'なに', meaning: '무엇' },
  { kanji: '年', furigana: 'とし', meaning: '해/년' }, { kanji: '時', furigana: 'とき', meaning: '때/시간' }, { kanji: '分', furigana: 'ふん', meaning: '나누다/분' },
  { kanji: '天', furigana: 'てん', meaning: '하늘' }, { kanji: '気', furigana: 'き', meaning: '기운' }
];

const BookmarkedQuestionItem: FC<{ question: Question; onRemove: () => void }> = ({ question, onRemove }) => {
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isLocked, setIsLocked] = useState(false);

  const handleSelect = (idx: number) => {
    setSelectedOption(idx);
    setIsLocked(true);
  };

  return (
    <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 flex flex-col gap-4">
      <div className="flex justify-end mb-[-1rem] z-10 relative">
        <button 
          onClick={onRemove}
          className="p-2 rounded-xl text-rose-400 hover:text-rose-500 hover:bg-rose-50 transition-all bg-white shadow-sm border border-slate-200"
          title="북마크 해제"
        >
          <BookmarkIcon className="w-5 h-5 fill-current" />
        </button>
      </div>
      <QuestionCard
        question={question}
        selectedOption={selectedOption}
        onSelect={handleSelect}
        isLocked={isLocked}
        // No "Next" button in bookmark mode
      />
      {isLocked && (
        <Feedback
          isCorrect={selectedOption === question.answerIndex}
          explanation={question.explanation}
          tip={question.tip}
          keywords={question.keywords}
          onRetry={() => {
            setIsLocked(false);
            setSelectedOption(null);
          }}
        />
      )}
    </div>
  );
};

export default function App() {
  const { user, signInWithGoogle, signOut, ensureLoggedIn } = useSupabaseAuth();
  const [gameState, setGameState] = useState<'welcome' | 'playing' | 'loading'>('welcome');
  const [loadingProgress, setLoadingProgress] = useState(0);
  const [randomKanjiBatch, setRandomKanjiBatch] = useState<{kanji: string, furigana: string, meaning: string}[]>([]);
  const [questionBuffer, setQuestionBuffer] = useState<Question[]>([]);
  const [currentIdx, setCurrentIdx] = useState(0);
  const [selectedOption, setSelectedOption] = useState<number | null>(null);
  const [isLocked, setIsLocked] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [showBookmarks, setShowBookmarks] = useState(false);
  const [bookmarkTab, setBookmarkTab] = useState<'word' | 'question'>('word');
  const [showResetConfirm, setShowResetConfirm] = useState(false);
  const [unseenWordBookmarks, setUnseenWordBookmarks] = useState<Set<string>>(new Set());
  const [unseenQuestionBookmarks, setUnseenQuestionBookmarks] = useState<Set<string>>(new Set());
  const generatingPromiseRef = useRef<Promise<Question[]> | null>(null);
  const [cloudSynced, setCloudSynced] = useState(true);
  const [serverHasProgress, setServerHasProgress] = useState(false);
  const [restorableSession, setRestorableSession] = useState<SessionResume | null>(null);

  const [userState, setUserState] = useState<UserState>(emptyUserState());
  const sessionRemoteTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sessionMirrorRef = useRef({
    questionBuffer: [] as Question[],
    currentIdx: 0,
    selectedOption: null as number | null,
    isLocked: false,
  });

  useEffect(() => {
    if (!user) {
      setUserState(emptyUserState());
      setQuestionBuffer([]);
      setCurrentIdx(0);
      setSelectedOption(null);
      setIsLocked(false);
      setServerHasProgress(false);
      setRestorableSession(null);
      setCloudSynced(true);
      setGameState('welcome');
      return;
    }

    let cancelled = false;
    setCloudSynced(false);
    setRestorableSession(null);
    (async () => {
      try {
        const { userState: loaded, hasSolvedAny, sessionResume } = await loadCloudState(user.id);
        if (cancelled) return;
        setUserState(loaded);
        setServerHasProgress(hasSolvedAny);
        setRestorableSession(sessionResume);
      } catch (e) {
        console.error('loadCloudState', e);
        if (!cancelled) setUserState(emptyUserState());
        if (!cancelled) setRestorableSession(null);
      } finally {
        if (!cancelled) setCloudSynced(true);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user?.id || gameState !== 'playing') return;
    sessionMirrorRef.current = { questionBuffer, currentIdx, selectedOption, isLocked };
    const payload: SessionResume = {
      questionBuffer,
      currentIdx,
      selectedOption,
      isLocked,
      updatedAt: Date.now(),
    };
    writeSessionResumeToStorage(user.id, payload);
    if (sessionRemoteTimerRef.current) clearTimeout(sessionRemoteTimerRef.current);
    sessionRemoteTimerRef.current = setTimeout(() => {
      sessionRemoteTimerRef.current = null;
      const m = sessionMirrorRef.current;
      void saveSessionResumeRemote(user.id, {
        questionBuffer: m.questionBuffer,
        currentIdx: m.currentIdx,
        selectedOption: m.selectedOption,
        isLocked: m.isLocked,
        updatedAt: Date.now(),
      });
    }, 900);
    return () => {
      if (sessionRemoteTimerRef.current) clearTimeout(sessionRemoteTimerRef.current);
    };
  }, [user?.id, gameState, questionBuffer, currentIdx, selectedOption, isLocked]);

  useEffect(() => {
    if (!user?.id || gameState !== 'playing') return;
    const flush = () => {
      const m = sessionMirrorRef.current;
      void saveSessionResumeRemote(user.id, {
        questionBuffer: m.questionBuffer,
        currentIdx: m.currentIdx,
        selectedOption: m.selectedOption,
        isLocked: m.isLocked,
        updatedAt: Date.now(),
      });
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [user?.id, gameState]);

  useEffect(() => {
    if (gameState !== 'playing') return;
    const upcoming = questionBuffer.slice(currentIdx + 1).find((q) => q.type === 'N5L');
    if (!upcoming) return;
    const text = listeningTtsTextFromQuestion(upcoming);
    if (!text) return;
    void getOrFetchListeningTtsFloat32(upcoming.id, text).catch(() => {});
  }, [gameState, questionBuffer, currentIdx]);

  const getNextCategory = useCallback(() => {
    // 1. Check baseline coverage (5 questions per category)
    for (const cat of CATEGORIES) {
      if ((userState.progress[cat] || 0) < 5) return cat;
    }

    // 2. Adaptive: Pick the one with highest mistake weight
    let maxWeight = -1;
    let targetCat: QuestionType = 'N5V';
    
    for (const cat of CATEGORIES) {
      const weight = userState.mistakeWeights[cat] || 0;
      if (weight > maxWeight) {
        maxWeight = weight;
        targetCat = cat;
      }
    }
    return targetCat;
  }, [userState.progress, userState.mistakeWeights]);

  const fetchBatch = useCallback(async (count: number = 3) => {
    if (generatingPromiseRef.current) return generatingPromiseRef.current;
    setIsGenerating(true);
    
    const promise = (async () => {
      try {
        const category = getNextCategory();
        const newQuestions = await generateN5Questions(category, count);
        setQuestionBuffer((prev) => {
          const seen = new Set(prev.map((q) => q.id));
          const appended: Question[] = [];
          for (const q of newQuestions) {
            if (seen.has(q.id)) continue;
            seen.add(q.id);
            appended.push(q);
          }
          return [...prev, ...appended];
        });
        return newQuestions;
      } catch (error) {
        console.error("Batch generation failed:", error);
        return [];
      } finally {
        setIsGenerating(false);
        generatingPromiseRef.current = null;
      }
    })();
    
    generatingPromiseRef.current = promise;
    return promise;
  }, [getNextCategory]);

  // Calculate current level and progress
  const levelProgress = useMemo(() => {
    return (userState.xp % 100);
  }, [userState.xp]);

  const currentQuestion = useMemo(() => questionBuffer[currentIdx], [questionBuffer, currentIdx]);

  const handleSelect = (idx: number) => {
    const uid = user?.id;
    setSelectedOption(idx);
    setIsLocked(true);

    const isCorrect = idx === currentQuestion.answerIndex;

    setUserState((prev) => {
      const newHistory = [
        ...prev.history,
        {
          questionId: currentQuestion.id,
          type: currentQuestion.type,
          isCorrect,
          timestamp: Date.now(),
        },
      ];

      const typeHistory = newHistory.filter((h) => h.type === currentQuestion.type);
      const mistakes = typeHistory.filter((h) => !h.isCorrect).length;

      const next: UserState = {
        ...prev,
        xp: isCorrect ? prev.xp + 20 : prev.xp,
        streak: isCorrect ? prev.streak + 1 : 0,
        level: Math.floor((prev.xp + (isCorrect ? 20 : 0)) / 100) + 1,
        progress: {
          ...prev.progress,
          [currentQuestion.type]: (prev.progress[currentQuestion.type] || 0) + 1,
        },
        mistakeWeights: {
          ...prev.mistakeWeights,
          [currentQuestion.type]: mistakes / typeHistory.length,
        },
        history: newHistory,
      };

      if (uid) {
        void insertAnswerHistory(uid, currentQuestion.id, currentQuestion.type, isCorrect);
        void upsertLearningProfile(uid, next);
      }
      return next;
    });
  };

  const handleNext = () => {
    if (currentIdx + 1 < questionBuffer.length) {
      // We have questions ready in the buffer
      setCurrentIdx(prev => prev + 1);
      setSelectedOption(null);
      setIsLocked(false);
      
      // Proactive background fetch: if we are low on buffer, fetch more
      // If we are about to view the first generated question of a 3-question batch
      if (questionBuffer.length - (currentIdx + 2) <= 2) {
        if (!generatingPromiseRef.current) {
          fetchBatch(3);
        }
      }
    } else {
      // User is faster than our background generation or buffer is empty
      setGameState('loading');
      setLoadingProgress(0);
      
      // Start a new progress simulation
      const progressInterval = setInterval(() => {
        setLoadingProgress(prev => (prev >= 95 ? prev : prev + Math.floor(Math.random() * 5) + 1));
      }, 300);

      const waitBatch = async () => {
        try {
          // Wait for current generation to finish or start a new one
          if (generatingPromiseRef.current) {
            await generatingPromiseRef.current;
          } else {
            await fetchBatch(3);
          }
          
          clearInterval(progressInterval);
          setLoadingProgress(100);
          
          setTimeout(() => {
            setGameState('playing');
            setCurrentIdx(prev => prev + 1);
            setSelectedOption(null);
            setIsLocked(false);
            
            // start fetching next batch in background since we just caught up
            fetchBatch(3);
          }, 500);
        } catch (err) {
          clearInterval(progressInterval);
          setGameState('welcome');
          alert("문제를 가져오는데 실패했습니다.");
        }
      };

      waitBatch();
    }
  };

  const toggleBookmark = async (wordStr: string) => {
    const splitIndex = wordStr.indexOf(':');
    const word = splitIndex !== -1 ? wordStr.slice(0, splitIndex).trim() : wordStr.trim();
    const meaning = splitIndex !== -1 ? wordStr.slice(splitIndex + 1).trim() : '';
    const adding = !userState.bookmarks.some((b) => b.word === word);
    if (adding && !(await ensureLoggedIn())) return;

    const uid = user?.id;

    setUserState((prev) => {
      const isBookmarked = prev.bookmarks.some(b => b.word === word);
      let newBookmarks: Bookmark[];
      
      if (isBookmarked) {
        newBookmarks = prev.bookmarks.filter(b => b.word !== word);
        setUnseenWordBookmarks(prevSet => {
          const newSet = new Set(prevSet);
          newSet.delete(word);
          return newSet;
        });
      } else {
        newBookmarks = [
          ...prev.bookmarks,
          { word, meaning: meaning || '', timestamp: Date.now() }
        ];
        // Only mark as unseen if we're not currently looking at the word tab
        if (!showBookmarks || bookmarkTab !== 'word') {
          setUnseenWordBookmarks(prevSet => {
            const newSet = new Set(prevSet);
            newSet.add(word);
            return newSet;
          });
        }
      }
      
      return { ...prev, bookmarks: newBookmarks };
    });

    if (uid) void syncWordBookmark(uid, word, meaning, adding);
  };

  const toggleQuestionBookmark = async (question: Question) => {
    const adding = !userState.bookmarkedQuestions.some((q) => q.id === question.id);
    if (adding && !(await ensureLoggedIn())) return;

    const uid = user?.id;

    setUserState((prev) => {
      const isBookmarked = prev.bookmarkedQuestions.some(q => q.id === question.id);
      let newQuestions: Question[];
      
      if (isBookmarked) {
        newQuestions = prev.bookmarkedQuestions.filter(q => q.id !== question.id);
        setUnseenQuestionBookmarks(prevSet => {
          const newSet = new Set(prevSet);
          newSet.delete(question.id);
          return newSet;
        });
      } else {
        newQuestions = [
          ...prev.bookmarkedQuestions,
          question
        ];
        // Only mark as unseen if we're not currently looking at the question tab
        if (!showBookmarks || bookmarkTab !== 'question') {
          setUnseenQuestionBookmarks(prevSet => {
            const newSet = new Set(prevSet);
            newSet.add(question.id);
            return newSet;
          });
        }
      }
      
      return { ...prev, bookmarkedQuestions: newQuestions };
    });

    if (uid) void syncQuestionBookmark(uid, question, adding);
  };

  const startLearning = async () => {
    if (!(await ensureLoggedIn())) return;
    const {
      data: { session },
    } = await supabase.auth.getSession();
    const uid = session?.user?.id;
    if (uid) {
      clearSessionResumeStorage(uid);
      void clearSessionResumeRemote(uid);
    }
    setGameState('loading');
    setLoadingProgress(0);
    
    // Pick 3 random kanji from the list
    const shuffled = [...N5_KANJI_LIST].sort(() => Math.random() - 0.5);
    setRandomKanjiBatch(shuffled.slice(0, 3));
    
    // Simulate progress while generating
    const progressInterval = setInterval(() => {
      setLoadingProgress(prev => {
        if (prev >= 95) return prev;
        return prev + Math.floor(Math.random() * 20) + 10;
      });
    }, 100);

    setTimeout(() => {
      // 몸풀기 시작: 첫 칸만 카탈로그(QUESTIONS)에서 랜덤 — 이후 문항은 전부 fetchBatch → generateN5Questions
      const randomCategory = CATEGORIES[Math.floor(Math.random() * CATEGORIES.length)];
      const categoryQuestions = QUESTIONS.filter((q) => q.type === randomCategory);
      const pool = categoryQuestions.length > 0 ? categoryQuestions : QUESTIONS;
      const initialQuestion = pool[Math.floor(Math.random() * pool.length)];
      
      clearInterval(progressInterval);
      setLoadingProgress(100);
      
      setTimeout(() => {
        setQuestionBuffer([initialQuestion]);
        setGameState('playing');
        setCurrentIdx(0);
        
        // Proactively start background generation for 3 more questions
        // This runs while the user is looking at the first question
        fetchBatch(3);
      }, 400);
    }, 600);
  };

  const resumeLearning = async () => {
    if (!(await ensureLoggedIn())) return;
    if (questionBuffer.length > 0 && currentIdx < questionBuffer.length) {
      setGameState('playing');
      return;
    }
    const uid = user?.id;
    let snapshot: SessionResume | null = restorableSession;
    if (uid) {
      snapshot = pickNewerSessionResume(snapshot, readSessionResumeFromStorage(uid));
    }
    if (snapshot?.questionBuffer?.length) {
      setQuestionBuffer(snapshot.questionBuffer);
      setCurrentIdx(snapshot.currentIdx);
      setSelectedOption(snapshot.selectedOption ?? null);
      setIsLocked(snapshot.isLocked);
      setGameState('playing');
      if (snapshot.questionBuffer.length - snapshot.currentIdx <= 2 && !generatingPromiseRef.current) {
        void fetchBatch(3);
      }
      return;
    }
    void startLearning();
  };

  const handleStartOver = async () => {
    if (user) {
      try {
        await resetCloudLearning(user.id);
      } catch (e) {
        console.error('resetCloudLearning', e);
      }
      clearSessionResumeStorage(user.id);
    }
    setUserState(emptyUserState());
    setServerHasProgress(false);
    setRestorableSession(null);
    setQuestionBuffer([]);
    setCurrentIdx(0);
    setShowResetConfirm(false);
  };

  const showWelcomeResume =
    cloudSynced &&
    ((!user && userState.history.length > 0) ||
      (user &&
        (serverHasProgress || userState.history.length > 0 || !!restorableSession)));

  return (
    <div className="min-h-screen bg-[var(--color-brand-bg)] font-sans selection:bg-indigo-100 selection:text-indigo-900 overflow-hidden flex">
      {/* Main Content Area */}
      <main className="relative isolate flex flex-1 flex-col h-screen overflow-hidden">
        <header className="relative z-50 flex h-16 shrink-0 items-center justify-between border-b border-slate-100 bg-white/50 px-8 backdrop-blur-sm">
          <div className="flex items-center gap-4 cursor-pointer" onClick={() => setGameState('welcome')}>
            <h1 className="text-lg font-bold text-slate-700 hover:text-indigo-600 transition-colors">오늘의 N5 스낵 학습 ⚡</h1>
          </div>
          <div className="flex items-center gap-3 sm:gap-4">
            <button
              type="button"
              onClick={async () => {
                if (!(await ensureLoggedIn())) return;
                if (unseenQuestionBookmarks.size > 0 && unseenWordBookmarks.size === 0) {
                  setBookmarkTab('question');
                  setUnseenQuestionBookmarks(new Set());
                } else {
                  setBookmarkTab('word');
                  setUnseenWordBookmarks(new Set());
                }
                setShowBookmarks(true);
              }}
              className="relative p-2.5 rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-slate-50 transition-all shadow-sm"
            >
              <BookmarkIcon className="w-5 h-5" />
              {(unseenWordBookmarks.size + unseenQuestionBookmarks.size) > 0 && (
                <span className="absolute -top-2 -right-2 flex h-5 w-5 items-center justify-center rounded-full bg-rose-500 text-[10px] font-bold text-white border-2 border-white shadow-sm">
                  {unseenWordBookmarks.size + unseenQuestionBookmarks.size}
                </span>
              )}
            </button>
            <AuthHeaderButton user={user} onGoogleLogin={signInWithGoogle} onSignOut={signOut} />
          </div>
        </header>

        {/* Content Section */}
        <div className="relative z-0 min-h-0 flex-1 overflow-y-auto p-4 md:p-8">
          <div className="max-w-6xl mx-auto grid grid-cols-1 lg:grid-cols-12 gap-8">
            <AnimatePresence mode="wait">
              {gameState === 'welcome' ? (
                <motion.div
                  key="welcome"
                  initial={{ opacity: 0, y: 20 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -20 }}
                  className="lg:col-span-12 flex flex-col items-center justify-center py-20 text-center"
                >
                  <div className="relative w-40 h-40 mb-12">
                    <div className="absolute inset-0 bg-indigo-50 rounded-full animate-pulse opacity-50" />
                    <div className="absolute inset-4 bg-white rounded-3xl shadow-xl flex items-center justify-center border border-indigo-100 overflow-hidden">
                      <motion.svg width="90" height="90" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" className="absolute">
                        <motion.g
                          animate={{ y: [0, -4, 0] }}
                          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                        >
                          {/* Sumo Body */}
                          <path d="M 25 70 C 20 40, 35 25, 50 25 C 65 25, 80 40, 75 70 C 80 90, 70 95, 50 95 C 30 95, 20 90, 25 70 Z" fill="#FFE4C4" stroke="#334155" strokeWidth="4" strokeLinejoin="round"/>
                          {/* Sumo Mawashi (Belt) */}
                          <path d="M 23 75 Q 50 85 77 75 L 75 90 Q 50 95 25 90 Z" fill="#3B82F6" stroke="#334155" strokeWidth="3" strokeLinejoin="round"/>
                          <path d="M 45 75 L 45 92 M 55 75 L 55 92" stroke="#334155" strokeWidth="3" strokeLinecap="round"/>
                          {/* Sumo Hair (Chonmage) */}
                          <path d="M 40 25 C 40 15, 60 15, 60 25" fill="#334155" />
                          <rect x="47" y="10" width="6" height="15" fill="#334155" rx="3" />
                          {/* Face */}
                          <path d="M 35 45 Q 40 40 45 45" stroke="#334155" strokeWidth="3" strokeLinecap="round" fill="none" />
                          <path d="M 55 45 Q 60 40 65 45" stroke="#334155" strokeWidth="3" strokeLinecap="round" fill="none" />
                          {/* Mouth */}
                          <motion.path 
                            d="M 45 55 Q 50 65 55 55 Z" 
                            fill="#FDA4AF" stroke="#334155" strokeWidth="2" strokeLinejoin="round" 
                            animate={{ scaleY: [1, 1.2, 1] }}
                            transition={{ duration: 0.5, repeat: Infinity, repeatType: "mirror" }}
                            style={{ transformOrigin: "50px 55px" }}
                          />
                          {/* Blush */}
                          <circle cx="30" cy="52" r="5" fill="#FECDD3" />
                          <circle cx="70" cy="52" r="5" fill="#FECDD3" />
                        </motion.g>
                        
                        {/* Dango (Snack) */}
                        <motion.g
                          animate={{ rotate: [0, -10, 0], x: [0, -2, 0] }}
                          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                          style={{ transformOrigin: "85px 50px" }}
                        >
                          {/* Hand holding dango */}
                          <circle cx="72" cy="70" r="8" fill="#FFE4C4" stroke="#334155" strokeWidth="3" />
                          <line x1="85" y1="30" x2="70" y2="70" stroke="#CD853F" strokeWidth="3" strokeLinecap="round" />
                          <circle cx="81" cy="40" r="8" fill="#F472B6" stroke="#334155" strokeWidth="2" />
                          <circle cx="77" cy="52" r="8" fill="#FDE047" stroke="#334155" strokeWidth="2" />
                          <circle cx="73" cy="64" r="8" fill="#86EFAC" stroke="#334155" strokeWidth="2" />
                        </motion.g>
                      </motion.svg>
                    </div>
                  </div>
                  <h2 className="text-4xl md:text-5xl font-black text-slate-900 mb-6 tracking-tight">JLPT N5 스낵 학습</h2>
                  <p className="text-lg text-slate-500 mb-10 max-w-md mx-auto leading-relaxed">
                    당신의 JLPT 코치가 합격의 길로 안내합니다.<br />매일 조금씩 실력을 쌓아보세요.
                  </p>
                  
                  {user && !cloudSynced ? (
                    <div className="flex flex-col items-center gap-3 py-8">
                      <Loader2 className="h-10 w-10 animate-spin text-indigo-600" />
                      <p className="text-center text-sm font-medium text-slate-500">
                        계정에 저장된 학습 기록을 불러오는 중이에요…
                      </p>
                    </div>
                  ) : showWelcomeResume ? (
                    <div className="flex flex-col sm:flex-row gap-4 items-center mt-6">
                      <button
                        onClick={() => void resumeLearning()}
                        className="bg-indigo-600 text-white px-8 py-4 rounded-2xl text-lg font-bold shadow-xl shadow-indigo-200 hover:bg-indigo-700 hover:-translate-y-1 transition-all active:translate-y-0 disabled:opacity-50"
                        disabled={gameState === 'loading'}
                      >
                        이어서 하기 →
                      </button>
                      <button
                        onClick={() => setShowResetConfirm(true)}
                        className="bg-white text-slate-600 border border-slate-200 px-8 py-4 rounded-2xl text-lg font-bold shadow-sm hover:bg-slate-50 hover:-translate-y-1 transition-all active:translate-y-0 disabled:opacity-50"
                        disabled={gameState === 'loading'}
                      >
                        처음부터 하기
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => void startLearning()}
                      className="bg-indigo-600 text-white px-10 py-5 rounded-2xl text-xl font-bold shadow-xl shadow-indigo-200 hover:bg-indigo-700 hover:-translate-y-1 transition-all active:translate-y-0 disabled:opacity-50"
                      disabled={gameState === 'loading'}
                    >
                      몸풀기 시작 →
                    </button>
                  )}
                </motion.div>
              ) : gameState === 'loading' ? (
                <motion.div 
                   key="loading"
                   initial={{ opacity: 0 }}
                   animate={{ opacity: 1 }}
                   className="lg:col-span-12 flex flex-col items-center justify-center py-40"
                >
                    <div className="relative w-32 h-32 mb-8 flex items-center justify-center">
                        <svg className="w-full h-full transform -rotate-90">
                            <circle
                                cx="64"
                                cy="64"
                                r="58"
                                stroke="currentColor"
                                strokeWidth="8"
                                fill="transparent"
                                className="text-slate-100"
                            />
                            <motion.circle
                                cx="64"
                                cy="64"
                                r="58"
                                stroke="currentColor"
                                strokeWidth="8"
                                fill="transparent"
                                strokeDasharray="364.4"
                                initial={{ strokeDashoffset: 364.4 }}
                                animate={{ strokeDashoffset: 364.4 - (364.4 * loadingProgress) / 100 }}
                                className="text-indigo-600"
                                strokeLinecap="round"
                            />
                        </svg>
                        <span className="absolute text-2xl font-black text-slate-800">{loadingProgress}%</span>
                    </div>
                    <p className="text-slate-700 font-bold text-lg mb-2">당신의 JLPT 코치가 맞춤형 문제 준비중입니다.</p>
                    <div className="mt-8 max-w-sm w-full bg-indigo-50/50 rounded-2xl p-6 border border-indigo-100/50 text-center">
                        <AnimatePresence mode="wait">
                            {loadingProgress < 80 ? (
                                <motion.div
                                    key="tip"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                >
                                    <span className="inline-block px-3 py-1 bg-white rounded-full text-[10px] font-bold text-indigo-500 uppercase tracking-wider mb-3 shadow-sm">Learning Tip</span>
                                    <p className="text-slate-600 text-sm font-medium leading-relaxed">
                                        {loadingProgress < 40 ? "문법 별표(★) 문제는 문장을 완성한 뒤 두 번째 단어를 찾는 것이 포인트입니다!" : 
                                         "청해는 문제를 듣기 전 보기를 먼저 훑어보는 것이 큰 도움이 됩니다."}
                                    </p>
                                </motion.div>
                            ) : (
                                <motion.div
                                    key="kanji"
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    exit={{ opacity: 0, y: -10 }}
                                    className="flex flex-col items-center"
                                >
                                    <span className="inline-block px-3 py-1 bg-rose-500 rounded-full text-[10px] font-bold text-white uppercase tracking-wider mb-4 shadow-sm">N5 Must-Know Kanji</span>
                                    <div className="flex flex-wrap justify-center gap-y-4 gap-x-2 md:gap-x-4">
                                        {randomKanjiBatch.map((item, idx) => (
                                            <div key={idx} className="flex items-center">
                                                <div className="flex flex-col items-center min-w-[60px]">
                                                    <span className="text-xl font-bold text-slate-800">{item.kanji}</span>
                                                    <span className="text-[10px] text-slate-400">{item.furigana}</span>
                                                    <span className="text-[11px] font-bold text-rose-500 mt-1">{item.meaning}</span>
                                                </div>
                                                {idx < randomKanjiBatch.length - 1 && (
                                                    <div className="w-px h-8 bg-slate-200 mt-1 ml-2 md:ml-4 mr-0" />
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </motion.div>
                            )}
                        </AnimatePresence>
                    </div>
                    <p className="text-slate-300 text-xs mt-6 animate-pulse">잠시만 기다려 주세요...</p>
                </motion.div>
              ) : !currentQuestion ? (
                <div className="lg:col-span-12 flex items-center justify-center py-20">
                   <Loader2 className="w-12 h-12 text-indigo-600 animate-spin" />
                </div>
              ) : (
                <>
                  {/* Left Column: Question & Feedback */}
                  <div className="lg:col-span-8 flex flex-col gap-6">
                    <QuestionCard
                      question={currentQuestion}
                      selectedOption={selectedOption}
                      onSelect={handleSelect}
                      isLocked={isLocked}
                      onNext={handleNext}
                      isBookmarked={userState.bookmarkedQuestions.some(q => q.id === currentQuestion.id)}
                      onToggleBookmark={() => void toggleQuestionBookmark(currentQuestion)}
                    />

                    {isLocked && (
                      <Feedback
                        isCorrect={selectedOption === currentQuestion.answerIndex}
                        explanation={currentQuestion.explanation}
                        tip={currentQuestion.tip}
                        keywords={currentQuestion.keywords}
                        onRetry={() => {
                          setIsLocked(false);
                          setSelectedOption(null);
                        }}
                      />
                    )}
                  </div>

                  {/* Right Column: Stats & Words */}
                  <div className="lg:col-span-4 flex flex-col gap-6">
                    {/* Words Card */}
                    <div className="bg-white rounded-3xl p-6 shadow-lg border border-slate-100">
                      <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                        <span className="text-xl">🔖</span> 문제 속 필수 단어
                      </h3>
                      <ul className="space-y-4">
                        {currentQuestion.keywords.map((wordStr, i) => {
                          const [word, meaning] = wordStr.split(':').map(s => s.trim());
                          const isBookmarked = userState.bookmarks.some(b => b.word === word);
                          
                          return (
                            <li key={i} className="flex items-center justify-between p-3 rounded-2xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                              <div className="flex items-center gap-3">
                                <div className="flex flex-col">
                                  <span className="font-bold text-slate-700">{word}</span>
                                  <span className="text-xs text-slate-400 font-medium">{meaning || 'Essential Word'}</span>
                                </div>
                              </div>
                              <div className="flex items-center gap-1">
                                <button 
                                  onClick={() => void toggleBookmark(wordStr)}
                                  className={`p-2 rounded-xl transition-all ${isBookmarked ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-50 text-slate-400 hover:text-indigo-500 hover:bg-indigo-50'}`}
                                >
                                  <BookmarkIcon className={`w-4 h-4 ${isBookmarked ? 'fill-current' : ''}`} />
                                </button>
                              </div>
                            </li>
                          );
                        })}
                      </ul>
                    </div>

                    {/* Learning Progress Card */}
                    <div className="bg-white rounded-3xl p-6 shadow-lg border border-slate-100">
                      <h3 className="font-bold text-slate-800 mb-6 flex items-center gap-2">
                        <span className="text-xl">📊</span> 학습 진행도
                      </h3>
                      
                      <div className="space-y-4 mb-6">
                        {[
                          { id: 'N5V', label: '어휘' },
                          { id: 'N5G', label: '문법' },
                          { id: 'N5R', label: '독해' },
                          { id: 'N5L', label: '청해' },
                        ].map(cat => {
                          const solved = userState.progress[cat.id as QuestionType] || 0;
                          const correct = userState.history.filter(h => h.type === cat.id && h.isCorrect).length;
                          const progressPercent = Math.min((solved / 5) * 100, 100);
                          
                          return (
                            <div key={cat.id} className="flex flex-col gap-1">
                              <div className="flex justify-between items-center text-sm">
                                <span className="font-bold text-slate-600">{cat.label}</span>
                                <span className="text-slate-400 font-medium whitespace-pre">
                                  <span className="text-indigo-600 font-bold">{correct}</span> 정답 / {solved} 문제
                                </span>
                              </div>
                              <div className="h-2 w-full bg-slate-100 rounded-full overflow-hidden">
                                <motion.div 
                                  initial={{ width: 0 }}
                                  animate={{ width: `${progressPercent}%` }}
                                  className={`h-full rounded-full ${solved >= 5 ? 'bg-emerald-400' : 'bg-indigo-400'}`}
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      <div className={`p-4 rounded-2xl text-sm font-bold flex items-start gap-3 ${
                        CATEGORIES.every(cat => (userState.progress[cat] || 0) >= 5) 
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' 
                          : 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                      }`}>
                        {CATEGORIES.every(cat => (userState.progress[cat] || 0) >= 5) ? (
                          <>
                            <span className="text-xl">🎯</span>
                            <div>
                              AI코치의 퍼스널 트레이닝 모드 ON! 취약점 집중 공략!
                            </div>
                          </>
                        ) : (
                          <>
                            <span className="text-xl">💡</span>
                            <div>
                              각 분야별 5문제 이상 풀면 퍼스널 트레이닝 레벨로 진입합니다.
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
      </main>

      {/* Bookmarks Modal */}
      <AnimatePresence>
        {showResetConfirm && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
              onClick={() => setShowResetConfirm(false)}
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-sm bg-white rounded-[32px] shadow-2xl p-8 text-center"
            >
              <h3 className="text-2xl font-black text-slate-800 tracking-tight mb-4">처음부터 다시 풀기</h3>
              <p className="text-slate-500 mb-8">
                문제를 처음부터 다시 풀어보겠어요?
                <br />
                저장된 학습 기록과 북마크가 모두 초기화됩니다.
              </p>

              <div className="flex flex-col gap-3">
                <button
                  type="button"
                  onClick={() => void handleStartOver()}
                  className="w-full py-4 rounded-2xl bg-rose-500 text-white font-bold hover:bg-rose-600 transition-colors shadow-lg shadow-rose-200"
                >
                  예
                </button>
                <button
                  type="button"
                  onClick={() => setShowResetConfirm(false)}
                  className="w-full py-4 rounded-2xl bg-slate-100 text-slate-600 font-bold hover:bg-slate-200 transition-colors"
                >
                  아니오
                </button>
              </div>
            </motion.div>
          </div>
        )}

        {showBookmarks && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setShowBookmarks(false)}
              className="absolute inset-0 bg-slate-900/60 backdrop-blur-sm"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.95, y: 20 }}
              animate={{ opacity: 1, scale: 1, y: 0 }}
              exit={{ opacity: 0, scale: 0.95, y: 20 }}
              className="relative w-full max-w-lg bg-white rounded-[32px] shadow-2xl overflow-hidden border border-slate-100"
            >
              <div className="p-8 border-b border-slate-50 flex flex-col bg-white sticky top-0 z-10">
                <div className="flex items-center justify-between mb-6">
                  <div>
                    <h3 className="text-2xl font-black text-slate-800 tracking-tight">저장된 북마크</h3>
                  </div>
                  <button 
                    onClick={() => setShowBookmarks(false)}
                    className="p-2.5 rounded-2xl bg-slate-50 text-slate-400 hover:bg-slate-100 transition-colors"
                  >
                    <X className="w-6 h-6" />
                  </button>
                </div>
                
                <div className="flex bg-slate-100 p-1 rounded-2xl">
                  <button
                    onClick={() => {
                      setBookmarkTab('word');
                      setUnseenWordBookmarks(new Set());
                    }}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all relative ${bookmarkTab === 'word' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    단어
                    {unseenWordBookmarks.size > 0 && (
                      <span className="flex h-5 items-center justify-center rounded-full bg-rose-500 px-2 text-[10px] font-bold text-white shadow-sm">
                        {unseenWordBookmarks.size}
                      </span>
                    )}
                  </button>
                  <button
                    onClick={() => {
                      setBookmarkTab('question');
                      setUnseenQuestionBookmarks(new Set());
                    }}
                    className={`flex-1 flex items-center justify-center gap-2 py-3 rounded-xl font-bold transition-all relative ${bookmarkTab === 'question' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}
                  >
                    문제
                    {unseenQuestionBookmarks.size > 0 && (
                      <span className="flex h-5 items-center justify-center rounded-full bg-rose-500 px-2 text-[10px] font-bold text-white shadow-sm">
                        {unseenQuestionBookmarks.size}
                      </span>
                    )}
                  </button>
                </div>
              </div>
              
              <div className="p-4 max-h-[60vh] overflow-y-auto">
                {bookmarkTab === 'word' ? (
                  userState.bookmarks.length === 0 ? (
                    <div className="py-20 text-center flex flex-col items-center">
                      <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-200 mb-4">
                        <BookmarkIcon className="w-10 h-10" />
                      </div>
                      <p className="text-slate-400 font-bold">아직 저장된 단어가 없습니다.</p>
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 gap-2">
                      {userState.bookmarks.sort((a, b) => b.timestamp - a.timestamp).map((bookmark, idx) => (
                        <motion.div 
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          key={bookmark.word}
                          className="p-5 rounded-2xl bg-slate-50 hover:bg-indigo-50/50 border border-transparent hover:border-indigo-100 transition-all flex items-center justify-between group"
                        >
                          <div className="flex flex-col">
                            <span className="text-xl font-black text-slate-800">{bookmark.word}</span>
                            <span className="text-sm font-bold text-indigo-600">{bookmark.meaning}</span>
                          </div>
                          <button 
                            onClick={() => void toggleBookmark(`${bookmark.word}: ${bookmark.meaning}`)}
                            className="p-2 rounded-xl text-rose-300 hover:text-rose-500 hover:bg-rose-50 transition-all"
                          >
                            <BookmarkIcon className="w-5 h-5 fill-current" />
                          </button>
                        </motion.div>
                      ))}
                    </div>
                  )
                ) : (
                  userState.bookmarkedQuestions.length === 0 ? (
                    <div className="py-20 text-center flex flex-col items-center">
                      <div className="w-20 h-20 bg-slate-50 rounded-3xl flex items-center justify-center text-slate-200 mb-4">
                        <BookmarkIcon className="w-10 h-10" />
                      </div>
                      <p className="text-slate-400 font-bold">아직 저장된 문제가 없습니다.</p>
                    </div>
                  ) : (
                    <div className="flex flex-col gap-6">
                      {userState.bookmarkedQuestions.map((q, idx) => (
                        <motion.div 
                          initial={{ opacity: 0, y: 10 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.05 }}
                          key={q.id}
                        >
                          <BookmarkedQuestionItem 
                            question={q} 
                            onRemove={() => void toggleQuestionBookmark(q)} 
                          />
                        </motion.div>
                      ))}
                    </div>
                  )
                )}
              </div>
              
              <div className="p-8 bg-slate-50 border-t border-slate-100">
                <button 
                  onClick={() => setShowBookmarks(false)}
                  className="w-full py-4 bg-white border border-slate-200 rounded-2xl text-slate-600 font-black shadow-sm hover:bg-slate-50 transition-all"
                >
                  학습으로 돌아가기
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
