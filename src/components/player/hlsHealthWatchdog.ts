import type { StreamTrack } from '../../types';

export function isAndroidChromeBrowser(uaRaw?: string): boolean {
  const ua =
    uaRaw ??
    (typeof navigator !== 'undefined' ? String(navigator.userAgent || '') : '');
  return /Android/i.test(ua) && /Chrome|CriOS|EdgA|SamsungBrowser/i.test(ua);
}

export interface FrameHealthCheckResult {
  corrupt: boolean;
  reason?: 'green_frame' | 'flat_grey';
}

/**
 * Samples a live HTMLVideoElement frame (16x9 downscaled canvas) to detect
 * solid H.264 decoder green screens (#005200) or uniform grey corrupt frames.
 * Fails open ({ corrupt: false }) if canvas pixel access is blocked by CORS.
 */
export function isRenderedFrameGreenOrCorrupt(
  video: HTMLVideoElement
): FrameHealthCheckResult {
  if (
    !video ||
    video.readyState < 2 ||
    video.videoWidth < 16 ||
    video.videoHeight < 16
  ) {
    return { corrupt: false };
  }

  try {
    const canvas = document.createElement('canvas');
    canvas.width = 16;
    canvas.height = 9;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { corrupt: false };

    ctx.drawImage(video, 0, 0, 16, 9);
    const { data } = ctx.getImageData(0, 0, 16, 9);
    const totalPixels = data.length / 4;
    if (totalPixels === 0) return { corrupt: false };

    const quantizedColors = new Set<string>();
    let greenPixels = 0;
    let uniformGreyPixels = 0;

    for (let i = 0; i < data.length; i += 4) {
      const r = data[i];
      const g = data[i + 1];
      const b = data[i + 2];
      quantizedColors.add(`${r >> 4}-${g >> 4}-${b >> 4}`);

      // Classic FFmpeg/H.264 #005200 (0,82,0) & YUV-zero green screen
      if (g >= 55 && r <= 28 && b <= 28 && g >= Math.max(r, b) * 2) {
        greenPixels += 1;
      }

      if (Math.abs(r - g) <= 6 && Math.abs(g - b) <= 6 && r >= 96 && r <= 160) {
        uniformGreyPixels += 1;
      }
    }

    if (greenPixels / totalPixels >= 0.45) {
      return { corrupt: true, reason: 'green_frame' };
    }
    if (quantizedColors.size <= 3 && uniformGreyPixels / totalPixels >= 0.7) {
      return { corrupt: true, reason: 'flat_grey' };
    }
    return { corrupt: false };
  } catch {
    return { corrupt: false };
  }
}

export function scoreBackupSatelliteTrack(track: StreamTrack): number {
  const url = String(track.sourceUrl || '').toLowerCase();
  const label = String(track.label || '').toLowerCase();
  let score = 0;

  if (/\bdazn\b/.test(label)) score += 60;
  if (/1080p/.test(String(track.quality || '')) || /1080p/.test(label)) score += 35;
  if (/sat[eé]lite|\bsat\b|pig\.footunder\.online\/stream\//.test(`${label} ${url}`)) {
    score += 15;
  }
  if (/\.m3u8(\?|$)/.test(url)) score += 28;
  if (/streamxhd\./.test(url)) score += 15;
  if (track.lang === 'ES') score += 20;
  if (/rojadirectv/.test(url)) score -= 25;

  return score;
}

export function pickBestCleanSatelliteTrackIndex(
  tracks: StreamTrack[],
  currentIndex: number,
  failedUrls: Set<string>
): number {
  const candidates = tracks
    .map((track, idx) => ({ track, idx, score: scoreBackupSatelliteTrack(track) }))
    .filter(({ track, idx }) => {
      if (idx === currentIndex) return false;
      if (!track.sourceUrl) return false;
      if (failedUrls.has(track.sourceUrl)) return false;
      if (track.resolverType === 'cloud_browser') return false;
      return true;
    })
    .sort((a, b) => b.score - a.score || a.idx - b.idx);

  return candidates.length > 0 ? candidates[0].idx : -1;
}

export type LiveHealthAction =
  | 'healthy'
  | 'recover_signal'
  | 'recover_media'
  | 'soft_reconnect'
  | 'switch_backup';

export interface LiveHealthEvaluation {
  action: LiveHealthAction;
  reason?: string;
  isStalled?: boolean;
  stallDurationMs?: number;
}

