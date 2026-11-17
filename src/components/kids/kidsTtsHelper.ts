import { KIDS_LANGUAGES } from './kidsData';
import type { KidsAgeGroup, KidsLanguageCode } from '../../types';

const ttsCache = new Map<string, string>();
let activeAudioEl: HTMLAudioElement | null = null;

const CAPABILITY_TTL_MS = 5 * 60_000;
let cachedTtsAvailable: boolean | null = null;
let cachedTtsCheckedAt = 0;
let capabilityInFlight: Promise<boolean> | null = null;

export function resetKidsTtsCapabilityCache(): void {
  cachedTtsAvailable = null;
  cachedTtsCheckedAt = 0;
  capabilityInFlight = null;
  ttsCache.clear();
}

async function isGeminiTtsAvailable(): Promise<boolean> {
  const now = Date.now();
  if (cachedTtsAvailable !== null && now - cachedTtsCheckedAt < CAPABILITY_TTL_MS) {
    return cachedTtsAvailable;
  }
  if (capabilityInFlight) {
    return capabilityInFlight;
  }

  capabilityInFlight = (async () => {
    try {
      const res = await fetch('/api/kids/capabilities', { method: 'GET' });
      if (!res.ok) {
        return false;
      }
      const data = (await res.json()) as { ok?: boolean; ttsAvailable?: boolean };
      const available = Boolean(data?.ok && data?.ttsAvailable);
      cachedTtsAvailable = available;
      cachedTtsCheckedAt = Date.now();
      return available;
    } catch {
      cachedTtsAvailable = false;
      cachedTtsCheckedAt = Date.now();
      return false;
    } finally {
      capabilityInFlight = null;
    }
  })();

  return capabilityInFlight;
}

export interface SpeakKidsOptions {
  style?: string;
  ageGroup?: KidsAgeGroup;
  rate?: number;
}

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

function getAgeRate(ageGroup?: KidsAgeGroup, customRate?: number): number {
  if (typeof customRate === 'number' && Number.isFinite(customRate)) {
    return Math.max(0.65, Math.min(1.25, customRate));
  }
  if (ageGroup === '3-5') return 0.82;
  if (ageGroup === '9-12') return 1.0;
  return 0.92;
}

function pickBestBrowserVoice(speechCode: string): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  try {
    const voices = window.speechSynthesis.getVoices();
    if (!voices || voices.length === 0) return null;
    const targetLower = speechCode.toLowerCase();
    const prefix = targetLower.split('-')[0];
    return (
      voices.find((v) => v.lang.toLowerCase() === targetLower) ||
      voices.find((v) => v.lang.toLowerCase().startsWith(`${prefix}-`)) ||
      voices.find((v) => v.lang.toLowerCase().startsWith(prefix)) ||
      null
    );
  } catch {
    return null;
  }
}

function speakWithBrowserFallback(
  text: string,
  lang: KidsLanguageCode,
  options?: SpeakKidsOptions
): void {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return;
  try {
    window.speechSynthesis.cancel();
    const utter = new SpeechSynthesisUtterance(text);
    const meta = KIDS_LANGUAGES.find((l) => l.code === lang);
    const speechCode = meta?.speechCode || 'es-ES';
    utter.lang = speechCode;
    const matchedVoice = pickBestBrowserVoice(speechCode);
    if (matchedVoice) {
      utter.voice = matchedVoice;
    }
    utter.rate = getAgeRate(options?.ageGroup, options?.rate);
    utter.pitch = options?.ageGroup === '3-5' ? 1.14 : 1.06;
    window.speechSynthesis.speak(utter);
  } catch {
    // ignore
  }
}

/**
 * Plays studio Gemini 3.8 Flash-Lite TTS pronunciation (cached per phrase+lang)
 * with age-adaptive speech rate and smart Web Speech API voice fallback.
 */
export async function speakKidsText(
  text: string,
  lang: KidsLanguageCode,
  styleOrOptions?: string | SpeakKidsOptions
): Promise<'gemini' | 'browser' | 'silent'> {
  const cleanText = text.trim();
  if (!cleanText) return 'silent';

  const options: SpeakKidsOptions | undefined =
    typeof styleOrOptions === 'string' ? { style: styleOrOptions } : styleOrOptions;

  stopKidsSpeech();

  const cacheKey = `${lang}::${cleanText}`;
  const cachedBase64 = ttsCache.get(cacheKey);
  if (cachedBase64) {
    try {
      const audio = new Audio(`data:audio/wav;base64,${cachedBase64}`);
      audio.playbackRate = getAgeRate(options?.ageGroup, options?.rate);
      activeAudioEl = audio;
      await audio.play();
      return 'gemini';
    } catch {
      // fallback below
    }
  }

  try {
    const canUseGeminiTts = await isGeminiTtsAvailable();
    if (canUseGeminiTts) {
      const res = await fetch('/api/kids/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: cleanText, lang, style: options?.style }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data?.ok && data?.audioBase64) {
          ttsCache.set(cacheKey, String(data.audioBase64));
          const audio = new Audio(`data:audio/wav;base64,${data.audioBase64}`);
          audio.playbackRate = getAgeRate(options?.ageGroup, options?.rate);
          activeAudioEl = audio;
          await audio.play();
          return 'gemini';
        }
      } else if (res.status === 503 || res.status === 403 || res.status === 400) {
        cachedTtsAvailable = false;
        cachedTtsCheckedAt = Date.now();
      }
    }
  } catch {
    // fallback to browser SpeechSynthesis below
  }

  speakWithBrowserFallback(cleanText, lang, options);
  return 'browser';
}
