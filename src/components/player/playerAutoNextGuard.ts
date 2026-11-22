export interface AutoNextEvaluationInput {
  hasSeriesMeta: boolean;
  hasNextEpisode: boolean;
  isLive: boolean;
  isExtracting: boolean;
  canControlRoom: boolean;
  videoMode: string;
  videoUrl: string;
  autoNextCancelledForUrl: string;
  autoNextTriggeredForUrl: string;
  domReadyState: number;
  domSeeking: boolean;
  domEnded: boolean;
  domCurrentTime: number;
  domDuration: number;
}

export type AutoNextDecision =
  | { action: 'none' }
  | { action: 'countdown'; secondsLeft: number }
  | { action: 'trigger_next' };

export function evaluateSeriesAutoNext(input: AutoNextEvaluationInput): AutoNextDecision {
  if (
    !input.hasSeriesMeta ||
    !input.hasNextEpisode ||
    input.isLive ||
    input.isExtracting ||
    !input.canControlRoom ||
    (input.videoMode !== 'hls' && input.videoMode !== 'direct') ||
    !input.videoUrl ||
    input.autoNextCancelledForUrl === input.videoUrl ||
    input.autoNextTriggeredForUrl === input.videoUrl
  ) {
    return { action: 'none' };
  }

  // Read strictly from live DOM media state so stale React timelines from the previous episode
  // or shorter episodes loading after longer ones can never trigger an immediate auto-skip cascade.
  if (
    input.domReadyState < 2 ||
    input.domSeeking ||
    !Number.isFinite(input.domDuration) ||
    input.domDuration < 90 ||
    !Number.isFinite(input.domCurrentTime) ||
    input.domCurrentTime < 15
  ) {
    return { action: 'none' };
  }

  const remaining = input.domDuration - input.domCurrentTime;
  if (remaining <= 0.4 || input.domEnded) {
    return { action: 'trigger_next' };
  }
  if (remaining <= 10) {
    return { action: 'countdown', secondsLeft: Math.max(1, Math.ceil(remaining)) };
  }
  return { action: 'none' };
}

export function shouldAdvanceEpisodeOnEnded(opts: {
  hasSeriesMeta: boolean;
  hasNextEpisode: boolean;
  isLive: boolean;
  isExtracting: boolean;
  canControlRoom: boolean;
  videoMode: string;
  videoUrl: string;
  autoNextCancelledForUrl: string;
  autoNextTriggeredForUrl: string;
  domCurrentTime: number;
  domDuration: number;
}): boolean {
  if (
    !opts.hasSeriesMeta ||
    !opts.hasNextEpisode ||
    opts.isLive ||
    opts.isExtracting ||
    !opts.canControlRoom ||
    (opts.videoMode !== 'hls' && opts.videoMode !== 'direct') ||
    !opts.videoUrl ||
    opts.autoNextCancelledForUrl === opts.videoUrl ||
    opts.autoNextTriggeredForUrl === opts.videoUrl
  ) {
    return false;
  }

  // Prevent spurious `ended` events on truncated/failed streams from skipping through all episodes.
  if (
    !Number.isFinite(opts.domDuration) ||
    opts.domDuration < 30 ||
    !Number.isFinite(opts.domCurrentTime) ||
    opts.domCurrentTime < 15
  ) {
    return false;
  }

  return opts.domCurrentTime >= opts.domDuration - 8;
}

export function sanitizeSavedResumeSec(
  resumeTimeSec?: number,
  durationSec?: number
): number {
  if (!resumeTimeSec || !Number.isFinite(resumeTimeSec) || resumeTimeSec <= 5) {
    return 0;
  }
  if (
    durationSec &&
    Number.isFinite(durationSec) &&
    durationSec > 120 &&
    resumeTimeSec >= durationSec - 25
  ) {
    return 0;
  }
  return Math.floor(resumeTimeSec);
}
