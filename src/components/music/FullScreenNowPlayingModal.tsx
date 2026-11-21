import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  BookmarkPlus,
  Car,
  Check,
  ChevronDown,
  Clock,
  Copy,
  Disc3,
  Download,
  FolderDown,
  HardDrive,
  Headphones,
  Heart,
  ListMusic,
  Mic2,
  Pause,
  Play,
  Plus,
  Radio,
  Repeat,
  Repeat1,
  RotateCcw,
  Shuffle,
  SkipBack,
  SkipForward,
  Sliders,
  Sparkles,
  ThumbsDown,
  Trash2,
} from 'lucide-react';
import { EQ_10_LABELS, useMusicStore } from '../../store/useMusicStore';
import type {
  EqPresetId,
  ExportBitrate,
  LyricsPayload,
  ProVibePresetId,
  Spatial8dMode,
  SpatialTrajectory,
} from '../../types/music';
import {
  EQ_10_BANDS_HZ,
  EQ_PRESETS,
  getSpatial8dTelemetry,
  sampleMusicSpectrum,
  saveTrackToOfflineLibrary,
  startDownloadMp3Job,
} from './MusicAudioEngine';
import { formatMusicTime } from './SpotifyPlayerBar';
import { useBackInterceptor } from '../../lib/backInterceptor';
import { triggerHaptic } from '../../utils/haptics';
import { CoverArt } from './CoverArt';
import { MUSIC_I18N } from './musicI18n';

