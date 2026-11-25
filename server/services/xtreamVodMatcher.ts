/**
 * @module server/services/xtreamVodMatcher
 * @description Bilingual/translated title matcher across all connected Xtream servers
 * (Shark Pro, VOD 4K, 24TV, 2M2H, Dana 4K Pro, Active CDNS, Octopus TV) for Movies & Series.
 * Parses language + resolution/quality tags (4K UHD > 1080p FHD > HD > SD), emits TrackRecords
 * for extraction and credential-free XtreamMatchedMediaOption items for detail modals.
 */
import type { TrackRecord } from '../extractors/httpHelpers.ts';
import { LruTtlCache } from '../utils/lruCache.ts';
import { getAllXtreamProviders } from './providersConfig.ts';
import {
  getCachedXtreamProviderCatalogs,
  getSeriesInfo,
  isXtreamEnvConfigured,
  syncFullCatalog,
  type XtreamCategoryItem,
  type XtreamFullCatalogPayload,
  type XtreamLiveStreamItem,
  type XtreamSeriesEpisodeItem,
  type XtreamSeriesInfoPayload,
  type XtreamSeriesItem,
  type XtreamVodStreamItem,
} from './xtreamService.ts';
import {
  getConnectedProvidersCatalogSnapshot,
  getProviderSeriesDetail,
} from './providers/xtreamProvidersService.ts';

export type XtreamDetectedLang =
  | 'ES'
  | 'LAT'
  | 'VOSE'
  | 'EN'
  | 'AR'
  | 'FR'
  | 'PT'
  | 'IT'
  | 'DE'
  | 'CAT';

export interface XtreamMatchedMediaOption {
  id: string;
  mediaType: 'movie' | 'tv';
  providerId: string;
  providerName: string;
  streamId: string;
  seriesId?: string;
  title: string;
  cleanTitle: string;
  year?: string;
  categoryName: string;
  lang: XtreamDetectedLang;
  langLabel: string;
  quality: string;
  qualityTier: number;
  containerExtension: string;
  rating?: string;
  poster?: string;
  playbackUrl?: string;
  score: number;
}

export interface ParsedXtreamVodMeta {
  cleanTitle: string;
  year?: string;
  lang: XtreamDetectedLang;
  langLabel: string;
  quality: string;
  qualityTier: number;
}

const seriesInfoCache = new LruTtlCache<string, XtreamSeriesInfoPayload>(200, 25 * 60 * 1000);

const LANG_LABEL_MAP: Record<XtreamDetectedLang, string> = {
  ES: 'Castellano',
  LAT: 'Latino',
  VOSE: 'VOSE',
  EN: 'Inglés (EN)',
  AR: 'Árabe (AR)',
  FR: 'Francés (FR)',
  PT: 'Portugués',
  IT: 'Italiano',
  DE: 'Alemán',
  CAT: 'Català',
};

const LEADING_PREFIX_TAG_RE =
  /^(?:\[?\s*(?:ES|ESP|SPAIN|ESPA[ÑN]A|CAST|CASTELLANO|LAT|LATINO|MX|LA|VOSE|SUB|EN|ENG|ENGLISH|UK|US|USA|AR|ARB|ARABIC|FR|VF|VOSTFR|PT|IT|DE|GER|CAT|4K|UHD|FHD|HD|VIP|TOP|MULTI|DUAL)\s*\]?\s*[:|\-/·•]+\s*)+/i;

const QUALITY_AND_EXT_TAG_RE =
  /(?:\(|\[)?\b(?:4K|UHD|2160P?|1080P?|FHD|FULL\s*HD|720P?|HDR10?\+?|DOLBY\s*VISION|REMUX|BLURAY|BLU-RAY|BDRIP|BRRIP|WEB-?DL|WEBRIP|HDTV|HDRIP|DVDRIP|480P?|360P?|HEVC|H\.?265|H\.?264|X265|X264|MULTI|DUAL|VOSE|CASTELLANO|ESPA[ÑN]OL|LATINO|SUBTITULAD[AO]S?|INGL[EÉ]S|ENGLISH|ESP|CAST|LAT|SUB|MKV|MP4|AVI)\b(?:\)|\])?/gi;

export function detectXtreamQuality(
  rawName: string,
  categoryName = '',
  containerExt = ''
): { quality: string; qualityTier: number } {
  const hay = `${rawName} ${categoryName} ${containerExt}`.toLowerCase();
  if (/\b(?:4k|uhd|2160p?|dolby\s*vision|hdr10?\+?|remux)\b/.test(hay)) {
    return { quality: '4K UHD', qualityTier: 0 };
  }
  if (/\b(?:1080p?|fhd|full\s*hd|blu-?ray|bdrip)\b/.test(hay)) {
    return { quality: '1080p FHD', qualityTier: 1 };
  }
  if (/\b(?:720p?|hdtv|web-?dl|webrip|hdrip|hd)\b/.test(hay)) {
    return { quality: 'HD', qualityTier: 2 };
  }
  if (/\b(?:480p?|dvdrip)\b/.test(hay)) {
    return { quality: '480p', qualityTier: 3 };
  }
  if (/\b(?:360p?|sd|cam|ts)\b/.test(hay)) {
    return { quality: 'SD', qualityTier: 4 };
  }
  return { quality: '1080p FHD', qualityTier: 1 };
}

