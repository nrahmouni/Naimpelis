/**
 * @module server/services/famelackIptvService
 * @description Live aggregation service for Famelack (`famelack/famelack-data`), Free-TV/IPTV,
 * and iptv-org streams across Sports, Cricket, Movies, Kids, ADRAR Europe (FR/DE/ES/IT/TR/UK/NL/BE/RU),
 * and MENA/Elahmad regions.
 */
import type { LiveIptvChannelEntry } from './iptvPlaylistService.ts';
import { logger } from '../utils/logger.ts';

export interface WorldIptvChannelEntry extends LiveIptvChannelEntry {
  countryCode?: string;
  sourceHub: 'famelack' | 'freetv' | 'iptvorg' | 'elahmad';
  langCode?: string;
}

interface FamelackChannelJson {
  nanoid?: string;
  name?: string;
  country?: string;
  isGeoBlocked?: boolean;
  languages?: string[];
  sources?: {
    streams?: string[];
  };
}

const SYNC_TTL_MS = 45 * 60 * 1000;

const FAMELACK_COUNTRIES: Array<{
  code: string;
  file: string;
  label: string;
  lang: string;
  defaultCategory: string;
  tone: string;
  maxCount: number;
}> = [
  { code: 'es', file: 'es', label: 'España', lang: 'ES', defaultCategory: 'adrar_europa', tone: '#DC2626', maxCount: 28 },
  { code: 'fr', file: 'fr', label: 'Francia', lang: 'FR', defaultCategory: 'adrar_europa', tone: '#2563EB', maxCount: 30 },
  { code: 'de', file: 'de', label: 'Alemania', lang: 'DE', defaultCategory: 'adrar_europa', tone: '#EAB308', maxCount: 30 },
  { code: 'it', file: 'it', label: 'Italia', lang: 'IT', defaultCategory: 'adrar_europa', tone: '#16A34A', maxCount: 30 },
  { code: 'tr', file: 'tr', label: 'Turquía', lang: 'TR', defaultCategory: 'adrar_europa', tone: '#DC2626', maxCount: 28 },
  { code: 'uk', file: 'uk', label: 'Reino Unido', lang: 'EN', defaultCategory: 'adrar_europa', tone: '#1D4ED8', maxCount: 30 },
  { code: 'pt', file: 'pt', label: 'Portugal', lang: 'PT', defaultCategory: 'adrar_europa', tone: '#16A34A', maxCount: 20 },
  { code: 'nl', file: 'nl', label: 'Países Bajos', lang: 'NL', defaultCategory: 'adrar_europa', tone: '#EA580C', maxCount: 24 },
  { code: 'be', file: 'be', label: 'Bélgica', lang: 'FR', defaultCategory: 'adrar_europa', tone: '#CA8A04', maxCount: 18 },
  { code: 'ru', file: 'ru', label: 'Rusia', lang: 'RU', defaultCategory: 'adrar_europa', tone: '#2563EB', maxCount: 24 },
  { code: 'us', file: 'us', label: 'Estados Unidos', lang: 'EN', defaultCategory: 'usa_tv', tone: '#1D4ED8', maxCount: 32 },
  { code: 'mx', file: 'mx', label: 'México', lang: 'ES', defaultCategory: 'entretenimiento', tone: '#16A34A', maxCount: 24 },
  { code: 'ar', file: 'ar', label: 'Argentina', lang: 'ES', defaultCategory: 'tnt_space', tone: '#0EA5E9', maxCount: 20 },
  { code: 'br', file: 'br', label: 'Brasil', lang: 'PT', defaultCategory: 'entretenimiento', tone: '#16A34A', maxCount: 24 },
  { code: 'ma', file: 'ma', label: 'Marruecos', lang: 'AR', defaultCategory: 'marruecos', tone: '#B91C1C', maxCount: 16 },
  { code: 'dz', file: 'dz', label: 'Argelia', lang: 'AR', defaultCategory: 'elahmad_mena', tone: '#15803D', maxCount: 16 },
  { code: 'eg', file: 'eg', label: 'Egipto', lang: 'AR', defaultCategory: 'elahmad_mena', tone: '#B91C1C', maxCount: 22 },
  { code: 'sa', file: 'sa', label: 'Arabia Saudí', lang: 'AR', defaultCategory: 'elahmad_mena', tone: '#15803D', maxCount: 24 },
  { code: 'ae', file: 'ae', label: 'Emiratos Árabes', lang: 'AR', defaultCategory: 'elahmad_mena', tone: '#047857', maxCount: 24 },
  { code: 'in', file: 'in', label: 'India · Cricket & Sports', lang: 'EN', defaultCategory: 'world_cricket', tone: '#EA580C', maxCount: 24 },
  { code: 'pk', file: 'pk', label: 'Pakistán', lang: 'EN', defaultCategory: 'world_cricket', tone: '#15803D', maxCount: 14 },
];

