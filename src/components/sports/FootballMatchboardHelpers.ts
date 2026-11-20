import type { AppLanguage, FootballMatchboardItem, StreamTrack } from '../../types';

export type RecommendedSportsLang = 'ES' | 'EN' | 'ZH';

export function resolveRecommendedSportsLang(lang: AppLanguage): RecommendedSportsLang {
  if (lang === 'en') return 'EN';
  if (lang === 'zh') return 'ZH';
  // Español, Catalán y Rifeño recomiendan canales en español (DAZN / Movistar / RTVE)
  return 'ES';
}

export function getTrackLanguageBucket(ch: Pick<StreamTrack, 'lang' | 'label'>): RecommendedSportsLang {
  const lbl = String(ch.label || '').toLowerCase();
  const trLang = String(ch.lang || '').toUpperCase();
  if (trLang === 'ZH' || /中文|cctv|风云|广东|btv/.test(lbl)) return 'ZH';
  if (
    trLang === 'EN' ||
    /\(uk\)|\buk\b|sky sports|talksport|cbs sports|fifa\+|eurosport.*uk/i.test(lbl)
  ) {
    return 'EN';
  }
  return 'ES';
}

export function pickPreferredChannelIndex(
  channels: StreamTrack[],
  lang: AppLanguage,
  forceZhIndicator = false
): number {
  if (!Array.isArray(channels) || channels.length === 0) return -1;
  const targetLang: RecommendedSportsLang = forceZhIndicator
    ? 'ZH'
    : resolveRecommendedSportsLang(lang);

  const exactIdx = channels.findIndex((c) => getTrackLanguageBucket(c) === targetLang);
  if (exactIdx >= 0) return exactIdx;

  // For EN fallback to ES before ZH; for ES/CA/RIF fallback to non-ZH before ZH
  if (targetLang === 'EN') {
    const esIdx = channels.findIndex((c) => getTrackLanguageBucket(c) === 'ES');
    if (esIdx >= 0) return esIdx;
  } else if (targetLang === 'ES') {
    const nonZhIdx = channels.findIndex((c) => getTrackLanguageBucket(c) !== 'ZH');
    if (nonZhIdx >= 0) return nonZhIdx;
  }
  return 0;
}

