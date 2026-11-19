import type {
  FootballMatchCommentaryItem,
  FootballMatchLineupPlayer,
  FootballMatchLineupTeam,
  FootballMatchStatItem,
  FootballMatchTimelineEvent,
} from '../../../src/types.ts';
import { FOTMOB_HEADERS, normalizeFootballToken } from './teamMatchingAndFotmobDay.ts';

const STAT_TITLE_ES_MAP: Record<string, string> = {
  'Ball possession': 'Posesión de balón',
  'Expected goals (xG)': 'Goles esperados (xG)',
  'xG open play': 'xG en jugada',
  'xG set play': 'xG a balón parado',
  'xG on target (xGOT)': 'xG a puerta (xGOT)',
  'Total shots': 'Tiros totales',
  'Shots on target': 'Tiros a puerta',
  'Shots off target': 'Tiros fuera',
  'Blocked shots': 'Tiros bloqueados',
  'Hit woodwork': 'Al palo',
  'Shots inside box': 'Tiros dentro del área',
  'Shots outside box': 'Tiros fuera del área',
  'Big chances': 'Grandes ocasiones',
  'Big chances missed': 'Ocasiones claras falladas',
  'Touches in opposition box': 'Toques en área rival',
  'Keeper saves': 'Paradas',
  'Goalkeeper saves': 'Paradas',
  Corners: 'Saques de esquina',
  'Corner kicks': 'Saques de esquina',
  Fouls: 'Faltas',
  'Fouls committed': 'Faltas cometidas',
  Passes: 'Pases',
  'Accurate passes': 'Pases precisos',
  'Own half passes': 'Pases en campo propio',
  'Opposition half passes': 'Pases en campo rival',
  'Accurate long balls': 'Pases largos precisos',
  'Accurate crosses': 'Centros precisos',
  Tackles: 'Entradas',
  'Tackles won': 'Entradas ganadas',
  Interceptions: 'Intercepciones',
  Blocks: 'Despejes bloqueados',
  Clearances: 'Despejes',
  Offsides: 'Fueras de juego',
  'Free kicks': 'Tiros libres',
  'Throw-ins': 'Saques de banda',
  'Duels won': 'Duelos ganados',
  'Ground duels won': 'Duelos en el suelo ganados',
  'Aerial duels won': 'Duelos aéreos ganados',
  'Successful dribbles': 'Regates completados',
  'Yellow cards': 'Tarjetas amarillas',
  'Red cards': 'Tarjetas rojas',
};

function formatMarketValueEur(val?: number | null): string | undefined {
  if (typeof val !== 'number' || !Number.isFinite(val) || val <= 0) return undefined;
  if (val >= 1_000_000) {
    const millions = val / 1_000_000;
    return `${millions >= 100 ? millions.toFixed(0) : +millions.toFixed(1)}M €`;
  }
  if (val >= 1_000) {
    return `${Math.round(val / 1_000)}K €`;
  }
  return `${Math.round(val)} €`;
}

