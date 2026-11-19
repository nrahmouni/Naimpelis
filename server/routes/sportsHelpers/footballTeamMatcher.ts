import { type TrackRecord } from '../../extractors/httpHelpers.ts';
import { getChineseFootballMatchTracks } from '../../extractors/chineseSports.ts';
import type { SoccerLeagueFeedDef } from './sportsChannels247.ts';

const COUNTRY_NAME_TO_ISO2: Record<string, string> = {
  espana: 'es', spain: 'es', francia: 'fr', france: 'fr', italia: 'it', italy: 'it',
  alemania: 'de', germany: 'de', inglaterra: 'gb-eng', england: 'gb-eng', escocia: 'gb-sct',
  gales: 'gb-wls', portugal: 'pt', croacia: 'hr', croatia: 'hr', republica_checa: 'cz',
  chequia: 'cz', czechia: 'cz', montenegro: 'me', letonia: 'lv', latvia: 'lv', albania: 'al',
  finlandia: 'fi', finland: 'fi', san_marino: 'sm', bielorrusia: 'by', belarus: 'by',
  paises_bajos: 'nl', holanda: 'nl', belgica: 'be', suiza: 'ch', austria: 'at', dinamarca: 'dk',
  suecia: 'se', noruega: 'no', polonia: 'pl', turquia: 'tr', grecia: 'gr', serbia: 'rs',
  rumania: 'ro', ucrania: 'ua', hungria: 'hu', irlanda: 'ie', islandia: 'is', eslovaquia: 'sk',
  eslovenia: 'si', georgia: 'ge', armenia: 'am', chipre: 'cy', rusia: 'ru', brasil: 'br',
  argentina: 'ar', uruguay: 'uy', colombia: 'co', chile: 'cl', paraguay: 'py', peru: 'pe',
  ecuador: 'ec', venezuela: 've', bolivia: 'bo', mexico: 'mx', estados_unidos: 'us', canada: 'ca',
  japon: 'jp', marruecos: 'ma', nigeria: 'ng', senegal: 'sn', egipto: 'eg', camerun: 'cm',
  ghana: 'gh', argelia: 'dz', tunez: 'tn',
};

