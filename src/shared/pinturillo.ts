/**
 * NAIM CINE — Pinturillo (Draw & Guess · 2–6 Players + AI Bots)
 * Server-authoritative multiplayer + offline AI game engine with bilingual ES/EN words,
 * close-guess Levenshtein detection, progressive letter hints, streak bonuses,
 * and procedural bot drawing templates.
 */

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

const BOT_PROFILES: Array<{ name: string; avatar: string; color: string }> = [
  { name: 'Poca-solta', avatar: '🤪', color: '#F59E0B' },
  { name: 'Machupichu', avatar: '🗿', color: '#EC4899' },
  { name: 'Botifler', avatar: '🥖', color: '#10B981' },
  { name: 'Pallús', avatar: '🤡', color: '#38BDF8' },
  { name: 'Tòtil', avatar: '🥴', color: '#A855F7' },
  { name: 'Nyicris', avatar: '🤏', color: '#EF4444' },
];

const BOT_FILLER_GUESSES = [
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

function makeCirclePoints(cx: number, cy: number, r: number, steps = 20): PinturilloStrokePoint[] {
  const pts: PinturilloStrokePoint[] = [];
  for (let i = 0; i <= steps; i += 1) {
    const a = (i / steps) * Math.PI * 2;
    pts.push({
      x: Number((cx + Math.cos(a) * r).toFixed(3)),
      y: Number((cy + Math.sin(a) * r).toFixed(3)),
    });
  }
  return pts;
}

/** Recognizable procedural strokes so AI Bot Drawers actually sketch the secret word step-by-step */
export function buildBotSketchStrokes(wordId: string): PinturilloStroke[] {
  const s = (
    idx: number,
    color: string,
    size: number,
    points: PinturilloStrokePoint[]
  ): PinturilloStroke => ({
    id: `bot-s-${wordId}-${idx}-${Date.now()}`,
    color,
    size,
    points,
  });

  switch (wordId) {
    case 'sol':
      return [
        s(0, '#FACC15', 7, makeCirclePoints(0.5, 0.5, 0.17)),
        s(1, '#F97316', 5, [{ x: 0.5, y: 0.25 }, { x: 0.5, y: 0.13 }]),
        s(2, '#F97316', 5, [{ x: 0.5, y: 0.75 }, { x: 0.5, y: 0.87 }]),
        s(3, '#F97316', 5, [{ x: 0.25, y: 0.5 }, { x: 0.13, y: 0.5 }]),
        s(4, '#F97316', 5, [{ x: 0.75, y: 0.5 }, { x: 0.87, y: 0.5 }]),
        s(5, '#FACC15', 5, [{ x: 0.33, y: 0.33 }, { x: 0.22, y: 0.22 }]),
        s(6, '#FACC15', 5, [{ x: 0.67, y: 0.67 }, { x: 0.78, y: 0.78 }]),
      ];
    case 'casa':
      return [
        s(0, '#18181B', 6, [
          { x: 0.28, y: 0.45 },
          { x: 0.28, y: 0.8 },
          { x: 0.72, y: 0.8 },
          { x: 0.72, y: 0.45 },
        ]),
        s(1, '#EF4444', 7, [
          { x: 0.22, y: 0.46 },
          { x: 0.5, y: 0.2 },
          { x: 0.78, y: 0.46 },
          { x: 0.22, y: 0.46 },
        ]),
        s(2, '#9146FF', 5, [
          { x: 0.44, y: 0.8 },
          { x: 0.44, y: 0.58 },
          { x: 0.56, y: 0.58 },
          { x: 0.56, y: 0.8 },
        ]),
        s(3, '#3B82F6', 4, [
          { x: 0.32, y: 0.54 },
          { x: 0.39, y: 0.54 },
          { x: 0.39, y: 0.62 },
          { x: 0.32, y: 0.62 },
          { x: 0.32, y: 0.54 },
        ]),
      ];
    case 'arbol':
      return [
        s(0, '#9A3412', 9, [
          { x: 0.46, y: 0.84 },
          { x: 0.46, y: 0.52 },
          { x: 0.54, y: 0.52 },
          { x: 0.54, y: 0.84 },
        ]),
        s(1, '#22C55E', 9, makeCirclePoints(0.5, 0.37, 0.21)),
        s(2, '#16A34A', 7, makeCirclePoints(0.38, 0.44, 0.13)),
        s(3, '#16A34A', 7, makeCirclePoints(0.62, 0.44, 0.13)),
      ];
    case 'cohete':
      return [
        s(0, '#3B82F6', 6, [
          { x: 0.5, y: 0.15 },
          { x: 0.38, y: 0.36 },
          { x: 0.38, y: 0.7 },
          { x: 0.62, y: 0.7 },
          { x: 0.62, y: 0.36 },
          { x: 0.5, y: 0.15 },
        ]),
        s(1, '#EF4444', 6, [
          { x: 0.38, y: 0.56 },
          { x: 0.26, y: 0.74 },
          { x: 0.38, y: 0.7 },
        ]),
        s(2, '#EF4444', 6, [
          { x: 0.62, y: 0.56 },
          { x: 0.74, y: 0.74 },
          { x: 0.62, y: 0.7 },
        ]),
        s(3, '#06B6D4', 5, makeCirclePoints(0.5, 0.43, 0.06)),
        s(4, '#F97316', 6, [
          { x: 0.44, y: 0.72 },
          { x: 0.5, y: 0.9 },
          { x: 0.56, y: 0.72 },
        ]),
      ];
    case 'corazon':
      return [
        s(0, '#EF4444', 8, [
          { x: 0.5, y: 0.78 },
          { x: 0.23, y: 0.48 },
          { x: 0.24, y: 0.3 },
          { x: 0.38, y: 0.24 },
          { x: 0.5, y: 0.36 },
          { x: 0.62, y: 0.24 },
          { x: 0.76, y: 0.3 },
          { x: 0.77, y: 0.48 },
          { x: 0.5, y: 0.78 },
        ]),
      ];
    case 'estrella':
      return [
        s(0, '#FACC15', 7, [
          { x: 0.5, y: 0.16 },
          { x: 0.6, y: 0.4 },
          { x: 0.85, y: 0.42 },
          { x: 0.66, y: 0.58 },
          { x: 0.72, y: 0.84 },
          { x: 0.5, y: 0.69 },
          { x: 0.28, y: 0.84 },
          { x: 0.34, y: 0.58 },
          { x: 0.15, y: 0.42 },
          { x: 0.4, y: 0.4 },
          { x: 0.5, y: 0.16 },
        ]),
      ];
    case 'pez':
      return [
        s(0, '#06B6D4', 7, [
          { x: 0.25, y: 0.5 },
          { x: 0.42, y: 0.32 },
          { x: 0.68, y: 0.42 },
          { x: 0.82, y: 0.3 },
          { x: 0.82, y: 0.7 },
          { x: 0.68, y: 0.58 },
          { x: 0.42, y: 0.68 },
          { x: 0.25, y: 0.5 },
        ]),
        s(1, '#18181B', 6, makeCirclePoints(0.36, 0.47, 0.03)),
      ];
    case 'coche':
      return [
        s(0, '#EF4444', 7, [
          { x: 0.18, y: 0.62 },
          { x: 0.22, y: 0.46 },
          { x: 0.34, y: 0.46 },
          { x: 0.4, y: 0.33 },
          { x: 0.64, y: 0.33 },
          { x: 0.72, y: 0.46 },
          { x: 0.83, y: 0.48 },
          { x: 0.83, y: 0.62 },
          { x: 0.18, y: 0.62 },
        ]),
        s(1, '#18181B', 7, makeCirclePoints(0.33, 0.67, 0.08)),
        s(2, '#18181B', 7, makeCirclePoints(0.68, 0.67, 0.08)),
      ];
    case 'gato':
      return [
        s(0, '#F97316', 6, makeCirclePoints(0.5, 0.54, 0.2)),
        s(1, '#F97316', 6, [
          { x: 0.34, y: 0.4 },
          { x: 0.32, y: 0.2 },
          { x: 0.45, y: 0.35 },
        ]),
        s(2, '#F97316', 6, [
          { x: 0.66, y: 0.4 },
          { x: 0.68, y: 0.2 },
          { x: 0.55, y: 0.35 },
        ]),
        s(3, '#18181B', 5, [{ x: 0.42, y: 0.5 }, { x: 0.43, y: 0.5 }]),
        s(4, '#18181B', 5, [{ x: 0.58, y: 0.5 }, { x: 0.57, y: 0.5 }]),
        s(5, '#18181B', 4, [{ x: 0.24, y: 0.54 }, { x: 0.38, y: 0.56 }]),
        s(6, '#18181B', 4, [{ x: 0.76, y: 0.54 }, { x: 0.62, y: 0.56 }]),
      ];
    case 'pizza':
      return [
        s(0, '#FACC15', 7, [
          { x: 0.5, y: 0.18 },
          { x: 0.24, y: 0.78 },
          { x: 0.76, y: 0.78 },
          { x: 0.5, y: 0.18 },
        ]),
        s(1, '#F97316', 8, [{ x: 0.23, y: 0.78 }, { x: 0.77, y: 0.78 }]),
        s(2, '#EF4444', 7, makeCirclePoints(0.46, 0.52, 0.045)),
        s(3, '#EF4444', 7, makeCirclePoints(0.56, 0.64, 0.045)),
        s(4, '#EF4444', 7, makeCirclePoints(0.42, 0.68, 0.04)),
      ];
    case 'corona':
      return [
        s(0, '#FACC15', 8, [
          { x: 0.22, y: 0.7 },
          { x: 0.22, y: 0.34 },
          { x: 0.38, y: 0.52 },
          { x: 0.5, y: 0.26 },
          { x: 0.62, y: 0.52 },
          { x: 0.78, y: 0.34 },
          { x: 0.78, y: 0.7 },
          { x: 0.22, y: 0.7 },
        ]),
        s(1, '#EF4444', 6, makeCirclePoints(0.5, 0.58, 0.035)),
      ];
    default: {
      // Clean generic visual sketch per word (clock / mountain / umbrella / boat / robot / flower / etc.)
      if (wordId === 'montana') {
        return [
          s(0, '#18181B', 7, [
            { x: 0.14, y: 0.78 },
            { x: 0.4, y: 0.32 },
            { x: 0.56, y: 0.58 },
            { x: 0.7, y: 0.38 },
            { x: 0.88, y: 0.78 },
          ]),
          s(1, '#06B6D4', 5, [{ x: 0.33, y: 0.44 }, { x: 0.4, y: 0.48 }, { x: 0.47, y: 0.44 }]),
        ];
      }
      if (wordId === 'reloj') {
        return [
          s(0, '#18181B', 7, makeCirclePoints(0.5, 0.5, 0.24)),
          s(1, '#EF4444', 6, [{ x: 0.5, y: 0.5 }, { x: 0.5, y: 0.32 }]),
          s(2, '#18181B', 6, [{ x: 0.5, y: 0.5 }, { x: 0.64, y: 0.54 }]),
        ];
      }
      if (wordId === 'paraguas') {
        return [
          s(0, '#9146FF', 8, [
            { x: 0.2, y: 0.48 },
            { x: 0.32, y: 0.26 },
            { x: 0.5, y: 0.2 },
            { x: 0.68, y: 0.26 },
            { x: 0.8, y: 0.48 },
            { x: 0.2, y: 0.48 },
          ]),
          s(1, '#18181B', 6, [
            { x: 0.5, y: 0.2 },
            { x: 0.5, y: 0.78 },
            { x: 0.56, y: 0.83 },
            { x: 0.62, y: 0.78 },
          ]),
        ];
      }
      if (wordId === 'flor') {
        return [
          s(0, '#22C55E', 6, [{ x: 0.5, y: 0.48 }, { x: 0.5, y: 0.85 }]),
          s(1, '#EC4899', 7, makeCirclePoints(0.5, 0.28, 0.09)),
          s(2, '#EC4899', 7, makeCirclePoints(0.36, 0.4, 0.09)),
          s(3, '#EC4899', 7, makeCirclePoints(0.64, 0.4, 0.09)),
          s(4, '#FACC15', 8, makeCirclePoints(0.5, 0.4, 0.08)),
        ];
      }
      if (wordId === 'barco') {
        return [
          s(0, '#18181B', 7, [
            { x: 0.22, y: 0.62 },
            { x: 0.78, y: 0.62 },
            { x: 0.68, y: 0.78 },
            { x: 0.32, y: 0.78 },
            { x: 0.22, y: 0.62 },
          ]),
          s(1, '#EF4444', 6, [
            { x: 0.5, y: 0.62 },
            { x: 0.5, y: 0.22 },
            { x: 0.74, y: 0.54 },
            { x: 0.5, y: 0.54 },
          ]),
          s(2, '#06B6D4', 5, [{ x: 0.14, y: 0.82 }, { x: 0.5, y: 0.85 }, { x: 0.86, y: 0.82 }]),
        ];
      }
      if (wordId === 'luna') {
        return [
          s(0, '#FACC15', 8, [
            { x: 0.58, y: 0.2 },
            { x: 0.36, y: 0.32 },
            { x: 0.3, y: 0.52 },
            { x: 0.38, y: 0.72 },
            { x: 0.6, y: 0.8 },
            { x: 0.46, y: 0.64 },
            { x: 0.44, y: 0.48 },
            { x: 0.5, y: 0.3 },
            { x: 0.58, y: 0.2 },
          ]),
        ];
      }
      if (wordId === 'robot') {
        return [
          s(0, '#3B82F6', 6, [
            { x: 0.32, y: 0.26 },
            { x: 0.68, y: 0.26 },
            { x: 0.68, y: 0.54 },
            { x: 0.32, y: 0.54 },
            { x: 0.32, y: 0.26 },
          ]),
          s(1, '#EF4444', 5, makeCirclePoints(0.42, 0.38, 0.04)),
          s(2, '#EF4444', 5, makeCirclePoints(0.58, 0.38, 0.04)),
          s(3, '#18181B', 5, [{ x: 0.4, y: 0.47 }, { x: 0.6, y: 0.47 }]),
          s(4, '#3B82F6', 6, [
            { x: 0.28, y: 0.58 },
            { x: 0.72, y: 0.58 },
            { x: 0.72, y: 0.84 },
            { x: 0.28, y: 0.84 },
            { x: 0.28, y: 0.58 },
          ]),
        ];
      }
      if (wordId === 'helado') {
        return [
          s(0, '#F97316', 7, [
            { x: 0.36, y: 0.52 },
            { x: 0.5, y: 0.86 },
            { x: 0.64, y: 0.52 },
            { x: 0.36, y: 0.52 },
          ]),
          s(1, '#EC4899', 8, makeCirclePoints(0.5, 0.41, 0.14)),
          s(2, '#EF4444', 6, makeCirclePoints(0.5, 0.24, 0.04)),
        ];
      }
      if (wordId === 'guitarra') {
        return [
          s(0, '#F97316', 7, makeCirclePoints(0.5, 0.68, 0.16)),
          s(1, '#F97316', 7, makeCirclePoints(0.5, 0.5, 0.1)),
          s(2, '#18181B', 6, [{ x: 0.5, y: 0.46 }, { x: 0.5, y: 0.16 }]),
          s(3, '#18181B', 6, makeCirclePoints(0.5, 0.68, 0.05)),
        ];
      }
      if (wordId === 'gafas') {
        return [
          s(0, '#18181B', 7, makeCirclePoints(0.33, 0.5, 0.14)),
          s(1, '#18181B', 7, makeCirclePoints(0.67, 0.5, 0.14)),
          s(2, '#18181B', 6, [{ x: 0.47, y: 0.5 }, { x: 0.53, y: 0.5 }]),
        ];
      }
      if (wordId === 'llave') {
        return [
          s(0, '#FACC15', 7, makeCirclePoints(0.3, 0.5, 0.12)),
          s(1, '#FACC15', 7, [{ x: 0.42, y: 0.5 }, { x: 0.8, y: 0.5 }]),
          s(2, '#FACC15', 7, [{ x: 0.68, y: 0.5 }, { x: 0.68, y: 0.62 }]),
          s(3, '#FACC15', 7, [{ x: 0.78, y: 0.5 }, { x: 0.78, y: 0.62 }]),
        ];
      }
      if (wordId === 'manzana') {
        return [
          s(0, '#EF4444', 8, makeCirclePoints(0.5, 0.56, 0.21)),
          s(1, '#9A3412', 6, [{ x: 0.5, y: 0.35 }, { x: 0.52, y: 0.22 }]),
          s(2, '#22C55E', 6, [{ x: 0.52, y: 0.26 }, { x: 0.64, y: 0.22 }, { x: 0.58, y: 0.31 }]),
        ];
      }
      // trofeo fallback
      return [
        s(0, '#FACC15', 7, [
          { x: 0.32, y: 0.24 },
          { x: 0.68, y: 0.24 },
          { x: 0.62, y: 0.54 },
          { x: 0.38, y: 0.54 },
          { x: 0.32, y: 0.24 },
        ]),
        s(1, '#FACC15', 7, [{ x: 0.5, y: 0.54 }, { x: 0.5, y: 0.74 }]),
        s(2, '#FACC15', 8, [{ x: 0.34, y: 0.76 }, { x: 0.66, y: 0.76 }]),
      ];
    }
  }
}

export function normalizePinturilloGuess(input: string): string {
  return String(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function levenshtein(a: string, b: string): number {
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

export function buildPinturilloSeats(
  humans: Array<{ id: string; name: string; avatar?: string; color?: string }>,
  preserved?: PinturilloPlayer[]
): PinturilloPlayer[] {
  const cleanHumans: Array<{ id: string; name: string; avatar?: string; color?: string }> = [];
  const seen = new Set<string>();
  for (const h of humans) {
    if (!h?.id || seen.has(h.id)) continue;
    seen.add(h.id);
    cleanHumans.push(h);
    if (cleanHumans.length >= PINTURILLO_MAX_PLAYERS) break;
  }

  const targetCount = Math.max(4, Math.min(PINTURILLO_MAX_PLAYERS, cleanHumans.length));
  const seats: PinturilloPlayer[] = [];
  for (let i = 0; i < targetCount; i += 1) {
    const h = cleanHumans[i];
    const prev = Array.isArray(preserved)
      ? preserved.find((p) => (h ? p.userId === h.id : p.seatIndex === i && p.isBot))
      : undefined;
    if (h) {
      seats.push({
        seatIndex: i,
        userId: h.id,
        name: h.name,
        avatar: h.avatar || '🎨',
        color: h.color || '#9146FF',
        isBot: false,
        score: prev?.score || 0,
        streak: prev?.streak || 0,
        hasGuessedThisRound: false,
        roundPoints: 0,
      });
    } else {
      const bot = BOT_PROFILES[i % BOT_PROFILES.length];
      seats.push({
        seatIndex: i,
        userId: `bot-pinturillo-${i}`,
        name: bot.name,
        avatar: bot.avatar,
        color: bot.color,
        isBot: true,
        score: prev?.score || 0,
        streak: prev?.streak || 0,
        hasGuessedThisRound: false,
        roundPoints: 0,
      });
    }
  }
  return seats;
}

export function createInitialPinturilloState(
  humans: Array<{ id: string; name: string; avatar?: string; color?: string }>,
  preservedOrOpts?: PinturilloPlayer[] | { waitForHost?: boolean },
  opts?: { waitForHost?: boolean }
): PinturilloGameState {
  const preserved = Array.isArray(preservedOrOpts) ? preservedOrOpts : undefined;
  const resolvedOpts = Array.isArray(preservedOrOpts) ? opts : preservedOrOpts ?? opts;
  const players = buildPinturilloSeats(humans, preserved);
  const now = Date.now();
  const drawerSeat = 0;
  const wordChoices = pickRandomWordChoices();
  const waitForHost = Boolean(resolvedOpts?.waitForHost);

  return {
    id: `pinturillo-${now}`,
    gameType: 'pinturillo',
    status: waitForHost ? 'waiting' : 'choosing',
    players,
    round: 1,
    totalRounds: Math.min(6, Math.max(4, players.length)),
    drawerSeat,
    wordChoices,
    secretWord: null,
    maskedWord: '',
    wordLength: 0,
    hintIndices: [],
    strokes: [],
    guesses: [
      {
        id: `sys-start-${now}`,
        userId: 'system',
        userName: 'Pinturillo',
        text: waitForHost
          ? 'Esperando a que los jugadores de la sala acepten la invitación…'
          : `${players[drawerSeat].name} está eligiendo una palabra…`,
        kind: 'system',
        timestamp: now,
      },
    ],
    phaseDeadlineAt: waitForHost ? 0 : now + PINTURILLO_CHOOSE_MS,
    winnerSeat: null,
    updatedAt: now,
  };
}

export function joinPinturilloPlayer(
  state: PinturilloGameState,
  user: { id: string; name: string; avatar?: string; color?: string }
): PinturilloGameState {
  if (state.players.some((p) => !p.isBot && p.userId === user.id)) {
    return state;
  }
  const now = Date.now();
  const nextPlayers = state.players.map((p) => ({ ...p }));
  const botIdx = nextPlayers.findIndex((p) => p.isBot);
  if (botIdx !== -1) {
    nextPlayers[botIdx] = {
      seatIndex: botIdx,
      userId: user.id,
      name: user.name,
      avatar: user.avatar || '🎨',
      color: user.color || '#9146FF',
      isBot: false,
      score: 0,
      streak: 0,
      hasGuessedThisRound: false,
      roundPoints: 0,
    };
  } else if (nextPlayers.length < PINTURILLO_MAX_PLAYERS) {
    nextPlayers.push({
      seatIndex: nextPlayers.length,
      userId: user.id,
      name: user.name,
      avatar: user.avatar || '🎨',
      color: user.color || '#9146FF',
      isBot: false,
      score: 0,
      streak: 0,
      hasGuessedThisRound: false,
      roundPoints: 0,
    });
  } else {
    return state;
  }

  return {
    ...state,
    players: nextPlayers,
    totalRounds: Math.min(6, Math.max(4, nextPlayers.length)),
    guesses: [
      ...state.guesses.slice(-18),
      {
        id: `sys-join-${now}-${user.id}`,
        userId: 'system',
        userName: 'Pinturillo',
        text: `👋 ${user.name} se unió a Pinturillo`,
        kind: 'system',
        timestamp: now,
      },
    ],
    updatedAt: now,
  };
}

export function startPinturilloMatch(state: PinturilloGameState): PinturilloGameState {
  if (state.status !== 'waiting') return state;
  const now = Date.now();
  const drawer = state.players[state.drawerSeat] || state.players[0];
  return {
    ...state,
    status: 'choosing',
    phaseDeadlineAt: now + PINTURILLO_CHOOSE_MS,
    guesses: [
      ...state.guesses.slice(-18),
      {
        id: `sys-go-${now}`,
        userId: 'system',
        userName: 'Pinturillo',
        text: `🎨 ¡Comienza la partida! ${drawer?.name || 'Jugador'} elige palabra…`,
        kind: 'system',
        timestamp: now,
      },
    ],
    updatedAt: now,
  };
}

export function selectPinturilloWord(
  state: PinturilloGameState,
  actorUserId: string,
  wordId?: string
): { ok: true; state: PinturilloGameState } | { ok: false; error: string } {
  if (state.status !== 'choosing') {
    return { ok: false, error: 'Ya se eligió la palabra.' };
  }
  const drawer = state.players[state.drawerSeat];
  if (!drawer || (!drawer.isBot && drawer.userId !== actorUserId)) {
    return { ok: false, error: 'Solo quien dibuja elige la palabra.' };
  }

  const chosen =
    (wordId && state.wordChoices.find((w) => w.id === wordId)) ||
    state.wordChoices[0] ||
    PINTURILLO_WORDS[0];
  const now = Date.now();

  return {
    ok: true,
    state: {
      ...state,
      status: 'drawing',
      secretWord: chosen,
      maskedWord: formatMaskedWord(chosen.es, []),
      wordLength: chosen.es.replace(/\s+/g, '').length,
      hintIndices: [],
      strokes: [],
      guesses: [
        ...state.guesses.slice(-18),
        {
          id: `sys-draw-${now}`,
          userId: 'system',
          userName: 'Pinturillo',
          text: `🎨 ¡${drawer.name} empezó a dibujar! (${chosen.es.replace(/\s+/g, '').length} letras)`,
          kind: 'system',
          timestamp: now,
        },
      ],
      phaseDeadlineAt: now + PINTURILLO_ROUND_MS,
      updatedAt: now,
    },
  };
}

export function addPinturilloStroke(
  state: PinturilloGameState,
  actorUserId: string,
  stroke: PinturilloStroke
): { ok: true; state: PinturilloGameState } | { ok: false; error: string } {
  if (state.status !== 'drawing') {
    return { ok: false, error: 'La ronda de dibujo no está activa.' };
  }
  const drawer = state.players[state.drawerSeat];
  if (!drawer || (!drawer.isBot && drawer.userId !== actorUserId)) {
    return { ok: false, error: 'Solo quien dibuja puede pintar en el lienzo.' };
  }
  const cleanPoints = (stroke.points || []).slice(0, 400).map((p) => ({
    x: Math.max(0, Math.min(1, Number(p.x) || 0)),
    y: Math.max(0, Math.min(1, Number(p.y) || 0)),
  }));
  if (cleanPoints.length === 0) {
    return { ok: false, error: 'Trazo vacío.' };
  }

  const nextStroke: PinturilloStroke = {
    id: stroke.id || `st-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    color: stroke.color || '#18181B',
    size: Math.max(2, Math.min(28, Number(stroke.size) || 5)),
    isEraser: Boolean(stroke.isEraser),
    points: cleanPoints,
  };

  return {
    ok: true,
    state: {
      ...state,
      strokes: [...state.strokes.slice(-140), nextStroke],
      updatedAt: Date.now(),
    },
  };
}

export function undoPinturilloStroke(
  state: PinturilloGameState,
  actorUserId: string
): { ok: true; state: PinturilloGameState } | { ok: false; error: string } {
  if (state.status !== 'drawing') return { ok: false, error: 'No se puede deshacer ahora.' };
  const drawer = state.players[state.drawerSeat];
  if (!drawer || (!drawer.isBot && drawer.userId !== actorUserId)) {
    return { ok: false, error: 'Solo quien dibuja puede deshacer.' };
  }
  if (state.strokes.length === 0) return { ok: true, state };
  return {
    ok: true,
    state: {
      ...state,
      strokes: state.strokes.slice(0, -1),
      updatedAt: Date.now(),
    },
  };
}

export function clearPinturilloCanvas(
  state: PinturilloGameState,
  actorUserId: string
): { ok: true; state: PinturilloGameState } | { ok: false; error: string } {
  if (state.status !== 'drawing') return { ok: false, error: 'No se puede limpiar ahora.' };
  const drawer = state.players[state.drawerSeat];
  if (!drawer || (!drawer.isBot && drawer.userId !== actorUserId)) {
    return { ok: false, error: 'Solo quien dibuja puede limpiar.' };
  }
  return {
    ok: true,
    state: {
      ...state,
      strokes: [],
      updatedAt: Date.now(),
    },
  };
}

export function revealPinturilloHintIfDue(state: PinturilloGameState, now = Date.now()): PinturilloGameState {
  if (state.status !== 'drawing' || !state.secretWord) return state;
  const remainingMs = state.phaseDeadlineAt - now;
  const word = state.secretWord.es;
  const letterIndices = Array.from(word)
    .map((ch, i) => (ch === ' ' ? -1 : i))
    .filter((i) => i >= 0);
  if (letterIndices.length <= 2) return state;

  const targetHintCount = remainingMs <= 18_000 ? 2 : remainingMs <= 36_000 ? 1 : 0;
  if (state.hintIndices.length >= targetHintCount) return state;

  const nextHints = [...state.hintIndices];
  while (nextHints.length < targetHintCount) {
    const candidates = letterIndices.filter((i) => !nextHints.includes(i));
    if (candidates.length === 0) break;
    // Prefer deterministic middle/first spread without revealing entire word
    const pick = candidates[Math.floor((candidates.length - 1) / 2)];
    nextHints.push(pick);
  }

  return {
    ...state,
    hintIndices: nextHints,
    maskedWord: formatMaskedWord(word, nextHints),
    updatedAt: now,
  };
}

export function submitPinturilloGuess(
  state: PinturilloGameState,
  actorUserId: string,
  rawText: string
): {
  ok: true;
  outcome: 'correct' | 'close' | 'guess';
  roundCompleted: boolean;
  state: PinturilloGameState;
} | { ok: false; error: string } {
  if (state.status !== 'drawing' || !state.secretWord) {
    return { ok: false, error: 'Ahora no se puede adivinar.' };
  }
  const seatIdx = state.players.findIndex((p) => p.userId === actorUserId);
  if (seatIdx === -1) return { ok: false, error: 'No estás en la partida.' };
  if (seatIdx === state.drawerSeat) return { ok: false, error: 'El dibujante no puede adivinar.' };
  const player = state.players[seatIdx];
  if (player.hasGuessedThisRound) {
    return { ok: false, error: 'Ya adivinaste esta ronda.' };
  }

  const trimmed = rawText.trim().slice(0, 60);
  if (!trimmed) return { ok: false, error: 'Escribe una palabra.' };

  const normGuess = normalizePinturilloGuess(trimmed);
  const normEs = normalizePinturilloGuess(state.secretWord.es);
  const normEn = normalizePinturilloGuess(state.secretWord.en);
  const now = Date.now();

  const isExact = normGuess === normEs || normGuess === normEn;
  if (isExact) {
    const remainingRatio = Math.max(
      0,
      Math.min(1, (state.phaseDeadlineAt - now) / PINTURILLO_ROUND_MS)
    );
    const nextStreak = player.streak + 1;
    const streakBonus = nextStreak >= 2 ? Math.min(80, (nextStreak - 1) * 25) : 0;
    const guesserPts = 110 + Math.round(remainingRatio * 180) + streakBonus;
    const drawerPts = 55;

    const nextPlayers = state.players.map((pl, idx) => {
      if (idx === seatIdx) {
        return {
          ...pl,
          score: pl.score + guesserPts,
          streak: nextStreak,
          hasGuessedThisRound: true,
          roundPoints: pl.roundPoints + guesserPts,
        };
      }
      if (idx === state.drawerSeat) {
        return {
          ...pl,
          score: pl.score + drawerPts,
          roundPoints: pl.roundPoints + drawerPts,
        };
      }
      return pl;
    });

    const allGuessersDone = nextPlayers.every(
      (pl, idx) => idx === state.drawerSeat || pl.hasGuessedThisRound
    );

    const entry: PinturilloGuessEntry = {
      id: `g-${now}-${seatIdx}`,
      userId: player.userId,
      userName: player.name,
      text: `¡Acertó! (+${guesserPts} pts${nextStreak >= 2 ? ` · 🔥x${nextStreak}` : ''})`,
      kind: 'correct',
      pointsAwarded: guesserPts,
      timestamp: now,
    };

    const nextState: PinturilloGameState = {
      ...state,
      players: nextPlayers,
      guesses: [...state.guesses.slice(-24), entry],
      updatedAt: now,
    };

    if (allGuessersDone) {
      return {
        ok: true,
        outcome: 'correct',
        roundCompleted: true,
        state: endPinturilloRound(nextState, now),
      };
    }

    return {
      ok: true,
      outcome: 'correct',
      roundCompleted: false,
      state: nextState,
    };
  }

  const distEs = levenshtein(normGuess, normEs);
  const distEn = levenshtein(normGuess, normEn);
  const minDist = Math.min(distEs, distEn);
  const isClose =
    normGuess.length >= 3 &&
    (minDist <= 2 ||
      (normEs.length >= 4 && normEs.includes(normGuess)) ||
      (normEn.length >= 4 && normEn.includes(normGuess)));

  const entry: PinturilloGuessEntry = {
    id: `g-${now}-${seatIdx}-${Math.random().toString(36).slice(2, 5)}`,
    userId: player.userId,
    userName: player.name,
    text: isClose ? `${trimmed} · ¡Casi!` : trimmed,
    kind: isClose ? 'close' : 'guess',
    timestamp: now,
  };

  return {
    ok: true,
    outcome: isClose ? 'close' : 'guess',
    roundCompleted: false,
    state: {
      ...state,
      guesses: [...state.guesses.slice(-24), entry],
      updatedAt: now,
    },
  };
}

export function endPinturilloRound(state: PinturilloGameState, now = Date.now()): PinturilloGameState {
  if (state.status !== 'drawing' && state.status !== 'choosing') return state;
  const wordLabel = state.secretWord
    ? `${state.secretWord.es} (${state.secretWord.en})`
    : '—';

  const nextPlayers = state.players.map((pl, idx) =>
    idx !== state.drawerSeat && !pl.hasGuessedThisRound ? { ...pl, streak: 0 } : pl
  );

  return {
    ...state,
    status: 'round_end',
    players: nextPlayers,
    maskedWord: state.secretWord ? state.secretWord.es.toUpperCase() : state.maskedWord,
    guesses: [
      ...state.guesses.slice(-20),
      {
        id: `sys-end-${now}`,
        userId: 'system',
        userName: 'Pinturillo',
        text: `⏰ Fin de ronda · La palabra era: ${wordLabel}`,
        kind: 'system',
        timestamp: now,
      },
    ],
    phaseDeadlineAt: now + PINTURILLO_ROUND_END_MS,
    updatedAt: now,
  };
}

export function advancePinturilloRound(state: PinturilloGameState): PinturilloGameState {
  const now = Date.now();
  if (state.round >= state.totalRounds) {
    let bestIdx = 0;
    for (let i = 1; i < state.players.length; i += 1) {
      if (state.players[i].score > state.players[bestIdx].score) bestIdx = i;
    }
    return {
      ...state,
      status: 'finished',
      winnerSeat: bestIdx,
      updatedAt: now,
    };
  }

  const nextRound = state.round + 1;
  const nextDrawerSeat = (state.drawerSeat + 1) % state.players.length;
  const usedIds = state.secretWord ? [state.secretWord.id] : [];
  const wordChoices = pickRandomWordChoices(usedIds);

  return {
    ...state,
    status: 'choosing',
    round: nextRound,
    drawerSeat: nextDrawerSeat,
    wordChoices,
    secretWord: null,
    maskedWord: '',
    wordLength: 0,
    hintIndices: [],
    strokes: [],
    players: state.players.map((pl) => ({
      ...pl,
      hasGuessedThisRound: false,
      roundPoints: 0,
    })),
    guesses: [
      {
        id: `sys-r-${nextRound}-${now}`,
        userId: 'system',
        userName: 'Pinturillo',
        text: `Ronda ${nextRound}/${state.totalRounds} · ${state.players[nextDrawerSeat].name} elige palabra…`,
        kind: 'system',
        timestamp: now,
      },
    ],
    phaseDeadlineAt: now + PINTURILLO_CHOOSE_MS,
    updatedAt: now,
  };
}

export function pickBotPinturilloGuess(state: PinturilloGameState): {
  botUserId: string;
  guessText: string;
} | null {
  if (state.status !== 'drawing' || !state.secretWord) return null;
  const eligibleBots = state.players.filter(
    (pl, idx) => pl.isBot && idx !== state.drawerSeat && !pl.hasGuessedThisRound
  );
  if (eligibleBots.length === 0) return null;
  const bot = eligibleBots[Math.floor(Math.random() * eligibleBots.length)];

  const remainingMs = Math.max(0, state.phaseDeadlineAt - Date.now());
  const elapsedFraction = 1 - remainingMs / PINTURILLO_ROUND_MS;
  // Probability of solving increases smoothly once strokes appear
  const solveChance = state.strokes.length >= 2 ? 0.14 + elapsedFraction * 0.45 : 0.05;
  if (Math.random() < solveChance) {
    return { botUserId: bot.userId, guessText: state.secretWord.es };
  }
  const wrong = BOT_FILLER_GUESSES[Math.floor(Math.random() * BOT_FILLER_GUESSES.length)];
  return { botUserId: bot.userId, guessText: wrong };
}

/**
 * Redacts the secret word from non-drawer guessers over the wire during active rounds
 * while keeping the masked word and strokes intact.
 */
export function redactPinturilloForUser(
  state: PinturilloGameState | null,
  viewerUserId: string
): PinturilloGameState | null {
  if (!state) return null;
  if (state.status === 'round_end' || state.status === 'finished') return state;
  const drawer = state.players[state.drawerSeat];
  if (drawer && !drawer.isBot && drawer.userId === viewerUserId) {
    return state;
  }
  return {
    ...state,
    wordChoices: [],
    secretWord: null,
  };
}