export function normalizeFootballText(raw: string): string {
  return String(raw || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim();
}

export function isBarcaOrRealMadridMatch(homeTeam: string, awayTeam: string): boolean {
  const hay = normalizeFootballText(`${homeTeam} ${awayTeam}`);
  return /\b(barcelona|fc barcelona|barca|real madrid)\b/.test(hay);
}

export function isSpainNationalTeamMatch(homeTeam: string, awayTeam: string): boolean {
  const hay = normalizeFootballText(`${homeTeam} ${awayTeam}`);
  if (/\bespanyol\b/.test(hay) && !/\b(espana|spain)\b/.test(hay)) return false;
  return /\b(espana|spain|seleccion espanola|la roja)\b/.test(hay);
}

export function isPrioritySpanishHighlightMatch(homeTeam: string, awayTeam: string): boolean {
  return isBarcaOrRealMadridMatch(homeTeam, awayTeam) || isSpainNationalTeamMatch(homeTeam, awayTeam);
}

export function isPriorityTeamMatch(homeTeam: string, awayTeam: string): boolean {
  if (isPrioritySpanishHighlightMatch(homeTeam, awayTeam)) return true;
  const hay = normalizeFootballText(`${homeTeam} ${awayTeam}`);
  return /\b(atletico|sevilla|valencia|villarreal|betis|athletic|manchester|liverpool|arsenal|chelsea|tottenham|milan|inter|juventus|bayern|psg|dortmund)\b/.test(
    hay
  );
}

export function getClubHighlightTier(homeTeam: string, awayTeam: string): number {
  if (isPrioritySpanishHighlightMatch(homeTeam, awayTeam)) return 2;
  if (isPriorityTeamMatch(homeTeam, awayTeam)) return 1;
  return 0;
}

export function getLeaguePriorityRank(
  leagueSlug: string,
  groupTitle: string,
  homeTeam: string,
  awayTeam: string
): number {
  const hay = normalizeFootballText(`${leagueSlug} ${groupTitle}`);
  const clubTier = getClubHighlightTier(homeTeam, awayTeam);
  const bonus = clubTier === 2 ? 180 : clubTier === 1 ? 35 : 0;

  if (hay.includes('champions') || hay.includes('uefa.champions')) return 140 + bonus;
  if (
    hay.includes('esp.1') ||
    hay.includes('laliga ea') ||
    (hay.includes('laliga') && !hay.includes('hypermotion') && !hay.includes('2'))
  ) {
    return 130 + bonus;
  }
  if (
    hay.includes('nations') ||
    hay.includes('liga de naciones') ||
    hay.includes('fifa.world') ||
    hay.includes('uefa.euro') ||
    hay.includes('mundial') ||
    hay.includes('selecciones')
  ) {
    return 125 + bonus;
  }
  if (hay.includes('eng.1') || hay.includes('premier')) return 118 + bonus;
  if (hay.includes('copa del rey') || hay.includes('esp.copa')) return 95 + bonus;
  if (hay.includes('uefa.europa') || hay.includes('europa league')) return 85 + bonus;
  if (hay.includes('esp.2') || hay.includes('hypermotion')) return 65 + (clubTier === 2 ? 90 : 0);
  return 15 + bonus;
}

export function matchesFootballSearchFilter(
  m: Pick<FootballMatchboardItem, 'homeTeam' | 'awayTeam' | 'groupTitle' | 'leagueName' | 'leagueSlug' | 'regionName'>,
  rawQuery: string
): boolean {
  const q = normalizeFootballText(rawQuery);
  if (!q) return true;
  const hay = normalizeFootballText(
    `${m.homeTeam} ${m.awayTeam} ${m.groupTitle} ${m.leagueName} ${m.leagueSlug} ${m.regionName}`
  );
  if (q === 'barca madrid' || q === 'barca_madrid' || q === 'barcelona real madrid') {
    return isBarcaOrRealMadridMatch(m.homeTeam, m.awayTeam);
  }
  if (q === 'espana' || q === 'seleccion' || q === 'seleccion espanola' || q === 'la roja') {
    return isSpainNationalTeamMatch(m.homeTeam, m.awayTeam);
  }
  if (q === 'barca' || q === 'barcelona') {
    return /\b(barcelona|fc barcelona|barca)\b/.test(hay);
  }
  return hay.includes(q);
}

export function resolveActiveCalendarScope(
  leagueFilter: string,
  searchQuery: string
): string | null {
  const lf = normalizeFootballText(leagueFilter);
  const sq = normalizeFootballText(searchQuery);
  const combined = [lf, sq].filter(Boolean).join(' ');
  if (!combined) return null;

  if (
    lf === 'barca_madrid' ||
    sq === 'barca madrid' ||
    sq === 'barca_madrid' ||
    sq === 'barcelona real madrid' ||
    (sq.includes('barc') && sq.includes('madrid'))
  ) {
    return 'barca_madrid';
  }
  if (
    lf === 'espana' ||
    (/\b(espana|spain|seleccion|seleccion espanola|la roja)\b/.test(sq) && !sq.includes('espanyol'))
  ) {
    return 'espana';
  }
  if (sq === 'barca' || sq === 'barcelona' || sq.includes('barcelona')) {
    return 'barcelona';
  }
  if (sq === 'real madrid' || sq.includes('real madrid')) {
    return 'real_madrid';
  }
  if (combined.includes('champions') || combined.includes('uefa.champions')) {
    return 'champions';
  }
  if (combined.includes('europa league') || combined === 'europa' || combined.includes('uefa.europa')) {
    return 'europa';
  }
  if (combined.includes('hypermotion') || combined.includes('esp.2')) {
    return 'hypermotion';
  }
  if (combined.includes('laliga') || combined.includes('esp.1')) {
    return 'laliga';
  }
  if (combined.includes('premier') || combined.includes('eng.1')) {
    return 'premier';
  }
  if (combined.includes('nations') || combined.includes('uefa.nations')) {
    return 'nations';
  }
  if (lf === 'world' || combined.includes('mundial') || combined.includes('fifa.world')) {
    return 'world';
  }
  if (combined.includes('serie a') || combined.includes('ita.1')) {
    return 'seriea';
  }
  if (combined.includes('bundesliga') || combined.includes('ger.1')) {
    return 'bundesliga';
  }
  return null;
}