export function detectXtreamLanguage(
  rawName: string,
  categoryName = ''
): { lang: XtreamDetectedLang; langLabel: string } {
  const name = String(rawName || '').trim();
  const cat = String(categoryName || '').trim();
  const combined = `${name} ${cat}`;

  if (/[\u0600-\u06FF]/.test(combined) || /^(?:AR|ARB)\s*[:|\-/]/i.test(name) || /\b(?:arabic|arabia|egypt|maroc|morocco|aflam)\b/i.test(cat)) {
    return { lang: 'AR', langLabel: LANG_LABEL_MAP.AR };
  }
  if (/^(?:CAT)\s*[:|\-/]/i.test(name) || /\b(?:catal[aà]|3cat|tv3)\b/i.test(combined)) {
    return { lang: 'CAT', langLabel: LANG_LABEL_MAP.CAT };
  }
  if (/\b(?:vose|subtitulad[ao]s?|sub\s*es|sub\s*esp)\b/i.test(combined)) {
    return { lang: 'VOSE', langLabel: LANG_LABEL_MAP.VOSE };
  }
  if (
    /^(?:LAT|LA|MX)\s*[:|\-/]/i.test(name) ||
    /\b(?:latino|latam|audio\s*latino|es-mx|m[eé]xico|argentina|colombia)\b/i.test(combined)
  ) {
    return { lang: 'LAT', langLabel: LANG_LABEL_MAP.LAT };
  }
  if (
    /^(?:ES|ESP|SPAIN|ESPA[ÑN]A|CAST)\s*[:|\-/]/i.test(name) ||
    /\b(?:castellano|espa[ñn]a|spain|esp|cine\s*es|pel[ií]culas\s*es|series\s*es|estrenos\s*es|multi\s*es)\b/i.test(combined)
  ) {
    return { lang: 'ES', langLabel: LANG_LABEL_MAP.ES };
  }
  if (
    /^(?:FR|VF|VOSTFR)\s*[:|\-/]/i.test(name) ||
    /\b(?:french|fran[çc]ais|france|vostfr)\b/i.test(combined)
  ) {
    return { lang: 'FR', langLabel: LANG_LABEL_MAP.FR };
  }
  if (/^(?:PT|BR)\s*[:|\-/]/i.test(name) || /\b(?:portugu[eê]s|portugal|brasil)\b/i.test(combined)) {
    return { lang: 'PT', langLabel: LANG_LABEL_MAP.PT };
  }
  if (/^(?:IT)\s*[:|\-/]/i.test(name) || /\b(?:italiano|italy|italia)\b/i.test(combined)) {
    return { lang: 'IT', langLabel: LANG_LABEL_MAP.IT };
  }
  if (/^(?:DE|GER)\s*[:|\-/]/i.test(name) || /\b(?:german|deutsch|allemand)\b/i.test(combined)) {
    return { lang: 'DE', langLabel: LANG_LABEL_MAP.DE };
  }
  if (
    /^(?:EN|ENG|UK|US|USA)\s*[:|\-/]/i.test(name) ||
    /\b(?:english|ingl[eé]s|4k\s*movies|en\s*4k|netflix|apple\s*tv|prime\s*video|disney|marvel|animation|horror|action|drama|comedy|thriller|sci-?fi|top\s*imdb)\b/i.test(cat)
  ) {
    return { lang: 'EN', langLabel: LANG_LABEL_MAP.EN };
  }
  if (/\b(?:pel[ií]culas|cine|series|estrenos|infantil|animaci[oó]n|acci[oó]n|comedia|terror|suspense|ciencia\s*ficci[oó]n)\b/i.test(cat)) {
    return { lang: 'ES', langLabel: LANG_LABEL_MAP.ES };
  }
  return { lang: 'EN', langLabel: LANG_LABEL_MAP.EN };
}

