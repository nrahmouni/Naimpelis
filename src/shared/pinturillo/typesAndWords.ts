export const PINTURILLO_MAX_PLAYERS = 6;
export const PINTURILLO_CHOOSE_MS = 12_000;
export const PINTURILLO_ROUND_MS = 60_000;
export const PINTURILLO_ROUND_END_MS = 4_500;

export interface PinturilloStrokePoint {
  x: number; // Normalized 0..1
  y: number; // Normalized 0..1
}

export interface PinturilloStroke {
  id: string;
  color: string;
  size: number;
  isEraser?: boolean;
  points: PinturilloStrokePoint[];
}

export interface PinturilloWordEntry {
  id: string;
  es: string;
  en: string;
}

export interface PinturilloPlayer {
  seatIndex: number;
  userId: string;
  name: string;
  avatar: string;
  color: string;
  isBot: boolean;
  score: number;
  streak: number;
  hasGuessedThisRound: boolean;
  roundPoints: number;
}

export interface PinturilloGuessEntry {
  id: string;
  userId: string;
  userName: string;
  text: string;
  kind: 'guess' | 'close' | 'correct' | 'system';
  pointsAwarded?: number;
  timestamp: number;
}

export interface PinturilloGameState {
  id: string;
  gameType: 'pinturillo';
  status: 'waiting' | 'choosing' | 'drawing' | 'round_end' | 'finished';
  players: PinturilloPlayer[];
  round: number;
  totalRounds: number;
  drawerSeat: number;
  wordChoices: PinturilloWordEntry[];
  secretWord: PinturilloWordEntry | null;
  maskedWord: string;
  wordLength: number;
  hintIndices: number[];
  strokes: PinturilloStroke[];
  guesses: PinturilloGuessEntry[];
  phaseDeadlineAt: number;
  winnerSeat: number | null;
  updatedAt: number;
}

export const PINTURILLO_SWATCHES = [
  '#18181B',
  '#FFFFFF',
  '#EF4444',
  '#F97316',
  '#FACC15',
  '#22C55E',
  '#06B6D4',
  '#3B82F6',
  '#9146FF',
  '#EC4899',
];

export const PINTURILLO_WORDS: PinturilloWordEntry[] = [
  { id: 'sol', es: 'Sol', en: 'Sun' },
  { id: 'casa', es: 'Casa', en: 'House' },
  { id: 'arbol', es: 'Árbol', en: 'Tree' },
  { id: 'cohete', es: 'Cohete', en: 'Rocket' },
  { id: 'corazon', es: 'Corazón', en: 'Heart' },
  { id: 'estrella', es: 'Estrella', en: 'Star' },
  { id: 'pez', es: 'Pez', en: 'Fish' },
  { id: 'coche', es: 'Coche', en: 'Car' },
  { id: 'gato', es: 'Gato', en: 'Cat' },
  { id: 'montana', es: 'Montaña', en: 'Mountain' },
  { id: 'pizza', es: 'Pizza', en: 'Pizza' },
  { id: 'reloj', es: 'Reloj', en: 'Clock' },
  { id: 'barco', es: 'Barco', en: 'Boat' },
  { id: 'robot', es: 'Robot', en: 'Robot' },
  { id: 'corona', es: 'Corona', en: 'Crown' },
  { id: 'paraguas', es: 'Paraguas', en: 'Umbrella' },
  { id: 'luna', es: 'Luna', en: 'Moon' },
  { id: 'flor', es: 'Flor', en: 'Flower' },
  { id: 'helado', es: 'Helado', en: 'Ice Cream' },
  { id: 'guitarra', es: 'Guitarra', en: 'Guitar' },
  { id: 'gafas', es: 'Gafas', en: 'Glasses' },
  { id: 'llave', es: 'Llave', en: 'Key' },
  { id: 'manzana', es: 'Manzana', en: 'Apple' },
  { id: 'trofeo', es: 'Trofeo', en: 'Trophy' },
];

export const PINTURILLO_BOT_PROFILES: Array<{ name: string; avatar: string; color: string }> = [
  { name: 'Poca-solta', avatar: '🤪', color: '#F59E0B' },
  { name: 'Machupichu', avatar: '🗿', color: '#EC4899' },
  { name: 'Botifler', avatar: '🥖', color: '#10B981' },
  { name: 'Pallús', avatar: '🤡', color: '#38BDF8' },
  { name: 'Tòtil', avatar: '🥴', color: '#A855F7' },
  { name: 'Nyicris', avatar: '🤏', color: '#EF4444' },
];

export const PINTURILLO_BOT_FILLER_GUESSES = [
  '¿casa?',
  'perro',
  'montaña',
  'luna',
  'nube',
  'pelota',
  'mesa',
  'avión',
  'camión',
  'castillo',
];

export function normalizePinturilloGuess(input: string): string {
  return String(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function pinturilloLevenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  const dp = Array.from({ length: a.length + 1 }, (_, i) => i);
  for (let j = 1; j <= b.length; j += 1) {
    let prev = dp[0];
    dp[0] = j;
    for (let i = 1; i <= a.length; i += 1) {
      const temp = dp[i];
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i] = Math.min(dp[i] + 1, dp[i - 1] + 1, prev + cost);
      prev = temp;
    }
  }
  return dp[a.length];
}

export function pickRandomWordChoices(excludeIds: string[] = []): PinturilloWordEntry[] {
  const pool = PINTURILLO_WORDS.filter((w) => !excludeIds.includes(w.id));
  const src = pool.length >= 3 ? [...pool] : [...PINTURILLO_WORDS];
  for (let i = src.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [src[i], src[j]] = [src[j], src[i]];
  }
  return src.slice(0, 3);
}

export function formatMaskedWord(word: string, hintIndices: number[]): string {
  return Array.from(word)
    .map((ch, idx) => {
      if (ch === ' ') return '  ';
      if (hintIndices.includes(idx)) return ch.toUpperCase();
      return '_';
    })
    .join(' ');
}