export function parseFotmobPeriodStats(
  periodObj: any,
  homeAvgRating?: string,
  awayAvgRating?: string
): FootballMatchStatItem[] {
  const groups: any[] = Array.isArray(periodObj?.stats) ? periodObj.stats : [];
  const items: FootballMatchStatItem[] = [];
  const seenKeys = new Set<string>();

  for (const grp of groups) {
    const rawStats: any[] = Array.isArray(grp?.stats) ? grp.stats : [];
    for (const s of rawStats) {
      if (!s || s.type === 'title' || !Array.isArray(s.stats) || s.stats.length < 2) {
        continue;
      }
      const key = String(s.key || s.title || '').trim();
      const rawTitle = String(s.title || key).trim();
      if (!key || seenKeys.has(key)) continue;
      seenKeys.add(key);

      const label = STAT_TITLE_ES_MAP[rawTitle] || rawTitle;
      const hRaw = s.stats[0];
      const aRaw = s.stats[1];
      if (hRaw == null && aRaw == null) continue;

      const hStrBase = String(hRaw ?? '0');
      const aStrBase = String(aRaw ?? '0');
      const isPossession = /possess/i.test(key) || /possess/i.test(rawTitle);
      const hStr = isPossession && !hStrBase.includes('%') ? `${hStrBase}%` : hStrBase;
      const aStr = isPossession && !aStrBase.includes('%') ? `${aStrBase}%` : aStrBase;

      const hNum = parseFloat(hStr.replace(/[^0-9.]/g, '')) || 0;
      const aNum = parseFloat(aStr.replace(/[^0-9.]/g, '')) || 0;
      const sum = hNum + aNum;
      const homePct = sum > 0 ? Math.round((hNum / sum) * 100) : 50;
      const awayPct = sum > 0 ? 100 - homePct : 50;

      items.push({
        key,
        label,
        homeValue: hStr,
        awayValue: aStr,
        homePct,
        awayPct,
      });
    }
  }

  if (homeAvgRating && awayAvgRating && !seenKeys.has('average_rating')) {
    const hNum = parseFloat(homeAvgRating) || 0;
    const aNum = parseFloat(awayAvgRating) || 0;
    const sum = hNum + aNum;
    items.push({
      key: 'average_rating',
      label: 'Nota media (Rating)',
      homeValue: homeAvgRating,
      awayValue: awayAvgRating,
      homePct: sum > 0 ? Math.round((hNum / sum) * 100) : 50,
      awayPct: sum > 0 ? 100 - Math.round((hNum / sum) * 100) : 50,
    });
  }

  return items;
}

function mapPositionCode(posId?: number, usualPosId?: number): string {
  const id = typeof usualPosId === 'number' ? usualPosId : posId;
  if (id === 0 || id === 11) return 'POR';
  if (id === 1 || (typeof posId === 'number' && posId >= 31 && posId <= 39)) return 'DEF';
  if (id === 2 || (typeof posId === 'number' && posId >= 60 && posId <= 89)) return 'MC';
  if (id === 3 || (typeof posId === 'number' && posId >= 100)) return 'DEL';
  return 'JUG';
}

