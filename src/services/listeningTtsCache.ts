import { getTextToSpeech, scrubJapaneseQuestionSurfaces } from './geminiService';
import type { Question } from '../types';

function decodeGeminiTtsPcmBase64ToFloat32(base64: string): Float32Array {
  const binaryString = window.atob(base64);
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  const arrayBuffer = bytes.buffer;
  const pcmData = new Int16Array(arrayBuffer);
  const float32Data = new Float32Array(pcmData.length);
  for (let i = 0; i < pcmData.length; i++) {
    float32Data[i] = pcmData[i] / 32768.0;
  }
  return float32Data;
}

const inflight = new Map<string, Promise<Float32Array>>();

function cacheKey(questionId: string, text: string): string {
  return `${questionId}\0${text}`;
}

export function listeningTtsTextFromQuestion(q: Question): string {
  const d = scrubJapaneseQuestionSurfaces(q);
  return (d.context || d.question || '').trim();
}

export function getOrFetchListeningTtsFloat32(questionId: string, text: string): Promise<Float32Array> {
  const key = cacheKey(questionId, text);
  const hit = inflight.get(key);
  if (hit) return hit;
  const p = getTextToSpeech(text).then((base64) => decodeGeminiTtsPcmBase64ToFloat32(base64));
  inflight.set(key, p);
  return p;
}