export function parseXtreamVodTitleMeta(
  rawName: string,
  categoryName = '',
  containerExtension = ''
): ParsedXtreamVodMeta {
  let work = String(rawName || '').replace(/\s+/g, ' ').trim();
  const yearMatches = Array.from(work.matchAll(/(?:\(|\b)(19\d{2}|20[0-3]\d)(?:\)|\b)/g));
  const year = yearMatches.length > 0 ? yearMatches[yearMatches.length - 1][1] : undefined;

  work = work.replace(LEADING_PREFIX_TAG_RE, '').trim();
  work = work.replace(/\((19\d{2}|20[0-3]\d)\)/g, ' ');
  work = work.replace(/\[(19\d{2}|20[0-3]\d)\]/g, ' ');
  work = work.replace(QUALITY_AND_EXT_TAG_RE, ' ');
  if (year) {
    work = work.replace(new RegExp(`\\b${year}\\b$`), ' ');
  }
  work = work
    .replace(/\[\s*\]|\(\s*\)/g, ' ')
    .replace(/^[\s\-–:|•·/]+|[\s\-–:|•·/]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const { lang, langLabel } = detectXtreamLanguage(rawName, categoryName);
  const { quality, qualityTier } = detectXtreamQuality(rawName, categoryName, containerExtension);

  return {
    cleanTitle: work || String(rawName || '').trim(),
    year,
    lang,
    langLabel,
    quality,
    qualityTier,
  };
}

function normalizeMatchText(raw: string, stripLeadingArticle = false): string {
  let norm = String(raw || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/\bpart\s+i\b/g, 'part 1')
    .replace(/\bpart\s+ii\b/g, 'part 2')
    .replace(/\bpart\s+iii\b/g, 'part 3')
    .replace(/\bpart\s+iv\b/g, 'part 4')
    .replace(/\bparte\s+i\b/g, 'parte 1')
    .replace(/\bparte\s+ii\b/g, 'parte 2')
    .replace(/\bparte\s+iii\b/g, 'parte 3')
    .replace(/\bparte\s+iv\b/g, 'parte 4')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

  if (stripLeadingArticle) {
    norm = norm.replace(/^(?:the|a|an|el|la|los|las|un|una|unos|unas|le|les|l|he)\s+/i, '').trim();
  }
  return norm;
}

const STOP_WORDS = new Set(['the', 'a', 'an', 'el', 'la', 'los', 'las', 'de', 'del', 'y', 'and', 'of', 'in', 'en', 'he']);

function tokenizeMeaningful(raw: string): string[] {
  return normalizeMatchText(raw, true)
    .split(' ')
    .filter((tok) => tok.length >= 2 && !STOP_WORDS.has(tok));
}

function scoreTitleMatchAgainstHints(
  candidateCleanTitle: string,
  candidateYear: string | undefined,
  normalizedHints: Array<{ exact: string; noArt: string; tokens: string[]; idx: number }>,
  yearHint?: string
): number {
  const candExact = normalizeMatchText(candidateCleanTitle, false);
  const candNoArt = normalizeMatchText(candidateCleanTitle, true);
  if (!candExact && !candNoArt) return 0;

  let yearMismatch = false;
  let yearExact = false;
  if (yearHint && /^\d{4}$/.test(yearHint) && candidateYear && /^\d{4}$/.test(candidateYear)) {
    const diff = Math.abs(Number(yearHint) - Number(candidateYear));
    if (diff === 0) yearExact = true;
    else if (diff > 1) yearMismatch = true;
  }
  if (yearMismatch) return 0;

  let bestScore = 0;
  const candTokens = tokenizeMeaningful(candidateCleanTitle);
  const candTokenSet = new Set(candTokens);

  for (const hint of normalizedHints) {
    let baseScore = 0;
    if (candExact === hint.exact || (candNoArt && candNoArt === hint.noArt)) {
      baseScore = 100;
    } else if (hint.tokens.length >= 2 && candTokens.length >= 2) {
      let matches = 0;
      for (const t of hint.tokens) {
        if (candTokenSet.has(t)) matches++;
      }
      const unionSize = new Set([...hint.tokens, ...candTokens]).size;
      const jaccard = unionSize > 0 ? matches / unionSize : 0;
      const hintCoverage = matches / hint.tokens.length;
      const candCoverage = matches / candTokens.length;

      // Require bidirectional coverage so "The Hunger Games" does NOT match "Mockingjay Part 1"
      if (jaccard >= 0.84 && hintCoverage >= 0.85 && candCoverage >= 0.85) {
        baseScore = Math.round(78 + jaccard * 18);
      } else if (
        yearExact &&
        hintCoverage === 1 &&
        Math.abs(candTokens.length - hint.tokens.length) <= 1 &&
        candTokens.length >= 3
      ) {
        baseScore = 82;
      }
    }

    if (baseScore > 0) {
      const bonus = (yearExact ? 12 : 0) + (hint.idx === 0 ? 4 : 0);
      bestScore = Math.max(bestScore, baseScore + bonus);
    }
  }

  return bestScore;
}

function buildHintVectors(titleHints: string[]) {
  const seen = new Set<string>();
  const out: Array<{ exact: string; noArt: string; tokens: string[]; idx: number }> = [];
  titleHints.forEach((raw, idx) => {
    const clean = String(raw || '').trim();
    if (!clean) return;
    const exact = normalizeMatchText(clean, false);
    const noArt = normalizeMatchText(clean, true);
    if (!exact || exact.length < 2 || seen.has(exact)) return;
    seen.add(exact);
    out.push({
      exact,
      noArt: noArt || exact,
      tokens: tokenizeMeaningful(clean),
      idx,
    });
  });
  return out;
}

const unifiedCatalogRamCache = new LruTtlCache<string, XtreamFullCatalogPayload>(2, 45_000);

async function loadUnifiedXtreamCatalogFast(timeoutMs = 2600): Promise<XtreamFullCatalogPayload | null> {
  const cachedMerged = unifiedCatalogRamCache.get('unified');
  if (cachedMerged && cachedMerged.liveStreams.length > 0) {
    return cachedMerged;
  }

  const [runtimeSnap, envCatalogRes] = await Promise.all([
    getConnectedProvidersCatalogSnapshot(500).catch(() => null),
    isXtreamEnvConfigured()
      ? Promise.race([
          syncFullCatalog(false, 'all').catch(() => ({ ok: false as const })),
          new Promise<{ ok: false }>((resolve) => setTimeout(() => resolve({ ok: false }), timeoutMs)),
        ])
      : Promise.resolve({ ok: false as const }),
  ]);

  let envCat = envCatalogRes.ok && 'catalog' in envCatalogRes ? envCatalogRes.catalog : null;
  if (!envCat && isXtreamEnvConfigured()) {
    const partialCats = getCachedXtreamProviderCatalogs();
    if (partialCats.length > 0) {
      envCat = {
        providerId: 'all',
        providerName: 'Catálogo Parcial',
        liveCategories: partialCats.flatMap((c) => c.liveCategories),
        liveStreams: partialCats.flatMap((c) => c.liveStreams),
        vodCategories: partialCats.flatMap((c) => c.vodCategories),
        vodStreams: partialCats.flatMap((c) => c.vodStreams),
        seriesCategories: partialCats.flatMap((c) => c.seriesCategories),
        series: partialCats.flatMap((c) => c.series),
        counts: {
          liveCategories: 0,
          liveStreams: 0,
          vodCategories: 0,
          vodStreams: 0,
          seriesCategories: 0,
          series: 0,
        },
        accountNumber: 1,
        syncedAt: Date.now(),
        expiresAt: Date.now() + 60_000,
        fromCache: true,
      };
    }
  }
  const hasRuntimeItems =
    Boolean(runtimeSnap) &&
    (runtimeSnap!.movieItems.length > 0 ||
      runtimeSnap!.seriesItems.length > 0 ||
      runtimeSnap!.liveItems.length > 0);

  if (!hasRuntimeItems && !envCat) return null;
  if (!hasRuntimeItems && envCat) {
    if (envCatalogRes.ok && envCat.liveStreams.length >= 200) {
      unifiedCatalogRamCache.set('unified', envCat);
    }
    return envCat;
  }

  const liveCategories: XtreamCategoryItem[] = [...(envCat?.liveCategories || [])];
  const vodCategories: XtreamCategoryItem[] = [...(envCat?.vodCategories || [])];
  const seriesCategories: XtreamCategoryItem[] = [...(envCat?.seriesCategories || [])];
  const liveStreams: XtreamLiveStreamItem[] = [...(envCat?.liveStreams || [])];
  const vodStreams: XtreamVodStreamItem[] = [...(envCat?.vodStreams || [])];
  const series: XtreamSeriesItem[] = [...(envCat?.series || [])];

  const seenLive = new Set(liveStreams.map((x) => `${x.providerId}:${x.streamId}`));
  const seenVod = new Set(vodStreams.map((x) => `${x.providerId}:${x.streamId}`));
  const seenSer = new Set(series.map((x) => `${x.providerId}:${x.seriesId}`));

  if (runtimeSnap) {
    const seenLiveCat = new Set<string>();
    const seenVodCat = new Set<string>();
    const seenSerCat = new Set<string>();
    for (const c of runtimeSnap.liveCategories) {
      liveCategories.push({ id: c.id, name: c.name, type: 'live' });
    }
    for (const c of runtimeSnap.movieCategories) {
      vodCategories.push({ id: c.id, name: c.name, type: 'vod' });
    }
    for (const c of runtimeSnap.seriesCategories) {
      seriesCategories.push({ id: c.id, name: c.name, type: 'series' });
    }
    for (const item of runtimeSnap.liveItems) {
      const k = `${item.providerId}:${item.streamId}`;
      if (seenLive.has(k)) continue;
      seenLive.add(k);
      const prefixedCat = `${item.providerId}:${item.categoryId}`;
      liveStreams.push({
        num: liveStreams.length + 1,
        streamId: item.streamId,
        name: item.name,
        categoryId: prefixedCat,
        streamIcon: item.poster,
        playbackUrl: item.streamUrl,
        providerId: item.providerId,
        providerName: item.providerName,
      });
      if (!seenLiveCat.has(prefixedCat)) {
        seenLiveCat.add(prefixedCat);
        liveCategories.push({
          id: prefixedCat,
          providerId: item.providerId,
          providerName: item.providerName,
          name: item.categoryName,
          type: 'live',
        });
      }
    }
    for (const item of runtimeSnap.movieItems) {
      const k = `${item.providerId}:${item.streamId}`;
      if (seenVod.has(k)) continue;
      seenVod.add(k);
      const prefixedCat = `${item.providerId}:${item.categoryId}`;
      vodStreams.push({
        num: vodStreams.length + 1,
        streamId: item.streamId,
        name: item.name,
        categoryId: prefixedCat,
        streamIcon: item.poster,
        containerExtension: item.containerExtension || 'mp4',
        rating: item.rating,
        added: item.year,
        playbackUrl: item.streamUrl,
        providerId: item.providerId,
        providerName: item.providerName,
      });
      if (!seenVodCat.has(prefixedCat)) {
        seenVodCat.add(prefixedCat);
        vodCategories.push({
          id: prefixedCat,
          providerId: item.providerId,
          providerName: item.providerName,
          name: item.categoryName,
          type: 'vod',
        });
      }
    }
    for (const item of runtimeSnap.seriesItems) {
      const k = `${item.providerId}:${item.streamId}`;
      if (seenSer.has(k)) continue;
      seenSer.add(k);
      const prefixedCat = `${item.providerId}:${item.categoryId}`;
      series.push({
        num: series.length + 1,
        seriesId: item.streamId,
        name: item.name,
        categoryId: prefixedCat,
        cover: item.poster,
        plot: item.plot,
        releaseDate: item.year,
        rating: item.rating,
        providerId: item.providerId,
        providerName: item.providerName,
      });
      if (!seenSerCat.has(prefixedCat)) {
        seenSerCat.add(prefixedCat);
        seriesCategories.push({
          id: prefixedCat,
          providerId: item.providerId,
          providerName: item.providerName,
          name: item.categoryName,
          type: 'series',
        });
      }
    }
  }

  const mergedPayload: XtreamFullCatalogPayload = {
    providerId: 'all',
    providerName: 'Catálogo Unificado',
    liveCategories,
    liveStreams,
    vodCategories,
    vodStreams,
    seriesCategories,
    series,
    counts: {
      liveCategories: liveCategories.length,
      liveStreams: liveStreams.length,
      vodCategories: vodCategories.length,
      vodStreams: vodStreams.length,
      seriesCategories: seriesCategories.length,
      series: series.length,
    },
    accountNumber: 1,
    syncedAt: envCat?.syncedAt ?? Date.now(),
    expiresAt: envCat?.expiresAt ?? Date.now() + 5 * 60 * 1000,
    fromCache: true,
  };
  if (envCatalogRes.ok && mergedPayload.liveStreams.length >= 200) {
    unifiedCatalogRamCache.set('unified', mergedPayload);
  }
  return mergedPayload;
}

function buildCategoryLookup(
  cats: Array<{ id: string; providerId?: string; name: string }>
): Map<string, string> {
  const map = new Map<string, string>();
  for (const c of cats) {
    const cleanName = c.name.replace(/^\[[^\]]+\]\s*/, '').trim();
    map.set(c.id, cleanName);
    if (c.providerId && !c.id.includes(':')) {
      map.set(`${c.providerId}:${c.id}`, cleanName);
    }
  }
  return map;
}

