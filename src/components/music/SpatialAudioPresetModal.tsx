import React, { useEffect, useState } from 'react';
import {
  Activity,
  Check,
  Clock,
  Disc3,
  HardDrive,
  Headphones,
  Orbit,
  Radio,
  Sparkles,
  X,
} from 'lucide-react';
import { useMusicStore } from '../../store/useMusicStore';
import type { CanonicalSpatialPresetId } from '../../types/music';
import { useBackInterceptor } from '../../lib/backInterceptor';
import { triggerHaptic } from '../../utils/haptics';
import { MUSIC_I18N, type MusicLang } from './musicI18n';
import {
  SPATIAL_PRESET_LIST,
  normalizeSpatialPresetId,
} from './spatialPresets';
import { getSpatial8dTelemetry, saveTrackToOfflineLibrary } from './MusicAudioEngine';

const PRESET_ICONS: Record<CanonicalSpatialPresetId, React.ComponentType<{ className?: string }>> = {
  orbit_drift: Orbit,
  arena_live: Radio,
  deep_3d: Headphones,
  dynamic_groove: Activity,
  intimate_room: Disc3,
};

const MODAL_LABELS: Record<
  MusicLang,
  {
    headerTitle: string;
    headerSub: string;
    headphoneNote: string;
    activeLabel: string;
    timerLabel: string;
  }
> = {
  es: {
    headerTitle: 'Audio Espacial 8D',
    headerSub: 'Selecciona un ambiente acústico precalibrado',
    headphoneNote: 'Graves centrados (~140 Hz) · Óptimo con auriculares',
    activeLabel: 'Activo',
    timerLabel: 'Apagado',
  },
  en: {
    headerTitle: '8D Spatial Audio',
    headerSub: 'Choose a calibrated acoustic space',
    headphoneNote: 'Centered bass (~140 Hz) · Best with headphones',
    activeLabel: 'Active',
    timerLabel: 'Sleep',
  },
  fr: {
    headerTitle: 'Audio Spatial 8D',
    headerSub: 'Choisissez un espace acoustique calibré',
    headphoneNote: 'Basses centrées (~140 Hz) · Optimal au casque',
    activeLabel: 'Actif',
    timerLabel: 'Minuteur',
  },
  zh: {
    headerTitle: '8D 空间音频',
    headerSub: '选择大师调校的沉浸声场预设',
    headphoneNote: '低频稳固居中 (~140 Hz) · 佩戴耳机效果最佳',
    activeLabel: '已开启',
    timerLabel: '定时',
  },
  ca: {
    headerTitle: 'Àudio Espacial 8D',
    headerSub: 'Tria un ambient acústic precalibrat',
    headphoneNote: 'Greus centrats (~140 Hz) · Òptim amb auriculars',
    activeLabel: 'Actiu',
    timerLabel: 'Temporitzador',
  },
};