export function parseFotmobLineupTeam(
  teamObj: any,
  espnHeightsByName?: Map<string, string>
): FootballMatchLineupTeam | undefined {
  if (!teamObj) return undefined;

  const mapPlayer = (p: any, isStarter: boolean, idx: number): FootballMatchLineupPlayer => {
    const fullName = String(p?.name || 'Jugador').trim();
    const parts = fullName.split(' ');
    const shortName =
      parts.length >= 2
        ? `${parts[0].slice(0, 1)}. ${parts.slice(1).join(' ')}`
        : fullName;

    const perf = p?.performance || {};
    const events: any[] = Array.isArray(perf.events) ? perf.events : [];
    const subEvents: any[] = Array.isArray(perf.substitutionEvents)
      ? perf.substitutionEvents
      : [];

    let goals = 0;
    let assists = 0;
    let yellowCard = false;
    let redCard = false;
    for (const ev of events) {
      const et = String(ev?.type || '').toLowerCase();
      if (et === 'goal') goals += 1;
      else if (et === 'assist') assists += 1;
      else if (et === 'yellowcard') yellowCard = true;
      else if (et === 'redcard' || et === 'yellowredcard') redCard = true;
    }

    let subInMinute: string | undefined;
    let subOutMinute: string | undefined;
    for (const sub of subEvents) {
      if (sub?.type === 'subIn' && sub?.time) subInMinute = `${sub.time}'`;
      if (sub?.type === 'subOut' && sub?.time) subOutMinute = `${sub.time}'`;
    }

    const rawRating = perf?.rating;
    const rating =
      typeof rawRating === 'number' && rawRating > 0
        ? rawRating.toFixed(1)
        : undefined;

    const marketValueNum =
      typeof p?.marketValue === 'number' && p.marketValue > 0
        ? p.marketValue
        : undefined;
    const marketValue = formatMarketValueEur(marketValueNum);

    const verticalLayout = p?.verticalLayout;
    const layout =
      verticalLayout &&
      typeof verticalLayout.x === 'number' &&
      typeof verticalLayout.y === 'number'
        ? {
            x: Math.max(0.08, Math.min(0.92, verticalLayout.x)),
            y: Math.max(0.08, Math.min(0.92, verticalLayout.y)),
          }
        : undefined;

    const normKey = normalizeFootballToken(fullName);
    const height = espnHeightsByName?.get(normKey);

    return {
      id: String(p?.id || `fm-${idx}`),
      jersey: String(p?.shirtNumber || idx + 1),
      name: fullName,
      shortName,
      position: mapPositionCode(p?.positionId, p?.usualPlayingPositionId),
      starter: isStarter,
      age: typeof p?.age === 'number' && p.age > 0 ? p.age : undefined,
      club: String(p?.primaryTeamName || '').trim() || undefined,
      country: String(p?.countryName || '').trim() || undefined,
      height,
      marketValue,
      marketValueNum,
      rating,
      photoUrl: p?.id
        ? `https://images.fotmob.com/image_resources/playerimages/${p.id}.png`
        : undefined,
      isCaptain: Boolean(p?.isCaptain),
      goals: goals > 0 ? goals : undefined,
      assists: assists > 0 ? assists : undefined,
      yellowCard: yellowCard || undefined,
      redCard: redCard || undefined,
      subInMinute,
      subOutMinute,
      layout,
    };
  };

  const startersRaw: any[] = Array.isArray(teamObj?.starters) ? teamObj.starters : [];
  const subsRaw: any[] = Array.isArray(teamObj?.subs) ? teamObj.subs : [];
  const unavailRaw: any[] = Array.isArray(teamObj?.unavailable)
    ? teamObj.unavailable
    : [];

  const starters = startersRaw.map((p, idx) => mapPlayer(p, true, idx));
  const substitutes = subsRaw.map((p, idx) => mapPlayer(p, false, idx + 20));
  const unavailable = unavailRaw.map((u, idx) => ({
    id: String(u?.id || `unav-${idx}`),
    name: String(u?.name || 'Baja'),
    reason: String(
      u?.unavailability?.reason || u?.unavailability?.type || 'Lesión / Sanción'
    ),
    photoUrl: u?.id
      ? `https://images.fotmob.com/image_resources/playerimages/${u.id}.png`
      : undefined,
  }));

  const rawTeamRating = teamObj?.rating;
  const avgRating =
    typeof rawTeamRating === 'number' && rawTeamRating > 0
      ? rawTeamRating.toFixed(2)
      : undefined;

  const totalMarketValue = formatMarketValueEur(teamObj?.totalStarterMarketValue);

  return {
    teamName: String(teamObj?.name || 'Equipo'),
    formation: teamObj?.formation ? String(teamObj.formation) : undefined,
    coach: teamObj?.coach?.name ? String(teamObj.coach.name) : undefined,
    starters,
    substitutes,
    unavailable: unavailable.length > 0 ? unavailable : undefined,
    avgRating,
    totalMarketValue,
    averageAge:
      typeof teamObj?.averageStarterAge === 'number'
        ? +teamObj.averageStarterAge.toFixed(1)
        : undefined,
  };
}

