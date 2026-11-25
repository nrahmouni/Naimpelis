/**
 * @module catalogWorker
 * @description Phase 3+ Web Worker offloading heavy catalog filtering, M3U playlist parsing,
 * VOD search relevance ranking, cross-server channel merging/ranking, and TV guide filtering
 * from the main browser UI thread so 60fps scrolling & video stay locked.
 */
import type { CatalogMovie, SpanishTdtChannel } from '../types';
import { mergeAndRankCatalogResults } from '../utils/catalogSearchRank';
import { rankClientChannels } from '../utils/channelQualityRanker';

export interface WorkerChannelItem {
  id: string;
  name?: string;
  title?: string;
  category?: string;
  country?: string;
  group?: string;
}

export interface TvFilterWorkerEntry {
  idx: number;
  id: string;
  category: string;
  countryCode?: string;
  favIdKey: string;
  region: string;
  searchText: string;
  epgHaystack: string;
}

export interface TvFilterWorkerOptions {
  query: string;
  tdtCategory: string;
  tvRegion: string;
  adrarCountryFilter: string;
  tvFavOnly: boolean;
  epgFilter: 'all' | 'sports_now' | 'cinema_now';
  favoriteFavKeys: string[];
}

export type CatalogWorkerRequest =
  | {
      id: number;
      type: 'FILTER_ITEMS';
      payload: {
        items?: WorkerChannelItem[];
        query?: string;
        category?: string;
      };
    }
  | {
      id: number;
      type: 'PARSE_M3U';
      payload: {
        m3uText?: string;
      };
    }
  | {
      id: number;
      type: 'RANK_VOD_RESULTS';
      payload: {
        remoteItems: CatalogMovie[];
        localItems: CatalogMovie[];
        query: string;
        options?: { limit?: number; prefer4k?: boolean; minLocalScore?: number };
      };
    }
  | {
      id: number;
      type: 'MERGE_RANK_CHANNELS';
      payload: {
        channels: SpanishTdtChannel[];
      };
    }
  | {
      id: number;
      type: 'FILTER_TV_CHANNELS';
      payload: {
        entries: TvFilterWorkerEntry[];
        options: TvFilterWorkerOptions;
      };
    };

