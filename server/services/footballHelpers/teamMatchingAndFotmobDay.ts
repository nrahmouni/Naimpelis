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

export const FOTMOB_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
  Accept: 'application/json, text/plain, */*',
  'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
  Referer: 'https://www.fotmob.com/',
};

const fotmobDayCache = new Map<string, { matches: FotmobMatchSummary[]; ts: number }>();

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
  real_madrid: ['real madrid', 'madrid'],
  fc_barcelona: ['fc barcelona', 'barcelona', 'barca'],
  psg: ['psg', 'paris saint germain', 'paris sg'],
  inter: ['inter', 'inter milan', 'internazionale'],
  ac_milan: ['ac milan', 'milan'],
  bayern: ['bayern', 'bayern munich', 'bayern munchen'],
  bayern_munich: ['bayern', 'bayern munich', 'bayern munchen'],
  bayern_munchen: ['bayern', 'bayern munich', 'bayern munchen'],
  vienna: ['vienna', 'austria wien', 'viena', 'fkv'],
  viena: ['vienna', 'austria wien', 'viena'],
  austria_wien: ['austria wien', 'vienna', 'viena', 'austria vienna'],
  austria_vienna: ['austria wien', 'vienna', 'viena', 'austria vienna'],
  koge: ['koge', 'hb koge', 'hb koege', 'koge kvinder'],
  hb_koge: ['hb koge', 'koge', 'hb koege', 'koge kvinder'],
  paris_fc: ['paris fc', 'paris', 'pfc'],
  lyon: ['lyon', 'olympique lyonnais', 'ol lyon'],
  servette: ['servette', 'servette chenois'],
  celta: ['celta', 'celta de vigo', 'celta vigo'],
  celta_vigo: ['celta', 'celta de vigo', 'celta vigo'],
  osasuna: ['osasuna', 'ca osasuna'],
  betis: ['betis', 'real betis'],
  sevilla: ['sevilla', 'sevilla fc'],
  valencia: ['valencia', 'valencia cf'],
  espanyol: ['espanyol', 'rcd espanyol'],
  mallorca: ['mallorca', 'rcd mallorca'],
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
  'las',
  'les',
  'the',
  'w',
  'women',
  'fem',
  'femenino',
  'femenina',
  'feminines',
  'kvinder',
  'damen',
  'frauen',
  'damer',
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
          const raw = String(st?.liveTime?.short || st?.reason?.short || 'EN VIVO').trim();
          if (/^(ht|half-time|half time|half_time|descanso)$/i.test(raw)) {
            statusLabel = 'Descanso';
          } else {
            statusLabel = raw;
          }
        } else if (statusState === 'finished') {
          const raw = String(st?.reason?.short || 'FT').trim();
          statusLabel = /^(ft|full-time|full time|finished)$/i.test(raw) ? 'Final' : raw;
        } else {
          statusLabel = 'Por empezar';
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
