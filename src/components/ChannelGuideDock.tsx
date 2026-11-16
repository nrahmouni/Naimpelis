import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  CalendarClock,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  Clock,
  Layers,
  Loader2,
  Play,
  Radio,
  RefreshCw,
  Search,
  Sparkles,
  Tv,
  X,
} from 'lucide-react';
import type {
  AppLanguage,
  ChannelLiveEpg,
  EpgProgramItem,
  SpanishTdtChannel,
  TdtCategory,
} from '../types';
import { pickLang } from '../utils/i18n';
import { triggerHaptic } from '../utils/haptics';
import {
  ChannelLogoBadge,
  getChannelRegionMeta,
  type TvRegionId,
} from './ui/ChannelLogoBadge';

interface ChannelGuideDockProps {
  lang: AppLanguage;
  activeChannelTitle: string;
  activeChannelSubtitle?: string;
  activeRawSourceUrl?: string;
  channels: SpanishTdtChannel[];
  loadingItemId?: string | null;
  onSelectChannel: (channel: SpanishTdtChannel, liveProgramHint?: string) => void;
}

type GuideViewTab = 'channel' | 'all';

const REGION_FILTER_TABS: { id: TvRegionId; label: { es: string; ca: string; en: string } }[] = [
  { id: 'all', label: { es: 'Todos', ca: 'Tots', en: 'All' } },
  { id: 'es', label: { es: '🇪🇸 España', ca: '🇪🇸 Espanya', en: '🇪🇸 Spain' } },
  { id: 'latam', label: { es: '🌎 Latam / ES', ca: '🌎 Latam / ES', en: '🌎 Latam / ES' } },
  { id: 'uk', label: { es: '🇬🇧 UK (EN)', ca: '🇬🇧 UK (EN)', en: '🇬🇧 UK (EN)' } },
  { id: 'cn', label: { es: '🇨🇳 China (中文)', ca: '🇨🇳 Xina (中文)', en: '🇨🇳 China (中文)' } },
];

const CATEGORY_FILTER_ORDER: { id: 'all' | TdtCategory; label: { es: string; ca: string; en: string } }[] = [
  { id: 'all', label: { es: 'Todos', ca: 'Tots', en: 'All' } },
  { id: 'generalistas', label: { es: 'Generalistas', ca: 'Generalistes', en: 'Main TV' } },
  { id: 'cine_series', label: { es: 'Cine y Series', ca: 'Cinema i Sèries', en: 'Movies & Series' } },
  { id: 'entretenimiento', label: { es: 'Entretenimiento', ca: 'Entreteniment', en: 'Entertainment' } },
  { id: 'noticias_deportes', label: { es: 'Noticias y Deporte', ca: 'Notícies i Esports', en: 'News & Sports' } },
  { id: 'movistar', label: { es: 'Movistar+', ca: 'Movistar+', en: 'Movistar+' } },
  { id: 'dazn', label: { es: 'DAZN', ca: 'DAZN', en: 'DAZN' } },
  { id: 'espn', label: { es: 'ESPN', ca: 'ESPN', en: 'ESPN' } },
  { id: 'dsports', label: { es: 'DSports', ca: 'DSports', en: 'DSports' } },
  { id: 'beinsports', label: { es: 'beIN', ca: 'beIN', en: 'beIN' } },
  { id: 'uk_sports', label: { es: 'UK Sports', ca: 'UK Sports', en: 'UK Sports' } },
  { id: 'infantil_autonomicas', label: { es: 'Infantil / Auton.', ca: 'Infantil / Auton.', en: 'Kids / Regional' } },
];

function computeLiveProgramSnapshot(
  raw: ChannelLiveEpg | undefined,
  clockMs: number
): ChannelLiveEpg | null {
  if (!raw) return null;
  const schedule: EpgProgramItem[] =
    Array.isArray(raw.upcoming) && raw.upcoming.length > 0
      ? raw.upcoming
      : ([raw.now, raw.next].filter(Boolean) as EpgProgramItem[]);
  if (schedule.length === 0) return raw;

  const activeIdx = schedule.findIndex((p) => p.startMs <= clockMs && p.stopMs > clockMs);
  if (activeIdx === -1) {
    const nextUpcoming = schedule.find((p) => p.startMs > clockMs) || null;
    return {
      ...raw,
      now: raw.now && raw.now.stopMs > clockMs ? raw.now : null,
      next: nextUpcoming,
      upcoming: schedule.filter((p) => p.stopMs > clockMs),
    };
  }

  const nowProg = schedule[activeIdx];
  const nextProg = schedule[activeIdx + 1] || null;
  const duration = Math.max(60_000, nowProg.stopMs - nowProg.startMs);
  const elapsed = Math.max(0, Math.min(duration, clockMs - nowProg.startMs));
  const progressPct = Math.max(2, Math.min(100, Math.round((elapsed / duration) * 100)));
  const remainingMin = Math.max(1, Math.ceil((nowProg.stopMs - clockMs) / 60_000));

  return {
    channelId: raw.channelId,
    now: nowProg,
    next: nextProg,
    progressPct,
    remainingMin,
    upcoming: schedule.filter((p) => p.stopMs > clockMs),
  };
}

function resolveChannelMatch(
  channels: SpanishTdtChannel[],
  title: string,
  rawUrl?: string,
  subtitle?: string
): SpanishTdtChannel | null {
  if (channels.length === 0) return null;
  if (rawUrl) {
    const byUrl = channels.find((ch) =>
      ch.channels.some((sig) => sig.sourceUrl === rawUrl)
    );
    if (byUrl) return byUrl;
  }

  const norm = (val: string) =>
    val
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .trim();

  const targetTitle = norm(title || '');
  if (targetTitle) {
    const exact = channels.find((ch) => norm(ch.name) === targetTitle);
    if (exact) return exact;
    const partial = channels.find(
      (ch) =>
        targetTitle.includes(norm(ch.name)) ||
        norm(ch.name).includes(targetTitle)
    );
    if (partial) return partial;
  }

  if (subtitle) {
    const subNorm = norm(subtitle);
    const bySub = channels.find((ch) => subNorm.includes(norm(ch.name)));
    if (bySub) return bySub;
  }

  return null;
}

