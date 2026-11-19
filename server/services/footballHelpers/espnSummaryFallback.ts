import type {
  FootballMatchCommentaryItem,
  FootballMatchLineupPlayer,
  FootballMatchLineupTeam,
  FootballMatchStatItem,
  FootballMatchTimelineEvent,
} from '../../../src/types.ts';
import { normalizeFootballToken } from './teamMatchingAndFotmobDay.ts';

export function parseEspnSummaryFallback(sj: any, eventId: string): {
  venue?: string;
  stats: FootballMatchStatItem[];
  events: FootballMatchTimelineEvent[];
  homeLineup?: FootballMatchLineupTeam;
  awayLineup?: FootballMatchLineupTeam;
  commentary: FootballMatchCommentaryItem[];
  espnHeightsByName: Map<string, string>;
  statusState?: 'live' | 'upcoming' | 'finished';
  statusLabel?: string;
  homeScore?: string;
  awayScore?: string;
  homeTeam?: string;
  awayTeam?: string;
} {
  const espnHeightsByName = new Map<string, string>();
  const comp = sj?.header?.competitions?.[0];
  const competitors: any[] = Array.isArray(comp?.competitors) ? comp.competitors : [];
  const homeComp = competitors.find((c) => c.homeAway === 'home') || competitors[0];
  const awayComp = competitors.find((c) => c.homeAway === 'away') || competitors[1];
  const homeTeamId = String(homeComp?.team?.id || homeComp?.id || '');
  const awayTeamId = String(awayComp?.team?.id || awayComp?.id || '');
  const homeName = String(
    homeComp?.team?.shortDisplayName || homeComp?.team?.displayName || ''
  ).trim();
  const awayName = String(
    awayComp?.team?.shortDisplayName || awayComp?.team?.displayName || ''
  ).trim();

  const rawState = String(comp?.status?.type?.state || '').toLowerCase();
  const statusState: 'live' | 'upcoming' | 'finished' =
    rawState === 'in' ? 'live' : rawState === 'post' ? 'finished' : 'upcoming';
  const statusLabel = String(
    comp?.status?.displayClock || comp?.status?.type?.shortDetail || ''
  ).trim();

  const boxTeams: any[] = Array.isArray(sj?.boxscore?.teams) ? sj.boxscore.teams : [];
  const homeStatsArr: any[] =
    boxTeams.find((t) => String(t?.team?.id || '') === homeTeamId)?.statistics ||
    boxTeams[0]?.statistics ||
    [];
  const awayStatsArr: any[] =
    boxTeams.find((t) => String(t?.team?.id || '') === awayTeamId)?.statistics ||
    boxTeams[1]?.statistics ||
    [];

  const statKeysOrder: { key: string; esLabel: string }[] = [
    { key: 'possessionPct', esLabel: 'Posesión de balón' },
    { key: 'totalShots', esLabel: 'Tiros totales' },
    { key: 'shotsOnTarget', esLabel: 'Tiros a puerta' },
    { key: 'saves', esLabel: 'Paradas' },
    { key: 'wonCorners', esLabel: 'Saques de esquina' },
    { key: 'foulsCommitted', esLabel: 'Faltas' },
    { key: 'totalPasses', esLabel: 'Pases' },
    { key: 'accuratePasses', esLabel: 'Pases precisos' },
    { key: 'offsides', esLabel: 'Fueras de juego' },
    { key: 'yellowCards', esLabel: 'Tarjetas amarillas' },
    { key: 'redCards', esLabel: 'Tarjetas rojas' },
  ];

  const stats: FootballMatchStatItem[] = [];
  const seenLabels = new Set<string>();
  for (const def of statKeysOrder) {
    const hs = homeStatsArr.find((s) => s?.name === def.key);
    const as = awayStatsArr.find((s) => s?.name === def.key);
    if (!hs && !as) continue;
    const label = def.esLabel || hs?.label || as?.label || def.key;
    if (seenLabels.has(label)) continue;
    seenLabels.add(label);

    const hStr = String(hs?.displayValue ?? '0');
    const aStr = String(as?.displayValue ?? '0');
    const hNum = parseFloat(hStr.replace(/[^0-9.]/g, '')) || 0;
    const aNum = parseFloat(aStr.replace(/[^0-9.]/g, '')) || 0;
    const sum = hNum + aNum;
    const homePct = sum > 0 ? Math.round((hNum / sum) * 100) : 50;
    stats.push({
      key: def.key,
      label,
      homeValue: def.key === 'possessionPct' && !hStr.includes('%') ? `${hStr}%` : hStr,
      awayValue: def.key === 'possessionPct' && !aStr.includes('%') ? `${aStr}%` : aStr,
      homePct,
      awayPct: 100 - homePct,
    });
  }

  const rawKeyEvents: any[] = Array.isArray(sj?.keyEvents)
    ? sj.keyEvents
    : Array.isArray(comp?.details)
    ? comp.details
    : [];

  const events: FootballMatchTimelineEvent[] = [];
  for (let idx = 0; idx < rawKeyEvents.length; idx++) {
    const ke = rawKeyEvents[idx];
    const rawType = String(ke?.type?.type || ke?.type?.text || '').toLowerCase();
    const isGoal = Boolean(ke?.scoringPlay) || rawType.includes('goal') || rawType.includes('gol');
    const isRed = rawType.includes('red') || rawType.includes('roja');
    const isYellow = !isRed && (rawType.includes('yellow') || rawType.includes('amarilla'));
    const isSub = rawType.includes('sub') || rawType.includes('cambio');
    if (!isGoal && !isRed && !isYellow && !isSub) continue;

    const evTeamId = String(ke?.team?.id || '');
    const side: 'home' | 'away' | 'neutral' =
      evTeamId && evTeamId === homeTeamId
        ? 'home'
        : evTeamId && evTeamId === awayTeamId
        ? 'away'
        : 'neutral';
    const participants: any[] = Array.isArray(ke?.participants) ? ke.participants : [];
    const playerName =
      String(
        participants[0]?.athlete?.displayName ||
          ke?.athletesInvolved?.[0]?.displayName ||
          ke?.shortText ||
          ''
      ).trim() || 'Jugador';
    const assistOrSubName =
      String(participants[1]?.athlete?.displayName || '').trim() || undefined;

    events.push({
      id: String(ke?.id || `espn-ev-${idx}`),
      clock: String(ke?.clock?.displayValue || '').trim() || '•',
      type: isGoal
        ? 'goal'
        : isRed
        ? 'red-card'
        : isYellow
        ? 'yellow-card'
        : 'substitution',
      typeLabel: isGoal ? 'Gol' : isRed ? 'Roja' : isYellow ? 'Amarilla' : 'Cambio',
      playerName,
      assistOrSubName,
      side,
      detailText: String(ke?.shortText || ke?.text || '').trim() || undefined,
    });
  }

  const rosters: any[] = Array.isArray(sj?.rosters) ? sj.rosters : [];
  const parseEspnRoster = (rObj: any, fallbackName: string): FootballMatchLineupTeam | undefined => {
    const rawList: any[] = Array.isArray(rObj?.roster) ? rObj.roster : [];
    if (rawList.length === 0) return undefined;

    const mapped: FootballMatchLineupPlayer[] = rawList.map((p, idx) => {
      const name = String(
        p?.athlete?.displayName || p?.athlete?.shortName || 'Jugador'
      ).trim();
      const displayHeight = String(p?.athlete?.displayHeight || '').trim() || undefined;
      if (displayHeight) {
        espnHeightsByName.set(normalizeFootballToken(name), displayHeight);
      }
      return {
        id: String(p?.athlete?.id || `espn-p-${eventId}-${idx}`),
        jersey: String(p?.jersey || idx + 1),
        name,
        position: String(p?.position?.abbreviation || 'JUG'),
        starter: Boolean(p?.starter ?? idx < 11),
        height: displayHeight,
        photoUrl: p?.athlete?.headshot?.href || undefined,
      };
    });

    return {
      teamName: String(rObj?.team?.displayName || fallbackName),
      formation: rObj?.formation ? String(rObj.formation) : undefined,
      starters: mapped.filter((x) => x.starter),
      substitutes: mapped.filter((x) => !x.starter),
    };
  };

  const homeRoster = rosters.find((r) => r?.homeAway === 'home') || rosters[0];
  const awayRoster = rosters.find((r) => r?.homeAway === 'away') || rosters[1];

  const rawPlays: any[] = Array.isArray(sj?.plays)
    ? sj.plays
    : Array.isArray(sj?.commentary)
    ? sj.commentary
    : [];
  const commentary: FootballMatchCommentaryItem[] = rawPlays
    .filter((pl) => pl?.text || pl?.headline)
    .slice(0, 40)
    .map((pl, idx) => ({
      id: String(pl?.id || `espn-com-${idx}`),
      minute: String(pl?.clock?.displayValue || '•'),
      text: String(pl?.text || pl?.headline || '').trim(),
      isImportant: Boolean(pl?.scoringPlay || /gol|goal|red|roja/i.test(String(pl?.type?.text || ''))),
    }));

  return {
    venue: sj?.gameInfo?.venue?.fullName ? String(sj.gameInfo.venue.fullName) : undefined,
    stats,
    events,
    homeLineup: parseEspnRoster(homeRoster, homeName || 'Local'),
    awayLineup: parseEspnRoster(awayRoster, awayName || 'Visitante'),
    commentary,
    espnHeightsByName,
    statusState,
    statusLabel,
    homeScore: statusState === 'upcoming' ? '-' : String(homeComp?.score ?? '0'),
    awayScore: statusState === 'upcoming' ? '-' : String(awayComp?.score ?? '0'),
    homeTeam: homeName || undefined,
    awayTeam: awayName || undefined,
  };
}
