import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ChevronDown,
  Clock,
  Disc3,
  Headphones,
  Heart,
  Layers,
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
  Video,
} from 'lucide-react';
import { useMusicStore } from '../../store/useMusicStore';
import { AUDIO_8D_LIMITS, unlockGlobalAudio8dContexts } from '../../hooks/useAudio8D';
import type { LyricsPayload, Spatial8dMode, VocalStemMode } from '../../types/music';
import { getSpatial8dTelemetry, sampleMusicSpectrum } from './MusicAudioEngine';
import {
  EQ_BAND_LABELS,
  EQ_MAX_DB,
  EQ_MIN_DB,
  EQ_PRESET_LIST,
  resolveEqGains,
} from './eqPresets';
import { formatMusicTime } from './SpotifyPlayerBar';
import { useBackInterceptor } from '../../lib/backInterceptor';
import { triggerHaptic } from '../../utils/haptics';
import { RiffanMusicLogo } from './RiffanMusicLogo';
import { MUSIC_I18N } from './musicI18n';

export const EqAndTimerModal: React.FC = () => {
  const showEqModal = useMusicStore((s) => s.showEqModal);
  const setShowEqModal = useMusicStore((s) => s.setShowEqModal);
  const eqPreset = useMusicStore((s) => s.eqPreset);
  const customEqBands = useMusicStore((s) => s.customEqBands);
  const setEqPreset = useMusicStore((s) => s.setEqPreset);
  const setCustomEqBand = useMusicStore((s) => s.setCustomEqBand);
  const resetEqToFlat = useMusicStore((s) => s.resetEqToFlat);
  const stemMode = useMusicStore((s) => s.stemMode);
  const setStemMode = useMusicStore((s) => s.setStemMode);
  const spatial8dEnabled = useMusicStore((s) => s.spatial8dEnabled);
  const toggleSpatial8d = useMusicStore((s) => s.toggleSpatial8d);
  const spatial8dMode = useMusicStore((s) => s.spatial8dMode);
  const setSpatial8dMode = useMusicStore((s) => s.setSpatial8dMode);
  const spatial8dSpeed = useMusicStore((s) => s.spatial8dSpeed);
  const setSpatial8dSpeed = useMusicStore((s) => s.setSpatial8dSpeed);
  const spatial8dReverb = useMusicStore((s) => s.spatial8dReverb);
  const setSpatial8dReverb = useMusicStore((s) => s.setSpatial8dReverb);
  const spatial8dDepth = useMusicStore((s) => s.spatial8dDepth);
  const setSpatial8dDepth = useMusicStore((s) => s.setSpatial8dDepth);
  const resetSpatial8dControls = useMusicStore((s) => s.resetSpatial8dControls);
  const playbackRate = useMusicStore((s) => s.playbackRate);
  const setPlaybackRate = useMusicStore((s) => s.setPlaybackRate);
  const sleepTimerEndsAt = useMusicStore((s) => s.sleepTimerEndsAt);
  const setSleepTimerMinutes = useMusicStore((s) => s.setSleepTimerMinutes);
  const musicLang = useMusicStore((s) => s.musicLang);
  const m = MUSIC_I18N[musicLang];
  const activeEqGains = useMemo(
    () => resolveEqGains(eqPreset, customEqBands),
    [eqPreset, customEqBands]
  );

  const [liveCutoffHz, setLiveCutoffHz] = useState<number>(AUDIO_8D_LIMITS.frontCutoffHz);

  useEffect(() => {
    if (!showEqModal || !spatial8dEnabled) return;
    let raf = 0;
    let last = 0;
    const poll = (ts: number) => {
      if (ts - last > 80) {
        last = ts;
        const tel = getSpatial8dTelemetry();
        setLiveCutoffHz(tel.occlusionCutoffHz);
      }
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, [showEqModal, spatial8dEnabled]);

  useBackInterceptor(showEqModal, 'music-eq-modal', () => setShowEqModal(false), { priority: 25 });

  if (!showEqModal) return null;

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-md flex items-end sm:items-center justify-center p-0 sm:p-4"
      onClick={() => setShowEqModal(false)}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full sm:max-w-md max-h-[90dvh] overflow-y-auto no-scrollbar rounded-t-3xl sm:rounded-3xl bg-[#090F18] border border-[#10B981]/25 p-5 sm:p-6 space-y-5 shadow-2xl"
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span className="w-9 h-9 rounded-xl bg-[#10B981]/15 border border-[#10B981]/35 flex items-center justify-center text-[#34D399]">
              <Sliders className="w-4.5 h-4.5" />
            </span>
            <div>
              <h3 className="text-base font-bold text-white">{m.eqTitle}</h3>
              <p className="text-xs text-zinc-400">{m.eqSubtitle}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setShowEqModal(false)}
            className="min-w-11 min-h-11 rounded-full bg-white/[0.06] hover:bg-white/12 text-zinc-300 flex items-center justify-center cursor-pointer"
          >
            <ChevronDown className="w-5 h-5" />
          </button>
        </div>

        {/* 8D Binaural Spatial Studio */}
        <div
          className={`rounded-2xl border p-3.5 space-y-3.5 transition-colors ${
            spatial8dEnabled
              ? 'bg-[#10B981]/10 border-[#10B981]/40'
              : 'bg-white/[0.03] border-white/10'
          }`}
        >
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5 min-w-0">
              <span
                className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  spatial8dEnabled
                    ? 'bg-gradient-to-br from-[#10B981] to-[#22D3EE] text-[#03130E]'
                    : 'bg-white/[0.06] text-zinc-300'
                }`}
              >
                <Headphones className="w-4.5 h-4.5" />
              </span>
              <div className="min-w-0">
                <p className="text-xs sm:text-sm font-bold text-white truncate">{m.spatial8dTitle}</p>
                <p className="text-[11px] text-zinc-400 leading-snug">{m.spatial8dSub}</p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                unlockGlobalAudio8dContexts();
                triggerHaptic('medium');
                toggleSpatial8d();
              }}
              aria-pressed={spatial8dEnabled}
              className={`h-8 px-3.5 rounded-lg text-xs font-black tracking-wide cursor-pointer shrink-0 transition-all ${
                spatial8dEnabled
                  ? 'bg-gradient-to-r from-[#10B981] to-[#22D3EE] text-[#03130E] shadow-[0_4px_14px_rgba(16,185,129,0.4)]'
                  : 'bg-white/10 text-zinc-200 hover:bg-white/18'
              }`}
            >
              {spatial8dEnabled ? 'ON' : 'OFF'}
            </button>
          </div>

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
                      ? 'bg-[#10B981]/25 border-[#10B981] text-[#6EE7B7]'
                      : 'bg-white/[0.04] border-white/10 text-zinc-300 hover:bg-white/[0.08]'
                  }`}
                >
                  {opt.label}
                </button>
              );
            })}
          </div>

          {/* Precision DSP Sliders: Speed (2-25s), Reverb (0-0.6), Depth */}
          <div className="space-y-3 pt-1 border-t border-white/[0.08]">
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-zinc-300">{m.spatial8dSpeedLabel}</span>
                <span className="font-bold text-[#6EE7B7] tabular-nums">{spatial8dSpeed.toFixed(1)}s</span>
              </div>
              <input
                type="range"
                min={AUDIO_8D_LIMITS.minSpeedSec}
                max={AUDIO_8D_LIMITS.maxSpeedSec}
                step={0.5}
                value={spatial8dSpeed}
                onChange={(e) => setSpatial8dSpeed(Number(e.target.value))}
                aria-label={m.spatial8dSpeedLabel}
                className="w-full h-1.5 accent-[#10B981] bg-white/15 rounded-full cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-zinc-300">{m.spatial8dReverbLabel}</span>
                <span className="font-bold text-[#6EE7B7] tabular-nums">
                  {Math.round((spatial8dReverb / AUDIO_8D_LIMITS.maxReverb) * 100)}% ({spatial8dReverb.toFixed(2)})
                </span>
              </div>
              <input
                type="range"
                min={AUDIO_8D_LIMITS.minReverb}
                max={AUDIO_8D_LIMITS.maxReverb}
                step={0.01}
                value={spatial8dReverb}
                onChange={(e) => setSpatial8dReverb(Number(e.target.value))}
                aria-label={m.spatial8dReverbLabel}
                className="w-full h-1.5 accent-[#22D3EE] bg-white/15 rounded-full cursor-pointer"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between text-[11px]">
                <span className="font-semibold text-zinc-300">{m.spatial8dDepthLabel}</span>
                <span className="font-bold text-[#6EE7B7] tabular-nums">{spatial8dDepth.toFixed(1)}m</span>
              </div>
              <input
                type="range"
                min={AUDIO_8D_LIMITS.minDepth}
                max={AUDIO_8D_LIMITS.maxDepth}
                step={0.1}
                value={spatial8dDepth}
                onChange={(e) => setSpatial8dDepth(Number(e.target.value))}
                aria-label={m.spatial8dDepthLabel}
                className="w-full h-1.5 accent-[#10B981] bg-white/15 rounded-full cursor-pointer"
              />
            </div>

            <div className="flex items-center justify-between pt-0.5 text-[11px] text-zinc-400 tabular-nums">
              <span>
                {m.spatial8dOcclusionLabel}:{' '}
                <strong className="text-zinc-200 font-semibold">
                  {(liveCutoffHz / 1000).toFixed(1)} kHz
                </strong>
              </span>
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  resetSpatial8dControls();
                }}
                className="inline-flex items-center gap-1 text-zinc-400 hover:text-white cursor-pointer"
              >
                <RotateCcw className="w-3 h-3" />
                <span>{m.spatial8dResetLabel}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Vocal / Instrumental Real-Time Stem Separator */}
        <div className="space-y-2">
          <p className="text-xs font-semibold text-zinc-400">{m.stemLabel}</p>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { id: 'both', label: m.stemBoth, Icon: Layers },
                { id: 'vocals', label: m.stemVocals, Icon: Mic2 },
                { id: 'instrumental', label: m.stemInstrumental, Icon: Disc3 },
              ] as Array<{ id: VocalStemMode; label: string; Icon: React.ComponentType<{ className?: string }> }>
            ).map(({ id, label, Icon }) => {
              const active = stemMode === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    unlockGlobalAudio8dContexts();
                    triggerHaptic('light');
                    setStemMode(id);
                  }}
                  aria-pressed={active}
                  className={`min-h-10 px-2 rounded-xl border text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                    active
                      ? 'bg-gradient-to-r from-[#10B981] to-[#22D3EE] border-[#10B981] text-[#03130E] shadow-[0_6px_18px_rgba(16,185,129,0.32)]'
                      : 'bg-white/[0.04] border-white/10 text-zinc-200 hover:bg-white/[0.08]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* 18 Acoustic EQ Profiles */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-semibold text-zinc-400">{m.eqProfile}</p>
            <button
              type="button"
              onClick={() => {
                triggerHaptic('light');
                resetEqToFlat();
              }}
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-zinc-400 hover:text-white cursor-pointer"
            >
              <RotateCcw className="w-3 h-3" />
              <span>{m.eqResetBtn}</span>
            </button>
          </div>
          <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5 max-h-48 overflow-y-auto no-scrollbar pr-0.5">
            {EQ_PRESET_LIST.map((preset) => {
              const active = eqPreset === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  onClick={() => {
                    unlockGlobalAudio8dContexts();
                    triggerHaptic('light');
                    setEqPreset(preset.id);
                  }}
                  className={`min-h-10 px-2.5 py-1.5 rounded-xl border text-[11px] font-semibold cursor-pointer transition-all text-left truncate ${
                    active
                      ? 'bg-gradient-to-r from-[#10B981] to-[#22D3EE] border-[#10B981] text-[#03130E] font-bold shadow-[0_6px_18px_rgba(16,185,129,0.32)]'
                      : 'bg-white/[0.04] border-white/10 text-zinc-200 hover:bg-white/[0.08]'
                  }`}
                >
                  {preset.labels[musicLang] || preset.labels.es}
                </button>
              );
            })}
          </div>
        </div>

        {/* Interactive 10-Band ISO Graphic Equalizer (32 Hz – 16 kHz) */}
        <div className="rounded-2xl bg-white/[0.03] border border-white/10 p-3.5 space-y-2.5">
          <div className="flex items-center justify-between text-[11px]">
            <span className="font-semibold text-zinc-300">{m.eqBandsLabel}</span>
            <span className="font-bold text-[#6EE7B7] tabular-nums">
              {EQ_PRESET_LIST.find((p) => p.id === eqPreset)?.labels[musicLang] || 'Custom'}
            </span>
          </div>
          <div className="grid grid-cols-5 sm:grid-cols-10 gap-x-2 gap-y-2.5">
            {EQ_BAND_LABELS.map((hzLabel, idx) => {
              const val = activeEqGains[idx] ?? 0;
              const fillPct = Math.round(((val - EQ_MIN_DB) / (EQ_MAX_DB - EQ_MIN_DB)) * 100);
              return (
                <div key={hzLabel} className="flex flex-col items-center gap-1 min-w-0">
                  <span
                    className={`text-[10px] font-bold tabular-nums ${
                      val > 0 ? 'text-[#34D399]' : val < 0 ? 'text-[#22D3EE]' : 'text-zinc-400'
                    }`}
                  >
                    {val > 0 ? `+${val}` : val}
                  </span>
                  <div className="relative w-full h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full bg-gradient-to-r from-[#10B981] to-[#22D3EE]"
                      style={{ width: `${fillPct}%` }}
                    />
                  </div>
                  <input
                    type="range"
                    min={EQ_MIN_DB}
                    max={EQ_MAX_DB}
                    step={0.5}
                    value={val}
                    onChange={(e) => {
                      unlockGlobalAudio8dContexts();
                      setCustomEqBand(idx, Number(e.target.value));
                    }}
                    aria-label={`${hzLabel} Hz`}
                    className="w-full h-2 accent-[#10B981] bg-transparent cursor-pointer"
                  />
                  <span className="text-[10px] font-semibold text-zinc-400 tabular-nums">
                    {hzLabel}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        <div className="space-y-2">
          <p className="text-xs font-semibold text-zinc-400">{m.playbackSpeed}</p>
          <div className="grid grid-cols-4 gap-2">
            {[0.85, 1, 1.15, 1.25].map((rate) => (
              <button
                key={rate}
                type="button"
                onClick={() => setPlaybackRate(rate)}
                className={`min-h-10 rounded-xl border text-xs font-bold tabular-nums cursor-pointer transition-all ${
                  playbackRate === rate
                    ? 'bg-gradient-to-r from-[#10B981] to-[#22D3EE] border-[#10B981] text-[#03130E]'
                    : 'bg-white/[0.04] border-white/10 text-zinc-200 hover:bg-white/[0.08]'
                }`}
              >
                {rate}x
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <span className="font-semibold text-zinc-400 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5" /> {m.sleepTimer}
            </span>
            {sleepTimerEndsAt && (
              <span className="text-[#34D399] font-semibold tabular-nums">
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
                  (mins === null && !sleepTimerEndsAt)
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
  const isResolvingTrack = useMusicStore((s) => s.isResolvingTrack);
  const isPlaying = useMusicStore((s) => s.isPlaying);
  const currentTime = useMusicStore((s) => s.currentTime);
  const duration = useMusicStore((s) => s.duration);
  const shuffle = useMusicStore((s) => s.shuffle);
  const repeatMode = useMusicStore((s) => s.repeatMode);
  const likedTracks = useMusicStore((s) => s.likedTracks);

  const togglePlayPause = useMusicStore((s) => s.togglePlayPause);
  const playNext = useMusicStore((s) => s.playNext);
  const playPrev = useMusicStore((s) => s.playPrev);
  const requestSeek = useMusicStore((s) => s.requestSeek);
  const toggleShuffle = useMusicStore((s) => s.toggleShuffle);
  const cycleRepeat = useMusicStore((s) => s.cycleRepeat);
  const toggleLikeTrack = useMusicStore((s) => s.toggleLikeTrack);
  const setShowQueueDrawer = useMusicStore((s) => s.setShowQueueDrawer);
  const setShowEqModal = useMusicStore((s) => s.setShowEqModal);
  const stemMode = useMusicStore((s) => s.stemMode);
  const setStemMode = useMusicStore((s) => s.setStemMode);
  const spatial8dEnabled = useMusicStore((s) => s.spatial8dEnabled);
  const spatial8dSpeed = useMusicStore((s) => s.spatial8dSpeed);
  const spatial8dReverb = useMusicStore((s) => s.spatial8dReverb);
  const toggleSpatial8d = useMusicStore((s) => s.toggleSpatial8d);
  const musicLang = useMusicStore((s) => s.musicLang);
  const m = MUSIC_I18N[musicLang];

  const [lyrics, setLyrics] = useState<LyricsPayload | null>(null);
  const [lyricsLoading, setLyricsLoading] = useState(false);
  const [spectrumBars, setSpectrumBars] = useState<number[]>(() => Array.from({ length: 24 }, () => 0.16));
  const [orbitDeg, setOrbitDeg] = useState(0);
  const [cutoffHz, setCutoffHz] = useState<number>(AUDIO_8D_LIMITS.frontCutoffHz);
  const [activeWebAudio, setActiveWebAudio] = useState(false);
  const [coverError, setCoverError] = useState(false);
  const activeLineRef = useRef<HTMLButtonElement | null>(null);

  const coverSrc = activeRadio
    ? activeRadio.favicon
    : currentTrack?.album.coverXl || currentTrack?.album.cover || '';

  useEffect(() => {
    setCoverError(false);
  }, [coverSrc]);

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

  // Animate FFT visualizer & 8D spatial orbit radar when open in artwork mode
  useEffect(() => {
    if (!showNowPlayingModal || nowPlayingTab !== 'artwork' || !isPlaying) return;
    let raf = 0;
    let lastTick = 0;
    const loop = (ts: number) => {
      if (ts - lastTick > 55) {
        lastTick = ts;
        const sampled = sampleMusicSpectrum(24);
        const allFlat = sampled.every((v) => v <= 0.15);
        if (allFlat) {
          setSpectrumBars((prev) =>
            prev.map((_, idx) => 0.18 + Math.abs(Math.sin(ts / 260 + idx * 0.55)) * 0.65)
          );
        } else {
          setSpectrumBars(sampled);
        }
        const telemetry = getSpatial8dTelemetry();
        setOrbitDeg((telemetry.angleRad * 180) / Math.PI);
        setCutoffHz(telemetry.occlusionCutoffHz);
        setActiveWebAudio(telemetry.activeWebAudio);
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
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
  const effectiveDuration = duration > 0 ? duration : currentTrack?.durationSec || 0;
  const hasVideoOption = Boolean(
    currentTrack && (resolvedPlayback?.youtubeMvId || resolvedPlayback?.youtubeVideoId)
  );

  return (
    <div className="fixed inset-0 z-50 bg-[#05080D] text-white flex flex-col overflow-hidden animate-fade-in">
      {/* Ambient Blurred Album Background */}
      {coverSrc && !coverError ? (
        <div
          aria-hidden="true"
          className="absolute inset-0 pointer-events-none opacity-38 blur-3xl scale-125 transition-all duration-700"
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
            'radial-gradient(ellipse 80% 55% at 50% 25%, rgba(16,185,129,0.2), rgba(34,211,238,0.09) 45%, rgba(5,8,13,0.92) 85%), linear-gradient(to bottom, rgba(5,8,13,0.45), rgba(5,8,13,0.9) 70%, #05080D)',
        }}
      />

      {/* Top Header (Fits 340px+ mobile screens cleanly with zero right-edge clipping) */}
      <header className="relative z-10 w-full max-w-full flex items-center justify-between gap-1.5 sm:gap-3 px-3 sm:px-8 pt-[calc(env(safe-area-inset-top,0px)+10px)] pb-2 overflow-hidden">
        <button
          type="button"
          onClick={() => setShowNowPlayingModal(false)}
          aria-label={m.back}
          className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-white/[0.08] hover:bg-white/15 flex items-center justify-center cursor-pointer transition-colors focus-visible:ring-2 focus-visible:ring-[#10B981] shrink-0"
        >
          <ChevronDown className="w-4.5 h-4.5 sm:w-5 sm:h-5" />
        </button>

        {/* Segmented Mode Switch: Portada / Letras / Videoclip */}
        <div className="min-w-0 flex items-center p-0.5 sm:p-1 rounded-xl bg-white/[0.08] border border-white/10 backdrop-blur-md">
          <button
            type="button"
            onClick={() => setNowPlayingTab('artwork')}
            className={`px-2 sm:px-3.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold cursor-pointer transition-all whitespace-nowrap ${
              nowPlayingTab === 'artwork'
                ? 'bg-gradient-to-r from-[#10B981] to-[#22D3EE] text-[#03130E] shadow-[0_4px_14px_rgba(16,185,129,0.35)]'
                : 'text-zinc-300 hover:text-white'
            }`}
          >
            {m.tabCover}
          </button>
          {currentTrack && (
            <button
              type="button"
              onClick={() => setNowPlayingTab('lyrics')}
              className={`px-2 sm:px-3.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition-all whitespace-nowrap ${
                nowPlayingTab === 'lyrics'
                  ? 'bg-gradient-to-r from-[#10B981] to-[#22D3EE] text-[#03130E] shadow-[0_4px_14px_rgba(16,185,129,0.35)]'
                  : 'text-zinc-300 hover:text-white'
              }`}
            >
              <Mic2 className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
              <span>{m.tabLyrics}</span>
            </button>
          )}
          {hasVideoOption && (
            <button
              type="button"
              onClick={() => setNowPlayingTab('video')}
              className={`px-2 sm:px-3.5 py-1.5 rounded-lg text-[11px] sm:text-xs font-bold inline-flex items-center gap-1 cursor-pointer transition-all whitespace-nowrap ${
                nowPlayingTab === 'video'
                  ? 'bg-gradient-to-r from-[#10B981] to-[#22D3EE] text-[#03130E] shadow-[0_4px_14px_rgba(16,185,129,0.35)]'
                  : 'text-zinc-300 hover:text-white'
              }`}
            >
              <Video className="w-3 h-3 sm:w-3.5 sm:h-3.5 shrink-0" />
              <span>{m.tabVideo}</span>
            </button>
          )}
        </div>

        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              unlockGlobalAudio8dContexts();
              triggerHaptic('medium');
              toggleSpatial8d();
            }}
            aria-pressed={spatial8dEnabled}
            title={m.spatial8dTitle}
            className={`h-9 sm:h-10 px-2.5 sm:px-3 rounded-xl text-[11px] sm:text-xs font-black tracking-wide inline-flex items-center gap-1 sm:gap-1.5 cursor-pointer transition-all ${
              spatial8dEnabled
                ? 'bg-gradient-to-r from-[#10B981] to-[#22D3EE] text-[#03130E] shadow-[0_0_20px_rgba(16,185,129,0.45)]'
                : 'bg-white/[0.08] hover:bg-white/15 text-zinc-200'
            }`}
          >
            <Headphones className="w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
            <span>8D</span>
          </button>
          <button
            type="button"
            onClick={() => setShowEqModal(true)}
            title={m.eqBtn}
            aria-label={m.eqBtn}
            className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl bg-white/[0.08] hover:bg-white/15 flex items-center justify-center cursor-pointer transition-colors"
          >
            <Sliders className="w-4 h-4 sm:w-4.5 sm:h-4.5" />
          </button>
        </div>
      </header>

      {/* Main Content Stage */}
      <main className="relative z-10 flex-1 min-h-0 flex flex-col items-center justify-center px-5 sm:px-10 py-2 overflow-hidden">
        {nowPlayingTab === 'artwork' && (
          <div className="w-full max-w-md flex flex-col items-center gap-3.5 sm:gap-5">
            <div className="relative flex items-center justify-center">
              {spatial8dEnabled && (
                <div
                  aria-hidden="true"
                  className="absolute -inset-5 sm:-inset-7 rounded-full border border-[#22D3EE]/30 pointer-events-none"
                >
                  <div
                    className="w-full h-full relative"
                    style={{ transform: `rotate(${orbitDeg}deg)` }}
                  >
                    <span className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-gradient-to-r from-[#10B981] to-[#22D3EE] shadow-[0_0_16px_rgba(34,211,238,0.95)]" />
                  </div>
                </div>
              )}
              <div
                aria-hidden="true"
                className={`absolute -inset-4 rounded-[36px] blur-2xl transition-opacity duration-700 ${
                  isPlaying ? 'opacity-70' : 'opacity-25'
                }`}
                style={{
                  background:
                    'radial-gradient(circle, rgba(16,185,129,0.34) 0%, rgba(34,211,238,0.16) 60%, transparent 100%)',
                }}
              />
              <div className="relative w-52 h-52 sm:w-72 sm:h-72 rounded-3xl overflow-hidden bg-[#0A111B] border border-white/16 shadow-[0_28px_72px_rgba(0,0,0,0.88)] flex items-center justify-center">
                {coverSrc && !coverError ? (
                  <img
                    src={coverSrc}
                    alt={currentTrack?.title || activeRadio?.name || ''}
                    referrerPolicy="no-referrer"
                    onError={() => setCoverError(true)}
                    className={`relative z-10 w-full h-full object-cover transition-transform duration-700 ${
                      isPlaying ? 'scale-100' : 'scale-95 opacity-80'
                    }`}
                  />
                ) : activeRadio ? (
                  <Radio className="w-16 h-16 text-[#22D3EE] opacity-85" />
                ) : (
                  <RiffanMusicLogo variant="mark" size={76} withFrame={false} />
                )}
              </div>
            </div>

            {/* Live Sonic Audio Spectrum Visualizer */}
            <div className="w-full max-w-xs h-8 flex items-end justify-center gap-1" aria-hidden="true">
              {spectrumBars.map((val, i) => (
                <span
                  key={i}
                  className="w-1.5 rounded-full bg-gradient-to-t from-[#059669] via-[#10B981] to-[#22D3EE] transition-[height] duration-75"
                  style={{
                    height: `${Math.round(val * 100)}%`,
                    opacity: 0.45 + val * 0.55,
                  }}
                />
              ))}
            </div>

            {/* Clean unboxed 8D DSP Telemetry & Quick Studio Trigger (Never covers faces) */}
            {spatial8dEnabled && (
              <button
                type="button"
                onClick={() => setShowEqModal(true)}
                className="flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 text-[11px] font-medium text-[#6EE7B7] hover:text-white transition-colors cursor-pointer tabular-nums"
              >
                <Headphones className="w-3.5 h-3.5 text-[#22D3EE] shrink-0" />
                {activeWebAudio ? (
                  <span>
                    {m.spatial8dBadgeLive} · {spatial8dSpeed.toFixed(0)}s ·{' '}
                    {Math.round((spatial8dReverb / AUDIO_8D_LIMITS.maxReverb) * 100)}% Reverb ·{' '}
                    {(cutoffHz / 1000).toFixed(1)} kHz
                  </span>
                ) : isResolvingTrack ? (
                  <span>{m.spatial8dTitle} · HRTF...</span>
                ) : (
                  <span>
                    {m.spatial8dBadgeLive} · {spatial8dSpeed.toFixed(0)}s ·{' '}
                    {Math.round((spatial8dReverb / AUDIO_8D_LIMITS.maxReverb) * 100)}% Reverb
                  </span>
                )}
                <span className="text-zinc-400 underline underline-offset-2">{m.spatial8dAdjustBtn}</span>
              </button>
            )}
          </div>
        )}

        {nowPlayingTab === 'lyrics' && (
          <div className="w-full max-w-2xl flex-1 min-h-0 overflow-y-auto px-2 sm:px-6 py-8 space-y-4 text-center mask-gradient">
            {lyricsLoading ? (
              <div className="py-20 text-zinc-400 text-sm">{m.searchingLyrics}</div>
            ) : !lyrics?.found ? (
              <div className="py-20 space-y-2">
                <Mic2 className="w-10 h-10 text-[#34D399]/60 mx-auto" />
                <p className="text-base font-semibold text-zinc-200">
                  {m.noLyricsTitle}
                </p>
                <p className="text-xs text-zinc-400">
                  {m.noLyricsSub}
                </p>
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
                        ? 'text-white text-2xl sm:text-4xl font-extrabold scale-[1.03] drop-shadow-[0_0_24px_rgba(16,185,129,0.55)] bg-white/[0.04]'
                        : isPast
                        ? 'text-zinc-400/55 text-base sm:text-xl font-semibold hover:text-white'
                        : 'text-zinc-300/75 text-base sm:text-xl font-semibold hover:text-white'
                    }`}
                  >
                    {line.text}
                  </button>
                );
              })
            )}
          </div>
        )}

        {nowPlayingTab === 'video' && (
          <div className="w-full max-w-3xl aspect-video rounded-3xl overflow-hidden border border-white/15 bg-black shadow-2xl flex items-center justify-center">
            <p className="text-xs text-zinc-500">{m.videoStageSub}</p>
          </div>
        )}
      </main>

      {/* Bottom Controls */}
      <footer className="relative z-10 w-full max-w-2xl mx-auto px-5 sm:px-8 pb-[calc(env(safe-area-inset-bottom,0px)+20px)] pt-3 space-y-4">
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
            <div className="flex items-center gap-0.5 shrink-0">
              {onOpenPlaylistPicker && (
                <button
                  type="button"
                  onClick={onOpenPlaylistPicker}
                  aria-label={m.addToPlaylist}
                  title={m.addToPlaylist}
                  className="min-w-10 min-h-10 rounded-full flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer transition-colors"
                >
                  <Plus className="w-5 h-5" />
                </button>
              )}
              <button
                type="button"
                onClick={() => {
                  triggerHaptic('light');
                  toggleLikeTrack(currentTrack);
                }}
                aria-label={isLiked ? m.likeRemove : m.likeAdd}
                className={`min-w-10 min-h-10 rounded-full flex items-center justify-center cursor-pointer transition-transform active:scale-90 ${
                  isLiked ? 'text-[#34D399]' : 'text-zinc-400 hover:text-white'
                }`}
              >
                <Heart className={`w-5 h-5 ${isLiked ? 'fill-current' : ''}`} />
              </button>
            </div>
          )}
        </div>

        {/* Vocal / Instrumental / Both Real-Time Switch right inside Now Playing */}
        {currentTrack && !activeRadio && (
          <div
            role="group"
            aria-label={m.stemLabel}
            className="grid grid-cols-3 gap-1.5 p-1 rounded-2xl bg-white/[0.06] border border-white/10"
          >
            {(
              [
                { id: 'both', label: m.stemBoth, Icon: Layers },
                { id: 'vocals', label: m.stemVocals, Icon: Mic2 },
                { id: 'instrumental', label: m.stemInstrumental, Icon: Disc3 },
              ] as Array<{ id: VocalStemMode; label: string; Icon: React.ComponentType<{ className?: string }> }>
            ).map(({ id, label, Icon }) => {
              const active = stemMode === id;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => {
                    unlockGlobalAudio8dContexts();
                    triggerHaptic('light');
                    setStemMode(id);
                  }}
                  aria-pressed={active}
                  className={`h-9 px-2 rounded-xl text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer transition-all whitespace-nowrap ${
                    active
                      ? 'bg-gradient-to-r from-[#10B981] to-[#22D3EE] text-[#03130E] shadow-[0_4px_14px_rgba(16,185,129,0.35)]'
                      : 'text-zinc-300 hover:text-white hover:bg-white/[0.06]'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5 shrink-0" />
                  <span className="truncate">{label}</span>
                </button>
              );
            })}
          </div>
        )}

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
            className="w-full h-1.5 accent-[#10B981] bg-white/20 rounded-full cursor-pointer"
          />
          <div className="flex items-center justify-between text-xs text-zinc-400 tabular-nums">
            <span>{activeRadio ? 'LIVE' : formatMusicTime(currentTime)}</span>
            <span className="text-[11px] text-zinc-500">
              {activeRadio ? 'STREAM 24/7' : resolvedPlayback?.sourceLabel || ''}
            </span>
            <span>{activeRadio ? '24/7' : formatMusicTime(effectiveDuration)}</span>
          </div>
        </div>

        {/* Main Transport */}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            onClick={toggleShuffle}
            disabled={Boolean(activeRadio)}
            className={`min-w-11 min-h-11 rounded-full flex items-center justify-center cursor-pointer disabled:opacity-30 ${
              shuffle ? 'text-[#34D399]' : 'text-zinc-400 hover:text-white'
            }`}
          >
            <Shuffle className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={playPrev}
            disabled={Boolean(activeRadio)}
            className="min-w-12 min-h-12 rounded-full flex items-center justify-center text-white hover:scale-105 cursor-pointer disabled:opacity-30"
          >
            <SkipBack className="w-7 h-7 fill-current" />
          </button>

          <button
            type="button"
            onClick={() => {
              unlockGlobalAudio8dContexts();
              triggerHaptic('medium');
              togglePlayPause();
            }}
            aria-label={isPlaying ? m.pause : m.playNow}
            className="w-16 h-16 rounded-full bg-gradient-to-br from-[#10B981] via-[#14B8A6] to-[#22D3EE] hover:scale-105 text-[#03130E] flex items-center justify-center shadow-[0_14px_36px_rgba(16,185,129,0.45)] cursor-pointer transition-transform active:scale-95"
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
            className="min-w-12 min-h-12 rounded-full flex items-center justify-center text-white hover:scale-105 cursor-pointer disabled:opacity-30"
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
            className="min-w-11 min-h-11 rounded-full flex items-center justify-center text-zinc-400 hover:text-white cursor-pointer"
            title={m.queueTitle}
          >
            <ListMusic className="w-5 h-5" />
          </button>

          <button
            type="button"
            onClick={cycleRepeat}
            disabled={Boolean(activeRadio)}
            className={`min-w-11 min-h-11 rounded-full flex items-center justify-center cursor-pointer disabled:opacity-30 ${
              repeatMode !== 'off' ? 'text-[#34D399]' : 'text-zinc-400 hover:text-white'
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
