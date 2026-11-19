import { LruTtlCache } from '../utils/lruCache.ts';
import {
  CHROME_UA,
  decodeBasicHtmlEntities,
  fetchTextWithCurlFallback,
  normalizeTitleForMatch,
  type TrackRecord,
} from './httpHelpers.ts';

const seriesMetroTrackCache = new LruTtlCache<string, TrackRecord[]>(300, 30 * 60 * 1000);
const seriesMetroSlugCache = new LruTtlCache<string, string | null>(200, 60 * 60 * 1000);
const archiveMetaCache = new LruTtlCache<string, ArchiveFileEntry[]>(100, 6 * 60 * 60 * 1000);

interface ArchiveFileEntry {
  name: string;
  format?: string;
}

const LQSA_ARCHIVE_SEASON_ITEMS: Record<number, string[]> = {
  1: ['spanish-neighborhood-sitcom-s01-remaster', 'lqsa_20260416'],
  2: ['spanish-neighborhood-sitcom-s02-remaster'],
  3: ['spanish-neighborhood-sitcom-s03-remaster'],
  4: ['spanish-neighborhood-sitcom-s04-remaster'],
  5: ['spanish-neighborhood-sitcom-s05-remaster_202611'],
  11: ['temporada-11-LQSA'],
};

const SERIES_METRO_MIRRORS = ['https://www3.seriesmetro.net', 'https://magistv24.com'];

function toKebabSlug(title: string): string {
  return normalizeTitleForMatch(String(title || '').replace(/\s*\([^)]*\)/g, ''))
    .replace(/\s+/g, '-')
    .replace(/^-+|-+$/g, '');
}

function mapSeriesMetroOptionLang(labelText: string): { lang: 'ES' | 'LAT' | 'VOSE'; label: string } {
  const low = normalizeTitleForMatch(labelText);
  if (low.includes('latino') || low.includes('lat')) {
    return { lang: 'LAT', label: 'Latino' };
  }
  if (low.includes('sub') || low.includes('vose') || low.includes('ingles')) {
    return { lang: 'VOSE', label: 'Subtitulado' };
  }
  return { lang: 'ES', label: 'Castellano' };
}

function classifyEmbedResolver(embedUrl: string): TrackRecord['resolverType'] {
  const low = embedUrl.toLowerCase();
  if (
    /fastream\.|vidhide|smoothpre|earnvids|filelions|byse|vidaraa?\.|streamwish|hglink|hlswish|wishembed/i.test(
      low
    )
  ) {
    return 'vidhide_hls';
  }
  if (/voe\./i.test(low)) return 'embed_sniff';
  return 'web_embed';
}

