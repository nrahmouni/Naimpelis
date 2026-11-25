import { type TrackRecord } from '../../extractors/httpHelpers.ts';
import { findEpgVerifiedBroadcastersForFixture } from '../../services/epgService.ts';
import { areTeamCategoriesCompatible } from '../../services/footballHelpers/teamMatchingAndFotmobDay.ts';
import type { VerifiedMatchTvSchedule } from '../../services/tvScheduleVerifier.ts';
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
  man_utd: ['manchester united', 'manchester utd', 'man utd'],
  manchester_utd: ['manchester united', 'manchester utd', 'man utd'],
  manchester_united: ['manchester united', 'manchester utd', 'man utd'],
  man_city: ['manchester city', 'man city'],
  manchester_city: ['manchester city', 'man city'],
  spurs: ['tottenham', 'tottenham hotspur', 'spurs'],
  tottenham: ['tottenham', 'tottenham hotspur', 'spurs'],
  tottenham_hotspur: ['tottenham', 'tottenham hotspur', 'spurs'],
  nottm_forest: ['nottingham forest', 'nottm forest', 'forest'],
  nottingham_forest: ['nottingham forest', 'nottm forest'],
  wolves: ['wolverhampton', 'wolverhampton wanderers', 'wolves'],
  wolverhampton: ['wolverhampton', 'wolverhampton wanderers', 'wolves'],
  wolverhampton_wanderers: ['wolverhampton', 'wolverhampton wanderers', 'wolves'],
  brighton: ['brighton', 'brighton and hove albion', 'brighton hove'],
  newcastle: ['newcastle', 'newcastle united'],
  newcastle_united: ['newcastle', 'newcastle united'],
  west_ham: ['west ham', 'west ham united'],
  aston_villa: ['aston villa'],
  crystal_palace: ['crystal palace'],
  leeds: ['leeds', 'leeds united'],
  r_sociedad: ['real sociedad', 'r sociedad'],
  real_sociedad: ['real sociedad', 'r sociedad'],
  r_oviedo: ['real oviedo', 'oviedo'],
  real_oviedo: ['real oviedo', 'oviedo'],
  deportivo: ['deportivo', 'deportivo la coruna', 'deportivo a coruna'],
  alaves: ['alaves', 'deportivo alaves'],
  deportivo_alaves: ['alaves', 'deportivo alaves'],
  atletico: ['atletico madrid', 'atletico de madrid', 'atletico', 'at madrid'],
  atl_madrid: ['atletico madrid', 'atletico de madrid', 'atletico'],
  atletico_madrid: ['atletico madrid', 'atletico de madrid', 'atletico'],
  athletic: ['athletic club', 'athletic bilbao', 'athletic'],
  athletic_club: ['athletic club', 'athletic bilbao', 'athletic'],
  ath_bilbao: ['athletic club', 'athletic bilbao', 'athletic'],
  rayo: ['rayo vallecano', 'rayo'],
  rayo_vallecano: ['rayo vallecano', 'rayo'],
  psg: ['paris saint germain', 'paris st germain', 'psg'],
  paris_saint_germain: ['paris saint germain', 'paris st germain', 'psg'],
  inter: ['inter', 'inter milan', 'internazionale'],
  inter_milan: ['inter', 'inter milan', 'internazionale'],
  milan: ['milan', 'ac milan'],
  ac_milan: ['milan', 'ac milan'],
  frankfurt: ['eintracht frankfurt', 'frankfurt'],
  eintracht_frankfurt: ['eintracht frankfurt', 'frankfurt'],
  stuttgart: ['vfb stuttgart', 'stuttgart'],
  vfb_stuttgart: ['vfb stuttgart', 'stuttgart'],
  sporting: ['sporting cp', 'sporting lisbon', 'sporting'],
  sporting_cp: ['sporting cp', 'sporting lisbon', 'sporting'],
};

