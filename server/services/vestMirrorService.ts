import { execFile } from 'child_process';

export const VEST_MIRROR_ORIGINS = [
  'https://ww20.321moviesfree.com',
  'https://es.cuevana4br.com',
  'https://flixlat.com',
  'https://ver.123pelicula.com',
] as const;

export const VEST_MIRROR_HOST_RE =
  /(?:^|\.)(?:321moviesfree\.com|cuevana4br\.com|flixlat\.com|123pelicula\.com)$/i;

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
  key: string; // e.g. 'vdXAbbyiZgaslQlAZ9Z6H'
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
    return /321moviesfree\.com|cuevana4br\.com|flixlat\.com|123pelicula\.com/i.test(rawUrl);
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
    // Plain curl WITHOUT Chrome UA or Sec-Fetch-* headers bypasses Cloudflare JS/WAF on all 4 mirrors cleanly
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

const vestDetailCache = new Map<string, { detail: VestParsedDetail; ts: number }>();
const vestCatalogRegistry = new Map<string, VestCatalogEntry>();

// Pre-seeded verified entries crawled from the user's 4 mirror sites
const INITIAL_VEST_SEEDS: VestCatalogEntry[] = [
  {
    key: 'vdXAbbyiZgaslQlAZ9Z6H',
    websiteParam: 'vdXAbbyiZgaslQlAZ9Z6H-One-Piece',
    mediaType: 'tv',
    tmdbId: 37854,
    title: 'One Piece',
    originalTitle: 'One Piece',
    year: '1999',
    rating: '8.9',
    overview:
      'Monkey D. Luffy se lanza a la mar para encontrar el tesoro legendario One Piece y convertirse en el Rey de los Piratas. Disponible en Doblaje Español y Sub Español (720p HLS + subtítulos multiidioma).',
    poster:
      'https://img.321moviesfree.com/cover/20260519/1779176008983_b032a8f6de28e5a88036819840a8da11uiIB9ctqZFbfRXXimtpmZb5dusi.webp',
    backdrop: 'https://image.tmdb.org/t/p/w1280/2rmK7mnchw9Xr3XdiTFSxTTLXqv.jpg',
    vestUrl: 'https://ww20.321moviesfree.com/es/detail/drama/vdXAbbyiZgaslQlAZ9Z6H-One-Piece/1/',
    mirrorUrls: [
      'https://ww20.321moviesfree.com/es/detail/drama/vdXAbbyiZgaslQlAZ9Z6H-One-Piece/1/',
      'https://es.cuevana4br.com/es/detail/drama/vdXAbbyiZgaslQlAZ9Z6H-One-Piece/1/',
      'https://flixlat.com/es/detail/drama/vdXAbbyiZgaslQlAZ9Z6H-One-Piece/1/',
      'https://ver.123pelicula.com/es/detail/drama/vdXAbbyiZgaslQlAZ9Z6H-One-Piece/1/',
    ],
    languages: ['Castellano', 'VOSE'],
    episodeCount: 1188,
    discoveredAt: Date.now(),
  },
  {
    key: 'MdpUkP2oMneAfFppRBkY4',
    websiteParam: 'MdpUkP2oMneAfFppRBkY4-One-Piece',
    mediaType: 'tv',
    tmdbId: 37854,
    title: 'One Piece (Doblaje Español)',
    originalTitle: 'One Piece',
    year: '1999',
    rating: '8.9',
    overview:
      'One Piece en Doblaje Español completo (1.180 episodios en streaming HLS directo 720p/540p sin anuncios en 321moviesfree, Cuevana4br, FlixLat y 123pelicula).',
    poster:
      'https://img.321moviesfree.com/cover/20260518/1779082523894_b032a8f6de28e5a88036819840a8da11ONE%20PIECE.webp',
    backdrop: 'https://image.tmdb.org/t/p/w1280/2rmK7mnchw9Xr3XdiTFSxTTLXqv.jpg',
    vestUrl: 'https://ww20.321moviesfree.com/es/detail/drama/MdpUkP2oMneAfFppRBkY4-One-Piece/1/',
    mirrorUrls: [
      'https://ww20.321moviesfree.com/es/detail/drama/MdpUkP2oMneAfFppRBkY4-One-Piece/1/',
      'https://es.cuevana4br.com/es/detail/drama/MdpUkP2oMneAfFppRBkY4-One-Piece/1/',
      'https://flixlat.com/es/detail/drama/MdpUkP2oMneAfFppRBkY4-One-Piece/1/',
      'https://ver.123pelicula.com/es/detail/drama/MdpUkP2oMneAfFppRBkY4-One-Piece/1/',
    ],
    languages: ['Castellano'],
    episodeCount: 1180,
    discoveredAt: Date.now(),
  },
];

