import { type TrackRecord } from '../../extractors/httpHelpers.ts';
import { getChineseFootballMatchTracks } from '../../extractors/chineseSports.ts';
import { findEpgVerifiedBroadcasterForFixture } from '../../services/epgService.ts';
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
  vienna: ['vienna', 'austria wien', 'viena', 'fkv'],
  viena: ['vienna', 'austria wien', 'viena'],
  austria_wien: ['austria wien', 'vienna', 'viena', 'austria vienna'],
  austria_vienna: ['austria wien', 'vienna', 'viena', 'austria vienna'],
  koge: ['koge', 'hb koge', 'hb koege', 'koge kvinder'],
  hb_koge: ['hb koge', 'koge', 'hb koege', 'koge kvinder'],
  paris_fc: ['paris fc', 'paris', 'pfc'],
  lyon: ['lyon', 'olympique lyonnais', 'ol lyon'],
  servette: ['servette', 'servette chenois'],
  bayern: ['bayern', 'bayern munich', 'bayern munchen'],
  bayern_munich: ['bayern', 'bayern munich', 'bayern munchen'],
  bayern_munchen: ['bayern', 'bayern munich', 'bayern munchen'],
  celta: ['celta', 'celta de vigo', 'celta vigo'],
  celta_vigo: ['celta', 'celta de vigo', 'celta vigo'],
  osasuna: ['osasuna', 'ca osasuna'],
  betis: ['betis', 'real betis'],
  sevilla: ['sevilla', 'sevilla fc'],
  valencia: ['valencia', 'valencia cf'],
  espanyol: ['espanyol', 'rcd espanyol'],
  mallorca: ['mallorca', 'rcd mallorca'],
};

