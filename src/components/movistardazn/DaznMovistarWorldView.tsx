import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Calendar,
  ChevronRight,
  Film,
  Flame,
  Play,
  Radio,
  RefreshCw,
  Trophy,
  Tv,
} from 'lucide-react';
import type {
  AppLanguage,
  CatalogMovie,
  SpanishTdtChannel,
  SportsMatch,
  YouTubeSearchItem,
} from '../../types';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import {
  MovistarDaznProgramPanel,
  resolveThemeArtwork,
  type MovistarDaznCatalogItemUi,
} from './MovistarDaznProgramPanel';
import heroStadiumImg from '../../assets/images/movistar_dazn_hero_stadium_1795215099890.jpg';
import f1NightImg from '../../assets/images/dazn_motor_f1_night_1795215098633.jpg';
import basketballArenaImg from '../../assets/images/movistar_arena_basketball_1795215098968.jpg';

interface MovistarDaznLiveChannelUi {
  id: string;
  tdtId: string;
  dial: number;
  name: string;
  shortMark: string;
  operator: 'movistar' | 'dazn';
  brandTone: string;
  logoUrl: string;
  nowTitle: string;
  nextTitle: string;
  description: string;
  startLabel: string;
  stopLabel: string;
  progressPct: number;
  isLiveSport: boolean;
  programArtwork: string;
  signalCount: number;
  tdtChannel: SpanishTdtChannel;
}

interface MovistarDaznLiveMatchUi {
  id: string;
  title: string;
  competition: string;
  sport: 'soccer' | 'motor' | 'basketball' | 'tennis' | 'other';
  time: string;
  isLive: boolean;
  broadcaster: string;
  operator: 'movistar' | 'dazn' | 'both';
  channels: SportsMatch['channels'];
  matchMeta: NonNullable<SportsMatch['matchMeta']>;
}

type OperatorFilter = 'all' | 'movistar' | 'dazn';
type CategoryFilter = 'all' | 'futbol' | 'motor' | 'deportes' | 'entretenimiento' | 'series';

interface DaznMovistarWorldViewProps {
  lang: AppLanguage;
  externalSearchQuery?: string;
  onPlayTdtChannel: (
    channel: SpanishTdtChannel,
    signalIndex?: number,
    liveProgramHint?: string
  ) => void;
  onPlaySportsMatch: (match: SportsMatch, channelIndex: number) => void;
  onPlayYouTubeVideo: (item: YouTubeSearchItem) => void;
  onPlayCustomUrl: (
    url: string,
    meta?: { title?: string; subtitle?: string; poster?: string }
  ) => void;
  onOpenSeriesPage: (series: CatalogMovie) => void;
}

const CATEGORY_TABS: {
  id: CategoryFilter;
  labelEs: string;
  labelCa: string;
  labelEn: string;
}[] = [
  { id: 'all', labelEs: 'Todo el Catálogo', labelCa: 'Tot el Catàleg', en: 'All Catalog', labelEn: 'All Catalog' } as any,
  { id: 'futbol', labelEs: 'Fútbol y Debates', labelCa: 'Futbol i Debats', labelEn: 'Football & Shows' },
  { id: 'motor', labelEs: 'Motor F1 y MotoGP', labelCa: 'Motor F1 i MotoGP', labelEn: 'F1 & MotoGP' },
  { id: 'deportes', labelEs: 'NBA, Euroliga y Boxeo', labelCa: 'NBA, Eurolliga i Boxa', labelEn: 'Sports & Docs' },
  { id: 'entretenimiento', labelEs: 'Entretenimiento M+', labelCa: 'Entreteniment M+', labelEn: 'Entertainment' },
  { id: 'series', labelEs: 'Series Originales M+', labelCa: 'Sèries Originals M+', labelEn: 'M+ Originals' },
];

