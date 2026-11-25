import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
  AppLanguage,
  ChannelLiveEpg,
  EpgProgramItem,
  FavoriteChannelItem,
  SpanishTdtChannel,
  TdtCategory,
} from '../../types';
import { useAppStore } from '../../store/useAppStore';
import { buildChannelFavId, sanitizeItemKey } from '../../utils/storage';
import { getChannelRegionMeta, type TvRegionId } from '../ui/ChannelLogoBadge';
import type { CatalogSection } from './catalogConstants';
import { ensureVaultSyncedWithBackend } from '../../services/xtreamVaultConfig';
import { readCachedXtreamCatalog } from '../../services/xtreamClientService';
import { buildLiveTdtChannel } from '../belix/XtreamMediaHelpers';
import { rankClientChannels } from '../../utils/channelQualityRanker';

export type FootballBrandFilter =
  | 'all'
  | 'bein_arabic'
  | 'china_football'
  | 'uk_sports'
  | 'beinsports'
  | 'espn'
  | 'dsports'
  | 'tnt_space'
  | 'movistar'
  | 'dazn'
  | 'world_cricket'
  | 'rbtv_sports';

interface UseLiveTvAndSportsCatalogArgs {
  lang?: AppLanguage;
  worldMode?: 'cine' | 'futbol' | 'tv' | 'youtube';
  activeSection: CatalogSection;
  externalSearchQuery?: string;
  favoriteChannels: FavoriteChannelItem[];
  onResetWatchlistOnly: () => void;
}

