/**
 * @module server/utils/streamMetaParser
 * @description Unified parser for stream language, region, clean title, and video quality tags
 * across live channels, VOD movies, and series from multi-provider Xtream servers.
 * Explicit leading country/language prefixes (e.g. `|ENG|`, `FR:`, `DE:`, `[LAT]`) ALWAYS
 * take precedence over broadcaster keywords like `DAZN` or `Movistar`.
 */

export type CanonicalStreamLang =
  | 'ES'
  | 'CAT'
  | 'LAT'
  | 'VOSE'
  | 'EN'
  | 'FR'
  | 'DE'
  | 'IT'
  | 'PT'
  | 'AR'
  | 'INTL';

export interface ParsedStreamMetadata {
  cleanTitle: string;
  lang: CanonicalStreamLang;
  langLabel: string;
  quality: string;
  qualityTier: number;
  isHevc: boolean;
  year?: string;
}

export const CANONICAL_LANG_LABELS: Record<CanonicalStreamLang, string> = {
  ES: 'Castellano',
  CAT: 'Català',
  LAT: 'Latino',
  VOSE: 'VOSE',
  EN: 'Inglés (EN)',
  FR: 'Francés (FR)',
  DE: 'Alemán (DE)',
  IT: 'Italiano (IT)',
  PT: 'Portugués (PT)',
  AR: 'Árabe (AR)',
  INTL: 'Internacional',
};

const PREFIX_TOKEN_RE =
  /^\s*(?:[|┃•·/]+|\[|\()?\s*(VIP\s+ES|VIP\s+LAT|VIP\s+FR|VIP\s+UK|ES|ESP|SPAIN|ESPA[ÑN]A|CAST|CASTELLANO|CAT|CATAL[AÀ]|LAT|LATINO|LATAM|MX|AR-LAT|LA|VOSE|SUB|EN|ENG|ENGLISH|UK|US|USA|FR|FRA|FRENCH|VF|VOSTFR|DE|DEU|GER|GERMAN|IT|ITA|ITALY|ITALIA|PT|POR|BR|BRAZIL|BRASIL|AR|ARB|ARABIC|ARA|MULTI|DUAL)\s*(?:\]|\)|[|┃•·:/-]+)\s*/i;

const LEADING_NOISE_TAG_RE =
  /^\s*(?:[|┃•·/]+|\[|\()?\s*(?:4K|UHD|2160P?|FHD|1080P?|HD|720P?|SD|HEVC|H\.?265|RAW|VIP|HDR|HDR10\+?|50FPS|60FPS|TOP|NEW)\s*(?:\]|\)|[|┃•·:/-]+)\s*/i;

const LEADING_DECORATOR_PREFIX_RE =
  /^\s*(?:\[[^\]]{1,14}\]|\([^)]{1,14}\)|\|[^|]{1,14}\|)\s*/;

const QUALITY_STRIP_RE =
  /(?:\(|\[)?\b(?:4K|UHD|2160P?|1080P?|FHD|FULL\s*HD|720P?|HDR10?\+?|DOLBY\s*VISION|REMUX|BLURAY|BLU-RAY|BDRIP|BRRIP|WEB-?DL|WEBRIP|HDTV|HDRIP|DVDRIP|480P?|360P?|HEVC|H\.?265|H\.?264|X265|X264|RAW|VIP|MULTI|DUAL|VOSE|CASTELLANO|ESPA[ÑN]OL|LATINO|SUBTITULAD[AO]S?|INGL[EÉ]S|ENGLISH|ESP|CAST|LAT|SUB|MKV|MP4|AVI)\b(?:\)|\])?/gi;