function normalizeStr(v: string): string {
  return v
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

export function filterCatalogItemsSync<T extends WorkerChannelItem>(
  items: T[],
  query = '',
  category = 'all'
): T[] {
  const q = normalizeStr(query);
  const cat = normalizeStr(category);
  if (!q && (!cat || cat === 'all')) return items;

  const scored: Array<{ item: T; score: number }> = [];
  for (const item of items) {
    const itemCat = normalizeStr(String(item.category || item.group || ''));
    if (cat && cat !== 'all' && itemCat !== cat) continue;

    if (!q) {
      scored.push({ item, score: 1 });
      continue;
    }

    const label = normalizeStr(String(item.name || item.title || item.id || ''));
    if (label === q) scored.push({ item, score: 100 });
    else if (label.startsWith(q)) scored.push({ item, score: 80 });
    else if (label.includes(q)) scored.push({ item, score: 60 });
    else if (itemCat.includes(q)) scored.push({ item, score: 30 });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.map((s) => s.item);
}

const NON_TDT_CATS = new Set([
  'movistar',
  'dazn',
  'uk_sports',
  'china_football',
  'beinsports',
  'bein_arabic',
  'marruecos',
  'documentales',
  'usa_tv',
  'europa_tv',
  'noticias_intl',
  'espn',
  'dsports',
  'tnt_space',
  'world_cricket',
  'elahmad_mena',
  'adrar_europa',
  'famelack_movies',
  'kids_world',
  'belix_live',
  'rbtv_sports',
]);

export function filterTvChannelsIndicesSync(
  entries: TvFilterWorkerEntry[],
  options: TvFilterWorkerOptions
): number[] {
  const {
    query,
    tdtCategory,
    tvRegion,
    adrarCountryFilter,
    tvFavOnly,
    epgFilter,
    favoriteFavKeys,
  } = options;
  const favSet = tvFavOnly ? new Set(favoriteFavKeys) : null;
  const normQuery = query ? normalizeStr(query) : '';
  const out: number[] = [];

  for (const entry of entries) {
    if (favSet && !favSet.has(entry.favIdKey)) continue;

    if (tvRegion !== 'all') {
      if (entry.region !== tvRegion) continue;
      if (tvRegion === 'adrar_europa' && adrarCountryFilter !== 'all') {
        const cCode = (entry.countryCode || '').toLowerCase();
        if (cCode !== adrarCountryFilter && !entry.id.includes(`-${adrarCountryFilter}-`)) {
          continue;
        }
      }
    }

    if (tdtCategory === 'tdt_all') {
      if (NON_TDT_CATS.has(entry.category)) continue;
    } else if (tdtCategory !== 'all' && entry.category !== tdtCategory) {
      continue;
    }

    const epgHaystack = entry.epgHaystack || '';
    if (epgFilter === 'sports_now') {
      const isSportsChannel =
        entry.category === 'dazn' ||
        entry.category === 'uk_sports' ||
        entry.category === 'china_football' ||
        entry.category === 'beinsports' ||
        entry.category === 'espn' ||
        entry.category === 'dsports' ||
        entry.category === 'world_cricket' ||
        entry.category === 'rbtv_sports' ||
        entry.id === 'tnt-sports' ||
        entry.id.includes('laliga') ||
        entry.id.includes('champions') ||
        entry.id.includes('campeones') ||
        entry.id.includes('deportes') ||
        entry.id.includes('vamos') ||
        entry.id.includes('golf') ||
        entry.id.includes('tdp') ||
        entry.id.includes('gol') ||
        entry.id.includes('rmtv');
      const isAiringSports =
        epgHaystack.length > 0 &&
        /deporte|f[uú]tbol|laliga|champions|f1|f[oó]rmula|motogp|tenis|baloncesto|nba|acb|ciclismo|golf|motor|directo|liga|cricket/i.test(
          epgHaystack
        );
      if (!isSportsChannel && !isAiringSports) continue;
    } else if (epgFilter === 'cinema_now') {
      const isCinemaChannel =
        entry.category === 'cine_series' ||
        entry.category === 'famelack_movies' ||
        entry.id === 'tnt-vivo' ||
        entry.id === 'space-vivo' ||
        entry.id === 'mplus-estrenos' ||
        entry.id === 'mplus-accion' ||
        entry.id === 'mplus-series';
      const isAiringCinema =
        epgHaystack.length > 0 &&
        /cine|pel[ií]cula|serie|thriller|drama|comedia|acci[oó]n|ficci[oó]n|temporada|episodio|cap[ií]tulo/i.test(
          epgHaystack
        );
      if (!isCinemaChannel && !isAiringCinema) continue;
    }

    if (normQuery) {
      const normSearch = normalizeStr(entry.searchText);
      const matchesMeta = normSearch.includes(normQuery);
      const matchesEpg =
        !matchesMeta && epgHaystack.length > 0 && normalizeStr(epgHaystack).includes(normQuery);
      if (!matchesMeta && !matchesEpg) continue;
    }

    out.push(entry.idx);
  }
  return out;
}

export function parseM3uTextSync(m3uText: string): Array<{
  name: string;
  url: string;
  group?: string;
  logo?: string;
}> {
  const lines = String(m3uText || '').split(/\r?\n/);
  const entries: Array<{ name: string; url: string; group?: string; logo?: string }> = [];
  let pendingMeta: { name: string; group?: string; logo?: string } | null = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#EXTINF:')) {
      const commaIdx = line.lastIndexOf(',');
      const name = commaIdx >= 0 ? line.slice(commaIdx + 1).trim() : 'Canal';
      const groupMatch = line.match(/group-title="([^"]+)"/i);
      const logoMatch = line.match(/tvg-logo="([^"]+)"/i);
      pendingMeta = {
        name: name || 'Canal',
        group: groupMatch?.[1],
        logo: logoMatch?.[1],
      };
    } else if (!line.startsWith('#') && /^https?:\/\//i.test(line)) {
      entries.push({
        name: pendingMeta?.name || 'Stream',
        url: line,
        group: pendingMeta?.group,
        logo: pendingMeta?.logo,
      });
      pendingMeta = null;
    }
  }
  return entries;
}

if (typeof self !== 'undefined' && typeof (self as unknown as { postMessage?: unknown }).postMessage === 'function') {
  self.onmessage = (event: MessageEvent<CatalogWorkerRequest>) => {
    const req = event.data;
    if (!req) return;
    if (req.type === 'FILTER_ITEMS') {
      const result = filterCatalogItemsSync(
        req.payload.items || [],
        req.payload.query || '',
        req.payload.category || 'all'
      );
      self.postMessage({ id: req.id, ok: true, result });
      return;
    }
    if (req.type === 'PARSE_M3U') {
      const result = parseM3uTextSync(req.payload.m3uText || '');
      self.postMessage({ id: req.id, ok: true, result });
      return;
    }
    if (req.type === 'RANK_VOD_RESULTS') {
      const result = mergeAndRankCatalogResults(
        req.payload.remoteItems || [],
        req.payload.localItems || [],
        req.payload.query || '',
        req.payload.options
      );
      self.postMessage({ id: req.id, ok: true, result });
      return;
    }
    if (req.type === 'MERGE_RANK_CHANNELS') {
      const result = rankClientChannels(req.payload.channels || []);
      self.postMessage({ id: req.id, ok: true, result });
      return;
    }
    if (req.type === 'FILTER_TV_CHANNELS') {
      const result = filterTvChannelsIndicesSync(
        req.payload.entries || [],
        req.payload.options
      );
      self.postMessage({ id: req.id, ok: true, result });
    }
  };
}
