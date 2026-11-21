export interface OpticalForegroundSample {
  x: number;
  y: number;
  r: number;
  g: number;
  b: number;
  w: number;
  motion: number;
}

export function hexToRgb(hex?: string | null): [number, number, number] | null {
  const clean = String(hex || '').trim().replace(/^#/, '');
  if (!/^[0-9a-fA-F]{6}$/.test(clean)) return null;
  return [
    parseInt(clean.slice(0, 2), 16),
    parseInt(clean.slice(2, 4), 16),
    parseInt(clean.slice(4, 6), 16),
  ];
}

export function colorDist(a: [number, number, number], b: [number, number, number]): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

/**
 * Parses football clock labels like "59:59", "61:04", "67'", "45+2'" into total seconds.
 */
export function parseClockToSeconds(label?: string | null): number | null {
  const raw = String(label || '').trim();
  if (!raw) return null;
  const mmss = /(\d{1,3}):(\d{2})/.exec(raw);
  if (mmss) {
    const mins = parseInt(mmss[1], 10);
    const secs = parseInt(mmss[2], 10);
    if (Number.isFinite(mins) && Number.isFinite(secs) && secs < 60 && mins <= 140) {
      return mins * 60 + secs;
    }
  }
  const stoppage = /(\d{1,3})\s*\+\s*(\d{1,2})/.exec(raw);
  if (stoppage) {
    const base = parseInt(stoppage[1], 10);
    const added = parseInt(stoppage[2], 10);
    if (Number.isFinite(base) && Number.isFinite(added) && base <= 130) {
      return (base + added) * 60;
    }
  }
  const singleMin = /(\d{1,3})\s*'/.exec(raw);
  if (singleMin) {
    const mins = parseInt(singleMin[1], 10);
    if (Number.isFinite(mins) && mins <= 140) {
      return mins * 60;
    }
  }
  return null;
}

export function formatSecondsAsClock(totalSec: number): string {
  const safe = Math.max(0, Math.round(totalSec));
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

/**
 * Detects whether match is currently in the 2nd half (or extra time 1st/2nd switches)
 * where TV broadcast cameras typically reverse team attacking directions vs 1st half.
 * Explicitly excludes 1st-half stoppage ("45+...") and halftime ("HT"/"Descanso").
 */
export function isSecondHalfPeriod(statusLabel?: string | null, tvClock?: string | null): boolean {
  const combined = `${String(tvClock || '').trim()} ${String(statusLabel || '').trim()}`.trim();
  if (!combined) return false;
  if (/(?:^|\s)(?:ht|descanso|half[- ]?time|1h|1t|1ª|1st|primera parte|first half)(?:\s|$)/i.test(combined)) {
    return false;
  }
  if (/\b45\s*\+\s*\d+/.test(combined)) return false;

  const preferClock = String(tvClock || '').trim() || String(statusLabel || '').trim();
  const mmss = /(\d{1,3}):(\d{2})/.exec(preferClock);
  if (mmss) {
    const m = parseInt(mmss[1], 10);
    const s = parseInt(mmss[2], 10);
    // In 2nd half once clock is >= 45:01 and below 95+, note extra-time 2nd half > 105:00
    if (m > 45 || (m === 45 && s > 0)) {
      return true;
    }
    return false;
  }

  if (/(?:^|\s)(?:2h|2t|2ª|2nd|segunda parte|second half)(?:\s|$)/i.test(combined)) return true;

  const minMatch = /(\d{1,3})\s*'/.exec(preferClock);
  if (minMatch) {
    const m = parseInt(minMatch[1], 10);
    return m >= 46;
  }
  return false;
}

/**
 * Quadratic motion salience so fast ball carriers & active passes dominate
 * over stationary background players scattered across the pitch.
 */
export function computeHotspotSalience(avgMotion: number, fgRatio: number): number {
  if (avgMotion >= 3.2) {
    return avgMotion * avgMotion * 0.42 + avgMotion * 2.1 + fgRatio * 5;
  }
  return avgMotion * 0.6 + fgRatio * 0.7;
}

export function mapTvXToPitchX(tvX: number, mirrorHorizontal: boolean): number {
  const projected = mirrorHorizontal ? 1000 - tvX : tvX;
  return Math.max(44, Math.min(956, Math.round(projected)));
}

/**
 * Evaluates weighted RGB around the highest-motion hotspot cells and compares
 * against home vs away kit RGBs to identify which team actually holds the ball.
 */
export function detectHotspotCarrierTeam(
  samples: OpticalForegroundSample[],
  homeRgb: [number, number, number] | null,
  awayRgb: [number, number, number] | null
): 'home' | 'away' | 'neutral' {
  if (!homeRgb || !awayRgb || samples.length < 3) return 'neutral';
  // If kits are visually indistinguishable, do not guess
  if (colorDist(homeRgb, awayRgb) < 34) return 'neutral';

  const top = [...samples]
    .sort((a, b) => b.motion * 2 + b.w - (a.motion * 2 + a.w))
    .slice(0, Math.min(8, samples.length));

  let weightSum = 0;
  let rSum = 0;
  let gSum = 0;
  let bSum = 0;
  for (const s of top) {
    const weight = Math.max(1, s.w + s.motion * 4);
    weightSum += weight;
    rSum += s.r * weight;
    gSum += s.g * weight;
    bSum += s.b * weight;
  }
  if (weightSum <= 0) return 'neutral';

  const hotspotRgb: [number, number, number] = [
    rSum / weightSum,
    gSum / weightSum,
    bSum / weightSum,
  ];
  const dHome = colorDist(hotspotRgb, homeRgb);
  const dAway = colorDist(hotspotRgb, awayRgb);

  if (dHome + 16 < dAway && dHome < 145) return 'home';
  if (dAway + 16 < dHome && dAway < 145) return 'away';
  return 'neutral';
}