export function mapRawPrefixToLang(rawToken: string): CanonicalStreamLang | null {
  const token = String(rawToken || '')
    .trim()
    .toUpperCase()
    .replace(/^VIP\s+/, '');
  if (!token) return null;
  if (['ES', 'ESP', 'SPAIN', 'ESPAÑA', 'ESPANA', 'CAST', 'CASTELLANO'].includes(token)) return 'ES';
  if (['CAT', 'CATALÀ', 'CATALA'].includes(token)) return 'CAT';
  if (['LAT', 'LATINO', 'LATAM', 'MX', 'LA', 'AR-LAT'].includes(token)) return 'LAT';
  if (['VOSE', 'SUB'].includes(token)) return 'VOSE';
  if (['EN', 'ENG', 'ENGLISH', 'UK', 'US', 'USA'].includes(token)) return 'EN';
  if (['FR', 'FRA', 'FRENCH', 'VF', 'VOSTFR'].includes(token)) return 'FR';
  if (['DE', 'DEU', 'GER', 'GERMAN'].includes(token)) return 'DE';
  if (['IT', 'ITA', 'ITALY', 'ITALIA'].includes(token)) return 'IT';
  if (['PT', 'POR', 'BR', 'BRAZIL', 'BRASIL'].includes(token)) return 'PT';
  if (['AR', 'ARB', 'ARABIC', 'ARA'].includes(token)) return 'AR';
  return null;
}

export function stripLeadingStreamTags(rawName: string): {
  cleanTitle: string;
  explicitLang: CanonicalStreamLang | null;
} {
  let work = String(rawName || '')
    .replace(/⁴ᴷ|⁴ᵏ/g, ' 4K ')
    .replace(/ᶠᴴᴰ/gi, ' FHD ')
    .replace(/ᴴᴰ/gi, ' HD ')
    .replace(/\s+/g, ' ')
    .trim();

  let explicitLang: CanonicalStreamLang | null = null;
  for (let i = 0; i < 6; i++) {
    const m = work.match(PREFIX_TOKEN_RE);
    if (m) {
      const mapped = mapRawPrefixToLang(m[1]);
      if (mapped && !explicitLang) {
        explicitLang = mapped;
      }
      work = work.slice(m[0].length).trim();
      continue;
    }
    const noise = work.match(LEADING_NOISE_TAG_RE);
    if (noise) {
      work = work.slice(noise[0].length).trim();
      continue;
    }
    break;
  }

  return { cleanTitle: work, explicitLang };
}

export function detectStreamQuality(
  rawName: string,
  categoryName = '',
  kind: 'live' | 'movie' | 'series' = 'live',
  containerExt = ''
): { quality: string; qualityTier: number; isHevc: boolean } {
  const normalizedName = String(rawName || '')
    .replace(/⁴ᴷ|⁴ᵏ/g, ' 4K ')
    .replace(/ᶠᴴᴰ/gi, ' FHD ')
    .replace(/ᴴᴰ/gi, ' HD ');
  const hay = `${normalizedName} ${categoryName} ${containerExt}`.toLowerCase();
  const isHevc = /\b(?:hevc|h\.?265|x265)\b/.test(hay);

  if (/\b(?:4k|uhd|2160p?|dolby\s*vision|hdr10?\+?|remux)\b/.test(hay)) {
    return {
      quality: isHevc ? '4K HEVC' : '4K UHD',
      qualityTier: isHevc ? 0.5 : 0,
      isHevc,
    };
  }
  if (/\b(?:fhd|1080p?|full\s*hd|blu-?ray|bdrip|brrip)\b/.test(hay)) {
    return {
      quality: isHevc ? '1080p HEVC' : '1080p FHD',
      qualityTier: isHevc ? 1.5 : 1,
      isHevc,
    };
  }
  if (/\b(?:576p?|480p?|360p?|288p?|sd|lq|dvdrip)\b/.test(hay)) {
    return {
      quality: 'SD',
      qualityTier: 4,
      isHevc,
    };
  }
  if (/\b(?:720p?|hd|hdtv|web-?dl|webrip|raw)\b/.test(hay)) {
    return {
      quality: isHevc ? 'HD HEVC' : 'HD',
      qualityTier: isHevc ? 2.4 : 2,
      isHevc,
    };
  }
  return kind === 'live'
    ? { quality: 'HD', qualityTier: 2, isHevc: false }
    : { quality: '1080p FHD', qualityTier: 1, isHevc: false };
}