function toExtractorLang(lang: XtreamDetectedLang): string {
  return lang;
}

function computeOptionSortKey(opt: XtreamMatchedMediaOption, preferLang?: string): number {
  const normPref = String(preferLang || 'ES').toUpperCase();
  let langRank = 5;
  if (opt.lang === normPref) langRank = 0;
  else if (normPref === 'ES') {
    langRank = opt.lang === 'ES' ? 0 : opt.lang === 'LAT' ? 1 : opt.lang === 'VOSE' ? 2 : opt.lang === 'EN' ? 3 : 5;
  } else if (normPref === 'LAT') {
    langRank = opt.lang === 'LAT' ? 0 : opt.lang === 'ES' ? 1 : opt.lang === 'VOSE' ? 2 : opt.lang === 'EN' ? 3 : 5;
  } else if (normPref === 'EN') {
    langRank = opt.lang === 'EN' ? 0 : opt.lang === 'VOSE' ? 1 : opt.lang === 'ES' ? 2 : 5;
  } else if (normPref === 'VOSE') {
    langRank = opt.lang === 'VOSE' ? 0 : opt.lang === 'EN' ? 1 : opt.lang === 'ES' ? 2 : 5;
  }

  // Quality is weighed heavily so 4K UHD beats lower tiers cleanly within/near preferred tier
  return langRank * 1000 + opt.qualityTier * 100 - Math.min(99, opt.score);
}