let cachedWorldChannels: WorldIptvChannelEntry[] = [];
let lastWorldSyncAt = 0;
let worldSyncPromise: Promise<WorldIptvChannelEntry[]> | null = null;

function normKey(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function isPlayableStreamUrl(url: string): boolean {
  const s = String(url || '').trim();
  if (!/^https?:\/\//i.test(s)) return false;
  if (/youtube\.com|youtu\.be|twitch\.tv|dailymotion\.com|vimeo\.com/i.test(s)) return false;
  return /\.m3u8(\?|$|#)|\/hls\/|\/manifest|live/i.test(s);
}

export function parseWorldM3uPlaylist(
  text: string,
  sourceHub: 'freetv' | 'iptvorg',
  maxItems = 220
): WorldIptvChannelEntry[] {
  const out: WorldIptvChannelEntry[] = [];
  const lines = String(text || '').split(/\r?\n/);
  let current: { name: string; logo?: string; group?: string; country?: string } | null = null;
  const seen = new Set<string>();

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF:')) {
      const logo = line.match(/tvg-logo="([^"]*)"/i)?.[1] || undefined;
      const group = line.match(/group-title="([^"]*)"/i)?.[1] || undefined;
      const countryAttr = line.match(/tvg-country="([^"]*)"/i)?.[1] || undefined;
      const comma = line.lastIndexOf(',');
      const name = (comma >= 0 ? line.slice(comma + 1) : '')
        .replace(/\s*\(\d+p\)|\s*\[[^\]]+\]/gi, '')
        .trim();
      current = { name, logo, group, country: countryAttr?.toLowerCase() };
    } else if (!line.startsWith('#') && current) {
      if (current.name && isPlayableStreamUrl(line) && /^https:\/\//i.test(line)) {
        const key = `${normKey(current.name)}|${normKey(current.group || '')}`;
        if (!seen.has(key)) {
          seen.add(key);
          const groupLower = `${current.group || ''} ${current.name}`.toLowerCase();
          const isSports =
            /sport|futbol|football|cricket|beinsport|eurosport|cbc sport|m4 sport|rai sport|arena|golazo|racing|motor|willow|sony.*ten|star sport/i.test(
              groupLower
            );
          const isKids = /kid|cartoon|disney|nickelodeon|clan|boing|gulli|kika/i.test(groupLower);
          const isMovie = /movie|cine|film|cinema|action|thriller|horror/i.test(groupLower);
          const isAdrar =
            /\b(france|germany|deutschland|spain|españa|italy|italia|turkey|türkiye|uk|united kingdom|netherlands|belgium|belgique|russia)\b/i.test(
              current.group || ''
            );
          const isMena =
            /\b(morocco|maroc|algeria|algerie|egypt|saudi|uae|qatar|arabic)\b/i.test(
              current.group || ''
            );

          const category = isSports
            ? 'world_cricket'
            : isKids
            ? 'kids_world'
            : isMovie
            ? 'famelack_movies'
            : isAdrar
            ? 'adrar_europa'
            : isMena
            ? 'elahmad_mena'
            : 'europa_tv';

          if (isSports || isKids || isAdrar || isMena || isMovie) {
            const slug = normKey(current.name).replace(/\s+/g, '-').slice(0, 32) || 'ch';
            out.push({
              id: `${sourceHub}-${slug}-${out.length}`,
              name: current.name,
              shortMark: current.name.replace(/[^A-Za-z0-9]/g, '').slice(0, 5).toUpperCase() || 'TV',
              brandTone: isSports ? '#10B981' : isKids ? '#F59E0B' : isMovie ? '#7C3AED' : '#0EA5E9',
              network: `${sourceHub === 'freetv' ? 'Free-TV' : 'IPTV-Org'} · ${current.group || 'World'}`,
              category,
              countryCode: current.country,
              sourceHub,
              quality: 'HD Live',
              description: `${current.name} · ${current.group || 'Emisión en directo'}`,
              logoUrl: current.logo,
              isLiveSynced: true,
              updatedAt: Date.now(),
              channels: [
                {
                  id: `${sourceHub}-${slug}-0`,
                  label: `Señal ${sourceHub === 'freetv' ? 'Free-TV' : 'IPTV-Org'} HD (${current.name})`,
                  lang: isSports ? 'EN' : 'INT',
                  quality: '1080p',
                  sourceUrl: line,
                  resolverType: 'tdt_hls',
                },
              ],
            });
          }
        }
      }
      current = null;
      if (out.length >= maxItems) break;
    }
  }
  return out;
}

