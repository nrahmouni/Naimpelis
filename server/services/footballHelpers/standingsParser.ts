import type {
  FootballStandingRow,
  FootballStandingsData,
  FootballStandingsGroup,
  FootballStandingsLegendItem,
} from '../../../src/types.ts';
import {
  FOTMOB_HEADERS,
  doFootballTeamNamesMatch,
} from './teamMatchingAndFotmobDay.ts';

export interface StandingsParseContext {
  homeTeamId?: number;
  awayTeamId?: number;
  homeTeam?: string;
  awayTeam?: string;
  statusState?: 'live' | 'upcoming' | 'finished';
  homeScore?: string;
  awayScore?: string;
  tournamentName?: string;
}

interface FotmobOngoingMatch {
  hId?: number | string;
  aId?: number | string;
  hScore?: number | string;
  aScore?: number | string;
}

interface FotmobTableRowRaw {
  idx?: number;
  id?: number | string;
  name?: string;
  shortName?: string;
  scoresStr?: string;
  ongoing?: FotmobOngoingMatch | null;
  played?: number;
  wins?: number;
  draws?: number;
  losses?: number;
  goalConDiff?: number;
  pts?: number;
  deduction?: number;
  qualColor?: string;
}

interface FotmobLegendRaw {
  title?: string;
  color?: string;
}

interface FotmobTableBlock {
  leagueName?: string;
  name?: string;
  ongoing?: FotmobOngoingMatch[];
  table?: {
    all?: FotmobTableRowRaw[];
    home?: FotmobTableRowRaw[];
    away?: FotmobTableRowRaw[];
  };
}

interface FotmobTltablePayload {
  leagueId?: number | string;
  leagueName?: string;
  ongoing?: FotmobOngoingMatch[];
  legend?: FotmobLegendRaw[];
  table?: FotmobTableBlock['table'];
  tables?: FotmobTableBlock[];
  data?: FotmobTltablePayload;
}

interface EspnStatRaw {
  name?: string;
  value?: number | string;
  displayValue?: number | string;
}

interface EspnEntryRaw {
  team?: {
    id?: string | number;
    displayName?: string;
    shortDisplayName?: string;
    abbreviation?: string;
    name?: string;
    logos?: Array<{ href?: string }>;
  };
  stats?: EspnStatRaw[];
  note?: { color?: string };
}

interface EspnChildStandingsRaw {
  name?: string;
  abbreviation?: string;
  standings?: { entries?: EspnEntryRaw[] };
}

interface EspnStandingsPayloadRaw {
  name?: string;
  shortName?: string;
  children?: EspnChildStandingsRaw[];
  standings?: { entries?: EspnEntryRaw[] };
}

const standingsCache = new Map<string, { data: FootballStandingsData; ts: number }>();

const LEGEND_TITLE_ES_MAP: Record<string, string> = {
  'champions league': 'Champions League',
  'champions league qualification': 'Previa Champions League',
  'europa league': 'Europa League',
  'europa league qualification': 'Previa Europa League',
  'conference league': 'Conference League',
  'conference league qualification': 'Conference League',
  'europa conference league': 'Conference League',
  relegation: 'Descenso',
  'relegation playoff': 'Play-off de descenso',
  promotion: 'Ascenso directo',
  'promotion playoff': 'Play-off de ascenso',
  'qualification to 1/8 finals': 'Octavos de final',
  'qualification to 1/16 finals': 'Dieciseisavos de final',
  'next round': 'Siguiente fase',
};

function translateLegendTitle(raw?: string): string {
  const clean = String(raw || '').trim();
  if (!clean) return '';
  const mapped = LEGEND_TITLE_ES_MAP[clean.toLowerCase()];
  return mapped || clean;
}

function parseScoresStr(scoresStr: unknown): { gf: number; ga: number } {
  const m = String(scoresStr || '').match(/(-?\d+)\s*[-:]\s*(-?\d+)/);
  if (!m) return { gf: 0, ga: 0 };
  return {
    gf: Number(m[1]) || 0,
    ga: Number(m[2]) || 0,
  };
}

function formatOngoingMatchLabel(ongoing?: FotmobOngoingMatch | null): string | undefined {
  if (!ongoing || typeof ongoing !== 'object') return undefined;
  const h = ongoing.hScore;
  const a = ongoing.aScore;
  if (h === undefined || a === undefined) return undefined;
  return `${h}-${a}`;
}

