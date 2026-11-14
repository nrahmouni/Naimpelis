import type {
  FootballMatchCommentaryItem,
  FootballMatchDetails,
  FootballMatchLineupPlayer,
  FootballMatchLineupTeam,
  FootballMatchShotItem,
  FootballMatchStatItem,
  FootballMatchTimelineEvent,
  FootballMomentumPoint,
} from '../../src/types.ts';

export interface FotmobMatchSummary {
  fotmobId: string;
  leagueId: number;
  leagueName: string;
  ccode: string;
  homeId: number;
  homeName: string;
  homeScore: string;
  homeRedCards: number;
  awayId: number;
  awayName: string;
  awayScore: string;
  awayRedCards: number;
  utcTime: string;
  kickoffTime: string;
  kickoffMs: number;
  statusState: 'live' | 'upcoming' | 'finished';
  statusLabel: string;
  homeLogo: string;
  awayLogo: string;
  regionFlagUrl: string;
}

const FOTMOB_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
  Referer: 'https://www.fotmob.com/',
};

const fotmobDayCache = new Map<string, { matches: FotmobMatchSummary[]; ts: number }>();
const fotmobDetailsCache = new Map<string, { details: FootballMatchDetails; ts: number }>();

const CCODE_TO_FLAG: Record<string, string> = {
  ESP: 'es',
  ENG: 'gb-eng',
  ITA: 'it',
  GER: 'de',
  FRA: 'fr',
  POR: 'pt',
  NED: 'nl',
  BEL: 'be',
  TUR: 'tr',
  SCO: 'gb-sct',
  ARG: 'ar',
  BRA: 'br',
  COL: 'co',
  MEX: 'mx',
  USA: 'us',
  URU: 'uy',
  CHI: 'cl',
  PER: 'pe',
  ECU: 'ec',
  INT: 'eu',
  EUR: 'eu',
  SAM: 'ar',
  SAU: 'sa',
  JPN: 'jp',
  KOR: 'kr',
};

const CCODE_TO_REGION: Record<string, string> = {
  ESP: 'España',
  ENG: 'Inglaterra',
  ITA: 'Italia',
  GER: 'Alemania',
  FRA: 'Francia',
  POR: 'Portugal',
  NED: 'Países Bajos',
  ARG: 'Argentina',
  BRA: 'Brasil',
  COL: 'Colombia',
  MEX: 'México',
  USA: 'EE. UU.',
  INT: 'Internacional',
  EUR: 'Europa',
  SAM: 'Sudamérica',
  SAU: 'Arabia Saudí',
};