export function mapFamelackItemsToEntries(
  items: FamelackChannelJson[],
  opts: {
    prefix: string;
    category: string;
    networkLabel: string;
    countryCode?: string;
    lang?: string;
    tone?: string;
    limit: number;
    cricketPriority?: boolean;
  }
): WorldIptvChannelEntry[] {
  const results: WorldIptvChannelEntry[] = [];
  const seenNames = new Set<string>();

  for (const item of items) {
    const name = String(item?.name || '').trim();
    if (!name || item?.isGeoBlocked) continue;
    const streams = (item?.sources?.streams || []).filter(
      (u) => isPlayableStreamUrl(u) && /^https:\/\//i.test(u)
    );
    if (streams.length === 0) continue;
    const nKey = normKey(name);
    if (!nKey || seenNames.has(nKey)) continue;

    if (opts.cricketPriority && !/sport|cricket|willow|sony|star|espn|euro|golf|motor|fight|ten|foot|fubo|racing|cbc/i.test(name)) {
      continue;
    }
    seenNames.add(nKey);
    const slug = nKey.replace(/\s+/g, '-').slice(0, 30);
    const cCode = (opts.countryCode || item.country || '').toLowerCase() || undefined;
    const langCode = opts.lang || (item.languages?.[0] ? item.languages[0].slice(0, 2).toUpperCase() : 'INT');

    results.push({
      id: `${opts.prefix}-${cCode || 'gl'}-${slug}`,
      name,
      shortMark: name.replace(/[^A-Za-z0-9]/g, '').slice(0, 5).toUpperCase() || 'TV',
      brandTone: opts.tone || '#9146FF',
      network: opts.networkLabel,
      category: opts.category,
      countryCode: cCode,
      sourceHub: 'famelack',
      langCode,
      quality: '1080p HD',
      description: `${name} · ${opts.networkLabel}`,
      isLiveSynced: true,
      updatedAt: Date.now(),
      channels: streams.slice(0, 2).map((u, idx) => ({
        id: `${opts.prefix}-${slug}-${idx}`,
        label: `Señal Famelack ${idx + 1} (${name})`,
        lang: langCode,
        quality: '1080p',
        sourceUrl: u,
        resolverType: 'tdt_hls' as const,
      })),
    });

    if (results.length >= opts.limit) break;
  }
  return results;
}

