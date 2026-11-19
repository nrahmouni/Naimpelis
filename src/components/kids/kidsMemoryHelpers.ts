import type { KidsAgeGroup, KidsLanguageCode } from '../../types';
import {
  pickLeitnerEntries,
  type KidsVocabEntry,
  type LeitnerBoxesMap,
} from './kidsData';
import { EXTENDED_VOCAB_ITEMS } from './kidsCurriculumData';

export type MemoryArcadeMode = 'memory' | 'kitchen' | 'logic';

export interface MemoryCardItem {
  uid: string;
  pairId: string;
  kind: 'art' | 'word';
  iconId: string;
  word: string;
  spokenText: string;
  flipped: boolean;
  matched: boolean;
}

export function cleanSpokenWord(raw: string): string {
  const idx = raw.indexOf('(');
  return (idx >= 0 ? raw.slice(0, idx) : raw).trim() || raw.trim();
}

export const FULL_VOCAB_ENTRIES: KidsVocabEntry[] = EXTENDED_VOCAB_ITEMS.map((item) => ({
  id: item.id,
  category:
    item.category === 'animals' ||
    item.category === 'nature' ||
    item.category === 'numbers' ||
    item.category === 'family'
      ? item.category
      : 'animals',
  iconId: item.iconId,
  translations: item.translations,
}));

export function buildLeitnerDeck(
  lang: KidsLanguageCode,
  ageGroup: KidsAgeGroup,
  boxes: LeitnerBoxesMap
): MemoryCardItem[] {
  const pairCount = ageGroup === '3-5' ? 3 : 6;
  const chosen: KidsVocabEntry[] = pickLeitnerEntries(FULL_VOCAB_ENTRIES, boxes, pairCount);
  const deck: MemoryCardItem[] = [];

  for (const entry of chosen) {
    const tr = entry.translations[lang] || entry.translations.es;
    const cleanWord = cleanSpokenWord(tr.word);
    deck.push({
      uid: `${entry.id}-art-${Math.random().toString(36).slice(2, 6)}`,
      pairId: entry.id,
      kind: 'art',
      iconId: entry.iconId,
      word: cleanWord,
      spokenText: cleanWord,
      flipped: false,
      matched: false,
    });
    deck.push({
      uid: `${entry.id}-word-${Math.random().toString(36).slice(2, 6)}`,
      pairId: entry.id,
      kind: 'word',
      iconId: entry.iconId,
      word: cleanWord,
      spokenText: cleanWord,
      flipped: false,
      matched: false,
    });
  }
  return deck.sort(() => Math.random() - 0.5);
}

/* ============================================================================
 * KITCHEN ORDER HELPERS
 * ============================================================================ */
export const KITCHEN_FOOD_IDS = ['apple', 'bread', 'milk', 'honey', 'tea', 'orange_fruit', 'water'];
const CUSTOMER_ANIMALS = [
  { id: 'cat', name: 'Amucc' },
  { id: 'lion', name: 'Ayrad' },
  { id: 'bird', name: 'Ajeḍiḍ' },
  { id: 'dog', name: 'Aqzin' },
];

export interface KitchenOrder {
  customer: { id: string; name: string };
  requiredIds: string[];
}

export function buildKitchenOrder(ageGroup: KidsAgeGroup): KitchenOrder {
  const count = ageGroup === '3-5' ? 2 : 3;
  const pool = [...KITCHEN_FOOD_IDS].sort(() => Math.random() - 0.5);
  const requiredIds = pool.slice(0, count);
  const customer = CUSTOMER_ANIMALS[Math.floor(Math.random() * CUSTOMER_ANIMALS.length)];
  return { customer, requiredIds };
}

/* ============================================================================
 * LOGIC BRIDGE PUZZLE HELPERS (BFS-VERIFIED SOLVABLE)
 * ============================================================================ */
export type LogicDir = 'up' | 'right' | 'down' | 'left';

export interface LogicLevel {
  cols: number;
  rows: number;
  start: { x: number; y: number };
  goal: { x: number; y: number };
  rocks: Array<{ x: number; y: number }>;
  bonusStar: { x: number; y: number } | null;
}

function isPathSolvable(
  cols: number,
  rows: number,
  start: { x: number; y: number },
  goal: { x: number; y: number },
  rocks: Array<{ x: number; y: number }>
): boolean {
  const rockSet = new Set(rocks.map((r) => `${r.x},${r.y}`));
  if (rockSet.has(`${start.x},${start.y}`) || rockSet.has(`${goal.x},${goal.y}`)) return false;
  const queue: Array<{ x: number; y: number }> = [start];
  const visited = new Set<string>([`${start.x},${start.y}`]);
  const deltas = [
    { dx: 1, dy: 0 },
    { dx: -1, dy: 0 },
    { dx: 0, dy: 1 },
    { dx: 0, dy: -1 },
  ];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur.x === goal.x && cur.y === goal.y) return true;
    for (const d of deltas) {
      const nx = cur.x + d.dx;
      const ny = cur.y + d.dy;
      const key = `${nx},${ny}`;
      if (nx >= 0 && nx < cols && ny >= 0 && ny < rows && !rockSet.has(key) && !visited.has(key)) {
        visited.add(key);
        queue.push({ x: nx, y: ny });
      }
    }
  }
  return false;
}

export function generateLogicLevel(ageGroup: KidsAgeGroup): LogicLevel {
  const cols = ageGroup === '9-12' ? 5 : 4;
  const rows = 4;
  const start = { x: 0, y: rows - 1 };
  const goal = { x: cols - 1, y: 0 };
  const rockCount = ageGroup === '3-5' ? 2 : ageGroup === '6-8' ? 3 : 5;

  for (let attempt = 0; attempt < 30; attempt++) {
    const candidates: Array<{ x: number; y: number }> = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        if ((x === start.x && y === start.y) || (x === goal.x && y === goal.y)) continue;
        candidates.push({ x, y });
      }
    }
    const shuffled = candidates.sort(() => Math.random() - 0.5);
    const rocks = shuffled.slice(0, rockCount);
    if (isPathSolvable(cols, rows, start, goal, rocks)) {
      const bonusStar = shuffled[rockCount] || null;
      return { cols, rows, start, goal, rocks, bonusStar };
    }
  }
  return {
    cols,
    rows,
    start,
    goal,
    rocks: [
      { x: 1, y: 2 },
      { x: 2, y: 1 },
    ],
    bonusStar: { x: 1, y: 1 },
  };
}
