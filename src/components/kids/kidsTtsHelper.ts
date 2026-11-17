import { KIDS_LANGUAGES } from './kidsData';
import type { KidsLanguageCode } from '../../types';

const ttsCache = new Map<string, string>();
let activeAudioEl: HTMLAudioElement | null = null;

export function stopKidsSpeech(): void {
  if (activeAudioEl) {
    try {
      activeAudioEl.pause();
      activeAudioEl.currentTime = 0;
    } catch {
      // ignore
    }
    activeAudioEl = null;
  }
  if (typeof window !== 'undefined' && 'speechSynthesis' in window) {
    try {
      window.speechSynthesis.cancel();
    } catch {
      // ignore
    }
  }
}

function speakWithBrowserFallback(text: string, lang: KidsLanguageCode): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    const meta = KIDS_LANGUAGES.find((l) => l.code === lang);
    utter.lang = meta?.speechCode || 'es-ES';
    utter.rate = 0.92;
    utter.pitch = 1.08;
    window.speechSynthesis.speak(utter);
  } catch {
    // ignore
  }
}

/**
 * Plays studio Gemini 3.8 Flash-Lite TTS pronunciation (cached per phrase+lang)
 * with graceful Web Speech API fallback when offline or unconfigured.
 */
export async function speakKidsText(
  text: string,
  lang: KidsLanguageCode,
  style?: string
): Promise<'gemini' | 'browser' | 'silent'> {
  const cleanText = text.trim();
  if (!cleanText) return 'silent';

  stopKidsSpeech();

  const cacheKey = `${lang}::${cleanText}`;
  const cachedBase64 = ttsCache.get(cacheKey);
  if (cachedBase64) {
    try {
      const audio = new Audio(`data:audio/wav;base64,${cachedBase64}`);
      activeAudioEl = audio;
      await audio.play();
      return 'gemini';
    } catch {
      // fallback below
    }
  }

  try {
    const res = await fetch('/api/kids/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text: cleanText, lang, style }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.ok && data?.audioBase64) {
        ttsCache.set(cacheKey, String(data.audioBase64));
        const audio = new Audio(`data:audio/wav;base64,${data.audioBase64}`);
        activeAudioEl = audio;
        await audio.play();
        return 'gemini';
      }
    }
  } catch {
    // fallback to browser SpeechSynthesis below
  }

  speakWithBrowserFallback(cleanText, lang);
  return 'browser';
}