function cleanEpgDescription(desc?: string): string {
  if (!desc) return '';
  return desc.replace(/^\([^)]+\)\s*/, '').trim();
}

export const ChannelGuideDock: React.FC<ChannelGuideDockProps> = ({
  lang,
  activeChannelTitle,
  activeChannelSubtitle,
  activeRawSourceUrl,
  channels,
  loadingItemId,
  onSelectChannel,
}) => {
  const [fallbackChannels, setFallbackChannels] = useState<SpanishTdtChannel[]>([]);
  const [epgMap, setEpgMap] = useState<Record<string, ChannelLiveEpg>>({});
  const [loadingEpg, setLoadingEpg] = useState(false);
  const [clockMs, setClockMs] = useState(() => Date.now());
  const [madridClockLabel, setMadridClockLabel] = useState<string>('');
  const [collapsed, setCollapsed] = useState(false);

  const [activeTab, setActiveTab] = useState<GuideViewTab>('channel');
  const [inspectedChannelId, setInspectedChannelId] = useState<string | null>(null);
  const [expandedProgKey, setExpandedProgKey] = useState<string | null>(null);
  const [spotlightDescExpanded, setSpotlightDescExpanded] = useState(false);

  const [guideSearch, setGuideSearch] = useState('');
  const [guideRegion, setGuideRegion] = useState<TvRegionId>('all');
  const [guideCategory, setGuideCategory] = useState<'all' | TdtCategory>('all');

  const carouselRef = useRef<HTMLDivElement | null>(null);

  const allChannels = useMemo(
    () => (channels.length > 0 ? channels : fallbackChannels),
    [channels, fallbackChannels]
  );

  // Self-load channels only if parent pool wasn't populated yet
  useEffect(() => {
    if (channels.length > 0 || fallbackChannels.length > 0) return;
    let cancelled = false;
    fetch('/api/catalog/tdt')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (!cancelled && Array.isArray(data?.channels)) {
          setFallbackChannels(data.channels as SpanishTdtChannel[]);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [channels.length, fallbackChannels.length]);

  const fetchLiveEpg = useCallback(async (forceRefresh = false) => {
    setLoadingEpg(true);
    try {
      const res = await fetch(forceRefresh ? '/api/epg/live?refresh=1' : '/api/epg/live');
      const data = await res.json();
      if (data?.epg && typeof data.epg === 'object') {
        setEpgMap(data.epg as Record<string, ChannelLiveEpg>);
      }
      if (typeof data?.madridTimeLabel === 'string') {
        setMadridClockLabel(data.madridTimeLabel);
      }
      setClockMs(Date.now());
    } catch {
      // keep previous snapshot
    } finally {
      setLoadingEpg(false);
    }
  }, []);

  useEffect(() => {
    void fetchLiveEpg(false);
    const refreshId = window.setInterval(() => {
      void fetchLiveEpg(false);
    }, 180_000);
    return () => window.clearInterval(refreshId);
  }, [fetchLiveEpg]);

  // Tick local clock every 30s so progress bars and remaining minutes advance live
  useEffect(() => {
    const tick = window.setInterval(() => {
      const now = Date.now();
      setClockMs(now);
      try {
        setMadridClockLabel(
          new Intl.DateTimeFormat('es-ES', {
            timeZone: 'Europe/Madrid',
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
          }).format(new Date(now))
        );
      } catch {
        // fallback ignored
      }
    }, 30_000);
    return () => window.clearInterval(tick);
  }, []);

  const playingChannel = useMemo(
    () => resolveChannelMatch(allChannels, activeChannelTitle, activeRawSourceUrl, activeChannelSubtitle),
    [allChannels, activeChannelTitle, activeRawSourceUrl, activeChannelSubtitle]
  );

  // Sync inspected channel back to the currently playing channel whenever user switches stream
  useEffect(() => {
    setInspectedChannelId(playingChannel?.id || null);
    setSpotlightDescExpanded(false);
    setExpandedProgKey(null);
  }, [playingChannel?.id, activeChannelTitle]);

  const inspectedChannel = useMemo(() => {
    if (inspectedChannelId) {
      const found = allChannels.find((c) => c.id === inspectedChannelId);
      if (found) return found;
    }
    return playingChannel;
  }, [allChannels, inspectedChannelId, playingChannel]);

  const isPreviewingOtherChannel =
    Boolean(inspectedChannel && playingChannel && inspectedChannel.id !== playingChannel.id);

  const inspectedEpg = useMemo(
    () => (inspectedChannel ? computeLiveProgramSnapshot(epgMap[inspectedChannel.id], clockMs) : null),
    [epgMap, inspectedChannel, clockMs]
  );

  // Intelligent ranking of similar channels for the horizontal carousel
  const similarChannels = useMemo(() => {
    const base = playingChannel || inspectedChannel;
    if (allChannels.length === 0) return [];

    const scored = allChannels
      .filter((ch) => !base || ch.id !== base.id)
      .map((ch, idx) => {
        let score = 0;
        const hasLiveEpg = Boolean(epgMap[ch.id]?.now);
        if (base) {
          if (ch.category === base.category) score += 100;
          if (ch.network === base.network) score += 55;
          if (Math.abs((ch.dial || 0) - (base.dial || 0)) <= 6) score += 18;
          // Cross-pollinate related sports or entertainment categories
          if (
            (base.category === 'movistar' || base.category === 'dazn') &&
            (ch.category === 'movistar' || ch.category === 'dazn' || ch.id === 'tdt-teledeporte')
          ) {
            score += 42;
          }
          if (
            (base.category === 'generalistas' || base.category === 'entretenimiento') &&
            (ch.category === 'generalistas' || ch.category === 'cine_series')
          ) {
            score += 24;
          }
        } else {
          if (ch.category === 'generalistas') score += 60;
        }
        if (hasLiveEpg) score += 28;
        return { ch, score, idx };
      })
      .sort((a, b) => b.score - a.score || a.idx - b.idx);

    return scored.slice(0, 18).map((item) => item.ch);
  }, [allChannels, playingChannel, inspectedChannel, epgMap]);

  // Available categories dynamically filtered to categories matching active region & channels
  const visibleCategories = useMemo(() => {
    const scoped =
      guideRegion === 'all'
        ? allChannels
        : allChannels.filter((c) => getChannelRegionMeta(c).region === guideRegion);
    const present = new Set(scoped.map((c) => c.category));
    return CATEGORY_FILTER_ORDER.filter((cat) => cat.id === 'all' || present.has(cat.id));
  }, [allChannels, guideRegion]);

  // All-channels navigable EPG filter (region + category + live/next program search)
  const filteredGuideChannels = useMemo(() => {
    const q = guideSearch.trim().toLowerCase();
    return allChannels.filter((ch) => {
      if (guideRegion !== 'all' && getChannelRegionMeta(ch).region !== guideRegion) return false;
      if (guideCategory !== 'all' && ch.category !== guideCategory) return false;
      if (!q) return true;
      const snap = computeLiveProgramSnapshot(epgMap[ch.id], clockMs);
      const haystack = [
        ch.name,
        ch.network,
        ch.shortMark,
        ch.description,
        snap?.now?.title || '',
        snap?.now?.category || '',
        snap?.next?.title || '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [allChannels, guideRegion, guideCategory, guideSearch, epgMap, clockMs]);

  const scrollCarouselBy = (direction: -1 | 1) => {
    const el = carouselRef.current;
    if (!el) return;
    triggerHaptic('light');
    const step = Math.max(260, Math.round(el.clientWidth * 0.78));
    el.scrollBy({ left: direction * step, behavior: 'smooth' });
  };

  const handleZap = (ch: SpanishTdtChannel) => {
    triggerHaptic('medium');
    const liveSnap = computeLiveProgramSnapshot(epgMap[ch.id], clockMs);
    onSelectChannel(ch, liveSnap?.now?.title);
  };

  const activeNow = inspectedEpg?.now || null;
  const activeNext = inspectedEpg?.next || null;
  const upcomingList = inspectedEpg?.upcoming || [];
  const headerChannel = inspectedChannel || playingChannel;

  return (
    <div className="space-y-4 w-full overflow-x-hidden">
      {/* ==================================================================== */}
      {/* 1. PREMIUM NAVIGABLE CHANNEL GUIDE DOCK (EPG)                        */}
      {/* ==================================================================== */}
      <section
        aria-label={pickLang(lang, {
          es: 'Guía del canal y programación',
          ca: 'Guia del canal i programació',
          en: 'Channel Guide & TV Schedule',
        })}
        className="rounded-2xl bg-[#111218]/95 border border-white/[0.08] overflow-hidden shadow-[0_16px_42px_rgba(0,0,0,0.55)]"
      >
        {/* Dock Header */}
        <div className="px-3.5 py-2.5 flex items-center justify-between gap-2 border-b border-white/[0.06] bg-white/[0.015]">
          <div className="flex items-center gap-2.5 min-w-0">
            {headerChannel ? (
              <ChannelLogoBadge channel={headerChannel} size="sm" showLangTag />
            ) : (
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-[#9146FF]/20 border border-[#9146FF]/40 shrink-0">
                <Tv className="w-4 h-4 text-[#BF94FF]" />
              </div>
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 min-w-0">
                <h3 className="font-display font-bold text-xs sm:text-sm text-white truncate">
                  {pickLang(lang, {
                    es: 'Guía TV en directo',
                    ca: 'Guia TV en directe',
                    en: 'Live TV Guide',
                  })}
                </h3>
                {headerChannel && (
                  <span className="hidden xs:inline-flex items-center px-1.5 py-0.5 rounded-md bg-white/[0.06] text-[10px] font-mono font-bold text-zinc-300 tabular-nums shrink-0">
                    Dial {headerChannel.dial}
                  </span>
                )}
              </div>
              <p className="text-[11px] text-zinc-400 truncate">
                {headerChannel
                  ? `${headerChannel.name} · ${headerChannel.network}`
                  : activeChannelTitle}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {madridClockLabel && (
              <span className="hidden sm:inline-flex items-center gap-1 px-2.5 py-1 rounded-xl bg-white/[0.05] border border-white/[0.07] text-[11px] font-mono font-semibold text-zinc-300 tabular-nums">
                <Clock className="w-3 h-3 text-[#BF94FF]" />
                {madridClockLabel}
              </span>
            )}

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                void fetchLiveEpg(true);
              }}
              aria-label={pickLang(lang, {
                es: 'Actualizar guía TV',
                ca: 'Actualitzar guia TV',
                en: 'Refresh TV guide',
              })}
              className="w-8 h-8 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-zinc-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loadingEpg ? 'animate-spin text-[#BF94FF]' : ''}`} />
            </button>

            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                setCollapsed((v) => !v);
              }}
              aria-label={
                collapsed
                  ? pickLang(lang, { es: 'Mostrar guía', ca: 'Mostrar guia', en: 'Show guide' })
                  : pickLang(lang, { es: 'Ocultar guía', ca: 'Amagar guia', en: 'Hide guide' })
              }
              className="w-8 h-8 rounded-xl bg-white/[0.05] hover:bg-white/[0.1] border border-white/[0.08] text-zinc-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
            >
              {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {!collapsed && (
          <div className="p-3.5 sm:p-4 space-y-4">
            {/* Previewing-another-channel bar (when peeking at a different channel's schedule) */}
            {isPreviewingOtherChannel && inspectedChannel && (
              <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[#9146FF]/15 border border-[#9146FF]/40">
                <div className="text-xs text-zinc-200 min-w-0">
                  {pickLang(lang, {
                    es: 'Consultando programación de',
                    ca: 'Consultant programació de',
                    en: 'Viewing schedule for',
                  })}{' '}
                  <strong className="text-white">{inspectedChannel.name}</strong>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  {playingChannel && (
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        setInspectedChannelId(playingChannel.id);
                      }}
                      className="min-h-8 px-2.5 rounded-lg bg-white/[0.07] hover:bg-white/[0.12] text-[11px] font-semibold text-zinc-200 cursor-pointer"
                    >
                      {pickLang(lang, {
                        es: 'Volver al canal actual',
                        ca: 'Tornar al canal actual',
                        en: 'Back to current',
                      })}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => handleZap(inspectedChannel)}
                    className="min-h-8 px-3 rounded-lg bg-[#9146FF] hover:bg-[#7C2AE8] text-white text-[11px] font-bold flex items-center gap-1 cursor-pointer"
                  >
                    <Play className="w-3 h-3 fill-current" />
                    <span>
                      {pickLang(lang, { es: 'Ver ahora', ca: 'Veure ara', en: 'Watch now' })}
                    </span>
                  </button>
                </div>
              </div>
            )}

            {/* Top Tab Switcher: Parrilla del canal vs Todos los canales */}
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="inline-flex items-center p-1 rounded-xl bg-[#0A0B10] border border-white/[0.07] gap-1">
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setActiveTab('channel');
                  }}
                  className={`min-h-9 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                    activeTab === 'channel'
                      ? 'bg-[#9146FF] text-white shadow-[0_4px_14px_rgba(145,70,255,0.4)]'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <CalendarClock className="w-3.5 h-3.5" />
                  <span>
                    {pickLang(lang, {
                      es: 'Parrilla del canal',
                      ca: 'Graella del canal',
                      en: 'Channel Schedule',
                    })}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setActiveTab('all');
                  }}
                  className={`min-h-9 px-3 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-all ${
                    activeTab === 'all'
                      ? 'bg-[#9146FF] text-white shadow-[0_4px_14px_rgba(145,70,255,0.4)]'
                      : 'text-zinc-400 hover:text-white'
                  }`}
                >
                  <Layers className="w-3.5 h-3.5" />
                  <span>
                    {pickLang(lang, {
                      es: `Todos los canales (${allChannels.length})`,
                      ca: `Tots els canals (${allChannels.length})`,
                      en: `All Channels (${allChannels.length})`,
                    })}
                  </span>
                </button>
              </div>

              {upcomingList.length > 0 && activeTab === 'channel' && (
                <span className="text-[11px] font-medium text-zinc-400 tabular-nums">
                  {upcomingList.length}{' '}
                  {pickLang(lang, {
                    es: 'programas hoy',
                    ca: 'programes avui',
                    en: 'programs today',
                  })}
                </span>
              )}
            </div>

            {activeTab === 'channel' ? (
              <div className="space-y-4">
                {/* Active / Inspected Channel Now + Next Spotlight */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
                  {/* NOW PLAYING HERO CARD (2 cols on desktop) */}
                  <div className="lg:col-span-2 rounded-2xl bg-[#161822]/90 border border-white/[0.08] p-3.5 sm:p-4 flex flex-col sm:flex-row gap-3.5 relative overflow-hidden">
                    <div
                      aria-hidden="true"
                      className="pointer-events-none absolute -top-12 -right-12 w-44 h-44 rounded-full blur-3xl opacity-25"
                      style={{
                        backgroundColor: headerChannel?.brandTone || '#9146FF',
                      }}
                    />

                    {/* Thumbnail / Brand Tile */}
                    <div className="relative w-full sm:w-36 aspect-video sm:aspect-[4/3] rounded-xl overflow-hidden bg-[#0B0C12] border border-white/[0.08] shrink-0 flex items-center justify-center">
                      {activeNow?.icon ? (
                        <img
                          src={activeNow.icon}
                          alt={activeNow.title}
                          referrerPolicy="no-referrer"
                          className="w-full h-full object-cover"
                          onError={(e) => {
                            e.currentTarget.style.display = 'none';
                          }}
                        />
                      ) : null}
                      <div
                        className="absolute inset-0 flex flex-col items-center justify-center p-2 text-center pointer-events-none"
                        style={{
                          opacity: activeNow?.icon ? 0.16 : 1,
                          background: headerChannel?.brandTone
                            ? `radial-gradient(circle at 50% 35%, ${headerChannel.brandTone}35, rgba(11,12,18,0.95) 80%)`
                            : undefined,
                        }}
                      >
                        <span className="font-display font-black text-2xl text-white tracking-tight">
                          {headerChannel?.shortMark || 'TV'}
                        </span>
                        <span className="text-[10px] font-semibold text-zinc-400 mt-0.5 truncate max-w-full">
                          {headerChannel?.network || ''}
                        </span>
                      </div>

                      <span className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[#EB0400] text-white text-[10px] font-extrabold tracking-wide shadow">
                        <span className="w-1.5 h-1.5 rounded-full bg-white animate-pulse" />
                        {pickLang(lang, { es: 'AHORA', ca: 'ARA', en: 'LIVE' })}
                      </span>
                    </div>

                    {/* Program Info + Progress */}
                    <div className="relative z-10 flex-1 min-w-0 flex flex-col justify-between gap-2.5">
                      <div className="space-y-1.5">
                        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                          {activeNow ? (
                            <>
                              <span className="font-mono font-bold text-[#BF94FF] tabular-nums">
                                {activeNow.startLabel} — {activeNow.stopLabel}
                              </span>
                              <span className="px-2 py-0.5 rounded-md bg-[#9146FF]/20 border border-[#9146FF]/35 text-[#E9D5FF] font-semibold tabular-nums">
                                {pickLang(lang, {
                                  es: `Quedan ${inspectedEpg?.remainingMin || 1} min`,
                                  ca: `Queden ${inspectedEpg?.remainingMin || 1} min`,
                                  en: `${inspectedEpg?.remainingMin || 1}m left`,
                                })}
                              </span>
                              {activeNow.category && (
                                <span className="px-2 py-0.5 rounded-md bg-white/[0.06] text-zinc-300 font-medium">
                                  {activeNow.category}
                                </span>
                              )}
                            </>
                          ) : (
                            <span className="px-2 py-0.5 rounded-md bg-white/[0.06] text-zinc-300 font-semibold">
                              {headerChannel?.quality || 'HD Directo'} ·{' '}
                              {headerChannel?.network || 'TV'}
                            </span>
                          )}
                        </div>

                        <h4 className="font-display font-extrabold text-base sm:text-lg text-white leading-snug">
                          {activeNow?.title ||
                            headerChannel?.name ||
                            activeChannelTitle}
                        </h4>

                        {activeNow?.subtitle && (
                          <p className="text-xs font-medium text-zinc-400">
                            {activeNow.subtitle}
                          </p>
                        )}

                        {activeNow?.description ? (
                          <div className="space-y-1">
                            <p
                              className={`text-xs text-zinc-300 leading-relaxed ${
                                spotlightDescExpanded ? '' : 'line-clamp-2'
                              }`}
                            >
                              {cleanEpgDescription(activeNow.description)}
                            </p>
                            {activeNow.description.length > 110 && (
                              <button
                                type="button"
                                onClick={() => setSpotlightDescExpanded((v) => !v)}
                                className="text-[11px] font-semibold text-[#BF94FF] hover:text-white cursor-pointer"
                              >
                                {spotlightDescExpanded
                                  ? pickLang(lang, { es: 'Ocultar sinopsis', ca: 'Amagar sinopsi', en: 'Less' })
                                  : pickLang(lang, { es: 'Leer sinopsis', ca: 'Llegir sinopsi', en: 'Read more' })}
                              </button>
                            )}
                          </div>
                        ) : (
                          <p className="text-xs text-zinc-400 leading-relaxed">
                            {headerChannel?.description ||
                              pickLang(lang, {
                                es: 'Emisión continua en directo. Consulta otros canales en la pestaña "Todos los canales".',
                                ca: 'Emissió contínua en directe. Consulta altres canals a "Tots els canals".',
                                en: 'Continuous live feed. Browse all channel schedules in "All Channels".',
                              })}
                          </p>
                        )}
                      </div>

                      {activeNow && (
                        <div className="space-y-1 pt-1">
                          <div className="w-full h-1.5 rounded-full bg-white/[0.08] overflow-hidden">
                            <div
                              className="h-full rounded-full bg-gradient-to-r from-[#9146FF] to-[#BF94FF] transition-all duration-500"
                              style={{ width: `${inspectedEpg?.progressPct || 10}%` }}
                            />
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* UP NEXT CARD (1 col on desktop) */}
                  <div className="rounded-2xl bg-[#161822]/75 border border-white/[0.07] p-3.5 sm:p-4 flex flex-col justify-between gap-2.5">
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="inline-flex items-center gap-1.5 text-[11px] font-extrabold uppercase tracking-wider text-[#BF94FF]">
                          <Sparkles className="w-3.5 h-3.5" />
                          {pickLang(lang, {
                            es: 'A continuación',
                            ca: 'A continuació',
                            en: 'Up Next',
                          })}
                        </span>
                        {activeNext && (
                          <span className="font-mono text-xs font-bold text-white tabular-nums px-2 py-0.5 rounded-md bg-white/[0.07]">
                            {activeNext.startLabel}
                          </span>
                        )}
                      </div>

                      {activeNext ? (
                        <>
                          <h5 className="font-display font-bold text-sm sm:text-base text-white leading-snug line-clamp-2">
                            {activeNext.title}
                          </h5>
                          {activeNext.category && (
                            <span className="inline-block px-2 py-0.5 rounded-md bg-white/[0.06] text-[11px] text-zinc-300 font-medium">
                              {activeNext.category}
                            </span>
                          )}
                          {activeNext.description && (
                            <p className="text-xs text-zinc-400 leading-relaxed line-clamp-3">
                              {cleanEpgDescription(activeNext.description)}
                            </p>
                          )}
                        </>
                      ) : (
                        <div className="space-y-2 py-1">
                          <p className="text-xs text-zinc-400 leading-relaxed">
                            {pickLang(lang, {
                              es: 'Este canal internacional no publica parrilla por horas. Explora la programación en vivo del resto de canales.',
                              ca: 'Aquest canal internacional no publica graella horària. Explora la programació de la resta de canals.',
                              en: 'Hourly guide is unavailable for this international feed. Explore the full guide across all channels.',
                            })}
                          </p>
                          <button
                            type="button"
                            onClick={() => {
                              triggerHaptic('light');
                              setActiveTab('all');
                            }}
                            className="min-h-8 px-3 rounded-xl bg-[#9146FF]/20 hover:bg-[#9146FF]/35 border border-[#9146FF]/45 text-xs font-bold text-[#E9D5FF] cursor-pointer transition-colors"
                          >
                            {pickLang(lang, {
                              es: 'Explorar todos los canales',
                              ca: 'Explorar tots els canals',
                              en: 'Browse all channels',
                            })}
                          </button>
                        </div>
                      )}
                    </div>

                    {activeNext && (
                      <div className="text-[11px] font-mono text-zinc-400 tabular-nums pt-1 border-t border-white/[0.06] flex items-center justify-between">
                        <span>
                          {activeNext.startLabel} — {activeNext.stopLabel}
                        </span>
                        <span>
                          {Math.max(
                            5,
                            Math.round((activeNext.stopMs - activeNext.startMs) / 60_000)
                          )}{' '}
                          min
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Full Upcoming Timeline for the Inspected Channel */}
                {upcomingList.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-zinc-300 flex items-center gap-1.5">
                        <CalendarClock className="w-3.5 h-3.5 text-[#BF94FF]" />
                        {pickLang(lang, {
                          es: 'Programación completa de hoy',
                          ca: "Programació completa d'avui",
                          en: 'Full Schedule Today',
                        })}
                      </span>
                      <span className="text-[11px] text-zinc-500">
                        {pickLang(lang, {
                          es: 'Toca un programa para ver su detalle',
                          ca: 'Toca un programa per veure el detall',
                          en: 'Tap a show for details',
                        })}
                      </span>
                    </div>

                    <div className="max-h-[290px] overflow-y-auto pr-1 space-y-1.5">
                      {upcomingList.map((prog, index) => {
                        const key = `${headerChannel?.id || 'ch'}-${prog.startMs}-${index}`;
                        const isLiveNow = prog.startMs <= clockMs && prog.stopMs > clockMs;
                        const isExpanded = expandedProgKey === key;
                        const durationMin = Math.max(
                          5,
                          Math.round((prog.stopMs - prog.startMs) / 60_000)
                        );
                        const desc = cleanEpgDescription(prog.description);

                        return (
                          <button
                            key={key}
                            type="button"
                            onClick={() => {
                              triggerHaptic('light');
                              setExpandedProgKey(isExpanded ? null : key);
                            }}
                            className={`w-full text-left rounded-xl px-3 py-2.5 border transition-all cursor-pointer ${
                              isLiveNow
                                ? 'bg-[#9146FF]/16 border-[#9146FF]/55'
                                : 'bg-white/[0.03] hover:bg-white/[0.06] border-white/[0.06]'
                            }`}
                          >
                            <div className="flex items-start justify-between gap-2.5">
                              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                                <div className="shrink-0 pt-0.5 text-left">
                                  <span
                                    className={`font-mono text-xs font-bold tabular-nums block ${
                                      isLiveNow ? 'text-[#D8B4FE]' : 'text-zinc-300'
                                    }`}
                                  >
                                    {prog.startLabel}
                                  </span>
                                  <span className="font-mono text-[10px] text-zinc-500 tabular-nums">
                                    {durationMin}m
                                  </span>
                                </div>

                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5 flex-wrap">
                                    {isLiveNow && (
                                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-[#EB0400] text-white text-[9px] font-extrabold uppercase">
                                        <Radio className="w-2.5 h-2.5" />
                                        {pickLang(lang, { es: 'En directo', ca: 'En directe', en: 'Live' })}
                                      </span>
                                    )}
                                    <span className="text-xs sm:text-sm font-bold text-white leading-snug">
                                      {prog.title}
                                    </span>
                                  </div>
                                  {prog.category && (
                                    <span className="text-[11px] text-zinc-400">
                                      {prog.category}
                                      {prog.subtitle ? ` · ${prog.subtitle}` : ''}
                                    </span>
                                  )}
                                </div>
                              </div>

                              {desc && (
                                <span className="text-zinc-400 shrink-0 pt-0.5">
                                  {isExpanded ? (
                                    <ChevronUp className="w-4 h-4" />
                                  ) : (
                                    <ChevronDown className="w-4 h-4" />
                                  )}
                                </span>
                              )}
                            </div>

                            {isExpanded && desc && (
                              <p className="mt-2 pt-2 border-t border-white/[0.06] text-xs text-zinc-300 leading-relaxed">
                                {desc}
                              </p>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              /* TAB 2: ALL-CHANNELS NAVIGABLE GUIDE */
              <div className="space-y-3">
                {/* Search Input */}
                <div className="relative">
                  <Search className="w-4 h-4 text-zinc-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="text"
                    value={guideSearch}
                    onChange={(e) => setGuideSearch(e.target.value)}
                    placeholder={pickLang(lang, {
                      es: 'Buscar canal, película, serie o partido en emisión...',
                      ca: 'Cercar canal, pel·lícula, sèrie o partit en emissió...',
                      en: 'Search channel, movie, show, or live match...',
                    })}
                    className="w-full min-h-10 pl-10 pr-10 rounded-xl bg-[#0A0B10] border border-white/[0.09] focus:border-[#9146FF] text-xs sm:text-sm text-white placeholder:text-zinc-500 focus:outline-none"
                  />
                  {guideSearch && (
                    <button
                      type="button"
                      onClick={() => setGuideSearch('')}
                      aria-label="Limpiar búsqueda"
                      className="w-7 h-7 rounded-lg hover:bg-white/[0.08] text-zinc-400 hover:text-white flex items-center justify-center absolute right-2 top-1/2 -translate-y-1/2 cursor-pointer"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {/* Country / Language Quick Filter Strip */}
                <div className="flex gap-1.5 overflow-x-auto pb-0.5 no-scrollbar">
                  {REGION_FILTER_TABS.map((reg) => {
                    const active = guideRegion === reg.id;
                    return (
                      <button
                        key={reg.id}
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          setGuideRegion(reg.id);
                          setGuideCategory('all');
                        }}
                        className={`min-h-8 px-3 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition-all border shrink-0 ${
                          active
                            ? 'bg-[#9146FF] border-[#9146FF] text-white shadow-[0_3px_12px_rgba(145,70,255,0.35)]'
                            : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.08] text-zinc-300'
                        }`}
                      >
                        {pickLang(lang, reg.label)}
                      </button>
                    );
                  })}
                </div>

                {/* Category Filter Strip */}
                <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
                  {visibleCategories.map((cat) => {
                    const isSelected = guideCategory === cat.id;
                    return (
                      <button
                        key={cat.id}
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          setGuideCategory(cat.id);
                        }}
                        className={`min-h-8 px-3 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer transition-all border shrink-0 ${
                          isSelected
                            ? 'bg-[#9146FF] border-[#9146FF] text-white shadow-[0_3px_12px_rgba(145,70,255,0.35)]'
                            : 'bg-white/[0.04] hover:bg-white/[0.08] border-white/[0.07] text-zinc-300'
                        }`}
                      >
                        {pickLang(lang, cat.label)}
                      </button>
                    );
                  })}
                </div>

                {/* Multi-Channel EPG Rows */}
                <div className="max-h-[380px] overflow-y-auto pr-1 space-y-2">
                  {filteredGuideChannels.length === 0 ? (
                    <div className="py-8 text-center text-xs text-zinc-400">
                      {pickLang(lang, {
                        es: 'No hay canales o programas que coincidan con tu búsqueda.',
                        ca: 'No hi ha canals o programes que coincideixin amb la cerca.',
                        en: 'No channels or programs match your search.',
                      })}
                    </div>
                  ) : (
                    filteredGuideChannels.map((ch) => {
                      const snap = computeLiveProgramSnapshot(epgMap[ch.id], clockMs);
                      const isCurrentlyPlaying = playingChannel?.id === ch.id;
                      const isLoadingThis = loadingItemId === `tdt-${ch.id}-0`;

                      return (
                        <div
                          key={ch.id}
                          className={`rounded-xl p-2.5 sm:p-3 border transition-all flex items-center justify-between gap-3 ${
                            isCurrentlyPlaying
                              ? 'bg-[#9146FF]/16 border-[#9146FF]/60'
                              : 'bg-[#161822]/75 hover:bg-[#1B1E2B] border-white/[0.07]'
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => handleZap(ch)}
                            className="flex items-center gap-3 min-w-0 flex-1 text-left cursor-pointer group"
                          >
                            {/* Crisp SVG Channel Logo */}
                            <div className="relative shrink-0">
                              <ChannelLogoBadge channel={ch} size="md" showLangTag />
                              {isLoadingThis && (
                                <span className="absolute inset-0 rounded-2xl bg-black/70 flex items-center justify-center">
                                  <Loader2 className="w-4 h-4 text-[#BF94FF] animate-spin" />
                                </span>
                              )}
                            </div>

                            {/* Channel & Live EPG Summary */}
                            <div className="min-w-0 flex-1 space-y-1">
                              <div className="flex items-center gap-1.5 flex-wrap">
                                <span className="font-display font-bold text-xs sm:text-sm text-white group-hover:text-[#D8B4FE] transition-colors truncate">
                                  {ch.name}
                                </span>
                                {isCurrentlyPlaying && (
                                  <span className="px-1.5 py-0.5 rounded bg-[#9146FF] text-white text-[9px] font-extrabold uppercase">
                                    {pickLang(lang, { es: 'Viendo', ca: 'Veient', en: 'Playing' })}
                                  </span>
                                )}
                                <span className="text-[10px] text-zinc-500 hidden sm:inline">
                                  · {ch.network}
                                </span>
                              </div>

                              {snap?.now ? (
                                <div className="space-y-1">
                                  <div className="flex items-center gap-1.5 text-xs text-zinc-200 min-w-0">
                                    <span className="font-mono text-[10px] font-bold text-[#BF94FF] shrink-0 tabular-nums">
                                      {snap.now.startLabel}
                                    </span>
                                    <span className="truncate font-semibold">{snap.now.title}</span>
                                    <span className="text-[10px] text-zinc-400 shrink-0 tabular-nums">
                                      · {snap.remainingMin}m
                                    </span>
                                  </div>
                                  <div className="w-full max-w-[260px] h-1 rounded-full bg-white/[0.08] overflow-hidden">
                                    <div
                                      className="h-full bg-[#9146FF]"
                                      style={{ width: `${snap.progressPct}%` }}
                                    />
                                  </div>
                                  {snap.next && (
                                    <p className="text-[11px] text-zinc-400 truncate">
                                      <span className="font-mono text-zinc-500 tabular-nums">
                                        {snap.next.startLabel}
                                      </span>{' '}
                                      {snap.next.title}
                                    </p>
                                  )}
                                </div>
                              ) : (
                                <p className="text-[11px] text-zinc-400 truncate">
                                  {ch.description}
                                </p>
                              )}
                            </div>
                          </button>

                          {/* Right Actions: Peek Schedule vs Zap */}
                          <div className="flex items-center gap-1.5 shrink-0">
                            {snap && snap.upcoming.length > 0 && (
                              <button
                                type="button"
                                onClick={() => {
                                  triggerHaptic('light');
                                  setInspectedChannelId(ch.id);
                                  setActiveTab('channel');
                                }}
                                title={pickLang(lang, {
                                  es: 'Ver programación completa',
                                  ca: 'Veure programació completa',
                                  en: 'View full schedule',
                                })}
                                className="min-h-8 px-2.5 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/[0.08] text-[11px] font-semibold text-zinc-200 cursor-pointer transition-colors"
                              >
                                {pickLang(lang, { es: 'Guía', ca: 'Guia', en: 'Guide' })}
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleZap(ch)}
                              className={`min-h-8 px-2.5 rounded-lg text-[11px] font-bold flex items-center gap-1 cursor-pointer transition-all ${
                                isCurrentlyPlaying
                                  ? 'bg-[#9146FF] text-white'
                                  : 'bg-[#9146FF]/22 hover:bg-[#9146FF] text-[#E9D5FF] hover:text-white border border-[#9146FF]/40'
                              }`}
                            >
                              <Play className="w-3 h-3 fill-current" />
                              <span className="hidden xs:inline">
                                {pickLang(lang, { es: 'Ver', ca: 'Veure', en: 'Watch' })}
                              </span>
                            </button>
                          </div>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ==================================================================== */}
      {/* 2. SIMILAR CHANNELS SWIPEABLE CAROUSEL (QUICK ZAPPER)                */}
      {/* ==================================================================== */}
      {similarChannels.length > 0 && (
        <section
          aria-label={pickLang(lang, {
            es: 'Canales similares',
            ca: 'Canals similars',
            en: 'Similar Channels',
          })}
          className="rounded-2xl bg-[#111218]/90 border border-white/[0.08] p-3.5 sm:p-4 space-y-3 shadow-[0_12px_34px_rgba(0,0,0,0.45)]"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Tv className="w-4 h-4 text-[#BF94FF] shrink-0" />
              <div className="min-w-0">
                <h3 className="font-display font-bold text-xs sm:text-sm text-white truncate">
                  {pickLang(lang, {
                    es: 'Canales similares',
                    ca: 'Canals similars',
                    en: 'Similar Channels',
                  })}
                </h3>
                <p className="text-[11px] text-zinc-400 truncate">
                  {pickLang(lang, {
                    es: 'Desliza y toca cualquiera para cambiar de canal al instante',
                    ca: 'Llisca i toca qualsevol per canviar de canal a l’instant',
                    en: 'Swipe and tap any channel to zap instantly',
                  })}
                </p>
              </div>
            </div>

            {/* Desktop Carousel Controls */}
            <div className="hidden sm:flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => scrollCarouselBy(-1)}
                aria-label={pickLang(lang, { es: 'Anterior', ca: 'Anterior', en: 'Previous' })}
                className="w-8 h-8 rounded-xl bg-white/[0.06] hover:bg-[#9146FF] border border-white/[0.08] hover:border-[#9146FF] text-zinc-200 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <button
                type="button"
                onClick={() => scrollCarouselBy(1)}
                aria-label={pickLang(lang, { es: 'Siguiente', ca: 'Següent', en: 'Next' })}
                className="w-8 h-8 rounded-xl bg-white/[0.06] hover:bg-[#9146FF] border border-white/[0.08] hover:border-[#9146FF] text-zinc-200 hover:text-white flex items-center justify-center cursor-pointer transition-colors"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div
            ref={carouselRef}
            className="scroll-snap-x flex gap-3 overflow-x-auto pb-1 no-scrollbar"
          >
            {similarChannels.map((ch) => {
              const snap = computeLiveProgramSnapshot(epgMap[ch.id], clockMs);
              const isZapping = loadingItemId === `tdt-${ch.id}-0`;

              return (
                <button
                  key={ch.id}
                  type="button"
                  onClick={() => handleZap(ch)}
                  className="scroll-snap-item group w-[224px] sm:w-[244px] shrink-0 rounded-2xl bg-[#161822] hover:bg-[#1D2030] border border-white/[0.08] hover:border-[#9146FF]/65 overflow-hidden text-left active:scale-[0.97] transition-all cursor-pointer shadow-md flex flex-col justify-between"
                >
                  {/* Card Visual Header */}
                  <div
                    className="relative h-20 px-3.5 py-2.5 flex items-center justify-between gap-2 border-b border-white/[0.06] overflow-hidden"
                    style={{
                      background: ch.brandTone
                        ? `linear-gradient(135deg, ${ch.brandTone}38 0%, rgba(16,18,28,0.96) 72%)`
                        : 'linear-gradient(135deg, rgba(145,70,255,0.28) 0%, rgba(16,18,28,0.96) 72%)',
                    }}
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ChannelLogoBadge channel={ch} size="md" showLangTag />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="w-1.5 h-1.5 rounded-full bg-[#EB0400] animate-pulse shrink-0" />
                          <span className="text-[10px] font-mono font-bold text-zinc-300 tabular-nums">
                            Dial {ch.dial}
                          </span>
                        </div>
                        <p className="font-display font-extrabold text-sm text-white truncate mt-0.5">
                          {ch.name}
                        </p>
                      </div>
                    </div>

                    <span className="w-8 h-8 rounded-full bg-black/55 border border-white/20 flex items-center justify-center text-white group-hover:bg-[#9146FF] group-hover:border-[#9146FF] transition-colors shrink-0">
                      {isZapping ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                      )}
                    </span>
                  </div>

                  {/* Live EPG Body */}
                  <div className="p-3 space-y-2 flex-1 flex flex-col justify-between">
                    {snap?.now ? (
                      <>
                        <div className="space-y-1">
                          <div className="flex items-center justify-between gap-2 text-[10px] font-mono">
                            <span className="text-[#BF94FF] font-bold tabular-nums">
                              {snap.now.startLabel} — {snap.now.stopLabel}
                            </span>
                            <span className="text-zinc-400 tabular-nums">
                              {snap.remainingMin}m
                            </span>
                          </div>
                          <p className="text-xs font-bold text-white leading-snug line-clamp-2">
                            {snap.now.title}
                          </p>
                        </div>

                        <div className="space-y-1.5">
                          <div className="w-full h-1 rounded-full bg-white/[0.08] overflow-hidden">
                            <div
                              className="h-full bg-[#9146FF]"
                              style={{ width: `${snap.progressPct}%` }}
                            />
                          </div>
                          {snap.next && (
                            <p className="text-[11px] text-zinc-400 truncate">
                              <span className="font-mono text-zinc-500 tabular-nums">
                                {snap.next.startLabel}
                              </span>{' '}
                              {snap.next.title}
                            </p>
                          )}
                        </div>
                      </>
                    ) : (
                      <div className="space-y-1.5">
                        <span className="inline-block px-2 py-0.5 rounded bg-white/[0.06] text-[10px] font-semibold text-zinc-300">
                          {ch.network}
                        </span>
                        <p className="text-[11px] text-zinc-300 leading-snug line-clamp-2">
                          {ch.description}
                        </p>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
};
