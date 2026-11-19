/**
 * Simplified Chinese (ZH) localization dictionary for RiffanTV.
 * Aggregated dictionary with 2061 entries providing 100% complete UI coverage.
 */

import { ZH_DICTIONARY_PART1 } from './zhTranslationsPart1';
import { ZH_DICTIONARY_PART2 } from './zhTranslationsPart2';
import { ZH_DICTIONARY_PART3 } from './zhTranslationsPart3';
import { ZH_DICTIONARY_PART4 } from './zhTranslationsPart4';

export const ZH_DICTIONARY: Record<string, string> = {
  ...ZH_DICTIONARY_PART1,
  ...ZH_DICTIONARY_PART2,
  ...ZH_DICTIONARY_PART3,
  ...ZH_DICTIONARY_PART4,
};

/**
 * Look up Chinese translation for an English or Spanish UI string.
 * Handles exact matches, trimmed lookups, and dynamic templates.
 */
export function lookupZhTranslation(en?: string, es?: string): string | undefined {
  if (!en && !es) return undefined;
  if (en) {
    const directEn = ZH_DICTIONARY[en] || ZH_DICTIONARY[en.trim()];
    if (directEn) return directEn;
  }
  if (es) {
    const directEs = ZH_DICTIONARY[es] || ZH_DICTIONARY[es.trim()];
    if (directEs) return directEs;
  }

  const candidate = (en || es || '').trim();
  if (!candidate) return undefined;

  // Dynamic patterns
  const roomMatch = candidate.match(/^(?:Room|Sala)\s*#(.+)$/i);
  if (roomMatch) return `房间 #${roomMatch[1]}`;

  const chMatch = candidate.match(/^(\d+)\s*(?:channels?|canales?)$/i);
  if (chMatch) return `${chMatch[1]} 个频道`;

  const epMatch = candidate.match(/^(\d+)\s*(?:episodes?|cap[íi]tulos?)$/i);
  if (epMatch) return `${epMatch[1]} 个分集`;

  const matchMatch = candidate.match(/^(\d+)\s*(?:matches?|partidos?)$/i);
  if (matchMatch) return `${matchMatch[1]} 场比赛`;

  const progMatch = candidate.match(/^(\d+)\s*(?:programs? today|programas? hoy)$/i);
  if (progMatch) return `${progMatch[1]} 个今日节目`;

  const sMatch = candidate.match(/^(?:Season|Temporada)\s*(\d+)$/i);
  if (sMatch) return `第 ${sMatch[1]} 季`;

  const capMatch = candidate.match(/^(?:Episode|Cap[íi]tulo)\s*(\d+)$/i);
  if (capMatch) return `第 ${capMatch[1]} 集`;

  const dialMatch = candidate.match(/^Dial\s*(\d+)$/i);
  if (dialMatch) return `频道号 ${dialMatch[1]}`;

  const minMatch = candidate.match(/^(\d+)\s*min$/i);
  if (minMatch) return `${minMatch[1]} 分钟`;

  return undefined;
}