const GENERIC_TEAM_STOPWORDS = new Set([
  'fc', 'cf', 'sc', 'ac', 'cd', 'ud', 'sd', 'ca', 'rc', 'rcd', 'club', 'real', 'united', 'city',
  'sporting', 'atletico', 'deportivo', 'nacional', 'union', 'america', 'racing', 'independiente',
  'republica', 'san', 'santa', 'st', 'al', 'de', 'del', 'la', 'el', 'los', 'las', 'les', 'the',
  'women', 'w', 'femenino', 'femenina', 'fem', 'feminines', 'kvinder', 'damen', 'frauen', 'damer',
  'u21', 'u20', 'u19',
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

export function isFeaturedSpanishClubMatch(homeTeam: string, awayTeam: string): boolean {
  const hay = `${normalizeTeamToken(homeTeam)}_${normalizeTeamToken(awayTeam)}`;
  return /(^|_)(barcelona|fc_barcelona|barca|real_madrid)($|_)/.test(hay);
}

export function sortTracksWithDaznPriority<T extends { label?: string; lang?: string }>(
  tracks: T[],
  leagueSlug?: string
): T[] {
  const slugLower = String(leagueSlug || '').toLowerCase();
  const isLaLiga = slugLower === 'esp.1';
  return tracks
    .map((tr, idx) => {
      const lbl = String(tr.label || '').toLowerCase();
      const isDaznLaLiga = /\bdazn\b.*laliga/.test(lbl);
      const isDazn = /\bdazn\b/.test(lbl);
      const isMovistar = /\bmovistar\b|\bm\+/.test(lbl);
      const tier = isLaLiga
        ? isDaznLaLiga
          ? 0
          : isDazn
            ? 1
            : isMovistar
              ? 2
              : tr.lang === 'ES'
                ? 3
                : 4
        : isDazn
          ? 0
          : isMovistar
            ? 1
            : tr.lang === 'ES'
              ? 2
              : 3;
      return { tr, tier, idx };
    })
    .sort((a, b) => a.tier - b.tier || a.idx - b.idx)
    .map((x) => x.tr);
}

export function resolveMatchSpanishBroadcaster(
  leagueSlug: string,
  groupTitle?: string
): { name: string; brand: 'movistar' | 'dazn' | 'dazn_mplus' | 'rtve'; badgeColor: string } | null {
  const slug = String(leagueSlug || '').toLowerCase();
  const title = String(groupTitle || '').toLowerCase();

  const isWomen =
    slug.includes('wchampions') ||
    slug.includes('femenin') ||
    title.includes('femenin') ||
    title.includes('women') ||
    title.includes('damen') ||
    title.includes('frauen');

  if (isWomen) {
    return null;
  }

  if (
    slug === 'esp.1' ||
    title.includes('laliga ea sports') ||
    title.includes('primera división') ||
    (title.includes('laliga') && !title.includes('hypermotion') && !title.includes('2'))
  ) {
    return { name: 'DAZN · Movistar', brand: 'dazn', badgeColor: '#F59E0B' };
  }
  if (slug === 'uefa.champions' || title.includes('champions league') || title.includes('liga de campeones')) {
    return { name: 'DAZN · M+ Campeones', brand: 'dazn', badgeColor: '#F59E0B' };
  }
  if (slug === 'eng.1' || title.includes('premier league')) {
    return { name: 'DAZN España', brand: 'dazn', badgeColor: '#F59E0B' };
  }
  if (slug.startsWith('uefa.nations') || title.includes('nations league') || title.includes('liga de naciones')) {
    return { name: 'DAZN · RTVE', brand: 'dazn', badgeColor: '#F59E0B' };
  }
  if (slug === 'uefa.europa' || slug === 'uefa.europa.conf' || title.includes('europa league')) {
    return { name: 'M+ Campeones', brand: 'movistar', badgeColor: '#16A34A' };
  }
  if (slug === 'esp.2' || title.includes('hypermotion') || title.includes('segunda')) {
    return { name: 'LaLiga Hypermotion', brand: 'movistar', badgeColor: '#0284C7' };
  }
  if (slug === 'esp.copa_del_rey' || title.includes('copa del rey')) {
    return { name: 'Movistar+ · La 1', brand: 'movistar', badgeColor: '#2563EB' };
  }
  if (slug.startsWith('fifa.') || title.includes('selección')) {
    return { name: 'DAZN · La 1 RTVE', brand: 'dazn', badgeColor: '#F59E0B' };
  }
  return null;
}

export function sanitizeScrapedChannelLabel(rawLabel?: string, idx = 1): string {
  const lbl = String(rawLabel || '').trim();
  if (
    !lbl ||
    /^(disney\s*\+?|star\s*\+?|vix\s*\+?|paramount\s*\+?|hbo\s*max|peacock|flow|directv\s*go)$/i.test(lbl)
  ) {
    return `Señal Directo ${idx} (HD)`;
  }
  return lbl
    .replace(/\b(disney\s*\+|star\s*\+|vix\s*\+|paramount\s*\+|peacock)\b/gi, 'Directo')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildFootballMatchChannels(params: {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  statusState: 'live' | 'upcoming' | 'finished';
  league: SoccerLeagueFeedDef;
  scrapedMatches: any[];
  kickoffMs?: number;
}): TrackRecord[] {
  const { matchId, homeTeam, awayTeam, statusState, league, scrapedMatches, kickoffMs } = params;
  if (statusState === 'finished') return [];

  const channels: TrackRecord[] = [];
  const seenUrls = new Set<string>();

  const pushTrack = (track: TrackRecord) => {
    if (!track.sourceUrl || seenUrls.has(track.sourceUrl)) return;
    seenUrls.add(track.sourceUrl);
    channels.push(track);
  };

  // 1. HIGHEST ACCURACY: REAL PROGRAMMING VERIFICATION IN SPANISH XMLTV EPG
  const targetKickoff = kickoffMs && kickoffMs > 0 ? kickoffMs : Date.now();
  const epgMatch = findEpgVerifiedBroadcasterForFixture(homeTeam, awayTeam, targetKickoff);
  if (epgMatch) {
    pushTrack({
      id: `${matchId}-epg-${epgMatch.channelId}`,
      label: `${epgMatch.channelLabel} (Oficial · Guía TV)`,
      lang: 'ES',
      quality: '1080p',
      sourceUrl: epgMatch.sourceUrl,
      resolverType: epgMatch.resolverType,
    });
  }

  const homeNorm = normalizeTeamToken(homeTeam);
  const awayNorm = normalizeTeamToken(awayTeam);
  const isSpainNationalMatch =
    (homeNorm === 'espana' || homeNorm === 'spain' || awayNorm === 'espana' || awayNorm === 'spain') &&
    (league.slug.startsWith('uefa.nations') ||
      league.slug.startsWith('uefa.euro') ||
      league.slug.startsWith('fifa.'));

  const slugLower = String(league.slug || '').toLowerCase();
  const nameLower = String(league.leagueName || '').toLowerCase();

  const isWomenCompetition =
    slugLower.includes('wchampions') ||
    slugLower.includes('femenin') ||
    nameLower.includes('femenin') ||
    nameLower.includes('women') ||
    nameLower.includes('frauen') ||
    nameLower.includes('damen');

  const isLaLiga =
    slugLower === 'esp.1' ||
    nameLower.includes('laliga ea') ||
    (nameLower.includes('laliga') && !nameLower.includes('hypermotion') && !nameLower.includes('2'));
  const isChampions =
    !isWomenCompetition &&
    (slugLower === 'uefa.champions' ||
      nameLower.includes('champions league') ||
      nameLower.includes('liga de campeones'));
  const isNations =
    slugLower.startsWith('uefa.nations') ||
    nameLower.includes('nations league') ||
    nameLower.includes('liga de naciones');
  const isPremier = slugLower === 'eng.1' || nameLower.includes('premier league');

  const nowMs = Date.now();
  const isMatchLiveOrImminent =
    statusState === 'live' ||
    (targetKickoff >= nowMs - 2 * 60 * 60 * 1000 && targetKickoff <= nowMs + 4 * 60 * 60 * 1000);

  // 2. LIVE SCRAPED FEEDS FROM MATCH AGENDA (Direct feeds for this fixture)
  let feedCounter = 1;
  for (const sm of scrapedMatches) {
    if (sm.is247Channel) continue;
    if (doesScrapedEventMatchFixture(homeTeam, awayTeam, sm)) {
      for (const ch of sm.channels || []) {
        const cleanedLabel = sanitizeScrapedChannelLabel(ch.label, feedCounter++);
        pushTrack({
          id: `${matchId}-live-${channels.length + 1}`,
          label: cleanedLabel,
          lang: ch.lang || 'ES',
          quality: ch.quality || '1080p',
          sourceUrl: ch.sourceUrl,
          resolverType: ch.resolverType || 'sports_channel',
        });
      }
    }
  }

  // 3. SPANISH PRIMARY COMPETITION FEEDS (Only if match is live or starting today)
  if (isMatchLiveOrImminent) {
    if (isLaLiga) {
      // LaLiga EA Sports: DAZN LaLiga (Sat 84 + DAZN 1 445 + StreamXHD live1/live2 backups)
      pushTrack({
        id: `${matchId}-es-daznll`,
        label: 'DAZN LaLiga HD (Español)',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/84',
        resolverType: 'sports_channel',
      });
      pushTrack({
        id: `${matchId}-es-dazn1`,
        label: 'DAZN 1 HD (Español)',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/445',
        resolverType: 'sports_channel',
      });
      pushTrack({
        id: `${matchId}-es-daznll-sxhd`,
        label: 'DAZN LaLiga Señal 2 HD (Español)',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://streamxhd.sbs/live1.php?stream=daznlaliga',
        resolverType: 'sports_channel',
      });
      pushTrack({
        id: `${matchId}-es-mplus`,
        label: 'Movistar Plus+ HD (Partidazo)',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/435',
        resolverType: 'sports_channel',
      });
    } else if (isChampions) {
      // UEFA Champions League (Men's only)
      pushTrack({
        id: `${matchId}-es-dazn1`,
        label: 'DAZN 1 HD · Champions (Español)',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://pig.footunder.online/stream/445',
        resolverType: 'sports_channel',
      });
      pushTrack({
        id: `${matchId}-es-mucl-sxhd`,
        label: 'M+ Liga de Campeones HD (Español)',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://streamxhd.sbs/live1.php?stream=mligacampeones',
        resolverType: 'sports_channel',
      });
      pushTrack({
        id: `${matchId}-es-mucl-sxhd2`,
        label: 'M+ Campeones Señal 2 HD (Español)',
        lang: 'ES',
        quality: '1080p',
        sourceUrl: 'https://streamxhd.sbs/live2.php?stream=mligacampeones',
        resolverType: 'sports_channel',
      });
    }
    pushTrack({
      id: `${matchId}-es-mucl1`,
      label: 'M+ Campeones Señal 3 HD (Español)',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://pig.footunder.online/stream/435',
      resolverType: 'sports_channel',
    });
  } else if (isNations) {
    // Nations League: DAZN 1 & DAZN 2 + La 1 RTVE
    pushTrack({
      id: `${matchId}-es-dazn`,
      label: 'DAZN 1 HD · Nations League (Español)',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://pig.footunder.online/stream/445',
      resolverType: 'sports_channel',
    });
    pushTrack({
      id: `${matchId}-es-dazn2`,
      label: 'DAZN 2 HD · Nations League (Español)',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://pig.footunder.online/stream/446',
      resolverType: 'sports_channel',
    });
    pushTrack({
      id: `${matchId}-es-la1`,
      label: 'La 1 RTVE 1080p (Oficial España)',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/la1/la1_main.m3u8',
      resolverType: 'tdt_hls',
    });
  } else if (slugLower === 'uefa.europa' || slugLower === 'uefa.europa.conf') {
    // UEFA Europa & Conference League: M+ Campeones
    pushTrack({
      id: `${matchId}-es-mucl`,
      label: 'M+ Liga de Campeones HD (Español)',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://pig.footunder.online/stream/435',
      resolverType: 'sports_channel',
    });
    pushTrack({
      id: `${matchId}-es-mucl-ev`,
      label: 'M+ Campeones Señal 2 HD',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://footunder.online/tvtodo/mligacampeones.php',
      resolverType: 'sports_channel',
    });
  } else if (slugLower === 'esp.2') {
    // LaLiga Hypermotion: Hypermotion TV + Vamos
    pushTrack({
      id: `${matchId}-es-mhyper`,
      label: 'LaLiga TV Hypermotion HD (Español)',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://footunder.online/tvtodo/laliga2.php',
      resolverType: 'sports_channel',
    });
    pushTrack({
      id: `${matchId}-es-mhyper2`,
      label: 'LaLiga Hypermotion Señal 2 HD',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://pig.footunder.online/stream/522',
      resolverType: 'sports_channel',
    });
    pushTrack({
      id: `${matchId}-es-mvamos`,
      label: 'Movistar Vamos HD',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://pig.footunder.online/stream/526',
      resolverType: 'sports_channel',
    });
  } else if (isPremier) {
    // Premier League: DAZN 1, DAZN 2 & DAZN 3 España
    pushTrack({
      id: `${matchId}-es-dazn1`,
      label: 'DAZN 1 HD · Premier League (Español)',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://pig.footunder.online/stream/445',
      resolverType: 'sports_channel',
    });
    pushTrack({
      id: `${matchId}-es-dazn2`,
      label: 'DAZN 2 HD · Premier League (Español)',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://pig.footunder.online/stream/446',
      resolverType: 'sports_channel',
    });
    pushTrack({
      id: `${matchId}-es-dazn3`,
      label: 'DAZN 3 HD · Premier League (Español)',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://pig.footunder.online/stream/447',
      resolverType: 'sports_channel',
    });
  } else if (slugLower === 'esp.copa_del_rey') {
    // Copa del Rey: Movistar Plus+ + RTVE La 1
    pushTrack({
      id: `${matchId}-es-mplus`,
      label: 'Movistar Plus+ HD (Español)',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://pig.footunder.online/stream/84',
      resolverType: 'sports_channel',
    });
    pushTrack({
      id: `${matchId}-es-la1`,
      label: 'La 1 RTVE 1080p (Español)',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/la1/la1_main.m3u8',
      resolverType: 'tdt_hls',
    });
  }

  if (isSpainNationalMatch) {
    pushTrack({
      id: `${matchId}-la1`,
      label: 'La 1 RTVE 1080p (Oficial España)',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/la1/la1_main.m3u8',
      resolverType: 'tdt_hls',
    });
    pushTrack({
      id: `${matchId}-tdp`,
      label: 'Teledeporte RTVE HD (Oficial)',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/tdp/tdp_main.m3u8',
      resolverType: 'tdt_hls',
    });
  }

  // 2. LIVE SCRAPED FEEDS FROM AGENDA
  for (const sm of scrapedMatches) {
    if (sm.is247Channel) continue;
    if (doesScrapedEventMatchFixture(homeTeam, awayTeam, sm)) {
      for (const ch of sm.channels || []) {
        pushTrack({
          id: `${matchId}-live-${channels.length + 1}`,
          label: ch.label || `Señal Directo ${channels.length + 1}`,
          lang: ch.lang || 'ES',
          quality: ch.quality || '1080p',
          sourceUrl: ch.sourceUrl,
          resolverType: ch.resolverType || 'sports_channel',
        });
      }
    }
  }

  // 3. CHINESE ALTERNATIVE TRACKS (ZH)
  for (const zhTrack of getChineseFootballMatchTracks(league.slug, matchId)) {
    pushTrack(zhTrack);
  }

  return sortTracksWithDaznPriority(channels, league.slug).slice(0, 10);
}
