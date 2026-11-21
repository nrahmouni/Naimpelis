import type { FootballMatchDetails } from '../../types';

export interface TacticalPlayerNode {
  id: string;
  name: string;
  jersey?: string;
  team: 'home' | 'away';
  x: number; // 0..1000 normalized frame coordinate
  y: number; // 0..1000 normalized frame coordinate
  hasBall: boolean;
  roleHint?: string;
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

export interface TacticalVisionAnalysis {
  engineMode?: 'gemini' | 'optical_local';
  isMatchPitchVisible: boolean;
  homeKitColor: string;
  awayKitColor: string;
  ballZone?: {
    x: number; // 0..1000 smoothed active play horizontal position
    y: number; // 0..1000 smoothed active play vertical position
  };
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
    phaseLabel: string;
  };
  tacticalNote: string;
}

export interface PlayerMatchContext {
  homeTeam: string;
  awayTeam: string;
  homeShort?: string;
  awayShort?: string;
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
