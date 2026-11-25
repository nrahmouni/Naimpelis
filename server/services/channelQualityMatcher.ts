/**
 * @module server/services/channelQualityMatcher
 * @description Server-side unified channel matcher combining canonical Spanish TDT,
 * Sports, BELIX, and multi-server Xtream signals, prioritizing healthiest/highest-quality/fastest streams first.
 */
import { channelHealthMonitor } from './channelHealthMonitor.ts';
import type { HealthProbeChannel } from './channelHealthProbe.ts';
import {
  getTvBrowsePriorityRank,
  mergeAndDeduplicateChannels,
  type GenericRankableChannel,
} from '../../src/utils/channelQualityRanker.ts';

export function buildUnifiedPrioritizedChannels<T extends GenericRankableChannel>(
  rawChannels: T[],
  opts?: { preferQualityFirst?: boolean }
): T[] {
  const preferQualityFirst = Boolean(opts?.preferQualityFirst);
  const merged = mergeAndDeduplicateChannels(rawChannels, { preferQualityFirst });
  const healthRanked = channelHealthMonitor.prioritizeChannels(
    merged as unknown as HealthProbeChannel[]
  ) as unknown as T[];

  return [...healthRanked].sort((a, b) => {
    const rankDiff =
      getTvBrowsePriorityRank(a, { preferQualityFirst }) -
      getTvBrowsePriorityRank(b, { preferQualityFirst });
    if (rankDiff !== 0) return rankDiff;

    const aLat = a.healthSummary?.bestLatencyMs;
    const bLat = b.healthSummary?.bestLatencyMs;
    if (typeof aLat === 'number' && typeof bLat === 'number' && aLat !== bLat) {
      return aLat - bLat;
    }

    const sigDiff = (b.channels?.length || 0) - (a.channels?.length || 0);
    if (sigDiff !== 0) return sigDiff;

    return (a.dial || 9999) - (b.dial || 9999);
  });
}
