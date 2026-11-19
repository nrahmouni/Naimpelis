/**
 * NAIM CINE / RiffanTV — Voice Assistant & Speech Intelligence Gateway
 * Modularized barrel re-exporting voice types, parsers, planners, and routes.
 */

export type {
  VoiceIntent,
  VoiceAssistantAction,
  VoiceChatHistoryTurn,
  VoiceAssistantCandidateItem,
  ParsedVoiceIntent,
  RegisterVoiceAssistantDeps,
} from './voice/types.ts';

export {
  normalizeSearchStr,
  detectOrdinalSelection,
  parseSeriesSeasonAndEpisode,
} from './voice/parsers.ts';

export {
  buildFallbackVoicePlan,
} from './voice/fallbackPlanner.ts';

export {
  searchTmdbPersonCredits,
  searchTmdbTitlesRanked,
} from './voice/tmdbSearch.ts';

export {
  matchChannelsByKeywords,
  registerVoiceAssistantRoutes,
} from './voice/voiceRoutes.ts';