function formatCountdown(msRemaining: number): string {
  const totalSec = Math.max(0, Math.ceil(msRemaining / 1000));
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}:${String(s).padStart(2, '0')}`;
}

export const SpatialAudioPresetModal: React.FC = () => {
  const showEqModal = useMusicStore((s) => s.showEqModal);
  const setShowEqModal = useMusicStore((s) => s.setShowEqModal);
  const currentTrack = useMusicStore((s) => s.currentTrack);
  const isPlaying = useMusicStore((s) => s.isPlaying);
  const spatial8dEnabled = useMusicStore((s) => s.spatial8dEnabled);
  const setSpatial8dEnabled = useMusicStore((s) => s.setSpatial8dEnabled);
  const spatial8dMode = useMusicStore((s) => s.spatial8dMode);
  const setSpatial8dMode = useMusicStore((s) => s.setSpatial8dMode);
  const sleepTimerEndsAt = useMusicStore((s) => s.sleepTimerEndsAt);
  const setSleepTimerMinutes = useMusicStore((s) => s.setSleepTimerMinutes);
  const offlineTrackIds = useMusicStore((s) => s.offlineTrackIds);
  const musicLang = useMusicStore((s) => s.musicLang);
  const showMusicToast = useMusicStore((s) => s.showMusicToast);

  const m = MUSIC_I18N[musicLang];
  const labels = MODAL_LABELS[musicLang];
  const activePresetId = normalizeSpatialPresetId(spatial8dMode);
  const [orbitDeg, setOrbitDeg] = useState(0);
  const [timerRemainingMs, setTimerRemainingMs] = useState<number>(0);

  useBackInterceptor(showEqModal, 'music-eq-modal', () => setShowEqModal(false), { priority: 25 });

  // Live lightweight telemetry ring indicator when 8D is active
  useEffect(() => {
    if (!showEqModal || !spatial8dEnabled || !isPlaying) return;
    let raf = 0;
    const step = () => {
      const { angleRad } = getSpatial8dTelemetry();
      setOrbitDeg((angleRad * 180) / Math.PI);
      raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [showEqModal, spatial8dEnabled, isPlaying]);

  // Live countdown ticker when sleep timer is set
  useEffect(() => {
    if (!showEqModal || !sleepTimerEndsAt) {
      setTimerRemainingMs(0);
      return;
    }
    const update = () => setTimerRemainingMs(Math.max(0, sleepTimerEndsAt - Date.now()));
    update();
    const id = window.setInterval(update, 1000);
    return () => window.clearInterval(id);
  }, [showEqModal, sleepTimerEndsAt]);

  if (!showEqModal) return null;

  const isSavedOffline = currentTrack ? offlineTrackIds.includes(currentTrack.id) : false;

  const handleSelectPreset = (presetId: CanonicalSpatialPresetId) => {
    triggerHaptic('medium');
    setSpatial8dMode(presetId);
    if (!spatial8dEnabled) {
      setSpatial8dEnabled(true);
    }
  };

  const handleSaveOffline = async () => {
    if (!currentTrack) return;
    triggerHaptic('medium');
    const res = await saveTrackToOfflineLibrary(currentTrack);
    showMusicToast(res.ok ? m.savedOfflineBadge : res.error || 'Error');
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={() => setShowEqModal(false)}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={labels.headerTitle}
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-[460px] rounded-t-3xl sm:rounded-3xl bg-[#000000] border border-white/12 shadow-[0_24px_80px_rgba(0,0,0,0.95)] flex flex-col overflow-hidden animate-fade-in"
      >
        {/* Header with Master Switch & Live Spatial Radar Ring */}
        <header className="px-5 pt-5 pb-4 border-b border-white/[0.08] flex items-center justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <div
              className={`relative w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 border transition-colors duration-200 ${
                spatial8dEnabled
                  ? 'bg-[#3B82F6]/15 border-[#3B82F6]/50 text-[#60A5FA]'
                  : 'bg-white/[0.04] border-white/10 text-zinc-400'
              }`}
            >
              {spatial8dEnabled && (
                <span
                  aria-hidden="true"
                  className="absolute inset-0 pointer-events-none"
                  style={{ transform: `rotate(${orbitDeg}deg)` }}
                >
                  <span className="absolute -top-1 left-1/2 -translate-x-1/2 w-2 h-2 rounded-full bg-[#60A5FA] shadow-[0_0_8px_#60A5FA]" />
                </span>
              )}
              <Headphones className="w-5 h-5" />
            </div>

            <div className="min-w-0">
              <h3 className="font-display text-base font-extrabold text-white tracking-tight truncate">
                {labels.headerTitle}
              </h3>
              <p className="text-xs text-zinc-400 truncate mt-0.5">{labels.headerSub}</p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              role="switch"
              aria-checked={spatial8dEnabled}
              aria-label={labels.headerTitle}
              onClick={() => {
                triggerHaptic('medium');
                setSpatial8dEnabled(!spatial8dEnabled);
              }}
              className={`relative inline-flex h-8 w-14 shrink-0 items-center rounded-full border transition-colors duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6] ${
                spatial8dEnabled
                  ? 'bg-[#3B82F6] border-[#60A5FA]'
                  : 'bg-white/[0.08] border-white/15 hover:bg-white/[0.12]'
              }`}
            >
              <span
                className={`inline-block h-6 w-6 transform rounded-full bg-white shadow transition-transform duration-200 ${
                  spatial8dEnabled ? 'translate-x-7' : 'translate-x-1'
                }`}
              />
            </button>

            <button
              type="button"
              onClick={() => setShowEqModal(false)}
              aria-label={m.cancel}
              className="w-10 h-10 rounded-full bg-white/[0.05] hover:bg-white/[0.12] text-zinc-300 hover:text-white flex items-center justify-center cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* 5 Pre-Tuned Acoustic Profiles */}
        <div className="px-5 py-4 space-y-2.5">
          {SPATIAL_PRESET_LIST.map((preset) => {
            const Icon = PRESET_ICONS[preset.id];
            const isSelected = activePresetId === preset.id;
            const isActiveNow = isSelected && spatial8dEnabled;
            return (
              <button
                key={preset.id}
                type="button"
                onClick={() => handleSelectPreset(preset.id)}
                aria-pressed={isActiveNow}
                className={`w-full min-h-[60px] px-4 py-3 rounded-2xl border text-left flex items-center gap-3.5 cursor-pointer transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6] ${
                  isActiveNow
                    ? 'bg-[#3B82F6]/14 border-[#3B82F6] shadow-[0_8px_28px_rgba(59,130,246,0.18)]'
                    : isSelected
                    ? 'bg-white/[0.05] border-white/25 hover:bg-white/[0.08]'
                    : 'bg-[#09090C] border-white/[0.08] hover:border-white/20 hover:bg-white/[0.04]'
                }`}
              >
                <span
                  className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition-colors duration-150 ${
                    isActiveNow
                      ? 'bg-[#3B82F6] text-white'
                      : 'bg-white/[0.06] text-zinc-300'
                  }`}
                >
                  <Icon className="w-4.5 h-4.5" />
                </span>

                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-sm font-bold text-white truncate">
                      {preset.names[musicLang]}
                    </span>
                    {isActiveNow && (
                      <span className="text-[11px] font-semibold text-[#60A5FA] shrink-0">
                        {labels.activeLabel}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-zinc-400 truncate mt-0.5">
                    {preset.subtitles[musicLang]}
                  </p>
                </div>

                {isActiveNow && (
                  <Check className="w-4 h-4 text-[#60A5FA] shrink-0" aria-hidden="true" />
                )}
              </button>
            );
          })}
        </div>

        {/* Minimal Footer: Sleep Timer + Offline Save + Acoustic Note */}
        <footer className="px-5 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+18px)] border-t border-white/[0.08] bg-[#060608] space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-1.5 text-xs text-zinc-400 shrink-0">
              <Clock className="w-3.5 h-3.5 text-[#60A5FA]" />
              <span className="font-medium">{labels.timerLabel}</span>
              {timerRemainingMs > 0 && (
                <span className="text-[#60A5FA] font-bold tabular-nums ml-1">
                  {formatCountdown(timerRemainingMs)}
                </span>
              )}
            </div>

            <div className="flex items-center gap-1">
              {[null, 15, 30, 60].map((mins) => {
                const isOff = mins === null && !sleepTimerEndsAt;
                return (
                  <button
                    key={String(mins)}
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setSleepTimerMinutes(mins);
                    }}
                    className={`min-h-8 px-2.5 rounded-lg text-xs font-semibold cursor-pointer transition-colors ${
                      isOff
                        ? 'bg-white/12 text-white'
                        : 'bg-white/[0.04] hover:bg-white/[0.1] text-zinc-300'
                    }`}
                  >
                    {mins ? `${mins}m` : 'Off'}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-[11px] text-zinc-500 flex items-center gap-1.5 truncate">
              <Sparkles className="w-3 h-3 text-[#60A5FA] shrink-0" />
              <span className="truncate">{labels.headphoneNote}</span>
            </p>

            {currentTrack && (
              <button
                type="button"
                onClick={() => void handleSaveOffline()}
                className={`min-h-8 px-2.5 rounded-lg text-[11px] font-semibold inline-flex items-center gap-1.5 shrink-0 cursor-pointer transition-colors ${
                  isSavedOffline
                    ? 'text-[#60A5FA] bg-[#3B82F6]/15'
                    : 'text-zinc-300 bg-white/[0.05] hover:bg-white/[0.1]'
                }`}
              >
                <HardDrive className="w-3.5 h-3.5" />
                <span>{isSavedOffline ? m.savedOfflineBadge : m.saveOfflineBtn}</span>
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
};