export function normalizeTeamToken(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

export function resolveTeamBadgeUrl(teamObj: any, isInternational: boolean): string | undefined {
  const directLogo = String(teamObj?.logo || teamObj?.logos?.[0]?.href || '').trim();
  if (directLogo.startsWith('http')) {
    return directLogo;
  }
  if (isInternational) {
    const slug = normalizeTeamToken(teamObj?.displayName || teamObj?.shortDisplayName || '');
    const iso = COUNTRY_NAME_TO_ISO2[slug];
    if (iso) return `https://flagcdn.com/w40/${iso}.png`;
  }
  return undefined;
}

const BILINGUAL_TEAM_ALIASES: Record<string, string[]> = {
  espana: ['espana', 'spain'],
  francia: ['francia', 'france'],
  italia: ['italia', 'italy'],
  inglaterra: ['inglaterra', 'england'],
  alemania: ['alemania', 'germany'],
  paises_bajos: ['paises bajos', 'holanda', 'netherlands'],
  escocia: ['escocia', 'scotland'],
  gales: ['gales', 'wales'],
  suiza: ['suiza', 'switzerland'],
  suecia: ['suecia', 'sweden'],
  dinamarca: ['dinamarca', 'denmark'],
  noruega: ['noruega', 'norway'],
  polonia: ['polonia', 'poland'],
  turquia: ['turquia', 'turkey', 'turkiye'],
  grecia: ['grecia', 'greece'],
  hungria: ['hungria', 'hungary'],
  belgica: ['belgica', 'belgium'],
  croacia: ['croacia', 'croatia'],
  republica_checa: ['republica checa', 'chequia', 'czech', 'czechia'],
  letonia: ['letonia', 'latvia'],
  finlandia: ['finlandia', 'finland'],
  bielorrusia: ['bielorrusia', 'belarus'],
  eslovaquia: ['eslovaquia', 'slovakia'],
  eslovenia: ['eslovenia', 'slovenia'],
  islandia: ['islandia', 'iceland'],
  irlanda: ['irlanda', 'ireland'],
  ucrania: ['ucrania', 'ukraine'],
  rumania: ['rumania', 'romania'],
  rusia: ['rusia', 'russia'],
  chipre: ['chipre', 'cyprus'],
  estados_unidos: ['estados unidos', 'usa', 'united states'],
  brasil: ['brasil', 'brazil'],
  marruecos: ['marruecos', 'morocco'],
  argelia: ['argelia', 'algeria'],
  egipto: ['egipto', 'egypt'],
  tunez: ['tunez', 'tunisia'],
  camerun: ['camerun', 'cameroon'],
  costa_de_marfil: ['costa de marfil', 'ivory coast', 'cote divoire'],
  sudafrica: ['sudafrica', 'south africa'],
  japon: ['japon', 'japan'],
  corea_del_sur: ['corea del sur', 'south korea', 'korea'],
};

const GENERIC_TEAM_STOPWORDS = new Set([
  'fc', 'cf', 'sc', 'ac', 'cd', 'ud', 'sd', 'ca', 'rc', 'rcd', 'club', 'real', 'united', 'city',
  'sporting', 'atletico', 'deportivo', 'nacional', 'union', 'america', 'racing', 'independiente',
  'republica', 'san', 'santa', 'st', 'al', 'de', 'del', 'la', 'el', 'los', 'las', 'women',
  'femenino', 'fem', 'u21', 'u20', 'u19',
]);

export function doesSingleTeamMatchCandidate(
  boardTeamRaw: string,
  candidateSideRaw: string
): boolean {
  const boardSlug = normalizeTeamToken(boardTeamRaw);
  const candSpace = normalizeTeamToken(candidateSideRaw).replace(/_/g, ' ');
  const boardSpace = boardSlug.replace(/_/g, ' ');
  if (!boardSpace || !candSpace) return false;
  if (candSpace === boardSpace || candSpace.includes(boardSpace) || boardSpace.includes(candSpace)) {
    if (GENERIC_TEAM_STOPWORDS.has(candSpace) || GENERIC_TEAM_STOPWORDS.has(boardSpace)) {
      return candSpace === boardSpace;
    }
    return true;
  }

  const aliases = BILINGUAL_TEAM_ALIASES[boardSlug];
  if (aliases && aliases.some((al) => candSpace.includes(al) || al.includes(candSpace))) {
    return true;
  }

  const distinctiveTokens = boardSpace
    .split(' ')
    .filter((w) => w.length >= 4 && !GENERIC_TEAM_STOPWORDS.has(w));
  if (distinctiveTokens.length === 0) return false;
  return distinctiveTokens.some((tok) => {
    const aliasList = BILINGUAL_TEAM_ALIASES[tok] || [tok];
    return aliasList.some((al) => candSpace.includes(al));
  });
}

export function doesScrapedEventMatchFixture(
  homeTeam: string,
  awayTeam: string,
  scrapedEvent: { title?: string; homeTeam?: string; awayTeam?: string }
): boolean {
  if (scrapedEvent.homeTeam && scrapedEvent.awayTeam) {
    return (
      (doesSingleTeamMatchCandidate(homeTeam, scrapedEvent.homeTeam) &&
        doesSingleTeamMatchCandidate(awayTeam, scrapedEvent.awayTeam)) ||
      (doesSingleTeamMatchCandidate(homeTeam, scrapedEvent.awayTeam) &&
        doesSingleTeamMatchCandidate(awayTeam, scrapedEvent.homeTeam))
    );
  }

  const rawTitle = String(scrapedEvent.title || '');
  const parts = rawTitle.split(/\s+(?:vs\.?|v\.?|-|contra)\s+/i);
  if (parts.length >= 2) {
    const sideA = parts[0].trim();
    const sideB = parts.slice(1).join(' ').trim();
    return (
      (doesSingleTeamMatchCandidate(homeTeam, sideA) &&
        doesSingleTeamMatchCandidate(awayTeam, sideB)) ||
      (doesSingleTeamMatchCandidate(homeTeam, sideB) &&
        doesSingleTeamMatchCandidate(awayTeam, sideA))
    );
  }
  return false;
}

export function buildFootballMatchChannels(params: {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  statusState: 'live' | 'upcoming' | 'finished';
  league: SoccerLeagueFeedDef;
  scrapedMatches: any[];
}): TrackRecord[] {
  const { matchId, homeTeam, awayTeam, statusState, league, scrapedMatches } = params;
  if (statusState === 'finished') return [];

  const channels: TrackRecord[] = [];
  const seenUrls = new Set<string>();

  const pushTrack = (track: TrackRecord) => {
    if (!track.sourceUrl || seenUrls.has(track.sourceUrl)) return;
    seenUrls.add(track.sourceUrl);
    channels.push(track);
  };

  for (const sm of scrapedMatches) {
    if (sm.is247Channel) continue;
    if (doesScrapedEventMatchFixture(homeTeam, awayTeam, sm)) {
      for (const ch of sm.channels || []) {
        pushTrack({
          id: `${matchId}-live-${channels.length + 1}`,
          label: ch.label || `Señal Directo ${channels.length + 1}`,
          lang: ch.lang || 'ES',
          quality: ch.quality || 'HD',
          sourceUrl: ch.sourceUrl,
          resolverType: ch.resolverType || 'sports_channel',
        });
      }
    }
  }

  const homeNorm = normalizeTeamToken(homeTeam);
  const awayNorm = normalizeTeamToken(awayTeam);
  const isSpainNationalMatch =
    (homeNorm === 'espana' || homeNorm === 'spain' || awayNorm === 'espana' || awayNorm === 'spain') &&
    (league.slug.startsWith('uefa.nations') ||
      league.slug.startsWith('uefa.euro') ||
      league.slug.startsWith('fifa.'));

  if (isSpainNationalMatch) {
    pushTrack({
      id: `${matchId}-la1`,
      label: 'La 1 RTVE HD',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/la1/la1_main.m3u8',
      resolverType: 'tdt_hls',
    });
  }

  for (const zhTrack of getChineseFootballMatchTracks(league.slug, matchId)) {
    pushTrack(zhTrack);
  }

  return channels.slice(0, 10);
}