for (const seed of INITIAL_VEST_SEEDS) {
  vestCatalogRegistry.set(seed.key, seed);
}

function registerDiscoveredVestEntry(entry: VestCatalogEntry) {
  const prev = vestCatalogRegistry.get(entry.key);
  if (!prev) {
    vestCatalogRegistry.set(entry.key, entry);
    return;
  }
  vestCatalogRegistry.set(entry.key, {
    ...prev,
    ...entry,
    tmdbId: prev.tmdbId || entry.tmdbId,
    poster: entry.poster || prev.poster,
    backdrop: prev.backdrop || prev.backdrop || prev.poster,
    overview: entry.overview || prev.overview,
    languages: Array.from(new Set([...(prev.languages || []), ...(entry.languages || [])])),
    mirrorUrls: Array.from(new Set([...(prev.mirrorUrls || []), ...(entry.mirrorUrls || [])])),
  });
}

export function parseVestDetailHtml(html: string, sourceUrl: string): VestParsedDetail | null {
  try {
    const match = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/i);
    if (!match || !match[1]) return null;
    const nextData = JSON.parse(match[1]);
    const pp = nextData?.props?.pageProps;
    if (!pp || !pp.paramIds) return null;

    const parsedUrl = parseVestDetailUrl(sourceUrl);
    const mirrorOrigin = parsedUrl?.origin || VEST_MIRROR_ORIGINS[0];
    const mirrorName = String(pp.vestData?.name || new URL(mirrorOrigin).hostname);
    const category = Number(pp.category ?? 1);
    const mediaType: 'movie' | 'tv' = category === 0 ? 'movie' : 'tv';
    const rawName = String(pp.name || '').trim();
    const cleanTitle = normalizeVestTitle(rawName) || rawName || 'Título';

    const decrypted = pp.encryptedContent
      ? decodeVestEncryptedContent(String(pp.encryptedContent))
      : null;

    const langInfo = inferVestVariantLanguage({
      rawName,
      audioLanguageCode: pp.audioLanguageCode,
      dubMode: pp.dubMode,
      dubLang: pp.dubLang,
      subtitleLang: pp.subtitleLang,
      subtitlesType: pp.subtitlesType,
    });

    const epVoList: any[] = Array.isArray(pp.episodeVo) ? pp.episodeVo : [];
    const decEpList: any[] = Array.isArray(decrypted?.season?.[0]?.episodes)
      ? decrypted!.season[0].episodes
      : [];

    const epVoBySeries = new Map<number, any>();
    for (const ev of epVoList) {
      const no = Number(ev?.seriesNo || 0);
      if (no > 0) epVoBySeries.set(no, ev);
    }

    const totalEpisodes = Math.max(epVoList.length, decEpList.length);
    const episodes: VestEpisodeEntry[] = [];
    const count = Math.max(epVoList.length, decEpList.length);

    for (let i = 0; i < count; i++) {
      const decEp = decEpList[i];
      const epNum = Number(decEp?.title || epVoList[i]?.seriesNo || i + 1);
      const vo = epVoBySeries.get(epNum) || epVoList[i] || {};
      const subs: any[] = Array.isArray(vo?.subtitlingList) ? vo.subtitlingList : [];
      episodes.push({
        id: String(vo?.id || decEp?.id || epNum),
        episodeNumber: epNum,
        title: `Episodio ${epNum}`,
        url:
          decEp?.url ||
          buildVestDetailUrl({
            origin: mirrorOrigin,
            typeSeg: mediaType === 'movie' ? 'movie' : 'drama',
            slug: String(pp.websiteParam || pp.paramIds),
            episodeNum: mediaType === 'tv' ? epNum : undefined,
          }),
        width: decEp?.width,
        height: decEp?.height,
        fileSize: decEp?.fileSize,
        subtitlingList: subs
          .filter((s) => s && s.subtitlingUrl)
          .map((s) => ({
            language: String(s.language || s.languageAbbr || 'Sub'),
            languageAbbr: String(s.languageAbbr || 'es').toLowerCase(),
            subtitlingUrl: String(s.subtitlingUrl),
            translateType: s.translateType,
          })),
      });
    }

    const currentEpisodeNumber =
      Number(pp.currentEpisodeNumber || parsedUrl?.episodeNum || 1) || 1;
    const activeEpObj =
      episodes.find((e) => e.episodeNumber === currentEpisodeNumber) || episodes[0];

    const mediaInfoList: { currentDefinition: string; mediaUrl: string }[] = Array.isArray(
      pp.mediaInfoList
    )
      ? pp.mediaInfoList
          .filter((m: any) => m && m.mediaUrl)
          .map((m: any) => ({
            currentDefinition: String(m.currentDefinition || 'GROOT_SD'),
            mediaUrl: String(m.mediaUrl),
          }))
      : [];

    const decQualities: VestQualityItem[] = Array.isArray(decrypted?.qualityList)
      ? decrypted!.qualityList
          .filter((q: any) => q && q.url)
          .map((q: any) => ({
            qualityCode: String(q.qualityCode || 'GROOT_SD'),
            title: mapVestQualityLabel(q.qualityCode, q.title),
            url: String(q.url),
          }))
      : [];

    const qualityList: VestQualityItem[] =
      decQualities.length > 0
        ? decQualities
        : mediaInfoList.map((m) => ({
            qualityCode: m.currentDefinition,
            title: mapVestQualityLabel(m.currentDefinition),
            url: m.mediaUrl,
          }));

    const dubbingList: VestDubbingVariant[] = (Array.isArray(pp.dubbingList) ? pp.dubbingList : [])
      .filter((d: any) => d && d.paramIds && d.websiteParam)
      .map((d: any) => {
        const dName = String(d.name || cleanTitle);
        const dLang = inferVestVariantLanguage({
          rawName: dName,
          audioLanguageCode: d.audioLanguageCode,
          dubMode: d.dubMode,
          dubLang: d.dubLang,
          subtitleLang: d.subtitleLang,
          subtitlesType: d.subtitlesType,
        });
        return {
          id: String(d.id || ''),
          paramIds: String(d.paramIds),
          name: dName,
          cleanName: normalizeVestTitle(dName) || cleanTitle,
          websiteParam: String(d.websiteParam),
          category: Number(d.category ?? category),
          audioLanguageCode: d.audioLanguageCode || null,
          dubMode: d.dubMode || null,
          dubLang: d.dubLang || null,
          subtitleLang: d.subtitleLang || null,
          subtitlesType: typeof d.subtitlesType === 'number' ? d.subtitlesType : null,
          coverVerticalUrl: String(d.coverVerticalUrl || pp.coverVerticalUrl || ''),
          inferredLang: dLang.inferredLang,
          langLabel: dLang.langLabel,
        };
      });

    const refList = (Array.isArray(pp.refList) ? pp.refList : [])
      .filter((r: any) => r && (r.paramIds || r.websiteParam))
      .map((r: any) => ({
        id: String(r.id || ''),
        paramIds: String(r.paramIds || ''),
        name: String(r.name || ''),
        websiteParam: String(r.websiteParam || r.paramIds || ''),
        category: Number(r.category ?? 1),
        coverVerticalUrl: String(r.coverVerticalUrl || ''),
        score: r.score ? String(r.score) : undefined,
      }));

    // Auto-index primary entry + dubbingList + refList into vestCatalogRegistry
    const primaryTypeSeg: 'movie' | 'drama' = mediaType === 'movie' ? 'movie' : 'drama';
    const primarySlug = String(pp.websiteParam || pp.paramIds);
    registerDiscoveredVestEntry({
      key: String(pp.paramIds),
      websiteParam: primarySlug,
      mediaType,
      title: cleanTitle,
      originalTitle: cleanTitle,
      year: 'HD',
      rating: pp.score ? Number(pp.score).toFixed(1) : '',
      overview: String(pp.introduction || '').trim(),
      poster: String(pp.coverVerticalUrl || ''),
      backdrop: String(pp.coverHorizontalUrl || pp.coverVerticalUrl || ''),
      vestUrl: buildVestDetailUrl({
        origin: mirrorOrigin,
        typeSeg: primaryTypeSeg,
        slug: primarySlug,
        episodeNum: mediaType === 'tv' ? 1 : undefined,
      }),
      mirrorUrls: VEST_MIRROR_ORIGINS.map((orig) =>
        buildVestDetailUrl({
          origin: orig,
          typeSeg: primaryTypeSeg,
          slug: primarySlug,
          episodeNum: mediaType === 'tv' ? 1 : undefined,
        })
      ),
      languages: [langInfo.inferredLang === 'ES' ? 'Castellano' : langInfo.langLabel],
      episodeCount: totalEpisodes,
      discoveredAt: Date.now(),
    });

    for (const ref of refList) {
      const refType: 'movie' | 'tv' = ref.category === 0 ? 'movie' : 'tv';
      const refTypeSeg: 'movie' | 'drama' = refType === 'movie' ? 'movie' : 'drama';
      const refKey = ref.paramIds || ref.websiteParam.split('-')[0];
      if (!refKey) continue;
      registerDiscoveredVestEntry({
        key: refKey,
        websiteParam: ref.websiteParam,
        mediaType: refType,
        title: normalizeVestTitle(ref.name) || ref.name,
        originalTitle: normalizeVestTitle(ref.name) || ref.name,
        year: 'HD',
        rating: ref.score ? Number(ref.score).toFixed(1) : '',
        overview: '',
        poster: ref.coverVerticalUrl || '',
        backdrop: ref.coverVerticalUrl || '',
        vestUrl: buildVestDetailUrl({
          origin: mirrorOrigin,
          typeSeg: refTypeSeg,
          slug: ref.websiteParam,
          episodeNum: refType === 'tv' ? 1 : undefined,
        }),
        mirrorUrls: VEST_MIRROR_ORIGINS.map((orig) =>
          buildVestDetailUrl({
            origin: orig,
            typeSeg: refTypeSeg,
            slug: ref.websiteParam,
            episodeNum: refType === 'tv' ? 1 : undefined,
          })
        ),
        languages: ['Castellano', 'VOSE'],
        discoveredAt: Date.now(),
      });
    }

    return {
      sourceUrl,
      mirrorOrigin,
      mirrorName,
      id: String(pp.id || ''),
      paramIds: String(pp.paramIds),
      websiteParam: primarySlug,
      mediaType,
      category,
      rawName,
      cleanTitle,
      score: pp.score ? Number(pp.score).toFixed(1) : '',
      tagNameList: Array.isArray(pp.tagNameList) ? pp.tagNameList.map(String) : [],
      coverVerticalUrl: String(pp.coverVerticalUrl || ''),
      coverHorizontalUrl: String(pp.coverHorizontalUrl || ''),
      overview: String(pp.introduction || '').trim(),
      currentEpisodeNumber,
      totalEpisodes,
      audioLanguageCode: pp.audioLanguageCode || null,
      dubMode: pp.dubMode || null,
      dubLang: pp.dubLang || null,
      subtitleLang: pp.subtitleLang || null,
      inferredLang: langInfo.inferredLang,
      mediaInfoList,
      qualityList,
      episodes,
      dubbingList,
      refList,
      currentSubtitles: activeEpObj?.subtitlingList || [],
    };
  } catch {
    return null;
  }
}

