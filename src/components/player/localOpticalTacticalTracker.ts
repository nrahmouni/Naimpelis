import type { AppLanguage, FootballMatchDetails } from '../../types';
import { pickLang } from '../../utils/i18n';
import {
  computeMatchTiltPct,
  deriveDangerZone,
  derivePhaseFromPitch,
  projectLiveLineupsToPitch,
} from './tacticalPitchEngine';
import {
  colorDist,
  computeHotspotSalience,
  detectHotspotCarrierTeam,
  hexToRgb,
  isSecondHalfPeriod,
  mapTvXToPitchX,
  type OpticalForegroundSample,
} from './opticalKitAndMotion';
import type {
  TacticalAttackVector,
  TacticalPhaseType,
  TacticalVisionAnalysis,
} from './tacticalVisionTypes';

export interface OpticalGeminiCalibration {
  homeAttacksRightToLeftOnTv?: boolean;
  observedHomeKitHex?: string;
  observedAwayKitHex?: string;
  lastAnchorAtMs?: number;
  anchorBallX?: number;
  anchorBallY?: number;
  anchorAttackDirection?: 'home' | 'away' | 'neutral';
  anchorPhaseType?: TacticalPhaseType;
}

export interface OpticalRosterItem {
  jersey?: string;
  name?: string;
  shortName?: string;
  position?: string;
}

export interface OpticalStatItem {
  label?: string;
  homeValue?: string;
  awayValue?: string;
}

export interface OpticalTrackerMemory {
  prevLuma: Uint8Array | null;
  homePossFrames: number;
  awayPossFrames: number;
  homeAttacksCount: number;
  awayAttacksCount: number;
  homeDangerousCount: number;
  awayDangerousCount: number;
  homeCentroid: [number, number, number] | null;
  awayCentroid: [number, number, number] | null;
  smoothBallX: number;
  smoothBallY: number;
  prevSmoothBallX: number;
  smoothAttackTilt: number; // -100..+100 hysteretic
  leftEnergy: number;
  centerEnergy: number;
  rightEnergy: number;
  lastZoneTickTeam: 'home' | 'away' | null;
  zoneDwellTicks: number;
}

export function createOpticalTrackerMemory(): OpticalTrackerMemory {
  return {
    prevLuma: null,
    homePossFrames: 2,
    awayPossFrames: 2,
    homeAttacksCount: 3,
    awayAttacksCount: 3,
    homeDangerousCount: 1,
    awayDangerousCount: 1,
    homeCentroid: null,
    awayCentroid: null,
    smoothBallX: 500,
    smoothBallY: 500,
    prevSmoothBallX: 500,
    smoothAttackTilt: 0,
    leftEnergy: 33,
    centerEnergy: 34,
    rightEnergy: 33,
    lastZoneTickTeam: null,
    zoneDwellTicks: 0,
  };
}

function isGrassPixel(r: number, g: number, b: number): boolean {
  return g >= 42 && g > r * 1.06 && g > b * 1.08 && Math.abs(r - b) < 92;
}

function isWhiteLinePixel(r: number, g: number, b: number): boolean {
  return r > 178 && g > 178 && b > 178 && Math.max(r, g, b) - Math.min(r, g, b) < 35;
}

function toReadableHex(rgb: [number, number, number], fallback: string): string {
  const max = Math.max(rgb[0], rgb[1], rgb[2]);
  const min = Math.min(rgb[0], rgb[1], rgb[2]);
  if (max < 42 || max - min < 18) return fallback;
  const r = Math.min(255, Math.max(28, Math.round(rgb[0])));
  const g = Math.min(255, Math.max(28, Math.round(rgb[1])));
  const b = Math.min(255, Math.max(28, Math.round(rgb[2])));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
}

function extractPossessionFromStats(liveStats?: OpticalStatItem[]): { homePct: number; awayPct: number } | null {
  if (!Array.isArray(liveStats)) return null;
  for (const s of liveStats) {
    if (!/pos(es|ses)i[oó]n|possession/i.test(String(s.label || ''))) continue;
    const h = parseFloat(String(s.homeValue || '').replace(/[^\d.]/g, ''));
    const a = parseFloat(String(s.awayValue || '').replace(/[^\d.]/g, ''));
    if (Number.isFinite(h) && Number.isFinite(a) && h + a > 0) {
      const homePct = Math.max(15, Math.min(85, Math.round((h / (h + a)) * 100)));
      return { homePct, awayPct: 100 - homePct };
    }
  }
  return null;
}

