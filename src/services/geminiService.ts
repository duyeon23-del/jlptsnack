/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { GoogleGenAI, Type, Modality } from "@google/genai";
import { Question, QuestionType } from "../types";

const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
  2. FURIGANA IS REQUIRED for all Kanji in these fields, using the format: KANJI(FURIGANA) (e.g., 学校(がっこう)).
  3. CRITICAL: NEVER INCLUDE THE ANSWER IN THE QUESTION OR CONTEXT!
  4. The "explanation", "tip", and "keywords" MUST be in Korean.
  5. For N5G (Grammar), include "sentence ordering" (★) questions.
  6. For N5L (Listening), provide a situational dialogue in Japanese text in "context" field.
  7. For N5R (Reading), keep it short (3-5 sentences).
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
    
    const questions = JSON.parse(jsonStr) as Question[];
    
    // Ensure the type matches the requested category exactly
    return questions.map(q => ({
      ...q,
      type: category
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
