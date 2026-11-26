import { LruTtlCache } from '../utils/lruCache.ts';
import {
  findVestSeedForMedia,
  isVestMirrorUrl,
} from '../services/vestMirrorService.ts';
import {
  type TrackRecord,
  generateSpanishTitleHints,
} from './httpHelpers.ts';
import { extractEmbed69SpanishTracks } from './vidhideEmbed69.ts';
import {
  extractGnulaHdTracks,
  findGnulaHdUrlByTitle,
  isGnulaHdUrl,
  normalizeGnulaUrl,
} from './gnulaHdExtractor.ts';
import {
  has2EmbedEnglishStreamFast,
  hasBingetrixEnglishStreamFast,
} from './bingetrixHelpers/englishStreamExtractors.ts';
import {
  extractMovidyPageTracks,
  fetchMovidyPageMetadata,
  findMovidyUrlByTitle,
  isMovidyVerUrl,
  normalizeMovidyUrl,
  verifyMovidyMetaMatch,
} from './bingetrixHelpers/movidyScraper.ts';
import {
  hasGhostflixVidboltStreamFast,
} from './bingetrixHelpers/ghostflixVidboltExtractor.ts';

export * from './bingetrixHelpers/englishStreamExtractors.ts';
export * from './bingetrixHelpers/movidyScraper.ts';
export * from './bingetrixHelpers/ghostflixVidboltExtractor.ts';

const availableLangsCache = new LruTtlCache<string, ('ES' | 'LAT' | 'VOSE' | 'EN')[]>(
  500,
  15 * 60 * 1000
);

