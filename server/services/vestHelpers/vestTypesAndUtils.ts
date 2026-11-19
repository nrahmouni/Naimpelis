import { execFile } from 'child_process';

export const VEST_MIRROR_ORIGINS = [
  'https://www3.dramasfree.com',
  'https://ww20.321moviesfree.com',
  'https://es.cuevana4br.com',
  'https://flixlat.com',
  'https://ver.123pelicula.com',
] as const;

export const VEST_MIRROR_HOST_RE =
  /(?:^|\.)(?:dramasfree\.com|321moviesfree\.com|cuevana4br\.com|flixlat\.com|123pelicula\.com)$/i;

export interface VestSubtitleItem {
  id: string;
  label: string;
  lang: string;
  url: string;
}

export interface VestEpisodeEntry {
  id: string;
  episodeNumber: number;
  title: string;
  url: string;
  width?: number;
  height?: number;
  fileSize?: number;
  subtitlingList: {
    language: string;
    languageAbbr: string;
    subtitlingUrl: string;
    translateType?: number;
  }[];
}

export interface VestDubbingVariant {
  id: string;
  paramIds: string;
  name: string;
  cleanName: string;
  websiteParam: string;
  category: number;
  audioLanguageCode: string | null;
  dubMode: string | null;
  dubLang: string | null;
  subtitleLang: string | null;
  subtitlesType: number | null;
  coverVerticalUrl: string;
  inferredLang: 'ES' | 'LAT' | 'VOSE' | 'EN' | 'OTHER';
  langLabel: string;
}

export interface VestQualityItem {
  qualityCode: string;
  title: string;
  url: string;
}

export interface VestParsedDetail {
  sourceUrl: string;
  mirrorOrigin: string;
  mirrorName: string;
  id: string;
  paramIds: string;
  websiteParam: string;
  mediaType: 'movie' | 'tv';
  category: number;
  rawName: string;
  cleanTitle: string;
  score: string;
  tagNameList: string[];
  coverVerticalUrl: string;
  coverHorizontalUrl: string;
  overview: string;
  currentEpisodeNumber: number;
  totalEpisodes: number;
  audioLanguageCode: string | null;
  dubMode: string | null;
  dubLang: string | null;
  subtitleLang: string | null;
  inferredLang: 'ES' | 'LAT' | 'VOSE' | 'EN' | 'OTHER';
  mediaInfoList: { currentDefinition: string; mediaUrl: string }[];
  qualityList: VestQualityItem[];
  episodes: VestEpisodeEntry[];
  dubbingList: VestDubbingVariant[];
  refList: {
    id: string;
    paramIds: string;
    name: string;
    websiteParam: string;
    category: number;
    coverVerticalUrl: string;
    score?: string;
  }[];
  currentSubtitles: {
    language: string;
    languageAbbr: string;
    subtitlingUrl: string;
  }[];
}

export interface VestCatalogEntry {
  key: string;
  websiteParam: string;
  mediaType: 'movie' | 'tv';
  tmdbId?: number;
  title: string;
  originalTitle: string;
  year: string;
  rating: string;
  overview: string;
  poster: string;
  backdrop: string;
  vestUrl: string;
  mirrorUrls: string[];
  languages: string[];
  seasonNumber?: number;
  episodeCount?: number;
  discoveredAt: number;
}

export interface VestTrackRecord {
  id: string;
  label: string;
  lang: string;
  quality: string;
  sourceUrl: string;
  resolverType: 'vest_hls';
  resolvedStreamUrl: string;
}

export function isVestMirrorUrl(rawUrl: string): boolean {
  try {
    const parsed = new URL(rawUrl.trim());
    return VEST_MIRROR_HOST_RE.test(parsed.hostname);
  } catch {
    return /dramasfree\.com|321moviesfree\.com|cuevana4br\.com|flixlat\.com|123pelicula\.com/i.test(
      rawUrl
    );
  }
}

export function parseVestDetailUrl(rawUrl: string): {
  origin: string;
  locale: string;
  typeSeg: 'movie' | 'drama';
  slug: string;
  paramId: string;
  episodeNum: number | null;
} | null {
  try {
    const u = new URL(rawUrl.trim());
    if (!VEST_MIRROR_HOST_RE.test(u.hostname)) return null;
    const parts = u.pathname.split('/').filter(Boolean);
    let idx = 0;
    let locale = 'es';
    if (parts[0] && /^(es|en|pt|ar|fr|de|tr|id|th|vi|tl|ru)$/i.test(parts[0])) {
      locale = parts[0].toLowerCase();
      idx = 1;
    }
    if (parts[idx] !== 'detail') return null;
    const rawType = (parts[idx + 1] || 'drama').toLowerCase();
    const typeSeg: 'movie' | 'drama' = rawType === 'movie' ? 'movie' : 'drama';
    const slug = parts[idx + 2] || '';
    if (!slug) return null;
    const paramId = slug.split('-')[0] || slug;
    const epRaw = parts[idx + 3] ? parseInt(parts[idx + 3], 10) : NaN;
    const episodeNum = Number.isFinite(epRaw) && epRaw > 0 ? epRaw : null;
    return {
      origin: u.origin,
      locale,
      typeSeg,
      slug,
      paramId,
      episodeNum,
    };
  } catch {
    return null;
  }
}