export function parseSeriesMetroEpisodeOptions(
  epHtml: string
): Array<{ optionIndex: number; trembedUrl: string; lang: 'ES' | 'LAT' | 'VOSE'; langLabel: string }> {
  if (!epHtml) return [];
  const results: Array<{
    optionIndex: number;
    trembedUrl: string;
    lang: 'ES' | 'LAT' | 'VOSE';
    langLabel: string;
  }> = [];

  const optionLabels = new Map<string, string>();
  const tabListMatch = epHtml.match(/<ul[^>]*class="[^"]*aa-tbs-video[^"]*"[^>]*>([\s\S]*?)<\/ul>/i);
  if (tabListMatch?.[1]) {
    const tabRe = /<a[^>]*href="#(options-\d+)"[^>]*>([\s\S]*?)<\/a>/gi;
    let tm: RegExpExecArray | null;
    while ((tm = tabRe.exec(tabListMatch[1])) !== null) {
      const optId = tm[1];
      const text = decodeBasicHtmlEntities(tm[2].replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').trim();
      optionLabels.set(optId, text);
    }
  }

  const panelRe =
    /<div[^>]*id="(options-(\d+))"[^>]*class="[^"]*video[^"]*"[^>]*>[\s\S]*?<iframe[^>]+(?:data-src|src)="([^"]+)"/gi;
  let pm: RegExpExecArray | null;
  while ((pm = panelRe.exec(epHtml)) !== null) {
    const optId = pm[1];
    const optIdx = parseInt(pm[2], 10) || 0;
    const rawEmbed = decodeBasicHtmlEntities(pm[3]).trim();
    if (!rawEmbed || !rawEmbed.includes('trembed=')) continue;
    const labelText = optionLabels.get(optId) || 'Castellano';
    const mapped = mapSeriesMetroOptionLang(labelText);
    if (!results.some((r) => r.trembedUrl === rawEmbed)) {
      results.push({
        optionIndex: optIdx,
        trembedUrl: rawEmbed,
        lang: mapped.lang,
        langLabel: mapped.label,
      });
    }
  }

  if (results.length === 0) {
    const fallbackRe = /(https?:\/\/[^"'\s]+\/\?trembed=\d+[^"'\s]+)/gi;
    let fm: RegExpExecArray | null;
    let idx = 0;
    while ((fm = fallbackRe.exec(epHtml)) !== null) {
      const url = decodeBasicHtmlEntities(fm[1]).trim();
      if (!results.some((r) => r.trembedUrl === url)) {
        results.push({
          optionIndex: idx++,
          trembedUrl: url,
          lang: 'ES',
          langLabel: 'Castellano',
        });
      }
    }
  }

  return results;
}

async function resolveSeriesMetroSlugForMirror(
  origin: string,
  titleHints: string[]
): Promise<string | null> {
  const mainNorm = normalizeTitleForMatch(titleHints[0] || '');
  const cacheKey = `${origin}|${mainNorm}`;
  if (seriesMetroSlugCache.has(cacheKey)) {
    return seriesMetroSlugCache.get(cacheKey) || null;
  }

  const directSlugs = Array.from(
    new Set(titleHints.map((t) => toKebabSlug(t)).filter((s) => s.length >= 2))
  );

  for (const slug of directSlugs.slice(0, 2)) {
    const testUrl = `${origin}/serie/${slug}/`;
    const html = await fetchTextWithCurlFallback(
      testUrl,
      { 'User-Agent': CHROME_UA, Referer: `${origin}/` },
      4500
    ).catch(() => '');
    if (html && html.includes('data-post=') && !/Page not found|Página no encontrada/i.test(html)) {
      seriesMetroSlugCache.set(cacheKey, slug);
      return slug;
    }
  }

  for (const hint of titleHints.slice(0, 2)) {
    const clean = String(hint || '').replace(/\s*\([^)]*\)/g, '').trim();
    if (clean.length < 2) continue;
    const sHtml = await fetchTextWithCurlFallback(
      `${origin}/?s=${encodeURIComponent(clean)}`,
      { 'User-Agent': CHROME_UA, Referer: `${origin}/` },
      4500
    ).catch(() => '');
    if (!sHtml) continue;
    const m = sHtml.match(/href="(?:https?:\/\/[^"]+)?\/serie\/([a-z0-9-]+)\/?"/i);
    if (m?.[1]) {
      seriesMetroSlugCache.set(cacheKey, m[1]);
      return m[1];
    }
  }

  seriesMetroSlugCache.set(cacheKey, null);
  return null;
}

