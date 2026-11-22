import { ENV } from '../config/env.ts';
import { logger } from '../utils/logger.ts';
import { type TrackRecord } from './httpHelpers.ts';
import { resolveImdbId } from './vidhideHelpers/directHostUnpackers.ts';
import {
  fetchEmbed69HtmlWithMirrorAndAnubis,
  parseEmbed69OrMoeTracks,
  resolveSeriesKaoVidurlTracks,
} from './vidhideHelpers/embed69AndSeriesKao.ts';
import {
  extractAnimeAv1Tracks,
  extractGnulaCastellanoTracks,
} from './vidhideHelpers/animeAv1AndGnulaCompat.ts';

export {
  unpackByseToHls,
  unpackVidhideToHls,
  unpackMp4UploadToDirect,
  resolveImdbId,
} from './vidhideHelpers/directHostUnpackers.ts';
export {
  parseEmbed69OrMoeTracks,
  resolveSeriesKaoVidurlTracks,
} from './vidhideHelpers/embed69AndSeriesKao.ts';
export {
  extractAnimeAv1Tracks,
  parseGnulaPageMetadata,
  pickBestGnulaSearchResult,
  withGnmParam,
  parseGnulaPlayerPayload,
  extractGnulaCastellanoTracks,
} from './vidhideHelpers/animeAv1AndGnulaCompat.ts';

const TMDB_API_KEY = ENV.tmdbApiKey;