export async function fetchVestDetailPage(
  targetUrl: string,
  overrideEpisode?: number
): Promise<VestParsedDetail | null> {
  const parsed = parseVestDetailUrl(targetUrl);
  if (!parsed) return null;

  const targetEp =
    overrideEpisode && overrideEpisode > 0 ? overrideEpisode : parsed.episodeNum;
  const cacheKey = `${parsed.origin}|${parsed.typeSeg}|${parsed.paramId}|${targetEp || 0}`;
  const cached = vestDetailCache.get(cacheKey);
  if (cached && Date.now() - cached.ts < 8 * 60 * 1000) {
    return cached.detail;
  }

  // Try requested domain first, then automatically fail over across the remaining 3 mirrors
  const originsToTry = [
    parsed.origin,
    ...VEST_MIRROR_ORIGINS.filter((o) => o !== parsed.origin),
  ];

  for (const orig of originsToTry) {
    const fetchUrl = buildVestDetailUrl({
      origin: orig,
      locale: parsed.locale || 'es',
      typeSeg: parsed.typeSeg,
      slug: parsed.slug,
      episodeNum: targetEp,
    });
    try {
      const html = await curlPlainGetText(fetchUrl, 9);
      const detail = parseVestDetailHtml(html, fetchUrl);
      if (detail && (detail.qualityList.length > 0 || detail.episodes.length > 0)) {
        vestDetailCache.set(cacheKey, { detail, ts: Date.now() });
        if (vestDetailCache.size > 400) {
          const oldest = vestDetailCache.keys().next().value;
          if (oldest) vestDetailCache.delete(oldest);
        }
        return detail;
      }
    } catch {
      // failover to next mirror
    }
  }

  return null;
}