const TEAM_NORMALIZE_ALIASES: Record<string, string[]> = {
  espana: ['espana', 'spain'],
  spain: ['espana', 'spain'],
  francia: ['francia', 'france'],
  france: ['francia', 'france'],
  inglaterra: ['inglaterra', 'england'],
  england: ['inglaterra', 'england'],
  alemania: ['alemania', 'germany'],
  germany: ['alemania', 'germany'],
  italia: ['italia', 'italy'],
  italy: ['italia', 'italy'],
  paises_bajos: ['paises bajos', 'holanda', 'netherlands'],
  netherlands: ['paises bajos', 'holanda', 'netherlands'],
  croacia: ['croacia', 'croatia'],
  croatia: ['croacia', 'croatia'],
  republica_checa: ['republica checa', 'chequia', 'czechia', 'czech republic'],
  czechia: ['republica checa', 'chequia', 'czechia'],
  belgica: ['belgica', 'belgium'],
  belgium: ['belgica', 'belgium'],
  suiza: ['suiza', 'switzerland'],
  switzerland: ['suiza', 'switzerland'],
  escocia: ['escocia', 'scotland'],
  scotland: ['escocia', 'scotland'],
  gales: ['gales', 'wales'],
  wales: ['gales', 'wales'],
  dinamarca: ['dinamarca', 'denmark'],
  denmark: ['dinamarca', 'denmark'],
  suecia: ['suecia', 'sweden'],
  sweden: ['suecia', 'sweden'],
  noruega: ['noruega', 'norway'],
  norway: ['noruega', 'norway'],
  polonia: ['polonia', 'poland'],
  poland: ['polonia', 'poland'],
  grecia: ['grecia', 'greece'],
  greece: ['grecia', 'greece'],
  turquia: ['turquia', 'turkey', 'turkiye'],
  turkiye: ['turquia', 'turkey', 'turkiye'],
  hungria: ['hungria', 'hungary'],
  hungary: ['hungria', 'hungary'],
  ucrania: ['ucrania', 'ukraine'],
  ukraine: ['ucrania', 'ukraine'],
  rumania: ['rumania', 'romania'],
  romania: ['rumania', 'romania'],
  eslovaquia: ['eslovaquia', 'slovakia'],
  slovakia: ['eslovaquia', 'slovakia'],
  eslovenia: ['eslovenia', 'slovenia'],
  slovenia: ['eslovenia', 'slovenia'],
  irlanda: ['irlanda', 'ireland', 'republic of ireland'],
  ireland: ['irlanda', 'ireland', 'republic of ireland'],
  irlanda_del_norte: ['irlanda del norte', 'northern ireland'],
  northern_ireland: ['irlanda del norte', 'northern ireland'],
  estados_unidos: ['estados unidos', 'usa', 'united states'],
  united_states: ['estados unidos', 'usa', 'united states'],
  brasil: ['brasil', 'brazil'],
  brazil: ['brasil', 'brazil'],
  marruecos: ['marruecos', 'morocco'],
  morocco: ['marruecos', 'morocco'],
  argelia: ['argelia', 'algeria'],
  algeria: ['argelia', 'algeria'],
  egipto: ['egipto', 'egypt'],
  egypt: ['egipto', 'egypt'],
  costa_de_marfil: ['costa de marfil', 'ivory coast', 'cote divoire'],
  sudafrica: ['sudafrica', 'south africa'],
  japon: ['japon', 'japan'],
  corea_del_sur: ['corea del sur', 'south korea'],
  atletico_madrid: ['atletico madrid', 'atletico de madrid', 'atletico'],
  athletic_club: ['athletic club', 'athletic bilbao', 'athletic'],
  real_madrid: ['real madrid'],
  fc_barcelona: ['fc barcelona', 'barcelona', 'barca'],
  psg: ['psg', 'paris saint germain', 'paris sg'],
  inter: ['inter', 'inter milan', 'internazionale'],
  ac_milan: ['ac milan', 'milan'],
  bayern: ['bayern', 'bayern munich', 'bayern munchen'],
};

const STOPWORDS = new Set([
  'fc',
  'cf',
  'cd',
  'ud',
  'sd',
  'rc',
  'ca',
  'sc',
  'ac',
  'club',
  'real',
  'atletico',
  'deportivo',
  'united',
  'city',
  'sporting',
  'san',
  'de',
  'la',
  'el',
  'del',
  'los',
]);