function mapFotmobRows(
  rawRows: unknown,
  ctx: StandingsParseContext,
  ongoingByTeamId: Map<number, FotmobOngoingMatch>
): FootballStandingRow[] {
  if (!Array.isArray(rawRows)) return [];
  return rawRows
    .filter((r): r is FotmobTableRowRaw => Boolean(r && typeof r === 'object' && 'name' in r && r.name))
    .map((r, idx): FootballStandingRow => {
      const teamIdNum = Number(r.id || 0);
      const teamName = String(r.name || '').trim();
      const shortName = String(r.shortName || teamName).trim();
      const { gf, ga } = parseScoresStr(r.scoresStr);
      const ongoing = r.ongoing || (teamIdNum ? ongoingByTeamId.get(teamIdNum) : undefined);

      const isHomeTeam =
        (Boolean(ctx.homeTeamId) && teamIdNum === ctx.homeTeamId) ||
        (Boolean(ctx.homeTeam) && doFootballTeamNamesMatch(teamName, ctx.homeTeam!));
      const isAwayTeam =
        (Boolean(ctx.awayTeamId) && teamIdNum === ctx.awayTeamId) ||
        (Boolean(ctx.awayTeam) && doFootballTeamNamesMatch(teamName, ctx.awayTeam!));

      let isPlayingLive = Boolean(ongoing);
      let liveMatchLabel = formatOngoingMatchLabel(ongoing);
      if (
        !isPlayingLive &&
        ctx.statusState === 'live' &&
        (isHomeTeam || isAwayTeam) &&
        ctx.homeScore !== undefined &&
        ctx.awayScore !== undefined &&
        ctx.homeScore !== '-' &&
        ctx.awayScore !== '-'
      ) {
        isPlayingLive = true;
        liveMatchLabel = `${ctx.homeScore}-${ctx.awayScore}`;
      }

      return {
        rank: Number(r.idx || idx + 1),
        teamId: teamIdNum ? String(teamIdNum) : undefined,
        teamName,
        shortName: shortName || undefined,
        logo: teamIdNum
          ? `https://images.fotmob.com/image_resources/logo/teamlogo/${teamIdNum}_small.png`
          : undefined,
        played: Number(r.played ?? 0),
        wins: Number(r.wins ?? 0),
        draws: Number(r.draws ?? 0),
        losses: Number(r.losses ?? 0),
        goalsFor: gf,
        goalsAgainst: ga,
        goalDiff: Number(r.goalConDiff ?? gf - ga),
        pts: Number(r.pts ?? 0),
        deduction: typeof r.deduction === 'number' && r.deduction !== 0 ? r.deduction : undefined,
        qualColor: typeof r.qualColor === 'string' && r.qualColor ? r.qualColor : undefined,
        isHomeTeam: isHomeTeam || undefined,
        isAwayTeam: isAwayTeam || undefined,
        isPlayingLive: isPlayingLive || undefined,
        liveMatchLabel,
      };
    });
}