export async function extractEmbed69SpanishTracks(opts: {
  tmdbId?: string | number;
  imdbId?: string | null;
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  titleHints?: string[];
  yearHint?: string;
  directorHint?: string;
  runtimeMinHint?: number;
  force?: boolean;
  skipGnula?: boolean;
}): Promise<TrackRecord[]> {
  try {
    let imdbId = opts.imdbId || null;
    const hints = [...(opts.titleHints || [])].filter(Boolean);
    let isLikelyAnime = false;
    let yearHint = opts.yearHint || '';
    let directorHint = opts.directorHint || '';
    let runtimeMinHint = opts.runtimeMinHint || 0;

    if (opts.tmdbId) {
      try {
        const cleanId = String(opts.tmdbId).replace(/\D/g, '');
        const tmUrl =
          opts.mediaType === 'tv'
            ? `https://api.themoviedb.org/3/tv/${cleanId}?api_key=${TMDB_API_KEY}&language=es-ES&append_to_response=translations,external_ids,credits,alternative_titles`
            : `https://api.themoviedb.org/3/movie/${cleanId}?api_key=${TMDB_API_KEY}&language=es-ES&append_to_response=translations,external_ids,credits,alternative_titles`;
        const tmRes = await fetch(tmUrl, { signal: AbortSignal.timeout(3000) });
        if (tmRes.ok) {
          const tmJson: any = await tmRes.json();
          if (!imdbId) {
            imdbId = tmJson?.imdb_id || tmJson?.external_ids?.imdb_id || null;
          }
          const esName = String(tmJson?.name || tmJson?.title || '').trim();
          const origName = String(
            tmJson?.original_name || tmJson?.original_title || ''
          ).trim();
          const rawDate = String(tmJson?.first_air_date || tmJson?.release_date || '');
          if (rawDate && !yearHint) yearHint = rawDate.split('-')[0] || '';
          if (!directorHint && opts.mediaType === 'movie') {
            const crew: any[] = Array.isArray(tmJson?.credits?.crew) ? tmJson.credits.crew : [];
            directorHint = String(crew.find((c) => c?.job === 'Director')?.name || '').trim();
          }
          if (!runtimeMinHint && opts.mediaType === 'movie') {
            runtimeMinHint = Number(tmJson?.runtime || 0) || 0;
          }
          if (esName && !hints.includes(esName)) hints.push(esName);

          const translations: any[] = Array.isArray(tmJson?.translations?.translations)
            ? tmJson.translations.translations
            : [];
          for (const tr of translations) {
            if (tr?.iso_3166_1 === 'MX' || tr?.iso_639_1 === 'es') {
              const esTr = String(tr?.data?.title || tr?.data?.name || '').trim();
              if (esTr && !hints.includes(esTr)) hints.push(esTr);
            }
          }

          const altRows: any[] = Array.isArray(tmJson?.alternative_titles?.titles)
            ? tmJson.alternative_titles.titles
            : Array.isArray(tmJson?.alternative_titles?.results)
            ? tmJson.alternative_titles.results
            : [];
          for (const alt of altRows) {
            if (['ES', 'MX', 'AR', 'CO', 'CL', 'PE', 'US', 'GB'].includes(alt?.iso_3166_1)) {
              const altTitle = String(alt?.title || '').trim();
              if (altTitle && !hints.includes(altTitle)) hints.push(altTitle);
            }
          }

          if (origName && !hints.includes(origName)) hints.push(origName);

          const enEntry = translations.find(
            (tr) => tr?.iso_3166_1 === 'US' || tr?.iso_639_1 === 'en'
          );
          const enTrName = String(enEntry?.data?.title || enEntry?.data?.name || '').trim();
          if (enTrName && !hints.includes(enTrName)) hints.push(enTrName);

          const genres: any[] = Array.isArray(tmJson?.genres) ? tmJson.genres : [];
          const hasAnimGenre = genres.some((g) => Number(g?.id) === 16);
          const origCountries: string[] = Array.isArray(tmJson?.origin_country)
            ? tmJson.origin_country
            : [];
          const isJp =
            String(tmJson?.original_language || '').toLowerCase() === 'ja' ||
            origCountries.includes('JP');
          isLikelyAnime = hasAnimGenre && isJp;
        }
      } catch {
        // ignore
      }
    }

    if (!imdbId && opts.tmdbId) {
      imdbId = await resolveImdbId(opts.tmdbId, opts.mediaType);
    }

    const epSuffix =
      opts.mediaType === 'tv' && opts.season && opts.episode
        ? `-${opts.season}x${String(opts.episode).padStart(2, '0')}`
        : '';

    const withSoftTimeout = (p: Promise<TrackRecord[]>, ms: number): Promise<TrackRecord[]> =>
      Promise.race([
        p.catch(() => [] as TrackRecord[]),
        new Promise<TrackRecord[]>((res) => setTimeout(() => res([]), ms)),
      ]);

    const gnulaPromise =
      !opts.skipGnula && hints.length > 0
        ? extractGnulaCastellanoTracks({
            titleHints: hints,
            mediaType: opts.mediaType,
            season: opts.season,
            episode: opts.episode,
            yearHint,
            directorHint: directorHint || undefined,
            runtimeMinHint: runtimeMinHint || undefined,
            force: opts.force,
          })
        : Promise.resolve([] as TrackRecord[]);

    const directPromise = imdbId
      ? fetchEmbed69HtmlWithMirrorAndAnubis(`${imdbId}${epSuffix}`)
          .then((html) => parseEmbed69OrMoeTracks(html, `${imdbId}${epSuffix}`))
          .catch(() => [] as TrackRecord[])
      : Promise.resolve([] as TrackRecord[]);

    const skPromise = hints.length > 0
      ? resolveSeriesKaoVidurlTracks({
          titleHints: hints,
          mediaType: opts.mediaType,
          season: opts.season,
          episode: opts.episode,
          yearHint,
          imdbId,
          directorHint: directorHint || undefined,
          runtimeMinHint: runtimeMinHint || undefined,
          force: opts.force,
        })
      : Promise.resolve([] as TrackRecord[]);

    const animePromise = isLikelyAnime && hints.length > 0
      ? extractAnimeAv1Tracks({
          titleHints: hints,
          mediaType: opts.mediaType,
          season: opts.season,
          episode: opts.episode,
        })
      : Promise.resolve([] as TrackRecord[]);

    const [gnulaTracks, directTracks, skTracks, animeTracks] = await Promise.all([
      withSoftTimeout(gnulaPromise, 4800),
      withSoftTimeout(directPromise, 4500),
      withSoftTimeout(skPromise, 4800),
      withSoftTimeout(animePromise, 4200),
    ]);

    const seenTrackKeys = new Set<string>();
    const countPerLang: Record<string, number> = {};
    const merged: TrackRecord[] = [];

    const nativeCandidates = [
      ...gnulaTracks.filter((t) => t.resolverType === 'vidhide_hls'),
      ...directTracks.filter((t) => t.resolverType !== 'web_embed'),
      ...skTracks.filter((t) => t.resolverType !== 'web_embed'),
      ...animeTracks.filter((t) => t.resolverType !== 'web_embed'),
      ...gnulaTracks.filter((t) => t.resolverType !== 'vidhide_hls' && t.resolverType !== 'web_embed'),
    ];
    const webEmbedBackups = [
      ...gnulaTracks.filter((t) => t.resolverType === 'web_embed'),
      ...directTracks.filter((t) => t.resolverType === 'web_embed'),
      ...skTracks.filter((t) => t.resolverType === 'web_embed'),
      ...animeTracks.filter((t) => t.resolverType === 'web_embed'),
    ];
    const orderedCandidates = [...nativeCandidates, ...webEmbedBackups];

    for (const tr of orderedCandidates) {
      const code = String(tr.lang || '').toUpperCase();
      if (!code) continue;
      const key = `${code}:${tr.resolverType}:${tr.sourceUrl}`;
      if (seenTrackKeys.has(key)) continue;
      const currentCount = countPerLang[code] || 0;
      if (currentCount >= 6) continue;
      seenTrackKeys.add(key);
      countPerLang[code] = currentCount + 1;
      merged.push(tr);
    }

    const orderMap: Record<string, number> = { ES: 1, LAT: 2, VOSE: 3 };
    const resolverRank = (rt: string) =>
      rt === 'vidhide_hls' ? 1 : rt === 'movidy_embed' ? 2 : rt === 'embed_sniff' ? 3 : 4;
    return merged.sort((a, b) => {
      const langDiff = (orderMap[a.lang] || 9) - (orderMap[b.lang] || 9);
      if (langDiff !== 0) return langDiff;
      return resolverRank(a.resolverType) - resolverRank(b.resolverType);
    });
  } catch (err) {
    logger.warn({ err }, 'extractEmbed69SpanishTracks error');
    return [];
  }
}
