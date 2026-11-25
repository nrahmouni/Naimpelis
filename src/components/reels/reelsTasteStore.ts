import type { CatalogMovie, WatchHistoryItem } from '../../types';
import type { MovieReelItem, ReelsTasteProfile, ReelsTasteSeed } from './reelsTypes';

const TASTE_STORAGE_KEY = 'riffan_reels_taste_v1';

export const GENRE_NAME_ES: Record<number, string> = {
  28: 'Acción',
  12: 'Aventura',
  16: 'Animación',
  35: 'Comedia',
  80: 'Crimen',
  99: 'Documental',
  18: 'Drama',
  10751: 'Familia',
  14: 'Fantasía',
  36: 'Historia',
  27: 'Terror',
  10402: 'Música',
  9648: 'Misterio',
  10749: 'Romance',
  878: 'Ciencia Ficción',
  53: 'Thriller',
  10752: 'Bélica',
  37: 'Western',
  10759: 'Acción y Aventura',
  10765: 'Sci-Fi y Fantasía',
};

const EMPTY_TASTE: ReelsTasteProfile = {
  likedIds: [],
  dislikedIds: [],
  seenIds: [],
  genreScores: {},
  likedSeeds: [],
  likedTitles: [],
  voiceEnabled: false,
  autoAdvance: true,
  muted: false,
};

function dedupeCap<T>(items: T[], limit: number, keyFn?: (item: T) => string): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const item of items) {
    const k = keyFn ? keyFn(item) : String(item);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(item);
    if (out.length >= limit) break;
  }
  return out;
}

export function loadReelsTasteProfile(
  watchlist: CatalogMovie[] = [],
  watchHistory: WatchHistoryItem[] = []
): ReelsTasteProfile {
  let stored: Partial<ReelsTasteProfile> = {};
  if (typeof localStorage !== 'undefined') {
    try {
      const raw = localStorage.getItem(TASTE_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object') {
          stored = parsed;
        }
      }
    } catch {
      // ignore storage corruption
    }
  }

  const seedFromUser: ReelsTasteSeed[] = [];
  const seedTitles: string[] = [];

  for (const item of watchlist) {
    if (item.tmdbId && item.tmdbId > 0) {
      seedFromUser.push({
        tmdbId: item.tmdbId,
        mediaType: item.mediaType === 'tv' ? 'tv' : 'movie',
        title: item.title,
      });
    }
    if (item.title) seedTitles.push(item.title);
  }

  for (const h of watchHistory) {
    if (h.tmdbId && h.tmdbId > 0) {
      seedFromUser.push({
        tmdbId: h.tmdbId,
        mediaType: h.mediaType === 'tv' ? 'tv' : 'movie',
        title: h.title,
      });
    }
    if (h.title) seedTitles.push(h.title);
  }

  const mergedSeeds = dedupeCap(
    [...(Array.isArray(stored.likedSeeds) ? stored.likedSeeds : []), ...seedFromUser],
    14,
    (s) => `${s.mediaType}_${s.tmdbId}`
  );

  const mergedTitles = dedupeCap(
    [...(Array.isArray(stored.likedTitles) ? stored.likedTitles : []), ...seedTitles],
    18
  );

  return {
    likedIds: Array.isArray(stored.likedIds) ? stored.likedIds.slice(0, 120) : [],
    dislikedIds: Array.isArray(stored.dislikedIds) ? stored.dislikedIds.slice(0, 120) : [],
    seenIds: Array.isArray(stored.seenIds) ? stored.seenIds.slice(0, 180) : [],
    genreScores:
      stored.genreScores && typeof stored.genreScores === 'object'
        ? { ...stored.genreScores }
        : {},
    likedSeeds: mergedSeeds,
    likedTitles: mergedTitles,
    voiceEnabled: Boolean(stored.voiceEnabled),
    autoAdvance: stored.autoAdvance !== false,
    muted: Boolean(stored.muted),
  };
}

export function saveReelsTasteProfile(profile: ReelsTasteProfile): void {
  if (typeof localStorage === 'undefined') return;
  try {
    localStorage.setItem(TASTE_STORAGE_KEY, JSON.stringify(profile));
  } catch {
    // ignore quota errors
  }
}

