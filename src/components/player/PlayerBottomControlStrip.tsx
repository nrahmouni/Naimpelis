import React, { useEffect, useRef, useState } from 'react';
import { Activity, Check, Globe, MoreHorizontal, Share2, Subtitles, Tv, Upload, Users } from 'lucide-react';
import {
  RiffanCastIcon,
  RiffanChatIcon,
  RiffanLiveIcon,
  RiffanPlayIcon,
  RiffanSlidersIcon,
} from '../ui/RiffanIcons';
import { MediaLanguageSelector } from '../ui/LanguageBadge';
import { resolveTrackLang } from './trackLabelUtils';
import { pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import type { AppLanguage, SubtitleTrackItem, VideoState } from '../../types';

interface PlayerBottomControlStripProps {
  lang: AppLanguage;
  videoState: VideoState;
  activeTrackLangCode: string;
  currentTime: number;
  externalWinState: 'idle' | 'open' | 'blocked' | 'closed';
  isMobileExternal: boolean;
  participantCount: number;
  floatingChatOpen: boolean;
  unreadChatCount: number;
  hasConnectedSmartTv: boolean;
  batterySaverTvMode: boolean;
  isCastingToTv: boolean;
  voiceSlot?: React.ReactNode;
  sessionMode?: 'solo' | 'party';
  onUpgradeSoloToParty?: () => void;
  onShareCurrentMedia?: () => void;
  onQuickLanguageSwitch: (code: 'ES' | 'LAT' | 'VOSE' | 'EN' | 'CAT') => void;
  onSelectTrack: (trackIndex: number, currentTimeSec: number) => void;
  onSelectExternalServer: (trackIndex: number) => void;
  onOpenControlledExternalWindow: () => void;
  onOpenInCloudBrowser?: (url: string) => void;
  onToggleFloatingChat?: () => void;
  onToggleBatterySaverTvMode: () => void;
  onDirectCastToTv: () => void;
  onOpenProMenu: () => void;
  subtitleTracks?: SubtitleTrackItem[];
  activeSubId?: string;
  onSelectSubtitleTrack?: (trackId: string) => void;
  subtitleFileInputRef?: React.RefObject<HTMLInputElement | null>;
  tacticalVisionEnabled?: boolean;
  onToggleTacticalVision?: () => void;
}

export const PlayerBottomControlStrip: React.FC<PlayerBottomControlStripProps> = ({
  lang,
  videoState,
  activeTrackLangCode,
  currentTime,
  externalWinState,
  isMobileExternal,
  participantCount,
  floatingChatOpen,
  unreadChatCount,
  hasConnectedSmartTv,
  batterySaverTvMode,
  isCastingToTv,
  voiceSlot,
  sessionMode = 'party',
  onUpgradeSoloToParty,
  onShareCurrentMedia,
  onQuickLanguageSwitch,
  onSelectTrack,
  onSelectExternalServer,
  onOpenControlledExternalWindow,
  onOpenInCloudBrowser,
  onToggleFloatingChat,
  onToggleBatterySaverTvMode,
  onDirectCastToTv,
  onOpenProMenu,
  subtitleTracks = [],
  activeSubId = 'off',
  onSelectSubtitleTrack,
  subtitleFileInputRef,
  tacticalVisionEnabled = false,
  onToggleTacticalVision,
}) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const [ccOpen, setCcOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);
  const ccRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen && !ccOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (moreOpen && moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
      if (ccOpen && ccRef.current && !ccRef.current.contains(e.target as Node)) {
        setCcOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMoreOpen(false);
        setCcOpen(false);
      }
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [moreOpen, ccOpen]);

  const activeSubTrack =
    activeSubId && activeSubId !== 'off'
      ? subtitleTracks.find((s) => s.id === activeSubId)
      : undefined;

  const activeEmbedUrl =
    videoState.tracks[videoState.activeTrackIndex]?.sourceUrl || videoState.url;

  return (
    <div className="bg-[#000000]/96 backdrop-blur-2xl border-t border-white/[0.08] px-3 sm:px-4 py-2 space-y-2">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      {/* Left: Quick Language Switcher (VOD) or Signal Selector */}
      <div className="flex items-center gap-1.5 min-w-0 overflow-x-auto no-scrollbar">
        {!videoState.isLive && (videoState.tracks || []).length > 0 ? (
          <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
            {(() => {
              const availableTrackLangs = Array.from(
                new Set(
                  (videoState.tracks || [])
                    .map((tr) =>
                      resolveTrackLang(tr, {
                        subtitle: videoState.subtitle,
                        title: videoState.title,
                      })
                    )
                    .filter((c) => ['ES', 'CAT', 'LAT', 'VOSE', 'EN'].includes(c))
                )
              );
              if (availableTrackLangs.length === 0) return null;
              return (
                <MediaLanguageSelector
                  labelPrefix={pickLang(lang, { es: 'Idioma:', ca: 'Idioma:', en: 'Language:' })}
                  selectedLang={activeTrackLangCode || availableTrackLangs[0]}
                  availableLangs={availableTrackLangs}
                  onSelectLang={(code) => {
                    onQuickLanguageSwitch(code as 'ES' | 'LAT' | 'VOSE' | 'EN' | 'CAT');
                  }}
                  size="sm"
                />
              );
            })()}

            {(() => {
              const sameLangTracks = (videoState.tracks || [])
                .map((tr, idx) => ({ tr, idx }))
                .filter(
                  ({ tr }) =>
                    resolveTrackLang(tr, {
                      subtitle: videoState.subtitle,
                      title: videoState.title,
                    }) === activeTrackLangCode
                );
              if (sameLangTracks.length <= 1) return null;
              return (
                <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-2xl border border-white/[0.08] shrink-0">
                  {sameLangTracks.map(({ tr, idx }, srvIdx) => {
                    const active = idx === videoState.activeTrackIndex;
                    return (
                      <button
                        key={tr.id || idx}
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          if (externalWinState === 'open') {
                            onSelectExternalServer(idx);
                          } else {
                            onSelectTrack(idx, currentTime);
                          }
                        }}
                        title={tr.label}
                        className={`min-h-[38px] px-3 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all ${
                          active
                            ? 'bg-[#7C3AED] text-white shadow-[0_4px_14px_rgba(124,58,237,0.4)]'
                            : 'text-zinc-300 hover:bg-white/10'
                        }`}
                      >
                        {pickLang(lang, { es: 'Servidor', ca: 'Servidor', en: 'Server' })} {srvIdx + 1}
                      </button>
                    );
                  })}
                </div>
              );
            })()}
          </div>
        ) : videoState.isLive && videoState.tracks.length > 1 ? (
          <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-2xl border border-white/[0.08] max-w-full overflow-x-auto no-scrollbar">
            {videoState.tracks.map((tr, idx) => {
              const active = idx === videoState.activeTrackIndex;
              const hasZh = String(tr.lang || '').toUpperCase() === 'ZH' || /中文/.test(tr.label || '');
              const rawLbl = String(tr.label || '');
              const srcUrl = String(tr.sourceUrl || '');
              const provName = tr.providerName
                ? tr.providerName.replace(/\s*Pro$/i, '').trim()
                : tr.providerId === 'dana4k'
                  ? 'Dana 4K'
                  : tr.providerId === 'vod4k'
                    ? 'VOD 4K'
                    : tr.providerId === 'octopus'
                      ? 'Octopus'
                      : tr.providerId === 'sharkpro'
                        ? 'Shark'
                        : /dana\s*4k/i.test(rawLbl)
                          ? 'Dana 4K'
                          : /vod\s*4k/i.test(rawLbl)
                            ? 'VOD 4K'
                            : /shark/i.test(rawLbl)
                              ? 'Shark'
                              : /24\s*tv/i.test(rawLbl)
                                ? '24TV'
                                : /2m2h/i.test(rawLbl)
                                  ? '2M2H'
                                  : /active/i.test(rawLbl)
                                    ? 'Active'
                                    : /adtupac/i.test(rawLbl)
                                      ? 'Adtupac'
                                      : /ultra\s*vip/i.test(rawLbl)
                                        ? 'Ultra VIP'
                                        : /sult/i.test(rawLbl)
                                          ? 'Sult VO'
                                          : /octopus/i.test(rawLbl)
                                            ? 'Octopus'
                                            : /belix|\/api\/belix/i.test(`${rawLbl} ${srcUrl}`)
                                              ? 'Belix'
                                              : /edge\s*2/i.test(rawLbl)
                                                ? 'Edge 2'
                                                : /rtve/i.test(`${rawLbl} ${srcUrl}`)
                                                  ? 'RTVE'
                                                  : /atresplayer/i.test(`${rawLbl} ${srcUrl}`)
                                                    ? 'Atresplayer'
                                                    : /mitele|mediaset/i.test(`${rawLbl} ${srcUrl}`)
                                                      ? 'Mediaset'
                                                      : /dvb|90\.163\.85\.113/i.test(`${rawLbl} ${srcUrl}`)
                                                        ? 'DVB'
                                                        : '';
              const labelWithoutProvider = rawLbl
                .replace(/\b(?:dana\s*4k|vod\s*4k|shark\s*4k|vip\s*4k|spain\s*4k)\b/gi, ' ')
                .trim();
              const qualityRaw = String(tr.quality || '')
                .replace(/\b(?:dana\s*4k|vod\s*4k|shark\s*4k|vip\s*4k|spain\s*4k)\b/gi, ' ')
                .trim();
              const qHay = `${labelWithoutProvider} ${qualityRaw}`;
              const qShort = /4k|2160|uhd/i.test(qHay)
                ? '4K'
                : /1080|fhd/i.test(qHay)
                  ? 'FHD'
                  : /720|estabilidad/i.test(qHay)
                    ? '720p'
                    : /hd/i.test(qHay)
                      ? 'HD'
                      : '';
              const langCode = String(tr.lang || '').toUpperCase();
              const parts: string[] = [];
              if (provName) parts.push(provName);
              else parts.push(`${pickLang(lang, { es: 'Señal', ca: 'Senyal', en: 'Feed' })} ${idx + 1}`);
              if (langCode && langCode !== 'ZH' && langCode !== 'INT') parts.push(langCode);
              if (qShort) parts.push(qShort);
              const signalText = parts.join(' · ');
              return (
                <button
                  key={tr.id || idx}
                  type="button"
                  data-tv-focusable="true"
                  title={tr.label}
                  onClick={() => {
                    triggerHaptic('light');
                    onSelectTrack(idx, 0);
                  }}
                  className={`min-h-[38px] px-2.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all inline-flex items-center gap-1.5 tv-focus-ring ${
                    active
                      ? 'bg-[#7C3AED] text-white shadow-[0_4px_14px_rgba(124,58,237,0.4)]'
                      : 'text-zinc-300 hover:bg-white/10'
                  }`}
                >
                  {hasZh && (
                    <span className="px-1.5 py-0.5 rounded bg-white/15 text-[10px] font-bold">
                      中文
                    </span>
                  )}
                  <span>{signalText}</span>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex items-center gap-2 text-xs font-semibold text-zinc-300">
            <RiffanLiveIcon
              size={15}
              animate={videoState.isLive ? 'always' : 'hover'}
              className={videoState.isLive ? 'text-[#EB0400] shrink-0' : 'shrink-0'}
            />
            <span className="leading-snug break-words">
              {videoState.tracks[videoState.activeTrackIndex]?.label ||
                (videoState.isLive
                  ? pickLang(lang, { es: 'Señal en directo', ca: 'Senyal en directe', en: 'Live feed' })
                  : pickLang(lang, { es: 'Proyección activa', ca: 'Projecció activa', en: 'Now playing' }))}
            </span>
          </div>
        )}
      </div>

      {/* Right: Calm Action Group — [Sala / Chat] + [CC] + [··· Más] + [Ajustes] */}
      <div className="flex flex-wrap items-center justify-center sm:justify-end gap-1.5 shrink-0">

        {sessionMode !== 'solo' && onToggleFloatingChat && (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onToggleFloatingChat();
            }}
            aria-pressed={floatingChatOpen}
            className={`relative min-h-[40px] px-3.5 rounded-2xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all border ${
              floatingChatOpen
                ? 'bg-[#7C3AED] text-white border-[#8B5CF6]/60 shadow-[0_4px_14px_rgba(124,58,237,0.4)]'
                : 'bg-[#0D0D12] hover:bg-[#14141C] text-zinc-100 border-white/[0.08]'
            }`}
          >
            <RiffanChatIcon size={15} tone={floatingChatOpen ? 'current' : 'brand'} />
            <span className="tabular-nums">Sala · {Math.max(1, participantCount)}</span>
            {unreadChatCount > 0 && !floatingChatOpen && (
              <span className="w-2 h-2 rounded-full bg-[#EB0400] shrink-0" aria-hidden="true" />
            )}
          </button>
        )}

        {!videoState.isLive &&
          (videoState.mode === 'hls' || videoState.mode === 'direct') &&
          onSelectSubtitleTrack && (
            <div ref={ccRef} className="relative">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  setMoreOpen(false);
                  setCcOpen((v) => !v);
                }}
                aria-expanded={ccOpen}
                aria-haspopup="menu"
                aria-label={pickLang(lang, { es: 'Subtítulos', ca: 'Subtítols', en: 'Subtitles' })}
                className={`min-h-[40px] px-3 rounded-2xl border text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all ${
                  activeSubTrack
                    ? 'bg-[#7C3AED]/25 border-[#8B5CF6]/55 text-white'
                    : 'bg-[#0D0D12] hover:bg-[#14141C] border-white/[0.08] text-zinc-200'
                }`}
              >
                <Subtitles className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span>
                  {activeSubTrack
                    ? `CC · ${String(activeSubTrack.lang || 'SUB').toUpperCase()}`
                    : subtitleTracks.length > 0
                    ? `CC (${subtitleTracks.length})`
                    : 'CC'}
                </span>
              </button>

              {ccOpen && (
                <div
                  role="menu"
                  className="fixed inset-x-4 bottom-24 mx-auto max-w-xs max-h-[65vh] overflow-y-auto sm:absolute sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:bottom-full sm:mb-2 sm:w-64 sm:max-h-72 rounded-2xl bg-[#0D0D12]/96 backdrop-blur-2xl border border-white/[0.08] shadow-[0_18px_48px_rgba(0,0,0,0.82)] p-1.5 space-y-1 z-[70] animate-fade-in"
                >
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      triggerHaptic('light');
                      setCcOpen(false);
                      onSelectSubtitleTrack('off');
                    }}
                    className={`w-full min-h-10 px-3 rounded-xl text-left text-xs font-semibold flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                      activeSubId === 'off'
                        ? 'bg-[#7C3AED]/25 text-white'
                        : 'hover:bg-white/[0.08] text-zinc-300'
                    }`}
                  >
                    <span>
                      {pickLang(lang, {
                        es: 'Desactivar subtítulos',
                        ca: 'Desactivar subtítols',
                        en: 'Subtitles off',
                      })}
                    </span>
                    {activeSubId === 'off' && <Check className="w-3.5 h-3.5 text-[#A78BFA] shrink-0" />}
                  </button>

                  {subtitleTracks.map((st) => {
                    const isSelected = activeSubId === st.id;
                    return (
                      <button
                        key={st.id}
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          triggerHaptic('light');
                          setCcOpen(false);
                          onSelectSubtitleTrack(st.id);
                        }}
                        className={`w-full min-h-10 px-3 rounded-xl text-left text-xs font-semibold flex items-center justify-between gap-2 cursor-pointer transition-colors ${
                          isSelected
                            ? 'bg-[#7C3AED]/25 text-white'
                            : 'hover:bg-white/[0.08] text-zinc-200'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="px-1.5 py-0.5 rounded bg-white/10 text-[10px] font-bold text-sky-300 shrink-0">
                            {String(st.lang || 'SUB').toUpperCase()}
                          </span>
                          <span className="truncate">{st.label}</span>
                        </div>
                        {isSelected && <Check className="w-3.5 h-3.5 text-[#A78BFA] shrink-0" />}
                      </button>
                    );
                  })}

                  {subtitleFileInputRef && (
                    <button
                      type="button"
                      role="menuitem"
                      onClick={() => {
                        setCcOpen(false);
                        subtitleFileInputRef.current?.click();
                      }}
                      className="w-full min-h-10 px-3 rounded-xl hover:bg-white/[0.08] border-t border-white/[0.06] mt-1 pt-1 text-left text-xs font-semibold text-sky-300 flex items-center gap-2 cursor-pointer transition-colors"
                    >
                      <Upload className="w-3.5 h-3.5 shrink-0" />
                      <span>
                        {pickLang(lang, {
                          es: 'Cargar .SRT / .VTT local',
                          ca: 'Carregar .SRT / .VTT local',
                          en: 'Load local .SRT / .VTT',
                        })}
                      </span>
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

        <div ref={moreRef} className="relative">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              setMoreOpen((v) => !v);
            }}
            aria-expanded={moreOpen}
            aria-haspopup="menu"
            aria-label={pickLang(lang, { es: 'Más acciones', ca: 'Més accions', en: 'More actions' })}
            className={`min-h-[40px] min-w-[40px] px-3 rounded-2xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all ${
              moreOpen || isCastingToTv || batterySaverTvMode
                ? 'bg-[#7C3AED]/20 border-[#8B5CF6]/50 text-white'
                : 'bg-[#0D0D12] hover:bg-[#14141C] border-white/[0.08] text-zinc-200'
            }`}
          >
            <MoreHorizontal className="w-4 h-4 shrink-0" />
            <span className="hidden sm:inline">
              {pickLang(lang, { es: 'Más', ca: 'Més', en: 'More' })}
            </span>
          </button>

          {moreOpen && (
            <div
              role="menu"
              className="fixed inset-x-4 bottom-24 mx-auto max-w-xs max-h-[65vh] overflow-y-auto sm:absolute sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:bottom-full sm:mb-2 sm:w-64 rounded-2xl bg-[#0D0D12]/96 backdrop-blur-2xl border border-white/[0.08] shadow-[0_18px_48px_rgba(0,0,0,0.82)] p-1.5 space-y-1 z-[70] animate-fade-in"
            >
              <button
                type="button"
                role="menuitem"
                onClick={() => {
                  setMoreOpen(false);
                  onDirectCastToTv();
                }}
                className="w-full min-h-11 px-3 rounded-xl hover:bg-white/[0.08] text-left text-xs font-semibold text-white flex items-center gap-2.5 cursor-pointer transition-colors"
              >
                <RiffanCastIcon
                  size={15}
                  tone={isCastingToTv || hasConnectedSmartTv ? 'current' : 'brand'}
                  className={isCastingToTv || hasConnectedSmartTv ? 'text-emerald-300' : ''}
                />
                <span>
                  {isCastingToTv
                    ? pickLang(lang, { es: 'Transmitiendo a TV', ca: 'Transmetent a TV', en: 'Casting to TV' })
                    : 'Cast TV'}
                </span>
              </button>

              {hasConnectedSmartTv && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    triggerHaptic('light');
                    setMoreOpen(false);
                    onToggleBatterySaverTvMode();
                  }}
                  className="w-full min-h-11 px-3 rounded-xl hover:bg-white/[0.08] text-left text-xs font-semibold text-white flex items-center gap-2.5 cursor-pointer transition-colors"
                >
                  <Tv className="w-4 h-4 text-emerald-300 shrink-0" />
                  <span>
                    {batterySaverTvMode
                      ? pickLang(lang, { es: 'Solo Mando ✓', ca: 'Només Comandament ✓', en: 'Remote Only ✓' })
                      : pickLang(lang, { es: 'Solo Mando TV', ca: 'Només Comandament TV', en: 'TV Remote Only' })}
                  </span>
                </button>
              )}

              {videoState.mode === 'embed' && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    triggerHaptic('medium');
                    setMoreOpen(false);
                    onOpenControlledExternalWindow();
                  }}
                  className="w-full min-h-11 px-3 rounded-xl hover:bg-white/[0.08] text-left text-xs font-semibold text-white flex items-center gap-2.5 cursor-pointer transition-colors"
                >
                  <RiffanPlayIcon size={14} tone="brand" />
                  <span>
                    {isMobileExternal
                      ? pickLang(lang, { es: 'Abrir en pestaña', ca: 'Obrir en pestanya', en: 'Open in tab' })
                      : pickLang(lang, { es: 'Abrir en ventana', ca: 'Obrir en finestra', en: 'Open in window' })}
                  </span>
                </button>
              )}

              {videoState.mode === 'embed' && onOpenInCloudBrowser && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    triggerHaptic('medium');
                    setMoreOpen(false);
                    onOpenInCloudBrowser(activeEmbedUrl);
                  }}
                  className="w-full min-h-11 px-3 rounded-xl hover:bg-white/[0.08] text-left text-xs font-semibold text-emerald-300 flex items-center gap-2.5 cursor-pointer transition-colors"
                >
                  <Globe className="w-4 h-4 shrink-0" />
                  <span>Cloud HD</span>
                </button>
              )}

              {sessionMode === 'solo' && onUpgradeSoloToParty && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    triggerHaptic('medium');
                    setMoreOpen(false);
                    onUpgradeSoloToParty();
                  }}
                  className="w-full min-h-11 px-3 rounded-xl hover:bg-white/[0.08] text-left text-xs font-semibold text-[#C4B5FD] flex items-center gap-2.5 cursor-pointer transition-colors"
                >
                  <Users className="w-4 h-4 shrink-0" />
                  <span>
                    {pickLang(lang, {
                      es: 'Ver con amigos',
                      ca: 'Veure amb amics',
                      en: 'Watch party',
                    })}
                  </span>
                </button>
              )}

              {onShareCurrentMedia && (
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    triggerHaptic('light');
                    setMoreOpen(false);
                    onShareCurrentMedia();
                  }}
                  className="w-full min-h-11 px-3 rounded-xl hover:bg-white/[0.08] text-left text-xs font-semibold text-zinc-100 flex items-center gap-2.5 cursor-pointer transition-colors"
                >
                  <Share2 className="w-4 h-4 text-[#A78BFA] shrink-0" />
                  <span>
                    {pickLang(lang, {
                      es: 'Compartir enlace',
                      ca: 'Compartir enllaç',
                      en: 'Share link',
                    })}
                  </span>
                </button>
              )}

              {(videoState.mode === 'hls' || videoState.mode === 'direct' || videoState.mode === 'cloud') &&
                onToggleTacticalVision && (
                  <button
                    type="button"
                    role="menuitem"
                    aria-pressed={tacticalVisionEnabled}
                    onClick={() => {
                      triggerHaptic('light');
                      setMoreOpen(false);
                      onToggleTacticalVision();
                    }}
                    className={`w-full min-h-11 px-3 rounded-xl hover:bg-white/[0.08] text-left text-xs font-semibold flex items-center gap-2.5 cursor-pointer transition-colors ${
                      tacticalVisionEnabled ? 'text-[#00F593]' : 'text-zinc-200'
                    }`}
                  >
                    <Activity className="w-4 h-4 shrink-0" />
                    <span>
                      {tacticalVisionEnabled
                        ? pickLang(lang, {
                            es: 'Centro Táctico IA · Activo',
                            ca: 'Centre Tàctic IA · Actiu',
                            en: 'AI Match Tracker · Active',
                          })
                        : pickLang(lang, {
                            es: 'Centro Táctico IA (opcional)',
                            ca: 'Centre Tàctic IA (opcional)',
                            en: 'AI Match Tracker (optional)',
                          })}
                    </span>
                  </button>
                )}

              {voiceSlot && <div className="px-1 pt-0.5 flex items-center">{voiceSlot}</div>}
            </div>
          )}
        </div>

        <button
          type="button"
          onClick={() => {
            triggerHaptic('medium');
            onOpenProMenu();
          }}
          className="min-h-[40px] px-3.5 rounded-2xl bg-[#0D0D12] hover:bg-[#14141C] border border-white/[0.08] text-xs font-bold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all"
        >
          <RiffanSlidersIcon size={15} tone="current" />
          <span>{pickLang(lang, { es: 'Ajustes', ca: 'Ajustos', en: 'Settings' })}</span>
        </button>
      </div>
      </div>
    </div>
  );
};

