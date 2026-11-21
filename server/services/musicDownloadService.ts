import { spawn } from 'node:child_process';
import fs from 'node:fs';
import ffmpegInstaller from '@ffmpeg-installer/ffmpeg';
import type { Request, Response } from 'express';
import { resolveTrackPlayback } from './riffanMusicService.ts';
import { logger } from '../utils/logger.ts';

export type DownloadStemType = 'both' | 'vocals' | 'instrumental';

export interface Mp3DownloadFxOptions {
  applyFx: boolean;
  speed: number;
  preservePitch: boolean;
  reverbMix: number;
  echoMix: number;
  echoTimeMs: number;
  lowpassHz: number;
  highpassHz: number;
  bassBoostDb: number;
  trebleBoostDb: number;
  saturation: number;
  eqBands: number[];
}

const EQ_BANDS_HZ = [32, 64, 125, 250, 500, 1000, 2000, 4000, 8000, 16000] as const;

function getFfmpegBinary(): string {
  if (fs.existsSync('/usr/bin/ffmpeg')) return '/usr/bin/ffmpeg';
  if (ffmpegInstaller?.path && fs.existsSync(ffmpegInstaller.path)) return ffmpegInstaller.path;
  return 'ffmpeg';
}

function clamp(n: unknown, min: number, max: number, fallback: number): number {
  const v = Number(n);
  if (!Number.isFinite(v)) return fallback;
  return Math.min(max, Math.max(min, v));
}

export function sanitizeDownloadFilename(raw: string): string {
  return String(raw || 'riffan-music')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 90);
}

export function buildDownloadFilename(
  artist: string,
  title: string,
  stem: DownloadStemType,
  fxLabel?: string
): string {
  const base = sanitizeDownloadFilename([artist, title].filter(Boolean).join(' - ')) || 'Riffan Music';
  const stemSuffix =
    stem === 'vocals' ? ' (Solo Voz)' : stem === 'instrumental' ? ' (Solo Base)' : '';
  const fxSuffix = fxLabel ? ` [${sanitizeDownloadFilename(fxLabel)}]` : '';
  return `${base}${stemSuffix}${fxSuffix}.mp3`;
}

