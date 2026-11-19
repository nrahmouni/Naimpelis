export function isPriorityTeamMatch(homeTeam: string, awayTeam: string): boolean {
  const hay = `${homeTeam} ${awayTeam}`.toLowerCase();
  return /barcelona|barça|real madrid|madrid|atletico|atético|sevilla|valencia|villarreal|betis|athletic|manchester|liverpool|arsenal|chelsea|tottenham|milan|inter|juventus|bayern|psg|dortmund/i.test(hay);
}

export function getLeaguePriorityRank(leagueSlug: string, groupTitle: string, homeTeam: string, awayTeam: string): number {
  const hay = `${leagueSlug} ${groupTitle}`.toLowerCase();
  const isBigTeam = isPriorityTeamMatch(homeTeam, awayTeam);
  const bonus = isBigTeam ? 35 : 0;

  if (hay.includes('champions') || hay.includes('uefa.champions')) return 120 + bonus;
  if (hay.includes('esp.1') || hay.includes('laliga ea') || (hay.includes('laliga') && !hay.includes('hypermotion') && !hay.includes('2'))) return 105 + bonus;
  if (hay.includes('eng.1') || hay.includes('premier')) return 95 + bonus;
  if (hay.includes('nations') || hay.includes('liga de naciones') || hay.includes('selecciones')) return 88 + bonus;
  if (hay.includes('copa del rey') || hay.includes('esp.copa')) return 80 + bonus;
  if (hay.includes('uefa.europa') || hay.includes('europa league')) return 75 + bonus;
  if (hay.includes('esp.2') || hay.includes('hypermotion')) return 60;
  return 10 + bonus;
}