export const EqAndTimerModal: React.FC = () => {
  const showEqModal = useMusicStore((s) => s.showEqModal);
  const setShowEqModal = useMusicStore((s) => s.setShowEqModal);
  const currentTrack = useMusicStore((s) => s.currentTrack);
  const duration = useMusicStore((s) => s.duration);
  const eqPreset = useMusicStore((s) => s.eqPreset);
  const setEqPreset = useMusicStore((s) => s.setEqPreset);
  const eqBands10 = useMusicStore((s) => s.eqBands10);
  const setEqBand10 = useMusicStore((s) => s.setEqBand10);
  const spatial8dEnabled = useMusicStore((s) => s.spatial8dEnabled);
  const toggleSpatial8d = useMusicStore((s) => s.toggleSpatial8d);
  const spatial8dMode = useMusicStore((s) => s.spatial8dMode);
  const setSpatial8dMode = useMusicStore((s) => s.setSpatial8dMode);
  const spatialTrajectory = useMusicStore((s) => s.spatialTrajectory);
  const setSpatialTrajectory = useMusicStore((s) => s.setSpatialTrajectory);
  const spatial8dSpeedSec = useMusicStore((s) => s.spatial8dSpeedSec);
  const setSpatial8dSpeedSec = useMusicStore((s) => s.setSpatial8dSpeedSec);
  const stereoWidth = useMusicStore((s) => s.stereoWidth);
  const setStereoWidth = useMusicStore((s) => s.setStereoWidth);
  const reverbMix = useMusicStore((s) => s.reverbMix);
  const setReverbMix = useMusicStore((s) => s.setReverbMix);
  const playbackRate = useMusicStore((s) => s.playbackRate);
  const setPlaybackRate = useMusicStore((s) => s.setPlaybackRate);
  const preservesPitch = useMusicStore((s) => s.preservesPitch);
  const setPreservesPitch = useMusicStore((s) => s.setPreservesPitch);
  const pitchSemitones = useMusicStore((s) => s.pitchSemitones);
  const setPitchSemitones = useMusicStore((s) => s.setPitchSemitones);
  const bassBoostDb = useMusicStore((s) => s.bassBoostDb);
  const setBassBoostDb = useMusicStore((s) => s.setBassBoostDb);
  const vocalCancel = useMusicStore((s) => s.vocalCancel);
  const setVocalCancel = useMusicStore((s) => s.setVocalCancel);
  const exciterMix = useMusicStore((s) => s.exciterMix);
  const setExciterMix = useMusicStore((s) => s.setExciterMix);
  const vinylCrackle = useMusicStore((s) => s.vinylCrackle);
  const setVinylCrackle = useMusicStore((s) => s.setVinylCrackle);
  const crossfadeSec = useMusicStore((s) => s.crossfadeSec);
  const setCrossfadeSec = useMusicStore((s) => s.setCrossfadeSec);
  const normalizeAudio = useMusicStore((s) => s.normalizeAudio);
  const setNormalizeAudio = useMusicStore((s) => s.setNormalizeAudio);
  const trimStartSec = useMusicStore((s) => s.trimStartSec);
  const trimEndSec = useMusicStore((s) => s.trimEndSec);
  const fadeSec = useMusicStore((s) => s.fadeSec);
  const setTrimRange = useMusicStore((s) => s.setTrimRange);
  const setFadeSec = useMusicStore((s) => s.setFadeSec);
  const exportBitrate = useMusicStore((s) => s.exportBitrate);
  const setExportBitrate = useMusicStore((s) => s.setExportBitrate);
  const autoDownloadMp3 = useMusicStore((s) => s.autoDownloadMp3);
  const setAutoDownloadMp3 = useMusicStore((s) => s.setAutoDownloadMp3);
  const wifiOnlyAutoDownload = useMusicStore((s) => s.wifiOnlyAutoDownload);
  const setWifiOnlyAutoDownload = useMusicStore((s) => s.setWifiOnlyAutoDownload);
  const perTrackProfilesEnabled = useMusicStore((s) => s.perTrackProfilesEnabled);
  const setPerTrackProfilesEnabled = useMusicStore((s) => s.setPerTrackProfilesEnabled);
  const saveCurrentTrackStudioProfile = useMusicStore((s) => s.saveCurrentTrackStudioProfile);
  const customPresets = useMusicStore((s) => s.customPresets);
  const saveCustomStudioPreset = useMusicStore((s) => s.saveCustomStudioPreset);
  const applyCustomStudioPreset = useMusicStore((s) => s.applyCustomStudioPreset);
  const deleteCustomStudioPreset = useMusicStore((s) => s.deleteCustomStudioPreset);
  const offlineTrackIds = useMusicStore((s) => s.offlineTrackIds);
  const activeProVibe = useMusicStore((s) => s.activeProVibe);
  const applyProVibe = useMusicStore((s) => s.applyProVibe);
  const resetProEditor = useMusicStore((s) => s.resetProEditor);
  const sleepTimerEndsAt = useMusicStore((s) => s.sleepTimerEndsAt);
  const setSleepTimerMinutes = useMusicStore((s) => s.setSleepTimerMinutes);
  const setShowDownloadDrawer = useMusicStore((s) => s.setShowDownloadDrawer);
  const autoplaySimilar = useMusicStore((s) => s.autoplaySimilar);
  const setAutoplaySimilar = useMusicStore((s) => s.setAutoplaySimilar);
  const setShowImportModal = useMusicStore((s) => s.setShowImportModal);
  const tasteProfile = useMusicStore((s) => s.tasteProfile);
  const musicLang = useMusicStore((s) => s.musicLang);
  const m = MUSIC_I18N[musicLang];

  const [studioTab, setStudioTab] = useState<'8d' | 'fx' | 'eq'>('8d');
  const [downloadStatus, setDownloadStatus] = useState<string | null>(null);
  const [presetNameInput, setPresetNameInput] = useState('');
  const [trackProfileSaved, setTrackProfileSaved] = useState(false);

  useBackInterceptor(showEqModal, 'music-eq-modal', () => setShowEqModal(false), { priority: 25 });

  // Interactive SVG polyline path for 10-band EQ curve
  const eqSvgPoints = useMemo(() => {
    const w = 300;
    const h = 68;
    const padX = 12;
    const padY = 8;
    return eqBands10
      .map((gain, idx) => {
        const x = padX + (idx / Math.max(1, eqBands10.length - 1)) * (w - padX * 2);
        const norm = (12 - gain) / 24;
        const y = padY + norm * (h - padY * 2);
        return `${x.toFixed(1)},${y.toFixed(1)}`;
      })
      .join(' ');
  }, [eqBands10]);

  if (!showEqModal) return null;

  const isSavedOffline = currentTrack ? offlineTrackIds.includes(currentTrack.id) : false;
  const maxTrackDur = Math.max(30, Math.round(duration || currentTrack?.durationSec || 240));

  const studioVibes: Array<{ id: ProVibePresetId; label: string }> = [
    { id: 'original', label: m.vibeOriginal },
    { id: '8d_ultra', label: m.vibe8dUltra },
    { id: 'slowed_reverb', label: m.vibeSlowed },
    { id: 'nightcore', label: m.vibeNightcore },
    { id: 'bass_extreme', label: m.vibeBass },
    { id: 'lofi_warmth', label: m.vibeLofi },
  ];

  const handleDownload = (fxMode: 'original' | 'fx') => {
    if (!currentTrack) return;
    triggerHaptic('medium');
    if (fxMode === 'original') {
      void startDownloadMp3Job(currentTrack, { mode: 'original', rate: 1, bassDb: 0 });
    } else {
      void startDownloadMp3Job(currentTrack);
    }
    setDownloadStatus(m.downloadingToast);
    window.setTimeout(() => setDownloadStatus(null), 2400);
  };

  const handleSaveOffline = async () => {
    if (!currentTrack) return;
    triggerHaptic('medium');
    setDownloadStatus(m.downloadingToast);
    const res = await saveTrackToOfflineLibrary(currentTrack);
    setDownloadStatus(res.ok ? m.savedOfflineBadge : res.error || 'Error');
    window.setTimeout(() => setDownloadStatus(null), 2400);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={() => setShowEqModal(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-lg max-h-[92dvh] rounded-t-3xl sm:rounded-3xl bg-[#0C0C0F] border border-[#3B82F6]/25 shadow-[0_24px_80px_rgba(0,0,0,0.9)] flex flex-col overflow-hidden"
      >
        {/* Sticky Studio Header */}
        <div className="shrink-0 px-4 sm:px-6 pt-4 pb-3 border-b border-white/[0.08] flex items-center justify-between gap-2 bg-[#131318]/95">
          <div className="flex items-center gap-2.5 min-w-0">
            <span className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#3B82F6]/25 to-[#60A5FA]/20 border border-[#3B82F6]/40 flex items-center justify-center text-[#60A5FA] shrink-0">
              <Sliders className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-extrabold text-white truncate">{m.studioTitle}</h3>
              <p className="text-[11px] text-zinc-400 truncate">{m.studioSubtitle}</p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                resetProEditor();
              }}
              title={m.resetStudio}
              className="h-9 px-2.5 rounded-full bg-white/[0.06] hover:bg-white/12 border border-white/10 text-[11px] font-semibold text-zinc-200 inline-flex items-center gap-1 cursor-pointer transition-colors"
            >
              <RotateCcw className="w-3.5 h-3.5 text-[#60A5FA]" />
              <span className="hidden sm:inline">{m.resetStudio}</span>
            </button>
            <button
              type="button"
              onClick={() => setShowEqModal(false)}
              aria-label={m.cancel}
              className="w-9 h-9 rounded-full bg-white/[0.06] hover:bg-white/12 text-zinc-300 flex items-center justify-center cursor-pointer"
            >
              <ChevronDown className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* 1-Tap Studio Vibes Strip */}
        <div className="shrink-0 px-4 sm:px-6 pt-3 pb-2 border-b border-white/[0.05] space-y-2 bg-[#0C0C0F]">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold uppercase tracking-wider text-[#60A5FA]">
              {m.proVibesTitle}
            </span>
            {currentTrack && (
              <span className="text-[11px] text-zinc-400 truncate max-w-[55%]">
                {currentTrack.title}
              </span>
            )}
          </div>
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar pb-0.5">
            {studioVibes.map((vibe) => {
              const active =
                activeProVibe === vibe.id ||
                (!activeProVibe &&
                  vibe.id === 'original' &&
                  !spatial8dEnabled &&
                  Math.abs(playbackRate - 1) < 0.02);
              return (
                <button
                  key={vibe.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('medium');
                    applyProVibe(vibe.id);
                  }}
                  className={`h-8 px-3 rounded-full text-[11px] font-bold whitespace-nowrap shrink-0 cursor-pointer transition-all ${
                    active
                      ? 'bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white shadow-[0_4px_14px_rgba(59,130,246,0.38)]'
                      : 'bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-zinc-200'
                  }`}
                >
                  {vibe.label}
                </button>
              );
            })}
          </div>

          {/* 3-Tab Studio Switcher */}
          <div className="grid grid-cols-3 gap-1.5 pt-1">
            {(
              [
                { id: '8d', label: m.studioTab8d, icon: Headphones },
                { id: 'fx', label: m.studioTabFx, icon: Sparkles },
                { id: 'eq', label: m.studioTabEq, icon: Sliders },
              ] as const
            ).map((tab) => {
              const Icon = tab.icon;
              const active = studioTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setStudioTab(tab.id);
                  }}
                  className={`h-9 px-2 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                    active
                      ? 'bg-[#3B82F6]/20 border border-[#3B82F6]/60 text-[#93C5FD]'
                      : 'bg-white/[0.04] hover:bg-white/[0.08] border border-white/5 text-zinc-400 hover:text-white'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Scrollable Studio Controls Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-4 sm:px-6 py-4 space-y-4">
          {studioTab === '8d' && (
            <div className="space-y-4">
              {/* Live 8D Activation Card */}
              <div
                className={`rounded-2xl border p-3.5 space-y-3 transition-colors ${
                  spatial8dEnabled
                    ? 'bg-[#3B82F6]/12 border-[#3B82F6]/45'
                    : 'bg-white/[0.03] border-white/10'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        spatial8dEnabled
                          ? 'bg-gradient-to-br from-[#2563EB] to-[#3B82F6] text-white'
                          : 'bg-white/[0.06] text-zinc-300'
                      }`}
                    >
                      <Headphones className="w-4 h-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="text-xs sm:text-sm font-bold text-white truncate">
                        {m.spatial8dTitle}
                      </p>
                      <p className="text-[11px] text-zinc-400 leading-snug">{m.spatial8dSub}</p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('medium');
                      toggleSpatial8d();
                    }}
                    aria-pressed={spatial8dEnabled}
                    className={`h-8 px-3.5 rounded-full text-xs font-black tracking-wide cursor-pointer shrink-0 transition-all ${
                      spatial8dEnabled
                        ? 'bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white shadow-[0_4px_14px_rgba(59,130,246,0.4)]'
                        : 'bg-white/10 text-zinc-200 hover:bg-white/18'
                    }`}
                  >
                    {spatial8dEnabled ? 'ON' : 'OFF'}
                  </button>
                </div>

                {/* 3 Room acoustics presets */}
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      { id: 'orbit', label: m.spatial8dOrbit },
                      { id: 'concert', label: m.spatial8dConcert },
                      { id: 'club', label: m.spatial8dClub },
                    ] as Array<{ id: Spatial8dMode; label: string }>
                  ).map((opt) => {
                    const active = spatial8dMode === opt.id;
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          if (!spatial8dEnabled) toggleSpatial8d();
                          setSpatial8dMode(opt.id);
                        }}
                        className={`min-h-9 px-2 rounded-xl border text-[11px] font-bold cursor-pointer transition-all ${
                          active && spatial8dEnabled
                            ? 'bg-[#3B82F6]/25 border-[#3B82F6] text-[#93C5FD]'
                            : 'bg-white/[0.04] border-white/10 text-zinc-300 hover:bg-white/[0.08]'
                        }`}
                      >
                        {opt.label}
                      </button>
                    );
                  })}
                </div>

                {/* 4 Spatial Trajectories */}
                <div className="space-y-1.5 pt-1">
                  <span className="text-[11px] font-semibold text-zinc-400">{m.trajectoryLabel}</span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5">
                    {(
                      [
                        { id: 'orbit', label: m.trajOrbit },
                        { id: 'pendulum', label: m.trajPendulum },
                        { id: 'figure8', label: m.trajFigure8 },
                        { id: 'elevated', label: m.trajElevated },
                      ] as Array<{ id: SpatialTrajectory; label: string }>
                    ).map((tr) => {
                      const active = spatialTrajectory === tr.id;
                      return (
                        <button
                          key={tr.id}
                          type="button"
                          onClick={() => {
                            triggerHaptic('light');
                            if (!spatial8dEnabled) toggleSpatial8d();
                            setSpatialTrajectory(tr.id);
                          }}
                          className={`min-h-8 px-2 rounded-lg border text-[11px] font-bold cursor-pointer transition-all ${
                            active && spatial8dEnabled
                              ? 'bg-[#60A5FA]/20 border-[#60A5FA] text-[#93C5FD]'
                              : 'bg-white/[0.04] border-white/10 text-zinc-300 hover:bg-white/[0.08]'
                          }`}
                        >
                          {tr.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Precision 8D Live Sliders */}
              <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3.5 space-y-3.5">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-zinc-200">{m.speedOrbitLabel}</span>
                    <span className="text-[#60A5FA] font-bold tabular-nums">
                      {spatial8dSpeedSec.toFixed(1)}s / 360°
                    </span>
                  </div>
                  <input
                    type="range"
                    min={3}
                    max={20}
                    step={0.5}
                    value={spatial8dSpeedSec}
                    onChange={(e) => setSpatial8dSpeedSec(Number(e.target.value))}
                    className="w-full h-1.5 accent-[#3B82F6] bg-white/15 rounded-full cursor-pointer"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-zinc-200">{m.stereoWidthLabel}</span>
                    <span className="text-[#60A5FA] font-bold tabular-nums">
                      {Math.round(stereoWidth * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={stereoWidth}
                    onChange={(e) => setStereoWidth(Number(e.target.value))}
                    className="w-full h-1.5 accent-[#60A5FA] bg-white/15 rounded-full cursor-pointer"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-zinc-200">{m.reverbDepthLabel}</span>
                    <span className="text-[#60A5FA] font-bold tabular-nums">
                      {Math.round((reverbMix / 0.75) * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={0.75}
                    step={0.02}
                    value={reverbMix}
                    onChange={(e) => setReverbMix(Number(e.target.value))}
                    className="w-full h-1.5 accent-[#3B82F6] bg-white/15 rounded-full cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}

          {studioTab === 'fx' && (
            <div className="space-y-4">
              {/* Tempo + Pitch Semitones + Vinyl Pitch Lock */}
              <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3.5 space-y-3.5">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-zinc-200">{m.playbackSpeed}</span>
                    <span className="text-[#60A5FA] font-bold tabular-nums">
                      {playbackRate.toFixed(2)}x
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0.65}
                    max={1.45}
                    step={0.01}
                    value={playbackRate}
                    onChange={(e) => setPlaybackRate(Number(e.target.value))}
                    className="w-full h-1.5 accent-[#3B82F6] bg-white/15 rounded-full cursor-pointer"
                  />
                  <div className="grid grid-cols-4 gap-1.5 pt-1">
                    {[0.85, 0.94, 1, 1.22].map((rate) => (
                      <button
                        key={rate}
                        type="button"
                        onClick={() => setPlaybackRate(rate)}
                        className={`h-8 rounded-lg border text-[11px] font-bold tabular-nums cursor-pointer transition-all ${
                          Math.abs(playbackRate - rate) < 0.015
                            ? 'bg-gradient-to-r from-[#2563EB] to-[#3B82F6] border-[#3B82F6] text-white'
                            : 'bg-white/[0.04] border-white/10 text-zinc-300 hover:bg-white/[0.08]'
                        }`}
                      >
                        {rate}x
                      </button>
                    ))}
                  </div>
                </div>

                {/* Pitch Semitones (-12..+12) */}
                <div className="space-y-1.5 pt-2 border-t border-white/[0.07]">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-zinc-200">{m.pitchSemitonesLabel}</span>
                    <span className="text-[#60A5FA] font-bold tabular-nums">
                      {pitchSemitones > 0 ? `+${pitchSemitones}` : pitchSemitones} st
                    </span>
                  </div>
                  <input
                    type="range"
                    min={-12}
                    max={12}
                    step={1}
                    value={pitchSemitones}
                    onChange={(e) => setPitchSemitones(Number(e.target.value))}
                    className="w-full h-1.5 accent-[#60A5FA] bg-white/15 rounded-full cursor-pointer"
                  />
                </div>

                {/* Pitch Lock Switch */}
                <div className="pt-2 border-t border-white/[0.07] flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white">{m.pitchLockLabel}</p>
                    <p className="text-[11px] text-zinc-400 leading-snug">{m.pitchLockSub}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('light');
                      setPreservesPitch(!preservesPitch);
                    }}
                    aria-pressed={preservesPitch}
                    className={`h-8 px-3 rounded-full text-xs font-black cursor-pointer shrink-0 transition-all ${
                      preservesPitch
                        ? 'bg-[#3B82F6]/25 border border-[#3B82F6] text-[#93C5FD]'
                        : 'bg-[#60A5FA]/20 border border-[#60A5FA]/60 text-[#93C5FD]'
                    }`}
                  >
                    {preservesPitch ? 'ON' : 'VINYL'}
                  </button>
                </div>
              </div>

              {/* Sub-Bass, Exciter, Lo-Fi Vinyl, Crossfade & Reverb */}
              <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3.5 space-y-3.5">
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-zinc-200">{m.bassBoostLabel}</span>
                    <span className="text-[#60A5FA] font-bold tabular-nums">
                      +{bassBoostDb.toFixed(1)} dB
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={12}
                    step={0.5}
                    value={bassBoostDb}
                    onChange={(e) => setBassBoostDb(Number(e.target.value))}
                    className="w-full h-1.5 accent-[#3B82F6] bg-white/15 rounded-full cursor-pointer"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-zinc-200">{m.exciterLabel}</span>
                    <span className="text-[#60A5FA] font-bold tabular-nums">
                      {Math.round(exciterMix * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={exciterMix}
                    onChange={(e) => setExciterMix(Number(e.target.value))}
                    className="w-full h-1.5 accent-[#60A5FA] bg-white/15 rounded-full cursor-pointer"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-zinc-200">{m.vinylCrackleLabel}</span>
                    <span className="text-[#60A5FA] font-bold tabular-nums">
                      {Math.round(vinylCrackle * 100)}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={vinylCrackle}
                    onChange={(e) => setVinylCrackle(Number(e.target.value))}
                    className="w-full h-1.5 accent-[#3B82F6] bg-white/15 rounded-full cursor-pointer"
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-semibold text-zinc-200">{m.crossfadeLabel}</span>
                    <span className="text-[#60A5FA] font-bold tabular-nums">
                      {crossfadeSec.toFixed(1)} s
                    </span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={10}
                    step={0.5}
                    value={crossfadeSec}
                    onChange={(e) => setCrossfadeSec(Number(e.target.value))}
                    className="w-full h-1.5 accent-[#60A5FA] bg-white/15 rounded-full cursor-pointer"
                  />
                </div>

                {/* Karaoke Vocal Cancel + LUFS Normalize */}
                <div className="pt-2 border-t border-white/[0.07] space-y-2.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-bold text-white">{m.vocalCancelLabel}</p>
                      <p className="text-[11px] text-zinc-400 leading-snug">{m.vocalCancelSub}</p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setVocalCancel(!vocalCancel)}
                      aria-pressed={vocalCancel}
                      className={`h-8 px-3 rounded-full text-xs font-black cursor-pointer shrink-0 ${
                        vocalCancel
                          ? 'bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white'
                          : 'bg-white/10 text-zinc-300'
                      }`}
                    >
                      {vocalCancel ? 'ON' : 'OFF'}
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-3">
                    <span className="text-xs font-bold text-white">{m.normalizeLabel}</span>
                    <button
                      type="button"
                      onClick={() => setNormalizeAudio(!normalizeAudio)}
                      aria-pressed={normalizeAudio}
                      className={`h-8 px-3 rounded-full text-xs font-black cursor-pointer shrink-0 ${
                        normalizeAudio
                          ? 'bg-[#3B82F6]/25 border border-[#3B82F6] text-[#93C5FD]'
                          : 'bg-white/10 text-zinc-300'
                      }`}
                    >
                      {normalizeAudio ? 'ON' : 'OFF'}
                    </button>
                  </div>
                </div>
              </div>

              {/* Trim Start / Trim End / Fade In-Out */}
              <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3.5 space-y-3">
                <p className="text-xs font-bold text-zinc-200">{m.trimFadeTitle}</p>
                <div className="grid grid-cols-3 gap-2">
                  <label className="space-y-1 text-[11px] text-zinc-400">
                    <span>{m.trimStartLabel} (s)</span>
                    <input
                      type="number"
                      min={0}
                      max={maxTrackDur - 2}
                      value={trimStartSec}
                      onChange={(e) => setTrimRange(Number(e.target.value), trimEndSec)}
                      className="w-full h-9 px-2.5 rounded-xl bg-white/[0.06] border border-white/15 text-xs text-white tabular-nums outline-none"
                    />
                  </label>
                  <label className="space-y-1 text-[11px] text-zinc-400">
                    <span>{m.trimEndLabel} (s)</span>
                    <input
                      type="number"
                      min={0}
                      max={maxTrackDur}
                      value={trimEndSec}
                      onChange={(e) => setTrimRange(trimStartSec, Number(e.target.value))}
                      className="w-full h-9 px-2.5 rounded-xl bg-white/[0.06] border border-white/15 text-xs text-white tabular-nums outline-none"
                    />
                  </label>
                  <label className="space-y-1 text-[11px] text-zinc-400">
                    <span>{m.fadeLabel} (s)</span>
                    <input
                      type="number"
                      min={0}
                      max={10}
                      step={0.5}
                      value={fadeSec}
                      onChange={(e) => setFadeSec(Number(e.target.value))}
                      className="w-full h-9 px-2.5 rounded-xl bg-white/[0.06] border border-white/15 text-xs text-white tabular-nums outline-none"
                    />
                  </label>
                </div>
              </div>
            </div>
          )}

          {studioTab === 'eq' && (
            <div className="space-y-4">
              {/* Interactive 10-Band EQ + SVG Response Curve */}
              <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3.5 space-y-3">
                <p className="text-xs font-semibold text-zinc-300">{m.eq10Subtitle}</p>

                <div className="rounded-xl bg-[#050A12] border border-white/[0.07] p-2">
                  <svg
                    viewBox="0 0 300 68"
                    className="w-full h-16 overflow-visible"
                    aria-hidden="true"
                  >
                    <line x1="0" y1="34" x2="300" y2="34" stroke="rgba(255,255,255,0.12)" strokeDasharray="4 4" />
                    <defs>
                      <linearGradient id="eqCurveGrad" x1="0" y1="0" x2="1" y2="0">
                        <stop offset="0%" stopColor="#3B82F6" />
                        <stop offset="100%" stopColor="#60A5FA" />
                      </linearGradient>
                    </defs>
                    <polyline
                      fill="none"
                      stroke="url(#eqCurveGrad)"
                      strokeWidth="2.6"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      points={eqSvgPoints}
                    />
                    {eqBands10.map((gain, idx) => {
                      const cx = 12 + (idx / 9) * 276;
                      const cy = 8 + ((12 - gain) / 24) * 52;
                      return <circle key={idx} cx={cx} cy={cy} r="3.4" fill="#93C5FD" />;
                    })}
                  </svg>
                </div>

                <div className="space-y-2">
                  {EQ_10_BANDS_HZ.map((hz, idx) => {
                    const gain = eqBands10[idx] ?? 0;
                    return (
                      <div key={hz} className="flex items-center gap-2.5">
                        <span className="w-11 text-[11px] font-bold text-zinc-400 tabular-nums shrink-0">
                          {EQ_10_LABELS[idx]}Hz
                        </span>
                        <input
                          type="range"
                          min={-12}
                          max={12}
                          step={0.5}
                          value={gain}
                          onChange={(e) => setEqBand10(idx, Number(e.target.value))}
                          className="flex-1 h-1.5 accent-[#3B82F6] bg-white/15 rounded-full cursor-pointer"
                        />
                        <span className="w-14 text-right text-[11px] font-bold text-[#60A5FA] tabular-nums shrink-0">
                          {gain > 0 ? `+${gain.toFixed(1)}` : gain.toFixed(1)} dB
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Acoustic EQ Presets */}
              <div className="space-y-2">
                <p className="text-xs font-semibold text-zinc-400">{m.eqProfile}</p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {(Object.keys(EQ_PRESETS) as EqPresetId[]).map((key) => {
                    const active = eqPreset === key;
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => {
                          triggerHaptic('light');
                          setEqPreset(key);
                        }}
                        className={`min-h-10 px-3 py-2 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                          active
                            ? 'bg-gradient-to-r from-[#2563EB] to-[#3B82F6] border-[#3B82F6] text-white font-bold shadow-[0_6px_18px_rgba(59,130,246,0.32)]'
                            : 'bg-white/[0.04] border-white/10 text-zinc-200 hover:bg-white/[0.08]'
                        }`}
                      >
                        {EQ_PRESETS[key].label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Custom Studio Presets */}
              <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3.5 space-y-2.5">
                <p className="text-xs font-bold text-zinc-300">{m.customPresetsTitle}</p>
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (!presetNameInput.trim()) return;
                    triggerHaptic('medium');
                    saveCustomStudioPreset(presetNameInput);
                    setPresetNameInput('');
                  }}
                  className="flex gap-2"
                >
                  <input
                    type="text"
                    value={presetNameInput}
                    onChange={(e) => setPresetNameInput(e.target.value)}
                    placeholder={m.savePresetPlaceholder}
                    className="flex-1 h-9 px-3 rounded-xl bg-white/[0.06] border border-white/15 focus:border-[#3B82F6] text-xs text-white outline-none"
                  />
                  <button
                    type="submit"
                    className="h-9 px-3 rounded-xl bg-[#3B82F6]/20 border border-[#3B82F6]/50 text-[#93C5FD] text-xs font-bold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <BookmarkPlus className="w-3.5 h-3.5" />
                    <span>{m.savePresetBtn}</span>
                  </button>
                </form>
                {customPresets.length > 0 && (
                  <div className="flex flex-wrap gap-1.5 pt-1">
                    {customPresets.map((cp) => (
                      <div
                        key={cp.id}
                        className="inline-flex items-center gap-1 h-8 pl-2.5 pr-1.5 rounded-full bg-white/[0.06] border border-white/10 text-xs text-zinc-200"
                      >
                        <button
                          type="button"
                          onClick={() => applyCustomStudioPreset(cp.id)}
                          className="font-semibold hover:text-[#60A5FA] cursor-pointer"
                        >
                          {cp.name}
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteCustomStudioPreset(cp.id)}
                          className="w-5 h-5 rounded-full hover:bg-white/10 text-zinc-400 hover:text-rose-400 flex items-center justify-center cursor-pointer"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Per-Track DSP Memory */}
              <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-white">{m.perTrackProfileLabel}</span>
                  <button
                    type="button"
                    onClick={() => setPerTrackProfilesEnabled(!perTrackProfilesEnabled)}
                    className={`h-7 px-3 rounded-full text-[11px] font-black cursor-pointer ${
                      perTrackProfilesEnabled
                        ? 'bg-[#3B82F6]/25 border border-[#3B82F6] text-[#93C5FD]'
                        : 'bg-white/10 text-zinc-300'
                    }`}
                  >
                    {perTrackProfilesEnabled ? 'ON' : 'OFF'}
                  </button>
                </div>
                {currentTrack && (
                  <button
                    type="button"
                    onClick={() => {
                      triggerHaptic('medium');
                      saveCurrentTrackStudioProfile();
                      setTrackProfileSaved(true);
                      window.setTimeout(() => setTrackProfileSaved(false), 2000);
                    }}
                    className="w-full h-9 rounded-xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-xs font-bold text-[#93C5FD] inline-flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    {trackProfileSaved ? <Check className="w-3.5 h-3.5" /> : <Sliders className="w-3.5 h-3.5" />}
                    <span>{m.saveTrackProfileBtn}</span>
                  </button>
                )}
              </div>

              {/* Radio Autoplay & Import Spotify / YouTube Music */}
              <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-xs font-bold text-white flex items-center gap-1.5">
                      <Radio className="w-3.5 h-3.5 text-[#60A5FA]" />
                      <span className="truncate">{m.autoplayLabel}</span>
                    </p>
                    <p className="text-[10px] text-zinc-400 truncate">{m.autoplaySub}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={autoplaySimilar}
                    onClick={() => {
                      triggerHaptic('light');
                      setAutoplaySimilar(!autoplaySimilar);
                    }}
                    className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors cursor-pointer ${
                      autoplaySimilar ? 'bg-[#30D158]' : 'bg-white/15'
                    }`}
                  >
                    <span
                      className={`inline-block h-4.5 w-4.5 transform rounded-full bg-white shadow transition-transform ${
                        autoplaySimilar ? 'translate-x-[22px]' : 'translate-x-[3px]'
                      }`}
                    />
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => {
                    triggerHaptic('light');
                    setShowEqModal(false);
                    setShowImportModal(true);
                  }}
                  className="w-full h-9 px-3 rounded-xl bg-[#3B82F6]/15 hover:bg-[#3B82F6]/25 border border-[#3B82F6]/40 text-xs font-bold text-[#93C5FD] inline-flex items-center justify-between cursor-pointer transition-colors"
                >
                  <span className="inline-flex items-center gap-2 truncate">
                    <Disc3 className="w-3.5 h-3.5 shrink-0" />
                    <span className="truncate">{m.importTitle}</span>
                  </span>
                  <span className="text-[10px] font-mono text-zinc-300 shrink-0 tabular-nums">
                    {tasteProfile.favoriteArtists.length + tasteProfile.favoriteGenres.length}
                  </span>
                </button>
              </div>

              {/* Sleep Timer */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-zinc-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5" /> {m.sleepTimer}
                  </span>
                  {sleepTimerEndsAt && (
                    <span className="text-[#60A5FA] font-semibold tabular-nums">
                      {Math.max(1, Math.ceil((sleepTimerEndsAt - Date.now()) / 60000))} {m.minsRemaining}
                    </span>
                  )}
                </div>
                <div className="grid grid-cols-4 gap-2">
                  {[null, 15, 30, 60].map((mins) => (
                    <button
                      key={String(mins)}
                      type="button"
                      onClick={() => setSleepTimerMinutes(mins)}
                      className={`min-h-10 rounded-xl border text-xs font-semibold cursor-pointer transition-all ${
                        mins === null && !sleepTimerEndsAt
                          ? 'bg-white/15 border-white/30 text-white'
                          : 'bg-white/[0.04] border-white/10 text-zinc-200 hover:bg-white/[0.08]'
                      }`}
                    >
                      {mins ? `${mins} min` : 'Off'}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Sticky Bitrate + Offline + MP3 Export Bar */}
        <div className="shrink-0 px-4 sm:px-6 pt-3 pb-[calc(env(safe-area-inset-bottom,0px)+14px)] border-t border-white/[0.08] bg-gradient-to-br from-[#131318] via-[#0C0C0F] to-[#0C0C0F] space-y-2.5">
          {/* Bitrate Selector + Offline Save + Queue Drawer */}
          <div className="flex items-center justify-between gap-2">
            <div className="inline-flex items-center p-0.5 rounded-lg bg-white/[0.06] border border-white/10">
              {(['128k', '192k', '320k'] as ExportBitrate[]).map((br) => (
                <button
                  key={br}
                  type="button"
                  onClick={() => setExportBitrate(br)}
                  className={`h-7 px-2 rounded-md text-[10px] font-extrabold cursor-pointer ${
                    exportBitrate === br
                      ? 'bg-[#3B82F6] text-white'
                      : 'text-zinc-300 hover:text-white'
                  }`}
                >
                  {br}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-1.5">
              {currentTrack && (
                <button
                  type="button"
                  onClick={() => void handleSaveOffline()}
                  className={`h-8 px-2.5 rounded-lg border text-[11px] font-bold inline-flex items-center gap-1 cursor-pointer ${
                    isSavedOffline
                      ? 'bg-[#3B82F6]/20 border-[#3B82F6] text-[#93C5FD]'
                      : 'bg-white/[0.06] border-white/10 text-zinc-200 hover:bg-white/[0.12]'
                  }`}
                >
                  <HardDrive className="w-3.5 h-3.5" />
                  <span>{isSavedOffline ? m.savedOfflineBadge : m.saveOfflineBtn}</span>
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  setShowEqModal(false);
                  setShowDownloadDrawer(true);
                }}
                title={m.downloadsTitle}
                className="w-8 h-8 rounded-lg bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[#60A5FA] flex items-center justify-center cursor-pointer"
              >
                <FolderDown className="w-4 h-4" />
              </button>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              disabled={!currentTrack}
              onClick={() => handleDownload('original')}
              className="h-10 px-2.5 rounded-xl bg-white/[0.08] hover:bg-white/[0.14] border border-white/15 text-white text-[11px] sm:text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-[#60A5FA] shrink-0" />
              <span className="truncate">{m.downloadMp3Btn}</span>
            </button>
            <button
              type="button"
              disabled={!currentTrack}
              onClick={() => handleDownload('fx')}
              className="h-10 px-2.5 rounded-xl bg-gradient-to-r from-[#3B82F6] to-[#60A5FA] hover:opacity-95 text-white text-[11px] sm:text-xs font-extrabold inline-flex items-center justify-center gap-1.5 cursor-pointer disabled:opacity-40 shadow-[0_6px_18px_rgba(59,130,246,0.32)] transition-opacity"
            >
              <Download className="w-3.5 h-3.5 shrink-0" />
              <span className="truncate">{m.downloadMp3FxBtn}</span>
            </button>
          </div>

          {downloadStatus && (
            <p className="text-[11px] text-[#93C5FD] font-semibold text-center">{downloadStatus}</p>
          )}

          <div className="flex items-center justify-between gap-2 pt-0.5">
            <div className="min-w-0">
              <p className="text-xs font-bold text-white truncate">{m.autoDownloadLabel}</p>
              <p className="text-[10px] text-zinc-400 truncate">
                {autoDownloadMp3 && wifiOnlyAutoDownload ? m.wifiOnlyLabel : m.autoDownloadSub}
              </p>
            </div>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => setWifiOnlyAutoDownload(!wifiOnlyAutoDownload)}
                className={`h-7 px-2 rounded-full text-[10px] font-bold cursor-pointer border ${
                  wifiOnlyAutoDownload
                    ? 'bg-[#60A5FA]/15 border-[#60A5FA]/50 text-[#93C5FD]'
                    : 'bg-white/[0.04] border-white/10 text-zinc-400'
                }`}
              >
                Wi-Fi
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  setAutoDownloadMp3(!autoDownloadMp3);
                }}
                aria-pressed={autoDownloadMp3}
                className={`h-8 px-3.5 rounded-full text-xs font-black cursor-pointer shrink-0 transition-all ${
                  autoDownloadMp3
                    ? 'bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white shadow-[0_4px_14px_rgba(59,130,246,0.4)]'
                    : 'bg-white/10 text-zinc-300 hover:bg-white/15'
                }`}
              >
                {autoDownloadMp3 ? 'ON' : 'OFF'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export const FullScreenNowPlayingModal: React.FC<{
  onOpenPlaylistPicker?: () => void;
}> = ({ onOpenPlaylistPicker }) => {
  const showNowPlayingModal = useMusicStore((s) => s.showNowPlayingModal);
  const setShowNowPlayingModal = useMusicStore((s) => s.setShowNowPlayingModal);
  const nowPlayingTab = useMusicStore((s) => s.nowPlayingTab);
  const setNowPlayingTab = useMusicStore((s) => s.setNowPlayingTab);
  const currentTrack = useMusicStore((s) => s.currentTrack);
  const activeRadio = useMusicStore((s) => s.activeRadio);
  const resolvedPlayback = useMusicStore((s) => s.resolvedPlayback);
  const switchPlaybackSource = useMusicStore((s) => s.switchPlaybackSource);
  const isPlaying = useMusicStore((s) => s.isPlaying);
  const currentTime = useMusicStore((s) => s.currentTime);
  const duration = useMusicStore((s) => s.duration);
  const shuffle = useMusicStore((s) => s.shuffle);
  const repeatMode = useMusicStore((s) => s.repeatMode);
  const likedTracks = useMusicStore((s) => s.likedTracks);
  const offlineTrackIds = useMusicStore((s) => s.offlineTrackIds);
  const exportBitrate = useMusicStore((s) => s.exportBitrate);

  const togglePlayPause = useMusicStore((s) => s.togglePlayPause);
  const playNext = useMusicStore((s) => s.playNext);
  const playPrev = useMusicStore((s) => s.playPrev);
  const requestSeek = useMusicStore((s) => s.requestSeek);
  const toggleShuffle = useMusicStore((s) => s.toggleShuffle);
  const cycleRepeat = useMusicStore((s) => s.cycleRepeat);
  const toggleLikeTrack = useMusicStore((s) => s.toggleLikeTrack);
  const dislikeTrack = useMusicStore((s) => s.dislikeTrack);
  const showMusicToast = useMusicStore((s) => s.showMusicToast);
  const setShowQueueDrawer = useMusicStore((s) => s.setShowQueueDrawer);
  const setShowEqModal = useMusicStore((s) => s.setShowEqModal);
  const setDriveModeOpen = useMusicStore((s) => s.setDriveModeOpen);
  const setShowDownloadDrawer = useMusicStore((s) => s.setShowDownloadDrawer);
  const spatial8dEnabled = useMusicStore((s) => s.spatial8dEnabled);
  const toggleSpatial8d = useMusicStore((s) => s.toggleSpatial8d);
  const musicLang = useMusicStore((s) => s.musicLang);
  const m = MUSIC_I18N[musicLang];

  const [lyrics, setLyrics] = useState<LyricsPayload | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [lyricsScale, setLyricsScale] = useState<'sm' | 'md' | 'lg'>('md');
  const [lyricsCopiedToast, setLyricsCopiedToast] = useState(false);
  const [orbitDeg, setOrbitDeg] = useState(0);
  const activeLineRef = useRef<HTMLButtonElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const artWrapperRef = useRef<HTMLDivElement | null>(null);
  const artGlowRef = useRef<HTMLDivElement | null>(null);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  useBackInterceptor(
    showNowPlayingModal,
    'music-now-playing-modal',
    () => setShowNowPlayingModal(false),
    { priority: 20 }
  );

  // Fetch synced lyrics on track change
  useEffect(() => {
    if (!currentTrack) {
      setLyrics(null);
      return;
    }
    let cancelled = false;
    setLyricsLoading(true);
    const qs = new URLSearchParams({
      artist: currentTrack.artist.name,
      title: currentTrack.title,
      album: currentTrack.album.title || '',
      duration: String(currentTrack.durationSec || 0),
    });
    fetch(`/api/music/lyrics?${qs.toString()}`)
      .then((r) => r.json())
      .then((data) => {
        if (!cancelled) {
          setLyrics(data as LyricsPayload);
          setLyricsLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLyrics({ found: false, synced: false, lines: [] });
          setLyricsLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [currentTrack?.id]);

  // Smooth Canvas FFT Spectrum, 8D Spatial Radar & Song-Synced Cover Artwork Animator
  useEffect(() => {
    if (!showNowPlayingModal) return;
    let raf = 0;
    let smoothedBass = 0;
    const renderCanvas = (ts: number) => {
      const barsCount = 32;
      const sampled = isPlaying
        ? sampleMusicSpectrum(barsCount)
        : Array.from({ length: barsCount }, () => 0.14);
      const allFlat = isPlaying && sampled.every((v) => v <= 0.15);
      const values = allFlat
        ? sampled.map((_, idx) => 0.2 + Math.abs(Math.sin(ts / 245 + idx * 0.52)) * 0.65)
        : sampled;

      // Drive synchronized cover artwork pulse & ambient glow directly via DOM refs at 60fps
      if (artWrapperRef.current) {
        if (isPlaying) {
          const bassBins = values.slice(0, 6);
          const bassAvg = bassBins.reduce((sum, v) => sum + v, 0) / bassBins.length;
          const midBins = values.slice(6, 16);
          const midAvg = midBins.reduce((sum, v) => sum + v, 0) / midBins.length;
          const instantEnergy = bassAvg * 0.72 + midAvg * 0.28;
          smoothedBass = smoothedBass * 0.72 + instantEnergy * 0.28;
          const scale = 1 + Math.min(0.065, smoothedBass * 0.075);
          const swayDeg = Math.sin(ts / 880) * Math.min(1.6, smoothedBass * 2.1);
          const floatY = Math.cos(ts / 640) * Math.min(3, smoothedBass * 3.8);
          artWrapperRef.current.style.transform = `translate3d(0, ${floatY.toFixed(2)}px, 0) scale(${scale.toFixed(4)}) rotate(${swayDeg.toFixed(2)}deg)`;
          if (artGlowRef.current) {
            const glowScale = 1 + Math.min(0.18, smoothedBass * 0.22);
            const glowOpacity = Math.min(0.95, 0.42 + smoothedBass * 0.62);
            artGlowRef.current.style.transform = `scale(${glowScale.toFixed(4)})`;
            artGlowRef.current.style.opacity = glowOpacity.toFixed(3);
          }
        } else {
          smoothedBass = smoothedBass * 0.85;
          artWrapperRef.current.style.transform = 'translate3d(0, 0px, 0) scale(0.96) rotate(0deg)';
          if (artGlowRef.current) {
            artGlowRef.current.style.transform = 'scale(0.95)';
            artGlowRef.current.style.opacity = '0.24';
          }
        }
      }

      const canvas = canvasRef.current;
      if (canvas && nowPlayingTab === 'artwork') {
        const ctx = canvas.getContext('2d');
        if (ctx) {
          const w = canvas.width;
          const h = canvas.height;
          ctx.clearRect(0, 0, w, h);
          const gap = 3;
          const barW = Math.max(2, (w - gap * (barsCount - 1)) / barsCount);
          const grad = ctx.createLinearGradient(0, h, 0, 0);
          grad.addColorStop(0, '#1D4ED8');
          grad.addColorStop(0.55, '#3B82F6');
          grad.addColorStop(1, '#60A5FA');
          ctx.fillStyle = grad;

          values.forEach((v, idx) => {
            const barH = Math.max(4, Math.round(v * (h - 2)));
            const x = idx * (barW + gap);
            const y = h - barH;
            ctx.globalAlpha = 0.45 + v * 0.55;
            ctx.beginPath();
            ctx.roundRect(x, y, barW, barH, 3);
            ctx.fill();
          });
          ctx.globalAlpha = 1;
        }
      }
      if (isPlaying && nowPlayingTab === 'artwork') {
        const telemetry = getSpatial8dTelemetry();
        setOrbitDeg((telemetry.angleRad * 180) / Math.PI);
      }
      raf = requestAnimationFrame(renderCanvas);
    };
    raf = requestAnimationFrame(renderCanvas);
    return () => cancelAnimationFrame(raf);
  }, [showNowPlayingModal, nowPlayingTab, isPlaying]);

  const activeLyricIndex = useMemo(() => {
    if (!lyrics?.found || !lyrics.synced || lyrics.lines.length === 0) return -1;
    let idx = 0;
    for (let i = 0; i < lyrics.lines.length; i++) {
      if (lyrics.lines[i].timeSec <= currentTime + 0.35) {
        idx = i;
      } else {
        break;
      }
    }
    return idx;
  }, [lyrics, currentTime]);

  useEffect(() => {
    if (nowPlayingTab === 'lyrics' && activeLineRef.current) {
      activeLineRef.current.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }
  }, [activeLyricIndex, nowPlayingTab]);

  if (!showNowPlayingModal || (!currentTrack && !activeRadio)) return null;

  const isLiked = currentTrack ? likedTracks.some((t) => t.id === currentTrack.id) : false;
  const isSavedOffline = currentTrack ? offlineTrackIds.includes(currentTrack.id) : false;
  const coverSrc = activeRadio
    ? activeRadio.favicon
    : currentTrack?.album.coverXl || currentTrack?.album.cover || '';
  const effectiveDuration = duration > 0 ? duration : currentTrack?.durationSec || 0;

  const handleCopyLyrics = async () => {
    if (!lyrics?.found || lyrics.lines.length === 0) return;
    const text = lyrics.lines.map((l) => l.text).join('\n');
    try {
      await navigator.clipboard.writeText(text);
      setLyricsCopiedToast(true);
      window.setTimeout(() => setLyricsCopiedToast(false), 2000);
    } catch {
      // ignore clipboard restrictions
    }
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length !== 1) return;
    touchStartRef.current = { x: e.touches[0].clientX, y: e.touches[0].clientY };
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - start.x;
    const dy = e.changedTouches[0].clientY - start.y;
    // Vertical swipe-down dismisses Now Playing; horizontal swipe never skips tracks (buttons only)
    if (dy > 95 && Math.abs(dy) > Math.abs(dx) * 1.4) {
      triggerHaptic('light');
      setShowNowPlayingModal(false);
    }
  };

  const lyricSizeClasses =
    lyricsScale === 'sm'
      ? { active: 'text-xl sm:text-3xl', idle: 'text-sm sm:text-lg' }
      : lyricsScale === 'lg'
      ? { active: 'text-3xl sm:text-5xl', idle: 'text-lg sm:text-2xl' }
      : { active: 'text-2xl sm:text-4xl', idle: 'text-base sm:text-xl' };

  return (
    <div
      className="fixed inset-0 z-50 bg-[#000000] text-white flex flex-col overflow-hidden animate-fade-in"
      onTouchStart={handleTouchStart}
      onTouchEnd={handleTouchEnd}
    >
      {/* Ambient Blurred Album Background */}
      {coverSrc ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none opacity-40 blur-3xl scale-125 transition-all duration-700"
          style={{
            backgroundImage: `url("${coverSrc}")`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
          }}
        />
      ) : null}
      <div
        aria-hidden="true"
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            'radial-gradient(ellipse 80% 55% at 50% 25%, rgba(37,99,235,0.22), rgba(96,165,250,0.09) 45%, rgba(0,0,0,0.94) 85%), linear-gradient(to bottom, rgba(0,0,0,0.45), rgba(0,0,0,0.9) 70%, #000000)',
        }}
      />

      {/* Top Header */}
      <header className="relative z-10 flex items-center justify-between gap-2 px-3 sm:px-8 pt-[calc(env(safe-area-inset-top,0px)+12px)] pb-2.5">
        <button
          type="button"
          onClick={() => setShowNowPlayingModal(false)}
          aria-label={m.back}
          className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white/[0.08] hover:bg-white/15 flex items-center justify-center cursor-pointer transition-colors shrink-0 focus-visible:ring-2 focus-visible:ring-[#3B82F6]"
        >
          <ChevronDown className="w-5 h-5" />
        </button>

        {/* Segmented Mode Switch: Cover / Lyrics */}
        <div className="inline-flex items-center p-0.5 sm:p-1 rounded-full bg-white/[0.08] border border-white/12 backdrop-blur-md shrink min-w-0">
          <button
            type="button"
            onClick={() => setNowPlayingTab('artwork')}
            className={`px-3 sm:px-4 py-1.5 rounded-full text-[11px] sm:text-xs font-bold cursor-pointer transition-all whitespace-nowrap ${
              nowPlayingTab === 'artwork'
                ? 'bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white shadow-[0_4px_14px_rgba(59,130,246,0.35)]'
                : 'text-zinc-300 hover:text-white'
            }`}
          >
            {m.tabCover}
          </button>
          {currentTrack && (
            <button
              type="button"
              onClick={() => setNowPlayingTab('lyrics')}
              className={`px-3 sm:px-4 py-1.5 rounded-full text-[11px] sm:text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition-all whitespace-nowrap ${
                nowPlayingTab === 'lyrics'
                  ? 'bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white shadow-[0_4px_14px_rgba(59,130,246,0.35)]'
                  : 'text-zinc-300 hover:text-white'
              }`}
            >
              <Mic2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
              {m.tabLyrics}
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setShowNowPlayingModal(false);
              setDriveModeOpen(true);
            }}
            title={m.driveModeBtn}
            className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white/[0.08] hover:bg-white/15 flex items-center justify-center cursor-pointer transition-colors text-[#60A5FA]"
          >
            <Car className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
          </button>
          {onOpenPlaylistPicker && currentTrack && (
            <button
              type="button"
              onClick={onOpenPlaylistPicker}
              title={m.addToPlaylist}
              className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-white/[0.08] hover:bg-white/15 flex items-center justify-center cursor-pointer transition-colors"
            >
              <Plus className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setShowEqModal(true)}
            title={m.studioTitle}
            className="w-9 h-9 sm:w-11 sm:h-11 rounded-full bg-[#3B82F6]/18 hover:bg-[#3B82F6]/28 border border-[#3B82F6]/40 text-[#93C5FD] flex items-center justify-center cursor-pointer transition-colors"
          >
            <Sliders className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
          </button>
        </div>
      </header>

      {/* Main Content Stage */}
      <main className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center px-5 sm:px-10 py-2 overflow-hidden">
        {nowPlayingTab === 'artwork' && (
          <div className="w-full max-w-md flex flex-col items-center gap-4">
            <div className="relative flex items-center justify-center">
              {spatial8dEnabled && (
                <div
                  aria-hidden="true"
                  className="absolute -inset-5 sm:-inset-7 rounded-full border border-[#60A5FA]/35 pointer-events-none"
                >
                  <div className="w-full h-full relative" style={{ transform: `rotate(${orbitDeg}deg)` }}>
                    <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-gradient-to-r from-[#3B82F6] to-[#60A5FA] shadow-[0_0_16px_rgba(96,165,250,0.95)]" />
                  </div>
                </div>
              )}
              <div
                ref={artGlowRef}
                aria-hidden="true"
                className="absolute -inset-4 rounded-[36px] blur-2xl will-change-transform transition-[opacity] duration-300"
                style={{
                  background:
                    'radial-gradient(circle, rgba(59,130,246,0.42) 0%, rgba(96,165,250,0.22) 60%, transparent 100%)',
                  opacity: isPlaying ? 0.65 : 0.24,
                }}
              />
              <div
                ref={artWrapperRef}
                className="relative w-56 h-56 sm:w-76 sm:h-76 rounded-3xl overflow-hidden bg-gradient-to-br from-[#0B1622] to-[#070D14] border border-white/20 shadow-[0_28px_72px_rgba(0,0,0,0.88)] flex items-center justify-center will-change-transform"
              >
                <CoverArt
                  src={coverSrc}
                  alt={currentTrack?.title || activeRadio?.name || ''}
                  fallbackLabel={currentTrack?.artist.name || activeRadio?.name}
                  priority
                  className={`w-full h-full object-cover object-center transition-opacity duration-500 ${
                    isPlaying ? 'opacity-100' : 'opacity-80'
                  }`}
                />
                {activeRadio && !coverSrc && (
                  <Radio className="w-16 h-16 text-[#60A5FA] absolute pointer-events-none opacity-85" />
                )}
                {spatial8dEnabled && (
                  <span className="absolute top-3 left-3 px-2.5 py-1 rounded-full bg-[#000000]/80 backdrop-blur-md border border-[#3B82F6]/45 text-[10px] font-black tracking-wider text-[#93C5FD] inline-flex items-center gap-1">
                    <Headphones className="w-3 h-3 text-[#60A5FA]" />
                    {m.spatial8dBadgeLive}
                  </span>
                )}
              </div>
            </div>

            {/* Canvas Live FFT Spectrum Visualizer */}
            <canvas
              ref={canvasRef}
              width={320}
              height={38}
              aria-hidden="true"
              className="w-full max-w-xs h-9"
            />

            {/* Multi-Source Provider Switcher when alternatives exist */}
            {resolvedPlayback?.alternatives && resolvedPlayback.alternatives.length > 1 && (
              <div className="flex items-center justify-center gap-1.5 flex-wrap">
                {resolvedPlayback.alternatives.map((cand) => {
                  const active = resolvedPlayback.streamUrl === cand.streamUrl;
                  return (
                    <button
                      key={cand.id}
                      type="button"
                      onClick={() => {
                        triggerHaptic('light');
                        switchPlaybackSource(cand);
                      }}
                      className={`h-7 px-2.5 rounded-full text-[10px] font-bold cursor-pointer transition-all tabular-nums ${
                        active
                          ? 'bg-[#3B82F6]/25 border border-[#3B82F6] text-[#93C5FD]'
                          : 'bg-white/[0.06] border border-white/10 text-zinc-400 hover:text-white'
                      }`}
                    >
                      {cand.provider.toUpperCase()} {cand.bitrateKbps ? `· ${cand.bitrateKbps}k` : ''}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {nowPlayingTab === 'lyrics' && (
          <div className="w-full max-w-2xl flex-1 min-h-0 flex flex-col">
            {lyrics?.found && (
              <div className="shrink-0 flex items-center justify-center gap-2 pb-2">
                <button
                  type="button"
                  onClick={() =>
                    setLyricsScale((s) => (s === 'sm' ? 'md' : s === 'md' ? 'lg' : 'sm'))
                  }
                  className="h-7 px-2.5 rounded-full bg-white/[0.07] hover:bg-white/[0.14] text-[11px] font-bold text-zinc-200 cursor-pointer"
                >
                  {m.lyricsFontLabel}: {lyricsScale.toUpperCase()}
                </button>
                <button
                  type="button"
                  onClick={() => void handleCopyLyrics()}
                  className="h-7 px-2.5 rounded-full bg-white/[0.07] hover:bg-white/[0.14] text-[11px] font-bold text-zinc-200 inline-flex items-center gap-1 cursor-pointer"
                >
                  <Copy className="w-3 h-3 text-[#60A5FA]" />
                  <span>{lyricsCopiedToast ? m.lyricsCopied : m.copyLyricsBtn}</span>
                </button>
              </div>
            )}
            <div className="flex-1 min-h-0 overflow-y-auto px-2 sm:px-6 py-6 space-y-4 text-center mask-gradient">
              {lyricsLoading ? (
                <div className="py-20 text-zinc-400 text-sm">{m.searchingLyrics}</div>
              ) : !lyrics?.found ? (
                <div className="py-20 space-y-2">
                  <Mic2 className="w-10 h-10 text-[#60A5FA]/60 mx-auto" />
                  <p className="text-base font-semibold text-zinc-200">{m.noLyricsTitle}</p>
                  <p className="text-xs text-zinc-400">{m.noLyricsSub}</p>
                </div>
              ) : (
                lyrics.lines.map((line, idx) => {
                  const isActive = lyrics.synced && idx === activeLyricIndex;
                  const isPast = lyrics.synced && idx < activeLyricIndex;
                  return (
                    <button
                      key={`${idx}-${line.timeSec}`}
                      ref={isActive ? activeLineRef : undefined}
                      type="button"
                      onClick={() => {
                        if (lyrics.synced) requestSeek(line.timeSec);
                      }}
                      className={`block w-full text-center px-3 py-2 rounded-2xl transition-all duration-300 cursor-pointer ${
                        isActive
                          ? `text-white ${lyricSizeClasses.active} font-extrabold scale-[1.03] drop-shadow-[0_0_24px_rgba(59,130,246,0.55)] bg-white/[0.04]`
                          : isPast
                          ? `text-zinc-400/55 ${lyricSizeClasses.idle} font-semibold hover:text-white`
                          : `text-zinc-300/75 ${lyricSizeClasses.idle} font-semibold hover:text-white`
                      }`}
                    >
                      {line.text}
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </main>

      {/* Bottom Controls */}
      <footer className="relative z-10 w-full max-w-2xl mx-auto px-4 sm:px-8 pb-[calc(env(safe-area-inset-bottom,0px)+18px)] pt-2 space-y-3.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-lg sm:text-2xl font-extrabold text-white line-clamp-2 leading-tight">
              {activeRadio ? activeRadio.name : currentTrack?.title}
            </h2>
            <p className="text-xs sm:text-sm text-zinc-300 truncate mt-1">
              {activeRadio
                ? `${activeRadio.country} · ${activeRadio.tags.join(' · ')}`
                : `${currentTrack?.artist.name}${currentTrack?.album.title ? ` · ${currentTrack.album.title}` : ''}`}
            </p>
          </div>

          {currentTrack && (
            <div className="flex items-center gap-1 shrink-0 pt-0.5">
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('medium');
                  dislikeTrack(currentTrack);
                  showMusicToast('Menos recomendaciones de este tema');
                }}
                aria-label="No me interesa este tema"
                title="No me interesa este tema"
                className="min-w-10 min-h-10 rounded-full flex items-center justify-center text-zinc-400 hover:text-amber-300 hover:bg-white/[0.06] cursor-pointer transition-colors"
              >
                <ThumbsDown className="w-5 h-5" />
              </button>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  toggleLikeTrack(currentTrack);
                }}
                aria-label={isLiked ? m.likeRemove : m.likeAdd}
                className={`min-w-10 min-h-10 rounded-full flex items-center justify-center cursor-pointer transition-transform active:scale-90 ${
                  isLiked ? 'text-[#FF2D55]' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Heart className={`w-6 h-6 ${isLiked ? 'fill-current' : ''}`} />
              </button>
            </div>
          )}
        </div>

        {/* Studio Quick Action Strip: 8D + Offline + MP3 + Downloads + FX Studio */}
        <div className="flex items-center gap-2 overflow-x-auto no-scrollbar">
          <button
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              toggleSpatial8d();
            }}
            aria-pressed={spatial8dEnabled}
            className={`h-8 px-3 rounded-full text-[11px] font-black tracking-wide inline-flex items-center gap-1.5 cursor-pointer shrink-0 transition-all ${
              spatial8dEnabled
                ? 'bg-gradient-to-r from-[#2563EB] to-[#3B82F6] text-white shadow-[0_4px_16px_rgba(59,130,246,0.45)]'
                : 'bg-white/[0.08] hover:bg-white/[0.14] border border-white/10 text-zinc-200'
            }`}
          >
            <Headphones className="w-3.5 h-3.5" />
            <span>{m.spatial8dBtn}</span>
          </button>

          {currentTrack && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                void saveTrackToOfflineLibrary(currentTrack);
              }}
              className={`h-8 px-3 rounded-full border text-[11px] font-bold inline-flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors ${
                isSavedOffline
                  ? 'bg-[#3B82F6]/20 border-[#3B82F6] text-[#93C5FD]'
                  : 'bg-white/[0.08] hover:bg-white/[0.15] border-white/10 text-zinc-200'
              }`}
            >
              <HardDrive className="w-3.5 h-3.5" />
              <span>{isSavedOffline ? m.savedOfflineBadge : m.saveOfflineBtn}</span>
            </button>
          )}

          {currentTrack && (
            <button
              type="button"
              onClick={() => {
                triggerHaptic('medium');
                void startDownloadMp3Job(currentTrack);
              }}
              className="h-8 px-3 rounded-full bg-white/[0.08] hover:bg-white/[0.15] border border-white/10 text-[11px] font-bold text-white inline-flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
            >
              <Download className="w-3.5 h-3.5 text-[#60A5FA]" />
              <span>MP3 {exportBitrate}</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setShowEqModal(true)}
            className="h-8 px-3 rounded-full bg-white/[0.08] hover:bg-white/[0.15] border border-white/10 text-[11px] font-bold text-zinc-200 inline-flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
          >
            <Sparkles className="w-3.5 h-3.5 text-[#60A5FA]" />
            <span>{m.studioTabFx}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setShowNowPlayingModal(false);
              setShowDownloadDrawer(true);
            }}
            className="h-8 px-3 rounded-full bg-white/[0.08] hover:bg-white/[0.15] border border-white/10 text-[11px] font-bold text-zinc-200 inline-flex items-center gap-1.5 cursor-pointer shrink-0 transition-colors"
          >
            <FolderDown className="w-3.5 h-3.5 text-[#60A5FA]" />
            <span>{offlineTrackIds.length}</span>
          </button>
        </div>

        {/* Scrubber */}
        <div className="space-y-1.5">
          <input
            type="range"
            min={0}
            max={effectiveDuration || 100}
            value={activeRadio ? 100 : Math.min(currentTime, effectiveDuration || 100)}
            disabled={Boolean(activeRadio)}
            onChange={(e) => requestSeek(Number(e.target.value))}
            aria-label={m.playerRegionAria}
            className="w-full h-1.5 accent-[#3B82F6] bg-white/20 rounded-full cursor-pointer"
          />
          <div className="flex items-center justify-between text-xs text-zinc-400 tabular-nums">
            <span>{activeRadio ? 'LIVE' : formatMusicTime(currentTime)}</span>
            <span>
              {activeRadio
                ? 'STREAM 24/7'
                : resolvedPlayback?.sourceLabel
                ? `${resolvedPlayback.sourceLabel}${
                    resolvedPlayback.bitrateKbps ? ` · ${resolvedPlayback.bitrateKbps} kbps` : ''
                  } · ${formatMusicTime(effectiveDuration)}`
                : formatMusicTime(effectiveDuration)}
            </span>
          </div>
        </div>

        {/* Main Transport */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={toggleShuffle}
            disabled={Boolean(activeRadio)}
            aria-label={m.shuffle || 'Aleatorio'}
            className={`min-w-10 min-h-10 rounded-full flex items-center justify-center cursor-pointer disabled:opacity-30 ${
              shuffle ? 'text-[#60A5FA]' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Shuffle className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={playPrev}
            disabled={Boolean(activeRadio)}
            aria-label="Canción anterior"
            className="min-w-11 min-h-11 rounded-full flex items-center justify-center text-white hover:scale-105 cursor-pointer disabled:opacity-30"
          >
            <SkipBack className="w-7 h-7 fill-current" />
          </button>

          <button
            type="button"
            onClick={() => {
              triggerHaptic('medium');
              togglePlayPause();
            }}
            aria-label={isPlaying ? m.pause : m.playNow}
            className="w-15 h-15 sm:w-16 sm:h-16 rounded-full bg-gradient-to-br from-[#3B82F6] via-[#6366F1] to-[#60A5FA] hover:scale-105 text-white flex items-center justify-center shadow-[0_14px_36px_rgba(59,130,246,0.45)] cursor-pointer transition-transform active:scale-95"
          >
            {isPlaying ? (
              <Pause className="w-7 h-7 fill-current" />
            ) : (
              <Play className="w-7 h-7 fill-current ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={playNext}
            disabled={Boolean(activeRadio)}
            aria-label="Siguiente canción"
            className="min-w-11 min-h-11 rounded-full flex items-center justify-center text-white hover:scale-105 cursor-pointer disabled:opacity-30"
          >
            <SkipForward className="w-7 h-7 fill-current" />
          </button>

          <button
            type="button"
            onClick={() => {
              if (activeRadio) return;
              setShowNowPlayingModal(false);
              setShowQueueDrawer(true);
            }}
            aria-label={m.queueTitle}
            className="min-w-10 min-h-10 rounded-full flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
            title={m.queueTitle}
          >
            <ListMusic className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={cycleRepeat}
            disabled={Boolean(activeRadio)}
            aria-label="Repetir"
            className={`min-w-10 min-h-10 rounded-full flex items-center justify-center cursor-pointer disabled:opacity-30 ${
              repeatMode !== 'off' ? 'text-[#60A5FA]' : 'text-zinc-400 hover:text-white'
            }`}
          >
            {repeatMode === 'one' ? (
              <Repeat1 className="w-5 h-5" />
            ) : (
              <Repeat className="w-5 h-5" />
            )}
          </button>
        </div>
      </footer>
    </div>
  );
};