function buildFilterComplexGraph(stem: DownloadStemType, fx: Mp3DownloadFxOptions): string {
  const preFilters: string[] = ['aresample=44100', 'aformat=channel_layouts=stereo'];

  if (fx.applyFx) {
    // 10-band EQ
    fx.eqBands.slice(0, 10).forEach((db, idx) => {
      const g = clamp(db, -12, 12, 0);
      if (Math.abs(g) >= 0.25) {
        const hz = EQ_BANDS_HZ[idx];
        preFilters.push(`equalizer=f=${hz}:width_type=q:w=1.35:g=${g.toFixed(2)}`);
      }
    });

    if (fx.highpassHz > 25) {
      preFilters.push(`highpass=f=${Math.round(clamp(fx.highpassHz, 20, 600, 20))}`);
    }
    if (Math.abs(fx.bassBoostDb) >= 0.25) {
      preFilters.push(`bass=g=${clamp(fx.bassBoostDb, -8, 10, 0).toFixed(2)}:f=90`);
    }
    if (Math.abs(fx.trebleBoostDb) >= 0.25) {
      preFilters.push(`treble=g=${clamp(fx.trebleBoostDb, -8, 10, 0).toFixed(2)}:f=9500`);
    }
    if (fx.lowpassHz < 19500) {
      preFilters.push(`lowpass=f=${Math.round(clamp(fx.lowpassHz, 350, 20000, 20000))}`);
    }
    if (fx.saturation > 0.05) {
      // Gentle analog warmth compression + slight makeup drive
      const driveGain = 1 + Math.min(0.28, fx.saturation * 0.28);
      preFilters.push(
        `acompressor=threshold=-14dB:ratio=2.8:attack=5:release=90:makeup=${driveGain.toFixed(2)}`
      );
    }

    // Speed & Pitch Shift
    if (Math.abs(fx.speed - 1) > 0.008) {
      const rate = clamp(fx.speed, 0.65, 1.45, 1);
      if (fx.preservePitch) {
        preFilters.push(`atempo=${rate.toFixed(3)}`);
      } else {
        const scaledSr = Math.max(22050, Math.min(72000, Math.round(44100 * rate)));
        preFilters.push(`asetrate=${scaledSr}`, 'aresample=44100');
      }
    }

    // Multi-tap Reverb & Echo
    const delays: number[] = [];
    const decays: number[] = [];
    if (fx.echoMix > 0.03) {
      const d1 = Math.round(clamp(fx.echoTimeMs, 90, 480, 220));
      delays.push(d1, Math.min(760, Math.round(d1 * 1.9)));
      decays.push(
        Number((fx.echoMix * 0.62).toFixed(2)),
        Number((fx.echoMix * 0.34).toFixed(2))
      );
    }
    if (fx.reverbMix > 0.03) {
      const r = clamp(fx.reverbMix, 0, 0.85, 0);
      delays.push(37, 79, 137);
      decays.push(
        Number((r * 0.56).toFixed(2)),
        Number((r * 0.42).toFixed(2)),
        Number((r * 0.28).toFixed(2))
      );
    }
    if (delays.length > 0) {
      preFilters.push(`aecho=0.84:0.86:${delays.join('|')}:${decays.join('|')}`);
    }
  }

  const preChain = preFilters.join(',');

  if (stem === 'vocals') {
    return `[0:a]${preChain},pan=stereo|c0=0.5*c0+0.5*c1|c1=0.5*c0+0.5*c1,highpass=f=210,equalizer=f=2300:width_type=q:w=0.95:g=5.5,lowpass=f=7600,volume=1.35,alimiter=limit=0.95[out]`;
  }

  if (stem === 'instrumental') {
    return `[0:a]${preChain},asplit[lo_in][hi_in];[lo_in]lowpass=f=175,pan=stereo|c0=0.44*c0+0.44*c1|c1=0.44*c0+0.44*c1[lo];[hi_in]highpass=f=175,pan=stereo|c0=0.98*c0-0.98*c1|c1=0.98*c1-0.98*c0[hi];[lo][hi]amix=inputs=2:normalize=0:duration=first,volume=1.12,alimiter=limit=0.95[out]`;
  }

  return `[0:a]${preChain},alimiter=limit=0.95[out]`;
}

