import type { AppLanguage, SportsMatch } from '../../types';
import { pickLang } from '../../utils/i18n';
import { pickPreferredChannelIndex } from '../sports/FootballMatchboardHelpers';

export const BARCA_MADRID_PRE_KICKOFF_WINDOW_MS = 10 * 60 * 1000;
export const BARCA_MADRID_LIVE_FALLBACK_WINDOW_MS = 150 * 60 * 1000;
export const BARCA_MADRID_MAX_LIVE_AGE_MS = 4 * 60 * 60 * 1000;

const FINISHED_STATUS_RE =
  /^(final|ft|full[- ]?time|terminado|finalizado|suspendido|aplazado|postponed|cancelled|abandonado)$/i;

const NON_FIRST_TEAM_COMPETITION_RE =
  /(wchampions|femenin|femeni|women|woman|u19|u21|u23|juvenil|youth|segunda\s*rfef|tercera\s*rfef|primera\s*federacion|ecu\.|liga\s*pro)/i;

function normalizeClubName(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function isFirstTeamBarcelonaOrRealMadridName(teamName: string): boolean {
  const clean = normalizeClubName(teamName);
  if (!clean) return false;
  return (
    clean === 'barcelona' ||
    clean === 'fc barcelona' ||
    clean === 'f c barcelona' ||
    clean === 'barca' ||
    clean === 'real madrid' ||
    clean === 'real madrid cf' ||
    clean === 'real madrid c f'
  );
}

export function isFirstTeamBarcaOrMadridMatch(match: SportsMatch): boolean {
  if (!match || match.is247Channel || match.sport !== 'soccer') return false;
  const meta = match.matchMeta;
  if (!meta) return false;

  const competitionHay = `${meta.leagueSlug || ''} ${meta.leagueName || ''} ${match.competition || ''}`;
  if (NON_FIRST_TEAM_COMPETITION_RE.test(competitionHay)) return false;

  return (
    isFirstTeamBarcelonaOrRealMadridName(meta.homeTeam) ||
    isFirstTeamBarcelonaOrRealMadridName(meta.awayTeam)
  );
}

export function isBarcaOrMadridHomeReadyMatch(
  match: SportsMatch,
  nowMs: number = Date.now()
): boolean {
  if (!isFirstTeamBarcaOrMadridMatch(match)) return false;
  if (!Array.isArray(match.channels) || match.channels.length === 0) return false;

  const meta = match.matchMeta;
  const statusState = meta?.statusState;
  const statusLabel = String(meta?.statusLabel || match.time || '').trim();

  if (statusState === 'finished' || FINISHED_STATUS_RE.test(statusLabel)) {
    return false;
  }

  const kickoffMs = Number(meta?.kickoffMs || 0);

  if (statusState === 'live' || match.isLive) {
    if (kickoffMs > 0 && nowMs - kickoffMs > BARCA_MADRID_MAX_LIVE_AGE_MS) {
      return false;
    }
    return true;
  }

  if (kickoffMs <= 0) return false;

  const diffMs = kickoffMs - nowMs;
  return (
    diffMs <= BARCA_MADRID_PRE_KICKOFF_WINDOW_MS &&
    diffMs >= -BARCA_MADRID_LIVE_FALLBACK_WINDOW_MS
  );
}

export function getBarcaMadridHomeMatches(
  matches: SportsMatch[],
  nowMs: number = Date.now()
): SportsMatch[] {
  if (!Array.isArray(matches) || matches.length === 0) return [];
  return matches
    .filter((m) => isBarcaOrMadridHomeReadyMatch(m, nowMs))
    .sort((a, b) => {
      const aLive = a.isLive || a.matchMeta?.statusState === 'live' ? 0 : 1;
      const bLive = b.isLive || b.matchMeta?.statusState === 'live' ? 0 : 1;
      if (aLive !== bLive) return aLive - bLive;
      const aKick = Number(a.matchMeta?.kickoffMs || 0);
      const bKick = Number(b.matchMeta?.kickoffMs || 0);
      return aKick - bKick;
    });
}

export function hasPendingBarcaMadridMatchToday(
  matches: SportsMatch[],
  nowMs: number = Date.now()
): boolean {
  return matches.some((m) => {
    if (!isFirstTeamBarcaOrMadridMatch(m)) return false;
    if (m.matchMeta?.statusState === 'finished') return false;
    if (m.isLive || m.matchMeta?.statusState === 'live') return true;
    const kickoffMs = Number(m.matchMeta?.kickoffMs || 0);
    return kickoffMs > 0 && kickoffMs - nowMs >= -BARCA_MADRID_LIVE_FALLBACK_WINDOW_MS;
  });
}

export function getPreferredBarcaMadridChannelIndex(
  match: SportsMatch,
  lang: AppLanguage
): number {
  const idx = pickPreferredChannelIndex(match.channels || [], lang);
  return idx >= 0 ? idx : 0;
}

export function getBarcaMadridBannerDisplayMeta(
  match: SportsMatch,
  nowMs: number,
  lang: AppLanguage
): {
  isLiveNow: boolean;
  statusHeadline: string;
  kickoffTimeLabel: string;
  competitionLabel: string;
  channelLabel: string;
  hasScore: boolean;
  homeScore: string;
  awayScore: string;
} {
  const meta = match.matchMeta;
  const isLiveNow = Boolean(match.isLive || meta?.statusState === 'live');
  const homeScore = String(meta?.homeScore ?? '').trim();
  const awayScore = String(meta?.awayScore ?? '').trim();
  const hasScore = /^\d+$/.test(homeScore) && /^\d+$/.test(awayScore);

  const kickoffMs = Number(meta?.kickoffMs || 0);
  const diffMs = kickoffMs > 0 ? kickoffMs - nowMs : 0;
  const minsLeft = Math.max(0, Math.ceil(diffMs / 60_000));
  const kickoffTimeLabel = String(meta?.kickoffTime || match.time || '').trim();

  let statusHeadline = '';
  if (isLiveNow) {
    const rawClock = String(meta?.statusLabel || match.time || '').trim();
    const clockSuffix =
      rawClock && !/^en vivo|live$/i.test(rawClock) ? ` · ${rawClock}` : '';
    statusHeadline = `${pickLang(lang, {
      es: 'EN DIRECTO',
      ca: 'EN DIRECTE',
      en: 'LIVE NOW',
      zh: '正在直播',
      rif: 'SRIDU',
    })}${clockSuffix}`;
  } else if (diffMs <= 0) {
    statusHeadline = pickLang(lang, {
      es: 'EMPIEZA AHORA · SEÑAL ABIERTA',
      ca: 'COMENÇA ARA · SENYAL OBERTA',
      en: 'STARTING NOW · STREAM READY',
      zh: '即将开赛 · 信号就绪',
    });
  } else {
    statusHeadline = pickLang(lang, {
      es: `EMPIEZA EN ${minsLeft} MIN · ${kickoffTimeLabel}`,
      ca: `COMENÇA EN ${minsLeft} MIN · ${kickoffTimeLabel}`,
      en: `STARTS IN ${minsLeft} MIN · ${kickoffTimeLabel}`,
      zh: `${minsLeft} 分钟后开赛 · ${kickoffTimeLabel}`,
    });
  }

  const competitionLabel =
    meta?.leagueName ||
    String(match.competition || '').replace(/^[^:]+:\s*/, '').trim() ||
    'Fútbol';

  const preferredIdx = getPreferredBarcaMadridChannelIndex(match, lang);
  const topChannel = match.channels[preferredIdx] || match.channels[0];
  const channelLabel =
    meta?.spanishBroadcaster?.name ||
    String(topChannel?.label || '')
      .replace(/\s*\([^)]*Guía TV[^)]*\)/i, '')
      .trim() ||
    'HD';

  return {
    isLiveNow,
    statusHeadline,
    kickoffTimeLabel,
    competitionLabel,
    channelLabel,
    hasScore,
    homeScore,
    awayScore,
  };
}
