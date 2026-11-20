import React, { useEffect } from 'react';
import {
  Globe,
  Moon,
  PictureInPicture2,
  SlidersHorizontal,
  Subtitles,
  Sun,
  Upload,
  X,
} from 'lucide-react';
import type {
  AppLanguage,
  LanguageNoticePopup,
  SubtitleTrackItem,
  VideoState,
} from '../../types';
import { UI_COPY, pickLang } from '../../utils/i18n';
import { triggerHaptic } from '../../utils/haptics';
import { FlagBadgeSvg, type FlagCode } from '../ui/LanguageBadge';

interface PlayerProSettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  proMenuRef: React.RefObject<HTMLDivElement | null>;
  lang: AppLanguage;
  videoState: VideoState;
  currentTime: number;
  isCinemaMode: boolean;
  onToggleCinemaMode?: () => void;
  canUseNativePiPOrCast: boolean;
  isInPiP: boolean;
  onTogglePiP: (e: React.MouseEvent) => void;
  hlsAudioTracks: { id: number; name: string; lang: string; default?: boolean }[];
  selectedHlsAudioTrack: number;
  onSelectHlsAudioTrack: (trackId: number) => void;
  activeTrackLangCode: string;
  onQuickLanguageSwitch: (langCode: 'ES' | 'LAT' | 'VOSE' | 'EN') => void;
  onTriggerLanguagePopup: (notice: Omit<LanguageNoticePopup, 'id'>) => void;
  onSelectTrack: (trackIndex: number, currentTimeSec: number) => void;
  subtitleFileInputRef: React.RefObject<HTMLInputElement | null>;
  activeSubId: string;
  onSelectSubtitleTrack: (trackId: string) => void;
  subtitleTracks: SubtitleTrackItem[];
  subtitleOffsetSec: number;
  setSubtitleOffsetSec: React.Dispatch<React.SetStateAction<number>>;
  subtitleSize: 'sm' | 'md' | 'lg';
  setSubtitleSize: (sz: 'sm' | 'md' | 'lg') => void;
  subtitleStyle: { fontColor: string; bgOpacity: number };
  setSubtitleStyle: (patch: Partial<{ fontColor: string; bgOpacity: number }>) => void;
  syncOffsetMs: number;
  setSyncOffsetMs: (ms: number) => void;
  vocalBoostEnabled: boolean;
  onToggleVocalBoost: () => void;
  ambilightEnabled: boolean;
  setAmbilightEnabled: React.Dispatch<React.SetStateAction<boolean>>;
  playbackSpeed: number;
  onSelectSpeed: (rate: number) => void;
  qualityLevels: { index: number; height: number; bitrate?: number }[];
  selectedQuality: number;
  autoActiveHeight: number | null;
  onChangeQuality: (idx: number) => void;
}

