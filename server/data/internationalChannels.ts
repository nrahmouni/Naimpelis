import type {
  InternationalTdtCategory,
  InternationalTdtChannelDef,
} from './internationalChannelTypes.ts';
import { INTERNATIONAL_MENA_CHANNELS } from './internationalMenaChannels.ts';
import { INTERNATIONAL_DOC_AND_US_CHANNELS } from './internationalDocAndUsChannels.ts';
import { INTERNATIONAL_EURO_AND_NEWS_CHANNELS } from './internationalEuroAndNewsChannels.ts';

export type { InternationalTdtCategory, InternationalTdtChannelDef };

export const INTERNATIONAL_TV_CHANNELS: InternationalTdtChannelDef[] = [
  ...INTERNATIONAL_MENA_CHANNELS,
  ...INTERNATIONAL_DOC_AND_US_CHANNELS,
  ...INTERNATIONAL_EURO_AND_NEWS_CHANNELS,
];
