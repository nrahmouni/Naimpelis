/**
 * @module server/routes/detailsAndSubtitles
 * @description Rich TMDB media details (trailer, cast, watch providers, language probe) and cloud subtitle search/proxy endpoints.
 */
import type { Express } from 'express';
import { logger } from '../utils/logger.ts';
import { LruTtlCache } from '../utils/lruCache.ts';
import { assertSafeProxyUrl } from '../utils/ssrfGuard.ts';
import { streamingFetch } from '../utils/tlsFetch.ts';
import { CHROME_UA, curlGetBuffer } from '../extractors/httpHelpers.ts';
import {
  fetchMovidyPageMetadata,
  probeAvailableLanguages,
  type MovidyPageMetadata,
} from '../extractors/bingetrixMovidy.ts';
import {
  fetchGnulaPageMetadata,
  type GnulaPageMetadata,
} from '../extractors/gnulaHdExtractor.ts';
import { fetchTmdbJson, fetchTmdbTitleLogo, resolveLocalizedTmdbTitle } from '../services/tmdbService.ts';
import { filterTmdbValidSeasons } from './catalog/tvDetailsHandler.ts';

import {
  decodeSubtitleBuffer,
  searchAggregatedSubtitles,
  type NormalizedSubtitleTrack,
} from '../services/subtitleAggregator.ts';
import { extractClipboxDirectStreams } from '../extractors/clipboxDirectExtractor.ts';
import {
  findXtreamMovieMatches,
  findXtreamSeriesMatches,
  type XtreamMatchedMediaOption,
} from '../services/xtreamVodMatcher.ts';

function summarizeXtreamAlternatives(options: XtreamMatchedMediaOption[]) {
  const bestOption = options.reduce<XtreamMatchedMediaOption | null>(
    (best, cur) => (!best || cur.qualityTier < best.qualityTier ? cur : best),
    null
  );
  const coreLangs = new Set(['ES', 'LAT', 'VOSE', 'EN']);
  const extendedLanguages = Array.from(
    new Set(options.map((o) => o.lang).filter((l) => !coreLangs.has(l)))
  );
  const serverAlternatives = options.slice(0, 12).map((o) => ({
    id: o.id,
    providerId: o.providerId,
    providerName: o.providerName,
    lang: o.lang,
    langLabel: o.langLabel,
    quality: o.quality,
    qualityTier: o.qualityTier,
  }));
  return {
    bestQuality: bestOption?.quality,
    extendedLanguages,
    serverAlternatives,
  };
}

const subtitleSearchCache = new LruTtlCache<string, { tracks: NormalizedSubtitleTrack[]; ts: number }>(
  250,
  15 * 60 * 1000
);
const richDetailsCache = new LruTtlCache<string, { details: Record<string, unknown>; ts: number }>(
  350,
  30 * 60 * 1000
);

export async function fetchAndCacheSubtitles(
  tmdbId: string,
  season = 0,
  episode = 0,
  timeoutMs = 5000,
  extraOpts?: { title?: string; mediaType?: 'movie' | 'tv' }
): Promise<NormalizedSubtitleTrack[]> {
  const cleanId = String(tmdbId || '').replace(/\D/g, '');
  const cleanTitle = String(extraOpts?.title || '').trim();
  if (!cleanId && !cleanTitle) return [];

  const mediaType: 'movie' | 'tv' =
    extraOpts?.mediaType === 'tv' || (season > 0 && episode > 0) ? 'tv' : 'movie';
  const cacheKey = `${cleanId || cleanTitle.toLowerCase()}|${mediaType}|${season}|${episode}`;
  const cached = subtitleSearchCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 15 * 60 * 1000) {
    return cached.tracks;
  }

  try {
    const clipboxCapTask = cleanId
      ? extractClipboxDirectStreams({
          tmdbId: cleanId,
          mediaType,
          season: season || 1,
          episode: episode || 1,
          skipStreamProbe: true,
        })
          .then((r) => r.subtitles)
          .catch(() => [])
      : Promise.resolve([]);

    const clipboxSubs = await Promise.race([
      clipboxCapTask,
      new Promise<NormalizedSubtitleTrack[]>((resolve) => setTimeout(() => resolve([]), 2400)),
    ]);

    const prioritized = await searchAggregatedSubtitles({
      tmdbId: cleanId || undefined,
      title: cleanTitle || undefined,
      mediaType,
      season,
      episode,
      timeoutMs,
      extraInlineTracks: clipboxSubs,
    });
    if (prioritized.length > 0) {
      subtitleSearchCache.set(cacheKey, { tracks: prioritized, ts: Date.now() });
    }
    return prioritized;
  } catch {
    return [];
  }
}