export const PlayerProSettingsModal: React.FC<PlayerProSettingsModalProps> = ({
  isOpen,
  onClose,
  proMenuRef,
  lang,
  videoState,
  currentTime,
  isCinemaMode,
  onToggleCinemaMode,
  canUseNativePiPOrCast,
  isInPiP,
  onTogglePiP,
  hlsAudioTracks,
  selectedHlsAudioTrack,
  onSelectHlsAudioTrack,
  activeTrackLangCode,
  onQuickLanguageSwitch,
  onTriggerLanguagePopup,
  onSelectTrack,
  subtitleFileInputRef,
  activeSubId,
  onSelectSubtitleTrack,
  subtitleTracks,
  subtitleOffsetSec,
  setSubtitleOffsetSec,
  subtitleSize,
  setSubtitleSize,
  subtitleStyle,
  setSubtitleStyle,
  syncOffsetMs,
  setSyncOffsetMs,
  vocalBoostEnabled,
  onToggleVocalBoost,
  ambilightEnabled,
  setAmbilightEnabled,
  playbackSpeed,
  onSelectSpeed,
  qualityLevels,
  selectedQuality,
  autoActiveHeight,
  onChangeQuality,
}) => {
  const onCloseRef = React.useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!isOpen) return;
    const handlePointerDownOutside = (ev: PointerEvent) => {
      const target = ev.target as Node | null;
      if (proMenuRef.current && target && !proMenuRef.current.contains(target)) {
        onCloseRef.current();
      }
    };
    const id = window.setTimeout(() => {
      document.addEventListener('pointerdown', handlePointerDownOutside);
    }, 30);
    return () => {
      window.clearTimeout(id);
      document.removeEventListener('pointerdown', handlePointerDownOutside);
    };
  }, [isOpen, proMenuRef]);

  if (!isOpen) return null;
  const t = UI_COPY[lang];

  return (
    <div
      className="fixed inset-0 z-[195] pointer-events-none flex items-end sm:items-end justify-end p-2.5 sm:p-4 animate-fade-in"
    >
      <div
        ref={proMenuRef}
        role="dialog"
        aria-modal="false"
        aria-labelledby="naim-player-pro-settings-title"
        tabIndex={-1}
        onClick={(e) => e.stopPropagation()}
        className="pointer-events-auto w-[276px] sm:w-[306px] max-w-[calc(100vw-1.25rem)] rounded-2xl bg-[#0D0D12]/94 backdrop-blur-xl nc-specular-surface border border-white/[0.08] shadow-[0_14px_40px_rgba(0,0,0,0.85)] overflow-hidden flex flex-col max-h-[48vh] animate-sheet-up sm:animate-scale-in outline-none"
      >
        <div className="px-3 py-2 border-b border-white/[0.08] flex items-center justify-between gap-2 shrink-0">
          <div className="flex items-center gap-1.5 min-w-0">
            <div className="w-6 h-6 rounded-lg bg-[#7C3AED]/20 border border-[#8B5CF6]/35 flex items-center justify-center text-[#A78BFA] shrink-0">
              <SlidersHorizontal className="w-3 h-3" />
            </div>
            <div className="min-w-0">
              <h3 id="naim-player-pro-settings-title" className="text-[11px] font-bold text-white tracking-tight leading-snug">
                {pickLang(lang, {
                  es: 'Ajustes rápidos',
                  ca: 'Ajustos ràpids',
                  en: 'Quick Settings',
                })}
              </h3>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-6 h-6 rounded-lg hover:bg-white/10 flex items-center justify-center text-zinc-300 cursor-pointer shrink-0"
            aria-label={t.closeModal}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="p-2.5 overflow-y-auto custom-scrollbar space-y-2 pb-[max(0.65rem,env(safe-area-inset-bottom))] text-[11px]">
          <div className="grid grid-cols-2 gap-1.5">
            {onToggleCinemaMode && (
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  onToggleCinemaMode();
                }}
                className={`min-h-[34px] px-2 py-1 rounded-xl border flex items-center justify-center gap-1.5 text-[11px] font-bold transition-all active:scale-95 cursor-pointer ${
                  isCinemaMode
                    ? 'bg-amber-400/20 border-amber-400/50 text-amber-200'
                    : 'bg-white/[0.05] hover:bg-white/[0.09] border-white/[0.08] text-zinc-200'
                }`}
              >
                {isCinemaMode ? (
                  <Sun className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                ) : (
                  <Moon className="w-3.5 h-3.5 text-amber-300 shrink-0" />
                )}
                <span>{pickLang(lang, { es: 'Cine', ca: 'Cinema', en: 'Cinema' })}</span>
              </button>
            )}

            {canUseNativePiPOrCast && (
              <button
                type="button"
                onClick={(e) => {
                  onTogglePiP(e);
                  onClose();
                }}
                className={`min-h-[34px] px-2 py-1 rounded-xl border flex items-center justify-center gap-1.5 text-[11px] font-bold transition-all active:scale-95 cursor-pointer ${
                  isInPiP
                    ? 'bg-[#7C3AED]/25 border-[#8B5CF6]/60 text-white'
                    : 'bg-white/[0.05] hover:bg-white/[0.09] border-white/[0.08] text-zinc-200'
                }`}
              >
                <PictureInPicture2 className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                <span>PiP</span>
              </button>
            )}
          </div>

          {(videoState.tracks.length > 0 || hlsAudioTracks.length > 0 || !videoState.isLive) && (
            <div className="p-2 rounded-xl bg-white/[0.035] border border-white/[0.08] space-y-1.5">
              <div className="text-[11px] font-bold text-white flex items-center gap-1.5">
                <Globe className="w-3.5 h-3.5 text-[#8B5CF6]" />
                <span>
                  {pickLang(lang, {
                    es: 'Audio y Servidor',
                    ca: 'Àudio i Servidor',
                    en: 'Audio & Server',
                  })}
                </span>
              </div>

              {!videoState.isLive &&
                (videoState.tracks || []).some((tr) =>
                  ['ES', 'LAT', 'VOSE', 'EN'].includes(String(tr.lang || '').toUpperCase())
                ) && (
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        { code: 'ES', flagCode: 'es', label: 'Castellano' },
                        { code: 'LAT', flagCode: 'mx', label: 'Latino' },
                        { code: 'VOSE', flagCode: 'vose', label: 'VOSE' },
                        { code: 'EN', flagCode: 'uk', label: 'English' },
                      ] as readonly { code: 'ES' | 'LAT' | 'VOSE' | 'EN'; flagCode: FlagCode; label: string }[]
                    )
                      .filter((lBtn) =>
                        (videoState.tracks || []).some(
                          (tr) => String(tr.lang || '').toUpperCase() === lBtn.code
                        )
                      )
                      .map((lBtn) => {
                        const isCurrent = activeTrackLangCode === lBtn.code;
                        return (
                          <button
                            key={lBtn.code}
                            type="button"
                            onClick={() => {
                              onQuickLanguageSwitch(lBtn.code);
                              onClose();
                            }}
                            className={`min-h-[34px] px-2 rounded-lg text-[11px] font-bold cursor-pointer active:scale-95 transition-all border inline-flex items-center justify-center gap-1.5 ${
                              isCurrent
                                ? 'bg-[#7C3AED] border-[#8B5CF6] text-white'
                                : 'bg-white/[0.06] hover:bg-white/[0.12] border-white/[0.08] text-zinc-200'
                            }`}
                          >
                            <FlagBadgeSvg code={lBtn.flagCode} className="w-4 h-2.5 shrink-0" />
                            <span>{lBtn.label}</span>
                          </button>
                        );
                      })}
                  </div>
                )}

              {hlsAudioTracks.length > 0 && (
                <div className="space-y-1.5">
                  <label htmlFor="naim-hls-audio-select" className="block text-[11px] font-semibold text-zinc-400">
                    {t.audioTrackEmbedded}
                  </label>
                  <select
                    id="naim-hls-audio-select"
                    aria-label={t.audioTrackEmbedded}
                    value={selectedHlsAudioTrack}
                    onChange={(e) => onSelectHlsAudioTrack(Number(e.target.value))}
                    className="w-full min-h-[36px] px-3 rounded-lg bg-[#26262C] border border-white/15 text-xs font-semibold text-white outline-none cursor-pointer"
                  >
                    {hlsAudioTracks.map((tr) => (
                      <option key={tr.id} value={tr.id} className="bg-[#18181B]">
                        {tr.name}{tr.lang ? ` (${tr.lang})` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {videoState.tracks.length > 1 && (
                <select
                  aria-label={pickLang(lang, {
                    es: 'Seleccionar servidor o canal',
                    ca: 'Seleccionar servidor o canal',
                    en: 'Select server or channel',
                  })}
                  value={videoState.activeTrackIndex}
                  onChange={(e) => {
                    const nextIdx = Number(e.target.value);
                    const chosen = videoState.tracks[nextIdx];
                    if (chosen) {
                      onTriggerLanguagePopup({
                        type: 'success',
                        title: pickLang(lang, {
                          es: `Cambiando a: ${chosen.label}`,
                          ca: `Canviant a: ${chosen.label}`,
                          en: `Switching to: ${chosen.label}`,
                        }),
                        subtitle: pickLang(lang, {
                          es: 'Sincronizando señal de audio HD...',
                          ca: 'Sincronitzant senyal d’àudio HD...',
                          en: 'Syncing HD audio stream...',
                        }),
                      });
                    }
                    onSelectTrack(nextIdx, currentTime);
                    onClose();
                  }}
                  className="w-full min-h-[36px] px-3 rounded-lg bg-[#26262C] border border-white/15 text-xs font-semibold text-white outline-none cursor-pointer"
                >
                  {videoState.tracks.map((track, idx) => (
                    <option key={track.id || idx} value={idx} className="bg-[#18181B]">
                      {track.label}
                    </option>
                  ))}
                </select>
              )}
            </div>
          )}

          <div className="p-2 rounded-xl bg-white/[0.035] border border-white/[0.08] space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-white flex items-center gap-1.5">
                <Subtitles className="w-3.5 h-3.5 text-sky-400" />
                <span>
                  {pickLang(lang, {
                    es: 'Subtítulos',
                    ca: 'Subtítols',
                    en: 'Subtitles',
                  })}
                </span>
              </span>
              <button
                type="button"
                onClick={() => subtitleFileInputRef.current?.click()}
                className="min-h-[28px] px-2.5 rounded-lg bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/30 text-[10px] font-bold text-sky-300 flex items-center gap-1 cursor-pointer"
              >
                <Upload className="w-3 h-3" />
                <span>.SRT / .VTT</span>
              </button>
            </div>

            <select
              aria-label={pickLang(lang, { es: 'Pista de subtítulos', ca: 'Pista de subtítols', en: 'Subtitle track' })}
              value={activeSubId}
              onChange={(e) => onSelectSubtitleTrack(e.target.value)}
              className="w-full min-h-[34px] px-2.5 rounded-lg bg-[#26262C] border border-white/15 text-[11px] font-semibold text-white outline-none cursor-pointer"
            >
              <option value="off">
                {pickLang(lang, {
                  es: 'Subtítulos desactivados',
                  ca: 'Subtítols desactivats',
                  en: 'Subtitles off',
                })}
              </option>
              {subtitleTracks.map((st) => (
                <option key={st.id} value={st.id}>
                  {st.label}
                </option>
              ))}
            </select>

            {activeSubId !== 'off' && (
              <div className="space-y-1.5 pt-0.5">
                <div className="flex items-center justify-between gap-1.5">
                  <div className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setSubtitleOffsetSec((s) => Number((s - 0.5).toFixed(1)))}
                      className="min-h-[30px] px-2 rounded-lg bg-white/10 hover:bg-white/20 font-mono text-[10px] text-white cursor-pointer"
                    >
                      -0.5s
                    </button>
                    <span className="font-mono text-[10px] text-sky-300 min-w-[40px] text-center">
                      {subtitleOffsetSec >= 0 ? `+${subtitleOffsetSec}s` : `${subtitleOffsetSec}s`}
                    </span>
                    <button
                      type="button"
                      onClick={() => setSubtitleOffsetSec((s) => Number((s + 0.5).toFixed(1)))}
                      className="min-h-[30px] px-2 rounded-lg bg-white/10 hover:bg-white/20 font-mono text-[10px] text-white cursor-pointer"
                    >
                      +0.5s
                    </button>
                  </div>

                  <div className="flex items-center gap-1">
                    {(['sm', 'md', 'lg'] as const).map((sz) => (
                      <button
                        key={sz}
                        type="button"
                        onClick={() => setSubtitleSize(sz)}
                        className={`min-h-[30px] min-w-[30px] rounded-lg text-[10px] font-bold uppercase cursor-pointer ${
                          subtitleSize === sz
                            ? 'bg-[#7C3AED] text-white'
                            : 'bg-white/[0.06] text-zinc-300'
                        }`}
                      >
                        {sz === 'sm' ? 'S' : sz === 'md' ? 'M' : 'L'}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between gap-2 text-[10px] text-zinc-300">
                  <span>{pickLang(lang, { es: 'Color / Fondo', ca: 'Color / Fons', en: 'Color / Box' })}</span>
                  <div className="flex items-center gap-1">
                    {(['#FFFFFF', '#FDE047', '#38BDF8'] as const).map((clr) => (
                      <button
                        key={clr}
                        type="button"
                        onClick={() => setSubtitleStyle({ fontColor: clr })}
                        className={`w-5 h-5 rounded-full border-2 cursor-pointer ${
                          subtitleStyle.fontColor === clr ? 'border-white scale-110' : 'border-white/30'
                        }`}
                        style={{ backgroundColor: clr }}
                        aria-label={`${pickLang(lang, { es: 'Color subtítulos', ca: 'Color subtítols', en: 'Subtitle color' })} ${clr}`}
                      />
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        setSubtitleStyle({
                          bgOpacity: subtitleStyle.bgOpacity > 0.15 ? 0 : 0.35,
                        })
                      }
                      className="px-2 py-0.5 rounded-md bg-white/10 text-[10px] font-semibold text-white cursor-pointer"
                    >
                      {pickLang(lang, { es: 'Caja', ca: 'Caixa', en: 'Box' })}: {subtitleStyle.bgOpacity > 0.15 ? 'ON' : 'OFF'}
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setSubtitleStyle({
                          textOpacity: (subtitleStyle.textOpacity ?? 0.82) < 0.95 ? 1 : 0.82,
                        })
                      }
                      className="px-2 py-0.5 rounded-md bg-white/10 text-[10px] font-semibold text-white cursor-pointer"
                    >
                      {(subtitleStyle.textOpacity ?? 0.82) < 0.95 ? '82%' : '100%'}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {!videoState.isLive && (
              <div className="flex items-center justify-between gap-1.5 pt-1.5 border-t border-white/[0.06] text-[10px]">
                <span className="text-zinc-300 font-medium">
                  {pickLang(lang, {
                    es: 'Sync sala',
                    ca: 'Sync sala',
                    en: 'Room sync',
                  })}
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setSyncOffsetMs(syncOffsetMs - 50)}
                    className="px-2 py-0.5 rounded-md bg-white/10 hover:bg-white/20 font-mono text-white cursor-pointer"
                  >
                    -50ms
                  </button>
                  <span className="font-mono text-zinc-200 min-w-[46px] text-center">
                    {syncOffsetMs >= 0 ? `+${syncOffsetMs}ms` : `${syncOffsetMs}ms`}
                  </span>
                  <button
                    type="button"
                    onClick={() => setSyncOffsetMs(syncOffsetMs + 50)}
                    className="px-2 py-0.5 rounded-md bg-white/10 hover:bg-white/20 font-mono text-white cursor-pointer"
                  >
                    +50ms
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="p-2 rounded-xl bg-white/[0.035] border border-white/[0.08] space-y-1.5">
            <div className="grid grid-cols-2 gap-1.5">
              <button
                type="button"
                onClick={onToggleVocalBoost}
                className={`min-h-[34px] px-2.5 rounded-xl border text-[10px] font-bold flex items-center justify-between cursor-pointer ${
                  vocalBoostEnabled
                    ? 'bg-emerald-500/20 border-emerald-400/50 text-emerald-200'
                    : 'bg-[#26262C] border-white/[0.08] text-zinc-300'
                }`}
              >
                <span>{pickLang(lang, { es: 'Voces +', ca: 'Veus +', en: 'Vocal +' })}</span>
                <span className="font-mono text-[9px]">
                  {vocalBoostEnabled ? 'ON' : 'OFF'}
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  setAmbilightEnabled((v) => {
                    const next = !v;
                    try {
                      localStorage.setItem('naim_ambilight_v1', String(next));
                    } catch {
                      // ignore
                    }
                    return next;
                  })
                }
                className={`min-h-[34px] px-2.5 rounded-xl border text-[10px] font-bold flex items-center justify-between cursor-pointer ${
                  ambilightEnabled
                    ? 'bg-[#7C3AED]/20 border-[#8B5CF6]/50 text-white'
                    : 'bg-white/[0.06] border-white/[0.08] text-zinc-300'
                }`}
              >
                <span>Ambilight</span>
                <span className="font-mono text-[9px]">
                  {ambilightEnabled ? 'ON' : 'OFF'}
                </span>
              </button>
            </div>

            {!videoState.isLive && (
              <div className="space-y-1 pt-0.5">
                <span className="text-[10px] font-semibold text-zinc-400">
                  {pickLang(lang, {
                    es: 'Velocidad',
                    ca: 'Velocitat',
                    en: 'Speed',
                  })}
                </span>
                <div className="grid grid-cols-5 gap-1">
                  {[0.75, 1, 1.25, 1.5, 2].map((spd) => (
                    <button
                      key={spd}
                      type="button"
                      onClick={() => onSelectSpeed(spd)}
                      className={`min-h-[28px] rounded-lg font-mono text-[10px] font-bold cursor-pointer ${
                        playbackSpeed === spd
                          ? 'bg-[#7C3AED] text-white'
                          : 'bg-white/[0.06] hover:bg-white/15 text-zinc-300'
                      }`}
                    >
                      {spd}x
                    </button>
                  ))}
                </div>
              </div>
            )}

            {qualityLevels.length > 0 && (
              <div className="flex items-center justify-between pt-0.5">
                <span className="text-[10px] font-semibold text-zinc-400">
                  {t.qualityLabel}
                </span>
                <select
                  aria-label={t.qualityLabel}
                  value={selectedQuality}
                  onChange={(e) => onChangeQuality(Number(e.target.value))}
                  className="min-h-[30px] px-2.5 rounded-lg bg-black/60 border border-white/15 text-[11px] font-mono text-white outline-none cursor-pointer"
                >
                  <option value={-1}>
                    {autoActiveHeight ? `${t.qualityAuto} (${autoActiveHeight}p)` : `${t.qualityAuto} (HD)`}
                  </option>
                  {qualityLevels.map((q) => (
                    <option key={q.index} value={q.index}>
                      {q.height}p
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
