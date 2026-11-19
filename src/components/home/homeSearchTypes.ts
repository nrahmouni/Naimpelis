import type { CatalogMovie } from '../../types';

export type SearchCategoryFilter = 'all' | 'movies' | 'series' | 'sports' | 'tv' | 'games';

export interface AiSearchJobState {
  status: 'idle' | 'searching' | 'verifying' | 'found' | 'not_found' | 'error';
  progressLabel: string;
  item: CatalogMovie | null;
  error?: string;
}

export interface HallmarkGameItem {
  id: string;
  title: string;
  desc: string;
  icon: string;
  matchKeywords: string[];
}

export const HALLMARK_GAMES: HallmarkGameItem[] = [
  {
    id: 'billar',
    title: 'Billar 8-Ball',
    desc: 'Partidas 1v1 con físicas reales y apuestas',
    icon: '🎱',
    matchKeywords: ['billar', 'pool', '8ball', '8-ball', 'bola 8', 'billiard'],
  },
  {
    id: 'parchis',
    title: 'Parchís',
    desc: 'Clásico juego de tablero para 2 a 4 jugadores',
    icon: '🎲',
    matchKeywords: ['parchis', 'parchís', 'ludo', 'dados'],
  },
  {
    id: 'uno',
    title: 'UNO! Party',
    desc: 'Cartas de colores, saltos y +4 multijugador',
    icon: '🃏',
    matchKeywords: ['uno', 'cartas', 'card game', 'wild4'],
  },
  {
    id: 'chapas',
    title: 'Fútbol Chapas',
    desc: 'Tiros por turnos sobre tapete de fútbol',
    icon: '⚽',
    matchKeywords: ['chapas', 'futbol chapas', 'fútbol chapas', 'chapa'],
  },
  {
    id: 'pinturillo',
    title: 'Pinturillo',
    desc: 'Dibuja y adivina palabras en tiempo real',
    icon: '🎨',
    matchKeywords: ['pinturillo', 'dibujar', 'pictionary', 'skribbl', 'dibujo'],
  },
];