export async function handleMp3DownloadRequest(req: Request, res: Response): Promise<void> {
  const title = String(req.query.title || '').trim();
  const artist = String(req.query.artist || '').trim();
  const album = String(req.query.album || '').trim() || 'Riffan Music';
  const rawStem = String(req.query.stem || 'both').trim();
  const stem: DownloadStemType =
    rawStem === 'vocals' || rawStem === 'instrumental' ? rawStem : 'both';

  if (!title || !artist) {
    res.status(400).json({ success: false, error: 'Falta título o artista' });
    return;
  }

  const eqBandsRaw = String(req.query.eqBands || '')
    .split(',')
    .map((x) => clamp(x, -12, 12, 0));

  const fxOptions: Mp3DownloadFxOptions = {
    applyFx: req.query.applyFx === '1' || req.query.applyFx === 'true',
    speed: clamp(req.query.speed, 0.65, 1.45, 1),
    preservePitch: req.query.preservePitch !== '0' && req.query.preservePitch !== 'false',
    reverbMix: clamp(req.query.reverbMix, 0, 0.85, 0),
    echoMix: clamp(req.query.echoMix, 0, 0.6, 0),
    echoTimeMs: clamp(req.query.echoTimeMs, 90, 480, 220),
    lowpassHz: clamp(req.query.lowpassHz, 350, 20000, 20000),
    highpassHz: clamp(req.query.highpassHz, 20, 600, 20),
    bassBoostDb: clamp(req.query.bassBoostDb, -8, 10, 0),
    trebleBoostDb: clamp(req.query.trebleBoostDb, -8, 10, 0),
    saturation: clamp(req.query.saturation, 0, 1, 0),
    eqBands: eqBandsRaw.length === 10 ? eqBandsRaw : Array(10).fill(0),
  };

  try {
    const resolved = await resolveTrackPlayback({
      title,
      artist,
      durationSec: Number(req.query.duration || 0) || undefined,
      previewUrl: String(req.query.preview || '').trim() || undefined,
      soundcloudId: String(req.query.scId || '').trim() || undefined,
      audiusId: String(req.query.audiusId || '').trim() || undefined,
      youtubeVideoId: String(req.query.ytId || '').trim() || undefined,
      preferAudio: true,
    });

    const inputUrl =
      resolved.streamUrl ||
      (resolved.previewUrl ? resolved.previewUrl : '');

    if (!inputUrl) {
      res.status(422).json({
        success: false,
        error: 'Esta pista no dispone de audio descargable directo en este momento.',
      });
      return;
    }

    const fxLabel = fxOptions.applyFx ? String(req.query.fxLabel || '').trim() : undefined;
    const filename = buildDownloadFilename(artist, title, stem, fxLabel);
    const filterGraph = buildFilterComplexGraph(stem, fxOptions);

    const isGoogleVideo = inputUrl.toLowerCase().includes('googlevideo.com');
    const ua = isGoogleVideo
      ? 'com.google.android.apps.youtube.vr.oculus/1.60.19 (Linux; U; Android 12L; eureka-user Build/SQ3A.220605.009.A1) gzip'
      : 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0.0.0 Safari/537.36';

    const ffmpegArgs = [
      '-hide_banner',
      '-loglevel',
      'error',
      '-user_agent',
      ua,
      '-i',
      inputUrl,
      '-vn',
      '-filter_complex',
      filterGraph,
      '-map',
      '[out]',
      '-c:a',
      'libmp3lame',
      '-b:a',
      '192k',
      '-ar',
      '44100',
      '-id3v2_version',
      '3',
      '-metadata',
      `title=${title}${stem === 'vocals' ? ' (Solo Voz)' : stem === 'instrumental' ? ' (Solo Base)' : ''}`,
      '-metadata',
      `artist=${artist}`,
      '-metadata',
      `album=${album}`,
      '-f',
      'mp3',
      'pipe:1',
    ];

    const ffmpegBin = getFfmpegBinary();
    const proc = spawn(ffmpegBin, ffmpegArgs, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let headersSent = false;
    let closedByClient = false;
    let stderrTail = '';

    req.on('close', () => {
      if (!res.writableEnded) {
        closedByClient = true;
        proc.kill('SIGKILL');
      }
    });

    proc.stderr?.on('data', (chunk: Buffer) => {
      stderrTail = (stderrTail + chunk.toString('utf8')).slice(-800);
    });

    const killTimer = setTimeout(() => {
      if (!proc.killed) proc.kill('SIGKILL');
    }, 180_000);

    proc.stdout?.on('data', (chunk: Buffer) => {
      if (closedByClient) return;
      if (!headersSent) {
        headersSent = true;
        const encodedName = encodeURIComponent(filename);
        const asciiFallback = filename.replace(/[^\x20-\x7e]/g, '_');
        res.status(200);
        res.setHeader('Content-Type', 'audio/mpeg');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="${asciiFallback}"; filename*=UTF-8''${encodedName}`
        );
        res.setHeader('Cache-Control', 'no-store');
        res.setHeader('Access-Control-Expose-Headers', 'Content-Disposition');
      }
      if (!res.write(chunk)) {
        proc.stdout?.pause();
        res.once('drain', () => proc.stdout?.resume());
      }
    });

    proc.on('error', (err) => {
      clearTimeout(killTimer);
      logger.error({ err: err.message, title }, 'riffan_music_mp3_spawn_failed');
      if (!headersSent && !res.headersSent) {
        res.status(500).json({ success: false, error: 'Error al iniciar codificador MP3' });
      } else if (!res.writableEnded) {
        res.end();
      }
    });

    proc.on('close', (code) => {
      clearTimeout(killTimer);
      if (closedByClient) return;
      if (!headersSent && !res.headersSent) {
        logger.warn({ code, stderrTail, title, stem }, 'riffan_music_mp3_failed');
        res.status(502).json({
          success: false,
          error: 'No se pudo exportar este audio a MP3 en este momento.',
        });
      } else if (!res.writableEnded) {
        res.end();
      }
    });
  } catch (err) {
    logger.error(
      { err: err instanceof Error ? err.message : String(err), title, stem },
      'riffan_music_mp3_error'
    );
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Error preparando descarga MP3' });
    }
  }
}
