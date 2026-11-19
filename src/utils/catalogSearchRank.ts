import type { CatalogMovie } from '../types';

export function normalizeSearchText(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9ñç\s]/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function compactSearchText(raw: string): string {
  return normalizeSearchText(raw).replace(/\s+/g, '');
}

const FEATURED_4K_IDS = new Set([
  693134, 872585, 157336, 361743, 414906, 335984, 569094, 76600, 558449, 155,
  27205, 299534, 533535,
]);

const SEARCH_STOPWORDS = new Set([
  'el', 'la', 'los', 'las', 'lo',
  'un', 'una', 'unos', 'unas',
  'de', 'del', 'al', 'en', 'con', 'por', 'para', 'sin', 'sobre',
  'que', 'se', 'su', 'sus', 'es', 'son', 'y', 'o', 'e', 'u',
  'the', 'of', 'in', 'on', 'at', 'to', 'and', 'or', 'is', 'for', 'with',
  'els', 'les', 'amb', 'per', 'i',
]);

export function scoreCatalogItemForQuery(
  item: Pick<
    CatalogMovie,
    'title' | 'originalTitle' | 'overview' | 'rating' | 'is4k' | 'tmdbId' | 'year'
  >,
  rawQuery: string,
  options?: { prefer4k?: boolean }
): number {
  const normQ = normalizeSearchText(rawQuery);
  if (!normQ) return 0;

  const compactQ = normQ.replace(/\s+/g, '');
  const qTokens = normQ.split(' ').filter((t) => t.length >= 2 || /^\d+$/.test(t));
  const meaningfulTokens = qTokens.filter(
    (t) => !SEARCH_STOPWORDS.has(t) && (t.length >= 3 || /^\d+$/.test(t))
  );

  const title = normalizeSearchText(item.title || '');
  const orig = normalizeSearchText(item.originalTitle || '');
  const titleCompact = title.replace(/\s+/g, '');
  const origCompact = orig.replace(/\s+/g, '');
  const overview = normalizeSearchText(item.overview || '');

  let score = 0;

  if (title === normQ || (orig && orig === normQ)) {
    score = 1000;
  } else if (
    compactQ.length >= 2 &&
    (titleCompact === compactQ || (origCompact && origCompact === compactQ))
  ) {
    score = 920;
  } else if (title.startsWith(`${normQ} `) || (normQ.length >= 3 && title.startsWith(normQ))) {
    score = 720;
  } else if (orig && (orig.startsWith(`${normQ} `) || (normQ.length >= 3 && orig.startsWith(normQ)))) {
    score = 680;
  } else if (normQ.length >= 3 && (title.includes(normQ) || (orig && orig.includes(normQ)))) {
    score = 520;
  } else if (
    compactQ.length >= 4 &&
    (titleCompact.includes(compactQ) || (origCompact && origCompact.includes(compactQ)))
  ) {
    score = 460;
  } else if (meaningfulTokens.length > 0) {
    const titleWords = title.split(' ').filter(Boolean);
    const origWords = orig.split(' ').filter(Boolean);
    const matchesToken = (words: string[], tok: string) =>
      words.some((w) => w === tok || w.startsWith(tok) || (tok.length >= 4 && w.includes(tok)));

    const allInTitle = meaningfulTokens.every((tok) => matchesToken(titleWords, tok));
    const allInOrig =
      orig.length > 0 && meaningfulTokens.every((tok) => matchesToken(origWords, tok));

    if (allInTitle || allInOrig) {
      score = 360;
      const targetWordCount = allInTitle ? titleWords.length : origWords.length;
      score += Math.max(0, 40 - Math.abs(targetWordCount - qTokens.length) * 8);
    } else if (meaningfulTokens.length >= 2) {
      const combinedWords = [...titleWords, ...origWords];
      const matchedCount = meaningfulTokens.filter((tok) => matchesToken(combinedWords, tok)).length;
      if (matchedCount >= Math.ceil(meaningfulTokens.length * 0.65)) {
        score = Math.round((matchedCount / meaningfulTokens.length) * 200);
      }
    }
  }

  if (score === 0 && normQ.length >= 5 && !SEARCH_STOPWORDS.has(normQ) && overview.includes(normQ)) {
    score = 35;
  }

  if (score === 0) return 0;

  if (options?.prefer4k && (item.is4k || (item.tmdbId && FEATURED_4K_IDS.has(item.tmdbId)))) {
    score += 45;
  }

  const numericRating = Number.parseFloat(String(item.rating || ''));
  if (Number.isFinite(numericRating) && numericRating > 0) {
    score += Math.min(20, Math.round(numericRating * 2));
  }

  return score;
}

export function mergeAndRankCatalogResults(
  remoteItems: CatalogMovie[],
  localItems: CatalogMovie[],
  rawQuery: string,
  options?: { limit?: number; prefer4k?: boolean; minLocalScore?: number }
): CatalogMovie[] {
  const limit = options?.limit ?? 12;
  const prefer4k = Boolean(options?.prefer4k);
  const minLocalScore = options?.minLocalScore ?? 35;

  const dedup = new Map<string, { item: CatalogMovie; score: number; fromRemote: boolean }>();

  const upsert = (item: CatalogMovie, fromRemote: boolean) => {
    const key = item.tmdbId ? `tmdb-${item.tmdbId}` : `id-${item.id}`;
    const score = scoreCatalogItemForQuery(item, rawQuery, { prefer4k });
    if (!fromRemote && score < minLocalScore) return;

    const effectiveScore = fromRemote ? Math.max(score, 60) : score;
    const prev = dedup.get(key);
    if (!prev || effectiveScore > prev.score) {
      dedup.set(key, { item, score: effectiveScore, fromRemote });
    }
  };

  for (const item of remoteItems) upsert(item, true);
  for (const item of localItems) upsert(item, false);

  return Array.from(dedup.values())
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      if (a.fromRemote !== b.fromRemote) return a.fromRemote ? -1 : 1;
      return 0;
    })
    .slice(0, limit)
    .map((entry) => entry.item);
}
