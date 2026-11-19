import React from 'react';
import { Tv, Globe } from 'lucide-react';
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
  return (
    <div className="bg-[#0B0C14]/96 backdrop-blur-2xl border-t border-white/[0.08] px-3 sm:px-4 py-2 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
      {/* Row 1 (Left on Desktop): Quick Language Pills (VOD), Unique Multi-Server Switcher, OR Live Signal Pills */}
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
              if (sameLangTracks.length <= 1 && videoState.mode !== 'embed') return null;
              return (
                <div className="flex items-center gap-1 bg-[#121420] p-1 rounded-2xl border border-white/[0.08] shrink-0">
                  {sameLangTracks.length > 1 &&
                    sameLangTracks.map(({ tr, idx }, srvIdx) => {
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
                  {videoState.mode === 'embed' && (
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('medium');
                        onOpenControlledExternalWindow();
                      }}
                      title={
                        isMobileExternal
                          ? 'Reproducir en pestaña externa controlada'
                          : 'Reproducir en ventana externa controlada'
                      }
                      className="min-h-[34px] px-2.5 rounded-xl text-xs font-bold bg-[#9146FF]/20 hover:bg-[#9146FF]/35 text-[#D8B4FE] border border-[#9146FF]/45 flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all"
                    >
                      <RiffanPlayIcon size={12} tone="current" />
                      <span>{pickLang(lang, { es: 'Ventana', ca: 'Finestra', en: 'Window' })}</span>
                    </button>
                  )}
                  {videoState.mode === 'embed' && onOpenInCloudBrowser && (
                    <button
                      type="button"
                      onClick={() => {
                        triggerHaptic('medium');
                        onOpenInCloudBrowser(
                          videoState.tracks[videoState.activeTrackIndex]?.sourceUrl || videoState.url
                        );
                      }}
                      title={pickLang(lang, {
                        es: 'Abrir en Cloud Browser aislado sin ventanas emergentes',
                        ca: 'Obrir en Cloud Browser aïllat sense finestres emergents',
                        en: 'Open in isolated ad-free Cloud Browser',
                      })}
                      className="min-h-[34px] px-2.5 rounded-xl text-xs font-bold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-400/30 flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all"
                    >
                      <Globe className="w-3.5 h-3.5 shrink-0" />
                      <span>Cloud HD</span>
                    </button>
                  )}
                </div>
              );
            })()}
          </div>
        ) : videoState.isLive && videoState.tracks.length > 1 ? (
          <div className="flex items-center gap-1 bg-[#121420] p-1 rounded-2xl border border-white/[0.08] shrink-0">
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
            <span className="truncate max-w-[180px]">
              {videoState.tracks[videoState.activeTrackIndex]?.label ||
                (videoState.isLive
                  ? pickLang(lang, { es: 'Señal en directo', ca: 'Senyal en directe', en: 'Live feed' })
                  : pickLang(lang, { es: 'Proyección activa', ca: 'Projecció activa', en: 'Now playing' }))}
            </span>
            {videoState.mode === 'embed' && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  onOpenControlledExternalWindow();
                }}
                className="min-h-[32px] px-2.5 rounded-xl text-xs font-bold bg-[#9146FF]/20 hover:bg-[#9146FF]/35 text-[#D8B4FE] border border-[#9146FF]/45 flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <RiffanPlayIcon size={12} tone="current" />
                <span>{pickLang(lang, { es: 'Ventana', ca: 'Finestra', en: 'Window' })}</span>
              </button>
            )}
            {videoState.mode === 'embed' && onOpenInCloudBrowser && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  onOpenInCloudBrowser(videoState.url);
                }}
                className="min-h-[32px] px-2.5 rounded-xl text-xs font-bold bg-emerald-500/15 hover:bg-emerald-500/25 text-emerald-300 border border-emerald-400/30 flex items-center gap-1 whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Globe className="w-3.5 h-3.5 shrink-0" />
                <span>Cloud HD</span>
              </button>
            )}
          </div>
        )}
      </div>

      {/* Row 2 (Right on Desktop): Sala · X + Solo Mando + Cast TV + Voz + Ajustes */}
      <div className="flex items-center justify-between sm:justify-end gap-1.5 shrink-0 overflow-x-auto no-scrollbar">
        {onToggleFloatingChat && (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onToggleFloatingChat();
            }}
            aria-pressed={floatingChatOpen}
            className={`relative min-h-[38px] px-3 rounded-2xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all border ${
              floatingChatOpen
                ? 'bg-[#9146FF] text-white border-[#BF94FF]/60 shadow-[0_4px_14px_rgba(145,70,255,0.4)]'
                : 'bg-[#121420] hover:bg-white/[0.1] text-zinc-100 border-white/[0.1]'
            }`}
          >
            <RiffanChatIcon size={15} tone={floatingChatOpen ? 'current' : 'brand'} />
            <span className="tabular-nums">Sala · {Math.max(1, participantCount)}</span>
            {unreadChatCount > 0 && !floatingChatOpen && (
              <span className="w-2 h-2 rounded-full bg-[#EB0400] shrink-0" aria-hidden="true" />
            )}
          </button>
        )}

        {hasConnectedSmartTv && (
          <button
            type="button"
            onClick={() => {
              triggerHaptic('light');
              onToggleBatterySaverTvMode();
            }}
            title={pickLang(lang, {
              es: 'Pausar vídeo en el móvil y usarlo solo como mando de la TV',
              ca: 'Pausar vídeo al mòbil i usar-lo només com a comandament de la TV',
              en: 'Pause phone video and use as TV remote only',
            })}
            className={`min-h-[38px] px-3 rounded-2xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all border ${
              batterySaverTvMode
                ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/50'
                : 'bg-[#26262C] hover:bg-white/[0.12] text-zinc-300 border-white/[0.09]'
            }`}
          >
            <Tv className="w-3.5 h-3.5 shrink-0" />
            <span>
              {batterySaverTvMode
                ? pickLang(lang, { es: 'Solo Mando ✓', ca: 'Només Comandament ✓', en: 'Remote Only ✓' })
                : pickLang(lang, { es: 'Solo Mando', ca: 'Només Comandament', en: 'Remote Only' })}
            </span>
          </button>
        )}

        <button
          type="button"
          onClick={onDirectCastToTv}
          className={`min-h-[38px] px-3.5 rounded-2xl text-xs font-bold flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all border ${
            isCastingToTv || hasConnectedSmartTv
              ? 'bg-emerald-500/20 text-emerald-200 border-emerald-400/50'
              : 'bg-[#9146FF]/15 hover:bg-[#9146FF]/25 text-[#BF94FF] border-[#9146FF]/40'
          }`}
          title={pickLang(lang, {
            es: 'Enviar vídeo directamente a tu TV (Chromecast / AirPlay 2 / Smart TV)',
            ca: 'Enviar vídeo directament a la teva TV (Chromecast / AirPlay 2 / Smart TV)',
            en: 'Cast video directly to your TV (Chromecast / AirPlay 2 / Smart TV)',
          })}
        >
          <RiffanCastIcon size={15} tone="current" />
          <span>
            {isCastingToTv
              ? pickLang(lang, { es: 'Transmitiendo', ca: 'Transmetent', en: 'Casting' })
              : 'Cast TV'}
          </span>
        </button>

        {voiceSlot}

        <button
          type="button"
          onClick={() => {
            triggerHaptic('medium');
            onOpenProMenu();
          }}
          className="min-h-[38px] px-3.5 rounded-2xl bg-[#26262C] hover:bg-white/[0.12] border border-white/[0.1] text-xs font-bold text-white flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer active:scale-95 transition-all"
        >
          <RiffanSlidersIcon size={15} tone="current" />
          <span>{pickLang(lang, { es: 'Ajustes', ca: 'Ajustos', en: 'Settings' })}</span>
        </button>
      </div>
    </div>
  );
};