export function parseFotmobEvents(
  rawEvents: any[],
  homeTeamName: string,
  awayTeamName: string
): FootballMatchTimelineEvent[] {
  if (!Array.isArray(rawEvents)) return [];
  const out: FootballMatchTimelineEvent[] = [];

  for (let idx = 0; idx < rawEvents.length; idx++) {
    const ev = rawEvents[idx];
    const typeRaw = String(ev?.type || '').trim();
    if (!typeRaw || typeRaw === 'AddedTime' || typeRaw === 'Half') continue;

    const minNum = ev?.time != null ? String(ev.time) : '';
    const extra = ev?.overloadTime ? `+${ev.overloadTime}` : '';
    const clock = minNum ? `${minNum}${extra}'` : String(ev?.timeStr || '•');
    const side: 'home' | 'away' | 'neutral' =
      ev?.isHome === true ? 'home' : ev?.isHome === false ? 'away' : 'neutral';

    const typeLower = typeRaw.toLowerCase();
    if (typeLower === 'goal') {
      const player = String(
        ev?.player?.name || ev?.nameStr || 'Gol'
      ).trim();
      const assist = String(ev?.assistInput || ev?.assistStr || '').trim() || undefined;
      const isOwn = Boolean(ev?.ownGoal);
      const isPen = String(ev?.goalDescriptionKey || '').toLowerCase().includes('penalty');
      out.push({
        id: String(ev?.eventId || `fm-ev-${idx}`),
        clock,
        type: 'goal',
        typeLabel: isOwn ? 'Gol en propia' : isPen ? 'Gol (Pen.)' : 'Gol',
        playerName: player,
        assistOrSubName: assist,
        side,
        detailText: ev?.newScore ? `${ev.newScore[0]} - ${ev.newScore[1]}` : undefined,
      });
    } else if (typeLower === 'card') {
      const cardType = String(ev?.card || ev?.cardDescription || '').toLowerCase();
      const isRed = cardType.includes('red') || cardType === 'yellowred';
      out.push({
        id: String(ev?.eventId || `fm-ev-${idx}`),
        clock,
        type: isRed ? 'red-card' : 'yellow-card',
        typeLabel: isRed ? 'Roja' : 'Amarilla',
        playerName: String(ev?.player?.name || ev?.nameStr || 'Jugador').trim(),
        side,
      });
    } else if (typeLower === 'substitution') {
      const swap = Array.isArray(ev?.swap) ? ev.swap : [];
      const playerIn = String(swap[0]?.name || ev?.player?.name || 'Cambio').trim();
      const playerOut = String(swap[1]?.name || '').trim() || undefined;
      out.push({
        id: String(ev?.eventId || `fm-ev-${idx}`),
        clock,
        type: 'substitution',
        typeLabel: 'Cambio',
        playerName: playerIn,
        assistOrSubName: playerOut,
        side,
      });
    } else if (typeLower === 'var') {
      out.push({
        id: String(ev?.eventId || `fm-ev-${idx}`),
        clock,
        type: 'var',
        typeLabel: 'VAR',
        playerName: String(
          ev?.VARResult?.description || ev?.player?.name || homeTeamName || awayTeamName
        ).trim(),
        side,
      });
    }
  }
  return out;
}

export async function fetchFotmobLiveCommentary(
  fotmobId: string
): Promise<FootballMatchCommentaryItem[]> {
  for (const langCode of ['es_gen', 'en']) {
    try {
      const res = await fetch(
        `https://data.fotmob.com/webcl/ltc/gsm/${fotmobId}_${langCode}.json.gz`,
        {
          headers: FOTMOB_HEADERS,
          signal: AbortSignal.timeout(4000),
        }
      );
      if (!res.ok) continue;
      const json = (await res.json()) as { Events?: any[] };
      const events = Array.isArray(json?.Events) ? json.Events : [];
      if (events.length === 0) continue;

      return events.slice(0, 60).map((ev, idx) => {
        const elapsed = Number(ev?.Elapsed || 0);
        const plus = Number(ev?.ElapsedPlus || 0);
        const minute =
          elapsed > 0
            ? `${elapsed}${plus > 0 ? `+${plus}` : ''}'`
            : String(ev?.IncidentCode || 'Resumen').replace(/_/g, ' ');
        const inc = String(ev?.IncidentCode || ev?.Type || '').toLowerCase();
        const isImportant = /goal|red|yellow|penalty|kickoff|whistle|summary/.test(inc);
        return {
          id: String(ev?.MessageId || `ltc-${idx}`),
          minute,
          text: String(ev?.Description || '').trim(),
          type: inc || undefined,
          isImportant,
        };
      });
    } catch {
      // try next language feed
    }
  }
  return [];
}