export function normalizeFootballToken(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function doFootballTeamNamesMatch(aRaw: string, bRaw: string): boolean {
  const a = normalizeFootballToken(aRaw);
  const b = normalizeFootballToken(bRaw);
  if (!a || !b) return false;
  if (a === b) return true;

  if (
    (a.includes(b) || b.includes(a)) &&
    !STOPWORDS.has(a) &&
    !STOPWORDS.has(b) &&
    Math.min(a.length, b.length) >= 4
  ) {
    return true;
  }

  const aUnderscore = a.replace(/\s+/g, '_');
  const bUnderscore = b.replace(/\s+/g, '_');
  const aAliases = TEAM_NORMALIZE_ALIASES[aUnderscore] || [a];
  const bAliases = TEAM_NORMALIZE_ALIASES[bUnderscore] || [b];
  for (const al of aAliases) {
    for (const bl of bAliases) {
      if (al === bl) return true;
      if (
        (al.includes(bl) || bl.includes(al)) &&
        !STOPWORDS.has(al) &&
        !STOPWORDS.has(bl) &&
        Math.min(al.length, bl.length) >= 4
      ) {
        return true;
      }
    }
  }

  const aTokens = a.split(' ').filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  const bTokens = b.split(' ').filter((w) => w.length >= 4 && !STOPWORDS.has(w));
  return aTokens.some((tok) => bTokens.includes(tok));
}

export function getMadridDateKey(dayOffset = 0): string {
  const d = new Date();
  d.setDate(d.getDate() + dayOffset);
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid' })
    .format(d)
    .replace(/-/g, '');
}

export async function fetchFotmobDayIndex(dateKeyInput?: string): Promise<FotmobMatchSummary[]> {
  const madridToday = getMadridDateKey(0);
  const dateKey =
    dateKeyInput && /^\d{8}$/.test(dateKeyInput) ? dateKeyInput : madridToday;
  const isToday = dateKey === madridToday;
  const ttlMs = isToday ? 20 * 1000 : 5 * 60 * 1000;

  const cached = fotmobDayCache.get(dateKey);
  if (cached && Date.now() - cached.ts < ttlMs) {
    return cached.matches;
  }

  try {
    const res = await fetch(`https://www.fotmob.com/api/data/matches?date=${dateKey}`, {
      headers: FOTMOB_HEADERS,
      signal: AbortSignal.timeout(5500),
    });
    if (!res.ok) return cached?.matches || [];
    const data = (await res.json()) as { leagues?: any[] };
    const leagues = Array.isArray(data?.leagues) ? data.leagues : [];

    const madridTimeFmt = new Intl.DateTimeFormat('es-ES', {
      timeZone: 'Europe/Madrid',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    });

    const out: FotmobMatchSummary[] = [];
    for (const lg of leagues) {
      const leagueId = Number(lg?.primaryId || lg?.id || 0);
      const leagueName = String(lg?.name || 'Fútbol').trim();
      const ccode = String(lg?.ccode || 'INT').toUpperCase();
      const flagIso = CCODE_TO_FLAG[ccode] || 'eu';
      const regionFlagUrl = `https://flagcdn.com/w40/${flagIso}.png`;

      const rawMatches = Array.isArray(lg?.matches) ? lg.matches : [];
      for (const m of rawMatches) {
        const fotmobId = String(m?.id || '').trim();
        if (!fotmobId) continue;

        const homeId = Number(m?.home?.id || 0);
        const awayId = Number(m?.away?.id || 0);
        const homeName = String(m?.home?.name || 'Local').trim();
        const awayName = String(m?.away?.name || 'Visitante').trim();

        const st = m?.status || {};
        const started = Boolean(st.started);
        const finished = Boolean(st.finished);
        const cancelled = Boolean(st.cancelled);
        const statusState: 'live' | 'upcoming' | 'finished' =
          finished || cancelled ? 'finished' : started ? 'live' : 'upcoming';

        const utcStr = String(st.utcTime || '');
        const kickoffDate = utcStr ? new Date(utcStr) : new Date(Number(m?.timeTS || Date.now()));
        const kickoffTime = Number.isNaN(kickoffDate.getTime())
          ? '20:45'
          : madridTimeFmt.format(kickoffDate);

        let statusLabel = '';
        if (statusState === 'live') {
          statusLabel = String(
            st?.liveTime?.short || st?.reason?.short || 'EN VIVO'
          ).trim();
        } else if (statusState === 'finished') {
          statusLabel = String(st?.reason?.short || 'FT').trim();
        }

        const homeScore =
          statusState === 'upcoming' ? '-' : String(m?.home?.score ?? '0');
        const awayScore =
          statusState === 'upcoming' ? '-' : String(m?.away?.score ?? '0');

        out.push({
          fotmobId,
          leagueId,
          leagueName,
          ccode,
          homeId,
          homeName,
          homeScore,
          homeRedCards: Number(m?.home?.redCards || 0),
          awayId,
          awayName,
          awayScore,
          awayRedCards: Number(m?.away?.redCards || 0),
          utcTime: utcStr,
          kickoffTime,
          kickoffMs: Number.isNaN(kickoffDate.getTime()) ? Date.now() : kickoffDate.getTime(),
          statusState,
          statusLabel,
          homeLogo: homeId
            ? `https://images.fotmob.com/image_resources/logo/teamlogo/${homeId}_small.png`
            : '',
          awayLogo: awayId
            ? `https://images.fotmob.com/image_resources/logo/teamlogo/${awayId}_small.png`
            : '',
          regionFlagUrl,
        });
      }
    }

    fotmobDayCache.set(dateKey, { matches: out, ts: Date.now() });
    return out;
  } catch {
    return cached?.matches || [];
  }
}

export function getRegionLabelFromCcode(ccode: string): string {
  return CCODE_TO_REGION[ccode.toUpperCase()] || 'Internacional';
}

export async function findMatchingFotmobFixture(params: {
  homeTeam?: string;
  awayTeam?: string;
  dateKey?: string;
}): Promise<FotmobMatchSummary | null> {
  const { homeTeam, awayTeam, dateKey } = params;
  if (!homeTeam || !awayTeam) return null;

  const candidateDates = Array.from(
    new Set(
      [dateKey, getMadridDateKey(0), getMadridDateKey(-1), getMadridDateKey(1)].filter(
        Boolean
      ) as string[]
    )
  );

  for (const dk of candidateDates) {
    const matches = await fetchFotmobDayIndex(dk);
    const direct = matches.find(
      (m) =>
        doFootballTeamNamesMatch(homeTeam, m.homeName) &&
        doFootballTeamNamesMatch(awayTeam, m.awayName)
    );
    if (direct) return direct;

    const swapped = matches.find(
      (m) =>
        doFootballTeamNamesMatch(homeTeam, m.awayName) &&
        doFootballTeamNamesMatch(awayTeam, m.homeName)
    );
    if (swapped) return swapped;
  }
  return null;
}

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

function parseFotmobPeriodStats(
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

function parseFotmobLineupTeam(
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

function parseFotmobEvents(
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

async function fetchFotmobLiveCommentary(
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

function parseEspnSummaryFallback(sj: any, eventId: string): {
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

  // Team Stats
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

  // Events
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

  // Real ESPN rosters only (never fake synthetic)
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

export async function fetchRealFootballMatchDetails(params: {
  eventId?: string;
  fotmobMatchId?: string;
  leagueSlug?: string;
  homeTeam?: string;
  awayTeam?: string;
  dateKey?: string;
}): Promise<FootballMatchDetails> {
  const cleanEventId = String(params.eventId || '').trim();
  const cleanLeagueSlug = String(params.leagueSlug || 'all').replace(/[^a-z0-9._-]/gi, '') || 'all';
  const requestedFotmobId = String(params.fotmobMatchId || '').replace(/\D/g, '');
  const numericEspnId = /^\d+$/.test(cleanEventId) ? cleanEventId : '';

  let fotmobId = requestedFotmobId;
  if (!fotmobId && params.homeTeam && params.awayTeam) {
    const matched = await findMatchingFotmobFixture({
      homeTeam: params.homeTeam,
      awayTeam: params.awayTeam,
      dateKey: params.dateKey,
    });
    if (matched) fotmobId = matched.fotmobId;
  }

  const cacheKey = `${fotmobId || cleanEventId || `${params.homeTeam}-${params.awayTeam}`}:${cleanLeagueSlug}`;
  const cached = fotmobDetailsCache.get(cacheKey);
  if (cached) {
    const ttl = cached.details.statusState === 'live' ? 15 * 1000 : 3 * 60 * 1000;
    if (Date.now() - cached.ts < ttl) {
      return cached.details;
    }
  }

  // Parallel live fetches: FotMob MatchDetails + FotMob Spanish Commentary + ESPN Summary (if ESPN ID)
  const [fotmobRaw, fotmobCommentary, espnRaw] = await Promise.all([
    fotmobId
      ? fetch(`https://www.fotmob.com/api/data/matchDetails?matchId=${fotmobId}`, {
          headers: FOTMOB_HEADERS,
          signal: AbortSignal.timeout(6000),
        })
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      : Promise.resolve(null),
    fotmobId ? fetchFotmobLiveCommentary(fotmobId) : Promise.resolve([]),
    numericEspnId && !cleanLeagueSlug.startsWith('live.') && !cleanLeagueSlug.startsWith('fotmob.')
      ? fetch(
          `https://site.api.espn.com/apis/site/v2/sports/soccer/${cleanLeagueSlug}/summary?event=${numericEspnId}&lang=es&region=es`,
          { signal: AbortSignal.timeout(4500) }
        )
          .then((r) => (r.ok ? r.json() : null))
          .catch(() => null)
      : Promise.resolve(null),
  ]);

  const espnParsed = espnRaw ? parseEspnSummaryFallback(espnRaw, numericEspnId) : null;

  if (fotmobRaw && (fotmobRaw.content || fotmobRaw.header)) {
    const header = fotmobRaw.header || {};
    const general = fotmobRaw.general || {};
    const content = fotmobRaw.content || {};
    const st = header.status || {};
    const teams: any[] = Array.isArray(header.teams) ? header.teams : [];
    const homeTeamObj = teams[0] || {};
    const awayTeamObj = teams[1] || {};
    const homeTeamId = Number(homeTeamObj.id || 0);
    const awayTeamId = Number(awayTeamObj.id || 0);
    const homeName = String(homeTeamObj.name || params.homeTeam || 'Local').trim();
    const awayName = String(awayTeamObj.name || params.awayTeam || 'Visitante').trim();

    const statusState: 'live' | 'upcoming' | 'finished' =
      st.finished || st.cancelled ? 'finished' : st.started ? 'live' : 'upcoming';
    const statusLabel =
      statusState === 'live'
        ? String(st?.liveTime?.long || st?.liveTime?.short || st?.reason?.short || 'EN VIVO').trim()
        : statusState === 'finished'
        ? String(st?.reason?.short || 'FT').trim()
        : '';

    const homeLineup = parseFotmobLineupTeam(
      content?.lineup?.homeTeam,
      espnParsed?.espnHeightsByName
    );
    const awayLineup = parseFotmobLineupTeam(
      content?.lineup?.awayTeam,
      espnParsed?.espnHeightsByName
    );

    const periods = content?.stats?.Periods || {};
    const allStats = parseFotmobPeriodStats(
      periods.All,
      homeLineup?.avgRating,
      awayLineup?.avgRating
    );
    const firstHalfStats = parseFotmobPeriodStats(periods.FirstHalf);
    const secondHalfStats = parseFotmobPeriodStats(periods.SecondHalf);

    const rawShots: any[] = Array.isArray(content?.shotmap?.shots)
      ? content.shotmap.shots
      : [];
    const shotsMap: FootballMatchShotItem[] = rawShots.map((sh, idx) => {
      const isHomeShot = homeTeamId ? Number(sh?.teamId) === homeTeamId : true;
      const rawX = Number(sh?.x || 50);
      const rawY = Number(sh?.y || 34);
      // Map pitch coordinates: Home attacks Right goal (x -> 0..100), Away attacks Left goal (mirrored)
      const normX = Math.max(2, Math.min(98, (rawX / 105) * 100));
      const normY = Math.max(4, Math.min(96, (rawY / 68) * 100));
      const x = isHomeShot ? normX : 100 - normX;
      const y = isHomeShot ? normY : 100 - normY;

      const onGoalRaw = sh?.onGoalShot;
      const onGoalShot =
        onGoalRaw &&
        typeof onGoalRaw.x === 'number' &&
        typeof onGoalRaw.y === 'number'
          ? { x: onGoalRaw.x, y: onGoalRaw.y }
          : null;

      return {
        id: String(sh?.id || `shot-${idx}`),
        x,
        y,
        onTarget: Boolean(sh?.isOnTarget),
        isGoal: String(sh?.eventType || '').toLowerCase() === 'goal',
        isBlocked: Boolean(sh?.isBlocked),
        home: isHomeShot,
        minute: `${sh?.min ?? 0}${sh?.minAdded ? `+${sh.minAdded}` : ''}'`,
        player: String(sh?.playerName || 'Jugador').trim(),
        xG: typeof sh?.expectedGoals === 'number' ? +sh.expectedGoals.toFixed(2) : undefined,
        shotType: sh?.shotType ? String(sh.shotType) : undefined,
        situation: sh?.situation ? String(sh.situation) : undefined,
        period: sh?.period ? String(sh.period) : undefined,
        onGoalShot,
      };
    });

    const events = parseFotmobEvents(
      content?.matchFacts?.events?.events || [],
      homeName,
      awayName
    );
    const infoBox = content?.matchFacts?.infoBox || {};
    const venue = String(
      infoBox?.Stadium?.name || espnParsed?.venue || ''
    ).trim() || undefined;
    const referee = String(infoBox?.Referee?.text || '').trim() || undefined;
    const attendance = infoBox?.Attendance ? String(infoBox.Attendance) : undefined;

    const rawMomentum: any[] = Array.isArray(content?.momentum?.main?.data)
      ? content.momentum.main.data
      : [];
    const momentum: FootballMomentumPoint[] = rawMomentum
      .filter((m) => typeof m?.minute === 'number' && typeof m?.value === 'number')
      .map((m) => ({ minute: m.minute, value: m.value }));

    const commentary =
      fotmobCommentary.length > 0
        ? fotmobCommentary
        : espnParsed?.commentary || [];

    const resolvedStats = allStats.length > 0 ? allStats : espnParsed?.stats || [];
    const resolvedHomeLineup =
      homeLineup && homeLineup.starters.length > 0 ? homeLineup : espnParsed?.homeLineup;
    const resolvedAwayLineup =
      awayLineup && awayLineup.starters.length > 0 ? awayLineup : espnParsed?.awayLineup;

    const details: FootballMatchDetails = {
      eventId: cleanEventId || fotmobId,
      fotmobMatchId: fotmobId,
      source: 'fotmob',
      venue,
      referee,
      attendance,
      tournamentName: general?.leagueName ? String(general.leagueName) : undefined,
      roundName: general?.leagueRoundName ? `Jornada ${general.leagueRoundName}` : undefined,
      statusState,
      statusLabel,
      homeTeam: homeName,
      awayTeam: awayName,
      homeShort: homeName.slice(0, 3).toUpperCase(),
      awayShort: awayName.slice(0, 3).toUpperCase(),
      homeLogo: homeTeamId
        ? `https://images.fotmob.com/image_resources/logo/teamlogo/${homeTeamId}_small.png`
        : undefined,
      awayLogo: awayTeamId
        ? `https://images.fotmob.com/image_resources/logo/teamlogo/${awayTeamId}_small.png`
        : undefined,
      homeScore: statusState === 'upcoming' ? '-' : String(homeTeamObj?.score ?? '0'),
      awayScore: statusState === 'upcoming' ? '-' : String(awayTeamObj?.score ?? '0'),
      homeColor: general?.teamColors?.darkMode?.home || '#22C55E',
      awayColor: general?.teamColors?.darkMode?.away || '#60A5FA',
      lineupsConfirmed: Boolean(
        resolvedHomeLineup && resolvedHomeLineup.starters.length >= 11
      ),
      stats: resolvedStats,
      statsByPeriod: {
        all: resolvedStats,
        firstHalf: firstHalfStats,
        secondHalf: secondHalfStats,
      },
      events: events.length > 0 ? events : espnParsed?.events || [],
      homeLineup: resolvedHomeLineup,
      awayLineup: resolvedAwayLineup,
      commentary,
      shotsMap,
      momentum: momentum.length > 0 ? momentum : undefined,
      updatedAt: Date.now(),
    };

    fotmobDetailsCache.set(cacheKey, { details, ts: Date.now() });
    return details;
  }

  // Fallback purely to real ESPN data if FotMob didn't return details for this fixture
  const fallbackDetails: FootballMatchDetails = {
    eventId: cleanEventId,
    fotmobMatchId: fotmobId || undefined,
    source: espnParsed ? 'espn' : 'none',
    venue: espnParsed?.venue,
    statusState: espnParsed?.statusState,
    statusLabel: espnParsed?.statusLabel,
    homeTeam: espnParsed?.homeTeam || params.homeTeam,
    awayTeam: espnParsed?.awayTeam || params.awayTeam,
    homeScore: espnParsed?.homeScore,
    awayScore: espnParsed?.awayScore,
    lineupsConfirmed: Boolean(
      espnParsed?.homeLineup && espnParsed.homeLineup.starters.length >= 11
    ),
    stats: espnParsed?.stats || [],
    statsByPeriod: {
      all: espnParsed?.stats || [],
      firstHalf: [],
      secondHalf: [],
    },
    events: espnParsed?.events || [],
    homeLineup: espnParsed?.homeLineup,
    awayLineup: espnParsed?.awayLineup,
    commentary: espnParsed?.commentary || [],
    shotsMap: [],
    updatedAt: Date.now(),
  };

  fotmobDetailsCache.set(cacheKey, { details: fallbackDetails, ts: Date.now() });
  return fallbackDetails;
}