async function fetchJsonSafe<T>(url: string, timeoutMs = 6500): Promise<T | null> {
  try {
    const r = await fetch(url, {
      headers: { 'User-Agent': 'RiffanTV-WorldSync/2.0' },
      signal: AbortSignal.timeout(timeoutMs),
    });
    if (!r.ok) return null;
    return (await r.json()) as T;
  } catch {
    return null;
  }
}

export async function refreshFamelackAndWorldCatalog(
  force = false
): Promise<WorldIptvChannelEntry[]> {
  if (!force && cachedWorldChannels.length > 0 && Date.now() - lastWorldSyncAt < SYNC_TTL_MS) {
    return cachedWorldChannels;
  }
  if (worldSyncPromise) {
    return worldSyncPromise;
  }

  worldSyncPromise = (async () => {
    const collected: WorldIptvChannelEntry[] = [];
    const seenKeys = new Set<string>();

    const appendEntries = (entries: WorldIptvChannelEntry[]) => {
      for (const entry of entries) {
        const key = `${normKey(entry.name)}|${entry.countryCode || entry.category}`;
        if (seenKeys.has(key)) continue;
        seenKeys.add(key);
        collected.push({
          ...entry,
          dial: 600 + collected.length,
        });
      }
    };

    const fetchM3uText = (url: string) =>
      fetch(url, {
        headers: { 'User-Agent': 'RiffanTV-WorldSync/3.2' },
        signal: AbortSignal.timeout(7000),
      })
        .then((r) => (r.ok ? r.text() : ''))
        .catch(() => '');

    const [
      sportsJson,
      moviesJson,
      kidsJson,
      docJson,
      newsJson,
      entJson,
      freeTvText,
      iptvOrgSportsText,
      iptvOrgMoviesText,
      iptvOrgKidsText,
      iptvOrgDocsText,
    ] = await Promise.all([
      fetchJsonSafe<FamelackChannelJson[]>(
        'https://raw.githubusercontent.com/famelack/famelack-data/main/tv/categories/sports.json'
      ),
      fetchJsonSafe<FamelackChannelJson[]>(
        'https://raw.githubusercontent.com/famelack/famelack-data/main/tv/categories/movies.json'
      ),
      fetchJsonSafe<FamelackChannelJson[]>(
        'https://raw.githubusercontent.com/famelack/famelack-data/main/tv/categories/kids.json'
      ),
      fetchJsonSafe<FamelackChannelJson[]>(
        'https://raw.githubusercontent.com/famelack/famelack-data/main/tv/categories/documentary.json'
      ),
      fetchJsonSafe<FamelackChannelJson[]>(
        'https://raw.githubusercontent.com/famelack/famelack-data/main/tv/categories/news.json'
      ),
      fetchJsonSafe<FamelackChannelJson[]>(
        'https://raw.githubusercontent.com/famelack/famelack-data/main/tv/categories/entertainment.json'
      ),
      fetchM3uText('https://raw.githubusercontent.com/Free-TV/IPTV/master/playlist.m3u8'),
      fetchM3uText('https://iptv-org.github.io/iptv/categories/sports.m3u'),
      fetchM3uText('https://iptv-org.github.io/iptv/categories/movies.m3u'),
      fetchM3uText('https://iptv-org.github.io/iptv/categories/kids.m3u'),
      fetchM3uText('https://iptv-org.github.io/iptv/categories/documentary.m3u'),
    ]);

    if (Array.isArray(sportsJson)) {
      appendEntries(
        mapFamelackItemsToEntries(sportsJson, {
          prefix: 'fl-sport',
          category: 'world_cricket',
          networkLabel: 'Famelack Sports Worldwide',
          tone: '#10B981',
          limit: 105,
        })
      );
    }

    if (Array.isArray(moviesJson)) {
      appendEntries(
        mapFamelackItemsToEntries(moviesJson, {
          prefix: 'fl-mov',
          category: 'famelack_movies',
          networkLabel: 'Famelack Movies 24/7',
          tone: '#7C3AED',
          limit: 55,
        })
      );
    }

    if (Array.isArray(kidsJson)) {
      appendEntries(
        mapFamelackItemsToEntries(kidsJson, {
          prefix: 'fl-kids',
          category: 'kids_world',
          networkLabel: 'Famelack Kids World',
          tone: '#F59E0B',
          limit: 36,
        })
      );
    }

    if (Array.isArray(docJson)) {
      appendEntries(
        mapFamelackItemsToEntries(docJson, {
          prefix: 'fl-doc',
          category: 'documentales',
          networkLabel: 'Famelack Documentary',
          tone: '#0EA5E9',
          limit: 32,
        })
      );
    }

    if (Array.isArray(newsJson)) {
      appendEntries(
        mapFamelackItemsToEntries(newsJson, {
          prefix: 'fl-news',
          category: 'noticias_intl',
          networkLabel: 'Famelack Noticias Internacional',
          tone: '#0EA5E9',
          limit: 32,
        })
      );
    }

    if (Array.isArray(entJson)) {
      appendEntries(
        mapFamelackItemsToEntries(entJson, {
          prefix: 'fl-ent',
          category: 'entretenimiento',
          networkLabel: 'Famelack Entretenimiento',
          tone: '#8B5CF6',
          limit: 32,
        })
      );
    }

    // ADRAR, LatAm & MENA Country Packs from Famelack
    const countryResults = await Promise.all(
      FAMELACK_COUNTRIES.map(async (c) => {
        const list = await fetchJsonSafe<FamelackChannelJson[]>(
          `https://raw.githubusercontent.com/famelack/famelack-data/main/tv/countries/${c.file}.json`
        );
        return { meta: c, list: Array.isArray(list) ? list : [] };
      })
    );

    for (const { meta, list } of countryResults) {
      appendEntries(
        mapFamelackItemsToEntries(list, {
          prefix: 'fl-ctry',
          category: meta.defaultCategory,
          networkLabel: `Famelack · ${meta.label}`,
          countryCode: meta.code,
          lang: meta.lang,
          tone: meta.tone,
          limit: meta.maxCount,
          cricketPriority: meta.code === 'in' || meta.code === 'pk',
        })
      );
    }

    if (freeTvText) {
      appendEntries(parseWorldM3uPlaylist(freeTvText, 'freetv', 150));
    }
    if (iptvOrgSportsText) {
      appendEntries(parseWorldM3uPlaylist(iptvOrgSportsText, 'iptvorg', 75));
    }
    if (iptvOrgMoviesText) {
      appendEntries(parseWorldM3uPlaylist(iptvOrgMoviesText, 'iptvorg', 45));
    }
    if (iptvOrgKidsText) {
      appendEntries(parseWorldM3uPlaylist(iptvOrgKidsText, 'iptvorg', 35));
    }
    if (iptvOrgDocsText) {
      appendEntries(parseWorldM3uPlaylist(iptvOrgDocsText, 'iptvorg', 30));
    }

    if (collected.length > 0) {
      cachedWorldChannels = collected;
      lastWorldSyncAt = Date.now();
    }
    return cachedWorldChannels;
  })()
    .catch((err) => {
      logger.debug({ err }, 'famelack_world_sync_skip');
      return cachedWorldChannels;
    })
    .finally(() => {
      worldSyncPromise = null;
    });

  return worldSyncPromise;
}

export function getCachedFamelackWorldChannels(): WorldIptvChannelEntry[] {
  return cachedWorldChannels;
}

export function getFamelackWorldMeta() {
  return {
    lastWorldSyncAt,
    totalWorldChannels: cachedWorldChannels.length,
  };
}
