import type {
  AppLanguage,
  CatalogMovie,
  SpanishTdtChannel,
  SportsMatch,
} from '../../types';

export interface VoiceCandidateItem {
  kind: 'channel' | 'movie' | 'series' | 'match';
  id: string;
  title: string;
  subtitle?: string;
  imageUrl?: string;
  badge?: string;
  targetSeason?: number;
  targetEpisode?: number;
  channel?: SpanishTdtChannel;
  media?: CatalogMovie & { targetSeason?: number; targetEpisode?: number };
  match?: SportsMatch;
}

export interface VoiceAssistantAppAction {
  type: 'open_world' | 'player_control' | 'open_friends' | 'surprise_me';
  payload?: string;
}

export interface ConversationMessage {
  id: string;
  role: 'user' | 'assistant';
  text: string;
}

interface SpeechRecognitionAlternativeLike {
  transcript: string;
}

interface SpeechRecognitionResultLike {
  isFinal: boolean;
  [idx: number]: SpeechRecognitionAlternativeLike;
}

interface SpeechRecognitionEventLike extends Event {
  results: {
    length: number;
    [idx: number]: SpeechRecognitionResultLike;
  };
}

export interface SpeechRecognitionLike extends EventTarget {
  lang: string;
  interimResults: boolean;
  continuous: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((ev: SpeechRecognitionEventLike) => void) | null;
  onerror: ((ev: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
}

export function getSpeechRecognitionCtor(): (new () => SpeechRecognitionLike) | null {
  if (typeof window === 'undefined') return null;
  const w = window as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  };
  return w.SpeechRecognition || w.webkitSpeechRecognition || null;
}

export function resolveSpeechLocale(lang: AppLanguage): string {
  if (lang === 'ca') return 'ca-ES';
  if (lang === 'en') return 'en-US';
  if (lang === 'zh') return 'zh-CN';
  return 'es-ES';
}

export function findVirtualAssistantVoice(targetLang: AppLanguage): SpeechSynthesisVoice | null {
  if (typeof window === 'undefined' || !('speechSynthesis' in window)) return null;
  const voices = window.speechSynthesis.getVoices();
  if (!voices || voices.length === 0) return null;

  const prefix =
    targetLang === 'ca' ? 'ca' : targetLang === 'en' ? 'en' : targetLang === 'zh' ? 'zh' : 'es';
  const langVoices = voices.filter((v) => v.lang.toLowerCase().startsWith(prefix));
  const pool = langVoices.length > 0 ? langVoices : voices;

  const priorityKeywords = [
    'google',
    'natural',
    'neural',
    'online',
    'elvira',
    'helena',
    'monica',
    'mónica',
    'lucia',
    'lucía',
    'alvaro',
    'jorge',
    'samantha',
    'xiaoxiao',
    'tingting',
  ];

  for (const kw of priorityKeywords) {
    const found = pool.find((v) => v.name.toLowerCase().includes(kw));
    if (found) return found;
  }

  return pool[0] || null;
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const base64 = result.includes(',') ? result.split(',')[1] : result;
      resolve(base64);
    };
    reader.onerror = () => reject(reader.error || new Error('FileReader failed'));
    reader.readAsDataURL(blob);
  });
}

export function downsampleTo16k(float32: Float32Array, inputSampleRate: number): Float32Array {
  if (inputSampleRate === 16000 || inputSampleRate <= 0) return float32;
  const ratio = inputSampleRate / 16000;
  const newLength = Math.max(1, Math.round(float32.length / ratio));
  const result = new Float32Array(newLength);
  let offsetResult = 0;
  let offsetBuffer = 0;
  while (offsetResult < result.length) {
    const nextOffsetBuffer = Math.min(float32.length, Math.round((offsetResult + 1) * ratio));
    let accum = 0;
    let count = 0;
    for (let i = offsetBuffer; i < nextOffsetBuffer; i += 1) {
      accum += float32[i];
      count += 1;
    }
    result[offsetResult] = count > 0 ? accum / count : 0;
    offsetResult += 1;
    offsetBuffer = nextOffsetBuffer;
  }
  return result;
}

export function float32ToPcm16Base64(float32: Float32Array): string {
  const int16 = new Int16Array(float32.length);
  for (let i = 0; i < float32.length; i += 1) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    int16[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = new Uint8Array(int16.buffer);
  let binary = '';
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

export function base64Pcm16ToFloat32(base64: string): Float32Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  const int16 = new Int16Array(bytes.buffer);
  const float32 = new Float32Array(int16.length);
  for (let i = 0; i < int16.length; i += 1) {
    float32[i] = int16[i] / 0x8000;
  }
  return float32;
}

export function getQuickVoiceChips(lang: AppLanguage): string[] {
  const map: Record<AppLanguage, string[]> = {
    es: [
      'Ponme la película In Time',
      'Ponme el capítulo 2 de la temporada 2 de Juego de Tronos',
      'Dime las películas de Christopher Nolan',
      'Películas de Leonardo DiCaprio',
      '¿Cómo funciona un agujero negro?',
      'Ponme DAZN LaLiga',
    ],
    ca: [
      'Posa’m la pel·lícula In Time',
      'Posa’m el capítol 2 de la temporada 2 de Game of Thrones',
      'Digues-me les pel·lícules de Christopher Nolan',
      'Pel·lícules de Leonardo DiCaprio',
      'Com funciona un forat negre?',
      'Posa’m DAZN LaLiga',
    ],
    en: [
      'Play the movie In Time',
      'Play Game of Thrones season 2 episode 2',
      'Show me movies directed by Christopher Nolan',
      'Leonardo DiCaprio movies',
      'How does a black hole work?',
      'Play DAZN LaLiga',
    ],
    zh: [
      '播放电影 规划局 In Time',
      '播放 权力的游戏 第2季第2集',
      '克里斯托弗·诺兰导演的电影',
      '莱昂纳多·迪卡普里奥的电影',
      '黑洞是怎么形成的？',
      '播放 DAZN LaLiga',
    ],
    rif: [
      'Cɛel lfilm In Time',
      'Cɛel Game of Thrones T2 E2',
      'Lafilmat n Christopher Nolan',
      'Lafilmat n Leonardo DiCaprio',
      'Xzar takurt n uḍar DAZN LaLiga',
      'Melmi ara turar Barṣa?',
    ],
  };
  return map[lang] || map.es;
}
