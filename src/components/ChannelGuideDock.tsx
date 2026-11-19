import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  CalendarClock,
  ChevronDown,
  ChevronUp,
  Clock,
  Layers,
  Play,
  RefreshCw,
  Tv,
} from 'lucide-react';
import type {
  AppLanguage,
  ChannelLiveEpg,
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
import {
  CATEGORY_FILTER_ORDER,
  type GuideViewTab,
  computeLiveProgramSnapshot,
  resolveChannelMatch,
} from './guide/channelGuideUtils';
import { ChannelScheduleTab } from './guide/ChannelScheduleTab';
import { AllChannelsGuideTab } from './guide/AllChannelsGuideTab';
import { SimilarChannelsCarousel } from './guide/SimilarChannelsCarousel';

interface ChannelGuideDockProps {
  lang: AppLanguage;
  activeChannelTitle: string;
  activeChannelSubtitle?: string;
  activeRawSourceUrl?: string;
  channels: SpanishTdtChannel[];
  loadingItemId?: string | null;
  onSelectChannel: (channel: SpanishTdtChannel, liveProgramHint?: string) => void;
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

  const allChannels = useMemo(
    () => (channels.length > 0 ? channels : fallbackChannels),
    [channels, fallbackChannels]
  );

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

  const visibleCategories = useMemo(() => {
    const scoped =
      guideRegion === 'all'
        ? allChannels
        : allChannels.filter((c) => getChannelRegionMeta(c).region === guideRegion);
    const present = new Set(scoped.map((c) => c.category));
    return CATEGORY_FILTER_ORDER.filter((cat) => cat.id === 'all' || present.has(cat.id));
  }, [allChannels, guideRegion]);

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
    <div className="space-y-4 w-full overflow-x-clip">
      <SimilarChannelsCarousel
        lang={lang}
        similarChannels={similarChannels}
        epgMap={epgMap}
        clockMs={clockMs}
        loadingItemId={loadingItemId}
        onZapChannel={handleZap}
      />

      <section
        aria-label={pickLang(lang, {
          es: 'Guía del canal y programación',
          ca: 'Guia del canal i programació',
          en: 'Channel Guide & TV Schedule',
        })}
        className="rounded-2xl bg-[#111218]/95 border border-white/[0.08] overflow-hidden shadow-[0_16px_42px_rgba(0,0,0,0.55)]"
      >
        <div className="px-3.5 py-2.5 flex items-center justify-between gap-2 border-b border-white/[0.06] bg-white/[0.015]">
          <div className="flex items-center gap-2.5 min-w-0">
            {headerChannel ? (
              <ChannelLogoBadge channel={headerChannel} size="sm" />
            ) : (
              <div className="w-9 h-9 rounded-xl flex items-center justify-center bg-[#9146FF]/20 border border-[#9146FF]/40 shrink-0">
                <Tv className="w-4 h-4 text-[#BF94FF]" />
              </div>
            )}

            <div className="min-w-0">
              <div className="flex items-center gap-1.5 min-w-0 flex-wrap">
                <h3 className="font-display font-bold text-xs sm:text-sm text-white">
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
              <p className="text-[11px] text-zinc-400 leading-snug break-words line-clamp-2">
                {headerChannel ? `${headerChannel.name} · ${headerChannel.network}` : activeChannelTitle}
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
                    <span>{pickLang(lang, { es: 'Ver ahora', ca: 'Veure ara', en: 'Watch now' })}</span>
                  </button>
                </div>
              </div>
            )}

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
              <ChannelScheduleTab
                lang={lang}
                headerChannel={headerChannel}
                activeChannelTitle={activeChannelTitle}
                inspectedEpg={inspectedEpg}
                activeNow={activeNow}
                activeNext={activeNext}
                upcomingList={upcomingList}
                clockMs={clockMs}
                spotlightDescExpanded={spotlightDescExpanded}
                onToggleSpotlightDesc={() => setSpotlightDescExpanded((v) => !v)}
                expandedProgKey={expandedProgKey}
                onToggleProgKey={setExpandedProgKey}
                onBrowseAllChannels={() => setActiveTab('all')}
              />
            ) : (
              <AllChannelsGuideTab
                lang={lang}
                guideSearch={guideSearch}
                onChangeSearch={setGuideSearch}
                guideRegion={guideRegion}
                onChangeRegion={setGuideRegion}
                guideCategory={guideCategory}
                onChangeCategory={setGuideCategory}
                visibleCategories={visibleCategories}
                filteredGuideChannels={filteredGuideChannels}
                epgMap={epgMap}
                clockMs={clockMs}
                playingChannelId={playingChannel?.id}
                loadingItemId={loadingItemId}
                onZapChannel={handleZap}
                onInspectChannel={(channelId) => {
                  setInspectedChannelId(channelId);
                  setActiveTab('channel');
                }}
              />
            )}
          </div>
        )}
      </section>
    </div>
  );
};