export function detectStreamLanguage(
  rawName: string,
  categoryName = '',
  kind: 'live' | 'movie' | 'series' = 'live'
): { lang: CanonicalStreamLang; langLabel: string; strippedTitle: string } {
  const { cleanTitle, explicitLang } = stripLeadingStreamTags(rawName);
  const name = String(rawName || '').trim();
  const cat = String(categoryName || '').trim();
  const catStripped = stripLeadingStreamTags(cat);
  const combined = `${name} ${cat}`;

  let lang: CanonicalStreamLang | null = explicitLang || catStripped.explicitLang;

  // Check Arabic Unicode script regardless of position
  if (!lang && /[\u0600-\u06FF]/.test(combined)) {
    lang = 'AR';
  }

  // Secondary explicit tokens inside brackets anywhere in name or category (e.g. "DAZN 1 [FR]" or "Movie (ENG)" or "4K-AR")
  if (!lang) {
    if (/(?:\[|\()\s*(?:ENG|EN|ENGLISH|UK|US|USA)\s*(?:\]|\))/i.test(combined)) lang = 'EN';
    else if (/(?:\[|\()\s*(?:FR|FRA|VF|VOSTFR|FRENCH)\s*(?:\]|\))/i.test(combined)) lang = 'FR';
    else if (/(?:\[|\()\s*(?:DE|DEU|GER|GERMAN)\s*(?:\]|\))/i.test(combined)) lang = 'DE';
    else if (/(?:\[|\()\s*(?:IT|ITA|ITALY)\s*(?:\]|\))/i.test(combined)) lang = 'IT';
    else if (/(?:\[|\()\s*(?:PT|POR|BR)\s*(?:\]|\))/i.test(combined)) lang = 'PT';
    else if (/(?:\[|\()\s*(?:CAT|CATAL[AÀ])\s*(?:\]|\))/i.test(combined)) lang = 'CAT';
    else if (/(?:\[|\()\s*(?:LAT|LATINO|LATAM|MX)\s*(?:\]|\))/i.test(combined)) lang = 'LAT';
    else if (/(?:\[|\()\s*(?:VOSE|SUB)\s*(?:\]|\))/i.test(combined)) lang = 'VOSE';
    else if (/(?:\[|\()\s*(?:AR|ARB|ARABIC|ARA|ARABE)\s*(?:\]|\))/i.test(combined)) lang = 'AR';
    else if (/(?:\[|\()\s*(?:ES|ESP|CAST|CASTELLANO|ESPA[ÑN]A)\s*(?:\]|\))/i.test(combined)) lang = 'ES';
  }

  // Case-sensitive uppercase delimited tags like "4K-AR", "... - AR", "_AR", "|AR|" (never matches Spanish "-ar" verbs)
  if (!lang) {
    if (/(?:^|[\s[\]()|\-_\/])(?:4K-AR|UHD-AR|FHD-AR|HD-AR|ARB|ARABIC)(?:$|[\s[\]()|\-_\/])/i.test(combined)) {
      lang = 'AR';
    } else if (/(?:^|[\s[\]()|\-_\/])AR(?:$|[\s[\]()|\-_\/])/.test(combined) && !/\bAR-LAT\b/i.test(combined)) {
      lang = 'AR';
    }
  }

  // Keyword heuristics ONLY when no explicit country/language prefix existed
  if (!lang) {
    if (/\b(?:arabic|arabia|egypt|maroc|morocco|aflam|mbc|rotana)\b/i.test(combined)) {
      lang = 'AR';
    } else if (/\b(?:catal[aà]|3cat|tv3|esport\s*3|sx3|8tv|betev[eé])\b/i.test(combined)) {
      lang = 'CAT';
    } else if (/\b(?:vose|subtitulad[ao]s?|sub\s*es|sub\s*esp)\b/i.test(combined)) {
      lang = 'VOSE';
    } else if (/\b(?:latino|latam|audio\s*latino|es-mx|m[eé]xico|argentina|colombia|chile|peru|telemundo|univision)\b/i.test(combined)) {
      lang = 'LAT';
    } else if (/\b(?:french|fran[çc]ais|france|vostfr|canal\+\s*fr|tf1|m6)\b/i.test(combined)) {
      lang = 'FR';
    } else if (/\b(?:german|deutsch|allemand|sky\s*sport\s*de|das\s*erste|zdf)\b/i.test(combined)) {
      lang = 'DE';
    } else if (/\b(?:italiano|italy|italia|rai\s*[123]|canale\s*5)\b/i.test(combined)) {
      lang = 'IT';
    } else if (/\b(?:portugu[eê]s|portugal|brasil|sport\s*tv\s*pt|rtp)\b/i.test(combined)) {
      lang = 'PT';
    } else if (
      /\b(?:castellano|espa[ñn]a|spain|tdt|tivify|movistar|m\+\s*(?:laliga|liga|deportes|cine|estrenos)|laliga\s*hypermotion|atresmedia|mediaset|rtve|telecinco|cuatro|antena\s*3|la\s*sexta|lasexta|cine\s*es|pel[ií]culas|estrenos)\b/i.test(
        combined
      )
    ) {
      lang = 'ES';
    } else if (/\b(?:english|ingl[eé]s|bbc|itv|sky\s*sports\s*uk|tnt\s*sports|nbc|cbs|abc|fox\s*sports|4k\s*movies|top\s*imdb|netflix\s*en|english\s*movies|english\s*series)\b/i.test(combined)) {
      lang = 'EN';
    } else if (
      kind === 'live' &&
      /\b(?:dazn\s*(?:la\s*liga|1|2|3|4|f1|motogp|es))\b/i.test(name) &&
      !/\b(?:fr|de|it|uk|us|en|pt|ar)\b/i.test(cat)
    ) {
      lang = 'ES';
    } else if (
      /\b(?:pel[ií]culas|cine|series|estrenos|infantil|animaci[oó]n|acci[oó]n|comedia|terror|suspense|ciencia\s*ficci[oó]n|documentales)\b/i.test(
        cat
      )
    ) {
      lang = 'ES';
    }
  }

  // Never falsely mark unknown VOD/Live as ES: emit INTL (or EN for English-titled VOD without Spanish markers)
  const finalLang: CanonicalStreamLang = lang || 'INTL';
  return {
    lang: finalLang,
    langLabel: CANONICAL_LANG_LABELS[finalLang],
    strippedTitle: cleanTitle || name,
  };
}