export interface DetailsAndSubtitlesDeps {
  resolveTmdbIdByTitle: (
    title: string,
    mediaType: 'movie' | 'tv',
    expectedYear?: string
  ) => Promise<number | null>;
  extractLocalizedTmdbTitleHints: (tmJson: any) => string[];
}

export function registerDetailsAndSubtitlesRoutes(
  app: Express,
  deps: DetailsAndSubtitlesDeps
): void {
  const { resolveTmdbIdByTitle, extractLocalizedTmdbTitleHints } = deps;

  app.get('/api/catalog/details/:mediaType/:tmdbId', async (req, res) => {
    try {
      let effectiveMediaType: 'movie' | 'tv' = req.params.mediaType === 'tv' ? 'tv' : 'movie';
      let cleanId = String(req.params.tmdbId || '').replace(/\D/g, '');
      const titleHint = String(req.query.title || '').trim();
      const movidyUrlHint = String(req.query.movidyUrl || '').trim();
      const gnulaUrlHint = String(req.query.gnulaUrl || '').trim();
      const force = String(req.query.force || req.query.forceSpanish || '') === '1';

      let movidyMeta: MovidyPageMetadata | null = null;
      if ((!cleanId || cleanId === '0') && movidyUrlHint) {
        movidyMeta = await fetchMovidyPageMetadata(movidyUrlHint);
      }
      let gnulaMeta: GnulaPageMetadata | null = null;
      if ((!cleanId || cleanId === '0') && gnulaUrlHint) {
        gnulaMeta = await fetchGnulaPageMetadata(gnulaUrlHint);
      }

      if (!cleanId || cleanId === '0') {
        if (movidyMeta || gnulaMeta) {
          if (movidyMeta?.isTvShow || gnulaMeta?.isTvShow) {
            effectiveMediaType = 'tv';
          } else if ((gnulaMeta && !gnulaMeta.isTvShow) || (movidyMeta && !movidyMeta.isTvShow)) {
            effectiveMediaType = 'movie';
          }
        }
        const lookupTitle = movidyMeta?.cleanTitle || gnulaMeta?.cleanTitle || titleHint;
        const lookupYear = movidyMeta?.year || gnulaMeta?.year || undefined;
        if (lookupTitle) {
          const resolved = await resolveTmdbIdByTitle(lookupTitle, effectiveMediaType, lookupYear);
          if (resolved) {
            cleanId = String(resolved);
          } else {
            const altType: 'movie' | 'tv' = effectiveMediaType === 'tv' ? 'movie' : 'tv';
            const altResolved = await resolveTmdbIdByTitle(lookupTitle, altType, lookupYear);
            if (altResolved) {
              cleanId = String(altResolved);
              effectiveMediaType = altType;
            }
          }
        }
      }

      if ((!cleanId || cleanId === '0') && (movidyMeta || gnulaMeta)) {
        const metaYear = movidyMeta?.year || gnulaMeta?.year || '';
        const metaTitle = movidyMeta?.cleanTitle || gnulaMeta?.cleanTitle || titleHint;
        const availableLanguages = await probeAvailableLanguages({
          tmdbId: '',
          mediaType: effectiveMediaType,
          titleHints: [metaTitle, gnulaMeta?.origTitle || ''].filter(Boolean),
          movidyUrl: movidyUrlHint || undefined,
          gnulaUrl: gnulaUrlHint || undefined,
          yearHint: metaYear || undefined,
          force,
        });
        return res.json({
          success: true,
          details: {
            tmdbId: undefined,
            mediaType: effectiveMediaType,
            title: titleHint || metaTitle || 'Película',
            originalTitle: gnulaMeta?.origTitle || metaTitle || undefined,
            year: metaYear || 'HD',
            rating: gnulaMeta?.rating || '',
            runtimeText: movidyMeta?.durationText || gnulaMeta?.durationText || undefined,
            genres: gnulaMeta?.genres || [],
            overview: movidyMeta?.overview || gnulaMeta?.overview || '',
            poster: gnulaMeta?.poster ? `/api/img-proxy?url=${encodeURIComponent(gnulaMeta.poster)}` : '',
            backdrop: gnulaMeta?.backdrop ? `/api/img-proxy?url=${encodeURIComponent(gnulaMeta.backdrop)}` : '',
            directorOrCreator: movidyMeta?.director || gnulaMeta?.director || undefined,
            watchProviders: [],
            availableLanguages,
            cast: movidyMeta?.cast || [],
            similar: [],
          },
        });
      }

      if (!cleanId || cleanId === '0') return res.status(400).json({ success: false });

      const langParam = String(req.query.lang || 'es').toLowerCase() === 'en' ? 'en-US' : 'es-ES';
      const cacheKey = `v8|${effectiveMediaType}|${cleanId}|${langParam}|${movidyUrlHint}|${gnulaUrlHint}`;
      const cached = !force ? richDetailsCache.get(cacheKey) : undefined;
      if (cached && Date.now() - cached.ts < 10 * 60 * 1000) {
        return res.json({ success: true, details: cached.details });
      }

      const data = await fetchTmdbJson<any>(
        `/${effectiveMediaType}/${cleanId}`,
        {
          language: langParam,
          append_to_response:
            'videos,credits,recommendations,watch/providers,external_ids,translations,alternative_titles',
        },
        15 * 60 * 1000
      ).catch(() => null);
      if (!data) return res.status(404).json({ success: false });

      const esWp = data?.['watch/providers']?.results?.ES;
      const rawProviderEntries: any[] = [
        ...(Array.isArray(esWp?.flatrate) ? esWp.flatrate : []),
        ...(Array.isArray(esWp?.ads) ? esWp.ads : []),
        ...(Array.isArray(esWp?.free) ? esWp.free : []),
      ];
      const watchProviders = Array.from(
        new Set(
          rawProviderEntries
            .map((p) => {
              const n = String(p?.provider_name || '').trim();
              if (/netflix/i.test(n)) return 'Netflix';
              if (/hbo|max/i.test(n)) return 'HBO Max';
              if (/disney/i.test(n)) return 'Disney+';
              if (/prime video|amazon/i.test(n)) return 'Prime Video';
              if (/apple tv/i.test(n)) return 'Apple TV+';
              if (/movistar/i.test(n)) return 'Movistar+';
              if (/skyshowtime/i.test(n)) return 'SkyShowtime';
              if (/filmin/i.test(n)) return 'Filmin';
              if (/crunchyroll/i.test(n)) return 'Crunchyroll';
              if (/animebox/i.test(n)) return 'AnimeBox';
              return '';
            })
            .filter(Boolean)
        )
      );

      const localizedTitleData = await resolveLocalizedTmdbTitle({
        tmdbId: Number(cleanId),
        mediaType: effectiveMediaType,
        currentTitle: data.title || data.name || '',
        originalTitle: data.original_title || data.original_name || '',
        lang: langParam,
      });
      const primaryTitle = localizedTitleData.title || titleHint || 'Título';
      const originalTitle = data.original_title || data.original_name || '';
      const rawReleaseDate = String(data.release_date || data.first_air_date || '').trim();
      const tmdbYear = rawReleaseDate.split('-')[0] || '';
      const todayIso = new Date().toISOString().slice(0, 10);
      const tmdbStatus = String(data.status || '').trim();
      const isReleasedTmdbTitle =
        !/^(Planned|In Production|Rumored)$/i.test(tmdbStatus) &&
        (!rawReleaseDate || rawReleaseDate <= todayIso);

      const rawCast: any[] = Array.isArray(data?.credits?.cast) ? data.credits.cast : [];
      const rawCrew: any[] = Array.isArray(data?.credits?.crew) ? data.credits.crew : [];
      const director =
        effectiveMediaType === 'movie'
          ? rawCrew.find((c) => c.job === 'Director')?.name
          : Array.isArray(data?.created_by) && data.created_by[0]?.name
          ? data.created_by[0].name
          : undefined;

      const runtimeMin =
        effectiveMediaType === 'movie'
          ? Number(data?.runtime || 0)
          : Number(data?.episode_run_time?.[0] || 0);
      const validSeasonsCount =
        effectiveMediaType === 'tv' && Array.isArray(data?.seasons)
          ? filterTmdbValidSeasons(data.seasons, {
              lastAiredSeason: Number(data?.last_episode_to_air?.season_number || 0),
              nextAirSeason: Number(data?.next_episode_to_air?.season_number || 0),
            }).length
          : Number(data?.number_of_seasons || 1);
      const runtimeText =
        effectiveMediaType === 'tv'
          ? `${validSeasonsCount || Number(data?.number_of_seasons || 1)} temp · ${Number(data?.number_of_episodes || 0)} eps`
          : runtimeMin > 0
          ? `${Math.floor(runtimeMin / 60)}h ${runtimeMin % 60}m`
          : undefined;

      const tmdbImdbId = data?.imdb_id || data?.external_ids?.imdb_id || null;
      const altLocalizedTitles = extractLocalizedTmdbTitleHints(data);
      const allTitleHints = Array.from(
        new Set([primaryTitle, originalTitle, titleHint, ...altLocalizedTitles].filter(Boolean))
      );

      const [allVideosResolved, probedLanguages, titleLogoUrl, xtreamMatchedOptions] = await Promise.all([
        (async () => {
          let vids: any[] = Array.isArray(data?.videos?.results) ? data.videos.results : [];
          if (vids.length === 0 && langParam !== 'en-US') {
            const enJson = await fetchTmdbJson<any>(
              `/${effectiveMediaType}/${cleanId}/videos`,
              { language: 'en-US' },
              15 * 60 * 1000
            ).catch(() => null);
            vids = Array.isArray(enJson?.results) ? enJson.results : [];
          }
          return vids;
        })(),
        probeAvailableLanguages({
          tmdbId: cleanId,
          imdbId: tmdbImdbId,
          mediaType: effectiveMediaType,
          season: effectiveMediaType === 'tv' ? 1 : undefined,
          episode: effectiveMediaType === 'tv' ? 1 : undefined,
          titleHints: allTitleHints,
          movidyUrl: movidyUrlHint || undefined,
          gnulaUrl: gnulaUrlHint || undefined,
          vestUrl: String(req.query.vestUrl || '').trim() || undefined,
          yearHint: tmdbYear || undefined,
          directorHint: director || undefined,
          runtimeMinHint: runtimeMin || undefined,
          force,
        }),
        fetchTmdbTitleLogo(Number(cleanId), effectiveMediaType, req.query.lang === 'en' ? 'en' : 'es'),
        Promise.race([
          (effectiveMediaType === 'tv'
            ? findXtreamSeriesMatches({
                titleHints: allTitleHints,
                yearHint: tmdbYear || undefined,
                limit: 12,
              })
            : findXtreamMovieMatches({
                titleHints: allTitleHints,
                yearHint: tmdbYear || undefined,
                limit: 12,
              }).then((r) => r.options)
          ).catch(() => [] as XtreamMatchedMediaOption[]),
          new Promise<XtreamMatchedMediaOption[]>((resolve) => setTimeout(() => resolve([]), 2200)),
        ]),
      ]);

      const xtreamSummary = summarizeXtreamAlternatives(xtreamMatchedOptions);

      const origLang = String(data?.original_language || '').toLowerCase();
      const origCountries: string[] = Array.isArray(data?.origin_country)
        ? data.origin_country
        : [];
      const isSpanishNative = origLang === 'es' || origCountries.includes('ES');

      const availableLanguages: ('ES' | 'LAT' | 'VOSE' | 'EN')[] =
        probedLanguages.length > 0
          ? isSpanishNative && !probedLanguages.includes('ES')
            ? ['ES', ...probedLanguages]
            : probedLanguages
          : isReleasedTmdbTitle
          ? isSpanishNative || langParam === 'es-ES'
            ? ['ES', 'EN']
            : ['EN']
          : [];

      const ytVideos = allVideosResolved.filter((v) => v && v.site === 'YouTube' && v.key);
      const officialTrailer =
        ytVideos.find((v) => v.type === 'Trailer' && v.official) ||
        ytVideos.find((v) => v.type === 'Trailer') ||
        ytVideos.find((v) => v.type === 'Teaser') ||
        ytVideos[0];

      const recs: any[] = Array.isArray(data?.recommendations?.results)
        ? data.recommendations.results
        : [];

      const details = {
        tmdbId: Number(cleanId),
        mediaType: effectiveMediaType,
        title: primaryTitle,
        originalTitle,
        tagline: data.tagline || undefined,
        year: tmdbYear || 'HD',
        rating: data.vote_average ? Number(data.vote_average).toFixed(1) : '',
        runtimeText,
        genres: (Array.isArray(data?.genres) ? data.genres : [])
          .map((g: any) => g?.name)
          .filter(Boolean)
          .slice(0, 4),
        overview: localizedTitleData.overview || data.overview || '',
        poster: data.poster_path ? `https://image.tmdb.org/t/p/w500${data.poster_path}` : '',
        backdrop: data.backdrop_path ? `https://image.tmdb.org/t/p/w1280${data.backdrop_path}` : '',
        logoUrl: titleLogoUrl || undefined,
        trailerKey: officialTrailer?.key || undefined,
        directorOrCreator: director,
        cast: rawCast.slice(0, 10).map((c) => ({
          id: c.id,
          name: c.name || '',
          character: c.character || '',
          photo: c.profile_path ? `https://image.tmdb.org/t/p/w185${c.profile_path}` : undefined,
        })),
        similar: recs
          .filter((item) => item && item.id && (item.poster_path || item.backdrop_path))
          .slice(0, 8)
          .map((item) => ({
            id: `${effectiveMediaType}-${item.id}`,
            tmdbId: item.id,
            mediaType: effectiveMediaType,
            title: item.title || item.name || 'Título',
            originalTitle: item.original_title || item.original_name || '',
            year: String(item.release_date || item.first_air_date || '').split('-')[0] || 'HD',
            rating: item.vote_average ? Number(item.vote_average).toFixed(1) : '',
            overview: item.overview || '',
            poster: item.poster_path ? `https://image.tmdb.org/t/p/w500${item.poster_path}` : '',
            backdrop: item.backdrop_path ? `https://image.tmdb.org/t/p/w780${item.backdrop_path}` : '',
            bingetrixUrl: effectiveMediaType === 'movie' ? `https://bingetrix.sc/watch/${item.id}` : undefined,
            languages: ['Español', 'VOSE'],
          })),
        availableLanguages,
        extendedLanguages: xtreamSummary.extendedLanguages,
        bestQuality: xtreamSummary.bestQuality,
        serverAlternatives: xtreamSummary.serverAlternatives,
        watchProviders,
      };

      if (availableLanguages.length > 0) {
        richDetailsCache.set(cacheKey, { details, ts: Date.now() });
      }
      res.json({ success: true, details });
    } catch (err) {
      logger.warn({ err, mediaType: req.params.mediaType, tmdbId: req.params.tmdbId }, 'rich_details_error');
      res.status(500).json({ success: false });
    }
  });

  app.get('/api/subtitles/search', async (req, res) => {
    try {
      const tmdbId = String(req.query.tmdbId || '').replace(/\D/g, '');
      const title = String(req.query.title || '').trim();
      const mediaType =
        String(req.query.mediaType || '').toLowerCase() === 'tv' ? 'tv' : 'movie';
      if (!tmdbId && !title) return res.json({ success: true, tracks: [] });
      const season = parseInt(String(req.query.season || '0'), 10) || 0;
      const episode = parseInt(String(req.query.episode || '0'), 10) || 0;

      const prioritized = await fetchAndCacheSubtitles(tmdbId, season, episode, 5200, {
        title: title || undefined,
        mediaType,
      });
      res.json({ success: true, tracks: prioritized });
    } catch {
      res.json({ success: true, tracks: [] });
    }
  });

  app.get('/api/subtitles/proxy', async (req, res) => {
    const rawUrl = String(req.query.url || '');
    if (!rawUrl || !/^https?:\/\//i.test(rawUrl)) return res.status(400).send('');
    try {
      await assertSafeProxyUrl(rawUrl);
    } catch {
      return res.status(403).send('');
    }
    try {
      let rawBuf: Buffer | null = null;
      try {
        const r = await streamingFetch(rawUrl, {
          headers: { 'User-Agent': CHROME_UA, Accept: '*/*' },
          timeoutMs: 5500,
        });
        if (r.ok) {
          const ab = await r.arrayBuffer();
          if (ab.byteLength > 0 && ab.byteLength <= 5 * 1024 * 1024) {
            rawBuf = Buffer.from(ab);
          }
        }
      } catch {
        // fallback to curl binary fetch below
      }
      if (!rawBuf || rawBuf.length === 0) {
        const curled = await curlGetBuffer(rawUrl, { 'User-Agent': CHROME_UA }, 7).catch(() =>
          Buffer.alloc(0)
        );
        if (curled.length > 0 && curled.length <= 5 * 1024 * 1024) {
          rawBuf = curled;
        }
      }
      if (!rawBuf || rawBuf.length === 0) return res.status(404).send('');
      const txt = decodeSubtitleBuffer(rawBuf, rawUrl);
      if (!txt || /^<!doctype|^<html/i.test(txt)) return res.status(404).send('');
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.setHeader('Cache-Control', 'public, max-age=3600');
      res.send(txt);
    } catch {
      res.status(502).send('');
    }
  });
}
