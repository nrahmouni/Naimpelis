import React, { useEffect, useRef, useState } from 'react';
import { Globe, MoreHorizontal, Share2, Tv, Users } from 'lucide-react';
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
import type { AppLanguage, VideoState } from '../../types';

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
}) => {
  const [moreOpen, setMoreOpen] = useState(false);
  const moreRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!moreOpen) return;
    const handlePointerDown = (e: PointerEvent) => {
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) {
        setMoreOpen(false);
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMoreOpen(false);
    };
    window.addEventListener('pointerdown', handlePointerDown);
    window.addEventListener('keydown', handleKeyDown);
    return () => {
      window.removeEventListener('pointerdown', handlePointerDown);
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [moreOpen]);

  const activeEmbedUrl =
    videoState.tracks[videoState.activeTrackIndex]?.sourceUrl || videoState.url;

  return (
    <div className="bg-[#0B0C14]/96 backdrop-blur-2xl border-t border-white/[0.08] px-3 sm:px-4 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
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
                        className={`min-h-[34px] px-2.5 rounded-xl text-xs font-bold whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all ${
                          active
                            ? 'bg-[#9146FF] text-white shadow-[0_4px_14px_rgba(145,70,255,0.4)]'
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
          <div className="flex items-center gap-1 bg-white/[0.04] p-1 rounded-2xl border border-white/[0.08] shrink-0">
            {videoState.tracks.slice(0, 5).map((tr, idx) => {
              const active = idx === videoState.activeTrackIndex;
              const hasZh = String(tr.lang || '').toUpperCase() === 'ZH' || /中文/.test(tr.label || '');
              const signalText = `${pickLang(lang, { es: 'Señal', ca: 'Senyal', en: 'Feed' })} ${idx + 1}`;
              return (
                <button
                  key={tr.id || idx}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    onSelectTrack(idx, 0);
                  }}
                  className={`min-h-[36px] px-3 rounded-xl text-xs font-bold whitespace-nowrap cursor-pointer active:scale-95 transition-all inline-flex items-center gap-1.5 ${
                    active
                      ? 'bg-[#9146FF] text-white shadow-[0_4px_14px_rgba(145,70,255,0.4)]'
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
              className={videoState.isLive ? 'text-[#EB0400]' : ''}
            />
            <span className="truncate max-w-[200px]">
              {videoState.tracks[videoState.activeTrackIndex]?.label ||
                (videoState.isLive
                  ? pickLang(lang, { es: 'Señal en directo', ca: 'Senyal en directe', en: 'Live feed' })
                  : pickLang(lang, { es: 'Proyección activa', ca: 'Projecció activa', en: 'Now playing' }))}
            </span>
          </div>
        )}
      </div>

      {/* Right: Calm 3-Button Group — [Sala / Watch party] + [··· Más] + [Ajustes] */}
      <div className="flex items-center justify-end gap-1.5 shrink-0">
        {sessionMode === 'solo' && onUpgradeSoloToParty ? (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              onUpgradeSoloToParty();
            }}
            className="min-h-[38px] px-3.5 rounded-2xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all border bg-[#9146FF] hover:bg-[#7C2AE8] text-white border-[#BF94FF]/60 shadow-[0_4px_14px_rgba(145,70,255,0.4)]"
          >
            <Users className="w-3.5 h-3.5 shrink-0" />
            <span>
              {pickLang(lang, {
                es: 'Ver con amigos',
                ca: 'Veure amb amics',
                en: 'Watch party',
                rif: 'S tmdukkalin',
                zh: '创建房间',
              })}
            </span>
          </button>
        ) : (
          onToggleFloatingChat && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                onToggleFloatingChat();
              }}
              aria-pressed={floatingChatOpen}
              className={`relative min-h-[38px] px-3.5 rounded-2xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all border ${
                floatingChatOpen
                  ? 'bg-[#9146FF] text-white border-[#BF94FF]/60 shadow-[0_4px_14px_rgba(145,70,255,0.4)]'
                  : 'bg-white/[0.045] hover:bg-white/[0.1] text-zinc-100 border-white/[0.09]'
              }`}
            >
              <RiffanChatIcon size={15} tone={floatingChatOpen ? 'current' : 'brand'} />
              <span className="tabular-nums">Sala · {Math.max(1, participantCount)}</span>
              {unreadChatCount > 0 && !floatingChatOpen && (
                <span className="w-2 h-2 rounded-full bg-[#EB0400] shrink-0" aria-hidden="true" />
              )}
            </button>
          )
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
            className={`min-h-[38px] min-w-[38px] px-3 rounded-2xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer active:scale-95 transition-all ${
              moreOpen || isCastingToTv || batterySaverTvMode
                ? 'bg-[#9146FF]/18 border-[#9146FF]/50 text-white'
                : 'bg-white/[0.045] hover:bg-white/[0.1] border-white/[0.09] text-zinc-200'
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
              className="absolute right-0 bottom-full mb-2 w-60 rounded-2xl bg-[#0E1019]/96 backdrop-blur-2xl border border-white/[0.1] shadow-[0_18px_48px_rgba(0,0,0,0.82)] p-1.5 space-y-1 z-50 animate-fade-in"
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
                  <Share2 className="w-4 h-4 text-[#BF94FF] shrink-0" />
                  <span>
                    {pickLang(lang, {
                      es: 'Compartir enlace',
                      ca: 'Compartir enllaç',
                      en: 'Share link',
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
          className="min-h-[38px] px-3.5 rounded-2xl bg-white/[0.045] hover:bg-white/[0.1] border border-white/[0.09] text-xs font-bold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all"
        >
          <RiffanSlidersIcon size={15} tone="current" />
          <span>{pickLang(lang, { es: 'Ajustes', ca: 'Ajustos', en: 'Settings' })}</span>
        </button>
      </div>
    </div>
  );
};