const GENERIC_TEAM_STOPWORDS = new Set([
  'fc', 'cf', 'sc', 'ac', 'cd', 'ud', 'sd', 'ca', 'rc', 'rcd', 'club', 'real', 'united', 'city',
  'sporting', 'atletico', 'deportivo', 'nacional', 'union', 'america', 'racing', 'independiente',
  'republica', 'san', 'santa', 'st', 'al', 'de', 'del', 'la', 'el', 'del', 'los', 'las', 'les', 'the',
  'women', 'w', 'femenino', 'femenina', 'fem', 'feminines', 'kvinder', 'damen', 'frauen', 'damer',
  'u21', 'u20', 'u19',
]);

export function doesSingleTeamMatchCandidate(
  boardTeamRaw: string,
  candidateSideRaw: string
): boolean {
  if (!areTeamCategoriesCompatible(boardTeamRaw, candidateSideRaw)) return false;

  const boardSlug = normalizeTeamToken(boardTeamRaw);
  const candSlug = normalizeTeamToken(candidateSideRaw);
  const candSpace = candSlug.replace(/_/g, ' ');
  const boardSpace = boardSlug.replace(/_/g, ' ');
  if (!boardSpace || !candSpace) return false;
  if (candSpace === boardSpace) {
    return true;
  }

  const boardAliases = BILINGUAL_TEAM_ALIASES[boardSlug];
  if (boardAliases && boardAliases.some((al) => candSpace === al || candSpace.includes(al) || al.includes(candSpace))) {
    return true;
  }
  const candAliases = BILINGUAL_TEAM_ALIASES[candSlug];
  if (candAliases && candAliases.some((al) => boardSpace === al || boardSpace.includes(al) || al.includes(boardSpace))) {
    return true;
  }

  if (
    (candSpace.includes(boardSpace) || boardSpace.includes(candSpace)) &&
    !GENERIC_TEAM_STOPWORDS.has(candSpace) &&
    !GENERIC_TEAM_STOPWORDS.has(boardSpace)
  ) {
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
  scrapedEvent: { title?: string; homeTeam?: string; awayTeam?: string; competition?: string; leagueName?: string }
): boolean {
  const scrapedCtx = `${scrapedEvent.competition || ''} ${scrapedEvent.leagueName || ''} ${scrapedEvent.title || ''} ${scrapedEvent.homeTeam || ''} ${scrapedEvent.awayTeam || ''}`;
  if (!areTeamCategoriesCompatible(`${homeTeam} ${awayTeam}`, scrapedCtx)) {
    return false;
  }
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

export type PreferredSportsTrackLang = 'ES' | 'EN' | 'ZH';

export function resolvePreferredSportsTrackLang(appLang?: string): PreferredSportsTrackLang {
  const clean = String(appLang || 'es').toLowerCase().trim();
  if (clean === 'en' || clean.startsWith('en-')) return 'EN';
  if (clean === 'zh' || clean.startsWith('zh-')) return 'ZH';
  return 'ES'; // es, ca, rif -> Spanish broadcasters recommended
}

export function isSpainNationalTeam(homeTeam: string, awayTeam: string): boolean {
  const h = normalizeTeamToken(homeTeam);
  const a = normalizeTeamToken(awayTeam);
  return /(^|_)(espana|spain|seleccion_espanola|la_roja)($|_)/.test(`${h}__${a}`);
}

export function isFeaturedSpanishClubMatch(homeTeam: string, awayTeam: string): boolean {
  const hay = `${normalizeTeamToken(homeTeam)}_${normalizeTeamToken(awayTeam)}`;
  return (
    /(^|_)(barcelona|fc_barcelona|barca|real_madrid)($|_)/.test(hay) ||
    isSpainNationalTeam(homeTeam, awayTeam)
  );
}

export function sortTracksWithDaznPriority<
  T extends { label?: string; lang?: string; sourceUrl?: string }
>(
  tracks: T[],
  leagueSlug?: string,
  preferredLang: PreferredSportsTrackLang = 'ES'
): T[] {
  const slugLower = String(leagueSlug || '').toLowerCase();
  const isLaLiga = slugLower === 'esp.1';
  const isPremier = slugLower === 'eng.1';

  return tracks
    .map((tr, idx) => {
      const lbl = String(tr.label || '').toLowerCase();
      const url = String(tr.sourceUrl || '').toLowerCase();
      const trLang = String(tr.lang || '').toUpperCase();
      const isZh = trLang === 'ZH' || /中文|cctv|风云|广东|btv/.test(lbl);
      const isEn =
        trLang === 'EN' ||
        /\(uk\)|\buk\b|sky sports|talksport|cbs sports|fifa\+|eurosport.*uk/i.test(lbl);
      const isDaznLaLiga = /\bdazn\b.*laliga/.test(lbl);
      const isDazn = /\bdazn\b/.test(lbl);
      const isMovistar = /\bmovistar\b|\bm\+/.test(lbl);
      const isRtve = /\bla 1\b|\bteledeporte\b|\brtve\b/.test(lbl);
      const isEs = trLang === 'ES' || (!isZh && !isEn);

      let tier = 5;
      if (preferredLang === 'EN') {
        const isSkyPl = /sky sports premier league/.test(lbl);
        const isSky = /sky sports/.test(lbl);
        if (isEn) {
          if (isPremier && isSkyPl) tier = 0;
          else if (isSky) tier = 1;
          else tier = 2;
        } else if (isEs) {
          tier = 3;
        } else {
          tier = 4;
        }
      } else if (preferredLang === 'ZH') {
        if (isZh) {
          tier = /cctv|风云/.test(lbl) ? 0 : 1;
        } else if (isEs) {
          tier = 2;
        } else if (isEn) {
          tier = 3;
        } else {
          tier = 4;
        }
      } else {
        // Preferred ES (used for es, ca, rif)
        if (isLaLiga) {
          tier = isDaznLaLiga ? 0 : isDazn ? 1 : isMovistar ? 2 : isEs ? 3 : isEn ? 4 : 5;
        } else if (slugLower.startsWith('uefa.nations') || slugLower.startsWith('fifa.') || slugLower.startsWith('uefa.euro')) {
          tier = isRtve ? 0 : isDazn ? 1 : isMovistar ? 2 : isEs ? 3 : isEn ? 4 : 5;
        } else {
          tier = isDazn ? 0 : isMovistar ? 1 : isRtve ? 2 : isEs ? 3 : isEn ? 4 : 5;
        }
      }

      const speedRank =
        /\.m3u8(\?|$)|rtvelivestream|3catdirectes|eitb\.eus|akamaized/.test(url)
          ? 0
          : /streamxhd\./.test(url)
            ? 1
            : /footunder\.online/.test(url)
              ? 3
              : 2;

      return { tr, tier, speedRank, idx };
    })
    .sort((a, b) => a.tier - b.tier || a.speedRank - b.speedRank || a.idx - b.idx)
    .map((x) => x.tr);
}

export interface VerifiedSpanishBroadcasterBadge {
  name: string;
  brand: 'movistar' | 'dazn' | 'dazn_mplus' | 'rtve';
  badgeColor: string;
}

export interface VerifiedTvGuideSummary {
  checked: boolean;
  es?: string[];
  en?: string[];
  zh?: string[];
}

function cleanDisplayBroadcasterNames(rawNames: string[], maxItems = 2): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const raw of rawNames) {
    let cleaned = String(raw || '')
      .replace(/\s*\(Oficial\s*·\s*Guía\s*TV\)/gi, '')
      .replace(/\bLaLiga TV Bar\b/gi, '')
      .replace(/\bM\+\s*LALIGA HDR\b/gi, 'M+ LaLiga')
      .replace(/\bM\+\s*LALIGA\b/gi, 'M+ LaLiga')
      .replace(/\bM\+\s*#Vamos Bar\b/gi, '')
      .replace(/\bOrange Fútbol \d+\b/gi, '')
      .replace(/\bReplay(?:\s+YouTube)?\b/gi, '')
      .replace(/\bSky Sports\+ app\b/gi, '')
      .replace(/\bNOW\b/gi, '')
      .replace(/\bSky Sports Main Event UHD\b/gi, '')
      .replace(/\bSky Sports UHD \d+\b/gi, '')
      .replace(/\bPremier Sports Player\b/gi, 'Premier Sports')
      .replace(/\s*1080p|\s*720p|\s*HD/gi, '')
      .replace(/\s*\(UK\)/gi, '')
      .trim();
    if (!cleaned) continue;
    // Skip bare generic "DAZN" when "DAZN LaLiga" or "DAZN 1" is already in the list
    if (/^dazn$/i.test(cleaned) && rawNames.some((n) => /dazn\s*(laliga|\d)/i.test(n))) {
      continue;
    }
    const normKey = cleaned.toLowerCase();
    if (seen.has(normKey)) continue;
    seen.add(normKey);
    out.push(cleaned);
    if (out.length >= maxItems) break;
  }
  return out;
}

export function resolveVerifiedSpanishBroadcasterBadge(
  verifiedSchedule?: VerifiedMatchTvSchedule | null
): VerifiedSpanishBroadcasterBadge | null {
  if (!verifiedSchedule) return null;
  const rawEs = [
    ...verifiedSchedule.esBroadcasterNames,
    ...verifiedSchedule.epgMatches.filter((e) => e.lang === 'ES').map((e) => e.channelLabel),
  ];
  if (rawEs.length === 0) return null;

  const joined = rawEs.join(' | ').toLowerCase();
  const hasDazn = /\bdazn\b/i.test(joined);
  const hasMovistar = /\b(movistar|m\+\s*laliga|m\+\s*liga|m\+\s*vamos|hypermotion)\b/i.test(joined);
  const hasRtve = /\b(la 1|teledeporte|rtve|esport3|cuatro|telecinco|la 2)\b/i.test(joined);

  const displayNames = cleanDisplayBroadcasterNames(rawEs, 2);
  if (displayNames.length === 0) return null;

  if (hasRtve && !hasDazn && !hasMovistar) {
    return { name: displayNames.join(' · '), brand: 'rtve', badgeColor: '#38BDF8' };
  }
  if (hasDazn && hasMovistar) {
    return { name: displayNames.join(' · '), brand: 'dazn_mplus', badgeColor: '#F59E0B' };
  }
  if (hasDazn) {
    return { name: displayNames.join(' · '), brand: 'dazn', badgeColor: '#F59E0B' };
  }
  if (hasMovistar) {
    return { name: displayNames.join(' · '), brand: 'movistar', badgeColor: '#00A9E0' };
  }
  return { name: displayNames.join(' · '), brand: 'movistar', badgeColor: '#94A3B8' };
}

export function buildVerifiedTvGuideSummary(
  verifiedSchedule?: VerifiedMatchTvSchedule | null
): VerifiedTvGuideSummary {
  if (!verifiedSchedule) return { checked: false };
  const es = cleanDisplayBroadcasterNames(
    [
      ...verifiedSchedule.esBroadcasterNames,
      ...verifiedSchedule.epgMatches.filter((e) => e.lang === 'ES').map((e) => e.channelLabel),
    ],
    3
  );
  const en = cleanDisplayBroadcasterNames(
    [
      ...verifiedSchedule.enBroadcasterNames,
      ...verifiedSchedule.epgMatches.filter((e) => e.lang === 'EN').map((e) => e.channelLabel),
    ],
    3
  );
  const zh = cleanDisplayBroadcasterNames(verifiedSchedule.zhBroadcasterNames, 3);
  return {
    checked: verifiedSchedule.checked,
    ...(es.length > 0 ? { es } : {}),
    ...(en.length > 0 ? { en } : {}),
    ...(zh.length > 0 ? { zh } : {}),
  };
}

export function resolveMatchSpanishBroadcaster(
  leagueSlug: string,
  groupTitle?: string,
  verifiedSchedule?: VerifiedMatchTvSchedule | null
): VerifiedSpanishBroadcasterBadge | null {
  if (verifiedSchedule) {
    return resolveVerifiedSpanishBroadcasterBadge(verifiedSchedule);
  }
  const slug = String(leagueSlug || '').toLowerCase();
  const title = String(groupTitle || '').toLowerCase();
  if (slug.includes('wchampions') || slug.includes('femenin') || title.includes('women')) {
    return null;
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

function mapConfirmedSpanishBroadcasterToTracks(
  matchId: string,
  broadcasterName: string,
  pushTrack: (tr: TrackRecord) => void
): void {
  const b = broadcasterName.toLowerCase();

  if (/\bdazn\s*laliga\b/.test(b)) {
    pushTrack({
      id: `${matchId}-es-daznll`,
      label: 'DAZN LaLiga HD (Español)',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://pig.footunder.online/stream/84',
      resolverType: 'sports_channel',
    });
    pushTrack({
      id: `${matchId}-es-daznll-sxhd`,
      label: 'DAZN LaLiga Directo HD (Español)',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://streamxhd.sbs/live1.php?stream=daznlaliga',
      resolverType: 'sports_channel',
    });
    return;
  }

  if (/m\+\s*laliga|movistar\s*laliga/.test(b) && !/(?:m\+\s*laliga|movistar\s*laliga)\s*(?:[2-9]|1\d)\b/.test(b)) {
    pushTrack({
      id: `${matchId}-es-mlaliga`,
      label: 'M+ LaLiga HD (Español)',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://streamxhd.sbs/live1.php?stream=mlaliga',
      resolverType: 'sports_channel',
    });
    pushTrack({
      id: `${matchId}-es-mlaliga-bk`,
      label: 'M+ LaLiga Señal 2 HD (Español)',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://streamxhd.sbs/live2.php?stream=mlaliga',
      resolverType: 'sports_channel',
    });
    return;
  }

  if (/movistar\s*plus\+|m\+\s*plus|^movistar\+$/.test(b)) {
    pushTrack({
      id: `${matchId}-es-mplus`,
      label: 'Movistar Plus+ HD (Español)',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://pig.footunder.online/stream/537',
      resolverType: 'sports_channel',
    });
    return;
  }

  if (/\bdazn\s*1\b/.test(b)) {
    pushTrack({
      id: `${matchId}-es-dazn1`,
      label: 'DAZN 1 HD (Español)',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://pig.footunder.online/stream/445',
      resolverType: 'sports_channel',
    });
    return;
  }
  if (/\bdazn\s*2\b/.test(b)) {
    pushTrack({
      id: `${matchId}-es-dazn2`,
      label: 'DAZN 2 HD (Español)',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://pig.footunder.online/stream/446',
      resolverType: 'sports_channel',
    });
    return;
  }
  if (/\bdazn\s*3\b/.test(b)) {
    pushTrack({
      id: `${matchId}-es-dazn3`,
      label: 'DAZN 3 HD (Español)',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://pig.footunder.online/stream/447',
      resolverType: 'sports_channel',
    });
    return;
  }
  if (/\bdazn\s*4\b/.test(b)) {
    pushTrack({
      id: `${matchId}-es-dazn4`,
      label: 'DAZN 4 HD (Español)',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://pig.footunder.online/stream/448',
      resolverType: 'sports_channel',
    });
    return;
  }

  if (
    /m\+\s*liga\s*de\s*campeones|movistar.*campeones|m\+\s*campeones/.test(b) &&
    !/(?:liga\s*de\s*campeones|campeones)\s*(?:[2-9]|1\d)\b/.test(b)
  ) {
    pushTrack({
      id: `${matchId}-es-mucl`,
      label: 'M+ Liga de Campeones HD (Español)',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://streamxhd.sbs/live1.php?stream=mligacampeones',
      resolverType: 'sports_channel',
    });
    pushTrack({
      id: `${matchId}-es-mucl-bk`,
      label: 'M+ Liga de Campeones Señal 2 HD (Español)',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://pig.footunder.online/stream/435',
      resolverType: 'sports_channel',
    });
    return;
  }

  if (/vamos/.test(b) && !/bar/.test(b)) {
    pushTrack({
      id: `${matchId}-es-vamos`,
      label: 'Movistar Vamos HD (Español)',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://pig.footunder.online/stream/526',
      resolverType: 'sports_channel',
    });
    return;
  }

  if (/hypermotion/.test(b)) {
    pushTrack({
      id: `${matchId}-es-mhyper`,
      label: 'LaLiga TV Hypermotion HD (Español)',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://pig.footunder.online/stream/522',
      resolverType: 'sports_channel',
    });
    pushTrack({
      id: `${matchId}-es-mhyper2`,
      label: 'LaLiga Hypermotion Señal 2 HD (Español)',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://footunder.online/tvtodo/laliga2.php',
      resolverType: 'sports_channel',
    });
    return;
  }

  if (/\bla\s*1\b|rtve\s*1|tve\s*1/.test(b)) {
    pushTrack({
      id: `${matchId}-es-la1`,
      label: 'La 1 RTVE 1080p (Oficial)',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/la1/la1_main.m3u8',
      resolverType: 'tdt_hls',
    });
    return;
  }

  if (/teledeporte|\btdp\b/.test(b)) {
    pushTrack({
      id: `${matchId}-es-tdp`,
      label: 'Teledeporte RTVE HD (Oficial)',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://rtvelivestream.rtve.es/rtvesec/tdp/tdp_main.m3u8',
      resolverType: 'tdt_hls',
    });
    return;
  }

  if (/esport\s*3/.test(b)) {
    pushTrack({
      id: `${matchId}-es-esport3`,
      label: 'Esport3 HD (Catalunya)',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://directes-tv-int.3catdirectes.cat/live-origin/esport3-hls/master.m3u8',
      resolverType: 'tdt_hls',
    });
    return;
  }

  if (/real\s*madrid\s*tv/.test(b)) {
    pushTrack({
      id: `${matchId}-es-rmtv`,
      label: 'Real Madrid TV HD',
      lang: 'ES',
      quality: '1080p',
      sourceUrl: 'https://rmtv.akamaized.net/hls/live/2043153/rmtv-es-web/master.m3u8',
      resolverType: 'tdt_hls',
    });
  }
}

function mapConfirmedEnglishBroadcasterToTracks(
  matchId: string,
  broadcasterName: string,
  pushTrack: (tr: TrackRecord) => void
): void {
  const b = broadcasterName.toLowerCase();

  if (/sky sports premier league/.test(b)) {
    pushTrack({
      id: `${matchId}-en-sky-pl`,
      label: 'Sky Sports Premier League (UK)',
      lang: 'EN',
      quality: '1080p',
      sourceUrl: 'https://cdn.stmify.com/out/v1/SKY_SPORTS_PREMIER_LEAGUE/index.m3u8',
      resolverType: 'tdt_hls',
    });
    return;
  }

  if (/sky sports main event|sky sports football|sky sports 1/.test(b)) {
    pushTrack({
      id: `${matchId}-en-sky1`,
      label: 'Sky Sports 1 / Main Event (UK)',
      lang: 'EN',
      quality: '1080p',
      sourceUrl: 'http://45.228.234.9:8000/play/a06b/index.m3u8',
      resolverType: 'tdt_hls',
    });
    return;
  }

  if (/sky sports mix|sky sports action|sky sports 2/.test(b)) {
    pushTrack({
      id: `${matchId}-en-sky2`,
      label: 'Sky Sports 2 / Action (UK)',
      lang: 'EN',
      quality: '1080p',
      sourceUrl: 'http://200.115.120.1:8000/play/ca82266/index.m3u8',
      resolverType: 'tdt_hls',
    });
    return;
  }

  if (/tnt sports/.test(b) && !/tnt\s*sports\s*(?:[2-9]|1\d)\b/.test(b)) {
    pushTrack({
      id: `${matchId}-en-tnt`,
      label: 'TNT Sports UK HD',
      lang: 'EN',
      quality: '1080p',
      sourceUrl: 'https://streamxhd.sbs/live2.php?stream=tntsports',
      resolverType: 'sports_channel',
    });
    return;
  }

  if (/fifa\+/.test(b)) {
    pushTrack({
      id: `${matchId}-en-fifaplus`,
      label: 'FIFA+ English 1080p',
      lang: 'EN',
      quality: '1080p',
      sourceUrl:
        'https://d2w9q46ikgrcwx.cloudfront.net/v1/master/3722c60a815c199d9c0ef36c5b73da68a62b09d1/cc-of5cbk3sav3w5/v1/sysdata_s_p_a_fifa_7/samsungheadend_us/latest/main/hls/playlist.m3u8',
      resolverType: 'tdt_hls',
    });
  }
}

function mapConfirmedChineseBroadcasterToTracks(
  matchId: string,
  broadcasterName: string,
  pushTrack: (tr: TrackRecord) => void
): void {
  const b = broadcasterName.toLowerCase();

  if (/cctv-?5\+|cctv5\+|体育赛事/.test(b)) {
    pushTrack({
      id: `${matchId}-zh-cctv5p`,
      label: '中文直播 · CCTV-5+ 体育赛事',
      lang: 'ZH',
      quality: '720p',
      sourceUrl: 'http://38.75.136.137:98/gslb/dsdqbv/cctv5p.m3u8?auth=test20251009',
      resolverType: 'tdt_hls',
    });
    return;
  }

  if (/cctv-?5|cctv5/.test(b)) {
    pushTrack({
      id: `${matchId}-zh-cctv5`,
      label: '中文直播 · CCTV-5 体育 HD',
      lang: 'ZH',
      quality: '1080p',
      sourceUrl: 'http://38.75.136.137:98/gslb/dsdqbv/cctv5hd.m3u8?auth=test20251009',
      resolverType: 'tdt_hls',
    });
    return;
  }

  if (/cctv-?16|cctv16/.test(b)) {
    pushTrack({
      id: `${matchId}-zh-cctv16`,
      label: '中文直播 · CCTV-16 HD',
      lang: 'ZH',
      quality: '720p',
      sourceUrl: 'http://38.75.136.137:98/gslb/dsdqbv/cctv16hd.m3u8?auth=test20251009',
      resolverType: 'tdt_hls',
    });
    return;
  }

  if (/风云足球/.test(b)) {
    pushTrack({
      id: `${matchId}-zh-fyzq`,
      label: '中文直播 · 风云足球 1080p',
      lang: 'ZH',
      quality: '1080p',
      sourceUrl: 'http://38.75.136.137:98/gslb/dsdqpub/fyzq.m3u8?auth=testpub',
      resolverType: 'tdt_hls',
    });
    return;
  }

  if (/广东体育/.test(b)) {
    pushTrack({
      id: `${matchId}-zh-gdty`,
      label: '粤/中文 · 广东体育 HD',
      lang: 'ZH',
      quality: '720p',
      sourceUrl: 'http://38.75.136.137:98/gslb/dsdqpub/gdty.m3u8?auth=testpub',
      resolverType: 'tdt_hls',
    });
  }
}

export function buildFootballMatchChannels(params: {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  statusState: 'live' | 'upcoming' | 'finished';
  league: SoccerLeagueFeedDef;
  scrapedMatches: any[];
  kickoffMs?: number;
  preferredLang?: PreferredSportsTrackLang;
  verifiedSchedule?: VerifiedMatchTvSchedule | null;
}): TrackRecord[] {
  const {
    matchId,
    homeTeam,
    awayTeam,
    statusState,
    league,
    scrapedMatches,
    kickoffMs,
    preferredLang = 'ES',
    verifiedSchedule,
  } = params;
  if (statusState === 'finished') return [];

  const channels: TrackRecord[] = [];
  const seenUrls = new Set<string>();

  const pushTrack = (track: TrackRecord) => {
    if (!track.sourceUrl || seenUrls.has(track.sourceUrl)) return;
    seenUrls.add(track.sourceUrl);
    channels.push(track);
  };

  // 1. REAL XMLTV EPG SCHEDULE MATCHES (Spanish + UK)
  const targetKickoff = kickoffMs && kickoffMs > 0 ? kickoffMs : Date.now();
  const epgMatches =
    verifiedSchedule?.epgMatches && verifiedSchedule.epgMatches.length > 0
      ? verifiedSchedule.epgMatches
      : findEpgVerifiedBroadcastersForFixture(homeTeam, awayTeam, targetKickoff);

  for (const epgMatch of epgMatches) {
    pushTrack({
      id: `${matchId}-epg-${epgMatch.channelId}`,
      label: `${epgMatch.channelLabel} (Oficial · Guía TV)`,
      lang: epgMatch.lang,
      quality: '1080p',
      sourceUrl: epgMatch.sourceUrl,
      resolverType: epgMatch.resolverType,
    });
  }

  // 2. REAL CONFIRMED SPANISH TV LISTING CHANNELS (FotMob ES / ESPN ES)
  for (const esName of verifiedSchedule?.esBroadcasterNames || []) {
    mapConfirmedSpanishBroadcasterToTracks(matchId, esName, pushTrack);
  }

  // 3. REAL CONFIRMED ENGLISH / UK TV LISTING CHANNELS (FotMob GB / ESPN EN)
  for (const enName of verifiedSchedule?.enBroadcasterNames || []) {
    mapConfirmedEnglishBroadcasterToTracks(matchId, enName, pushTrack);
  }

  // 4. REAL CONFIRMED CHINESE TV CHANNELS (CNTV CCTV-5 / CCTV-5+ / CCTV-16 EPG)
  for (const zhName of verifiedSchedule?.zhBroadcasterNames || []) {
    mapConfirmedChineseBroadcasterToTracks(matchId, zhName, pushTrack);
  }

  // 5. LIVE SCRAPED FEEDS FROM MATCH AGENDA (Only when that exact fixture is in today's live agenda)
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

  if (channels.length === 0) return [];

  // Order by preferred language and broadcaster priority without discarding any verified feed
  const sorted = sortTracksWithDaznPriority(channels, league.slug, preferredLang);
  const esTracks = sorted.filter((c) => c.lang === 'ES').slice(0, 6);
  const enTracks = sorted.filter((c) => c.lang === 'EN').slice(0, 4);
  const zhTracks = sorted.filter((c) => c.lang === 'ZH').slice(0, 4);
  const others = sorted
    .filter((c) => c.lang !== 'ES' && c.lang !== 'EN' && c.lang !== 'ZH')
    .slice(0, 3);

  return preferredLang === 'EN'
    ? [...enTracks, ...esTracks, ...zhTracks, ...others]
    : preferredLang === 'ZH'
      ? [...zhTracks, ...esTracks, ...enTracks, ...others]
      : [...esTracks, ...enTracks, ...zhTracks, ...others];
}

