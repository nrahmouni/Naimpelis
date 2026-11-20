import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type {
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
  | 'world_cricket';

interface UseLiveTvAndSportsCatalogArgs {
  worldMode?: 'cine' | 'futbol' | 'tv' | 'youtube';
  activeSection: CatalogSection;
  externalSearchQuery?: string;
  favoriteChannels: FavoriteChannelItem[];
  onResetWatchlistOnly: () => void;
}

export function useLiveTvAndSportsCatalog({
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
  const [tvFavOnly, setTvFavOnly] = useState<boolean>(false);
  const [tdtSearch, setTdtSearch] = useState(() =>
    worldMode === 'tv' ? (externalSearchQuery || '') : ''
  );
  const [epgMap, setEpgMap] = useState<Record<string, ChannelLiveEpg>>({});
  const [epgMadridClock, setEpgMadridClock] = useState<string>('');
  const [loadingEpg, setLoadingEpg] = useState(false);
  const [epgFilter, setEpgFilter] = useState<'all' | 'sports_now' | 'cinema_now'>('all');
  const [selectedEpgChannel, setSelectedEpgChannel] = useState<SpanishTdtChannel | null>(null);
  const requestedEpgChannel = useAppStore((s) => s.requestedEpgChannel);
  useEffect(() => {
    if (!requestedEpgChannel) return;
    setSelectedEpgChannel(requestedEpgChannel);
  }, [requestedEpgChannel]);
  const [epgClockMs, setEpgClockMs] = useState<number>(() => Date.now());

  const footballLiveBrand = useAppStore((s) => s.footballLiveBrand) as FootballBrandFilter;
  const setFootballLiveBrand = useAppStore((s) => s.setFootballLiveBrand) as (
    b: FootballBrandFilter
  ) => void;
  const sportsSearch = useAppStore((s) => s.futbolSearchQuery);
  const setSportsSearch = useAppStore((s) => s.setFutbolSearchQuery);
  const [futbolFiltersOpen, setFutbolFiltersOpen] = useState(false);
  const [futbolLangFilter, setFutbolLangFilter] = useState<'all' | 'ZH'>('all');
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
  }, [activeSection, worldMode, onResetWatchlistOnly, setTdtCategory]);

  const fetchTdtCatalog = useCallback(async () => {
    setLoadingTdt(true);
    try {
      const [tdtSettled, worldSettled] = await Promise.allSettled([
        fetch('/api/catalog/tdt').then((r) => r.json()),
        fetch('/api/catalog/world-tv').then((r) => r.json()),
      ]);
      const baseList: SpanishTdtChannel[] =
        tdtSettled.status === 'fulfilled' && Array.isArray(tdtSettled.value?.channels)
          ? tdtSettled.value.channels
          : [];
      const worldList: SpanishTdtChannel[] =
        worldSettled.status === 'fulfilled' && Array.isArray(worldSettled.value?.channels)
          ? worldSettled.value.channels
          : [];
      if (baseList.length > 0 || worldList.length > 0) {
        const seenIds = new Set<string>();
        const merged: SpanishTdtChannel[] = [];
        for (const ch of [...baseList, ...worldList]) {
          if (!ch?.id || seenIds.has(ch.id)) continue;
          seenIds.add(ch.id);
          merged.push(ch);
        }
        setTdtChannels(merged);
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

  const isChannelFavorited = useCallback(
    (favId: string) => {
      const clean = sanitizeItemKey(favId);
      return favoriteChannels.some((c) => sanitizeItemKey(c.favId) === clean);
    },
    [favoriteChannels]
  );

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
    ]);
    const filtered = tdtChannels.filter((ch) => {
      const isExtraSportCh = ch.id === 'ma-arryadia' || ch.id === 'us-fox-sports1';
      if (!allowedCats.has(ch.category) && !isExtraSportCh) return false;
      if (
        ch.category === 'movistar' &&
        (ch.id === 'mplus-estrenos' || ch.id === 'mplus-accion' || ch.id === 'mplus-series')
      ) {
        return false;
      }
      if (footballLiveBrand !== 'all' && ch.category !== footballLiveBrand) return false;
      if (sportsSearch.trim()) {
        const norm = (s: string) =>
          s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
        const q = norm(sportsSearch);
        const matchesCh =
          norm(ch.name).includes(q) ||
          norm(ch.shortMark).includes(q) ||
          norm(ch.network).includes(q);
        if (
          /cctv|china|chino|zh|guangdong|fengyun|xinshijue|tianjin|sky|uk|premier|eurosport|mutv|talksport|fifa|bein|arab|arabe|arryadia|maroc|marruecos|fox|espn|dsport|directv|tnt|space|movistar|dazn|laliga|campeones|vamos|f1|motor|fight|cricket|willow|sony|star sport|bahrain|rta|iraqia|aci|ekol|famelack|sportzfy/i.test(
            q
          )
        ) {
          return matchesCh;
        }
      }
      return true;
    });
    const catRank = (cat: string) => (cat === 'dazn' ? 0 : cat === 'movistar' ? 1 : 2);
    return filtered.sort((a, b) => catRank(a.category) - catRank(b.category));
  }, [tdtChannels, footballLiveBrand, sportsSearch]);

  const filteredTdtChannels = useMemo(
    () =>
      tdtChannels.filter((ch) => {
    if (tvFavOnly) {
      const favId = buildChannelFavId(ch.channels[0]?.sourceUrl || ch.id, ch.name);
      if (!isChannelFavorited(favId)) return false;
    }

    if (tvRegion !== 'all') {
      const reg = getChannelRegionMeta(ch);
      if (reg.region !== tvRegion) return false;
      if (tvRegion === 'adrar_europa' && adrarCountryFilter !== 'all') {
        const cCode = (ch.countryCode || '').toLowerCase();
        if (cCode !== adrarCountryFilter && !ch.id.includes(`-${adrarCountryFilter}-`)) {
          return false;
        }
      }
    }

    if (tdtCategory === 'tdt_all') {
      if (
        ch.category === 'movistar' ||
        ch.category === 'dazn' ||
        ch.category === 'uk_sports' ||
        ch.category === 'china_football' ||
        ch.category === 'beinsports' ||
        ch.category === 'bein_arabic' ||
        ch.category === 'marruecos' ||
        ch.category === 'documentales' ||
        ch.category === 'usa_tv' ||
        ch.category === 'europa_tv' ||
        ch.category === 'noticias_intl' ||
        ch.category === 'espn' ||
        ch.category === 'dsports' ||
        ch.category === 'tnt_space' ||
        ch.category === 'world_cricket' ||
        ch.category === 'elahmad_mena' ||
        ch.category === 'adrar_europa' ||
        ch.category === 'famelack_movies' ||
        ch.category === 'kids_world'
      ) {
        return false;
      }
    } else if (tdtCategory !== 'all' && ch.category !== tdtCategory) {
      return false;
    }

    const chEpg = getChannelLiveEpg(ch.id);
    const epgHaystack = `${chEpg?.now?.title || ''} ${chEpg?.now?.category || ''} ${
      chEpg?.now?.description || ''
    } ${chEpg?.next?.title || ''}`.toLowerCase();

    if (epgFilter === 'sports_now') {
      const isSportsChannel =
        ch.category === 'dazn' ||
        ch.category === 'uk_sports' ||
        ch.category === 'china_football' ||
        ch.category === 'beinsports' ||
        ch.category === 'espn' ||
        ch.category === 'dsports' ||
        ch.category === 'world_cricket' ||
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
        /deporte|f[uú]tbol|laliga|champions|f1|f[oó]rmula|motogp|tenis|baloncesto|nba|acb|ciclismo|golf|motor|directo|liga|cricket/i.test(
          epgHaystack
        );
      if (!isSportsChannel && !isAiringSports) return false;
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
        /cine|pel[ií]cula|serie|thriller|drama|comedia|acci[oó]n|ficci[oó]n|temporada|episodio|cap[ií]tulo/i.test(
          epgHaystack
        );
      if (!isCinemaChannel && !isAiringCinema) return false;
    }

    if (tdtSearch.trim()) {
      const norm = (s: string) =>
        s.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
      const q = norm(tdtSearch);
      return (
        norm(ch.name).includes(q) ||
        norm(ch.shortMark).includes(q) ||
        norm(ch.network).includes(q) ||
        norm(ch.description).includes(q) ||
        norm(epgHaystack).includes(q) ||
        String(ch.dial) === q.trim()
      );
    }
    return true;
  }),
    [
      tdtChannels,
      tvFavOnly,
      isChannelFavorited,
      tvRegion,
      adrarCountryFilter,
      tdtCategory,
      getChannelLiveEpg,
      epgFilter,
      tdtSearch,
    ]
  );

  const tvCategoryCounts = useMemo(() => {
    const perCategory: Record<string, number> = {};
    const perRegion: Record<string, number> = {};
    for (const ch of tdtChannels) {
      perCategory[ch.category] = (perCategory[ch.category] || 0) + 1;
      const reg = getChannelRegionMeta(ch).region;
      perRegion[reg] = (perRegion[reg] || 0) + 1;
    }
    return { perCategory, perRegion };
  }, [tdtChannels]);

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