export function applyReelLike(
  prev: ReelsTasteProfile,
  reel: MovieReelItem,
  liked: boolean
): ReelsTasteProfile {
  const nextGenreScores = { ...prev.genreScores };
  const delta = liked ? 3 : -2;
  for (const gid of reel.genreIds) {
    nextGenreScores[gid] = (nextGenreScores[gid] || 0) + delta;
  }

  const nextLikedIds = liked
    ? dedupeCap([reel.id, ...prev.likedIds], 120)
    : prev.likedIds.filter((id) => id !== reel.id);

  const nextDislikedIds = liked
    ? prev.dislikedIds.filter((id) => id !== reel.id)
    : prev.dislikedIds;

  const nextSeeds = liked
    ? dedupeCap(
        [
          { tmdbId: reel.tmdbId, mediaType: reel.mediaType, title: reel.title },
          ...prev.likedSeeds,
        ],
        14,
        (s) => `${s.mediaType}_${s.tmdbId}`
      )
    : prev.likedSeeds.filter(
        (s) => !(s.tmdbId === reel.tmdbId && s.mediaType === reel.mediaType)
      );

  const nextTitles = liked
    ? dedupeCap([reel.title, ...prev.likedTitles], 18)
    : prev.likedTitles.filter((t) => t !== reel.title);

  const next: ReelsTasteProfile = {
    ...prev,
    likedIds: nextLikedIds,
    dislikedIds: nextDislikedIds,
    genreScores: nextGenreScores,
    likedSeeds: nextSeeds,
    likedTitles: nextTitles,
  };
  saveReelsTasteProfile(next);
  return next;
}

export function applyReelDislike(
  prev: ReelsTasteProfile,
  reel: MovieReelItem
): ReelsTasteProfile {
  const nextGenreScores = { ...prev.genreScores };
  for (const gid of reel.genreIds) {
    nextGenreScores[gid] = (nextGenreScores[gid] || 0) - 4;
  }
  const next: ReelsTasteProfile = {
    ...prev,
    likedIds: prev.likedIds.filter((id) => id !== reel.id),
    dislikedIds: dedupeCap([reel.id, ...prev.dislikedIds], 120),
    genreScores: nextGenreScores,
    likedSeeds: prev.likedSeeds.filter(
      (s) => !(s.tmdbId === reel.tmdbId && s.mediaType === reel.mediaType)
    ),
  };
  saveReelsTasteProfile(next);
  return next;
}

export function markReelSeen(
  prev: ReelsTasteProfile,
  reel: MovieReelItem,
  dwellMs: number
): ReelsTasteProfile {
  const nextGenreScores = { ...prev.genreScores };
  if (dwellMs >= 11000) {
    for (const gid of reel.genreIds) {
      nextGenreScores[gid] = (nextGenreScores[gid] || 0) + 1;
    }
  } else if (dwellMs > 0 && dwellMs < 2200 && !prev.likedIds.includes(reel.id)) {
    for (const gid of reel.genreIds) {
      nextGenreScores[gid] = (nextGenreScores[gid] || 0) - 1;
    }
  }
  const next: ReelsTasteProfile = {
    ...prev,
    seenIds: dedupeCap([reel.id, ...prev.seenIds], 180),
    genreScores: nextGenreScores,
  };
  saveReelsTasteProfile(next);
  return next;
}

export function getSortedTasteGenres(profile: ReelsTasteProfile): {
  likedGenres: number[];
  dislikedGenres: number[];
} {
  const entries = Object.entries(profile.genreScores)
    .map(([id, score]) => ({ id: Number(id), score }))
    .filter((e) => Number.isFinite(e.id));

  const likedGenres = entries
    .filter((e) => e.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 6)
    .map((e) => e.id);

  const dislikedGenres = entries
    .filter((e) => e.score <= -3)
    .sort((a, b) => a.score - b.score)
    .slice(0, 5)
    .map((e) => e.id);

  return { likedGenres, dislikedGenres };
}

export function getTopTasteGenreLabels(profile: ReelsTasteProfile): string[] {
  const { likedGenres } = getSortedTasteGenres(profile);
  return likedGenres
    .map((gid) => GENRE_NAME_ES[gid])
    .filter((name): name is string => Boolean(name))
    .slice(0, 4);
}

export function resetReelsTasteProfile(): ReelsTasteProfile {
  const fresh: ReelsTasteProfile = {
    ...EMPTY_TASTE,
    genreScores: {},
  };
  saveReelsTasteProfile(fresh);
  return fresh;
}

export function toCatalogMovieFromReel(reel: MovieReelItem): CatalogMovie {
  return {
    id: reel.id,
    tmdbId: reel.tmdbId,
    mediaType: reel.mediaType,
    title: reel.title,
    year: reel.year,
    rating: reel.rating,
    genres: reel.genres.length > 0 ? reel.genres : [reel.mediaType === 'tv' ? 'Serie' : 'Cine'],
    languages: ['ES'],
    poster: reel.poster,
    backdrop: reel.backdrop,
    overview: reel.overview,
    quality: 'HD',
  };
}
