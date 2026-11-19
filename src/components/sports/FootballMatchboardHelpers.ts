import type { FootballMatchboardItem } from '../../types';

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

export function isPriorityTeamMatch(homeTeam: string, awayTeam: string): boolean {
  if (isBarcaOrRealMadridMatch(homeTeam, awayTeam)) return true;
  const hay = normalizeFootballText(`${homeTeam} ${awayTeam}`);
  return /\b(atletico|sevilla|valencia|villarreal|betis|athletic|manchester|liverpool|arsenal|chelsea|tottenham|milan|inter|juventus|bayern|psg|dortmund|espana|spain)\b/.test(
    hay
  );
}

export function getClubHighlightTier(homeTeam: string, awayTeam: string): number {
  if (isBarcaOrRealMadridMatch(homeTeam, awayTeam)) return 2;
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
  if (hay.includes('eng.1') || hay.includes('premier')) return 120 + bonus;
  if (hay.includes('nations') || hay.includes('liga de naciones') || hay.includes('selecciones')) {
    return 115 + bonus;
  }
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
    sq === 'barca madrid' ||
    sq === 'barca_madrid' ||
    sq === 'barcelona real madrid' ||
    (sq.includes('barc') && sq.includes('madrid'))
  ) {
    return 'barca_madrid';
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
  if (combined.includes('serie a') || combined.includes('ita.1')) {
    return 'seriea';
  }
  if (combined.includes('bundesliga') || combined.includes('ger.1')) {
    return 'bundesliga';
  }
  return null;
}