function buildLegend(rawLegend: unknown): FootballStandingsLegendItem[] {
  if (!Array.isArray(rawLegend)) return [];
  const seen = new Set<string>();
  const out: FootballStandingsLegendItem[] = [];
  for (const item of rawLegend as FotmobLegendRaw[]) {
    const title = translateLegendTitle(item?.title);
    const color = String(item?.color || '').trim();
    if (!title || !color) continue;
    const key = `${title.toLowerCase()}:${color.toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ title, color });
  }
  return out;
}

export function parseFotmobTltableStandings(
  raw: unknown,
  ctx: StandingsParseContext = {}
): FootballStandingsData | null {
  const root = (Array.isArray(raw) ? raw[0] : raw) as FotmobTltablePayload | undefined;
  const d = root?.data ?? root;
  if (!d || typeof d !== 'object') return null;

  const ongoingByTeamId = new Map<number, FotmobOngoingMatch>();
  const registerOngoing = (list: unknown) => {
    if (!Array.isArray(list)) return;
    for (const o of list as FotmobOngoingMatch[]) {
      if (!o || typeof o !== 'object') continue;
      if (o.hId) ongoingByTeamId.set(Number(o.hId), o);
      if (o.aId) ongoingByTeamId.set(Number(o.aId), o);
    }
  };
  registerOngoing(d.ongoing);

  const legend = buildLegend(d.legend);
  const groups: FootballStandingsGroup[] = [];

  if (Array.isArray(d.tables) && d.tables.length > 0) {
    for (let i = 0; i < d.tables.length; i++) {
      const grp = d.tables[i];
      if (!grp || !grp.table) continue;
      registerOngoing(grp.ongoing);
      const all = mapFotmobRows(grp.table.all, ctx, ongoingByTeamId);
      if (all.length === 0) continue;
      const home = mapFotmobRows(grp.table.home, ctx, ongoingByTeamId);
      const away = mapFotmobRows(grp.table.away, ctx, ongoingByTeamId);
      groups.push({
        groupName: String(grp.leagueName || grp.name || `Grupo ${i + 1}`).trim(),
        all,
        home: home.length > 0 ? home : undefined,
        away: away.length > 0 ? away : undefined,
      });
    }
  } else if (d.table && Array.isArray(d.table.all)) {
    const all = mapFotmobRows(d.table.all, ctx, ongoingByTeamId);
    if (all.length > 0) {
      const home = mapFotmobRows(d.table.home, ctx, ongoingByTeamId);
      const away = mapFotmobRows(d.table.away, ctx, ongoingByTeamId);
      groups.push({
        groupName: String(d.leagueName || ctx.tournamentName || 'Clasificación').trim(),
        all,
        home: home.length > 0 ? home : undefined,
        away: away.length > 0 ? away : undefined,
      });
    }
  }

  if (groups.length === 0) return null;

  const hasLiveMatches =
    ongoingByTeamId.size > 0 ||
    groups.some((g) => g.all.some((row) => Boolean(row.isPlayingLive)));

  return {
    leagueId: d.leagueId ? String(d.leagueId) : undefined,
    leagueName: String(d.leagueName || ctx.tournamentName || '').trim() || undefined,
    hasLiveMatches,
    legend: legend.length > 0 ? legend : undefined,
    groups,
  };
}

export function parseEspnStandingsFallback(
  rawInput: unknown,
  ctx: StandingsParseContext = {}
): FootballStandingsData | null {
  const raw = rawInput as EspnStandingsPayloadRaw | undefined;
  const children: EspnChildStandingsRaw[] = Array.isArray(raw?.children)
    ? raw.children
    : raw?.standings
      ? [{ standings: raw.standings }]
      : [];
  const groups: FootballStandingsGroup[] = [];

  for (let i = 0; i < children.length; i++) {
    const child = children[i];
    const entries: EspnEntryRaw[] = Array.isArray(child?.standings?.entries)
      ? child.standings.entries
      : [];
    if (entries.length === 0) continue;

    const rows: FootballStandingRow[] = entries.map((entry, idx): FootballStandingRow => {
      const teamName = String(
        entry?.team?.displayName || entry?.team?.shortDisplayName || entry?.team?.name || ''
      ).trim();
      const shortName = String(entry?.team?.shortDisplayName || entry?.team?.abbreviation || teamName).trim();
      const logo = entry?.team?.logos?.[0]?.href ? String(entry.team.logos[0].href) : undefined;
      const statsMap = new Map<string, number>();
      for (const st of Array.isArray(entry?.stats) ? entry.stats : []) {
        if (st?.name) statsMap.set(String(st.name), Number(st.value ?? st.displayValue ?? 0));
      }

      const isHomeTeam = Boolean(ctx.homeTeam) && doFootballTeamNamesMatch(teamName, ctx.homeTeam!);
      const isAwayTeam = Boolean(ctx.awayTeam) && doFootballTeamNamesMatch(teamName, ctx.awayTeam!);
      const isPlayingLive = ctx.statusState === 'live' && (isHomeTeam || isAwayTeam);
      const liveMatchLabel =
        isPlayingLive &&
        ctx.homeScore !== undefined &&
        ctx.awayScore !== undefined &&
        ctx.homeScore !== '-' &&
        ctx.awayScore !== '-'
          ? `${ctx.homeScore}-${ctx.awayScore}`
          : undefined;

      const gf = statsMap.get('pointsFor') ?? 0;
      const ga = statsMap.get('pointsAgainst') ?? 0;
      return {
        rank: statsMap.get('rank') || idx + 1,
        teamId: entry?.team?.id ? String(entry.team.id) : undefined,
        teamName,
        shortName: shortName || undefined,
        logo,
        played: statsMap.get('gamesPlayed') ?? 0,
        wins: statsMap.get('wins') ?? 0,
        draws: statsMap.get('ties') ?? 0,
        losses: statsMap.get('losses') ?? 0,
        goalsFor: gf,
        goalsAgainst: ga,
        goalDiff: statsMap.get('pointDifferential') ?? gf - ga,
        pts: statsMap.get('points') ?? 0,
        qualColor: entry?.note?.color ? String(entry.note.color) : undefined,
        isHomeTeam: isHomeTeam || undefined,
        isAwayTeam: isAwayTeam || undefined,
        isPlayingLive: isPlayingLive || undefined,
        liveMatchLabel,
      };
    });

    groups.push({
      groupName: String(child?.name || child?.abbreviation || `Grupo ${i + 1}`).trim(),
      all: rows,
    });
  }

  if (groups.length === 0) return null;

  return {
    leagueName: String(raw?.name || raw?.shortName || ctx.tournamentName || '').trim() || undefined,
    hasLiveMatches: ctx.statusState === 'live' || groups.some((g) => g.all.some((r) => r.isPlayingLive)),
    groups,
  };
}

function reapplyMatchHighlights(
  standings: FootballStandingsData,
  ctx: StandingsParseContext
): FootballStandingsData {
  const applyRow = (r: FootballStandingRow): FootballStandingRow => {
    const numId = r.teamId ? Number(r.teamId) : 0;
    const isHomeTeam =
      (Boolean(ctx.homeTeamId) && numId === ctx.homeTeamId) ||
      (Boolean(ctx.homeTeam) && doFootballTeamNamesMatch(r.teamName, ctx.homeTeam!));
    const isAwayTeam =
      (Boolean(ctx.awayTeamId) && numId === ctx.awayTeamId) ||
      (Boolean(ctx.awayTeam) && doFootballTeamNamesMatch(r.teamName, ctx.awayTeam!));
    const liveMatchLabel =
      r.liveMatchLabel ||
      (ctx.statusState === 'live' &&
      (isHomeTeam || isAwayTeam) &&
      ctx.homeScore &&
      ctx.awayScore &&
      ctx.homeScore !== '-' &&
      ctx.awayScore !== '-'
        ? `${ctx.homeScore}-${ctx.awayScore}`
        : undefined);
    return {
      ...r,
      isHomeTeam: isHomeTeam || undefined,
      isAwayTeam: isAwayTeam || undefined,
      isPlayingLive: Boolean(r.isPlayingLive || liveMatchLabel) || undefined,
      liveMatchLabel,
    };
  };

  return {
    ...standings,
    hasLiveMatches: standings.hasLiveMatches || ctx.statusState === 'live',
    groups: standings.groups.map((g) => ({
      ...g,
      all: g.all.map(applyRow),
      home: g.home?.map(applyRow),
      away: g.away?.map(applyRow),
    })),
  };
}

export async function fetchLeagueStandings(
  params: StandingsParseContext & {
    leagueId?: string;
    parentLeagueId?: string;
    leagueSlug?: string;
  }
): Promise<FootballStandingsData | undefined> {
  const candidateIds = Array.from(
    new Set(
      [params.leagueId, params.parentLeagueId]
        .map((id) => String(id || '').replace(/\D/g, ''))
        .filter(Boolean)
    )
  );
  const slug = String(params.leagueSlug || '').replace(/[^a-z0-9._-]/gi, '');
  const espnAllowedSlug =
    slug && slug !== 'all' && !slug.startsWith('live.') && !slug.startsWith('fotmob.')
      ? slug
      : '';

  const cacheKey = candidateIds[0] || espnAllowedSlug;
  if (!cacheKey) return undefined;

  const cached = standingsCache.get(cacheKey);
  if (cached) {
    const ttlMs = cached.data.hasLiveMatches || params.statusState === 'live' ? 20 * 1000 : 5 * 60 * 1000;
    if (Date.now() - cached.ts < ttlMs) {
      return reapplyMatchHighlights(cached.data, params);
    }
  }

  for (const id of candidateIds) {
    try {
      const res = await fetch(`https://www.fotmob.com/api/data/tltable?leagueId=${id}`, {
        headers: FOTMOB_HEADERS,
        signal: AbortSignal.timeout(4500),
      });
      if (!res.ok) continue;
      const text = await res.text();
      if (!text || !text.trim()) continue;
      const parsed = parseFotmobTltableStandings(JSON.parse(text), params);
      if (parsed) {
        standingsCache.set(cacheKey, { data: parsed, ts: Date.now() });
        return parsed;
      }
    } catch {
      // try next league id or ESPN fallback
    }
  }

  if (espnAllowedSlug) {
    try {
      const res = await fetch(
        `https://site.api.espn.com/apis/v2/sports/soccer/${espnAllowedSlug}/standings?lang=es&region=es`,
        { signal: AbortSignal.timeout(4500) }
      );
      if (res.ok) {
        const raw = await res.json();
        const parsed = parseEspnStandingsFallback(raw, params);
        if (parsed) {
          standingsCache.set(cacheKey, { data: parsed, ts: Date.now() });
          return parsed;
        }
      }
    } catch {
      // ignore fallback error
    }
  }

  return cached ? reapplyMatchHighlights(cached.data, params) : undefined;
}