const tmdbAbsEpCache = new Map<string, { absEp: number; ts: number }>();

export async function resolveTmdbAbsoluteEpisodeNumber(
  tmdbId: number,
  season: number,
  episode: number,
  tmdbApiKey: string
): Promise<number> {
  if (season <= 1) return episode;
  const key = `${tmdbId}|${season}|${episode}`;
  const cached = tmdbAbsEpCache.get(key);
  if (cached && Date.now() - cached.ts < 6 * 60 * 60 * 1000) {
    return cached.absEp;
  }

  try {
    const res = await fetch(
      `https://api.themoviedb.org/3/tv/${tmdbId}?api_key=${tmdbApiKey}&language=es-ES`,
      { signal: AbortSignal.timeout(4000) }
    );
    if (!res.ok) return episode;
    const json: any = await res.json();
    const seasons: any[] = Array.isArray(json?.seasons) ? json.seasons : [];
    let offset = 0;
    for (const s of seasons) {
      const sNum = Number(s?.season_number || 0);
      if (sNum >= 1 && sNum < season) {
        offset += Number(s?.episode_count || 0);
      }
    }
    const absEp = offset + episode;
    tmdbAbsEpCache.set(key, { absEp, ts: Date.now() });
    return absEp;
  } catch {
    return episode;
  }
}