export function parseStreamMetadata(
  rawName: string,
  categoryName = '',
  kind: 'live' | 'movie' | 'series' = 'live',
  containerExt = ''
): ParsedStreamMetadata {
  const { lang, langLabel, strippedTitle } = detectStreamLanguage(rawName, categoryName, kind);
  const { quality, qualityTier, isHevc } = detectStreamQuality(rawName, categoryName, kind, containerExt);

  let work = strippedTitle
    .replace(LEADING_DECORATOR_PREFIX_RE, '')
    .replace(/\s+/g, ' ')
    .trim();
  const yearMatches = Array.from(work.matchAll(/(?:\(|\b)(19\d{2}|20[0-3]\d)(?:\)|\b)/g));
  const year = yearMatches.length > 0 ? yearMatches[yearMatches.length - 1][1] : undefined;

  work = work.replace(/\((19\d{2}|20[0-3]\d)\)/g, ' ');
  work = work.replace(/\[(19\d{2}|20[0-3]\d)\]/g, ' ');
  work = work.replace(QUALITY_STRIP_RE, ' ');
  if (year) {
    work = work.replace(new RegExp(`\\b${year}\\b$`), ' ');
  }
  work = work
    .replace(/\[\s*\]|\(\s*\)/g, ' ')
    .replace(/^[\s\-–:|┃•·/]+|[\s\-–:|┃•·/]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return {
    cleanTitle: work || strippedTitle || String(rawName || '').trim(),
    lang,
    langLabel,
    quality,
    qualityTier,
    isHevc,
    year,
  };
}
