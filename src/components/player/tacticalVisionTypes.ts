import type { FootballMatchDetails } from '../../types';

export type TacticalPhaseType =
  | 'dangerous_attack'
  | 'attack'
  | 'possession'
  | 'counter'
  | 'corner'
  | 'free_kick'
  | 'shot_threat'
  | 'goal_kick';

export type TacticalDangerZone =
  | 'home_box'
  | 'home_third'
  | 'midfield'
  | 'away_third'
  | 'away_box';

export type TacticalCameraAngle =
  | 'wide_tactical'
  | 'attacking_third'
  | 'box_closeup'
  | 'replay_or_studio';

export interface TacticalPlayerNode {
  id: string;
  name: string;
  shortName?: string;
  jersey?: string;
  team: 'home' | 'away';
  x: number; // 0..1000 full-pitch horizontal (0=Home goal, 1000=Away goal)
  y: number; // 0..1000 full-pitch vertical (0=top touchline, 1000=bottom touchline)
  hasBall: boolean;
  isGk?: boolean;
  roleHint?: string;
  rating?: string;
  goals?: number;
  assists?: number;
  yellowCard?: boolean;
  redCard?: boolean;
  isCaptain?: boolean;
  subInMinute?: string;
  subOutMinute?: string;
}

export interface TacticalPassingLine {
  fromId: string;
  toId: string;
  team: 'home' | 'away';
  kind: 'pass_link' | 'compact_line' | 'switch';
}

export interface TacticalAttackVector {
  id: string;
  team: 'home' | 'away';
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  type: 'through_ball' | 'wing_attack' | 'shot_threat' | 'counter';
  label: string;
}

export interface MomentumTimelineSample {
  id: string;
  label: string;
  value: number; // -100 (away dominant) .. +100 (home dominant)
}

export interface TacticalVisionAnalysis {
  engineMode?: 'gemini' | 'optical_local';
  isMatchPitchVisible: boolean;
  cameraAngle?: TacticalCameraAngle;
  homeKitColor: string;
  awayKitColor: string;
  ballZone?: {
    x: number; // 0..1000 full pitch X
    y: number; // 0..1000 full pitch Y
  };
  attackDirection?: 'home' | 'away' | 'neutral';
  attackIntensity?: number; // 0..100
  dangerZone?: TacticalDangerZone;
  phaseType?: TacticalPhaseType;
  homeLineHeight?: number; // 0..100
  awayLineHeight?: number; // 0..100
  homeTiltPct?: number; // 0..100 ("para donde tira el partido")
  awayTiltPct?: number;
  laneActivity?: {
    leftPct: number;
    centerPct: number;
    rightPct: number;
  };
  possession: {
    team: 'home' | 'away' | 'contested';
    homePct: number;
    awayPct: number;
    zoneLabel: string;
    summary: string;
  };
  players: TacticalPlayerNode[];
  passingLines: TacticalPassingLine[];
  attacks: TacticalAttackVector[];
  attacksSummary: {
    homeAttacks: number;
    awayAttacks: number;
    homeDangerousAttacks?: number;
    awayDangerousAttacks?: number;
    phaseLabel: string;
  };
  momentumHistory?: MomentumTimelineSample[];
  tacticalNote: string;
}

export interface PlayerMatchContext {
  homeTeam: string;
  awayTeam: string;
  homeShort?: string;
  awayShort?: string;
  homeLogo?: string;
  awayLogo?: string;
  homeScore?: string;
  awayScore?: string;
  statusLabel?: string;
  competition?: string;
  details?: FootballMatchDetails | null;
}

export type TacticalCaptureStatus =
  | 'idle'
  | 'ready'
  | 'waiting_frame'
  | 'cors_blocked'
  | 'unsupported_mode';
