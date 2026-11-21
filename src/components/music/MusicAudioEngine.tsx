import React, { useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { useMusicStore } from '../../store/useMusicStore';
import type {
  EqPresetId,
  ExportBitrate,
  MusicTrack,
  ResolvedTrackPlayback,
  Spatial8dMode,
  SpatialTrajectory,
} from '../../types/music';
import {
  deleteOfflineTrackAudio,
  getOfflineTrackBlob,
  listOfflineTrackMeta,
  saveOfflineTrackAudio,
} from '../../services/musicOfflineDb';
import { buildZipBlob } from '../../utils/zipExport';

export const EQ_BANDS_HZ = [60, 230, 910, 4000, 14000] as const;
export const EQ_10_BANDS_HZ = [31, 62, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

export const EQ_PRESETS: Record<EqPresetId, { label: string; gains: number[]; gains10: number[] }> = {
  flat: {
    label: 'Plano',
    gains: [0, 0, 0, 0, 0],
    gains10: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0],
  },
  bass: {
    label: 'Sub Bass',
    gains: [6, 4.5, 0.5, 1, 2],
    gains10: [6.5, 5.5, 4, 1.5, 0, 0, 0.5, 1, 2, 2.5],
  },
  vocal: {
    label: 'Voz Clara',
    gains: [-2, -1, 4.5, 3.5, 1],
    gains10: [-3, -2, -1, 0.5, 2.5, 4.5, 4, 3, 1.5, 0],
  },
  club: {
    label: 'Club / Electrónica',
    gains: [5, 2.5, -1.5, 3, 5],
    gains10: [5.5, 4.5, 2.5, 0, -1.5, 0, 2, 3.5, 4.5, 5],
  },
  acoustic: {
    label: 'Acústico',
    gains: [2.5, 1.5, 2, 3, 2],
    gains10: [3, 2, 1.5, 1, 1.5, 2, 3, 2.5, 2, 1.5],
  },
};

const SPATIAL_PROFILES: Record<
  Spatial8dMode,
  { radius: number; centerMix: number; warmthDb: number }
> = {
  orbit: { radius: 1.75, centerMix: 0.2, warmthDb: 2.2 },
  concert: { radius: 2.05, centerMix: 0.18, warmthDb: 2.8 },
  club: { radius: 1.9, centerMix: 0.16, warmthDb: 3.2 },
};

export interface Mp3ExportOptions {
  mode?: 'original' | '8d' | 'slowed' | 'nightcore';
  rate?: number;
  bassDb?: number;
  bitrate?: ExportBitrate;
  offlineOnly?: boolean;
}

const activeDownloadAborts = new Map<string, AbortController>();

export function cancelDownloadJob(jobId: string): void {
  const ctrl = activeDownloadAborts.get(jobId);
  if (ctrl) {
    ctrl.abort();
    activeDownloadAborts.delete(jobId);
  }
  useMusicStore.getState().updateDownloadJob(jobId, { status: 'cancelled' });
}

export function buildMp3DownloadUrl(track: MusicTrack, opts?: Mp3ExportOptions): {
  url: string;
  mode: string;
  bitrate: ExportBitrate;
  fileName: string;
} {
  const st = useMusicStore.getState();
  let mode = opts?.mode;
  if (!mode) {
    if (st.activeProVibe === 'slowed_reverb') mode = 'slowed';
    else if (st.activeProVibe === 'nightcore') mode = 'nightcore';
    else if (st.spatial8dEnabled) mode = '8d';
    else mode = 'original';
  }
  const bitrate: ExportBitrate = opts?.bitrate || st.exportBitrate || '320k';

  const qs = new URLSearchParams({
    title: track.title,
    artist: track.artist.name,
    duration: String(track.durationSec || 0),
    mode,
    bitrate,
    trajectory: st.spatialTrajectory,
    withLyrics: '1',
  });
  if (track.album.title) qs.set('album', track.album.title);
  if (track.album.coverXl || track.album.cover) {
    qs.set('coverUrl', track.album.coverXl || track.album.cover);
  }
  if (track.previewUrl) qs.set('preview', track.previewUrl);
  if (track.soundcloudId) qs.set('scId', track.soundcloudId);
  if (track.audiusId) qs.set('audiusId', track.audiusId);
  if (track.youtubeVideoId) qs.set('ytId', track.youtubeVideoId);

  if (
    st.currentTrack?.id === track.id &&
    st.resolvedPlayback?.streamUrl &&
    st.resolvedPlayback.provider !== 'offline'
  ) {
    qs.set('streamUrl', st.resolvedPlayback.streamUrl);
  }

  const isOriginalOverride = opts?.mode === 'original';
  const rate = opts?.rate ?? (isOriginalOverride ? 1 : st.playbackRate);
  const bassDb = opts?.bassDb ?? (isOriginalOverride ? 0 : st.bassBoostDb);
  if (Math.abs(rate - 1) > 0.02) qs.set('rate', rate.toFixed(2));
  if (bassDb > 0.5) qs.set('bassDb', bassDb.toFixed(1));
  if (!isOriginalOverride) {
    if (Math.abs(st.pitchSemitones) >= 0.25) qs.set('pitchSemitones', String(st.pitchSemitones));
    if (st.reverbMix > 0.04) qs.set('reverbMix', st.reverbMix.toFixed(2));
    if (st.vocalCancel) qs.set('vocalCancel', '1');
    if (st.exciterMix > 0.05) qs.set('exciterMix', st.exciterMix.toFixed(2));
    if (mode === '8d') qs.set('speed8dSec', st.spatial8dSpeedSec.toFixed(1));
    if (st.eqBands10.some((g) => Math.abs(g) > 0.2)) {
      qs.set('eq', st.eqBands10.map((g) => g.toFixed(1)).join(','));
    }
    if (st.trimStartSec > 0) qs.set('trimStart', String(st.trimStartSec));
    if (st.trimEndSec > st.trimStartSec + 1) qs.set('trimEnd', String(st.trimEndSec));
    if (st.fadeSec > 0.2) qs.set('fadeSec', String(st.fadeSec));
  }

  const safeTitle = `${track.artist.name} - ${track.title}${mode !== 'original' ? ` (${mode.toUpperCase()})` : ''}.mp3`.replace(
    /[\\/:*?"<>|]/g,
    ''
  );
  return {
    url: `/api/music/download-mp3?${qs.toString()}`,
    mode,
    bitrate,
    fileName: safeTitle,
  };
}

function triggerBlobDownload(blob: Blob, fileName: string): void {
  if (typeof document === 'undefined') return;
  const blobUrl = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = blobUrl;
  a.download = fileName;
  a.style.display = 'none';
  document.body.appendChild(a);
  a.click();
  window.setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(blobUrl);
  }, 4000);
}

export async function startDownloadMp3Job(
  track: MusicTrack,
  opts?: Mp3ExportOptions
): Promise<{ ok: boolean; error?: string }> {
  const st = useMusicStore.getState();
  const { url, mode, bitrate, fileName } = buildMp3DownloadUrl(track, opts);
  const jobId = st.enqueueDownloadJob(track, mode, bitrate);
  const ctrl = new AbortController();
  activeDownloadAborts.set(jobId, ctrl);
  st.updateDownloadJob(jobId, { status: 'downloading', progressPct: 5 });

  try {
    const res = await fetch(url, { signal: ctrl.signal });
    const ct = (res.headers.get('content-type') || '').toLowerCase();
    if (!res.ok || ct.includes('text/html') || ct.includes('application/json')) {
      let errMsg = `HTTP ${res.status}`;
      try {
        const j = await res.json();
        if (j?.error) errMsg = String(j.error);
      } catch {
        // keep HTTP error
      }
      if (ct.includes('text/html')) errMsg = 'Archivo de audio inválido (HTML recibido)';
      st.updateDownloadJob(jobId, { status: 'error', error: errMsg });
      activeDownloadAborts.delete(jobId);
      return { ok: false, error: errMsg };
    }

    const totalHeader = Number(res.headers.get('content-length') || 0);
    const reader = res.body?.getReader();
    const chunks: Uint8Array[] = [];
    let loaded = 0;

    if (reader) {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        if (value) {
          chunks.push(value);
          loaded += value.byteLength;
          const pct = totalHeader > 0
            ? Math.min(99, Math.round((loaded / totalHeader) * 100))
            : Math.min(92, Math.round(15 + Math.log10(1 + loaded / 40000) * 38));
          st.updateDownloadJob(jobId, {
            loadedBytes: loaded,
            totalBytes: totalHeader,
            progressPct: pct,
          });
        }
      }
    } else {
      const ab = await res.arrayBuffer();
      const u8 = new Uint8Array(ab);
      chunks.push(u8);
      loaded = u8.byteLength;
    }

    const blobParts: BlobPart[] = chunks.map(
      (c) => c.buffer.slice(c.byteOffset, c.byteOffset + c.byteLength) as ArrayBuffer
    );
    const blob = new Blob(blobParts, { type: 'audio/mpeg' });
    if (blob.size < 32_768) {
      const errMsg = 'Pista incompleta o dañada (<32 KB)';
      st.updateDownloadJob(jobId, { status: 'error', error: errMsg });
      activeDownloadAborts.delete(jobId);
      return { ok: false, error: errMsg };
    }
    await saveOfflineTrackAudio(track.id, blob);
    st.markOfflineTrackSaved(track.id);
    st.updateDownloadJob(jobId, {
      status: 'done',
      loadedBytes: blob.size,
      totalBytes: blob.size,
      progressPct: 100,
    });

    if (!opts?.offlineOnly) {
      triggerBlobDownload(blob, fileName);
    }

    activeDownloadAborts.delete(jobId);
    return { ok: true };
  } catch (err: unknown) {
    activeDownloadAborts.delete(jobId);
    const isAbort = err instanceof Error && err.name === 'AbortError';
    if (isAbort) {
      st.updateDownloadJob(jobId, { status: 'cancelled' });
      return { ok: false, error: 'cancelled' };
    }
    const msg = err instanceof Error ? err.message : 'Error de descarga MP3';
    st.updateDownloadJob(jobId, { status: 'error', error: msg });
    return { ok: false, error: msg };
  }
}

