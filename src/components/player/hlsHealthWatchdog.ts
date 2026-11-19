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
    score += 30;
  }
  if (/\.m3u8(\?|$)/.test(url)) score += 28;
  if (track.lang === 'ES') score += 20;
  if (/streamxhd|rojadirectv/.test(url)) score -= 25;

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