export async function extractSeriesMetroTracks(opts: {
  tmdbId?: string | number | null;
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  titleHints: string[];
}): Promise<TrackRecord[]> {
  if (opts.mediaType !== 'tv' || !opts.titleHints?.length) return [];
  const season = Math.max(1, Number(opts.season) || 1);
  const episode = Math.max(1, Number(opts.episode) || 1);
  const cacheKey = `${String(opts.tmdbId || opts.titleHints[0])}:${season}x${episode}`;
  const cached = seriesMetroTrackCache.get(cacheKey);
  if (cached) return cached;

  const isLqsa =
    String(opts.tmdbId || '') === '35338' ||
    opts.titleHints.some((h) => normalizeTitleForMatch(h).includes('la que se avecina'));

  for (const origin of SERIES_METRO_MIRRORS) {
    try {
      const slug = isLqsa
        ? 'la-que-se-avecina'
        : await resolveSeriesMetroSlugForMirror(origin, opts.titleHints);
      if (!slug) continue;

      const epUrl = `${origin}/capitulo/${slug}-temporada-${season}-capitulo-${episode}/`;
      const epHtml = await fetchTextWithCurlFallback(
        epUrl,
        {
          'User-Agent': CHROME_UA,
          Referer: `${origin}/serie/${slug}/`,
          'Accept-Language': 'es-ES,es;q=0.9',
        },
        5000
      ).catch(() => '');

      if (!epHtml || /Page not found|Página no encontrada/i.test(epHtml)) continue;

      const options = parseSeriesMetroEpisodeOptions(epHtml);
      if (options.length === 0) continue;

      const orderedOpts = [...options].sort((a, b) => {
        const score = (l: string) => (l === 'ES' ? 0 : l === 'LAT' ? 1 : 2);
        return score(a.lang) - score(b.lang) || a.optionIndex - b.optionIndex;
      });

      const resolvedTracks = await Promise.all(
        orderedOpts.slice(0, 3).map(async (opt, idx): Promise<TrackRecord | null> => {
          const tHtml = await fetchTextWithCurlFallback(
            opt.trembedUrl,
            {
              'User-Agent': CHROME_UA,
              Referer: epUrl,
              'Accept-Language': 'es-ES,es;q=0.9',
            },
            4500
          ).catch(() => '');
          if (!tHtml) return null;
          const innerSrcMatch = tHtml.match(/<iframe[^>]+src=["']([^"']+)["']/i);
          const innerUrl = innerSrcMatch?.[1]
            ? decodeBasicHtmlEntities(innerSrcMatch[1]).trim()
            : '';
          if (!innerUrl || !/^https?:\/\//i.test(innerUrl)) return null;

          const resolverType = classifyEmbedResolver(innerUrl);
          return {
            id: `seriesmetro-${slug}-${season}x${episode}-${opt.lang.toLowerCase()}-${idx}`,
            label: `SeriesMetro HD · ${opt.langLabel}`,
            lang: opt.lang,
            quality: '1080p',
            sourceUrl: innerUrl,
            referer: `${origin}/`,
            resolverType,
          };
        })
      );

      const tracks = resolvedTracks.filter((t): t is TrackRecord => Boolean(t));
      if (tracks.length > 0) {
        seriesMetroTrackCache.set(cacheKey, tracks);
        return tracks;
      }
    } catch {
      // try next mirror
    }
  }

  return [];
}

export function matchArchiveFileForEpisode(
  files: ArchiveFileEntry[],
  season: number,
  episode: number
): ArchiveFileEntry | null {
  const s = Math.max(1, season);
  const e = Math.max(1, episode);
  const epPad = String(e).padStart(2, '0');

  const matches = files.filter((f) => {
    const name = String(f.name || '');
    if (!/\.(mp4|m4v|webm)$/i.test(name)) return false;
    const base = name.split('/').pop() || name;
    if (new RegExp(`\\b0*${s}\\s*[xX]\\s*0*${e}\\b`).test(name)) return true;
    if (
      new RegExp(`(?:^|\\/)t0*${s}\\/0*${e}\\.(?:ia\\.)?(?:mp4|m4v|webm)$`, 'i').test(name)
    ) {
      return true;
    }
    if (
      new RegExp(
        `temporada\\s*0*${s}[^a-z0-9]{0,12}(?:cap[ií]tulo|cap\\.?|episodio|ep\\.?)\\s*0*${e}\\b`,
        'i'
      ).test(base)
    ) {
      return true;
    }
    if (s === 1 && new RegExp(`^0*${epPad}\\.(?:ia\\.)?(?:mp4|m4v|webm)$`, 'i').test(base)) {
      return true;
    }
    return false;
  });

  if (matches.length === 0) return null;

  // Prefer H.264 IA derivative (.ia.mp4 or explicit h.264 format) so HTML5/ExoPlayer plays cleanly without HEVC black-screen
  matches.sort((a, b) => {
    const score = (f: ArchiveFileEntry): number => {
      const fmt = String(f.format || '').toLowerCase();
      const low = f.name.toLowerCase();
      if (low.endsWith('.ia.mp4') || fmt === 'h.264 ia' || fmt === 'h.264') return 0;
      if (low.endsWith('.mp4')) return 1;
      return 2;
    };
    return score(a) - score(b);
  });

  return matches[0];
}

async function fetchArchiveItemFiles(identifier: string): Promise<ArchiveFileEntry[]> {
  const cached = archiveMetaCache.get(identifier);
  if (cached) return cached;
  try {
    const res = await fetch(`https://archive.org/metadata/${encodeURIComponent(identifier)}`, {
      headers: { 'User-Agent': CHROME_UA },
      signal: AbortSignal.timeout(4200),
    });
    if (!res.ok) return [];
    const json: any = await res.json();
    const files: ArchiveFileEntry[] = Array.isArray(json?.files)
      ? json.files
          .filter((f: any) => f?.name && /\.(mp4|m4v|webm)$/i.test(String(f.name)))
          .map((f: any) => ({ name: String(f.name), format: f.format ? String(f.format) : undefined }))
      : [];
    if (files.length > 0) {
      archiveMetaCache.set(identifier, files);
    }
    return files;
  } catch {
    return [];
  }
}

export async function extractArchiveOrgSeriesTracks(opts: {
  tmdbId?: string | number | null;
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  titleHints: string[];
}): Promise<TrackRecord[]> {
  if (opts.mediaType !== 'tv') return [];
  const isLqsa =
    String(opts.tmdbId || '') === '35338' ||
    opts.titleHints.some((h) => normalizeTitleForMatch(h).includes('la que se avecina'));
  if (!isLqsa) return [];

  const season = Math.max(1, Number(opts.season) || 1);
  const episode = Math.max(1, Number(opts.episode) || 1);
  const identifiers = LQSA_ARCHIVE_SEASON_ITEMS[season];
  if (!identifiers || identifiers.length === 0) return [];

  const tracks: TrackRecord[] = [];
  for (const identifier of identifiers) {
    const files = await fetchArchiveItemFiles(identifier);
    const chosen = matchArchiveFileForEpisode(files, season, episode);
    if (!chosen) continue;

    const encodedPath = chosen.name
      .split('/')
      .map((seg) => encodeURIComponent(seg))
      .join('/');
    const directUrl = `https://archive.org/download/${encodeURIComponent(identifier)}/${encodedPath}`;
    tracks.push({
      id: `archive-lqsa-${season}x${episode}-${identifier}`,
      label: `Archive HD · T${season}x${String(episode).padStart(2, '0')} (Castellano)`,
      lang: 'ES',
      quality: '1080p',
      sourceUrl: directUrl,
      referer: 'https://archive.org/',
      resolverType: 'direct_mp4',
      resolvedStreamUrl: directUrl,
    });
    break;
  }

  return tracks;
}

export async function extractSpanishSeriesTracks(opts: {
  tmdbId?: string | number | null;
  mediaType: 'movie' | 'tv';
  season?: number;
  episode?: number;
  titleHints: string[];
}): Promise<TrackRecord[]> {
  const [metroTracks, archiveTracks] = await Promise.all([
    extractSeriesMetroTracks(opts).catch(() => [] as TrackRecord[]),
    extractArchiveOrgSeriesTracks(opts).catch(() => [] as TrackRecord[]),
  ]);
  return [...metroTracks, ...archiveTracks];
}
