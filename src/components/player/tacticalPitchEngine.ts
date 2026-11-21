import type { FootballMatchDetails, FootballMatchLineupPlayer, FootballMatchLineupTeam } from '../../types';
import type {
  MomentumTimelineSample,
  TacticalDangerZone,
  TacticalPhaseType,
  TacticalPlayerNode,
  TacticalVisionAnalysis,
} from './tacticalVisionTypes';

const DEFAULT_HOME_FORMATION = '4-3-3';
const DEFAULT_AWAY_FORMATION = '4-2-3-1';

function buildSynthesizedStarters(teamLabel: string, formation: string): FootballMatchLineupPlayer[] {
  const cleanName = teamLabel.trim().slice(0, 10) || 'XI';
  const rows = formation
    .split('-')
    .map((n) => parseInt(n, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  const lines = [1, ...(rows.length > 0 ? rows : [4, 3, 3])];
  const roleNames = ['POR', 'DEF', 'MC', 'DEL'];
  const result: FootballMatchLineupPlayer[] = [];
  let cursor = 1;

  lines.forEach((count, rowIdx) => {
    const yDepth = 0.09 + (rowIdx / Math.max(1, lines.length - 1)) * 0.78;
    const role = roleNames[Math.min(roleNames.length - 1, rowIdx === lines.length - 1 && lines.length >= 4 ? 3 : rowIdx)];
    for (let i = 0; i < count && result.length < 11; i++) {
      const xSpread = count === 1 ? 0.5 : 0.14 + (i / Math.max(1, count - 1)) * 0.72;
      const jerseyNum = String(cursor);
      result.push({
        id: `synth-${cleanName}-${cursor}`,
        jersey: jerseyNum,
        name: `${role} ${jerseyNum}`,
        shortName: `${role} #${jerseyNum}`,
        position: role,
        starter: true,
        layout: { x: xSpread, y: yDepth },
      });
      cursor++;
    }
  });
  return result;
}

function normalizeTeamBaselines(
  lineup: FootballMatchLineupTeam | undefined,
  fallbackFormation: string,
  teamLabel: string
): Array<{ player: FootballMatchLineupPlayer; bx: number; by: number; isGk: boolean }> {
  const rawStarters =
    lineup?.starters && lineup.starters.length >= 7
      ? lineup.starters.slice(0, 11)
      : buildSynthesizedStarters(teamLabel, lineup?.formation || fallbackFormation);

  const formationParts = (lineup?.formation || fallbackFormation)
    .split('-')
    .map((n) => parseInt(n, 10))
    .filter((n) => Number.isFinite(n) && n > 0);
  const rows = [1, ...(formationParts.length > 0 ? formationParts : [4, 3, 3])];

  // Fallback depth/width grid if individual layout missing
  const fallbackGrid: Array<{ x: number; y: number }> = [];
  rows.forEach((count, rIdx) => {
    const yDepth = 0.09 + (rIdx / Math.max(1, rows.length - 1)) * 0.78;
    for (let c = 0; c < count; c++) {
      const xSpread = count === 1 ? 0.5 : 0.14 + (c / Math.max(1, count - 1)) * 0.72;
      fallbackGrid.push({ x: xSpread, y: yDepth });
    }
  });

  return rawStarters.map((player, idx) => {
    const isGk =
      idx === 0 ||
      /^(por|gk|goalkeeper|portero)$/i.test(String(player.position || '').trim());
    const coord = player.layout || fallbackGrid[idx] || { x: 0.5, y: 0.5 };
    // coord.y is depth from own goal (0.08..0.92), coord.x is lateral touchline (0.08..0.92)
    return {
      player,
      bx: Math.max(0.06, Math.min(0.94, coord.y)),
      by: Math.max(0.1, Math.min(0.9, coord.x)),
      isGk,
    };
  });
}

function shortSurname(player: FootballMatchLineupPlayer): string {
  const raw = String(player.shortName || player.name || '').trim();
  if (!raw) return `#${player.jersey || '?'}`;
  if (raw.includes('#')) return raw.slice(0, 12);
  const parts = raw.split(/\s+/);
  const candidate = parts.length >= 2 ? parts[parts.length - 1] : parts[0];
  return candidate.slice(0, 12);
}

export interface ProjectLiveLineupsParams {
  homeTeam: string;
  awayTeam: string;
  homeLineup?: FootballMatchLineupTeam;
  awayLineup?: FootballMatchLineupTeam;
  ballX: number; // 0..1000 full pitch
  ballY: number; // 0..1000 full pitch
  possessionTeam: 'home' | 'away' | 'contested';
  attackDirection: 'home' | 'away' | 'neutral';
  attackIntensity: number; // 0..100
  homeLineHeight?: number; // 0..100
  awayLineHeight?: number; // 0..100
}

/**
 * Maps all 22 players (11 Home + 11 Away) onto a unified horizontal full-pitch (0..1000 x 0..1000).
 * Home defends Left goal (x=0) and attacks Right (x=1000).
 * Away defends Right goal (x=1000) and attacks Left (x=0).
 * Players organically shift forward/backward and laterally around live play!
 */
export function projectLiveLineupsToPitch(params: ProjectLiveLineupsParams): TacticalPlayerNode[] {
  const {
    homeTeam,
    awayTeam,
    homeLineup,
    awayLineup,
    ballX,
    ballY,
    possessionTeam,
    attackDirection,
    attackIntensity,
  } = params;

  const ballNormX = Math.max(0.04, Math.min(0.96, ballX / 1000));
  const ballNormY = Math.max(0.08, Math.min(0.92, ballY / 1000));
  const intensityFactor = Math.max(0, Math.min(1, attackIntensity / 100));

  // Tactical push: Home block pushes up when ball is far right or Home is attacking
  const homePush =
    (ballNormX - 0.5) * 0.24 +
    (attackDirection === 'home' ? 0.08 * intensityFactor : attackDirection === 'away' ? -0.07 * intensityFactor : 0) +
    ((params.homeLineHeight ?? 50) - 50) / 500;

  // Away block pushes toward Left goal (lower X) when ball is in Home's half or Away is attacking
  const awayPush =
    (0.5 - ballNormX) * 0.24 +
    (attackDirection === 'away' ? 0.08 * intensityFactor : attackDirection === 'home' ? -0.07 * intensityFactor : 0) +
    ((params.awayLineHeight ?? 50) - 50) / 500;

  const lateralShift = (ballNormY - 0.5) * 0.14;

  const homeBase = normalizeTeamBaselines(homeLineup, DEFAULT_HOME_FORMATION, homeTeam);
  const awayBase = normalizeTeamBaselines(awayLineup, DEFAULT_AWAY_FORMATION, awayTeam);

  const nodes: TacticalPlayerNode[] = [];

  for (let idx = 0; idx < homeBase.length; idx++) {
    const item = homeBase[idx];
    const { player, bx, by, isGk } = item;
    let xNorm: number;
    let yNorm: number;
    if (isGk) {
      xNorm = 0.055 + Math.max(0, (ballNormX - 0.45) * 0.08);
      yNorm = 0.5 + (ballNormY - 0.5) * 0.18;
    } else {
      // Base home depth spans 0.13..0.54 (can surge up to ~0.88 during heavy attack)
      const baseX = 0.12 + bx * 0.46;
      const elasticity = 0.72 + bx * 0.55;
      xNorm = Math.max(0.11, Math.min(0.9, baseX + homePush * elasticity));
      yNorm = Math.max(0.1, Math.min(0.9, by + lateralShift * (0.45 + bx * 0.4)));
    }
    nodes.push({
      id: `home-${player.id || idx}`,
      name: player.name,
      shortName: shortSurname(player),
      jersey: player.jersey || String(idx + 1),
      team: 'home',
      x: Math.round(xNorm * 1000),
      y: Math.round(yNorm * 1000),
      hasBall: false,
      isGk,
      roleHint: player.position,
      rating: player.rating,
      goals: player.goals,
      assists: player.assists,
      yellowCard: player.yellowCard,
      redCard: player.redCard,
      isCaptain: player.isCaptain,
      subInMinute: player.subInMinute,
      subOutMinute: player.subOutMinute,
    });
  }

  for (let idx = 0; idx < awayBase.length; idx++) {
    const item = awayBase[idx];
    const { player, bx, by, isGk } = item;
    let xNorm: number;
    let yNorm: number;
    if (isGk) {
      xNorm = 0.945 - Math.max(0, (0.55 - ballNormX) * 0.08);
      yNorm = 0.5 + (ballNormY - 0.5) * 0.18;
    } else {
      // Mirror: Away defends Right (0.94) -> midfield (0.46)
      const baseX = 0.88 - bx * 0.46;
      const elasticity = 0.72 + bx * 0.55;
      xNorm = Math.max(0.1, Math.min(0.89, baseX - awayPush * elasticity));
      // Mirror lateral width so LB/RB stay correct relative to facing goal
      yNorm = Math.max(0.1, Math.min(0.9, 1 - by + lateralShift * (0.45 + bx * 0.4)));
    }
    nodes.push({
      id: `away-${player.id || idx}`,
      name: player.name,
      shortName: shortSurname(player),
      jersey: player.jersey || String(idx + 1),
      team: 'away',
      x: Math.round(xNorm * 1000),
      y: Math.round(yNorm * 1000),
      hasBall: false,
      isGk,
      roleHint: player.position,
      rating: player.rating,
      goals: player.goals,
      assists: player.assists,
      yellowCard: player.yellowCard,
      redCard: player.redCard,
      isCaptain: player.isCaptain,
      subInMinute: player.subInMinute,
      subOutMinute: player.subOutMinute,
    });
  }

  // Assign active carrier dot cleanly to the closest player of the team in possession
  const carrierTeam = possessionTeam !== 'contested' ? possessionTeam : attackDirection;
  const pool =
    carrierTeam === 'home'
      ? nodes.filter((n) => n.team === 'home')
      : carrierTeam === 'away'
        ? nodes.filter((n) => n.team === 'away')
        : nodes;

  let bestNode: TacticalPlayerNode | null = null;
  let bestDist = Infinity;
  for (const n of pool) {
    if (n.isGk && ballX > 180 && ballX < 820) continue;
    const d = Math.hypot(n.x - ballX, n.y - ballY);
    if (d < bestDist) {
      bestDist = d;
      bestNode = n;
    }
  }
  if (bestNode) {
    bestNode.hasBall = true;
  }

  return nodes;
}

export function deriveDangerZone(ballX: number): TacticalDangerZone {
  if (ballX >= 820) return 'away_box';
  if (ballX >= 620) return 'away_third';
  if (ballX <= 180) return 'home_box';
  if (ballX <= 380) return 'home_third';
  return 'midfield';
}

export function derivePhaseFromPitch(
  ballX: number,
  attackDirection: 'home' | 'away' | 'neutral',
  attackIntensity: number,
  ballY = 500
): TacticalPhaseType {
  // Corner quadrants
  if ((ballX <= 105 || ballX >= 895) && (ballY <= 185 || ballY >= 815)) {
    return 'corner';
  }
  // Goal kicks from 6-yard box
  if (
    (ballX <= 125 && ballY >= 285 && ballY <= 715 && attackDirection !== 'away') ||
    (ballX >= 875 && ballY >= 285 && ballY <= 715 && attackDirection !== 'home')
  ) {
    return 'goal_kick';
  }
  if (attackDirection === 'home') {
    if (ballX >= 830 && attackIntensity >= 68) return 'shot_threat';
    if (ballX >= 680 || attackIntensity >= 65) return 'dangerous_attack';
    if (ballX >= 480) return 'attack';
    return 'possession';
  }
  if (attackDirection === 'away') {
    if (ballX <= 170 && attackIntensity >= 68) return 'shot_threat';
    if (ballX <= 320 || attackIntensity >= 65) return 'dangerous_attack';
    if (ballX <= 520) return 'attack';
    return 'possession';
  }
  return 'possession';
}

export function computeMatchTiltPct(params: {
  homePossessionPct: number;
  attackDirection: 'home' | 'away' | 'neutral';
  attackIntensity: number;
  details?: FootballMatchDetails | null;
}): { homeTiltPct: number; awayTiltPct: number } {
  let score = (params.homePossessionPct - 50) * 0.65;
  if (params.attackDirection === 'home') {
    score += 10 + (params.attackIntensity / 100) * 24;
  } else if (params.attackDirection === 'away') {
    score -= 10 + (params.attackIntensity / 100) * 24;
  }

  const momentum = params.details?.momentum;
  if (momentum && momentum.length > 0) {
    const recent = momentum.slice(-5);
    const avg = recent.reduce((acc, m) => acc + m.value, 0) / recent.length;
    score += Math.max(-20, Math.min(20, avg * 0.35));
  }

  const homeTiltPct = Math.max(15, Math.min(85, Math.round(50 + score)));
  return { homeTiltPct, awayTiltPct: 100 - homeTiltPct };
}

export function buildMomentumTimeline(
  details: FootballMatchDetails | null | undefined,
  rollingSamples: MomentumTimelineSample[]
): MomentumTimelineSample[] {
  const realMomentum = details?.momentum;
  if (realMomentum && realMomentum.length >= 4) {
    return realMomentum.slice(-24).map((m, idx) => ({
      id: `fm-${m.minute}-${idx}`,
      label: `${m.minute}'`,
      value: Math.max(-100, Math.min(100, Math.round(m.value))),
    }));
  }
  return rollingSamples.slice(-20);
}