export async function findXtreamMovieMatches(params: {
  titleHints: string[];
  yearHint?: string;
  preferLang?: string;
  limit?: number;
}): Promise<{ options: XtreamMatchedMediaOption[]; tracks: TrackRecord[] }> {
  const hints = buildHintVectors(params.titleHints);
  if (hints.length === 0) return { options: [], tracks: [] };

  const catalog = await loadUnifiedXtreamCatalogFast(2800);
  if (!catalog || catalog.vodStreams.length === 0) {
    return { options: [], tracks: [] };
  }

  const catLookup = buildCategoryLookup(catalog.vodCategories);
  const providerOrder = new Map(getAllXtreamProviders().map((p, idx) => [p.id, idx]));
  const matches: XtreamMatchedMediaOption[] = [];

  for (const item of catalog.vodStreams as XtreamVodStreamItem[]) {
    const pid = item.providerId || 'primary';
    const catName =
      catLookup.get(item.categoryId) ||
      catLookup.get(`${pid}:${item.categoryId}`) ||
      'VOD';
    const parsed = parseXtreamVodTitleMeta(item.name, catName, item.containerExtension);
    const score = scoreTitleMatchAgainstHints(parsed.cleanTitle, parsed.year, hints, params.yearHint);
    if (score < 76) continue;

    const ext = (item.containerExtension || 'mp4').toLowerCase();
    const playbackUrl =
      item.playbackUrl ||
      `/api/stream?provider=${encodeURIComponent(pid)}&id=${encodeURIComponent(item.streamId)}&type=vod&ext=${encodeURIComponent(ext)}`;

    matches.push({
      id: `xtream-vod-${pid}-${item.streamId}`,
      mediaType: 'movie',
      providerId: pid,
      providerName: item.providerName || pid,
      streamId: item.streamId,
      title: item.name,
      cleanTitle: parsed.cleanTitle,
      year: parsed.year,
      categoryName: catName,
      lang: parsed.lang,
      langLabel: parsed.langLabel,
      quality: parsed.quality,
      qualityTier: parsed.qualityTier,
      containerExtension: ext,
      rating: item.rating,
      poster: item.streamIcon,
      playbackUrl,
      score,
    });
  }

  matches.sort((a, b) => {
    const keyDiff = computeOptionSortKey(a, params.preferLang) - computeOptionSortKey(b, params.preferLang);
    if (keyDiff !== 0) return keyDiff;
    return (providerOrder.get(a.providerId) ?? 99) - (providerOrder.get(b.providerId) ?? 99);
  });

  // Deduplicate exact same provider + lang + quality keeping highest match score
  const seenKey = new Set<string>();
  const deduped: XtreamMatchedMediaOption[] = [];
  for (const m of matches) {
    const key = `${m.providerId}|${m.lang}|${m.qualityTier}|${m.streamId}`;
    if (seenKey.has(key)) continue;
    seenKey.add(key);
    deduped.push(m);
    if (deduped.length >= (params.limit ?? 24)) break;
  }

  const tracks: TrackRecord[] = deduped.map((opt) => ({
    id: `xtream-vod-${opt.providerId}-${opt.streamId}`,
    label: `${opt.providerName} · ${opt.langLabel} · ${opt.quality}`,
    lang: toExtractorLang(opt.lang),
    quality: opt.quality,
    sourceUrl: opt.playbackUrl || '',
    resolvedStreamUrl: opt.playbackUrl || '',
    resolverType: opt.containerExtension === 'm3u8' ? 'direct_hls' : 'direct_mp4',
  }));

  return { options: deduped, tracks };
}

export async function findXtreamSeriesMatches(params: {
  titleHints: string[];
  yearHint?: string;
  preferLang?: string;
  limit?: number;
}): Promise<XtreamMatchedMediaOption[]> {
  const hints = buildHintVectors(params.titleHints);
  if (hints.length === 0) return [];

  const catalog = await loadUnifiedXtreamCatalogFast(2800);
  if (!catalog || catalog.series.length === 0) return [];

  const catLookup = buildCategoryLookup(catalog.seriesCategories);
  const providerOrder = new Map(getAllXtreamProviders().map((p, idx) => [p.id, idx]));
  const matches: XtreamMatchedMediaOption[] = [];

  for (const ser of catalog.series as XtreamSeriesItem[]) {
    const pid = ser.providerId || 'primary';
    const catName =
      catLookup.get(ser.categoryId) ||
      catLookup.get(`${pid}:${ser.categoryId}`) ||
      'Series';
    const parsed = parseXtreamVodTitleMeta(ser.name, catName, '');
    const serYear =
      parsed.year ||
      (ser.releaseDate ? String(ser.releaseDate).match(/(19\d{2}|20[0-3]\d)/)?.[1] : undefined);
    const score = scoreTitleMatchAgainstHints(parsed.cleanTitle, serYear, hints, params.yearHint);
    if (score < 76) continue;

    matches.push({
      id: `xtream-ser-${pid}-${ser.seriesId}`,
      mediaType: 'tv',
      providerId: pid,
      providerName: ser.providerName || pid,
      streamId: ser.seriesId,
      seriesId: ser.seriesId,
      title: ser.name,
      cleanTitle: parsed.cleanTitle,
      year: serYear,
      categoryName: catName,
      lang: parsed.lang,
      langLabel: parsed.langLabel,
      quality: parsed.quality,
      qualityTier: parsed.qualityTier,
      containerExtension: 'mp4',
      rating: ser.rating,
      poster: ser.cover,
      score,
    });
  }

  matches.sort((a, b) => {
    const keyDiff = computeOptionSortKey(a, params.preferLang) - computeOptionSortKey(b, params.preferLang);
    if (keyDiff !== 0) return keyDiff;
    return (providerOrder.get(a.providerId) ?? 99) - (providerOrder.get(b.providerId) ?? 99);
  });

  const seenKey = new Set<string>();
  const deduped: XtreamMatchedMediaOption[] = [];
  for (const m of matches) {
    const key = `${m.providerId}|${m.lang}|${m.seriesId}`;
    if (seenKey.has(key)) continue;
    seenKey.add(key);
    deduped.push(m);
    if (deduped.length >= (params.limit ?? 16)) break;
  }

  return deduped;
}

