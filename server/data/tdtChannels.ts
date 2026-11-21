/**
 * @module server/data/tdtChannels
 * @description Spanish TDT, pay-TV, sports multiplexes & aggregated international live channels registry.
 */
import type { SpanishTdtChannelDef } from './tdtTypes.ts';
import { TDT_NATIONAL_AND_PAY_CHANNELS } from './tdtNationalAndPayChannels.ts';
import { TDT_BEIN_SPORTS_CHANNELS } from './tdtBeinSportsChannels.ts';
import { TDT_UK_SPORTS_CHANNELS } from './tdtUkSportsChannels.ts';
import { TDT_AMERICAS_SPORTS_CHANNELS } from './tdtAmericasSportsChannels.ts';
import { TDT_THEMATIC_AND_REGIONAL_CHANNELS } from './tdtThematicAndRegionalChannels.ts';
import { INTERNATIONAL_TV_CHANNELS } from './internationalChannels.ts';
import { INTERNATIONAL_CRICKET_AND_SPORTS_CHANNELS } from './internationalSportsAndCricket.ts';
import { INTERNATIONAL_ELAHMAD_AND_ADRAR_CHANNELS } from './internationalElahmadAndAdrarChannels.ts';
import { CHINESE_FOOTBALL_CHANNELS } from '../extractors/chineseSports.ts';
import { CHIRINGUITO_CHANNELS } from './chiringuitoChannels.ts';

export type { SpanishTdtChannelDef };

export const SPANISH_TDT_CHANNELS: SpanishTdtChannelDef[] = [
  ...TDT_NATIONAL_AND_PAY_CHANNELS,
  ...CHIRINGUITO_CHANNELS,
  ...TDT_BEIN_SPORTS_CHANNELS,
  ...TDT_UK_SPORTS_CHANNELS,
  // ==========================================================================
  // FÚTBOL CHINA NATIVO (中文 · 欧冠 CHAMPIONS / 西甲 LALIGA / 英超 PREMIER LEAGUE)
  // ==========================================================================
  ...CHINESE_FOOTBALL_CHANNELS,
  ...TDT_AMERICAS_SPORTS_CHANNELS,
  ...TDT_THEMATIC_AND_REGIONAL_CHANNELS,
  ...INTERNATIONAL_TV_CHANNELS,
  ...INTERNATIONAL_CRICKET_AND_SPORTS_CHANNELS,
  ...INTERNATIONAL_ELAHMAD_AND_ADRAR_CHANNELS,
];
