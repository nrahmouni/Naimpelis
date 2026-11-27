import {
  rankClientChannels,
  type GenericRankableChannel,
} from '../../src/utils/channelQualityRanker.ts';
import type { SpanishTdtChannel } from '../../src/types.ts';

export function buildUnifiedPrioritizedChannels<T extends GenericRankableChannel>(
  channels: T[]
): T[] {
  return rankClientChannels(channels as unknown as SpanishTdtChannel[]) as unknown as T[];
}