export function buildVestDetailUrl(opts: {
  origin?: string;
  locale?: string;
  typeSeg: 'movie' | 'drama';
  slug: string;
  episodeNum?: number | null;
}): string {
  const baseOrigin = (opts.origin || VEST_MIRROR_ORIGINS[0]).replace(/\/+$/, '');
  const locale = opts.locale || 'es';
  const epPart = opts.episodeNum && opts.episodeNum > 0 ? `/${opts.episodeNum}` : '';
  return `${baseOrigin}/${locale}/detail/${opts.typeSeg}/${opts.slug}${epPart}/`;
}

export function normalizeVestTitle(rawName: string): string {
  return String(rawName || '')
    .replace(/^(?:\[[^\]]+\]\s*)+/g, '')
    .trim();
}

export function inferVestVariantLanguage(opts: {
  rawName?: string;
  audioLanguageCode?: string | null;
  dubMode?: string | null;
  dubLang?: string | null;
  subtitleLang?: string | null;
  subtitlesType?: number | null;
}): { inferredLang: 'ES' | 'LAT' | 'VOSE' | 'EN' | 'OTHER'; langLabel: string } {
  const nameLower = String(opts.rawName || '').toLowerCase();
  const audio = String(opts.audioLanguageCode || '').toLowerCase();
  const dubLang = String(opts.dubLang || '').toLowerCase();
  const subLang = String(opts.subtitleLang || '').toLowerCase();

  if (
    /latino/i.test(nameLower) ||
    audio === 'es-419' ||
    dubLang === 'es-419' ||
    /lat/i.test(dubLang)
  ) {
    return { inferredLang: 'LAT', langLabel: 'Español Latino' };
  }
  if (
    /doblaje\s*espa[ñn]ol|castellano|\[es\]/i.test(nameLower) ||
    (opts.dubMode === '1' && (audio === 'es' || dubLang === 'es')) ||
    (audio === 'es' && opts.subtitlesType !== 2)
  ) {
    return { inferredLang: 'ES', langLabel: 'Español Doblado' };
  }
  if (
    /sub\s*espa[ñn]ol|subtitulado/i.test(nameLower) ||
    subLang === 'es' ||
    (opts.subtitlesType === 2 && !audio.startsWith('en'))
  ) {
    return { inferredLang: 'VOSE', langLabel: 'Sub Español (VOSE)' };
  }
  if (audio === 'en' || /english|ingl[eé]s/i.test(nameLower)) {
    return { inferredLang: 'EN', langLabel: 'English (VO)' };
  }
  if (audio === 'pt' || /portugu[eê]s/i.test(nameLower) || dubLang === 'pt' || subLang === 'pt') {
    return { inferredLang: 'OTHER', langLabel: 'Português' };
  }
  if (/t[uü]rk[çc]e/i.test(nameLower) || dubLang === 'tr' || subLang === 'tr') {
    return { inferredLang: 'OTHER', langLabel: 'Türkçe' };
  }
  return {
    inferredLang: 'VOSE',
    langLabel: opts.audioLanguageCode ? `VO (${opts.audioLanguageCode.toUpperCase()})` : 'VOSE',
  };
}

export function decodeVestEncryptedContent(encryptedContent: string): Record<string, any> | null {
  try {
    const raw = String(encryptedContent || '').trim();
    if (!raw) return null;
    const reversed = raw.split('').reverse().join('');
    const jsonText = Buffer.from(reversed, 'base64').toString('utf8');
    const parsed = JSON.parse(jsonText);
    return parsed && typeof parsed === 'object' ? parsed : null;
  } catch {
    return null;
  }
}

export function mapVestQualityLabel(defCode: string, fallbackTitle?: string): string {
  if (fallbackTitle && /\d+p/i.test(fallbackTitle)) {
    return fallbackTitle.toUpperCase();
  }
  switch (String(defCode || '').toUpperCase()) {
    case 'GROOT_HD':
    case 'GROOT_FHD':
      return '1080P';
    case 'GROOT_SD':
      return '720P';
    case 'GROOT_LD':
      return '540P';
    case 'GROOT_FD':
      return '360P';
    default:
      return fallbackTitle || 'HD';
  }
}

export function curlPlainGetText(targetUrl: string, maxTimeSec = 9): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(
      'curl',
      ['-sS', '-L', '--compressed', '--max-time', String(maxTimeSec), targetUrl],
      { maxBuffer: 15 * 1024 * 1024 },
      (err, stdout, stderr) => {
        if (err && !stdout) {
          return reject(new Error(stderr || err.message));
        }
        resolve(String(stdout || ''));
      }
    );
  });
}