export function createLivePlaybackHealthMonitor() {
  let prevTotalFrames = 0;
  let prevDroppedFrames = 0;
  let consecutiveDropSpikes = 0;
  let consecutiveCorruptFrames = 0;
  let lastRecoveryAt = 0;

  let lastObservedTime = -1;
  let stalledSinceMs = 0;
  let lastStallActionTier = 0;
  let pendingZeroStartMs = 0;
  let zeroStartActionTier = 0;

  return {
    reset() {
      prevTotalFrames = 0;
      prevDroppedFrames = 0;
      consecutiveDropSpikes = 0;
      consecutiveCorruptFrames = 0;
      lastRecoveryAt = 0;
      lastObservedTime = -1;
      stalledSinceMs = 0;
      lastStallActionTier = 0;
      pendingZeroStartMs = 0;
      zeroStartActionTier = 0;
    },
    check(video: HTMLVideoElement, nowMs = Date.now(), intendedPlaying = true): LiveHealthEvaluation {
      if (!video || (video.paused && !intendedPlaying)) {
        stalledSinceMs = 0;
        lastStallActionTier = 0;
        pendingZeroStartMs = 0;
        zeroStartActionTier = 0;
        return { action: 'healthy', isStalled: false, stallDurationMs: 0 };
      }

      const curTime = Number(video.currentTime || 0);
      if (lastObservedTime < 0 || Math.abs(curTime - lastObservedTime) >= 0.04) {
        if (video.videoWidth > 0 || curTime > 0.5) {
          lastObservedTime = curTime;
          stalledSinceMs = nowMs;
          lastStallActionTier = 0;
          pendingZeroStartMs = 0;
          zeroStartActionTier = 0;
        } else if (lastObservedTime < 0) {
          if (pendingZeroStartMs === 0) {
            pendingZeroStartMs = nowMs;
          } else {
            const zeroElapsedMs = Math.max(0, nowMs - pendingZeroStartMs);
            if (zeroElapsedMs >= 8_000 && zeroStartActionTier < 2) {
              zeroStartActionTier = 2;
              return {
                action: 'switch_backup',
                reason: 'live_stream_startup_timeout',
                isStalled: true,
                stallDurationMs: zeroElapsedMs,
              };
            }
            if (zeroElapsedMs >= 4_000 && zeroStartActionTier < 1) {
              zeroStartActionTier = 1;
              return {
                action: 'recover_signal',
                reason: 'live_stream_startup_nudge',
                isStalled: true,
                stallDurationMs: zeroElapsedMs,
              };
            }
          }
        }
      }
      if (lastObservedTime >= 0 && (Math.abs(curTime - lastObservedTime) < 0.04 || video.videoWidth === 0)) {
        if (stalledSinceMs === 0) {
          stalledSinceMs = nowMs;
        }
        const stallDurationMs = Math.max(0, nowMs - stalledSinceMs);
        if (stallDurationMs >= 8_500 && lastStallActionTier < 3) {
          lastStallActionTier = 3;
          return {
            action: 'switch_backup',
            reason: 'live_stream_stalled_timeout',
            isStalled: true,
            stallDurationMs,
          };
        }
        if (stallDurationMs >= 5_000 && lastStallActionTier < 2) {
          lastStallActionTier = 2;
          return {
            action: 'soft_reconnect',
            reason: 'live_stream_frozen_reconnect',
            isStalled: true,
            stallDurationMs,
          };
        }
        if (stallDurationMs >= 2_200 && lastStallActionTier < 1) {
          lastStallActionTier = 1;
          return {
            action: 'recover_signal',
            reason: 'live_stream_frozen_nudge',
            isStalled: true,
            stallDurationMs,
          };
        }
        if (stallDurationMs >= 1200) {
          return {
            action: 'healthy',
            isStalled: true,
            stallDurationMs,
          };
        }
      }

      if (video.readyState < 2) {
        return { action: 'healthy', isStalled: false, stallDurationMs: 0 };
      }

      const frameCheck = isRenderedFrameGreenOrCorrupt(video);
      if (frameCheck.corrupt) {
        consecutiveCorruptFrames += 1;
      } else {
        consecutiveCorruptFrames = 0;
      }

      const quality =
        typeof video.getVideoPlaybackQuality === 'function'
          ? video.getVideoPlaybackQuality()
          : null;
      if (quality) {
        const total = Number(quality.totalVideoFrames || 0);
        const dropped = Number(quality.droppedVideoFrames || 0);
        if (total < prevTotalFrames || dropped < prevDroppedFrames) {
          prevTotalFrames = total;
          prevDroppedFrames = dropped;
          consecutiveDropSpikes = 0;
        } else {
          const deltaTotal = total - prevTotalFrames;
          const deltaDropped = dropped - prevDroppedFrames;
          prevTotalFrames = total;
          prevDroppedFrames = dropped;

          if (deltaTotal >= 18 && deltaDropped / deltaTotal >= 0.45) {
            consecutiveDropSpikes += 1;
          } else {
            consecutiveDropSpikes = 0;
          }
        }
      }

      const reason =
        consecutiveCorruptFrames >= 2
          ? frameCheck.reason || 'corrupt_frame'
          : consecutiveDropSpikes >= 2
            ? 'dropped_frame_burst'
            : '';

      if (!reason) {
        return { action: 'healthy', isStalled: false, stallDurationMs: 0 };
      }

      consecutiveCorruptFrames = 0;
      consecutiveDropSpikes = 0;

      if (lastRecoveryAt === 0 || nowMs - lastRecoveryAt > 20_000) {
        lastRecoveryAt = nowMs;
        return { action: 'recover_media', reason, isStalled: true };
      }
      return { action: 'switch_backup', reason, isStalled: true };
    },
  };
}