export function findVestSeedForMedia(opts: {
  tmdbId?: string | number | null;
  titleHints?: string[];
  preferLang?: string;
}): VestCatalogEntry | null {
  const numTmdb = opts.tmdbId ? Number(String(opts.tmdbId).replace(/\D/g, '')) : 0;
  if (numTmdb) {
    // Prefer Spanish Dub seed first when preferLang === 'ES', otherwise any match
    const matches: VestCatalogEntry[] = [];
    for (const entry of vestCatalogRegistry.values()) {
      if (entry.tmdbId === numTmdb) matches.push(entry);
    }
    if (matches.length > 0) {
      if (String(opts.preferLang || '').toUpperCase() === 'ES') {
        const esDub = matches.find((m) => m.key === 'MdpUkP2oMneAfFppRBkY4');
        if (esDub) return esDub;
      }
      return matches.find((m) => m.key === 'vdXAbbyiZgaslQlAZ9Z6H') || matches[0];
    }
  }

  const normalizedHints = (opts.titleHints || [])
    .map((t) =>
      String(t || '')
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, ' ')
        .trim()
    )
    .filter((h) => h.length >= 3);

  for (const entry of vestCatalogRegistry.values()) {
    const entryNorm = entry.title
      .replace(/\s*\([^)]*\)\s*/g, ' ')
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, ' ')
      .trim();
    if (normalizedHints.some((h) => h === entryNorm)) {
      return entry;
    }
  }

  return null;
}