async function fetchCachedXtreamSeriesInfo(
  seriesId: string,
  providerId: string
): Promise<XtreamSeriesInfoPayload | null> {
  const key = `${providerId}:${seriesId}`;
  const cached = seriesInfoCache.get(key);
  if (cached) return cached;

  const provRes = await Promise.race([
    getProviderSeriesDetail(providerId, seriesId).catch(() => null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 3200)),
  ]);
  if (provRes && Array.isArray(provRes.seasons) && provRes.seasons.length > 0) {
    const mapped: XtreamSeriesInfoPayload = {
      seriesId: provRes.seriesId,
      providerId: provRes.providerId,
      providerName: provRes.providerName,
      title: provRes.title,
      name: provRes.title,
      cover: provRes.poster,
      plot: provRes.plot,
      genre: provRes.genre,
      releaseDate: provRes.year,
      rating: provRes.rating,
      seasons: provRes.seasons.map((s) => ({
        seasonNumber: s.seasonNumber,
        name: s.name,
        episodeCount: s.episodes.length,
        episodes: s.episodes.map((e) => ({
          id: e.id,
          episodeNum: e.episodeNum,
          seasonNum: e.season,
          title: e.title,
          containerExtension: e.containerExtension,
          duration: e.duration,
          plot: e.plot,
          cover: e.still,
          playbackUrl: e.streamUrl,
          providerId: provRes.providerId,
        })),
      })),
    };
    seriesInfoCache.set(key, mapped);
    return mapped;
  }

  const res = await Promise.race([
    getSeriesInfo(seriesId, providerId).catch(() => ({ ok: false as const })),
    new Promise<{ ok: false }>((resolve) => setTimeout(() => resolve({ ok: false }), 3200)),
  ]);
  if (res.ok && 'info' in res && res.info) {
    seriesInfoCache.set(key, res.info);
    return res.info;
  }
  return null;
}

export async function extractXtreamSeriesEpisodeTracks(params: {
  titleHints: string[];
  yearHint?: string;
  season: number;
  episode: number;
  preferLang?: string;
}): Promise<TrackRecord[]> {
  const seriesOptions = await findXtreamSeriesMatches({
    titleHints: params.titleHints,
    yearHint: params.yearHint,
    preferLang: params.preferLang,
    limit: 6,
  });
  if (seriesOptions.length === 0) return [];

  const infos = await Promise.all(
    seriesOptions.map(async (opt) => ({
      opt,
      info: await fetchCachedXtreamSeriesInfo(opt.seriesId || opt.streamId, opt.providerId),
    }))
  );

  const tracks: TrackRecord[] = [];
  for (const { opt, info } of infos) {
    if (!info || !Array.isArray(info.seasons)) continue;
    const seasonGrp = info.seasons.find((s) => s.seasonNumber === params.season);
    const ep: XtreamSeriesEpisodeItem | undefined = seasonGrp?.episodes?.find(
      (e) => e.episodeNum === params.episode
    );
    if (!ep?.playbackUrl) continue;

    const epParsed = parseXtreamVodTitleMeta(
      `${opt.title} ${ep.title || ''}`,
      opt.categoryName,
      ep.containerExtension
    );
    const bestQualityTier = Math.min(opt.qualityTier, epParsed.qualityTier);
    const bestQualityLabel =
      bestQualityTier === 0
        ? '4K UHD'
        : bestQualityTier === 1
        ? '1080p FHD'
        : bestQualityTier === 2
        ? 'HD'
        : opt.quality;

    tracks.push({
      id: `xtream-ser-${opt.providerId}-${ep.id}`,
      label: `${opt.providerName} · ${opt.langLabel} · ${bestQualityLabel}`,
      lang: toExtractorLang(opt.lang),
      quality: bestQualityLabel,
      sourceUrl: ep.playbackUrl,
      resolvedStreamUrl: ep.playbackUrl,
      resolverType: ep.containerExtension === 'm3u8' ? 'direct_hls' : 'direct_mp4',
    });
  }

  return tracks;
}

export function mergeXtreamOptionsIntoAvailableLanguages(
  existing: ('ES' | 'LAT' | 'VOSE' | 'EN')[],
  options: XtreamMatchedMediaOption[]
): ('ES' | 'LAT' | 'VOSE' | 'EN')[] {
  const validCoreLangs = new Set<'ES' | 'LAT' | 'VOSE' | 'EN'>(['ES', 'LAT', 'VOSE', 'EN']);
  const merged = new Set<'ES' | 'LAT' | 'VOSE' | 'EN'>(existing);
  for (const opt of options) {
    if (validCoreLangs.has(opt.lang as 'ES' | 'LAT' | 'VOSE' | 'EN')) {
      merged.add(opt.lang as 'ES' | 'LAT' | 'VOSE' | 'EN');
    }
  }
  const order: Array<'ES' | 'LAT' | 'VOSE' | 'EN'> = ['ES', 'LAT', 'VOSE', 'EN'];
  return order.filter((code) => merged.has(code));
}

const LIVE_BROADCASTER_ALIASES: Array<{ re: RegExp; patterns: string[] }> = [
  { re: /\bd\s*sports\b|\bdirectv\s*sports?\b/i, patterns: ['dsports', 'directv sports', 'directv sport', 'd sports'] },
  { re: /\btudn\b/i, patterns: ['tudn', 'tudn mx', 'tudn usa'] },
  { re: /\bdazn\s*laliga\b/i, patterns: ['dazn laliga', 'dazn la liga'] },
  { re: /\bm\+\s*laliga\b|\bmovistar\s*laliga\b|\blaliga\s*tv\b/i, patterns: ['m+ laliga', 'movistar laliga', 'm laliga', 'laliga tv', 'laliga'] },
  { re: /campeones|mligacampeones|liga\s*de\s*campeones/i, patterns: ['liga de campeones', 'm campeones', 'm+ campeones', 'movistar campeones', 'm+ liga de campeones', 'l campeones', 'mligacampeones'] },
  { re: /hypermotion/i, patterns: ['laliga hypermotion', 'hypermotion', 'laliga tv hypermotion'] },
  { re: /\bmovistar\s*plus\b|\bm\+\s*plus\b/i, patterns: ['movistar plus', 'm+ plus', 'movistar+'] },
  { re: /\btyc\s*sports?\b/i, patterns: ['tyc sports', 'tyc sport'] },
  { re: /\btnt\s*sports?\b/i, patterns: ['tnt sports', 'tnt sport'] },
  { re: /\bfox\s*sports?\b/i, patterns: ['fox sports', 'fox sport'] },
  { re: /\bteledeporte\b|\btdp\b/i, patterns: ['teledeporte', 'tdp'] },
  { re: /\bcgtn\b/i, patterns: ['cgtn', 'cgtn espanol', 'cgtn noticias', 'cgtn esp'] },
];