export function analyzeMatchFrameOptically(
  source: HTMLVideoElement | HTMLImageElement,
  params: {
    lang: AppLanguage;
    homeTeam: string;
    awayTeam: string;
    statusLabel?: string;
    tvClock?: string;
    details?: FootballMatchDetails | null;
    liveStats?: OpticalStatItem[];
    memory: OpticalTrackerMemory;
    geminiCalibration?: OpticalGeminiCalibration | null;
  }
): { ok: true; analysis: TacticalVisionAnalysis } | { ok: false; reason: 'not_ready' | 'cors_blocked' } {
  const isVideo = 'videoWidth' in source;
  const srcW = isVideo ? source.videoWidth : source.naturalWidth;
  const srcH = isVideo ? source.videoHeight : source.naturalHeight;

  if (isVideo && source.readyState < 2) return { ok: false, reason: 'not_ready' };
  if (!srcW || !srcH || srcW < 64 || srcH < 64) return { ok: false, reason: 'not_ready' };

  const W = 192;
  const H = 108;

  try {
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) return { ok: false, reason: 'not_ready' };

    ctx.drawImage(source, 0, 0, W, H);
    const imgData = ctx.getImageData(0, 0, W, H).data;

    const currLuma = new Uint8Array(W * H);
    const grassMask = new Uint8Array(W * H);
    let pitchPixels = 0;
    let pitchGrassPixels = 0;
    let leftWhiteLines = 0;
    let rightWhiteLines = 0;
    let centerWhiteLines = 0;

    const pitchTopRow = Math.floor(H * 0.16);
    const pitchBottomRow = Math.floor(H * 0.91);

    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        const idx = y * W + x;
        const p = idx * 4;
        const r = imgData[p];
        const g = imgData[p + 1];
        const b = imgData[p + 2];
        currLuma[idx] = Math.round(0.299 * r + 0.587 * g + 0.114 * b);
        const green = isGrassPixel(r, g, b);
        if (green) grassMask[idx] = 1;
        if (y >= pitchTopRow && y <= pitchBottomRow) {
          pitchPixels++;
          if (green) pitchGrassPixels++;
          else if (isWhiteLinePixel(r, g, b)) {
            if (x < W * 0.3) leftWhiteLines++;
            else if (x > W * 0.7) rightWhiteLines++;
            else if (x > W * 0.42 && x < W * 0.58) centerWhiteLines++;
          }
        }
      }
    }

    const prevLuma = params.memory.prevLuma;
    params.memory.prevLuma = currLuma;

    const pitchRatio = pitchPixels > 0 ? pitchGrassPixels / pitchPixels : 0;
    const statsPoss = extractPossessionFromStats(params.liveStats);
    const detailsHomeColor = params.details?.homeColor || '#00F593';
    const detailsAwayColor = params.details?.awayColor || '#9146FF';
    const mirrorHorizontal =
      params.geminiCalibration?.homeAttacksRightToLeftOnTv ??
      isSecondHalfPeriod(params.statusLabel || params.details?.statusLabel, params.tvClock);

    // Close-up or replay: preserve smoothed ball zone, keep 11v11 lineup dots live, and stay coherent
    if (pitchRatio < 0.2) {
      const homePct =
        statsPoss?.homePct ??
        Math.round(
          (params.memory.homePossFrames /
            Math.max(1, params.memory.homePossFrames + params.memory.awayPossFrames)) *
            100
        );
      const tiltDir: 'home' | 'away' | 'neutral' =
        params.memory.smoothAttackTilt > 10
          ? 'home'
          : params.memory.smoothAttackTilt < -10
            ? 'away'
            : 'neutral';
      const intensity = Math.min(84, Math.max(20, Math.round(Math.abs(params.memory.smoothAttackTilt) * 1.1)));
      const players = projectLiveLineupsToPitch({
        homeTeam: params.homeTeam,
        awayTeam: params.awayTeam,
        homeLineup: params.details?.homeLineup,
        awayLineup: params.details?.awayLineup,
        ballX: params.memory.smoothBallX,
        ballY: params.memory.smoothBallY,
        possessionTeam: tiltDir === 'neutral' ? 'contested' : tiltDir,
        attackDirection: tiltDir,
        attackIntensity: intensity,
      });
      const { homeTiltPct, awayTiltPct } = computeMatchTiltPct({
        homePossessionPct: homePct,
        attackDirection: tiltDir,
        attackIntensity: intensity,
        details: params.details,
        preferLiveVisualTilt: true,
      });

      const totalLane = Math.max(
        1,
        params.memory.leftEnergy + params.memory.centerEnergy + params.memory.rightEnergy
      );
      return {
        ok: true,
        analysis: {
          engineMode: 'optical_local',
          isMatchPitchVisible: false,
          cameraAngle: 'replay_or_studio',
          homeKitColor: detailsHomeColor,
          awayKitColor: detailsAwayColor,
          ballZone: { x: params.memory.smoothBallX, y: params.memory.smoothBallY },
          attackDirection: tiltDir,
          attackIntensity: intensity,
          dangerZone: deriveDangerZone(params.memory.smoothBallX),
          phaseType: derivePhaseFromPitch(params.memory.smoothBallX, tiltDir, intensity),
          homeTiltPct,
          awayTiltPct,
          laneActivity: {
            leftPct: Math.round((params.memory.leftEnergy / totalLane) * 100),
            centerPct: Math.round((params.memory.centerEnergy / totalLane) * 100),
            rightPct: Math.max(
              8,
              100 -
                Math.round((params.memory.leftEnergy / totalLane) * 100) -
                Math.round((params.memory.centerEnergy / totalLane) * 100)
            ),
          },
          possession: {
            team: tiltDir === 'neutral' ? 'contested' : tiltDir,
            homePct,
            awayPct: 100 - homePct,
            zoneLabel: pickLang(params.lang, {
              es: 'Plano cerrado · Bloque táctico activo',
              ca: 'Pla tancat · Bloc tàctic actiu',
              en: 'Close-up · Tactical block held',
            }),
            summary: pickLang(params.lang, {
              es: 'Cámara en plano corto; alineación y tendencia fijadas.',
              ca: 'Càmera en pla curt; alineació i tendència fixades.',
              en: 'Close camera angle; lineups and flow held steady.',
            }),
          },
          players,
          passingLines: [],
          attacks: [],
          attacksSummary: {
            homeAttacks: params.memory.homeAttacksCount,
            awayAttacks: params.memory.awayAttacksCount,
            homeDangerousAttacks: params.memory.homeDangerousCount,
            awayDangerousAttacks: params.memory.awayDangerousCount,
            phaseLabel: pickLang(params.lang, {
              es: 'Plano cerrado / Repetición',
              ca: 'Pla tancat / Repetició',
              en: 'Close-up / Replay',
            }),
          },
          tacticalNote: pickLang(params.lang, {
            es: 'Plano cerrado en retransmisión; manteniendo dibujo 11v11 y última tendencia de ataque.',
            ca: 'Pla tancat en retransmissió; mantenint dibuix 11v11 i última tendència.',
            en: 'Close-up broadcast view; holding 11v11 shape and latest attack flow.',
          }),
        },
      };
    }

    // Macro-grid foreground & motion scan inside pitch bounds
    const cols = 24;
    const rows = 14;
    const cellW = Math.floor((W * 0.92) / cols);
    const cellH = Math.floor((H * 0.72) / rows);
    const startX = Math.floor(W * 0.04);
    const startY = Math.floor(H * 0.17);

    let rawLeftLane = 0;
    let rawCenterLane = 0;
    let rawRightLane = 0;
    let motionWeightSum = 0;
    let weightedScreenX = 0;
    let weightedScreenY = 0;

    const fgSamples: OpticalForegroundSample[] = [];

    for (let rIdx = 0; rIdx < rows; rIdx++) {
      for (let cIdx = 0; cIdx < cols; cIdx++) {
        const x0 = startX + cIdx * cellW;
        const y0 = startY + rIdx * cellH;
        let total = 0;
        let fgCount = 0;
        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        let motionSum = 0;

        for (let yy = y0; yy < y0 + cellH && yy < H; yy++) {
          for (let xx = x0; xx < x0 + cellW && xx < W; xx++) {
            const pIdx = yy * W + xx;
            total++;
            if (!grassMask[pIdx]) {
              const p4 = pIdx * 4;
              fgCount++;
              sumR += imgData[p4];
              sumG += imgData[p4 + 1];
              sumB += imgData[p4 + 2];
            }
            if (prevLuma) {
              motionSum += Math.abs(currLuma[pIdx] - prevLuma[pIdx]);
            }
          }
        }

        const avgMotion = total > 0 ? motionSum / total : 0;
        const fgRatio = total > 0 ? fgCount / total : 0;
        const normX = Math.round(((startX + (cIdx + 0.5) * cellW) / W) * 1000);
        const normY = Math.round(((startY + (rIdx + 0.5) * cellH) / H) * 1000);

        if (rIdx >= 2 && rIdx <= 11) {
          if (rIdx <= 4) rawLeftLane += avgMotion * 1.4 + fgRatio * 4;
          else if (rIdx >= 9) rawRightLane += avgMotion * 1.4 + fgRatio * 4;
          else rawCenterLane += avgMotion * 1.4 + fgRatio * 4;
        }

        // Ignore broadcast scorebug top-left / top-right corners
        if (normY < 200 && (normX < 360 || normX > 780)) continue;

        if (fgRatio >= 0.1 && fgRatio <= 0.78) {
          const salience = computeHotspotSalience(avgMotion, fgRatio);
          motionWeightSum += salience;
          weightedScreenX += normX * salience;
          weightedScreenY += normY * salience;
          if (fgCount > 0) {
            fgSamples.push({
              x: normX,
              y: normY,
              r: sumR / fgCount,
              g: sumG / fgCount,
              b: sumB / fgCount,
              w: salience,
              motion: avgMotion,
            });
          }
        }
      }
    }

    // Smooth lane activity responsively
    const laneSum = Math.max(1, rawLeftLane + rawCenterLane + rawRightLane);
    params.memory.leftEnergy = params.memory.leftEnergy * 0.48 + (rawLeftLane / laneSum) * 100 * 0.52;
    params.memory.centerEnergy = params.memory.centerEnergy * 0.48 + (rawCenterLane / laneSum) * 100 * 0.52;
    params.memory.rightEnergy = params.memory.rightEnergy * 0.48 + (rawRightLane / laneSum) * 100 * 0.52;
    const smoothLaneSum = Math.max(
      1,
      params.memory.leftEnergy + params.memory.centerEnergy + params.memory.rightEnergy
    );
    const leftPct = Math.max(12, Math.min(68, Math.round((params.memory.leftEnergy / smoothLaneSum) * 100)));
    const centerPct = Math.max(16, Math.min(68, Math.round((params.memory.centerEnergy / smoothLaneSum) * 100)));
    const rightPct = Math.max(10, 100 - leftPct - centerPct);

    // Estimate camera third in TV space then mirror into canonical 2D pitch coordinates
    const lineTotal = Math.max(1, leftWhiteLines + centerWhiteLines + rightWhiteLines);
    const leftDensity = leftWhiteLines / lineTotal;
    const rightDensity = rightWhiteLines / lineTotal;
    let cameraPitchBiasTvX = 500;
    let cameraAngle: 'wide_tactical' | 'attacking_third' = 'wide_tactical';
    if (rightDensity > 0.54 && rightWhiteLines > 42) {
      cameraPitchBiasTvX = 775;
      cameraAngle = 'attacking_third';
    } else if (leftDensity > 0.54 && leftWhiteLines > 42) {
      cameraPitchBiasTvX = 225;
      cameraAngle = 'attacking_third';
    }

    const screenCenterX = motionWeightSum > 0 ? weightedScreenX / motionWeightSum : 500;
    const screenCenterY = motionWeightSum > 0 ? weightedScreenY / motionWeightSum : 500;
    const rawTvBallX = cameraPitchBiasTvX * 0.28 + screenCenterX * 0.72;
    const estBallX = mapTvXToPitchX(rawTvBallX, mirrorHorizontal);
    const estBallY = Math.max(55, Math.min(945, Math.round(mirrorHorizontal ? 1000 - screenCenterY : screenCenterY)));

    params.memory.prevSmoothBallX = params.memory.smoothBallX;
    params.memory.smoothBallX = Math.round(params.memory.smoothBallX * 0.42 + estBallX * 0.58);
    params.memory.smoothBallY = Math.round(params.memory.smoothBallY * 0.42 + estBallY * 0.58);

    // Maintain live kit RGB centroids (respecting 2nd-half side flip!) and display hexes
    let homeKitColor = detailsHomeColor;
    let awayKitColor = detailsAwayColor;
    if (fgSamples.length >= 6) {
      const sorted = [...fgSamples].sort((a, b) => a.x - b.x);
      const leftHalf = sorted.slice(0, Math.floor(sorted.length / 2));
      const rightHalf = sorted.slice(Math.floor(sorted.length / 2));
      const avgRgb = (arr: typeof fgSamples): [number, number, number] => [
        arr.reduce((s, x) => s + x.r, 0) / Math.max(1, arr.length),
        arr.reduce((s, x) => s + x.g, 0) / Math.max(1, arr.length),
        arr.reduce((s, x) => s + x.b, 0) / Math.max(1, arr.length),
      ];
      const cLeft = avgRgb(leftHalf);
      const cRight = avgRgb(rightHalf);
      const cHome = mirrorHorizontal ? cRight : cLeft;
      const cAway = mirrorHorizontal ? cLeft : cRight;
      if (!params.memory.homeCentroid) params.memory.homeCentroid = cHome;
      else if (colorDist(params.memory.homeCentroid, cHome) < 95) {
        params.memory.homeCentroid = [
          params.memory.homeCentroid[0] * 0.8 + cHome[0] * 0.2,
          params.memory.homeCentroid[1] * 0.8 + cHome[1] * 0.2,
          params.memory.homeCentroid[2] * 0.8 + cHome[2] * 0.2,
        ];
      }
      if (!params.memory.awayCentroid) params.memory.awayCentroid = cAway;
      else if (colorDist(params.memory.awayCentroid, cAway) < 95) {
        params.memory.awayCentroid = [
          params.memory.awayCentroid[0] * 0.8 + cAway[0] * 0.2,
          params.memory.awayCentroid[1] * 0.8 + cAway[1] * 0.2,
          params.memory.awayCentroid[2] * 0.8 + cAway[2] * 0.2,
        ];
      }
      if (!params.details?.homeColor) {
        homeKitColor = toReadableHex(params.memory.homeCentroid, '#00F593');
        awayKitColor = toReadableHex(params.memory.awayCentroid, '#9146FF');
        if (homeKitColor.toLowerCase() === awayKitColor.toLowerCase()) awayKitColor = '#9146FF';
      }
    }

    const matchHomeRgb =
      hexToRgb(params.geminiCalibration?.observedHomeKitHex) ||
      hexToRgb(params.details?.homeColor) ||
      params.memory.homeCentroid;
    const matchAwayRgb =
      hexToRgb(params.geminiCalibration?.observedAwayKitHex) ||
      hexToRgb(params.details?.awayColor) ||
      params.memory.awayCentroid;
    const hotspotCarrier = detectHotspotCarrierTeam(fgSamples, matchHomeRgb, matchAwayRgb);

    // Responsive attack tilt (-100 Away <-> +100 Home) blending pitch territory + velocity + hotspot kit color
    const ballDeltaX = params.memory.smoothBallX - params.memory.prevSmoothBallX;
    const carrierBoost = hotspotCarrier === 'home' ? 28 : hotspotCarrier === 'away' ? -28 : 0;
    const rawZoneTilt = (params.memory.smoothBallX - 500) / 4.4 + ballDeltaX * 0.95 + carrierBoost;
    params.memory.smoothAttackTilt =
      params.memory.smoothAttackTilt * 0.44 + Math.max(-100, Math.min(100, rawZoneTilt)) * 0.56;

    const attackDirection: 'home' | 'away' | 'neutral' =
      params.memory.smoothAttackTilt > 9
        ? 'home'
        : params.memory.smoothAttackTilt < -9
          ? 'away'
          : hotspotCarrier;
    const attackIntensity = Math.min(95, Math.max(22, Math.round(Math.abs(params.memory.smoothAttackTilt) * 1.28)));

    if (attackDirection === 'home') params.memory.homePossFrames++;
    else if (attackDirection === 'away') params.memory.awayPossFrames++;

    // Count structured attacks only when sustaining possession in attacking third
    if (attackDirection !== 'neutral' && (params.memory.smoothBallX > 650 || params.memory.smoothBallX < 350)) {
      if (params.memory.lastZoneTickTeam === attackDirection) {
        params.memory.zoneDwellTicks++;
        if (params.memory.zoneDwellTicks === 3) {
          if (attackDirection === 'home') {
            params.memory.homeAttacksCount = Math.min(99, params.memory.homeAttacksCount + 1);
            if (params.memory.smoothBallX > 780) params.memory.homeDangerousCount++;
          } else {
            params.memory.awayAttacksCount = Math.min(99, params.memory.awayAttacksCount + 1);
            if (params.memory.smoothBallX < 220) params.memory.awayDangerousCount++;
          }
        }
      } else {
        params.memory.lastZoneTickTeam = attackDirection;
        params.memory.zoneDwellTicks = 1;
      }
    } else {
      params.memory.zoneDwellTicks = 0;
    }

    const rollingHomePct = Math.max(
      25,
      Math.min(
        75,
        Math.round(
          (params.memory.homePossFrames /
            Math.max(1, params.memory.homePossFrames + params.memory.awayPossFrames)) *
            100
        )
      )
    );
    const homePct = statsPoss?.homePct ?? rollingHomePct;
    const awayPct = 100 - homePct;

    const possessionTeam: 'home' | 'away' | 'contested' =
      attackDirection !== 'neutral' ? attackDirection : 'contested';
    const dangerZone = deriveDangerZone(params.memory.smoothBallX);
    const phaseType = derivePhaseFromPitch(
      params.memory.smoothBallX,
      attackDirection,
      attackIntensity,
      params.memory.smoothBallY
    );
    const { homeTiltPct, awayTiltPct } = computeMatchTiltPct({
      homePossessionPct: homePct,
      attackDirection,
      attackIntensity,
      details: params.details,
      preferLiveVisualTilt: true,
    });

    const players = projectLiveLineupsToPitch({
      homeTeam: params.homeTeam,
      awayTeam: params.awayTeam,
      homeLineup: params.details?.homeLineup,
      awayLineup: params.details?.awayLineup,
      ballX: params.memory.smoothBallX,
      ballY: params.memory.smoothBallY,
      possessionTeam,
      attackDirection,
      attackIntensity,
    });

    const attacks: TacticalAttackVector[] =
      phaseType === 'goal_kick'
        ? [
            {
              id: 'opt-gk-launch',
              team: params.memory.smoothBallX <= 500 ? 'home' : 'away',
              fromX: params.memory.smoothBallX <= 500 ? 60 : 940,
              fromY: 500,
              toX: params.memory.smoothBallX <= 500 ? 540 : 460,
              toY: params.memory.smoothBallY < 500 ? 340 : 660,
              type: 'through_ball',
              label: pickLang(params.lang, {
                es: 'Saque de puerta',
                ca: 'Servei de porteria',
                en: 'Goal Kick',
              }),
            },
          ]
        : phaseType === 'corner'
          ? [
              {
                id: 'opt-corner-cross',
                team: params.memory.smoothBallX >= 500 ? 'home' : 'away',
                fromX: params.memory.smoothBallX >= 500 ? 985 : 15,
                fromY: params.memory.smoothBallY <= 500 ? 35 : 965,
                toX: params.memory.smoothBallX >= 500 ? 875 : 125,
                toY: 500,
                type: 'wing_attack',
                label: pickLang(params.lang, {
                  es: 'Saque de esquina',
                  ca: 'Córner',
                  en: 'Corner Kick',
                }),
              },
            ]
          : attackDirection === 'neutral'
            ? []
            : [
                {
                  id: 'opt-atk-1',
                  team: attackDirection,
                  fromX: params.memory.smoothBallX,
                  fromY: params.memory.smoothBallY,
                  toX:
                    attackDirection === 'home'
                      ? Math.min(960, params.memory.smoothBallX + 165)
                      : Math.max(40, params.memory.smoothBallX - 165),
                  toY: Math.max(
                    200,
                    Math.min(800, params.memory.smoothBallY + (params.memory.smoothBallY < 500 ? 60 : -60))
                  ),
                  type:
                    dangerZone === 'home_box' || dangerZone === 'away_box'
                      ? 'shot_threat'
                      : params.memory.smoothBallY < 320 || params.memory.smoothBallY > 680
                        ? 'wing_attack'
                        : 'through_ball',
                  label:
                    phaseType === 'dangerous_attack' || phaseType === 'shot_threat'
                      ? pickLang(params.lang, {
                          es: 'Ataque peligroso',
                          ca: 'Atac perillós',
                          en: 'Dangerous attack',
                        })
                      : pickLang(params.lang, {
                          es: 'Progresión ofensiva',
                          ca: 'Progressió ofensiva',
                          en: 'Attacking build-up',
                        }),
                },
              ];

    const zoneLabel =
      dangerZone === 'away_box'
        ? pickLang(params.lang, { es: `Área de ${params.awayTeam}`, ca: `Àrea de ${params.awayTeam}`, en: `${params.awayTeam} box` })
        : dangerZone === 'away_third'
          ? pickLang(params.lang, { es: `Campo de ${params.awayTeam}`, ca: `Camp de ${params.awayTeam}`, en: `${params.awayTeam} third` })
          : dangerZone === 'home_box'
            ? pickLang(params.lang, { es: `Área de ${params.homeTeam}`, ca: `Àrea de ${params.homeTeam}`, en: `${params.homeTeam} box` })
            : dangerZone === 'home_third'
              ? pickLang(params.lang, { es: `Campo de ${params.homeTeam}`, ca: `Camp de ${params.homeTeam}`, en: `${params.homeTeam} third` })
              : pickLang(params.lang, { es: 'Mediocampo', ca: 'Migcamp', en: 'Midfield' });

    const activeName =
      attackDirection === 'home'
        ? params.homeTeam
        : attackDirection === 'away'
          ? params.awayTeam
          : `${params.homeTeam} / ${params.awayTeam}`;

    return {
      ok: true,
      analysis: {
        engineMode: 'optical_local',
        isMatchPitchVisible: true,
        cameraAngle,
        homeAttacksRightToLeftOnTv: mirrorHorizontal,
        homeKitColor,
        awayKitColor,
        ballZone: { x: params.memory.smoothBallX, y: params.memory.smoothBallY },
        attackDirection,
        attackIntensity,
        dangerZone,
        phaseType,
        homeTiltPct,
        awayTiltPct,
        laneActivity: { leftPct, centerPct, rightPct },
        possession: {
          team: possessionTeam,
          homePct,
          awayPct,
          zoneLabel,
          summary: pickLang(params.lang, {
            es: `${activeName} empuja en ${zoneLabel.toLowerCase()}.`,
            ca: `${activeName} empeny a ${zoneLabel.toLowerCase()}.`,
            en: `${activeName} pushing in ${zoneLabel.toLowerCase()}.`,
          }),
        },
        players,
        passingLines: [],
        attacks,
        attacksSummary: {
          homeAttacks: params.memory.homeAttacksCount,
          awayAttacks: params.memory.awayAttacksCount,
          homeDangerousAttacks: params.memory.homeDangerousCount,
          awayDangerousAttacks: params.memory.awayDangerousCount,
          phaseLabel:
            phaseType === 'goal_kick'
              ? pickLang(params.lang, { es: 'Saque de puerta', ca: 'Servei de porteria', en: 'Goal Kick' })
              : phaseType === 'corner'
                ? pickLang(params.lang, { es: 'Saque de esquina', ca: 'Córner', en: 'Corner Kick' })
                : phaseType === 'dangerous_attack' || phaseType === 'shot_threat'
                  ? pickLang(params.lang, { es: 'Ataque peligroso', ca: 'Atac perillós', en: 'Dangerous Attack' })
                  : attackDirection !== 'neutral'
                    ? pickLang(params.lang, { es: 'Ataque en curso', ca: 'Atac en curs', en: 'Attacking Play' })
                    : pickLang(params.lang, { es: 'Juego en mediocampo', ca: 'Joc al migcamp', en: 'Midfield Battle' }),
        },
        tacticalNote: pickLang(params.lang, {
          es: `${activeName} carga por ${zoneLabel.toLowerCase()} · Carriles ${leftPct}% / ${centerPct}% / ${rightPct}%.`,
          ca: `${activeName} carrega per ${zoneLabel.toLowerCase()} · Carrils ${leftPct}% / ${centerPct}% / ${rightPct}%.`,
          en: `${activeName} pressing via ${zoneLabel.toLowerCase()} · Lanes ${leftPct}% / ${centerPct}% / ${rightPct}%.`,
        }),
      },
    };
  } catch {
    return { ok: false, reason: 'cors_blocked' };
  }
}