export const DaznMovistarWorldView: React.FC<DaznMovistarWorldViewProps> = ({
  lang,
  externalSearchQuery = '',
  onPlayTdtChannel,
  onPlaySportsMatch,
  onPlayYouTubeVideo,
  onPlayCustomUrl,
  onOpenSeriesPage,
}) => {
  const [liveChannels, setLiveChannels] = useState<MovistarDaznLiveChannelUi[]>([]);
  const [liveMatches, setLiveMatches] = useState<MovistarDaznLiveMatchUi[]>([]);
  const [catalog, setCatalog] = useState<MovistarDaznCatalogItemUi[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [operatorFilter, setOperatorFilter] = useState<OperatorFilter>('all');
  const [activeCategory, setActiveCategory] = useState<CategoryFilter>('all');
  const [selectedProgram, setSelectedProgram] = useState<MovistarDaznCatalogItemUi | null>(null);
  const [failedImgs, setFailedImgs] = useState<Record<string, boolean>>({});

  const fetchHome = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const res = await fetch('/api/movistar-dazn/home');
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.success) {
        setLoadError(
          data?.error ||
            pickLang(lang, {
              es: 'No se pudo cargar DAZN & Movistar+.',
              ca: 'No s’ha pogut carregar DAZN & Movistar+.',
              en: 'Could not load DAZN & Movistar+.',
            })
        );
        return;
      }
      setLiveChannels(Array.isArray(data.liveChannels) ? data.liveChannels : []);
      setLiveMatches(Array.isArray(data.liveMatches) ? data.liveMatches : []);
      setCatalog(Array.isArray(data.catalog) ? data.catalog : []);
    } catch {
      setLoadError(
        pickLang(lang, {
          es: 'Error de red cargando DAZN & Movistar+.',
          ca: 'Error de xarxa carregant DAZN & Movistar+.',
          en: 'Network error loading DAZN & Movistar+.',
        })
      );
    } finally {
      setLoading(false);
    }
  }, [lang]);

  useEffect(() => {
    void fetchHome();
  }, [fetchHome]);

  const filteredChannels = useMemo(() => {
    const q = externalSearchQuery.trim().toLowerCase();
    return liveChannels.filter((ch) => {
      if (operatorFilter !== 'all' && ch.operator !== operatorFilter) return false;
      if (!q) return true;
      return `${ch.name} ${ch.nowTitle} ${ch.description} dial ${ch.dial}`
        .toLowerCase()
        .includes(q);
    });
  }, [liveChannels, operatorFilter, externalSearchQuery]);

  const filteredMatches = useMemo(() => {
    const q = externalSearchQuery.trim().toLowerCase();
    return liveMatches.filter((m) => {
      if (operatorFilter === 'movistar' && m.operator === 'dazn') return false;
      if (operatorFilter === 'dazn' && m.operator === 'movistar') return false;
      if (!q) return true;
      return `${m.title} ${m.competition} ${m.broadcaster}`.toLowerCase().includes(q);
    });
  }, [liveMatches, operatorFilter, externalSearchQuery]);

  const filteredCatalog = useMemo(() => {
    const q = externalSearchQuery.trim().toLowerCase();
    return catalog.filter((item) => {
      if (activeCategory !== 'all' && item.category !== activeCategory) return false;
      if (
        operatorFilter !== 'all' &&
        item.operator !== 'both' &&
        item.operator !== operatorFilter
      ) {
        return false;
      }
      if (!q) return true;
      return `${item.title} ${item.channelName} ${item.genre} ${item.description}`
        .toLowerCase()
        .includes(q);
    });
  }, [catalog, activeCategory, operatorFilter, externalSearchQuery]);

  const movistarCount = useMemo(
    () => liveChannels.filter((c) => c.operator === 'movistar').length,
    [liveChannels]
  );
  const daznCount = useMemo(
    () => liveChannels.filter((c) => c.operator === 'dazn').length,
    [liveChannels]
  );
  const seriesCount = useMemo(
    () => catalog.filter((c) => c.kind === 'series').length,
    [catalog]
  );
  const liveMatchNowCount = useMemo(
    () => liveMatches.filter((m) => m.isLive).length,
    [liveMatches]
  );

  const featuredChannelDazn = useMemo(
    () => liveChannels.find((c) => c.id === 'dazn-laliga') || liveChannels[0] || null,
    [liveChannels]
  );
  const featuredChannelMovistar = useMemo(
    () =>
      liveChannels.find((c) => c.id === 'mplus-champions') ||
      liveChannels.find((c) => c.operator === 'movistar') ||
      null,
    [liveChannels]
  );
  const featuredChannelF1 = useMemo(
    () => liveChannels.find((c) => c.id === 'dazn-f1') || null,
    [liveChannels]
  );
  const featuredMatch = useMemo(
    () => liveMatches.find((m) => m.isLive) || liveMatches[0] || null,
    [liveMatches]
  );

  const handleOpenCatalogItem = (item: MovistarDaznCatalogItemUi) => {
    triggerHaptic('light');
    if (item.kind === 'series' && item.tmdbId) {
      onOpenSeriesPage({
        id: item.id,
        tmdbId: item.tmdbId,
        mediaType: 'tv',
        title: item.title,
        year: 'HD',
        rating: '',
        overview: item.description,
        poster: item.imageUrl,
        backdrop: item.imageUrl,
        languages: ['Castellano'],
      });
      return;
    }
    setSelectedProgram(item);
  };

  if (selectedProgram) {
    return (
      <MovistarDaznProgramPanel
        lang={lang}
        program={selectedProgram}
        onBack={() => setSelectedProgram(null)}
        onPlayTdtChannel={onPlayTdtChannel}
        onPlayYouTubeVideo={onPlayYouTubeVideo}
        onPlayCustomUrl={onPlayCustomUrl}
      />
    );
  }

  return (
    <div className="w-full space-y-7 pb-8">
      {/* 1. DUAL-PLATFORM STADIUM HERO STAGE */}
      <section className="relative rounded-[24px] overflow-hidden bg-[#090B10] border border-white/[0.09]">
        <img
          src={heroStadiumImg}
          alt="Estadio nocturno DAZN y Movistar Plus+"
          className="absolute inset-0 w-full h-full object-cover opacity-50"
        />
        <div className="absolute inset-0 bg-gradient-to-r from-[#05060A] via-[#05060A]/85 to-[#05060A]/35" />
        <div className="absolute inset-0 bg-gradient-to-t from-[#05060A] via-transparent to-black/30" />

        <div className="relative z-10 p-5 sm:p-8 lg:p-10 grid grid-cols-1 lg:grid-cols-12 gap-6 items-end">
          <div className="lg:col-span-7 space-y-4">
            {/* Typographic Brand Lockup (Clean, zero pill clutter) */}
            <div className="flex flex-wrap items-center gap-3">
              <span className="font-display font-black tracking-tight text-sm sm:text-base px-2.5 py-1 rounded-md bg-[#D4FF00] text-[#06070A]">
                DAZN
              </span>
              <span className="text-zinc-500 font-light text-lg" aria-hidden="true">
                +
              </span>
              <span className="font-display font-extrabold tracking-tight text-sm sm:text-base px-2.5 py-1 rounded-md bg-[#00A9E0] text-white">
                Movistar+
              </span>
              <span className="text-xs font-medium text-zinc-300">
                LaLiga EA Sports · Champions · F1 · MotoGP · Series Originales
              </span>
            </div>

            <h1 className="font-display font-bold text-2xl sm:text-4xl lg:text-[2.65rem] text-white tracking-tight leading-[1.08] text-balance">
              Todo el deporte en directo y el universo Movistar Plus+ en 1080p
            </h1>

            <p className="text-xs sm:text-sm text-zinc-300 leading-relaxed max-w-xl">
              {featuredMatch
                ? `En parrilla hoy: ${featuredMatch.title} (${featuredMatch.competition}) por ${featuredMatch.broadcaster}. Además, 17 canales lineales con guía en tiempo real y programas completos a la carta.`
                : 'Accede a los 17 canales oficiales de DAZN España y Movistar Plus+ con guía en tiempo real, programación deportiva, motor 24/7 y series originales en Castellano.'}
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-1">
              {featuredChannelDazn && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('medium');
                    onPlayTdtChannel(
                      featuredChannelDazn.tdtChannel,
                      0,
                      featuredChannelDazn.nowTitle
                    );
                  }}
                  className="min-h-11 px-5 rounded-xl bg-[#D4FF00] hover:bg-[#E2FF4D] text-[#05060A] text-xs sm:text-sm font-extrabold inline-flex items-center gap-2 cursor-pointer transition-all active:scale-95 whitespace-nowrap"
                >
                  <Play className="w-4 h-4 fill-current" />
                  <span>Directo {featuredChannelDazn.name}</span>
                </button>
              )}

              {featuredChannelMovistar && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('medium');
                    onPlayTdtChannel(
                      featuredChannelMovistar.tdtChannel,
                      0,
                      featuredChannelMovistar.nowTitle
                    );
                  }}
                  className="min-h-11 px-5 rounded-xl bg-[#00A9E0] hover:bg-[#22B8EB] text-white text-xs sm:text-sm font-bold inline-flex items-center gap-2 cursor-pointer transition-all active:scale-95 whitespace-nowrap"
                >
                  <Radio className="w-4 h-4" />
                  <span>Directo {featuredChannelMovistar.name}</span>
                </button>
              )}

              {featuredChannelF1 && (
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onPlayTdtChannel(featuredChannelF1.tdtChannel, 0, featuredChannelF1.nowTitle);
                  }}
                  className="min-h-11 px-4 rounded-xl bg-white/[0.08] hover:bg-white/[0.15] border border-white/[0.14] text-white text-xs sm:text-sm font-semibold inline-flex items-center gap-2 cursor-pointer transition-colors whitespace-nowrap"
                >
                  <Flame className="w-4 h-4 text-[#F59E0B]" />
                  <span>DAZN F1 24/7</span>
                </button>
              )}
            </div>
          </div>

          {/* Right Quick Broadcast Showcase Cards (F1 + Arena) */}
          <div className="lg:col-span-5 grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                if (featuredChannelF1) {
                  onPlayTdtChannel(featuredChannelF1.tdtChannel, 0, featuredChannelF1.nowTitle);
                } else {
                  setActiveCategory('motor');
                }
              }}
              className="group relative aspect-video rounded-2xl overflow-hidden border border-white/[0.12] hover:border-[#D4FF00]/70 text-left cursor-pointer transition-all"
            >
              <img
                src={f1NightImg}
                alt="Motor DAZN F1 y MotoGP"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
              <div className="absolute bottom-2.5 left-3 right-3 space-y-0.5">
                <div className="text-[11px] font-semibold text-[#D4FF00]">DAZN Motor</div>
                <div className="text-xs font-bold text-white truncate">Fórmula 1 y MotoGP</div>
              </div>
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                const dep = liveChannels.find((c) => c.id === 'mplus-deportes');
                if (dep) {
                  onPlayTdtChannel(dep.tdtChannel, 0, dep.nowTitle);
                } else {
                  setActiveCategory('deportes');
                }
              }}
              className="group relative aspect-video rounded-2xl overflow-hidden border border-white/[0.12] hover:border-[#00A9E0]/70 text-left cursor-pointer transition-all"
            >
              <img
                src={basketballArenaImg}
                alt="Movistar Deportes NBA y Euroliga"
                className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent" />
              <div className="absolute bottom-2.5 left-3 right-3 space-y-0.5">
                <div className="text-[11px] font-semibold text-[#38BDF8]">Movistar Deportes</div>
                <div className="text-xs font-bold text-white truncate">NBA, ACB y Euroliga</div>
              </div>
            </button>
          </div>
        </div>
      </section>

      {/* 2. 4-COLUMN KPI SUMMARY STRIP BELOW HERO */}
      <section className="grid grid-cols-2 lg:grid-cols-4 divide-y sm:divide-y-0 sm:divide-x divide-white/[0.08] rounded-2xl bg-[#0D0D12] border border-white/[0.08]">
        <div className="px-4 py-3.5 space-y-0.5">
          <div className="text-xs text-zinc-400">Canales en directo</div>
          <div className="font-display text-lg sm:text-xl font-bold text-white tabular-nums">
            {liveChannels.length || 17} señales HD
          </div>
        </div>
        <div className="px-4 py-3.5 space-y-0.5">
          <div className="text-xs text-zinc-400">Movistar Plus+</div>
          <div className="font-display text-lg sm:text-xl font-bold text-[#38BDF8] tabular-nums">
            {movistarCount || 10} canales M+
          </div>
        </div>
        <div className="px-4 py-3.5 space-y-0.5">
          <div className="text-xs text-zinc-400">DAZN España</div>
          <div className="font-display text-lg sm:text-xl font-bold text-[#D4FF00] tabular-nums">
            {daznCount || 7} señales DAZN
          </div>
        </div>
        <div className="px-4 py-3.5 space-y-0.5">
          <div className="text-xs text-zinc-400">A la carta y partidos</div>
          <div className="font-display text-lg sm:text-xl font-bold text-white tabular-nums">
            {seriesCount || 10} series · {liveMatchNowCount > 0 ? `${liveMatchNowCount} en vivo` : `${liveMatches.length} hoy`}
          </div>
        </div>
      </section>

      {/* ERROR BANNER */}
      {loadError && liveChannels.length === 0 && (
        <div className="rounded-[24px] bg-[#0D0D12] border border-red-500/30 p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <h2 className="text-sm font-bold text-white">No pudimos cargar DAZN &amp; Movistar+</h2>
              <p className="text-xs text-zinc-400">{loadError}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => void fetchHome()}
            className="min-h-11 px-4 rounded-xl bg-[#00A9E0] hover:bg-[#22B8EB] text-white text-xs font-bold inline-flex items-center gap-2 cursor-pointer shrink-0"
          >
            <RefreshCw className="w-4 h-4" />
            <span>Reintentar</span>
          </button>
        </div>
      )}

      {/* 3. AGENDA DE PARTIDOS EN DIRECTO Y HOY (DAZN & MOVISTAR+) */}
      {filteredMatches.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display font-bold text-base sm:text-lg text-white tracking-tight flex items-center gap-2">
              <Trophy className="w-4 h-4 text-[#D4FF00]" />
              <span>Agenda de Partidos · DAZN y Movistar+</span>
            </h2>
            <span className="text-xs text-zinc-400 tabular-nums">
              {filteredMatches.length} encuentros destacados
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-3.5">
            {filteredMatches.map((m) => {
              const isDaznMatch = m.operator === 'dazn';
              return (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('medium');
                    onPlaySportsMatch(
                      {
                        id: m.id,
                        title: m.title,
                        competition: m.competition,
                        sport: m.sport,
                        time: m.time,
                        isLive: m.isLive,
                        channels: m.channels,
                        matchMeta: m.matchMeta,
                      },
                      0
                    );
                  }}
                  className="group rounded-2xl bg-[#0D0D12] hover:bg-[#14141C] border border-white/[0.08] hover:border-[#00A9E0]/60 p-4 text-left flex flex-col justify-between gap-3 cursor-pointer transition-all"
                >
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-zinc-400 truncate">{m.competition}</span>
                    {m.isLive ? (
                      <span className="inline-flex items-center gap-1.5 font-bold text-[#EF4444] tabular-nums shrink-0">
                        <span className="relative flex h-2 w-2">
                          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#EF4444] opacity-75" />
                          <span className="relative inline-flex rounded-full h-2 w-2 bg-[#EF4444]" />
                        </span>
                        <span>{m.matchMeta.statusLabel || 'En vivo'}</span>
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-zinc-300 font-semibold tabular-nums shrink-0">
                        <Calendar className="w-3.5 h-3.5 text-zinc-400" />
                        <span>{m.time}</span>
                      </span>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {m.matchMeta.homeLogo && !failedImgs[`hm-${m.id}`] && (
                          <img
                            src={m.matchMeta.homeLogo}
                            alt={m.matchMeta.homeTeam}
                            referrerPolicy="no-referrer"
                            onError={() => setFailedImgs((p) => ({ ...p, [`hm-${m.id}`]: true }))}
                            className="w-5 h-5 object-contain shrink-0"
                          />
                        )}
                        <span className="text-sm font-bold text-white truncate">
                          {m.matchMeta.homeTeam}
                        </span>
                      </div>
                      <span className="font-mono text-sm font-bold text-white tabular-nums shrink-0">
                        {m.matchMeta.homeScore !== '-' ? m.matchMeta.homeScore : ''}
                      </span>
                    </div>

                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        {m.matchMeta.awayLogo && !failedImgs[`aw-${m.id}`] && (
                          <img
                            src={m.matchMeta.awayLogo}
                            alt={m.matchMeta.awayTeam}
                            referrerPolicy="no-referrer"
                            onError={() => setFailedImgs((p) => ({ ...p, [`aw-${m.id}`]: true }))}
                            className="w-5 h-5 object-contain shrink-0"
                          />
                        )}
                        <span className="text-sm font-bold text-white truncate">
                          {m.matchMeta.awayTeam}
                        </span>
                      </div>
                      <span className="font-mono text-sm font-bold text-white tabular-nums shrink-0">
                        {m.matchMeta.awayScore !== '-' ? m.matchMeta.awayScore : ''}
                      </span>
                    </div>
                  </div>

                  <div className="pt-2 border-t border-white/[0.06] flex items-center justify-between gap-2 text-xs">
                    <span
                      className={`font-semibold truncate ${
                        isDaznMatch ? 'text-[#D4FF00]' : 'text-[#38BDF8]'
                      }`}
                    >
                      {m.broadcaster}
                    </span>
                    <span className="inline-flex items-center gap-1 text-zinc-300 group-hover:text-white font-semibold shrink-0">
                      <Play className="w-3.5 h-3.5 fill-current" />
                      <span>Ver</span>
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {/* 4. PARRILLA DUAL DE CANALES EN DIRECTO (17 SEÑALES HD) */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-0.5">
            <h2 className="font-display font-bold text-base sm:text-lg text-white tracking-tight flex items-center gap-2">
              <Tv className="w-4 h-4 text-[#00A9E0]" />
              <span>Canales en Directo DAZN y Movistar Plus+</span>
            </h2>
            <p className="text-xs text-zinc-400">
              Parrilla EPG en tiempo real y respaldo multi-señal en 1080p HD
            </p>
          </div>

          <div className="flex items-center gap-1 p-1 rounded-xl bg-[#0D0D12] border border-white/[0.08] self-start sm:self-auto">
            {(
              [
                { id: 'all', label: `Todos (${liveChannels.length || 17})` },
                { id: 'movistar', label: `Movistar+ (${movistarCount || 10})` },
                { id: 'dazn', label: `DAZN (${daznCount || 7})` },
              ] as const
            ).map((op) => (
              <button
                key={op.id}
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setOperatorFilter(op.id);
                }}
                className={`min-h-9 px-3 rounded-lg text-xs font-semibold whitespace-nowrap cursor-pointer transition-colors tabular-nums ${
                  operatorFilter === op.id
                    ? op.id === 'dazn'
                      ? 'bg-[#D4FF00] text-[#05060A]'
                      : 'bg-[#00A9E0] text-white'
                    : 'text-zinc-400 hover:text-white'
                }`}
              >
                {op.label}
              </button>
            ))}
          </div>
        </div>

        {loading && liveChannels.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {Array.from({ length: 9 }).map((_, idx) => (
              <div
                key={idx}
                className="h-36 rounded-2xl bg-[#0D0D12] border border-white/[0.06] animate-pulse"
              />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredChannels.map((ch) => {
              const isDazn = ch.operator === 'dazn';
              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onPlayTdtChannel(ch.tdtChannel, 0, ch.nowTitle);
                  }}
                  className={`group relative rounded-2xl bg-[#0D0D12] hover:bg-[#14141C] border border-white/[0.08] ${
                    isDazn ? 'hover:border-[#D4FF00]/65' : 'hover:border-[#00A9E0]/65'
                  } p-4 text-left overflow-hidden cursor-pointer transition-all flex flex-col justify-between gap-3`}
                >
                  {ch.programArtwork && !failedImgs[`art-${ch.id}`] && (
                    <img
                      src={ch.programArtwork}
                      alt={ch.nowTitle}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={() =>
                        setFailedImgs((prev) => ({ ...prev, [`art-${ch.id}`]: true }))
                      }
                      className="absolute inset-0 w-full h-full object-cover opacity-15 group-hover:opacity-25 transition-opacity"
                    />
                  )}
                  <div className="absolute inset-0 bg-gradient-to-r from-[#0D0D12] via-[#0D0D12]/92 to-transparent" />

                  <div className="relative z-10 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-11 h-11 rounded-xl bg-black/75 border border-white/[0.1] flex items-center justify-center p-1.5 shrink-0">
                        {ch.logoUrl && !failedImgs[`logo-${ch.id}`] ? (
                          <img
                            src={ch.logoUrl}
                            alt={ch.name}
                            referrerPolicy="no-referrer"
                            onError={() =>
                              setFailedImgs((prev) => ({ ...prev, [`logo-${ch.id}`]: true }))
                            }
                            className="w-full h-full object-contain"
                          />
                        ) : (
                          <span className="text-[11px] font-bold text-white">{ch.shortMark}</span>
                        )}
                      </div>
                      <div className="min-w-0">
                        <div
                          className={`text-xs font-medium tabular-nums truncate ${
                            isDazn ? 'text-[#D4FF00]' : 'text-[#38BDF8]'
                          }`}
                        >
                          {isDazn ? 'DAZN' : 'Movistar+'} · Dial {ch.dial} · {ch.signalCount}{' '}
                          {ch.signalCount === 1 ? 'señal' : 'señales'}
                        </div>
                        <h3 className="text-sm sm:text-base font-bold text-white truncate">
                          {ch.name}
                        </h3>
                      </div>
                    </div>

                    <span
                      className={`w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-colors ${
                        isDazn
                          ? 'bg-[#D4FF00]/15 group-hover:bg-[#D4FF00] text-[#D4FF00] group-hover:text-[#05060A]'
                          : 'bg-[#00A9E0]/15 group-hover:bg-[#00A9E0] text-[#38BDF8] group-hover:text-white'
                      }`}
                    >
                      <Play className="w-4 h-4 fill-current ml-0.5" />
                    </span>
                  </div>

                  <div className="relative z-10 space-y-1.5">
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-zinc-100 truncate">{ch.nowTitle}</span>
                      {ch.startLabel && ch.stopLabel && (
                        <span className="text-[11px] text-zinc-400 tabular-nums shrink-0">
                          {ch.startLabel} – {ch.stopLabel}
                        </span>
                      )}
                    </div>
                    {ch.nextTitle && (
                      <p className="text-[11px] text-zinc-400 truncate">
                        A continuación: {ch.nextTitle}
                      </p>
                    )}
                    <div className="h-1 w-full rounded-full bg-white/[0.08] overflow-hidden">
                      <div
                        className={`h-full rounded-full transition-all ${
                          isDazn ? 'bg-[#D4FF00]' : 'bg-[#00A9E0]'
                        }`}
                        style={{ width: `${Math.max(10, ch.progressPct || 38)}%` }}
                      />
                    </div>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </section>

      {/* 5. PROGRAMAS, DOCUMENTALES Y SERIES ORIGINALES MOVISTAR+ */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2 overflow-x-auto no-scrollbar pb-1">
            {CATEGORY_TABS.map((tab) => {
              const isActive = activeCategory === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setActiveCategory(tab.id);
                  }}
                  className={`min-h-11 px-4 rounded-xl text-xs sm:text-sm font-semibold whitespace-nowrap cursor-pointer transition-all shrink-0 ${
                    isActive
                      ? 'bg-[#00A9E0] text-white'
                      : 'bg-[#0D0D12] text-zinc-300 hover:text-white border border-white/[0.08] hover:bg-white/[0.06]'
                  }`}
                >
                  {pickLang(lang, {
                    es: tab.labelEs,
                    ca: tab.labelCa,
                    en: tab.labelEn,
                  })}
                </button>
              );
            })}
          </div>

          <span className="text-xs text-zinc-400 tabular-nums shrink-0">
            {filteredCatalog.length}{' '}
            {filteredCatalog.length === 1 ? 'formato o serie' : 'formatos y series'}
          </span>
        </div>

        {loading && catalog.length === 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, idx) => (
              <div
                key={idx}
                className="aspect-video rounded-2xl bg-[#0D0D12] border border-white/[0.06] animate-pulse"
              />
            ))}
          </div>
        ) : filteredCatalog.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {filteredCatalog.map((item) => {
              const fallbackArt = resolveThemeArtwork(item.themeKey);
              const imgSrc =
                item.imageUrl && !failedImgs[item.id] ? item.imageUrl : fallbackArt;
              const isDazn = item.operator === 'dazn';
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => handleOpenCatalogItem(item)}
                  className={`group text-left rounded-2xl bg-[#0D0D12] hover:bg-[#14141C] border border-white/[0.08] ${
                    isDazn ? 'hover:border-[#D4FF00]/60' : 'hover:border-[#00A9E0]/60'
                  } overflow-hidden cursor-pointer transition-all flex flex-col`}
                >
                  <div className="relative aspect-video w-full bg-[#14141C] overflow-hidden">
                    <img
                      src={imgSrc}
                      alt={item.title}
                      loading="lazy"
                      referrerPolicy="no-referrer"
                      onError={() =>
                        setFailedImgs((prev) => ({ ...prev, [item.id]: true }))
                      }
                      className="w-full h-full object-cover group-hover:scale-[1.03] transition-transform duration-300"
                    />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/88 via-black/25 to-transparent" />

                    <div className="absolute bottom-2.5 left-3 right-3 flex items-end justify-between gap-2">
                      <span
                        className={`text-[11px] font-semibold truncate ${
                          isDazn ? 'text-[#D4FF00]' : 'text-[#7DD3FC]'
                        }`}
                      >
                        {item.channelName} · {item.genre}
                      </span>
                      <span
                        className={`w-8 h-8 rounded-full bg-black/75 text-white flex items-center justify-center shrink-0 transition-colors ${
                          isDazn
                            ? 'group-hover:bg-[#D4FF00] group-hover:text-[#05060A]'
                            : 'group-hover:bg-[#00A9E0]'
                        }`}
                      >
                        {item.kind === 'series' ? (
                          <Film className="w-3.5 h-3.5" />
                        ) : (
                          <ChevronRight className="w-4 h-4" />
                        )}
                      </span>
                    </div>
                  </div>

                  <div className="p-3.5 space-y-1 flex-1 flex flex-col justify-between">
                    <h3
                      className={`text-sm sm:text-[15px] font-bold text-white line-clamp-1 transition-colors ${
                        isDazn
                          ? 'group-hover:text-[#D4FF00]'
                          : 'group-hover:text-[#38BDF8]'
                      }`}
                    >
                      {item.title}
                    </h3>
                    <p className="text-xs text-zinc-400 line-clamp-2 leading-relaxed">
                      {item.claim || item.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="rounded-2xl bg-[#0D0D12] border border-white/[0.08] p-8 text-center space-y-2">
            <p className="text-sm font-semibold text-white">
              No encontramos programas o canales con «{externalSearchQuery}»
            </p>
            <p className="text-xs text-zinc-400">
              Prueba buscando DAZN F1, El Día Después, La Resistencia, Informe Plus, Champions o Antidisturbios.
            </p>
          </div>
        )}
      </section>
    </div>
  );
};