const KNOWN_SPORTS_BROADCASTER_HINT_RE =
  /\b(?:dsports|directv|tudn|dazn|movistar|m\+\s*(?:liga|laliga|campeones|deportes|vamos|plus)|mliga(?:campeones)?|liga\s*de\s*campeones|campeones|laliga|hypermotion|espn|tyc\s*sports?|fox\s*sports?|tnt\s*sports?|sky\s*sports?|bein|gol\s*(?:play|tv|mundial)|teledeporte|eurosport|vamos|sport\s*tv|cgtn|la\s*1|la\s*2|antena\s*3|cuatro|telecinco|lasexta|la\s*sexta)\b/i;

export function extractXtreamLiveHintsFromSportsRequest(
  rawUrl: string,
  channelLabel?: string,
  titleHint?: string
): string[] {
  const hints: string[] = [];
  const add = (val: string) => {
    const c = String(val || '')
      .replace(
        /\b(?:señal|signal|canal|channel|opci[oó]n|enlace|servidor|server|link|mirror|live|fhd|hd|uhd|4k|1080p|720p|sd|directo|español|espanol|english|ofic?ial|guía\s*tv)\b/gi,
        ' '
      )
      .replace(/[|·•\-()[\]]+/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (c.length >= 3 && !/^\d+$/.test(c) && !hints.includes(c)) {
      hints.push(c);
    }
  };
  if (channelLabel) {
    const cleaned = String(channelLabel)
      .replace(
        /\b(?:señal|signal|canal|channel|opci[oó]n|enlace|servidor|server|link|mirror|live|fhd|hd|uhd|4k|1080p|720p|sd|directo|español|espanol|english|ofic?ial|guía\s*tv)\b/gi,
        ' '
      )
      .trim();
    if (cleaned.length >= 3 && KNOWN_SPORTS_BROADCASTER_HINT_RE.test(channelLabel)) {
      add(channelLabel);
    }
  }
  try {
    const u = new URL(rawUrl, 'http://localhost');
    const qStream = u.searchParams.get('stream') || u.searchParams.get('ch') || u.searchParams.get('channel') || '';
    if (qStream && KNOWN_SPORTS_BROADCASTER_HINT_RE.test(qStream.replace(/[_-]+/g, ' '))) {
      add(qStream.replace(/[_-]+/g, ' '));
    }
    const pathSlug = u.pathname.split('/').pop()?.replace(/\.(php|html?|m3u8)$/i, '') || '';
    if (
      pathSlug &&
      !/^(live\d*|stream|index|play|embed|canal\d*)$/i.test(pathSlug) &&
      KNOWN_SPORTS_BROADCASTER_HINT_RE.test(pathSlug.replace(/[_-]+/g, ' '))
    ) {
      add(pathSlug.replace(/[_-]+/g, ' '));
    }
  } catch {
    // ignore URL parse error
  }
  if (titleHint && KNOWN_SPORTS_BROADCASTER_HINT_RE.test(titleHint)) {
    add(titleHint);
  }
  return hints;
}

interface IndexedXtreamLiveChannel {
  item: XtreamLiveStreamItem;
  meta: ParsedXtreamVodMeta;
  candNorm: string;
  candNum?: string;
  qualityBonus: number;
}

let cachedLiveIndexSource: XtreamLiveStreamItem[] | null = null;
let cachedLiveIndexBuiltAt = 0;
let cachedLiveIndex: IndexedXtreamLiveChannel[] = [];

function getIndexedLiveStreams(catalog: XtreamFullCatalogPayload): IndexedXtreamLiveChannel[] {
  const now = Date.now();
  if (
    cachedLiveIndexSource === catalog.liveStreams &&
    now - cachedLiveIndexBuiltAt < 45_000 &&
    cachedLiveIndex.length > 0
  ) {
    return cachedLiveIndex;
  }
  const catLookup = buildCategoryLookup(catalog.liveCategories);
  const built: IndexedXtreamLiveChannel[] = [];
  for (const item of catalog.liveStreams) {
    const catName =
      catLookup.get(item.categoryId) ||
      catLookup.get(`${item.providerId}:${item.categoryId}`) ||
      'Live';
    const meta = parseXtreamVodTitleMeta(item.name, catName, 'm3u8');
    const candNorm = normalizeMatchText(meta.cleanTitle, false);
    if (!candNorm || /\b(?:backup|test|event|vod)\b/.test(candNorm)) continue;
    const candNum = candNorm.match(/\b(\d{1,2})\b$/)?.[1];
    built.push({
      item,
      meta,
      candNorm,
      candNum,
      qualityBonus: Math.max(0, 12 - meta.qualityTier * 4),
    });
  }
  cachedLiveIndexSource = catalog.liveStreams;
  cachedLiveIndexBuiltAt = now;
  cachedLiveIndex = built;
  return built;
}

export async function findXtreamLiveChannelMatches(params: {
  channelHints: string[];
  preferLang?: string;
  limit?: number;
}): Promise<TrackRecord[]> {
  const rawHints = params.channelHints.map((h) => String(h || '').trim()).filter((h) => h.length >= 3);
  if (rawHints.length === 0) return [];

  const catalog = await loadUnifiedXtreamCatalogFast(1800);
  if (!catalog || catalog.liveStreams.length === 0) return [];

  const expandedPatterns: Array<{ norm: string; tokens: string[]; numberSuffix?: string }> = [];
  const seenPat = new Set<string>();
  const registerPat = (raw: string, forcedNum?: string) => {
    let norm = normalizeMatchText(raw, false);
    if (!norm || norm.length < 3) return;
    if (forcedNum && forcedNum !== '1') {
      const existingNum = norm.match(/\b(\d{1,2})\b$/)?.[1];
      if (!existingNum) norm = `${norm} ${forcedNum}`;
    }
    if (seenPat.has(norm)) return;
    seenPat.add(norm);
    const numMatch = norm.match(/\b(\d{1,2})\b$/);
    expandedPatterns.push({
      norm,
      tokens: norm.split(' ').filter((t) => t.length >= 2),
      numberSuffix: numMatch ? numMatch[1] : undefined,
    });
  };

  for (const h of rawHints) {
    const hNorm = normalizeMatchText(h, false);
    const hintNum = hNorm.match(/\b(\d{1,2})\b$/)?.[1];
    registerPat(h);
    for (const alias of LIVE_BROADCASTER_ALIASES) {
      if (alias.re.test(h)) {
        for (const p of alias.patterns) {
          registerPat(p, hintNum);
        }
      }
    }
  }

  const hintJoined = rawHints.join(' ').toLowerCase();
  const conflictChecks: Array<{ reqRe: RegExp; candRe: RegExp }> = [
    { reqRe: /\btnt\b/i, candRe: /\btnt\s*sports?\b/i },
    { reqRe: /\bespn\b/i, candRe: /\bespn\b/i },
    { reqRe: /\bdsports\b|\bdirectv\b/i, candRe: /\b(?:dsports|directv\s*sports?)\b/i },
    { reqRe: /\bdazn\b/i, candRe: /\bdazn\b/i },
    { reqRe: /\beurosport\b/i, candRe: /\beurosport\b/i },
    { reqRe: /\bsky\b/i, candRe: /\bsky\s*sports?\b/i },
    { reqRe: /\bbein\b/i, candRe: /\bbein\b/i },
    { reqRe: /\bfox\b/i, candRe: /\bfox\s*sports?\b/i },
    { reqRe: /\bgol\b/i, candRe: /\bgol\s*(?:play|tv|mundial)\b/i },
  ];

  const containsWholePhrase = (haystack: string, needle: string): boolean => {
    if (!haystack || !needle) return false;
    if (haystack === needle) return true;
    let pos = haystack.indexOf(needle);
    while (pos !== -1) {
      const beforeOk = pos === 0 || haystack[pos - 1] === ' ';
      const afterIdx = pos + needle.length;
      const afterOk = afterIdx === haystack.length || haystack[afterIdx] === ' ';
      if (beforeOk && afterOk) return true;
      pos = haystack.indexOf(needle, pos + 1);
    }
    return false;
  };

  const indexed = getIndexedLiveStreams(catalog);
  const scored: Array<{ item: XtreamLiveStreamItem; meta: ParsedXtreamVodMeta; score: number }> = [];
  const normPref = String(params.preferLang || 'ES').toUpperCase();

  for (const entry of indexed) {
    const { item, meta, candNorm, candNum, qualityBonus } = entry;
    if (/\brsi\b/.test(candNorm) && !/\brsi\b/.test(hintJoined)) continue;

    // Reject conflicting sports broadcasters unless explicitly present in request hints
    let hasBroadcasterConflict = false;
    for (const chk of conflictChecks) {
      if (chk.candRe.test(candNorm) && !chk.reqRe.test(hintJoined)) {
        hasBroadcasterConflict = true;
        break;
      }
    }
    if (hasBroadcasterConflict) continue;

    let bestPatScore = 0;
    for (const pat of expandedPatterns) {
      if (candNorm === pat.norm) {
        bestPatScore = Math.max(bestPatScore, 130);
        continue;
      }
      if (pat.numberSuffix) {
        // Explicit channel number (e.g. "M+ Liga de Campeones 3" or "DAZN 2") MUST match that number
        if (pat.numberSuffix === '1') {
          if (candNum && candNum !== '1') continue;
        } else if (candNum !== pat.numberSuffix) {
          continue;
        }
      } else if (candNum && candNum !== '1') {
        // Unnumbered request ("M+ Liga de Campeones", "ESPN", "DAZN LaLiga") MUST NEVER match sub-channels 2..99 (including 10..16!)
        continue;
      }

      if (containsWholePhrase(candNorm, pat.norm)) {
        bestPatScore = Math.max(bestPatScore, pat.numberSuffix ? 115 : 102);
      } else if (pat.tokens.length >= 2 && pat.tokens.every((t) => containsWholePhrase(candNorm, t))) {
        bestPatScore = Math.max(bestPatScore, 92);
      }
    }
    if (bestPatScore < 85) continue;

    const langBonus =
      meta.lang === normPref
        ? 30
        : meta.lang === 'ES' || meta.lang === 'LAT'
        ? 18
        : meta.lang === 'EN'
        ? 8
        : 0;
    scored.push({
      item,
      meta,
      score: bestPatScore + langBonus + qualityBonus,
    });
  }

  scored.sort((a, b) => b.score - a.score || a.meta.qualityTier - b.meta.qualityTier);

  const out: TrackRecord[] = [];
  const seenStreams = new Set<string>();
  const perProviderCount = new Map<string, number>();
  const maxItems = params.limit ?? 16;
  const maxPerProv = maxItems >= 12 ? 3 : 2;
  // Pass 1: diversify across ALL providers first (up to maxPerProv per provider)
  for (const entry of scored) {
    const pid = entry.item.providerId || 'primary';
    const dedupKey = `${pid}:${entry.item.streamId}`;
    if (seenStreams.has(dedupKey)) continue;
    const provCnt = perProviderCount.get(pid) || 0;
    if (provCnt >= maxPerProv) continue;
    seenStreams.add(dedupKey);
    perProviderCount.set(pid, provCnt + 1);
    out.push({
      id: `xtream-live-${pid}-${entry.item.streamId}`,
      label: `${entry.item.name} (${entry.item.providerName})`,
      lang: toExtractorLang(entry.meta.lang),
      quality: entry.meta.quality,
      sourceUrl: entry.item.playbackUrl,
      resolvedStreamUrl: entry.item.playbackUrl,
      resolverType: 'direct_hls',
      providerId: pid,
      providerName: entry.item.providerName,
    } as TrackRecord);
    if (out.length >= maxItems) break;
  }

  // Pass 2: fill any remaining slots up to maxItems if fewer providers matched
  if (out.length < maxItems) {
    for (const entry of scored) {
      const pid = entry.item.providerId || 'primary';
      const dedupKey = `${pid}:${entry.item.streamId}`;
      if (seenStreams.has(dedupKey)) continue;
      seenStreams.add(dedupKey);
      out.push({
        id: `xtream-live-${pid}-${entry.item.streamId}`,
        label: `${entry.item.name} (${entry.item.providerName})`,
        lang: toExtractorLang(entry.meta.lang),
        quality: entry.meta.quality,
        sourceUrl: entry.item.playbackUrl,
        resolvedStreamUrl: entry.item.playbackUrl,
        resolverType: 'direct_hls',
        providerId: pid,
        providerName: entry.item.providerName,
      } as TrackRecord);
      if (out.length >= maxItems) break;
    }
  }

  return out;
}

