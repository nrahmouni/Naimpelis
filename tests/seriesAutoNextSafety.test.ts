import { describe, expect, it } from 'vitest';
import {
  evaluateSeriesAutoNext,
  sanitizeSavedResumeSec,
  shouldAdvanceEpisodeOnEnded,
} from '../src/components/player/playerAutoNextGuard';

describe('Series playback auto-next cascade & resume safety', () => {
  it('never cascades to Episode 3 when transitioning from a longer Ep 1 to a shorter Ep 2 (Tulsa King scenario)', () => {
    // Frame 1 while Ep 2 is still extracting (empty URL or isExtracting=true)
    expect(
      evaluateSeriesAutoNext({
        hasSeriesMeta: true,
        hasNextEpisode: true,
        isLive: false,
        isExtracting: true,
        canControlRoom: true,
        videoMode: 'hls',
        videoUrl: '',
        autoNextCancelledForUrl: '',
        autoNextTriggeredForUrl: '/api/hls-proxy/stream.m3u8?ep=1',
        domReadyState: 4,
        domSeeking: false,
        domEnded: false,
        domCurrentTime: 2520,
        domDuration: 2100,
      })
    ).toEqual({ action: 'none' });

    // Frame 1 when Ep 2 URL arrives and media is initializing/seeking at start
    expect(
      evaluateSeriesAutoNext({
        hasSeriesMeta: true,
        hasNextEpisode: true,
        isLive: false,
        isExtracting: false,
        canControlRoom: true,
        videoMode: 'hls',
        videoUrl: '/api/hls-proxy/stream.m3u8?ep=2',
        autoNextCancelledForUrl: '',
        autoNextTriggeredForUrl: '/api/hls-proxy/stream.m3u8?ep=1',
        domReadyState: 2,
        domSeeking: false,
        domEnded: false,
        domCurrentTime: 0.4,
        domDuration: 2100,
      })
    ).toEqual({ action: 'none' });
  });

  it('triggers countdown in the final 10s and advances exactly once per episode URL', () => {
    const ep2Url = '/api/hls-proxy/stream.m3u8?ep=2';

    expect(
      evaluateSeriesAutoNext({
        hasSeriesMeta: true,
        hasNextEpisode: true,
        isLive: false,
        isExtracting: false,
        canControlRoom: true,
        videoMode: 'hls',
        videoUrl: ep2Url,
        autoNextCancelledForUrl: '',
        autoNextTriggeredForUrl: '',
        domReadyState: 4,
        domSeeking: false,
        domEnded: false,
        domCurrentTime: 2093.2,
        domDuration: 2100,
      })
    ).toEqual({ action: 'countdown', secondsLeft: 7 });

    expect(
      evaluateSeriesAutoNext({
        hasSeriesMeta: true,
        hasNextEpisode: true,
        isLive: false,
        isExtracting: false,
        canControlRoom: true,
        videoMode: 'hls',
        videoUrl: ep2Url,
        autoNextCancelledForUrl: '',
        autoNextTriggeredForUrl: '',
        domReadyState: 4,
        domSeeking: false,
        domEnded: false,
        domCurrentTime: 2099.7,
        domDuration: 2100,
      })
    ).toEqual({ action: 'trigger_next' });

    // Never triggers twice for the same URL
    expect(
      evaluateSeriesAutoNext({
        hasSeriesMeta: true,
        hasNextEpisode: true,
        isLive: false,
        isExtracting: false,
        canControlRoom: true,
        videoMode: 'hls',
        videoUrl: ep2Url,
        autoNextCancelledForUrl: '',
        autoNextTriggeredForUrl: ep2Url,
        domReadyState: 4,
        domSeeking: false,
        domEnded: true,
        domCurrentTime: 2100,
        domDuration: 2100,
      })
    ).toEqual({ action: 'none' });
  });

  it('blocks premature onEnded cascades on failed or truncated episode streams', () => {
    const ep2Url = '/api/hls-proxy/stream.m3u8?ep=2';

    // Spurious ended at 2 seconds into episode
    expect(
      shouldAdvanceEpisodeOnEnded({
        hasSeriesMeta: true,
        hasNextEpisode: true,
        isLive: false,
        isExtracting: false,
        canControlRoom: true,
        videoMode: 'hls',
        videoUrl: ep2Url,
        autoNextCancelledForUrl: '',
        autoNextTriggeredForUrl: '',
        domCurrentTime: 2,
        domDuration: 2100,
      })
    ).toBe(false);

    // Mid-stream truncation (ended at minute 12 of a 35-minute episode)
    expect(
      shouldAdvanceEpisodeOnEnded({
        hasSeriesMeta: true,
        hasNextEpisode: true,
        isLive: false,
        isExtracting: false,
        canControlRoom: true,
        videoMode: 'hls',
        videoUrl: ep2Url,
        autoNextCancelledForUrl: '',
        autoNextTriggeredForUrl: '',
        domCurrentTime: 720,
        domDuration: 2100,
      })
    ).toBe(false);

    // Genuine end of episode
    expect(
      shouldAdvanceEpisodeOnEnded({
        hasSeriesMeta: true,
        hasNextEpisode: true,
        isLive: false,
        isExtracting: false,
        canControlRoom: true,
        videoMode: 'hls',
        videoUrl: ep2Url,
        autoNextCancelledForUrl: '',
        autoNextTriggeredForUrl: '',
        domCurrentTime: 2097,
        domDuration: 2100,
      })
    ).toBe(true);
  });

  it('restarts near-completed episodes at 0:00 instead of resuming inside the auto-next window', () => {
    expect(sanitizeSavedResumeSec(2512, 2520)).toBe(0);
    expect(sanitizeSavedResumeSec(2495, 2520)).toBe(0);
    expect(sanitizeSavedResumeSec(642.8, 2520)).toBe(642);
    expect(sanitizeSavedResumeSec(3, 2520)).toBe(0);
  });
});
