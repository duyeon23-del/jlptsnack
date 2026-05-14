import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, XCircle, Lightbulb, ArrowRight, RefreshCcw, Volume2, Eye, EyeOff, Loader2, Bookmark as BookmarkIcon } from 'lucide-react';
import { Question } from '../types';
import { scrubJapaneseQuestionSurfaces } from '../services/geminiService';
import { getOrFetchListeningTtsFloat32 } from '../services/listeningTtsCache';

interface QuestionCardProps {
  question: Question;
  selectedOption: number | null;
  onSelect: (index: number) => void;
  isLocked: boolean;
  onNext?: () => void;
  isBookmarked?: boolean;
  onToggleBookmark?: () => void;
}

export const QuestionCard: React.FC<QuestionCardProps> = ({ question, selectedOption, onSelect, isLocked, onNext, isBookmarked, onToggleBookmark }) => {
  const displayQuestion = useMemo(() => scrubJapaneseQuestionSurfaces(question), [question]);

  const [showScript, setShowScript] = useState(false);
  const [audioState, setAudioState] = useState<'idle' | 'loading' | 'playing'>('idle');
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [cachedAudio, setCachedAudio] = useState<Float32Array | null>(null);
  const [hasListened, setHasListened] = useState(false);
  const animationRef = useRef<number>();
  const playbackRef = useRef<{ audioContext: AudioContext; source: AudioBufferSourceNode } | null>(null);

  const isListeningMode = displayQuestion.type === 'N5L';

  const listeningTtsSource = useMemo(() => {
    const raw = (displayQuestion.context || displayQuestion.question || '').trim();
    return raw;
  }, [displayQuestion.context, displayQuestion.question]);

  const getOrFetchTtsFloat32 = useCallback(
    (text: string) => getOrFetchListeningTtsFloat32(question.id, text),
    [question.id],
  );

  const endPlayback = useCallback((markListened: boolean) => {
    if (animationRef.current != null) {
      cancelAnimationFrame(animationRef.current);
      animationRef.current = undefined;
    }
    const p = playbackRef.current;
    if (p) {
      try {
        p.source.onended = null;
        p.source.stop(0);
      } catch {
        /* already stopped */
      }
      try {
        if (p.audioContext.state !== 'closed') void p.audioContext.close();
      } catch {
        /* */
      }
      playbackRef.current = null;
    }
    setAudioState('idle');
    setPlaybackProgress(0);
    if (markListened) setHasListened(true);
  }, []);

  useEffect(() => {
    setShowScript(false);
    setCachedAudio(null);
    setAudioState('idle');
    setPlaybackProgress(0);
    setHasListened(false);
    endPlayback(false);

    if (!isListeningMode || !listeningTtsSource) return;

    let cancelled = false;
    (async () => {
      try {
        const float32Data = await getOrFetchTtsFloat32(listeningTtsSource);
        if (cancelled) return;
        setCachedAudio(float32Data);
        setHasListened(true);
      } catch (e) {
        if (!cancelled) console.error('청해 TTS 프리페치 실패:', e);
      }
    })();

    return () => {
      cancelled = true;
      endPlayback(false);
    };
  }, [question.id, isListeningMode, listeningTtsSource, getOrFetchTtsFloat32, endPlayback]);

  useEffect(() => {
    if (!isListeningMode || !isLocked || selectedOption === null) return;
    if (selectedOption !== question.answerIndex) return;
    endPlayback(false);
  }, [isListeningMode, isLocked, selectedOption, question.answerIndex, endPlayback]);

  const handlePlayAudio = async () => {
    if (audioState !== 'idle') return;

    try {
      let float32Data = cachedAudio;
      if (!float32Data && listeningTtsSource) {
        setAudioState('loading');
        float32Data = await getOrFetchTtsFloat32(listeningTtsSource);
        if (!float32Data) return;
        setCachedAudio(float32Data);
      }
      if (!float32Data) return;

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioBuffer = audioContext.createBuffer(1, float32Data.length, 24000);
      audioBuffer.getChannelData(0).set(float32Data);

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);

      playbackRef.current = { audioContext, source };
      setAudioState('playing');

      const startTime = audioContext.currentTime;
      const duration = audioBuffer.duration;

      const updateProgress = () => {
        if (audioContext.state === 'closed') return;
        const elapsed = audioContext.currentTime - startTime;
        const currentProgress = Math.min(elapsed / duration, 1);
        setPlaybackProgress(currentProgress);

        if (currentProgress < 1) {
          animationRef.current = requestAnimationFrame(updateProgress);
        }
      };

      source.onended = () => {
        endPlayback(true);
      };

      source.start();
      animationRef.current = requestAnimationFrame(updateProgress);
    } catch (error) {
      console.error('Playback failed:', error);
      endPlayback(false);
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      className="bg-white rounded-3xl p-8 shadow-xl border border-slate-100 relative overflow-hidden"
    >
      <div className="absolute top-0 left-0 w-2 h-full bg-indigo-500"></div>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="flex min-w-0 items-start gap-2">
          <span className="mt-0.5 shrink-0 rounded-lg bg-indigo-50 p-1.5 text-indigo-600">
            <CheckCircle2 className="h-5 w-5" />
          </span>
          <span className="min-w-0 text-sm font-bold uppercase leading-snug tracking-wide text-indigo-900">
            {displayQuestion.title}
          </span>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-2 sm:justify-end">
          {isListeningMode && !isLocked && (
            <>
              <button
                type="button"
                onClick={handlePlayAudio}
                disabled={audioState !== 'idle'}
                className="relative flex shrink-0 items-center gap-2 overflow-hidden rounded-xl bg-indigo-600 px-4 py-2 text-sm font-bold text-white shadow-md shadow-indigo-100 transition-all hover:bg-indigo-700 disabled:opacity-50"
              >
                {audioState === 'playing' && (
                  <div
                    className="absolute inset-0 origin-left bg-indigo-800 transition-none"
                    style={{ transform: `scaleX(${playbackProgress})` }}
                  />
                )}
                <span className="relative z-10 flex items-center gap-2">
                  {audioState === 'loading' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Volume2 className="h-4 w-4" />
                  )}
                  {audioState === 'playing'
                    ? `${Math.round(playbackProgress * 100)}%`
                    : hasListened
                      ? '다시 듣기'
                      : '문제듣기'}
                </span>
              </button>
              <button
                type="button"
                onClick={() => setShowScript(!showScript)}
                className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2 text-sm font-bold transition-all ${showScript ? 'bg-slate-100 text-slate-600' : 'border border-slate-200 bg-slate-50 text-slate-400'}`}
              >
                {showScript ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                지문보기
              </button>
            </>
          )}
          {isLocked && onNext && (
            <>
              <button
                type="button"
                onClick={onToggleBookmark}
                className={`shrink-0 rounded-xl border p-2.5 transition-all ${isBookmarked ? 'border-indigo-200 bg-indigo-50 text-indigo-600' : 'border-slate-200 bg-white text-slate-400 hover:bg-slate-50 hover:text-indigo-500'}`}
              >
                <BookmarkIcon className={`h-5 w-5 ${isBookmarked ? 'fill-current' : ''}`} />
              </button>
              <button
                type="button"
                onClick={onNext}
                className={`inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-xl px-5 py-2.5 text-sm font-bold text-white shadow-lg transition-[box-shadow,filter] hover:brightness-110 active:brightness-95 ${selectedOption === question.answerIndex ? 'bg-emerald-500 shadow-emerald-200' : 'bg-indigo-600 shadow-indigo-200'}`}
              >
                다음 문제 →
              </button>
            </>
          )}
        </div>
      </div>

      <div className="space-y-6 mb-8">
        {displayQuestion.context && (
          <motion.div 
            className="p-5 bg-slate-50 rounded-2xl border border-slate-100 text-slate-700 text-base leading-relaxed whitespace-pre-wrap italic shadow-inner"
          >
            {isListeningMode && !showScript ? '지문보기를 클릭하면 지문이 노출됩니다' : displayQuestion.context}
          </motion.div>
        )}
        
        <h3 className="text-2xl font-bold text-slate-800 leading-tight">
          {displayQuestion.question}
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {displayQuestion.options.map((option, idx) => {
          const isSelected = selectedOption === idx;
          const isCorrect = idx === question.answerIndex;
          
          let cardStyle = "bg-slate-50 border-slate-100 text-slate-700";
          let circleStyle = "bg-white border-slate-200 text-slate-400";

          if (isLocked) {
            if (isCorrect) {
              cardStyle = "bg-emerald-50 border-emerald-400 ring-1 ring-emerald-100 text-emerald-800";
              circleStyle = "bg-emerald-500 border-emerald-500 text-white";
            } else if (isSelected) {
              cardStyle = "bg-rose-50 border-rose-400 ring-1 ring-rose-100 text-rose-800";
              circleStyle = "bg-rose-500 border-rose-500 text-white";
            } else {
              cardStyle = "bg-slate-50 border-slate-100 text-slate-400 opacity-60";
            }
          } else if (isSelected) {
            cardStyle = "bg-indigo-50 border-indigo-400 ring-1 ring-indigo-100 text-indigo-800";
            circleStyle = "bg-indigo-500 border-indigo-500 text-white";
          }

          return (
            <button
              key={idx}
              id={`option-${idx}`}
              onClick={() => !isLocked && onSelect(idx)}
              disabled={isLocked}
              className={`flex items-center p-5 rounded-2xl border-2 transition-all duration-200 text-left group shadow-sm ${cardStyle} ${!isLocked && 'hover:border-indigo-300 hover:bg-white cursor-pointer'}`}
            >
              <span className={`w-8 h-8 rounded-full border flex items-center justify-center mr-4 shrink-0 transition-colors font-bold text-sm ${circleStyle} ${!isLocked && 'group-hover:bg-indigo-500 group-hover:text-white group-hover:border-indigo-500'}`}>
                {idx + 1}
              </span>
              <span className="text-lg font-medium">{option}</span>
            </button>
          );
        })}
      </div>
    </motion.div>
  );
};

interface FeedbackProps {
  isCorrect: boolean;
  explanation: string;
  tip: string;
  keywords: string[];
  onRetry: () => void;
}

export const Feedback: React.FC<FeedbackProps> = ({ isCorrect, explanation, tip, keywords, onRetry }) => {
  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: 'auto' }}
      className="mt-6 space-y-6"
    >
      <div className={`p-6 rounded-3xl border shadow-sm ${isCorrect ? 'bg-emerald-50 border-emerald-100' : 'bg-rose-50 border-rose-100'}`}>
        <div className="flex items-center mb-4 gap-2">
          <div className={`w-8 h-8 rounded-full flex items-center justify-center text-white ${isCorrect ? 'bg-emerald-500' : 'bg-rose-500'}`}>
            {isCorrect ? (
              <CheckCircle2 className="w-5 h-5" />
            ) : (
              <XCircle className="w-5 h-5" />
            )}
          </div>
          <h4 className={`font-bold text-lg ${isCorrect ? 'text-emerald-800' : 'text-rose-800'}`}>
            {isCorrect ? '정답입니다! (Correct!)' : '아쉽네요. 다시 확인해볼까요?'}
          </h4>
        </div>
        
        <p className={`mb-4 italic ${isCorrect ? 'text-emerald-700' : 'text-rose-700'}`}>
          해설: {explanation}
        </p>
        
        <div className={`flex items-center gap-2 text-sm ${isCorrect ? 'text-emerald-800' : 'text-rose-800'}`}>
          <span className="font-bold shrink-0">💡 Tip:</span>
          <span>{tip}</span>
        </div>
      </div>

    </motion.div>
  );
};