export async function extractVestStreamsAndSubtitles(opts: {
  vestUrl?: string;
  tmdbId?: string | number | null;
  mediaType?: 'movie' | 'tv';
  season?: number;
  episode?: number;
  preferLang?: string;
  titleHints?: string[];
  tmdbApiKey: string;
  buildHlsProxyUrl: (rawM3u8Url: string, referer: string) => string;
}): Promise<{
  detail: VestParsedDetail;
  tracks: VestTrackRecord[];
  subtitles: VestSubtitleItem[];
} | null> {
  let targetUrl = String(opts.vestUrl || '').trim();
  let epOverride: number | undefined;

  if (!targetUrl || !isVestMirrorUrl(targetUrl)) {
    const seed = findVestSeedForMedia({
      tmdbId: opts.tmdbId,
      titleHints: opts.titleHints,
      preferLang: opts.preferLang,
    });
    if (!seed) return null;
    targetUrl = seed.vestUrl;

    if ((opts.mediaType === 'tv' || seed.mediaType === 'tv') && (opts.episode || opts.season)) {
      const season = Math.max(1, opts.season || 1);
      const episode = Math.max(1, opts.episode || 1);
      const tmdbNum = seed.tmdbId || Number(String(opts.tmdbId || '').replace(/\D/g, ''));
      if (tmdbNum && season > 1) {
        epOverride = await resolveTmdbAbsoluteEpisodeNumber(
          tmdbNum,
          season,
          episode,
          opts.tmdbApiKey
        );
      } else {
        epOverride = episode;
      }
    }
  }

  const primaryDetail = await fetchVestDetailPage(targetUrl, epOverride);
  if (!primaryDetail) return null;

  const tracks: VestTrackRecord[] = [];
  const seenUrls = new Set<string>();
  const mirrorTag = primaryDetail.mirrorName || 'Mirror';

  const appendQualitiesForDetail = (d: VestParsedDetail, variantLabelPrefix: string) => {
    const orderedQuals = [...d.qualityList].sort((a, b) => {
      const score = (q: string) =>
        q.includes('1080') ? 1 : q.includes('720') ? 2 : q.includes('540') ? 3 : 4;
      return score(a.title) - score(b.title);
    });
    for (const q of orderedQuals) {
      if (!q.url || seenUrls.has(q.url)) continue;
      seenUrls.add(q.url);
      const langCode = d.inferredLang === 'OTHER' ? 'ES' : d.inferredLang;
      tracks.push({
        id: `vest-${d.paramIds}-${q.qualityCode.toLowerCase()}-${tracks.length + 1}`,
        label: `${variantLabelPrefix} ${q.title} · ${mirrorTag}`,
        lang: langCode,
        quality: q.title,
        sourceUrl: q.url,
        resolverType: 'vest_hls',
        resolvedStreamUrl: opts.buildHlsProxyUrl(q.url, `${d.mirrorOrigin}/`),
      });
    }
  };

  appendQualitiesForDetail(
    primaryDetail,
    primaryDetail.inferredLang === 'ES'
      ? 'Español Doblado'
      : primaryDetail.inferredLang === 'LAT'
      ? 'Español Latino'
      : primaryDetail.inferredLang === 'EN'
      ? 'English VO'
      : 'Sub Español (VOSE)'
  );

  // Automatically fetch primary alternate dubbing variants (e.g. Spanish Dub <-> Sub Español <-> English)
  const targetEpNum = primaryDetail.currentEpisodeNumber || epOverride || 1;
  const candidateVariants = primaryDetail.dubbingList
    .filter(
      (d) =>
        d.paramIds !== primaryDetail.paramIds &&
        (d.inferredLang === 'ES' ||
          d.inferredLang === 'LAT' ||
          d.inferredLang === 'VOSE' ||
          d.inferredLang === 'EN')
    )
    .slice(0, 3);

  const variantDetails = await Promise.all(
    candidateVariants.map((v) => {
      const vUrl = buildVestDetailUrl({
        origin: primaryDetail.mirrorOrigin,
        locale: 'es',
        typeSeg: v.category === 0 ? 'movie' : 'drama',
        slug: v.websiteParam,
        episodeNum: v.category === 0 ? undefined : targetEpNum,
      });
      return fetchVestDetailPage(vUrl, v.category === 0 ? undefined : targetEpNum).catch(() => null);
    })
  );

  for (const vd of variantDetails) {
    if (!vd || vd.qualityList.length === 0) continue;
    // Ensure episode actually matches target when checking long-running dubs (e.g. dub has 1180 eps vs 1188)
    if (
      vd.mediaType === 'tv' &&
      vd.totalEpisodes > 0 &&
      targetEpNum > vd.totalEpisodes
    ) {
      continue;
    }
    const prefix =
      vd.inferredLang === 'ES'
        ? 'Español Doblado'
        : vd.inferredLang === 'LAT'
        ? 'Español Latino'
        : vd.inferredLang === 'EN'
        ? 'English VO'
        : 'Sub Español (VOSE)';
    appendQualitiesForDetail(vd, prefix);
  }

  // Gather synchronized .srt subtitles from primary detail + fallback variant
  const subMap = new Map<string, VestSubtitleItem>();
  const addSubsFrom = (d: VestParsedDetail | null) => {
    if (!d) return;
    for (const s of d.currentSubtitles) {
      const abbr = (s.languageAbbr || 'sub').toLowerCase();
      if (!s.subtitlingUrl || subMap.has(abbr)) continue;
      const mappedLang =
        abbr === 'es' || abbr === 'spa'
          ? 'ES'
          : abbr === 'en' || abbr === 'eng'
          ? 'EN'
          : abbr.toUpperCase();
      subMap.set(abbr, {
        id: `vest-sub-${d.paramIds}-${abbr}`,
        label: s.language || mappedLang,
        lang: mappedLang,
        url: `/api/subtitles/proxy?url=${encodeURIComponent(s.subtitlingUrl)}`,
      });
    }
  };
  addSubsFrom(primaryDetail);
  for (const vd of variantDetails) addSubsFrom(vd);

  // Order subtitles so Español & English are first
  const subtitles = Array.from(subMap.values()).sort((a, b) => {
    const rank = (l: string) => (l === 'ES' ? 1 : l === 'EN' ? 2 : 3);
    return rank(a.lang) - rank(b.lang);
  });

  // Sort tracks putting requested preferLang first, then best quality
  const pref = String(opts.preferLang || 'ES').toUpperCase();
  const langRank = (l: string) => {
    const u = String(l || '').toUpperCase();
    if (pref === 'ES') return u === 'ES' ? 1 : u === 'LAT' ? 2 : u === 'VOSE' ? 3 : 4;
    if (pref === 'VOSE') return u === 'VOSE' ? 1 : u === 'EN' ? 2 : u === 'ES' ? 3 : 4;
    if (pref === 'LAT') return u === 'LAT' ? 1 : u === 'ES' ? 2 : u === 'VOSE' ? 3 : 4;
    if (pref === 'EN') return u === 'EN' ? 1 : u === 'VOSE' ? 2 : u === 'ES' ? 3 : 4;
    return 5;
  };
  tracks.sort((a, b) => langRank(a.lang) - langRank(b.lang));

  return { detail: primaryDetail, tracks, subtitles };
}

export function listVestCatalogEntries(opts?: {
  mediaType?: 'movie' | 'tv' | 'all';
  query?: string;
}): any[] {
  const mType = opts?.mediaType || 'all';
  const qNorm = String(opts?.query || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();

  const out: any[] = [];
  for (const entry of vestCatalogRegistry.values()) {
    if (mType !== 'all' && entry.mediaType !== mType) continue;
    if (qNorm) {
      const hay = `${entry.title} ${entry.originalTitle} ${entry.overview}`
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '');
      if (!hay.includes(qNorm)) continue;
    }
    out.push({
      id: `vest-${entry.key}`,
      tmdbId: entry.tmdbId,
      mediaType: entry.mediaType,
      title: entry.title,
      originalTitle: entry.originalTitle,
      year: entry.year,
      rating: entry.rating,
      overview: entry.overview,
      poster: entry.poster
        ? `/api/img-proxy?url=${encodeURIComponent(entry.poster)}`
        : '',
      backdrop: entry.backdrop || entry.poster,
      vestUrl: entry.vestUrl,
      languages: entry.languages,
      platform: '321Movies · Cuevana4 · FlixLat · 123Película',
    });
  }
  return out;
}
