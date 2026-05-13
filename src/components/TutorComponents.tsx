import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { CheckCircle2, XCircle, Lightbulb, ArrowRight, RefreshCcw, Volume2, Eye, EyeOff, Loader2, Bookmark as BookmarkIcon } from 'lucide-react';
import { Question } from '../types';
import { getTextToSpeech } from '../services/geminiService';

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
  const [showScript, setShowScript] = useState(false);
  const [audioState, setAudioState] = useState<'idle' | 'loading' | 'playing'>('idle');
  const [playbackProgress, setPlaybackProgress] = useState(0);
  const [cachedAudio, setCachedAudio] = useState<Float32Array | null>(null);
  const [hasListened, setHasListened] = useState(false);
  const animationRef = useRef<number>();

  const isListeningMode = question.type === 'N5L';

  useEffect(() => {
    // Reset state when question changes
    setShowScript(false);
    setCachedAudio(null);
    setAudioState('idle');
    setPlaybackProgress(0);
    setHasListened(false);
    if (animationRef.current) cancelAnimationFrame(animationRef.current);
  }, [question.id]);

  const handlePlayAudio = async () => {
    if (audioState !== 'idle') return;
    setAudioState('loading');
    setPlaybackProgress(0);

    try {
      let float32Data = cachedAudio;

      // 만약 캐시된 오디오 데이터가 없다면 API 호출을 통해 새로 생성합니다.
      if (!float32Data) {
        console.log("Generating new TTS audio via API...");
        const base64 = await getTextToSpeech(question.context || question.question);
        
        // Base64를 ArrayBuffer로 변환
        const binaryString = window.atob(base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) {
          bytes[i] = binaryString.charCodeAt(i);
        }
        
        const arrayBuffer = bytes.buffer;
        // Gemini TTS raw PCM은 보통 16-bit signed integer입니다.
        const pcmData = new Int16Array(arrayBuffer);
        float32Data = new Float32Array(pcmData.length);
        for (let i = 0; i < pcmData.length; i++) {
          float32Data[i] = pcmData[i] / 32768.0;
        }
        
        // 자체 상태(캐시)에 저장하여 다음 '또 듣기' 시에 활용합니다.
        setCachedAudio(float32Data);
      } else {
        console.log("Playing cached audio data...");
      }

      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const audioBuffer = audioContext.createBuffer(1, float32Data.length, 24000);
      audioBuffer.getChannelData(0).set(float32Data);

      const source = audioContext.createBufferSource();
      source.buffer = audioBuffer;
      source.connect(audioContext.destination);
      
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
        setAudioState('idle');
        setHasListened(true);
        setPlaybackProgress(0);
        if (animationRef.current) cancelAnimationFrame(animationRef.current);
        audioContext.close(); // 자원 해제
      };
      
      source.start();
      animationRef.current = requestAnimationFrame(updateProgress);

    } catch (error) {
      console.error("Playback failed:", error);
      setAudioState('idle');
      setPlaybackProgress(0);
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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-2">
          <span className="p-1.5 bg-indigo-50 rounded-lg text-indigo-600">
            <CheckCircle2 className="w-5 h-5" />
          </span>
          <span className="font-bold text-indigo-900 uppercase tracking-wide text-sm">{question.title}</span>
        </div>
        <div className="flex items-center gap-2">
          {isListeningMode && (
            <>
               <button 
                 onClick={handlePlayAudio}
                 disabled={audioState !== 'idle'}
                 className="relative overflow-hidden flex items-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-xl text-sm font-bold shadow-md shadow-indigo-100 hover:bg-indigo-700 transition-all disabled:opacity-50"
               >
                 {audioState === 'playing' && (
                   <div 
                     className="absolute inset-0 bg-indigo-800 transition-none origin-left"
                     style={{ transform: `scaleX(${playbackProgress})` }}
                   />
                 )}
                 <span className="relative z-10 flex items-center gap-2">
                   {audioState === 'loading' ? (
                     <Loader2 className="w-4 h-4 animate-spin" />
                   ) : (
                     <Volume2 className="w-4 h-4" />
                   )}
                   {audioState === 'playing' ? `${Math.round(playbackProgress * 100)}%` : hasListened ? '또 듣기' : '듣기'}
                 </span>
               </button>
               <button 
                 onClick={() => setShowScript(!showScript)}
                 className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-bold transition-all ${showScript ? 'bg-slate-100 text-slate-600' : 'bg-slate-50 text-slate-400 border border-slate-200'}`}
               >
                 {showScript ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                 지문보기
               </button>
            </>
          )}
          {isLocked && onNext && (
            <div className="flex items-center gap-2">
              <button 
                onClick={onToggleBookmark}
                className={`p-2.5 rounded-xl transition-all border ${isBookmarked ? 'bg-indigo-50 border-indigo-200 text-indigo-600' : 'bg-white border-slate-200 text-slate-400 hover:text-indigo-500 hover:bg-slate-50'}`}
              >
                <BookmarkIcon className={`w-5 h-5 ${isBookmarked ? 'fill-current' : ''}`} />
              </button>
              <button
                 onClick={onNext}
                 className={`px-6 py-2.5 text-white font-bold rounded-xl shadow-lg transition-all hover:scale-105 active:scale-95 ${selectedOption === question.answerIndex ? 'bg-emerald-500 shadow-emerald-200' : 'bg-indigo-600 shadow-indigo-200'}`}
               >
                 {selectedOption === question.answerIndex ? '다음 도전 →' : '다음 문제 →'}
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="space-y-6 mb-8">
        {question.context && (
          <motion.div 
            className="p-5 bg-slate-50 rounded-2xl border border-slate-100 text-slate-700 text-base leading-relaxed whitespace-pre-wrap italic shadow-inner"
          >
            {isListeningMode && !showScript ? '지문보기를 클릭하면 지문이 노출됩니다' : question.context}
          </motion.div>
        )}
        
        <h3 className="text-2xl font-bold text-slate-800 leading-tight">
          {question.question}
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {question.options.map((option, idx) => {
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
