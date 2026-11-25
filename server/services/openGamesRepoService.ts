/**
 * @module server/services/openGamesRepoService
 * @description Fetches & caches ready-to-play open-source MIT HTML5/Phaser/Three.js games
 * from verified GitHub repositories (sausi-7/games — 142 browser games, MIT license).
 */
import { logger } from '../utils/logger.ts';

export interface OpenRepoGameCategory {
  id: string;
  label: string;
  emoji: string;
  color: string;
}

export interface OpenRepoGameEntry {
  slug: string;
  name: string;
  category: string;
  tech: string;
  tags: string[];
  description: string;
  launchUrl: string;
  repo: string;
  license: string;
}

export interface OpenRepoGamesCatalogPayload {
  repo: string;
  repoUrl: string;
  license: string;
  total: number;
  categories: OpenRepoGameCategory[];
  games: OpenRepoGameEntry[];
  syncedAt: number;
}

const REGISTRY_URL = 'https://raw.githubusercontent.com/sausi-7/games/main/games/registry.json';
const PAGES_BASE_URL = 'https://sausi-7.github.io/games/';
const CACHE_TTL_MS = 60 * 60 * 1000;

const FALLBACK_CATEGORIES: OpenRepoGameCategory[] = [
  { id: '3d', label: '3D WebGL', emoji: '🌐', color: '#8b5cf6' },
  { id: 'racing', label: 'Racing', emoji: '🏎️', color: '#f59e0b' },
  { id: 'shooter', label: 'Shooter', emoji: '🎯', color: '#ef4444' },
  { id: 'platformer', label: 'Platformer', emoji: '🏃', color: '#06b6d4' },
  { id: 'sports', label: 'Sports', emoji: '⚽', color: '#10b981' },
  { id: 'arcade', label: 'Arcade', emoji: '🕹️', color: '#ec4899' },
  { id: 'puzzle', label: 'Puzzle', emoji: '🧩', color: '#7c3aed' },
  { id: 'casual', label: 'Casual', emoji: '🎈', color: '#f472b6' },
  { id: 'board', label: 'Board', emoji: '♟️', color: '#64748b' },
  { id: 'word-quiz', label: 'Word & Quiz', emoji: '📝', color: '#3b82f6' },
];

const FALLBACK_FEATURED_GAMES: OpenRepoGameEntry[] = [
  {
    slug: 'crossy-road',
    name: 'Crossy Road 3D',
    category: 'arcade',
    tech: 'three',
    tags: ['3d', 'traffic', 'endless'],
    description: 'Cross busy roads and rivers in low-poly 3D.',
    launchUrl: `${PAGES_BASE_URL}games/arcade/crossy-road/index.html`,
    repo: 'sausi-7/games',
    license: 'MIT',
  },
  {
    slug: 'level-devil',
    name: 'Level Devil',
    category: 'platformer',
    tech: 'three',
    tags: ['platformer', 'traps'],
    description: 'Platformer packed with surprise traps and sudden twists.',
    launchUrl: `${PAGES_BASE_URL}games/platformer/level-devil/index.html`,
    repo: 'sausi-7/games',
    license: 'MIT',
  },
  {
    slug: 'stack-tower',
    name: 'Stack Tower 3D',
    category: '3d',
    tech: 'three',
    tags: ['3d', 'timing', 'stack'],
    description: 'Drop moving slabs cleanly on top of your rising 3D tower.',
    launchUrl: `${PAGES_BASE_URL}games/3d/stack-tower/index.html`,
    repo: 'sausi-7/games',
    license: 'MIT',
  },
  {
    slug: 'road-fighter',
    name: 'Road Fighter',
    category: 'racing',
    tech: 'phaser',
    tags: ['cars', 'retro', 'racing'],
    description: 'High-speed arcade highway racing dodging traffic.',
    launchUrl: `${PAGES_BASE_URL}games/racing/road-fighter/index.html`,
    repo: 'sausi-7/games',
    license: 'MIT',
  },
  {
    slug: 'alien-battle',
    name: 'Alien Battle',
    category: 'shooter',
    tech: 'phaser',
    tags: ['aliens', 'survival'],
    description: 'Top-down alien shooter. Survive the swarm.',
    launchUrl: `${PAGES_BASE_URL}games/shooter/alien-battle/index.html`,
    repo: 'sausi-7/games',
    license: 'MIT',
  },
  {
    slug: 'fighter-jet',
    name: 'Fighter Jet',
    category: 'shooter',
    tech: 'phaser',
    tags: ['arcade', 'jets'],
    description: 'Vertical jet combat through incoming enemy squadrons.',
    launchUrl: `${PAGES_BASE_URL}games/shooter/fighter-jet/index.html`,
    repo: 'sausi-7/games',
    license: 'MIT',
  },
  {
    slug: 'basketball',
    name: 'Basketball Hoops',
    category: 'sports',
    tech: 'phaser',
    tags: ['hoops', 'sports'],
    description: 'Arc the ball cleanly through the hoop under pressure.',
    launchUrl: `${PAGES_BASE_URL}games/sports/basketball/index.html`,
    repo: 'sausi-7/games',
    license: 'MIT',
  },
  {
    slug: 'sudoku',
    name: 'Sudoku 9×9',
    category: 'puzzle',
    tech: 'html',
    tags: ['logic', 'numbers'],
    description: 'Classic 9x9 number logic puzzle.',
    launchUrl: `${PAGES_BASE_URL}games/puzzle/sudoku/index.html`,
    repo: 'sausi-7/games',
    license: 'MIT',
  },
  {
    slug: 'doodle-jump',
    name: 'Doodle Jump',
    category: 'platformer',
    tech: 'phaser',
    tags: ['jump', 'endless'],
    description: 'Bounce from platform to platform climbing higher.',
    launchUrl: `${PAGES_BASE_URL}games/platformer/doodle-jump/index.html`,
    repo: 'sausi-7/games',
    license: 'MIT',
  },
  {
    slug: 'cosmic-cleaner',
    name: 'Cosmic Cleaner',
    category: '3d',
    tech: 'phaser',
    tags: ['space', 'arcade'],
    description: 'Clear orbital debris across deep-space sectors.',
    launchUrl: `${PAGES_BASE_URL}games/3d/cosmic-cleaner/index.html`,
    repo: 'sausi-7/games',
    license: 'MIT',
  },
  {
    slug: 'mario',
    name: 'Mario-Like Platformer',
    category: 'platformer',
    tech: 'phaser',
    tags: ['retro', 'run'],
    description: 'Classic side-scrolling jump-and-run adventure.',
    launchUrl: `${PAGES_BASE_URL}games/platformer/mario/index.html`,
    repo: 'sausi-7/games',
    license: 'MIT',
  },
  {
    slug: 'cricket-123',
    name: 'Cricket 1-2-3',
    category: 'sports',
    tech: 'phaser',
    tags: ['cricket', 'batting'],
    description: 'Quick-reflex arcade cricket batting challenge.',
    launchUrl: `${PAGES_BASE_URL}games/sports/cricket-123/index.html`,
    repo: 'sausi-7/games',
    license: 'MIT',
  },
];