export async function probeAvailableLanguages(opts: {
  tmdbId: string | number;
  imdbId?: string | null;
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  titleHints?: string[];
  movidyUrl?: string;
  gnulaUrl?: string;
  vestUrl?: string;
  yearHint?: string;
  directorHint?: string;
  runtimeMinHint?: number;
  force?: boolean;
}): Promise<('ES' | 'LAT' | 'VOSE' | 'EN')[]> {
  const cleanId = String(opts.tmdbId || '').replace(/\D/g, '');
  const season = opts.mediaType === 'tv' ? opts.season || 1 : 0;
  const episode = opts.mediaType === 'tv' ? opts.episode || 1 : 0;
  const cacheKey = `v4|${opts.mediaType}|${cleanId || opts.movidyUrl || opts.gnulaUrl || opts.vestUrl || ''}|${opts.yearHint || ''}|${season}|${episode}`;

  if (!opts.force) {
    const cached = availableLangsCache.get(cacheKey);
    if (cached) return cached;
  }

  const rawHints = (opts.titleHints || []).map((t) => String(t || '').trim()).filter(Boolean);
  const expandedHints: string[] = [];
  for (const h of rawHints) {
    expandedHints.push(h);
    for (const v of generateSpanishTitleHints(h)) {
      expandedHints.push(v);
    }
  }
  const hints = Array.from(new Set(expandedHints));

  const normalizedExplicitMovidy = normalizeMovidyUrl(opts.movidyUrl || '');
  const hasExplicitMovidy = isMovidyVerUrl(normalizedExplicitMovidy);
  const normalizedExplicitGnula = normalizeGnulaUrl(opts.gnulaUrl || '');
  const hasExplicitGnula = isGnulaHdUrl(normalizedExplicitGnula);

  // 1. Movidy (Top Priority)
  const movidyPromise = (async (): Promise<TrackRecord[]> => {
    let mvUrl = hasExplicitMovidy ? normalizedExplicitMovidy : '';
    if (mvUrl && (cleanId || opts.yearHint || opts.directorHint || opts.runtimeMinHint)) {
      const explicitMeta = await fetchMovidyPageMetadata(mvUrl);
      if (
        !explicitMeta ||
        !verifyMovidyMetaMatch(explicitMeta, {
          titleHints: cleanId ? hints : [],
          expectedYear: opts.yearHint,
          expectedDirector: opts.directorHint,
          expectedRuntimeMin: opts.runtimeMinHint,
          expectedMediaType: opts.mediaType,
        }).ok
      ) {
        mvUrl = '';
      }
    }
    if (!mvUrl && hints.length > 0) {
      mvUrl =
        (await findMovidyUrlByTitle(hints[0], opts.yearHint, {
          expectedDirector: opts.directorHint,
          expectedRuntimeMin: opts.runtimeMinHint,
          titleHints: hints,
          expectedMediaType: opts.mediaType,
        })) || '';
    }
    if (!mvUrl) return [];
    return extractMovidyPageTracks(mvUrl, {
      expectedYear: opts.yearHint,
      requireMovieOnly: opts.mediaType === 'movie',
      expectedTitleHints: cleanId ? hints : undefined,
      expectedDirector: opts.mediaType === 'movie' ? opts.directorHint : undefined,
      expectedRuntimeMin: opts.mediaType === 'movie' ? opts.runtimeMinHint : undefined,
    });
  })();

  // 2. GnulaHD (Second Priority)
  const gnulaPromise = (async (): Promise<TrackRecord[]> => {
    let gnUrl = hasExplicitGnula ? normalizedExplicitGnula : '';
    if (!gnUrl && hints.length > 0) {
      gnUrl =
        (await findGnulaHdUrlByTitle(hints, opts.yearHint, {
          expectedDirector: opts.directorHint,
          expectedRuntimeMin: opts.runtimeMinHint,
          titleHints: hints,
          expectedMediaType: opts.mediaType,
        })) || '';
    }
    if (!gnUrl) return [];
    return extractGnulaHdTracks(gnUrl, {
      expectedYear: opts.yearHint,
      expectedTitleHints: cleanId ? hints : undefined,
      expectedDirector: opts.directorHint,
      expectedRuntimeMin: opts.runtimeMinHint,
      mediaType: opts.mediaType,
      season: season || undefined,
      episode: episode || undefined,
      skipUnpack: true,
    });
  })();

  // 4. Other Spanish sources (Embed69 / SeriesKao / AnimeAV1)
  const embedPromise =
    cleanId || hints.length > 0
      ? extractEmbed69SpanishTracks({
          tmdbId: cleanId || undefined,
          imdbId: opts.imdbId,
          mediaType: opts.mediaType,
          season: season || undefined,
          episode: episode || undefined,
          titleHints: hints,
          yearHint: opts.yearHint,
          directorHint: opts.directorHint,
          runtimeMinHint: opts.runtimeMinHint,
          force: opts.force,
          skipGnula: true,
        })
      : Promise.resolve([] as TrackRecord[]);

  // 3. Bingetrix & English HLS sources
  const checkAnyEnglishStream = async (): Promise<boolean> => {
    if (!cleanId && !opts.imdbId) return false;
    const probes: Promise<boolean>[] = [
      has2EmbedEnglishStreamFast({
        tmdbId: cleanId || '0',
        imdbId: opts.imdbId,
        mediaType: opts.mediaType,
        season: season || undefined,
        episode: episode || undefined,
      }),
    ];
    if (cleanId) {
      probes.push(
        hasBingetrixEnglishStreamFast({
          tmdbId: cleanId,
          mediaType: opts.mediaType,
          season: season || undefined,
          episode: episode || undefined,
        })
      );
    }
    return new Promise<boolean>((resolve) => {
      let pending = probes.length;
      for (const p of probes) {
        p.then((ok) => {
          if (ok) {
            resolve(true);
            return;
          }
          pending -= 1;
          if (pending <= 0) resolve(false);
        }).catch(() => {
          pending -= 1;
          if (pending <= 0) resolve(false);
        });
      }
    });
  };

  const withProbeTimeout = <T>(p: Promise<T>, ms: number, fallback: T): Promise<T> =>
    Promise.race([
      p.catch(() => fallback),
      new Promise<T>((resolve) => setTimeout(() => resolve(fallback), ms)),
    ]);

  const [mvTracks, gnTracks, esTracks, hasEn, vidboltProbe] = await Promise.all([
    withProbeTimeout(movidyPromise, 5500, [] as TrackRecord[]),
    withProbeTimeout(gnulaPromise, 5500, [] as TrackRecord[]),
    withProbeTimeout(embedPromise, opts.force ? 8500 : 6500, [] as TrackRecord[]),
    withProbeTimeout(checkAnyEnglishStream(), 4500, false),
    cleanId
      ? withProbeTimeout(
          hasGhostflixVidboltStreamFast({
            tmdbId: cleanId,
            mediaType: opts.mediaType,
            season: season || undefined,
            episode: episode || undefined,
          }),
          3600,
          { ok: false, langs: [] as ('ES' | 'LAT' | 'VOSE' | 'EN')[] }
        )
      : Promise.resolve({ ok: false, langs: [] as ('ES' | 'LAT' | 'VOSE' | 'EN')[] }),
  ]);
  const foundSet = new Set<'ES' | 'LAT' | 'VOSE' | 'EN'>();

  for (const t of [...mvTracks, ...gnTracks, ...esTracks]) {
    const code = String(t.lang || '').toUpperCase();
    if (code === 'ES' || code === 'LAT' || code === 'VOSE' || code === 'EN') {
      foundSet.add(code);
    }
  }
  if (hasEn) {
    foundSet.add('EN');
  }
  if (vidboltProbe.ok) {
    for (const code of vidboltProbe.langs) {
      foundSet.add(code);
    }
  }

  const vestMatch =
    (opts.vestUrl && isVestMirrorUrl(opts.vestUrl)) ||
    Boolean(
      findVestSeedForMedia({
        tmdbId: cleanId || undefined,
        mediaType: opts.mediaType,
        yearHint: opts.yearHint,
        titleHints: hints,
        season: season || undefined,
        episode: episode || undefined,
      })
    );
  if (vestMatch) {
    foundSet.add('ES');
    foundSet.add('VOSE');
  }

  const ordered = (['ES', 'LAT', 'VOSE', 'EN'] as const).filter((code) =>
    foundSet.has(code)
  );

  // Only cache positive multi-language results or confirmed probes (never poison cache with lone EN timeout fallback)
  if (ordered.length > 0 && !(ordered.length === 1 && ordered[0] === 'EN')) {
    availableLangsCache.set(cacheKey, ordered);
  }

  return ordered;
}