export function useLiveTvAndSportsCatalog({
  lang = 'es',
  worldMode,
  activeSection,
  externalSearchQuery,
  favoriteChannels,
  onResetWatchlistOnly,
}: UseLiveTvAndSportsCatalogArgs) {
  const [tdtChannels, setTdtChannels] = useState<SpanishTdtChannel[]>([]);
  const [loadingTdt, setLoadingTdt] = useState(false);
  const tdtCategory = useAppStore((s) => s.tdtCategory) as 'all' | 'tdt_all' | TdtCategory;
  const setTdtCategory = useAppStore((s) => s.setTdtCategory) as (
    cat: 'all' | 'tdt_all' | TdtCategory
  ) => void;
  const tvRegion = useAppStore((s) => s.tvRegion) as TvRegionId;
  const setTvRegion = useAppStore((s) => s.setTvRegion) as (reg: TvRegionId) => void;
  const adrarCountryFilter = useAppStore((s) => s.adrarCountryFilter);
  const setAdrarCountryFilter = useAppStore((s) => s.setAdrarCountryFilter);
  const tvFavOnly = useAppStore((s) => s.tvFavOnly);
  const setTvFavOnly = useAppStore((s) => s.setTvFavOnly);
  const [tdtSearch, setTdtSearch] = useState(() =>
    worldMode === 'tv' ? (externalSearchQuery || '') : ''
  );
  const [epgMap, setEpgMap] = useState<Record<string, ChannelLiveEpg>>({});
  const [epgMadridClock, setEpgMadridClock] = useState<string>('');
  const [loadingEpg, setLoadingEpg] = useState(false);
  const epgFilter = useAppStore((s) => s.tvEpgFilter);
  const setEpgFilter = useAppStore((s) => s.setTvEpgFilter);
  const [selectedEpgChannel, setSelectedEpgChannel] = useState<SpanishTdtChannel | null>(null);
  const requestedEpgChannel = useAppStore((s) => s.requestedEpgChannel);
  useEffect(() => {
    if (!requestedEpgChannel) return;
    setSelectedEpgChannel((prev) => (prev === requestedEpgChannel ? prev : requestedEpgChannel));
  }, [requestedEpgChannel]);
  const [epgClockMs, setEpgClockMs] = useState<number>(() => Date.now());

  const footballLiveBrand = useAppStore((s) => s.footballLiveBrand) as FootballBrandFilter;
  const setFootballLiveBrand = useAppStore((s) => s.setFootballLiveBrand) as (
    b: FootballBrandFilter
  ) => void;
  const sportsSearch = useAppStore((s) => s.futbolSearchQuery);
  const setSportsSearch = useAppStore((s) => s.setFutbolSearchQuery);
  const [futbolFiltersOpen, setFutbolFiltersOpen] = useState(false);
  const futbolLangFilter = useAppStore((s) => s.futbolLangFilter);
  const setFutbolLangFilter = useAppStore((s) => s.setFutbolLangFilter);
  const rawFutbolLeagueFilter = useAppStore((s) => s.futbolLeagueFilter);
  const futbolLeagueFilter = rawFutbolLeagueFilter === 'all' ? '' : rawFutbolLeagueFilter;
  const setFutbolLeagueFilter = useAppStore((s) => s.setFutbolLeagueFilter);
  const [tvFiltersOpen, setTvFiltersOpen] = useState(false);
  const prevExternalSearchRef = useRef<string | undefined>(undefined);

  useEffect(() => {
    if (externalSearchQuery === undefined) return;
    if (prevExternalSearchRef.current === externalSearchQuery) return;
    prevExternalSearchRef.current = externalSearchQuery;
    if (worldMode === 'futbol') {
      setSportsSearch(externalSearchQuery);
    } else if (worldMode === 'tv') {
      setTdtSearch(externalSearchQuery);
    }
  }, [externalSearchQuery, worldMode, setSportsSearch]);

  useEffect(() => {
    if (activeSection === 'home' && !worldMode) {
      setTdtCategory('all');
      setEpgFilter('all');
      onResetWatchlistOnly();
    }
  }, [activeSection, worldMode, onResetWatchlistOnly, setTdtCategory, setEpgFilter]);

  const fetchTdtCatalog = useCallback(async () => {
    setLoadingTdt(true);
    try {
      await ensureVaultSyncedWithBackend(false).catch(() => false);
      const [tdtSettled, worldSettled, rbtvSettled, belixSettled] = await Promise.allSettled([
        fetch('/api/catalog/tdt').then((r) => r.json()),
        fetch('/api/catalog/world-tv').then((r) => r.json()),
        fetch('/api/rbtv/channels').then((r) => r.json()),
        fetch('/api/belix/channels?includeAll=1').then((r) => r.json()),
      ]);
      const baseList: SpanishTdtChannel[] =
        tdtSettled.status === 'fulfilled' && Array.isArray(tdtSettled.value?.channels)
          ? tdtSettled.value.channels
          : [];
      const worldList: SpanishTdtChannel[] =
        worldSettled.status === 'fulfilled' && Array.isArray(worldSettled.value?.channels)
          ? worldSettled.value.channels
          : [];
      const rbtvList: SpanishTdtChannel[] =
        rbtvSettled.status === 'fulfilled' && Array.isArray(rbtvSettled.value?.channels)
          ? rbtvSettled.value.channels
          : [];
      const belixList: SpanishTdtChannel[] =
        belixSettled.status === 'fulfilled' && Array.isArray(belixSettled.value?.channels)
          ? belixSettled.value.channels
          : [];
      const cachedXtream = readCachedXtreamCatalog('all');
      const cachedXtreamChannels: SpanishTdtChannel[] = [];
      if (cachedXtream?.liveStreams?.length) {
        const catMap = new Map<string, string>();
        for (const cat of cachedXtream.liveCategories) {
          catMap.set(`${cat.providerId || 'primary'}:${cat.id}`, cat.name);
        }
        for (const stream of cachedXtream.liveStreams) {
          const catName =
            catMap.get(`${stream.providerId || 'primary'}:${stream.categoryId}`) || 'TV en Vivo';
          cachedXtreamChannels.push(buildLiveTdtChannel(stream, catName));
        }
      }
      if (
        baseList.length > 0 ||
        worldList.length > 0 ||
        rbtvList.length > 0 ||
        belixList.length > 0 ||
        cachedXtreamChannels.length > 0
      ) {
        const ranked = rankClientChannels([
          ...baseList,
          ...rbtvList,
          ...belixList,
          ...cachedXtreamChannels,
          ...worldList,
        ]);
        setTdtChannels(ranked);
      }
    } catch {
      // Keep cached channels
    } finally {
      setLoadingTdt(false);
    }
  }, []);

  const fetchLiveEpg = useCallback(async (forceRefresh = false) => {
    setLoadingEpg(true);
    try {
      const res = await fetch(forceRefresh ? '/api/epg/live?refresh=1' : '/api/epg/live');
      const data = await res.json();
      if (data?.epg && typeof data.epg === 'object') {
        setEpgMap(data.epg);
      }
      if (typeof data?.madridTimeLabel === 'string') {
        setEpgMadridClock(data.madridTimeLabel);
      }
      setEpgClockMs(Date.now());
    } catch {
      // Keep previous EPG snapshot
    } finally {
      setLoadingEpg(false);
    }
  }, []);

  useEffect(() => {
    const tick = setInterval(() => {
      const now = Date.now();
      setEpgClockMs(now);
      try {
        setEpgMadridClock(
          new Intl.DateTimeFormat('es-ES', {
            timeZone: 'Europe/Madrid',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }).format(new Date(now))
        );
      } catch {
        // Ignore Intl fallback
      }
    }, 30000);
    return () => clearInterval(tick);
  }, []);

  useEffect(() => {
    const needsEpg =
      worldMode === 'tv' ||
      activeSection === 'home' ||
      activeSection === 'tdt' ||
      activeSection === 'catala';
    if (!needsEpg) return;

    fetchLiveEpg(false);
    const refreshTimer = setInterval(() => fetchLiveEpg(false), 180000);
    return () => clearInterval(refreshTimer);
  }, [worldMode, activeSection, fetchLiveEpg]);

  useEffect(() => {
    const onBelixSynced = () => {
      void fetchTdtCatalog();
    };
    window.addEventListener('belix-channels-synced', onBelixSynced);
    return () => window.removeEventListener('belix-channels-synced', onBelixSynced);
  }, [fetchTdtCatalog]);

  useEffect(() => {
    if (
      (worldMode === 'tv' ||
        worldMode === 'futbol' ||
        activeSection === 'home' ||
        activeSection === 'tdt' ||
        activeSection === 'sports') &&
      tdtChannels.length === 0
    ) {
      fetchTdtCatalog();
    }
  }, [worldMode, activeSection, tdtChannels.length, fetchTdtCatalog]);

  const getChannelLiveEpg = useCallback(
    (channelId: string): ChannelLiveEpg | null => {
      const raw = epgMap[channelId];
      if (!raw) return null;
      const schedule: EpgProgramItem[] =
        Array.isArray(raw.upcoming) && raw.upcoming.length > 0
          ? raw.upcoming
          : ([raw.now, raw.next].filter(Boolean) as EpgProgramItem[]);
      if (schedule.length === 0) return raw;

      const activeIdx = schedule.findIndex(
        (p) => p.startMs <= epgClockMs && p.stopMs > epgClockMs
      );
      if (activeIdx === -1) {
        const nextUpcoming = schedule.find((p) => p.startMs > epgClockMs) || null;
        return {
          ...raw,
          now: raw.now && raw.now.stopMs > epgClockMs ? raw.now : null,
          next: nextUpcoming,
        };
      }

      const nowProg = schedule[activeIdx];
      const nextProg = schedule[activeIdx + 1] || null;
      const duration = Math.max(60000, nowProg.stopMs - nowProg.startMs);
      const elapsed = Math.max(0, Math.min(duration, epgClockMs - nowProg.startMs));
      const progressPct = Math.max(2, Math.min(100, Math.round((elapsed / duration) * 100)));
      const remainingMin = Math.max(1, Math.ceil((nowProg.stopMs - epgClockMs) / 60000));

      return {
        channelId,
        now: nowProg,
        next: nextProg,
        progressPct,
        remainingMin,
        upcoming: schedule.filter((p) => p.stopMs > epgClockMs),
      };
    },
    [epgMap, epgClockMs]
  );

  const favoriteKeySet = useMemo(() => {
    const set = new Set<string>();
    for (const c of favoriteChannels) {
      set.add(sanitizeItemKey(c.favId));
    }
    return set;
  }, [favoriteChannels]);

  const isChannelFavorited = useCallback(
    (favId: string) => favoriteKeySet.has(sanitizeItemKey(favId)),
    [favoriteKeySet]
  );

  const normalizeForSearch = (s: string) =>
    s ? s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase() : '';

  const indexedTdtChannels = useMemo(() => {
    return tdtChannels.map((ch) => ({
      ch,
      favIdKey: sanitizeItemKey(buildChannelFavId(ch.channels[0]?.sourceUrl || ch.id, ch.name)),
      region: getChannelRegionMeta(ch).region,
      normSportKey: normalizeForSearch(`${ch.name} ${ch.shortMark} ${ch.network}`),
      normFullKey: normalizeForSearch(
        `${ch.name} ${ch.shortMark} ${ch.network} ${ch.description || ''} ${ch.dial || ''}`
      ),
    }));
  }, [tdtChannels]);

  const footballSectionLiveChannels = useMemo(() => {
    const allowedCats = new Set([
      'dazn',
      'movistar',
      'bein_arabic',
      'china_football',
      'uk_sports',
      'beinsports',
      'espn',
      'dsports',
      'tnt_space',
      'world_cricket',
      'rbtv_sports',
    ]);
    const trimmedSearch = sportsSearch.trim();
    const normQuery = trimmedSearch ? normalizeForSearch(trimmedSearch) : '';
    const useQueryFilter =
      Boolean(normQuery) &&
      /chiringuito|inside|mega|cctv|china|chino|zh|guangdong|fengyun|xinshijue|tianjin|sky|uk|premier|eurosport|mutv|talksport|fifa|bein|arab|arabe|arryadia|maroc|marruecos|fox|espn|dsport|directv|tnt|space|movistar|dazn|laliga|campeones|vamos|f1|motor|fight|cricket|willow|sony|star sport|bahrain|rta|iraqia|aci|ekol|famelack|sportzfy/i.test(
        normQuery
      );

    const filtered: SpanishTdtChannel[] = [];
    for (const { ch, normSportKey } of indexedTdtChannels) {
      const isExtraSportCh =
        ch.id === 'ma-arryadia' ||
        ch.id === 'us-fox-sports1' ||
        ch.id === 'chiringuito-inside-live' ||
        ch.id === 'chiringuito-jugones-tv' ||
        ch.id === 'tdt-mega';
      const isBelixSport =
        ch.category === 'belix_live' &&
        /futbol|fútbol|deport|sport|dazn|movistar|laliga|champions|bein|espn|f1|moto|chiringuito/i.test(
          `${ch.name} ${ch.network}`
        );
      if (!allowedCats.has(ch.category) && !isExtraSportCh && !isBelixSport) continue;
      if (
        ch.category === 'movistar' &&
        (ch.id === 'mplus-estrenos' || ch.id === 'mplus-accion' || ch.id === 'mplus-series')
      ) {
        continue;
      }
      if (footballLiveBrand !== 'all' && ch.category !== footballLiveBrand) continue;
      if (useQueryFilter && !normSportKey.includes(normQuery)) continue;
      filtered.push(ch);
    }

    const catRank = (cat: string) => {
      if (lang === 'en') {
        if (cat === 'uk_sports') return 0;
        if (cat === 'beinsports' || cat === 'espn' || cat === 'world_cricket') return 1;
        if (cat === 'dazn' || cat === 'movistar') return 2;
        return 3;
      }
      if (lang === 'zh') {
        if (cat === 'china_football') return 0;
        if (cat === 'dazn' || cat === 'uk_sports') return 1;
        return 2;
      }
      return cat === 'dazn' ? 0 : cat === 'movistar' ? 1 : 2;
    };
    return filtered.sort((a, b) => catRank(a.category) - catRank(b.category));
  }, [indexedTdtChannels, footballLiveBrand, sportsSearch, lang]);

  const trimmedTdtSearch = tdtSearch.trim();
  const needsEpgForFilter = epgFilter !== 'all' || trimmedTdtSearch.length > 0;

  const filteredTdtChannels = useMemo(() => {
    const nonTdtCats = new Set([
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
    const normQuery = trimmedTdtSearch ? normalizeForSearch(trimmedTdtSearch) : '';
    const out: SpanishTdtChannel[] = [];

    for (const item of indexedTdtChannels) {
      const { ch, favIdKey, region, normFullKey } = item;

      if (tvFavOnly && !favoriteKeySet.has(favIdKey)) continue;

      if (tvRegion !== 'all') {
        if (region !== tvRegion) continue;
        if (tvRegion === 'adrar_europa' && adrarCountryFilter !== 'all') {
          const cCode = (ch.countryCode || '').toLowerCase();
          if (cCode !== adrarCountryFilter && !ch.id.includes(`-${adrarCountryFilter}-`)) {
            continue;
          }
        }
      }

      if (tdtCategory === 'tdt_all') {
        if (nonTdtCats.has(ch.category)) continue;
      } else if (tdtCategory !== 'all' && ch.category !== tdtCategory) {
        continue;
      }

      let epgHaystack = '';
      if (needsEpgForFilter) {
        const chEpg = getChannelLiveEpg(ch.id);
        if (chEpg) {
          epgHaystack = `${chEpg.now?.title || ''} ${chEpg.now?.category || ''} ${
            chEpg.now?.description || ''
          } ${chEpg.next?.title || ''}`.toLowerCase();
        }
      }

      if (epgFilter === 'sports_now') {
        const isSportsChannel =
          ch.category === 'dazn' ||
          ch.category === 'uk_sports' ||
          ch.category === 'china_football' ||
          ch.category === 'beinsports' ||
          ch.category === 'espn' ||
          ch.category === 'dsports' ||
          ch.category === 'world_cricket' ||
          ch.category === 'rbtv_sports' ||
          ch.id === 'tnt-sports' ||
          ch.id.includes('laliga') ||
          ch.id.includes('champions') ||
          ch.id.includes('campeones') ||
          ch.id.includes('deportes') ||
          ch.id.includes('vamos') ||
          ch.id.includes('golf') ||
          ch.id.includes('tdp') ||
          ch.id.includes('gol') ||
          ch.id.includes('rmtv');
        const isAiringSports =
          epgHaystack.length > 0 &&
          /deporte|f[uú]tbol|laliga|champions|f1|f[oó]rmula|motogp|tenis|baloncesto|nba|acb|ciclismo|golf|motor|directo|liga|cricket/i.test(
            epgHaystack
          );
        if (!isSportsChannel && !isAiringSports) continue;
      } else if (epgFilter === 'cinema_now') {
        const isCinemaChannel =
          ch.category === 'cine_series' ||
          ch.category === 'famelack_movies' ||
          ch.id === 'tnt-vivo' ||
          ch.id === 'space-vivo' ||
          ch.id === 'mplus-estrenos' ||
          ch.id === 'mplus-accion' ||
          ch.id === 'mplus-series';
        const isAiringCinema =
          epgHaystack.length > 0 &&
          /cine|pel[ií]cula|serie|thriller|drama|comedia|acci[oó]n|ficci[oó]n|temporada|episodio|cap[ií]tulo/i.test(
            epgHaystack
          );
        if (!isCinemaChannel && !isAiringCinema) continue;
      }

      if (normQuery) {
        const matchesMeta = normFullKey.includes(normQuery);
        const matchesEpg =
          !matchesMeta && epgHaystack.length > 0 && normalizeForSearch(epgHaystack).includes(normQuery);
        if (!matchesMeta && !matchesEpg) continue;
      }

      out.push(ch);
    }
    return out;
  }, [
    indexedTdtChannels,
    tvFavOnly,
    favoriteKeySet,
    tvRegion,
    adrarCountryFilter,
    tdtCategory,
    needsEpgForFilter,
    getChannelLiveEpg,
    epgFilter,
    trimmedTdtSearch,
  ]);

  const tvCategoryCounts = useMemo(() => {
    const perCategory: Record<string, number> = {};
    const perRegion: Record<string, number> = {};
    for (const { ch, region } of indexedTdtChannels) {
      perCategory[ch.category] = (perCategory[ch.category] || 0) + 1;
      perRegion[region] = (perRegion[region] || 0) + 1;
    }
    return { perCategory, perRegion };
  }, [indexedTdtChannels]);

  const footballNetworkCounts = useMemo(() => {
    const allowedCats = new Set([
      'bein_arabic',
      'china_football',
      'uk_sports',
      'beinsports',
      'espn',
      'dsports',
      'tnt_space',
      'movistar',
      'dazn',
      'world_cricket',
      'rbtv_sports',
    ]);
    const counts: Record<string, number> = { all: 0 };
    for (const ch of tdtChannels) {
      const isExtraSportCh = ch.id === 'ma-arryadia' || ch.id === 'us-fox-sports1';
      if (!allowedCats.has(ch.category) && !isExtraSportCh) continue;
      if (
        ch.category === 'movistar' &&
        (ch.id === 'mplus-estrenos' || ch.id === 'mplus-accion' || ch.id === 'mplus-series')
      ) {
        continue;
      }
      counts.all += 1;
      counts[ch.category] = (counts[ch.category] || 0) + 1;
    }
    return counts;
  }, [tdtChannels]);

  return {
    tdtChannels,
    loadingTdt,
    fetchTdtCatalog,
    tdtCategory,
    setTdtCategory,
    tvRegion,
    setTvRegion,
    adrarCountryFilter,
    setAdrarCountryFilter,
    tvFavOnly,
    setTvFavOnly,
    epgMadridClock,
    loadingEpg,
    fetchLiveEpg,
    epgFilter,
    setEpgFilter,
    selectedEpgChannel,
    setSelectedEpgChannel,
    epgClockMs,
    getChannelLiveEpg,
    isChannelFavorited,
    filteredTdtChannels,
    tvCategoryCounts,
    footballLiveBrand,
    setFootballLiveBrand,
    sportsSearch,
    setSportsSearch,
    futbolFiltersOpen,
    setFutbolFiltersOpen,
    futbolLangFilter,
    setFutbolLangFilter,
    futbolLeagueFilter,
    setFutbolLeagueFilter,
    tvFiltersOpen,
    setTvFiltersOpen,
    footballSectionLiveChannels,
    footballNetworkCounts,
  };
}