export async function saveTrackToOfflineLibrary(track: MusicTrack): Promise<{ ok: boolean; error?: string }> {
  return startDownloadMp3Job(track, { offlineOnly: true });
}

export async function removeTrackFromOfflineLibrary(trackId: string): Promise<void> {
  await deleteOfflineTrackAudio(trackId);
  useMusicStore.getState().markOfflineTrackRemoved(trackId);
}

export async function exportTracksAsMp3Zip(
  archiveTitle: string,
  tracks: MusicTrack[],
  onProgress?: (completed: number, total: number) => void
): Promise<{ ok: boolean; count: number; error?: string }> {
  const targetTracks = tracks.slice(0, 25);
  if (targetTracks.length === 0) return { ok: false, count: 0, error: 'Sin canciones' };
  const entries: Array<{ name: string; data: Uint8Array }> = [];

  for (let i = 0; i < targetTracks.length; i++) {
    const tr = targetTracks[i];
    onProgress?.(i, targetTracks.length);
    try {
      const { url, fileName } = buildMp3DownloadUrl(tr);
      const res = await fetch(url);
      const ctZip = (res.headers.get('content-type') || '').toLowerCase();
      if (!res.ok || ctZip.includes('text/html') || ctZip.includes('application/json')) continue;
      const ab = await res.arrayBuffer();
      if (ab.byteLength > 32_768) {
        entries.push({
          name: `${String(i + 1).padStart(2, '0')} - ${fileName}`,
          data: new Uint8Array(ab),
        });
      }
    } catch {
      // skip failed track cleanly
    }
  }
  onProgress?.(targetTracks.length, targetTracks.length);
  if (entries.length === 0) {
    return { ok: false, count: 0, error: 'No se pudo exportar ninguna canción' };
  }
  const zipBlob = buildZipBlob(entries);
  const safeZip = `${archiveTitle.replace(/[\\/:*?"<>|]/g, '').trim() || 'Riffan-Music'}.zip`;
  triggerBlobDownload(zipBlob, safeZip);
  return { ok: true, count: entries.length };
}

export function triggerTrackMp3Download(
  track: MusicTrack,
  opts?: Mp3ExportOptions
): void {
  void startDownloadMp3Job(track, opts);
}

let sharedAnalyserNode: AnalyserNode | null = null;
let sharedFreqArray: Uint8Array<ArrayBuffer> | null = null;
let sharedSpatialAngleRad = 0;
let sharedSpatialEngineActive = false;

export function getSpatial8dTelemetry() {
  return {
    angleRad: sharedSpatialAngleRad,
    activeWebAudio: sharedSpatialEngineActive,
  };
}

export function sampleMusicSpectrum(barCount = 24): number[] {
  if (!sharedAnalyserNode || !sharedFreqArray) {
    return Array.from({ length: barCount }, () => 0.14);
  }
  sharedAnalyserNode.getByteFrequencyData(sharedFreqArray);
  const out: number[] = [];
  const minBin = 1;
  const maxBin = Math.min(sharedFreqArray.length - 1, 64);
  for (let i = 0; i < barCount; i++) {
    const ratio = i / Math.max(1, barCount - 1);
    const binIdx = Math.round(minBin + Math.pow(ratio, 1.35) * (maxBin - minBin));
    const leftVal = sharedFreqArray[Math.max(0, binIdx - 1)] || 0;
    const centerVal = sharedFreqArray[binIdx] || 0;
    const rightVal = sharedFreqArray[Math.min(sharedFreqArray.length - 1, binIdx + 1)] || 0;
    const avg = centerVal * 0.6 + (leftVal + rightVal) * 0.2;
    const boosted = (avg / 225) * (1 + ratio * 0.32);
    out.push(Math.max(0.12, Math.min(1, boosted)));
  }
  return out;
}

function createStudioHallImpulse(ctx: AudioContext, durationSec = 1.45, decay = 2.6): AudioBuffer {
  const sampleRate = ctx.sampleRate || 44100;
  const length = Math.max(1, Math.floor(sampleRate * durationSec));
  const buffer = ctx.createBuffer(2, length, sampleRate);
  const earlyTaps = [0.016, 0.031, 0.053];

  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let lp = 0;
    for (let i = 0; i < length; i++) {
      const t = i / length;
      const noise = Math.random() * 2 - 1;
      lp = lp * 0.52 + noise * 0.48;
      data[i] = lp * Math.pow(1 - t, decay) * 0.65;
    }
    earlyTaps.forEach((tapSec, idx) => {
      const tapIdx = Math.floor((tapSec + ch * 0.004) * sampleRate);
      if (tapIdx < length) {
        data[tapIdx] += 0.28 / (idx + 1);
      }
    });
  }
  return buffer;
}

function createVinylCrackleBuffer(ctx: AudioContext): AudioBuffer {
  const sampleRate = ctx.sampleRate || 44100;
  const length = sampleRate * 4;
  const buffer = ctx.createBuffer(2, length, sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const data = buffer.getChannelData(ch);
    let prev = 0;
    for (let i = 0; i < length; i++) {
      const hiss = (Math.random() * 2 - 1) * 0.006;
      const pop = Math.random() > 0.9994 ? (Math.random() * 2 - 1) * 0.14 : 0;
      prev = prev * 0.65 + (hiss + pop) * 0.35;
      data[i] = prev;
    }
  }
  return buffer;
}

function computeSpatialCoords(
  trajectory: SpatialTrajectory,
  angle: number,
  radius: number
): { x: number; y: number; z: number } {
  if (trajectory === 'pendulum') {
    return {
      x: radius * Math.sin(angle),
      y: 0.08 * Math.cos(angle * 2),
      z: -radius * 0.9 - 0.25 * Math.cos(angle),
    };
  }
  if (trajectory === 'figure8') {
    return {
      x: radius * Math.sin(angle),
      y: 0.22 * Math.sin(angle * 2),
      z: -radius * 0.78 * Math.sin(angle * 2) - 0.85,
    };
  }
  if (trajectory === 'elevated') {
    return {
      x: radius * Math.sin(angle),
      y: 0.85 * Math.abs(Math.sin(angle * 0.5)) + 0.15,
      z: -radius * Math.cos(angle),
    };
  }
  return {
    x: radius * Math.sin(angle),
    y: 0.24 * Math.sin(angle * 2),
    z: -radius * Math.cos(angle),
  };
}

function isIosSafariBrowser(): boolean {
  if (typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent;
  return /iphone|ipad|ipod/i.test(ua) && !Hls.isSupported();
}

interface YTPlayerInstance {
  loadVideoById: (opts: string | { videoId: string; startSeconds?: number }) => void;
  cueVideoById?: (opts: string | { videoId: string; startSeconds?: number }) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  stopVideo: () => void;
  seekTo: (sec: number, allowSeekAhead?: boolean) => void;
  setVolume: (vol0to100: number) => void;
  mute: () => void;
  unMute: () => void;
  setPlaybackRate: (rate: number) => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  destroy?: () => void;
}

interface YTGlobalApi {
  Player: new (
    el: HTMLElement | string,
    opts: {
      width?: string | number;
      height?: string | number;
      videoId?: string;
      playerVars?: Record<string, string | number>;
      events?: {
        onReady?: (e: { target: YTPlayerInstance }) => void;
        onStateChange?: (e: { data: number; target: YTPlayerInstance }) => void;
        onError?: (e: { data: number; target: YTPlayerInstance }) => void;
      };
    }
  ) => YTPlayerInstance;
}

let ytApiLoadPromise: Promise<boolean> | null = null;
function ensureYouTubeIframeApi(): Promise<boolean> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve(false);
  }
  const win = window as unknown as {
    YT?: YTGlobalApi;
    onYouTubeIframeAPIReady?: () => void;
  };
  if (win.YT?.Player) return Promise.resolve(true);
  if (ytApiLoadPromise) return ytApiLoadPromise;

  ytApiLoadPromise = new Promise<boolean>((resolve) => {
    const done = (ok: boolean) => {
      if (!ok) ytApiLoadPromise = null;
      resolve(ok);
    };
    const timeoutId = window.setTimeout(() => done(Boolean(win.YT?.Player)), 6000);
    const prevReady = win.onYouTubeIframeAPIReady;
    win.onYouTubeIframeAPIReady = () => {
      try {
        prevReady?.();
      } catch {
        // ignore
      }
      window.clearTimeout(timeoutId);
      done(true);
    };
    if (!document.querySelector('script[src*="youtube.com/iframe_api"]')) {
      const s = document.createElement('script');
      s.src = 'https://www.youtube.com/iframe_api';
      s.async = true;
      s.onerror = () => {
        window.clearTimeout(timeoutId);
        done(false);
      };
      document.head?.appendChild(s);
    }
  });
  return ytApiLoadPromise;
}

function closestYtRate(rate: number): number {
  const supported = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 1.75, 2];
  let best = 1;
  let bestDiff = Infinity;
  for (const s of supported) {
    const d = Math.abs(s - rate);
    if (d < bestDiff) {
      bestDiff = d;
      best = s;
    }
  }
  return best;
}