let cachedCatalog: OpenRepoGamesCatalogPayload | null = null;
let inflightCatalogPromise: Promise<OpenRepoGamesCatalogPayload> | null = null;

export async function getOpenGamesRepoCatalog(
  force = false
): Promise<OpenRepoGamesCatalogPayload> {
  if (!force && cachedCatalog && Date.now() - cachedCatalog.syncedAt < CACHE_TTL_MS) {
    return cachedCatalog;
  }
  if (inflightCatalogPromise) return inflightCatalogPromise;

  inflightCatalogPromise = (async (): Promise<OpenRepoGamesCatalogPayload> => {
    try {
      const resp = await fetch(REGISTRY_URL, {
        headers: { 'User-Agent': 'RiffanGames-Catalog/1.0' },
        signal: AbortSignal.timeout(7000),
      });
      if (resp.ok) {
        const raw = (await resp.json()) as {
          categories?: Array<{ id?: string; label?: string; emoji?: string; color?: string }>;
          games?: Array<{
            slug?: string;
            name?: string;
            category?: string;
            path?: string;
            tech?: string;
            tags?: string[];
            description?: string;
          }>;
        };

        const categories: OpenRepoGameCategory[] = Array.isArray(raw.categories)
          ? raw.categories
              .filter((c) => Boolean(c?.id && c?.label))
              .map((c) => ({
                id: String(c.id),
                label: String(c.label),
                emoji: String(c.emoji || '🎮'),
                color: String(c.color || '#7c3aed'),
              }))
          : FALLBACK_CATEGORIES;

        const games: OpenRepoGameEntry[] = Array.isArray(raw.games)
          ? raw.games
              .filter((g) => Boolean(g?.slug && g?.name && g?.path))
              .map((g) => {
                const cleanPath = String(g.path || '').replace(/^\/+/, '');
                return {
                  slug: String(g.slug),
                  name: String(g.name),
                  category: String(g.category || 'arcade'),
                  tech: String(g.tech || 'html'),
                  tags: Array.isArray(g.tags) ? g.tags.map(String) : [],
                  description: String(g.description || ''),
                  launchUrl: `${PAGES_BASE_URL}${cleanPath}`,
                  repo: 'sausi-7/games',
                  license: 'MIT',
                };
              })
          : FALLBACK_FEATURED_GAMES;

        if (games.length > 0) {
          cachedCatalog = {
            repo: 'sausi-7/games',
            repoUrl: 'https://github.com/sausi-7/games',
            license: 'MIT',
            total: games.length,
            categories,
            games,
            syncedAt: Date.now(),
          };
          return cachedCatalog;
        }
      }
    } catch (err) {
      logger.debug({ err }, 'open_games_repo_fetch_fallback');
    }

    return (
      cachedCatalog || {
        repo: 'sausi-7/games',
        repoUrl: 'https://github.com/sausi-7/games',
        license: 'MIT',
        total: FALLBACK_FEATURED_GAMES.length,
        categories: FALLBACK_CATEGORIES,
        games: FALLBACK_FEATURED_GAMES,
        syncedAt: Date.now(),
      }
    );
  })().finally(() => {
    inflightCatalogPromise = null;
  });

  return inflightCatalogPromise;
}