export const MusicAudioEngine: React.FC = () => {
  const currentTrack = useMusicStore((s) => s.currentTrack);
  const activeRadio = useMusicStore((s) => s.activeRadio);
  const resolvedPlayback = useMusicStore((s) => s.resolvedPlayback);
  const isPlaying = useMusicStore((s) => s.isPlaying);
  const volume = useMusicStore((s) => s.volume);
  const isMuted = useMusicStore((s) => s.isMuted);
  const playbackRate = useMusicStore((s) => s.playbackRate);
  const preservesPitch = useMusicStore((s) => s.preservesPitch);
  const pitchSemitones = useMusicStore((s) => s.pitchSemitones);
  const eqBands10 = useMusicStore((s) => s.eqBands10);
  const bassBoostDb = useMusicStore((s) => s.bassBoostDb);
  const reverbMix = useMusicStore((s) => s.reverbMix);
  const exciterMix = useMusicStore((s) => s.exciterMix);
  const vinylCrackle = useMusicStore((s) => s.vinylCrackle);
  const vocalCancel = useMusicStore((s) => s.vocalCancel);
  const normalizeAudio = useMusicStore((s) => s.normalizeAudio);
  const spatial8dEnabled = useMusicStore((s) => s.spatial8dEnabled);
  const spatial8dMode = useMusicStore((s) => s.spatial8dMode);
  const spatialTrajectory = useMusicStore((s) => s.spatialTrajectory);
  const trimStartSec = useMusicStore((s) => s.trimStartSec);
  const seekRequestSec = useMusicStore((s) => s.seekRequestSec);
  const sleepTimerEndsAt = useMusicStore((s) => s.sleepTimerEndsAt);
  const autoDownloadMp3 = useMusicStore((s) => s.autoDownloadMp3);
  const wifiOnlyAutoDownload = useMusicStore((s) => s.wifiOnlyAutoDownload);
  const driveModeOpen = useMusicStore((s) => s.driveModeOpen);

  // Dual Audio Decks (Deck A & Deck B) for seamless Crossfade transitions
  const deckARef = useRef<HTMLAudioElement | null>(null);
  const deckBRef = useRef<HTMLAudioElement | null>(null);
  const activeDeckSlotRef = useRef<'A' | 'B'>('A');
  const hlsInstancesRef = useRef<{ A: Hls | null; B: Hls | null }>({ A: null, B: null });
  const crossfadeTimerRef = useRef<number | null>(null);
  const radioRetryTimerRef = useRef<number | null>(null);
  const offlineObjectUrlRef = useRef<string | null>(null);
  const lastStatTickRef = useRef<number>(0);

  const audioCtxRef = useRef<AudioContext | null>(null);
  const filtersRef = useRef<BiquadFilterNode[]>([]);
  const mediaSourceConnectedRef = useRef<boolean>(false);
  const activeBackendRef = useRef<'html-audio' | 'youtube' | 'none'>('none');
  const pendingResumeSecRef = useRef<number | null>(null);
  const autoDownloadedTrackIdRef = useRef<string | null>(null);
  const lastMediaPosSyncRef = useRef<number>(0);

  // Full-song YouTube IFrame audio engine refs
  const ytContainerRef = useRef<HTMLDivElement | null>(null);
  const ytPlayerRef = useRef<YTPlayerInstance | null>(null);
  const ytReadyRef = useRef<boolean>(false);
  const ytTargetVideoIdRef = useRef<string | null>(null);
  const ytProgressTimerRef = useRef<number | null>(null);
  const ytTriedIdsRef = useRef<Set<string>>(new Set());

  // WebAudio DSP nodes
  const deckAGainRef = useRef<GainNode | null>(null);
  const deckBGainRef = useRef<GainNode | null>(null);
  const dryBypassGainRef = useRef<GainNode | null>(null);
  const spatialMasterGainRef = useRef<GainNode | null>(null);
  const subBassBoostRef = useRef<BiquadFilterNode | null>(null);
  const exciterShelfRef = useRef<BiquadFilterNode | null>(null);
  const vocalDryGainRef = useRef<GainNode | null>(null);
  const vocalCancelGainRef = useRef<GainNode | null>(null);
  const vinylGainRef = useRef<GainNode | null>(null);
  const compressorRef = useRef<DynamicsCompressorNode | null>(null);
  const panner3dRef = useRef<PannerNode | null>(null);
  const stereoPannerRef = useRef<StereoPannerNode | null>(null);
  const centerAnchorGainRef = useRef<GainNode | null>(null);
  const reverbWetGainRef = useRef<GainNode | null>(null);

  const playNextRef = useRef(() => useMusicStore.getState().playNext());
  playNextRef.current = () => useMusicStore.getState().playNext();

  const getActiveAudioEl = () =>
    activeDeckSlotRef.current === 'A' ? deckARef.current : deckBRef.current;

  const getInactiveDeckSlot = (): 'A' | 'B' =>
    activeDeckSlotRef.current === 'A' ? 'B' : 'A';

  // Hydrate offline track IDs + preload YT IFrame API once on mount + clean up on unmount
  useEffect(() => {
    void listOfflineTrackMeta()
      .then((list) => {
        useMusicStore.getState().setOfflineTrackIds(list.map((m) => m.trackId));
      })
      .catch(() => {});
    if (typeof window !== 'undefined' && !/jsdom/i.test(navigator.userAgent || '')) {
      void ensureYouTubeIframeApi();
    }
    return () => {
      if (offlineObjectUrlRef.current) {
        URL.revokeObjectURL(offlineObjectUrlRef.current);
        offlineObjectUrlRef.current = null;
      }
      if (radioRetryTimerRef.current) window.clearTimeout(radioRetryTimerRef.current);
      if (crossfadeTimerRef.current) window.clearTimeout(crossfadeTimerRef.current);
      if (ytProgressTimerRef.current) window.clearInterval(ytProgressTimerRef.current);
      try {
        ytPlayerRef.current?.destroy?.();
      } catch {
        // ignore
      }
      ytPlayerRef.current = null;
      ytReadyRef.current = false;
    };
  }, []);

  // Screen Wake Lock when Drive Mode is open
  useEffect(() => {
    if (!driveModeOpen || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let cancelled = false;
    void (navigator as unknown as { wakeLock: { request: (t: 'screen') => Promise<WakeLockSentinel> } })
      .wakeLock.request('screen')
      .then((sentinel) => {
        if (cancelled) void sentinel.release().catch(() => {});
        else lock = sentinel;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
      if (lock) void lock.release().catch(() => {});
    };
  }, [driveModeOpen]);

  const ensureWebAudioChain = (bypassForIosHls = false) => {
    if (bypassForIosHls) return;
    const deckA = deckARef.current;
    const deckB = deckBRef.current;
    if (!deckA || !deckB || typeof window === 'undefined') return;
    try {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      const ctx = audioCtxRef.current || new AC();
      if (!audioCtxRef.current) {
        ctx.onstatechange = () => {
          if (ctx.state !== 'running' && useMusicStore.getState().isPlaying) {
            void ctx.resume().catch(() => {});
          }
        };
      }
      audioCtxRef.current = ctx;
      if (ctx.state !== 'running') {
        void ctx.resume().catch(() => {});
      }
      if (mediaSourceConnectedRef.current) return;

      const st = useMusicStore.getState();
      const srcA = ctx.createMediaElementSource(deckA);
      const srcB = ctx.createMediaElementSource(deckB);

      const deckAGain = ctx.createGain();
      const deckBGain = ctx.createGain();
      deckAGain.gain.value = activeDeckSlotRef.current === 'A' ? 1 : 0;
      deckBGain.gain.value = activeDeckSlotRef.current === 'B' ? 1 : 0;

      const deckMix = ctx.createGain();
      srcA.connect(deckAGain);
      srcB.connect(deckBGain);
      deckAGain.connect(deckMix);
      deckBGain.connect(deckMix);

      // Sub-Bass + 10-Band EQ + Aural Exciter
      const subBassBoost = ctx.createBiquadFilter();
      subBassBoost.type = 'lowshelf';
      subBassBoost.frequency.value = 82;
      subBassBoost.gain.value = st.bassBoostDb + (st.spatial8dEnabled ? 2.2 : 0);

      const filters = EQ_10_BANDS_HZ.map((freq, idx) => {
        const biquad = ctx.createBiquadFilter();
        biquad.type =
          idx === 0 ? 'lowshelf' : idx === EQ_10_BANDS_HZ.length - 1 ? 'highshelf' : 'peaking';
        biquad.frequency.value = freq;
        biquad.Q.value = 1.2;
        biquad.gain.value = st.eqBands10?.[idx] ?? 0;
        return biquad;
      });

      const exciterShelf = ctx.createBiquadFilter();
      exciterShelf.type = 'highshelf';
      exciterShelf.frequency.value = 6800;
      exciterShelf.gain.value = (st.exciterMix || 0) * 6.5;

      deckMix.connect(subBassBoost);
      let prev: AudioNode = subBassBoost;
      for (const f of filters) {
        prev.connect(f);
        prev = f;
      }
      prev.connect(exciterShelf);

      // M/S Karaoke Vocal Cancel matrix
      const eqOut = ctx.createGain();
      const vocalDryGain = ctx.createGain();
      vocalDryGain.gain.value = st.vocalCancel ? 0 : 1;

      const vocalCancelGain = ctx.createGain();
      vocalCancelGain.gain.value = st.vocalCancel ? 1 : 0;

      const splitter = ctx.createChannelSplitter(2);
      const merger = ctx.createChannelMerger(2);
      const invertR = ctx.createGain();
      invertR.gain.value = -0.88;
      const invertL = ctx.createGain();
      invertL.gain.value = -0.88;

      exciterShelf.connect(vocalDryGain);
      vocalDryGain.connect(eqOut);

      exciterShelf.connect(splitter);
      splitter.connect(merger, 0, 0);
      splitter.connect(invertR, 1);
      invertR.connect(merger, 0, 0);
      splitter.connect(merger, 1, 1);
      splitter.connect(invertL, 0);
      invertL.connect(merger, 0, 1);
      merger.connect(vocalCancelGain);
      vocalCancelGain.connect(eqOut);

      // Stereo & 8D Spatializer branches
      const use8d = st.spatial8dEnabled;
      const prof = SPATIAL_PROFILES[st.spatial8dMode] || SPATIAL_PROFILES.orbit;

      const dryBypassGain = ctx.createGain();
      dryBypassGain.gain.value = use8d ? 0 : 1;

      const spatialMasterGain = ctx.createGain();
      spatialMasterGain.gain.value = use8d ? 1.04 : 0;

      const centerAnchorGain = ctx.createGain();
      centerAnchorGain.gain.value = prof.centerMix;

      const panner3d = ctx.createPanner();
      panner3d.panningModel = 'HRTF';
      panner3d.distanceModel = 'inverse';
      panner3d.refDistance = 2.2;
      panner3d.maxDistance = 100;
      panner3d.rolloffFactor = 0.32;
      panner3d.coneInnerAngle = 360;
      panner3d.coneOuterAngle = 360;
      panner3d.coneOuterGain = 1;

      const stereoPanner = ctx.createStereoPanner();
      stereoPanner.pan.value = 0;

      const spatialDirectGain = ctx.createGain();
      spatialDirectGain.gain.value = 0.94;

      // Studio Hall Convolver Reverb
      const convolver = ctx.createConvolver();
      convolver.buffer = createStudioHallImpulse(ctx);

      const reverbDamp = ctx.createBiquadFilter();
      reverbDamp.type = 'lowpass';
      reverbDamp.frequency.value = 5400;

      const reverbWetGain = ctx.createGain();
      reverbWetGain.gain.value = st.reverbMix;

      eqOut.connect(dryBypassGain);
      eqOut.connect(centerAnchorGain);
      centerAnchorGain.connect(spatialMasterGain);

      eqOut.connect(panner3d);
      panner3d.connect(stereoPanner);
      stereoPanner.connect(spatialDirectGain);
      spatialDirectGain.connect(spatialMasterGain);

      dryBypassGain.connect(convolver);
      stereoPanner.connect(convolver);
      convolver.connect(reverbDamp);
      reverbDamp.connect(reverbWetGain);

      // Lo-Fi Vinyl Crackle loop generator
      const vinylSource = ctx.createBufferSource();
      vinylSource.buffer = createVinylCrackleBuffer(ctx);
      vinylSource.loop = true;
      const vinylGain = ctx.createGain();
      vinylGain.gain.value = st.isPlaying ? (st.vinylCrackle || 0) * 0.45 : 0;
      vinylSource.connect(vinylGain);
      try {
        vinylSource.start();
      } catch {
        // ignore
      }

      // Analyser + Protective Studio Limiter / LUFS Normalizer
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      analyser.smoothingTimeConstant = 0.78;

      const limiter = ctx.createDynamicsCompressor();
      limiter.threshold.value = st.normalizeAudio ? -14 : -4;
      limiter.knee.value = 16;
      limiter.ratio.value = st.normalizeAudio ? 4.0 : 2.2;
      limiter.attack.value = 0.004;
      limiter.release.value = 0.18;

      dryBypassGain.connect(analyser);
      spatialMasterGain.connect(analyser);
      reverbWetGain.connect(analyser);
      vinylGain.connect(analyser);
      analyser.connect(limiter);
      limiter.connect(ctx.destination);

      deckAGainRef.current = deckAGain;
      deckBGainRef.current = deckBGain;
      subBassBoostRef.current = subBassBoost;
      filtersRef.current = filters;
      exciterShelfRef.current = exciterShelf;
      vocalDryGainRef.current = vocalDryGain;
      vocalCancelGainRef.current = vocalCancelGain;
      vinylGainRef.current = vinylGain;
      compressorRef.current = limiter;
      dryBypassGainRef.current = dryBypassGain;
      spatialMasterGainRef.current = spatialMasterGain;
      panner3dRef.current = panner3d;
      stereoPannerRef.current = stereoPanner;
      centerAnchorGainRef.current = centerAnchorGain;
      reverbWetGainRef.current = reverbWetGain;

      sharedAnalyserNode = analyser;
      sharedFreqArray = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
      mediaSourceConnectedRef.current = true;
    } catch {
      // Fallback to direct HTML5 audio output
    }
  };

  // Smoothly update DSP parameters live
  useEffect(() => {
    const ctx = audioCtxRef.current;
    if (!ctx || !mediaSourceConnectedRef.current) return;
    if (spatial8dEnabled && ctx.state === 'suspended') {
      void ctx.resume().catch(() => {});
    }
    const now = ctx.currentTime;
    const prof = SPATIAL_PROFILES[spatial8dMode] || SPATIAL_PROFILES.orbit;
    try {
      dryBypassGainRef.current?.gain.setTargetAtTime(spatial8dEnabled ? 0 : 1, now, 0.07);
      spatialMasterGainRef.current?.gain.setTargetAtTime(spatial8dEnabled ? 1.04 : 0, now, 0.07);
      subBassBoostRef.current?.gain.setTargetAtTime(
        bassBoostDb + (spatial8dEnabled ? prof.warmthDb : 0),
        now,
        0.06
      );
      centerAnchorGainRef.current?.gain.setTargetAtTime(prof.centerMix, now, 0.07);
      reverbWetGainRef.current?.gain.setTargetAtTime(reverbMix, now, 0.06);
      exciterShelfRef.current?.gain.setTargetAtTime(exciterMix * 6.5, now, 0.06);
      vocalDryGainRef.current?.gain.setTargetAtTime(vocalCancel ? 0 : 1, now, 0.05);
      vocalCancelGainRef.current?.gain.setTargetAtTime(vocalCancel ? 1 : 0, now, 0.05);
      vinylGainRef.current?.gain.setTargetAtTime(isPlaying ? vinylCrackle * 0.45 : 0, now, 0.08);
      if (compressorRef.current) {
        compressorRef.current.threshold.setTargetAtTime(normalizeAudio ? -14 : -4, now, 0.08);
        compressorRef.current.ratio.setTargetAtTime(normalizeAudio ? 4.0 : 2.2, now, 0.08);
      }
    } catch {
      // ignore
    }
  }, [
    spatial8dEnabled,
    spatial8dMode,
    bassBoostDb,
    reverbMix,
    exciterMix,
    vocalCancel,
    vinylCrackle,
    normalizeAudio,
    isPlaying,
  ]);

  // Continuous 60fps 8D Trajectory Animator
  useEffect(() => {
    const panner = panner3dRef.current;
    const stereo = stereoPannerRef.current;
    const ctx = audioCtxRef.current;

    if (!spatial8dEnabled) {
      sharedSpatialEngineActive = false;
      if (ctx && panner && stereo) {
        const now = ctx.currentTime;
        try {
          panner.positionX.setTargetAtTime(0, now, 0.06);
          panner.positionY.setTargetAtTime(0, now, 0.06);
          panner.positionZ.setTargetAtTime(-1, now, 0.06);
          stereo.pan.setTargetAtTime(0, now, 0.06);
        } catch {
          // ignore
        }
      }
      return;
    }

    if (!isPlaying) {
      sharedSpatialEngineActive = activeBackendRef.current === 'html-audio';
      return;
    }

    let rafId = 0;
    let lastTs = performance.now();
    const tick = (ts: number) => {
      const dtSec = Math.min(0.1, Math.max(0.001, (ts - lastTs) / 1000));
      lastTs = ts;

      const st = useMusicStore.getState();
      const prof = SPATIAL_PROFILES[st.spatial8dMode] || SPATIAL_PROFILES.orbit;
      const isHtmlAudio = activeBackendRef.current === 'html-audio';
      sharedSpatialEngineActive = isHtmlAudio;

      if (st.isPlaying) {
        const periodSec = Math.max(3, st.spatial8dSpeedSec || 9.5);
        const omega = (Math.PI * 2) / periodSec;
        sharedSpatialAngleRad = (sharedSpatialAngleRad + omega * dtSec) % (Math.PI * 2);

        const cCtx = audioCtxRef.current;
        const p3 = panner3dRef.current;
        const sp = stereoPannerRef.current;
        if (cCtx && p3 && sp && isHtmlAudio) {
          const now = cCtx.currentTime;
          const { x, y, z } = computeSpatialCoords(
            st.spatialTrajectory || 'orbit',
            sharedSpatialAngleRad,
            prof.radius
          );
          try {
            p3.positionX.setTargetAtTime(x, now, 0.028);
            p3.positionY.setTargetAtTime(y, now, 0.028);
            p3.positionZ.setTargetAtTime(z, now, 0.028);
            sp.pan.setTargetAtTime(Math.sin(sharedSpatialAngleRad) * st.stereoWidth, now, 0.028);
          } catch {
            // ignore
          }
        }
      }
      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(rafId);
      sharedSpatialEngineActive = false;
    };
  }, [
    spatial8dEnabled,
    spatial8dMode,
    spatialTrajectory,
    isPlaying,
    activeRadio?.id,
    currentTrack?.id,
    resolvedPlayback?.sourceType,
  ]);

  // Sync live 10-band Equalizer gains smoothly
  useEffect(() => {
    filtersRef.current.forEach((filter, idx) => {
      try {
        filter.gain.setTargetAtTime(eqBands10[idx] ?? 0, audioCtxRef.current?.currentTime || 0, 0.04);
      } catch {
        // ignore
      }
    });
  }, [eqBands10]);

  // Sleep timer monitor
  useEffect(() => {
    if (!sleepTimerEndsAt) return;
    const ms = Math.max(200, sleepTimerEndsAt - Date.now());
    const t = window.setTimeout(() => {
      useMusicStore.getState().setIsPlaying(false);
      useMusicStore.getState().setSleepTimerMinutes(null);
    }, ms);
    return () => window.clearTimeout(t);
  }, [sleepTimerEndsAt]);

  // Resolve track playback: Offline IndexedDB first -> Full-length server resolver -> Emergency preview
  useEffect(() => {
    if (!currentTrack) return;

    ytTriedIdsRef.current = new Set();
    let cancelled = false;
    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 9500);
    const store = useMusicStore.getState();
    store.setResolvingTrack(true);
    store.setPlaybackError(null);

    if (offlineObjectUrlRef.current) {
      URL.revokeObjectURL(offlineObjectUrlRef.current);
      offlineObjectUrlRef.current = null;
    }

    const expectedTrackId = currentTrack.id;

    const resolveTrack = async () => {
      try {
        const offlineBlob = await getOfflineTrackBlob(expectedTrackId);
        if (cancelled) return;
        if (offlineBlob && offlineBlob.size > 1000) {
          const objUrl = URL.createObjectURL(offlineBlob);
          offlineObjectUrlRef.current = objUrl;
          useMusicStore.getState().setResolvedPlayback(
            {
              trackId: expectedTrackId,
              sourceType: 'audio-mp3',
              sourceLabel: 'Offline Hi-Fi',
              streamUrl: objUrl,
              proxiedUrl: objUrl,
              bitrateKbps: 320,
              provider: 'offline',
              fullLength: true,
            },
            expectedTrackId
          );
          return;
        }
      } catch {
        // continue online
      }

      if (typeof navigator !== 'undefined' && navigator.onLine === false) {
        if (!cancelled && useMusicStore.getState().currentTrack?.id === expectedTrackId) {
          useMusicStore.getState().setResolvingTrack(false);
          useMusicStore.getState().setPlaybackError('Sin conexión y sin caché offline para esta canción');
        }
        return;
      }

      const qs = new URLSearchParams({
        trackId: currentTrack.id,
        title: currentTrack.title,
        artist: currentTrack.artist.name,
        duration: String(currentTrack.durationSec || 0),
        preferAudio: '1',
      });
      if (currentTrack.previewUrl) qs.set('preview', currentTrack.previewUrl);
      if (currentTrack.soundcloudId) qs.set('scId', currentTrack.soundcloudId);
      if (currentTrack.audiusId) qs.set('audiusId', currentTrack.audiusId);
      if (currentTrack.youtubeVideoId) qs.set('ytId', currentTrack.youtubeVideoId);
      if (currentTrack.isrc) qs.set('isrc', currentTrack.isrc);

      try {
        const r = await fetch(`/api/music/play?${qs.toString()}`, { signal: controller.signal });
        const data = (await r.json()) as ResolvedTrackPlayback & { success?: boolean };
        if (cancelled || useMusicStore.getState().currentTrack?.id !== expectedTrackId) return;

        const ytId = data?.youtubeVideoId || data?.youtubeMvId || currentTrack.youtubeVideoId;
        if (data?.success && data?.sourceType && data.sourceType !== 'youtube' && data?.proxiedUrl && (data.fullLength || !ytId)) {
          useMusicStore.getState().setResolvedPlayback(
            { ...data, trackId: expectedTrackId },
            expectedTrackId
          );
        } else if (ytId) {
          useMusicStore.getState().setResolvedPlayback(
            {
              ...(data || {}),
              trackId: expectedTrackId,
              sourceType: 'youtube',
              sourceLabel: data?.sourceLabel || 'Audio Completo HD',
              youtubeVideoId: ytId,
              youtubeMvId: data?.youtubeMvId || ytId,
              youtubeAltIds: data?.youtubeAltIds || [],
              previewUrl: data?.previewUrl || currentTrack.previewUrl,
              fullLength: true,
              bitrateKbps: data?.bitrateKbps || 256,
              provider: data?.provider || 'Riffan Engine',
            },
            expectedTrackId
          );
        } else if (currentTrack.previewUrl) {
          useMusicStore.getState().setResolvedPlayback(
            {
              trackId: expectedTrackId,
              sourceType: 'preview',
              sourceLabel: 'Preview HD (30s)',
              streamUrl: currentTrack.previewUrl,
              proxiedUrl: `/api/music/stream-proxy?url=${encodeURIComponent(currentTrack.previewUrl)}`,
              youtubeMvId: data?.youtubeMvId || currentTrack.youtubeVideoId,
              previewUrl: currentTrack.previewUrl,
              bitrateKbps: 128,
              provider: 'deezer',
              fullLength: false,
            },
            expectedTrackId
          );
        } else {
          useMusicStore.getState().setResolvingTrack(false);
          useMusicStore.getState().setPlaybackError('No encontramos un stream verificado exacto para esta canción.');
        }
      } catch {
        if (cancelled || useMusicStore.getState().currentTrack?.id !== expectedTrackId) return;
        if (currentTrack.youtubeVideoId) {
          useMusicStore.getState().setResolvedPlayback(
            {
              trackId: expectedTrackId,
              sourceType: 'youtube',
              sourceLabel: 'Audio Completo HD',
              youtubeVideoId: currentTrack.youtubeVideoId,
              youtubeMvId: currentTrack.youtubeVideoId,
              previewUrl: currentTrack.previewUrl,
              bitrateKbps: 256,
              provider: 'Riffan Engine',
              fullLength: true,
            },
            expectedTrackId
          );
        } else if (currentTrack.previewUrl) {
          useMusicStore.getState().setResolvedPlayback(
            {
              trackId: expectedTrackId,
              sourceType: 'preview',
              sourceLabel: 'Preview HD (30s)',
              streamUrl: currentTrack.previewUrl,
              proxiedUrl: `/api/music/stream-proxy?url=${encodeURIComponent(currentTrack.previewUrl)}`,
              youtubeMvId: currentTrack.youtubeVideoId,
              previewUrl: currentTrack.previewUrl,
              bitrateKbps: 128,
              provider: 'deezer',
              fullLength: false,
            },
            expectedTrackId
          );
        } else {
          useMusicStore.getState().setResolvingTrack(false);
          useMusicStore.getState().setPlaybackError('Error de conexión con fuente de audio');
        }
      } finally {
        window.clearTimeout(timeoutId);
      }
    };

    void resolveTrack();

    return () => {
      cancelled = true;
      window.clearTimeout(timeoutId);
      controller.abort();
    };
  }, [currentTrack?.id]);

  // Automatic MP3 download when enabled (respecting Wi-Fi-only preference)
  useEffect(() => {
    if (!autoDownloadMp3 || !currentTrack || !resolvedPlayback?.streamUrl) return;
    if (resolvedPlayback.provider === 'offline') return;
    if (autoDownloadedTrackIdRef.current === currentTrack.id) return;
    if (wifiOnlyAutoDownload && typeof navigator !== 'undefined') {
      const conn = (navigator as unknown as { connection?: { type?: string; saveData?: boolean } })
        .connection;
      if (conn?.saveData || conn?.type === 'cellular') return;
    }
    autoDownloadedTrackIdRef.current = currentTrack.id;
    void startDownloadMp3Job(currentTrack);
  }, [autoDownloadMp3, wifiOnlyAutoDownload, currentTrack?.id, resolvedPlayback?.streamUrl, resolvedPlayback?.provider]);

  // Gapless prefetch of next 2 tracks in queue
  useEffect(() => {
    if (!currentTrack) return;
    const { queue, queueIndex } = useMusicStore.getState();
    const candidates = [queue[queueIndex + 1], queue[queueIndex + 2]].filter(Boolean);
    if (candidates.length === 0) return;

    const timer = window.setTimeout(() => {
      candidates.forEach((nextTrack) => {
        const qs = new URLSearchParams({
          trackId: nextTrack.id,
          title: nextTrack.title,
          artist: nextTrack.artist.name,
          duration: String(nextTrack.durationSec || 0),
          preferAudio: '1',
        });
        if (nextTrack.previewUrl) qs.set('preview', nextTrack.previewUrl);
        if (nextTrack.soundcloudId) qs.set('scId', nextTrack.soundcloudId);
        if (nextTrack.audiusId) qs.set('audiusId', nextTrack.audiusId);
        if (nextTrack.youtubeVideoId) qs.set('ytId', nextTrack.youtubeVideoId);
        if (nextTrack.isrc) qs.set('isrc', nextTrack.isrc);
        void fetch(`/api/music/play?${qs.toString()}`).catch(() => {});
      });
    }, 900);
    return () => window.clearTimeout(timer);
  }, [currentTrack?.id]);

  // Proactive Spotify-style genre/artist radio refill when queue is near the end
  const autoplaySimilar = useMusicStore((s) => s.autoplaySimilar);
  const queueIndex = useMusicStore((s) => s.queueIndex);
  const queueLength = useMusicStore((s) => s.queue.length);
  const repeatMode = useMusicStore((s) => s.repeatMode);

  useEffect(() => {
    if (!currentTrack || activeRadio || !autoplaySimilar || repeatMode === 'one') return;
    if (queueLength - queueIndex > 2) return;

    const timer = window.setTimeout(() => {
      const st = useMusicStore.getState();
      if (!st.autoplaySimilar || st.activeRadio || !st.currentTrack) return;
      if (st.queue.length - st.queueIndex <= 2) {
        void st.fetchAndEnqueueRelatedTracks(st.seedTrack || st.currentTrack);
      }
    }, 550);

    return () => window.clearTimeout(timer);
  }, [currentTrack?.id, activeRadio?.id, autoplaySimilar, queueIndex, queueLength, repeatMode]);

  const stopYouTubePlayer = () => {
    if (ytProgressTimerRef.current) {
      window.clearInterval(ytProgressTimerRef.current);
      ytProgressTimerRef.current = null;
    }
    ytTargetVideoIdRef.current = null;
    try {
      ytPlayerRef.current?.pauseVideo?.();
      ytPlayerRef.current?.stopVideo?.();
    } catch {
      // ignore
    }
  };

  // Dual-Deck Crossfade + Full-Song YouTube Engine + Radio Playback Attacher
  useEffect(() => {
    const cleanupSlot = (slot: 'A' | 'B') => {
      const h = hlsInstancesRef.current[slot];
      if (h) {
        try {
          h.destroy();
        } catch {
          // ignore
        }
        hlsInstancesRef.current[slot] = null;
      }
      const el = slot === 'A' ? deckARef.current : deckBRef.current;
      if (el) {
        el.pause();
        el.removeAttribute('src');
        el.load();
      }
    };

    if (crossfadeTimerRef.current) {
      window.clearTimeout(crossfadeTimerRef.current);
      crossfadeTimerRef.current = null;
    }

    if (activeRadio) {
      stopYouTubePlayer();
      cleanupSlot('A');
      cleanupSlot('B');
      activeDeckSlotRef.current = 'A';
      const el = deckARef.current;
      if (!el) return;
      activeBackendRef.current = 'html-audio';
      sharedSpatialEngineActive = Boolean(useMusicStore.getState().spatial8dEnabled);
      ensureWebAudioChain(false);

      if (audioCtxRef.current && deckAGainRef.current && deckBGainRef.current) {
        const now = audioCtxRef.current.currentTime;
        deckAGainRef.current.gain.setTargetAtTime(1, now, 0.03);
        deckBGainRef.current.gain.setTargetAtTime(0, now, 0.03);
      }

      const src = `/api/music/stream-proxy?url=${encodeURIComponent(activeRadio.streamUrl)}`;
      el.src = src;
      el.load();
      if (useMusicStore.getState().isPlaying) {
        void el.play().catch(() => {});
      }
      return;
    }

    if (!currentTrack || !resolvedPlayback) {
      stopYouTubePlayer();
      cleanupSlot('A');
      cleanupSlot('B');
      activeBackendRef.current = 'none';
      sharedSpatialEngineActive = false;
      return;
    }

    if (resolvedPlayback.trackId && resolvedPlayback.trackId !== currentTrack.id) {
      return;
    }

    // Full-Song YouTube Audio Backend (complete track length, zero 30s truncation)
    if (resolvedPlayback.sourceType === 'youtube') {
      const videoId =
        resolvedPlayback.youtubeVideoId ||
        resolvedPlayback.youtubeMvId ||
        currentTrack.youtubeVideoId ||
        '';
      if (!videoId) return;

      cleanupSlot('A');
      cleanupSlot('B');
      activeBackendRef.current = 'youtube';
      sharedSpatialEngineActive = false;
      ytTargetVideoIdRef.current = videoId;

      let cancelledYt = false;
      const startProgressLoop = () => {
        if (ytProgressTimerRef.current) window.clearInterval(ytProgressTimerRef.current);
        ytProgressTimerRef.current = window.setInterval(() => {
          if (activeBackendRef.current !== 'youtube' || !ytPlayerRef.current || !ytReadyRef.current) return;
          const st = useMusicStore.getState();
          if (!st.isPlaying || !st.currentTrack) return;
          try {
            const cur = Number(ytPlayerRef.current.getCurrentTime?.() || 0);
            const dur = Number(ytPlayerRef.current.getDuration?.() || 0);
            if (Number.isFinite(cur)) {
              st.setProgress(cur, Number.isFinite(dur) && dur > 0 ? dur : undefined);
            }
            if (st.trimEndSec > st.trimStartSec + 1 && cur >= st.trimEndSec) {
              playNextRef.current();
              return;
            }
            const nowMs = performance.now();
            if (nowMs - lastStatTickRef.current >= 5000) {
              lastStatTickRef.current = nowMs;
              st.recordListeningTick(st.currentTrack, 5);
            }
            if (
              nowMs - lastMediaPosSyncRef.current > 1000 &&
              dur > 0 &&
              typeof navigator !== 'undefined' &&
              'mediaSession' in navigator &&
              typeof navigator.mediaSession.setPositionState === 'function'
            ) {
              lastMediaPosSyncRef.current = nowMs;
              navigator.mediaSession.setPositionState({
                duration: dur,
                playbackRate: closestYtRate(st.playbackRate * Math.pow(2, (st.pitchSemitones || 0) / 12)),
                position: Math.min(dur, Math.max(0, cur)),
              });
            }
          } catch {
            // ignore transient iframe poll error
          }
        }, 250);
      };

      const applyYtParams = (p: YTPlayerInstance) => {
        const st = useMusicStore.getState();
        const pitchRatio = Math.pow(2, (st.pitchSemitones || 0) / 12);
        try {
          if (st.isMuted) p.mute();
          else p.unMute();
          p.setVolume(Math.round(st.volume * 100));
          p.setPlaybackRate(closestYtRate(st.playbackRate * pitchRatio));
        } catch {
          // ignore
        }
      };

      const handleYtFailure = (failedId: string) => {
        ytTriedIdsRef.current.add(failedId);
        const curState = useMusicStore.getState();
        if (curState.currentTrack?.id !== currentTrack.id) return;
        const pool = [
          resolvedPlayback.youtubeVideoId,
          resolvedPlayback.youtubeMvId,
          ...(resolvedPlayback.youtubeAltIds || []),
          currentTrack.youtubeVideoId,
        ].filter((id): id is string => Boolean(id) && !ytTriedIdsRef.current.has(id!));
        const nextYt = pool[0];
        if (nextYt) {
          curState.setResolvedPlayback(
            {
              ...resolvedPlayback,
              trackId: currentTrack.id,
              sourceType: 'youtube',
              youtubeVideoId: nextYt,
            },
            currentTrack.id
          );
        } else if (resolvedPlayback.previewUrl || currentTrack.previewUrl) {
          const prevUrl = (resolvedPlayback.previewUrl || currentTrack.previewUrl)!;
          curState.setResolvedPlayback(
            {
              trackId: currentTrack.id,
              sourceType: 'preview',
              sourceLabel: 'Preview HD (30s)',
              streamUrl: prevUrl,
              proxiedUrl: `/api/music/stream-proxy?url=${encodeURIComponent(prevUrl)}`,
              previewUrl: prevUrl,
              bitrateKbps: 128,
              provider: 'Preview',
              fullLength: false,
            },
            currentTrack.id
          );
        } else {
          curState.setPlaybackError('No se pudo reproducir el audio completo de esta pista.');
        }
      };

      void ensureYouTubeIframeApi().then((ok) => {
        if (cancelledYt || activeBackendRef.current !== 'youtube') return;
        if (!ok || !ytContainerRef.current) {
          handleYtFailure(videoId);
          return;
        }
        const win = window as unknown as { YT?: YTGlobalApi };
        if (!win.YT?.Player) {
          handleYtFailure(videoId);
          return;
        }

        if (ytPlayerRef.current && ytReadyRef.current) {
          applyYtParams(ytPlayerRef.current);
          const startAt = trimStartSec > 0 ? trimStartSec : 0;
          ytPlayerRef.current.loadVideoById({ videoId, startSeconds: startAt });
          if (!useMusicStore.getState().isPlaying) {
            ytPlayerRef.current.pauseVideo();
          }
          startProgressLoop();
          return;
        }

        try {
          ytPlayerRef.current?.destroy?.();
        } catch {
          // ignore
        }
        ytReadyRef.current = false;
        ytPlayerRef.current = new win.YT.Player(ytContainerRef.current, {
          width: '16',
          height: '16',
          videoId,
          playerVars: {
            autoplay: useMusicStore.getState().isPlaying ? 1 : 0,
            controls: 0,
            playsinline: 1,
            rel: 0,
            fs: 0,
            modestbranding: 1,
            enablejsapi: 1,
            origin: window.location.origin,
          },
          events: {
            onReady: ({ target }) => {
              ytReadyRef.current = true;
              if (cancelledYt || activeBackendRef.current !== 'youtube') {
                target.pauseVideo();
                return;
              }
              applyYtParams(target);
              if (trimStartSec > 0) target.seekTo(trimStartSec, true);
              if (useMusicStore.getState().isPlaying) target.playVideo();
              else target.pauseVideo();
              startProgressLoop();
            },
            onStateChange: ({ data, target }) => {
              if (activeBackendRef.current !== 'youtube') return;
              if (data === 0) {
                useMusicStore.getState().advanceAfterTrackEnd();
              } else if (data === 1) {
                applyYtParams(target);
                startProgressLoop();
              }
            },
            onError: () => {
              if (activeBackendRef.current !== 'youtube') return;
              handleYtFailure(ytTargetVideoIdRef.current || videoId);
            },
          },
        });
      });

      return () => {
        cancelledYt = true;
      };
    }

    stopYouTubePlayer();
    const st = useMusicStore.getState();
    const targetSrc = resolvedPlayback.proxiedUrl || resolvedPlayback.streamUrl || '';
    if (!targetSrc) return;

    const bypassIosHls = isIosSafariBrowser() && resolvedPlayback.sourceType === 'audio-hls';
    const prevSlot = activeDeckSlotRef.current;
    const prevEl = prevSlot === 'A' ? deckARef.current : deckBRef.current;
    const canCrossfade =
      !bypassIosHls &&
      mediaSourceConnectedRef.current &&
      st.crossfadeSec > 0.25 &&
      prevEl &&
      !prevEl.paused &&
      Boolean(prevEl.currentSrc || prevEl.src);

    const nextSlot: 'A' | 'B' = canCrossfade ? getInactiveDeckSlot() : prevSlot;
    cleanupSlot(nextSlot);
    activeDeckSlotRef.current = nextSlot;
    const nextEl = nextSlot === 'A' ? deckARef.current : deckBRef.current;
    if (!nextEl) return;

    activeBackendRef.current = 'html-audio';
    sharedSpatialEngineActive = Boolean(st.spatial8dEnabled && !bypassIosHls);
    ensureWebAudioChain(bypassIosHls);

    // Execute smooth gain crossfade between decks
    if (audioCtxRef.current && deckAGainRef.current && deckBGainRef.current) {
      const now = audioCtxRef.current.currentTime;
      const incomingGain = nextSlot === 'A' ? deckAGainRef.current : deckBGainRef.current;
      const outgoingGain = nextSlot === 'A' ? deckBGainRef.current : deckAGainRef.current;

      if (canCrossfade) {
        const cfSec = Math.max(0.4, st.crossfadeSec);
        try {
          outgoingGain.gain.cancelScheduledValues(now);
          outgoingGain.gain.setValueAtTime(outgoingGain.gain.value, now);
          outgoingGain.gain.linearRampToValueAtTime(0, now + cfSec);

          incomingGain.gain.cancelScheduledValues(now);
          incomingGain.gain.setValueAtTime(0.02, now);
          incomingGain.gain.linearRampToValueAtTime(1, now + cfSec);
        } catch {
          // ignore
        }
        crossfadeTimerRef.current = window.setTimeout(() => {
          cleanupSlot(prevSlot);
        }, Math.round(cfSec * 1000) + 120);
      } else {
        cleanupSlot(prevSlot === nextSlot ? (nextSlot === 'A' ? 'B' : 'A') : prevSlot);
        try {
          incomingGain.gain.cancelScheduledValues(now);
          incomingGain.gain.setValueAtTime(1, now);
          outgoingGain.gain.cancelScheduledValues(now);
          outgoingGain.gain.setValueAtTime(0, now);
        } catch {
          // ignore
        }
      }
    }

    if (trimStartSec > 0) {
      pendingResumeSecRef.current = trimStartSec;
    }

    if (resolvedPlayback.sourceType === 'audio-hls') {
      if (Hls.isSupported()) {
        const hls = new Hls({
          enableWorker: true,
          lowLatencyMode: false,
          startFragPrefetch: true,
          maxBufferLength: 10,
          maxMaxBufferLength: 20,
        });
        hlsInstancesRef.current[nextSlot] = hls;
        hls.loadSource(targetSrc);
        hls.attachMedia(nextEl);
        hls.on(Hls.Events.MANIFEST_PARSED, () => {
          const resumeAt = pendingResumeSecRef.current;
          if (resumeAt !== null && resumeAt > 0.5) {
            pendingResumeSecRef.current = null;
            try {
              nextEl.currentTime = resumeAt;
            } catch {
              // ignore
            }
          }
          if (useMusicStore.getState().isPlaying) {
            void nextEl.play().catch(() => {});
          }
        });
        hls.on(Hls.Events.ERROR, (_ev, data) => {
          if (data.fatal) {
            hls.destroy();
            hlsInstancesRef.current[nextSlot] = null;
            const curState = useMusicStore.getState();
            if (curState.currentTrack?.id !== currentTrack.id) return;
            const currentUrl = resolvedPlayback.streamUrl || '';
            const remainingAlts = (resolvedPlayback.alternatives || []).filter(
              (alt) => alt.streamUrl && alt.streamUrl !== currentUrl && alt.sourceType !== 'preview'
            );
            const nextCand = remainingAlts[0];
            const ytFallbackId =
              resolvedPlayback.youtubeVideoId ||
              resolvedPlayback.youtubeMvId ||
              currentTrack.youtubeVideoId;
            if (nextCand) {
              curState.setResolvedPlayback(
                {
                  ...resolvedPlayback,
                  trackId: currentTrack.id,
                  sourceType: nextCand.sourceType,
                  sourceLabel: nextCand.sourceLabel,
                  streamUrl: nextCand.streamUrl,
                  proxiedUrl: nextCand.proxiedUrl,
                  bitrateKbps: nextCand.bitrateKbps,
                  fullLength: nextCand.fullLength,
                  provider: nextCand.provider,
                  alternatives: remainingAlts,
                },
                currentTrack.id
              );
            } else if (ytFallbackId) {
              curState.setResolvedPlayback(
                {
                  ...resolvedPlayback,
                  trackId: currentTrack.id,
                  sourceType: 'youtube',
                  sourceLabel: 'Audio Completo HD',
                  youtubeVideoId: ytFallbackId,
                  youtubeMvId: resolvedPlayback.youtubeMvId || ytFallbackId,
                  fullLength: true,
                  bitrateKbps: 256,
                  provider: 'Riffan Engine',
                },
                currentTrack.id
              );
            } else if (resolvedPlayback.previewUrl) {
              curState.setResolvedPlayback(
                {
                  trackId: currentTrack.id,
                  sourceType: 'preview',
                  sourceLabel: 'Preview HD (30s)',
                  streamUrl: resolvedPlayback.previewUrl,
                  proxiedUrl: `/api/music/stream-proxy?url=${encodeURIComponent(resolvedPlayback.previewUrl)}`,
                  previewUrl: resolvedPlayback.previewUrl,
                  bitrateKbps: 128,
                  provider: 'deezer',
                  fullLength: false,
                },
                currentTrack.id
              );
            } else {
              curState.setPlaybackError('Error al cargar el audio. Prueba otro servidor.');
            }
          }
        });
      } else if (nextEl.canPlayType('application/vnd.apple.mpegurl')) {
        nextEl.src = targetSrc;
        nextEl.load();
        if (useMusicStore.getState().isPlaying) void nextEl.play().catch(() => {});
      }
    } else {
      nextEl.src = targetSrc;
      nextEl.load();
      if (useMusicStore.getState().isPlaying) {
        void nextEl.play().catch(() => {});
      }
    }
  }, [
    currentTrack?.id,
    activeRadio?.id,
    resolvedPlayback?.sourceType,
    resolvedPlayback?.streamUrl,
    resolvedPlayback?.youtubeVideoId,
  ]);

  // Sync play/pause
  useEffect(() => {
    const el = getActiveAudioEl();
    if (activeBackendRef.current === 'html-audio' && el) {
      if (audioCtxRef.current && audioCtxRef.current.state !== 'running' && isPlaying) {
        void audioCtxRef.current.resume().catch(() => {});
      }
      if (isPlaying) void el.play().catch(() => {});
      else el.pause();
    } else if (activeBackendRef.current === 'youtube' && ytPlayerRef.current && ytReadyRef.current) {
      try {
        if (isPlaying) ytPlayerRef.current.playVideo();
        else ytPlayerRef.current.pauseVideo();
      } catch {
        // ignore
      }
    }
  }, [isPlaying]);

  // Sync volume, mute, playbackRate + pitchSemitones & preservesPitch on both decks & YT player
  useEffect(() => {
    const pitchRatio = Math.pow(2, (pitchSemitones || 0) / 12);
    const effectiveRate = Math.min(2.0, Math.max(0.5, playbackRate * pitchRatio));
    const effectivePreserve = Math.abs(pitchSemitones) >= 0.25 ? false : preservesPitch;

    [deckARef.current, deckBRef.current].forEach((el) => {
      if (!el) return;
      el.volume = isMuted ? 0 : volume;
      el.playbackRate = effectiveRate;
      const anyEl = el as unknown as {
        preservesPitch?: boolean;
        mozPreservesPitch?: boolean;
        webkitPreservesPitch?: boolean;
      };
      anyEl.preservesPitch = effectivePreserve;
      anyEl.mozPreservesPitch = effectivePreserve;
      anyEl.webkitPreservesPitch = effectivePreserve;
    });

    if (activeBackendRef.current === 'youtube' && ytPlayerRef.current && ytReadyRef.current) {
      try {
        if (isMuted) ytPlayerRef.current.mute();
        else ytPlayerRef.current.unMute();
        ytPlayerRef.current.setVolume(Math.round(volume * 100));
        ytPlayerRef.current.setPlaybackRate(closestYtRate(effectiveRate));
      } catch {
        // ignore
      }
    }
  }, [volume, isMuted, playbackRate, preservesPitch, pitchSemitones]);

  // Handle explicit seeks
  useEffect(() => {
    if (seekRequestSec === null) return;
    const el = getActiveAudioEl();
    if (activeBackendRef.current === 'html-audio' && el) {
      try {
        el.currentTime = seekRequestSec;
      } catch {
        // ignore
      }
    } else if (activeBackendRef.current === 'youtube' && ytPlayerRef.current && ytReadyRef.current) {
      try {
        ytPlayerRef.current.seekTo(seekRequestSec, true);
      } catch {
        // ignore
      }
    }
    useMusicStore.getState().setProgress(seekRequestSec);
    useMusicStore.getState().clearSeekRequest();
  }, [seekRequestSec]);

  // Lock-Screen / Background MediaSession controls with multi-size artwork
  useEffect(() => {
    if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return;
    try {
      if (activeRadio) {
        const fav = activeRadio.favicon;
        navigator.mediaSession.metadata = new MediaMetadata({
          title: activeRadio.name,
          artist: 'Radio en Directo · Riffan Music',
          album: activeRadio.tags.join(' · '),
          artwork: fav
            ? [
                { src: fav, sizes: '96x96' },
                { src: fav, sizes: '192x192' },
                { src: fav, sizes: '512x512' },
              ]
            : [],
        });
      } else if (currentTrack) {
        const artLg = currentTrack.album.coverXl || currentTrack.album.cover;
        const artSm = currentTrack.album.cover || artLg;
        navigator.mediaSession.metadata = new MediaMetadata({
          title: currentTrack.title,
          artist: currentTrack.artist.name,
          album: currentTrack.album.title || 'Riffan Music',
          artwork: artLg
            ? [
                { src: artSm, sizes: '128x128' },
                { src: artSm, sizes: '256x256' },
                { src: artLg, sizes: '512x512' },
              ]
            : [],
        });
      }
      navigator.mediaSession.setActionHandler('play', () => useMusicStore.getState().setIsPlaying(true));
      navigator.mediaSession.setActionHandler('pause', () => useMusicStore.getState().setIsPlaying(false));
      navigator.mediaSession.setActionHandler('nexttrack', () => useMusicStore.getState().playNext());
      navigator.mediaSession.setActionHandler('previoustrack', () => useMusicStore.getState().playPrev());
      navigator.mediaSession.setActionHandler('seekto', (details) => {
        if (typeof details.seekTime === 'number') {
          useMusicStore.getState().requestSeek(details.seekTime);
        }
      });
      navigator.mediaSession.setActionHandler('seekbackward', (details) => {
        const el = getActiveAudioEl();
        const cur = el?.currentTime || 0;
        useMusicStore.getState().requestSeek(Math.max(0, cur - (details.seekOffset || 10)));
      });
      navigator.mediaSession.setActionHandler('seekforward', (details) => {
        const el = getActiveAudioEl();
        const cur = el?.currentTime || 0;
        useMusicStore.getState().requestSeek(cur + (details.seekOffset || 10));
      });
      navigator.mediaSession.playbackState = isPlaying ? 'playing' : 'paused';
    } catch {
      // ignore
    }
  }, [currentTrack, activeRadio, isPlaying]);

  const handleLoadedMetadata = (slot: 'A' | 'B', e: React.SyntheticEvent<HTMLAudioElement>) => {
    if (slot !== activeDeckSlotRef.current) return;
    const el = e.currentTarget;
    const st = useMusicStore.getState();
    const pitchRatio = Math.pow(2, (st.pitchSemitones || 0) / 12);
    const effectiveRate = Math.min(2.0, Math.max(0.5, st.playbackRate * pitchRatio));
    const effectivePreserve = Math.abs(st.pitchSemitones) >= 0.25 ? false : st.preservesPitch;

    const anyEl = el as unknown as {
      preservesPitch?: boolean;
      mozPreservesPitch?: boolean;
      webkitPreservesPitch?: boolean;
    };
    anyEl.preservesPitch = effectivePreserve;
    anyEl.mozPreservesPitch = effectivePreserve;
    anyEl.webkitPreservesPitch = effectivePreserve;
    el.playbackRate = effectiveRate;

    const resumeAt = pendingResumeSecRef.current;
    if (resumeAt !== null && resumeAt > 0.5) {
      pendingResumeSecRef.current = null;
      try {
        if (Number.isFinite(el.duration) && resumeAt < el.duration - 2) {
          el.currentTime = resumeAt;
        }
      } catch {
        // ignore
      }
    }
  };

  const handleTimeUpdate = (slot: 'A' | 'B', e: React.SyntheticEvent<HTMLAudioElement>) => {
    if (slot !== activeDeckSlotRef.current || activeBackendRef.current !== 'html-audio' || activeRadio) {
      return;
    }
    const a = e.currentTarget;
    const st = useMusicStore.getState();
    const dur = Number.isFinite(a.duration) && a.duration > 0 ? a.duration : undefined;
    st.setProgress(a.currentTime, dur);

    // Enforce studio trimEnd if set
    if (st.trimEndSec > st.trimStartSec + 1 && a.currentTime >= st.trimEndSec) {
      playNextRef.current();
      return;
    }

    const nowMs = performance.now();
    // Listening analytics tick every 5 seconds
    if (st.currentTrack && st.isPlaying && nowMs - lastStatTickRef.current >= 5000) {
      lastStatTickRef.current = nowMs;
      st.recordListeningTick(st.currentTrack, 5);
    }

    if (
      nowMs - lastMediaPosSyncRef.current > 1000 &&
      dur &&
      typeof navigator !== 'undefined' &&
      'mediaSession' in navigator &&
      typeof navigator.mediaSession.setPositionState === 'function'
    ) {
      lastMediaPosSyncRef.current = nowMs;
      try {
        navigator.mediaSession.setPositionState({
          duration: dur,
          playbackRate: a.playbackRate || 1,
          position: Math.min(dur, Math.max(0, a.currentTime)),
        });
      } catch {
        // ignore
      }
    }
  };

  const handleEnded = (slot: 'A' | 'B') => {
    if (slot !== activeDeckSlotRef.current) return;
    if (activeBackendRef.current === 'html-audio' && !activeRadio) {
      useMusicStore.getState().advanceAfterTrackEnd();
    }
  };

  const handleError = (slot: 'A' | 'B') => {
    if (slot !== activeDeckSlotRef.current || activeBackendRef.current !== 'html-audio') return;
    const st = useMusicStore.getState();

    // Exponential backoff reconnect for Live Radio streams (1s -> 2s -> 4s -> 8s)
    if (st.activeRadio && st.isPlaying) {
      const attempt = st.radioReconnectAttempt;
      if (attempt < 4) {
        const delayMs = 1000 * Math.pow(2, attempt);
        st.setRadioReconnectAttempt(attempt + 1);
        if (radioRetryTimerRef.current) window.clearTimeout(radioRetryTimerRef.current);
        radioRetryTimerRef.current = window.setTimeout(() => {
          const cur = useMusicStore.getState();
          const el = getActiveAudioEl();
          if (cur.activeRadio && cur.isPlaying && el) {
            el.src = `/api/music/stream-proxy?url=${encodeURIComponent(cur.activeRadio.streamUrl)}&retry=${attempt + 1}`;
            el.load();
            void el.play().catch(() => {});
          }
        }, delayMs);
      }
      return;
    }

    const activeTrack = st.currentTrack;
    const activePlayback = st.resolvedPlayback;
    if (!activeTrack) return;

    const failedUrl = activePlayback?.streamUrl || '';
    const remainingAlts = (activePlayback?.alternatives || []).filter(
      (alt) => alt.streamUrl && alt.streamUrl !== failedUrl && alt.sourceType !== 'preview'
    );
    const nextCand = remainingAlts[0];
    const ytFallbackId =
      activePlayback?.youtubeVideoId ||
      activePlayback?.youtubeMvId ||
      activeTrack.youtubeVideoId;
    if (nextCand) {
      st.setResolvedPlayback(
        {
          ...(activePlayback || {}),
          trackId: activeTrack.id,
          sourceType: nextCand.sourceType,
          sourceLabel: nextCand.sourceLabel,
          streamUrl: nextCand.streamUrl,
          proxiedUrl: nextCand.proxiedUrl,
          youtubeVideoId: activePlayback?.youtubeVideoId || activeTrack.youtubeVideoId,
          youtubeMvId: activePlayback?.youtubeMvId || activeTrack.youtubeVideoId,
          previewUrl: activePlayback?.previewUrl || activeTrack.previewUrl,
          bitrateKbps: nextCand.bitrateKbps,
          fullLength: nextCand.fullLength,
          provider: nextCand.provider,
          alternatives: remainingAlts,
        },
        activeTrack.id
      );
      return;
    }

    if (ytFallbackId) {
      st.setResolvedPlayback(
        {
          ...(activePlayback || {}),
          trackId: activeTrack.id,
          sourceType: 'youtube',
          sourceLabel: 'Audio Completo HD',
          youtubeVideoId: ytFallbackId,
          youtubeMvId: activePlayback?.youtubeMvId || ytFallbackId,
          previewUrl: activePlayback?.previewUrl || activeTrack.previewUrl,
          bitrateKbps: 256,
          provider: 'Riffan Engine',
          fullLength: true,
        },
        activeTrack.id
      );
      return;
    }

    if (activeTrack.previewUrl && activePlayback?.sourceType !== 'preview') {
      const errTrackId = activeTrack.id;
      st.setResolvedPlayback(
        {
          trackId: errTrackId,
          sourceType: 'preview',
          sourceLabel: 'Preview HD (30s)',
          streamUrl: activeTrack.previewUrl,
          proxiedUrl: `/api/music/stream-proxy?url=${encodeURIComponent(activeTrack.previewUrl)}`,
          youtubeMvId: activePlayback?.youtubeMvId || activeTrack.youtubeVideoId,
          previewUrl: activeTrack.previewUrl,
          bitrateKbps: 128,
          provider: 'deezer',
          fullLength: false,
        },
        errTrackId
      );
      return;
    }

    st.setResolvingTrack(false);
    st.setPlaybackError('No se pudo reproducir el stream exacto de esta canción.');
  };

  return (
    <>
      <audio
        ref={deckARef}
        crossOrigin="anonymous"
        playsInline
        preload="auto"
        onLoadedMetadata={(e) => handleLoadedMetadata('A', e)}
        onTimeUpdate={(e) => handleTimeUpdate('A', e)}
        onEnded={() => handleEnded('A')}
        onError={() => handleError('A')}
        className="hidden"
      />
      <audio
        ref={deckBRef}
        crossOrigin="anonymous"
        playsInline
        preload="auto"
        onLoadedMetadata={(e) => handleLoadedMetadata('B', e)}
        onTimeUpdate={(e) => handleTimeUpdate('B', e)}
        onEnded={() => handleEnded('B')}
        onError={() => handleError('B')}
        className="hidden"
      />
      <div
        ref={ytContainerRef}
        aria-hidden="true"
        className="fixed bottom-0 right-0 w-48 h-28 opacity-[0.001] pointer-events-none overflow-hidden"
      />
    </>
  );
};
