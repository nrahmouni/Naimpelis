import type { AppLanguage } from '../../types';
import { pickLang } from '../../utils/i18n';
import type {
  TacticalAttackVector,
  TacticalPassingLine,
  TacticalPlayerNode,
  TacticalVisionAnalysis,
} from './tacticalVisionTypes';

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
  homeCentroid: [number, number, number] | null;
  awayCentroid: [number, number, number] | null;
  smoothBallX: number;
  smoothBallY: number;
  leftEnergy: number;
  centerEnergy: number;
  rightEnergy: number;
}

export function createOpticalTrackerMemory(): OpticalTrackerMemory {
  return {
    prevLuma: null,
    homePossFrames: 1,
    awayPossFrames: 1,
    homeAttacksCount: 1,
    awayAttacksCount: 1,
    homeCentroid: null,
    awayCentroid: null,
    smoothBallX: 500,
    smoothBallY: 500,
    leftEnergy: 33,
    centerEnergy: 34,
    rightEnergy: 33,
  };
}

interface BlobCandidate {
  x: number; // 0..1000
  y: number; // 0..1000
  r: number;
  g: number;
  b: number;
  salience: number;
  motion: number;
}

function isGrassPixel(r: number, g: number, b: number): boolean {
  return g >= 44 && g > r * 1.07 && g > b * 1.09 && Math.abs(r - b) < 88;
}

function rgbDist(a: [number, number, number], b: [number, number, number]): number {
  const dr = a[0] - b[0];
  const dg = a[1] - b[1];
  const db = a[2] - b[2];
  return Math.sqrt(dr * dr + dg * dg + db * db);
}

function toReadableHex(rgb: [number, number, number], fallback: string): string {
  const max = Math.max(rgb[0], rgb[1], rgb[2]);
  const min = Math.min(rgb[0], rgb[1], rgb[2]);
  if (max < 45 || max - min < 16) return fallback;
  const r = Math.min(255, Math.max(24, Math.round(rgb[0])));
  const g = Math.min(255, Math.max(24, Math.round(rgb[1])));
  const b = Math.min(255, Math.max(24, Math.round(rgb[2])));
  return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b
    .toString(16)
    .padStart(2, '0')}`;
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

function pickRosterLabel(
  team: 'home' | 'away',
  idx: number,
  x: number,
  y: number,
  roster: OpticalRosterItem[] | undefined,
  lang: AppLanguage
): { name: string; jersey?: string; roleHint: string } {
  const validRoster = (Array.isArray(roster) ? roster : []).filter(
    (p) => (p.shortName || p.name || '').trim().length > 0
  );
  if (validRoster.length > 0) {
    const mapped = validRoster[idx % validRoster.length];
    const fullName = String(mapped.shortName || mapped.name || '').trim();
    const surname = fullName.split(/\s+/).slice(-1)[0] || fullName;
    return {
      name: surname.slice(0, 18),
      jersey: mapped.jersey ? String(mapped.jersey).trim().slice(0, 3) : undefined,
      roleHint: String(mapped.position || '').trim().slice(0, 16),
    };
  }

  const zoneRole =
    x < 260
      ? pickLang(lang, { es: 'Zaga', ca: 'Defensa', en: 'Def' })
      : x > 740
        ? pickLang(lang, { es: 'Ataque', ca: 'Atac', en: 'Fwd' })
        : y < 340 || y > 680
          ? pickLang(lang, { es: 'Banda', ca: 'Banda', en: 'Wing' })
          : pickLang(lang, { es: 'Medio', ca: 'Mig', en: 'Mid' });

  const jerseyNum = team === 'home' ? String((idx % 10) + 2) : String(((idx + 5) % 10) + 2);
  return {
    name: `${zoneRole} #${jerseyNum}`,
    jersey: jerseyNum,
    roleHint: zoneRole,
  };
}

export function analyzeMatchFrameOptically(
  source: HTMLVideoElement | HTMLImageElement,
  params: {
    lang: AppLanguage;
    homeTeam: string;
    awayTeam: string;
    homeRoster?: OpticalRosterItem[];
    awayRoster?: OpticalRosterItem[];
    liveStats?: OpticalStatItem[];
    memory: OpticalTrackerMemory;
  }
): { ok: true; analysis: TacticalVisionAnalysis } | { ok: false; reason: 'not_ready' | 'cors_blocked' } {
  const isVideo = 'videoWidth' in source;
  const srcW = isVideo ? source.videoWidth : source.naturalWidth;
  const srcH = isVideo ? source.videoHeight : source.naturalHeight;

  if (isVideo && source.readyState < 2) {
    return { ok: false, reason: 'not_ready' };
  }
  if (!srcW || !srcH || srcW < 64 || srcH < 64) {
    return { ok: false, reason: 'not_ready' };
  }

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

    // 1. Measure grass coverage & build downsampled luma map
    const currLuma = new Uint8Array(W * H);
    const grassMask = new Uint8Array(W * H);
    let pitchPixels = 0;
    let pitchGrassPixels = 0;

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
        }
      }
    }

    const prevLuma = params.memory.prevLuma;
    params.memory.prevLuma = currLuma;

    const pitchRatio = pitchPixels > 0 ? pitchGrassPixels / pitchPixels : 0;
    const statsPoss = extractPossessionFromStats(params.liveStats);
    const totalLane = Math.max(
      1,
      params.memory.leftEnergy + params.memory.centerEnergy + params.memory.rightEnergy
    );
    const currentLaneActivity = {
      leftPct: Math.round((params.memory.leftEnergy / totalLane) * 100),
      centerPct: Math.round((params.memory.centerEnergy / totalLane) * 100),
      rightPct: Math.max(
        5,
        100 -
          Math.round((params.memory.leftEnergy / totalLane) * 100) -
          Math.round((params.memory.centerEnergy / totalLane) * 100)
      ),
    };

    if (pitchRatio < 0.22) {
      const homePct =
        statsPoss?.homePct ??
        Math.round(
          (params.memory.homePossFrames /
            Math.max(1, params.memory.homePossFrames + params.memory.awayPossFrames)) *
            100
        );
      return {
        ok: true,
        analysis: {
          engineMode: 'optical_local',
          isMatchPitchVisible: false,
          homeKitColor: '#00F593',
          awayKitColor: '#9146FF',
          ballZone: { x: params.memory.smoothBallX, y: params.memory.smoothBallY },
          laneActivity: currentLaneActivity,
          possession: {
            team: 'contested',
            homePct,
            awayPct: 100 - homePct,
            zoneLabel: pickLang(params.lang, {
              es: 'Plano cerrado / pausa',
              ca: 'Pla tancat / pausa',
              en: 'Close-up / replay',
            }),
            summary: pickLang(params.lang, {
              es: 'Esperando plano abierto del terreno de juego.',
              ca: 'Esperant pla obert del terreny de joc.',
              en: 'Waiting for wide tactical pitch camera.',
            }),
          },
          players: [],
          passingLines: [],
          attacks: [],
          attacksSummary: {
            homeAttacks: params.memory.homeAttacksCount,
            awayAttacks: params.memory.awayAttacksCount,
            phaseLabel: pickLang(params.lang, {
              es: 'Óptica Local',
              ca: 'Òptica Local',
              en: 'Local Optical',
            }),
          },
          tacticalNote: pickLang(params.lang, {
            es: 'Plano sin campo amplio visible · En espera de jugada.',
            ca: 'Pla sense camp ampli visible · Esperant jugada.',
            en: 'Non-pitch camera angle · Waiting for open play.',
          }),
        },
      };
    }

    // 2. Macro-grid foreground blob extraction inside pitch region (24 x 14 cells)
    const cols = 24;
    const rows = 14;
    const cellW = Math.floor((W * 0.92) / cols);
    const cellH = Math.floor((H * 0.72) / rows);
    const startX = Math.floor(W * 0.04);
    const startY = Math.floor(H * 0.17);

    const cellGrassRatio = new Float32Array(cols * rows);
    const cellCandidates: Array<{
      col: number;
      row: number;
      fgRatio: number;
      r: number;
      g: number;
      b: number;
      motion: number;
    }> = [];

    let rawLeftMotion = 0;
    let rawCenterMotion = 0;
    let rawRightMotion = 0;

    for (let rIdx = 0; rIdx < rows; rIdx++) {
      for (let cIdx = 0; cIdx < cols; cIdx++) {
        const x0 = startX + cIdx * cellW;
        const y0 = startY + rIdx * cellH;
        let total = 0;
        let grass = 0;
        let fgCount = 0;
        let sumR = 0;
        let sumG = 0;
        let sumB = 0;
        let motionSum = 0;

        for (let yy = y0; yy < y0 + cellH && yy < H; yy++) {
          for (let xx = x0; xx < x0 + cellW && xx < W; xx++) {
            const pIdx = yy * W + xx;
            total++;
            if (grassMask[pIdx]) {
              grass++;
            } else {
              const p4 = pIdx * 4;
              const pr = imgData[p4];
              const pg = imgData[p4 + 1];
              const pb = imgData[p4 + 2];
              fgCount++;
              sumR += pr;
              sumG += pg;
              sumB += pb;
            }
            if (prevLuma) {
              motionSum += Math.abs(currLuma[pIdx] - prevLuma[pIdx]);
            }
          }
        }

        const avgCellMotion = total > 0 ? motionSum / total : 0;
        if (rIdx >= 2 && rIdx <= 11) {
          if (rIdx <= 4) rawLeftMotion += avgCellMotion + (fgCount / Math.max(1, total)) * 8;
          else if (rIdx >= 9) rawRightMotion += avgCellMotion + (fgCount / Math.max(1, total)) * 8;
          else rawCenterMotion += avgCellMotion + (fgCount / Math.max(1, total)) * 8;
        }

        const gRatio = total > 0 ? grass / total : 0;
        cellGrassRatio[rIdx * cols + cIdx] = gRatio;
        const fgRatio = total > 0 ? fgCount / total : 0;

        if (fgCount > 0 && fgRatio >= 0.16 && fgRatio <= 0.85) {
          cellCandidates.push({
            col: cIdx,
            row: rIdx,
            fgRatio,
            r: sumR / fgCount,
            g: sumG / fgCount,
            b: sumB / fgCount,
            motion: avgCellMotion,
          });
        }
      }
    }

    // Smooth 3-lane energy over time (exponential moving average)
    const laneTotal = Math.max(1, rawLeftMotion + rawCenterMotion + rawRightMotion);
    params.memory.leftEnergy = params.memory.leftEnergy * 0.65 + (rawLeftMotion / laneTotal) * 100 * 0.35;
    params.memory.centerEnergy =
      params.memory.centerEnergy * 0.65 + (rawCenterMotion / laneTotal) * 100 * 0.35;
    params.memory.rightEnergy =
      params.memory.rightEnergy * 0.65 + (rawRightMotion / laneTotal) * 100 * 0.35;

    const smoothedLaneSum = Math.max(
      1,
      params.memory.leftEnergy + params.memory.centerEnergy + params.memory.rightEnergy
    );
    const leftPct = Math.max(12, Math.min(68, Math.round((params.memory.leftEnergy / smoothedLaneSum) * 100)));
    const centerPct = Math.max(
      14,
      Math.min(68, Math.round((params.memory.centerEnergy / smoothedLaneSum) * 100))
    );
    const rightPct = Math.max(10, 100 - leftPct - centerPct);

    // Keep foreground blobs surrounded by grass
    const rawBlobs: BlobCandidate[] = [];
    for (const c of cellCandidates) {
      let neighborGrass = 0;
      let neighborCount = 0;
      for (let dr = -1; dr <= 1; dr++) {
        for (let dc = -1; dc <= 1; dc++) {
          if (dr === 0 && dc === 0) continue;
          const nr = c.row + dr;
          const nc = c.col + dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) {
            neighborCount++;
            if (cellGrassRatio[nr * cols + nc] >= 0.45) neighborGrass++;
          }
        }
      }
      if (neighborCount === 0 || neighborGrass / neighborCount < 0.38) continue;

      const normX = Math.round(((startX + (c.col + 0.5) * cellW) / W) * 1000);
      const normY = Math.round(((startY + (c.row + 0.5) * cellH) / H) * 1000);
      if (normY < 190 && normX < 340) continue;

      rawBlobs.push({
        x: Math.max(60, Math.min(940, normX)),
        y: Math.max(180, Math.min(890, normY)),
        r: c.r,
        g: c.g,
        b: c.b,
        salience: c.fgRatio * 100 + c.motion * 1.4,
        motion: c.motion,
      });
    }

    rawBlobs.sort((a, b) => b.salience - a.salience);
    const blobs: BlobCandidate[] = [];
    for (const b of rawBlobs) {
      const tooClose = blobs.some((existing) => Math.hypot(existing.x - b.x, existing.y - b.y) < 92);
      if (!tooClose) {
        blobs.push(b);
      }
      if (blobs.length >= 11) break;
    }

    // 3. Bipartite RGB clustering for home vs away jerseys
    let cHome: [number, number, number] = params.memory.homeCentroid || [235, 240, 245];
    let cAway: [number, number, number] = params.memory.awayCentroid || [42, 68, 175];

    if (blobs.length >= 2) {
      if (!params.memory.homeCentroid || !params.memory.awayCentroid) {
        let bestD = -1;
        let seedA = blobs[0];
        let seedB = blobs[1];
        for (let i = 0; i < blobs.length; i++) {
          for (let j = i + 1; j < blobs.length; j++) {
            const d = rgbDist([blobs[i].r, blobs[i].g, blobs[i].b], [blobs[j].r, blobs[j].g, blobs[j].b]);
            if (d > bestD) {
              bestD = d;
              seedA = blobs[i];
              seedB = blobs[j];
            }
          }
        }
        cHome = [seedA.r, seedA.g, seedA.b];
        cAway = [seedB.r, seedB.g, seedB.b];
      }

      for (let iter = 0; iter < 3; iter++) {
        const gA: BlobCandidate[] = [];
        const gB: BlobCandidate[] = [];
        for (const b of blobs) {
          const dA = rgbDist([b.r, b.g, b.b], cHome);
          const dB = rgbDist([b.r, b.g, b.b], cAway);
          if (dA <= dB) gA.push(b);
          else gB.push(b);
        }
        if (gA.length > 0) {
          cHome = [
            gA.reduce((s, x) => s + x.r, 0) / gA.length,
            gA.reduce((s, x) => s + x.g, 0) / gA.length,
            gA.reduce((s, x) => s + x.b, 0) / gA.length,
          ];
        }
        if (gB.length > 0) {
          cAway = [
            gB.reduce((s, x) => s + x.r, 0) / gB.length,
            gB.reduce((s, x) => s + x.g, 0) / gB.length,
            gB.reduce((s, x) => s + x.b, 0) / gB.length,
          ];
        }
      }
      params.memory.homeCentroid = cHome;
      params.memory.awayCentroid = cAway;
    }

    const colorSeparation = rgbDist(cHome, cAway);
    const homeKitColor = colorSeparation > 45 ? toReadableHex(cHome, '#00F593') : '#00F593';
    const awayKitColor = colorSeparation > 45 ? toReadableHex(cAway, '#9146FF') : '#9146FF';
    const safeAwayColor =
      homeKitColor.toLowerCase() === awayKitColor.toLowerCase() ? '#9146FF' : awayKitColor;

    const assigned = blobs.map((b) => {
      const team: 'home' | 'away' =
        colorSeparation > 45
          ? rgbDist([b.r, b.g, b.b], cHome) <= rgbDist([b.r, b.g, b.b], cAway)
            ? 'home'
            : 'away'
          : b.x < 520
            ? 'home'
            : 'away';
      return { ...b, team };
    });

    const homeBlobs = assigned.filter((b) => b.team === 'home').sort((a, b) => a.x - b.x || a.y - b.y);
    const awayBlobs = assigned.filter((b) => b.team === 'away').sort((a, b) => b.x - a.x || a.y - b.y);

    let ballCarrierId = '';
    let topMotion = -1;
    const players: TacticalPlayerNode[] = [];

    homeBlobs.forEach((b, idx) => {
      const id = `opt-h-${idx + 1}`;
      const info = pickRosterLabel('home', idx, b.x, b.y, params.homeRoster, params.lang);
      const motionScore = b.motion + (b.x > 220 && b.x < 800 ? 3 : 0);
      if (motionScore > topMotion) {
        topMotion = motionScore;
        ballCarrierId = id;
      }
      players.push({
        id,
        name: info.name,
        jersey: info.jersey,
        team: 'home',
        x: b.x,
        y: b.y,
        hasBall: false,
        roleHint: info.roleHint,
      });
    });

    awayBlobs.forEach((b, idx) => {
      const id = `opt-a-${idx + 1}`;
      const info = pickRosterLabel('away', idx, b.x, b.y, params.awayRoster, params.lang);
      const motionScore = b.motion + (b.x > 220 && b.x < 800 ? 3 : 0);
      if (motionScore > topMotion) {
        topMotion = motionScore;
        ballCarrierId = id;
      }
      players.push({
        id,
        name: info.name,
        jersey: info.jersey,
        team: 'away',
        x: b.x,
        y: b.y,
        hasBall: false,
        roleHint: info.roleHint,
      });
    });

    let activeTeam: 'home' | 'away' | 'contested' = 'contested';
    let carrier: TacticalPlayerNode | undefined;
    if (ballCarrierId) {
      carrier = players.find((p) => p.id === ballCarrierId);
      if (carrier) {
        carrier.hasBall = true;
        activeTeam = carrier.team;
        params.memory.smoothBallX = Math.round(params.memory.smoothBallX * 0.55 + carrier.x * 0.45);
        params.memory.smoothBallY = Math.round(params.memory.smoothBallY * 0.55 + carrier.y * 0.45);
      }
    }

    if (activeTeam === 'home') params.memory.homePossFrames++;
    else if (activeTeam === 'away') params.memory.awayPossFrames++;

    const rollingHomePct = Math.max(
      24,
      Math.min(
        76,
        Math.round(
          (params.memory.homePossFrames /
            Math.max(1, params.memory.homePossFrames + params.memory.awayPossFrames)) *
            100
        )
      )
    );
    const homePct = statsPoss?.homePct ?? rollingHomePct;
    const awayPct = 100 - homePct;

    // 4. Passing lines & compact team links
    const passingLines: TacticalPassingLine[] = [];
    const connectTeam = (list: TacticalPlayerNode[]) => {
      for (let i = 0; i < list.length; i++) {
        const a = list[i];
        let nearest: TacticalPlayerNode | null = null;
        let nearestD = Infinity;
        for (let j = i + 1; j < list.length; j++) {
          const b = list[j];
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (d < 360 && d < nearestD) {
            nearestD = d;
            nearest = b;
          }
        }
        if (nearest) {
          passingLines.push({
            fromId: a.id,
            toId: nearest.id,
            team: a.team,
            kind: a.hasBall || nearest.hasBall ? 'pass_link' : 'compact_line',
          });
        }
      }
    };

    const homePlayers = players.filter((p) => p.team === 'home');
    const awayPlayers = players.filter((p) => p.team === 'away');
    connectTeam(homePlayers);
    connectTeam(awayPlayers);

    // 5. Attack vectors based on ball carrier & territorial progression
    const attacks: TacticalAttackVector[] = [];
    if (carrier) {
      const teamPlayers = carrier.team === 'home' ? homePlayers : awayPlayers;
      const forwardTarget = teamPlayers
        .filter((p) => p.id !== carrier!.id)
        .sort((a, b) => (carrier!.team === 'home' ? b.x - a.x : a.x - b.x))[0];

      const dirX = carrier.team === 'home' ? 1 : -1;
      const targetX = forwardTarget
        ? Math.max(60, Math.min(940, Math.round(forwardTarget.x + dirX * 55)))
        : Math.max(60, Math.min(940, carrier.x + dirX * 165));
      const targetY = forwardTarget
        ? forwardTarget.y
        : Math.max(230, Math.min(820, carrier.y + (carrier.y < 500 ? 45 : -45)));

      const isWing = carrier.y < 350 || carrier.y > 680;
      const isBox = carrier.x < 240 || carrier.x > 760;

      if (carrier.team === 'home' && Math.hypot(targetX - carrier.x, targetY - carrier.y) > 90) {
        params.memory.homeAttacksCount = Math.min(99, params.memory.homeAttacksCount + (isBox ? 1 : 0));
      } else if (carrier.team === 'away' && Math.hypot(targetX - carrier.x, targetY - carrier.y) > 90) {
        params.memory.awayAttacksCount = Math.min(99, params.memory.awayAttacksCount + (isBox ? 1 : 0));
      }

      attacks.push({
        id: 'opt-atk-1',
        team: carrier.team,
        fromX: carrier.x,
        fromY: carrier.y,
        toX: targetX,
        toY: targetY,
        type: isBox ? 'shot_threat' : isWing ? 'wing_attack' : 'through_ball',
        label: isBox
          ? pickLang(params.lang, { es: 'Zona de remate', ca: 'Zona de xut', en: 'Shot zone' })
          : isWing
            ? pickLang(params.lang, { es: 'Profundidad banda', ca: 'Profunditat banda', en: 'Wing run' })
            : pickLang(params.lang, { es: 'Línea de pase', ca: 'Línia de passada', en: 'Through lane' }),
      });
    }

    const activeName =
      activeTeam === 'home'
        ? params.homeTeam
        : activeTeam === 'away'
          ? params.awayTeam
          : `${params.homeTeam} / ${params.awayTeam}`;

    const zoneLabel = carrier
      ? carrier.y < 360
        ? pickLang(params.lang, { es: 'Banda superior', ca: 'Banda superior', en: 'Far flank' })
        : carrier.y > 670
          ? pickLang(params.lang, { es: 'Banda inferior', ca: 'Banda inferior', en: 'Near flank' })
          : pickLang(params.lang, { es: 'Carril central', ca: 'Carril central', en: 'Central lane' })
      : pickLang(params.lang, { es: 'Zona media', ca: 'Zona mitjana', en: 'Midfield' });

    return {
      ok: true,
      analysis: {
        engineMode: 'optical_local',
        isMatchPitchVisible: true,
        homeKitColor,
        awayKitColor: safeAwayColor,
        ballZone: { x: params.memory.smoothBallX, y: params.memory.smoothBallY },
        laneActivity: { leftPct, centerPct, rightPct },
        possession: {
          team: activeTeam,
          homePct,
          awayPct,
          zoneLabel,
          summary: pickLang(params.lang, {
            es: `${activeName} conduce por ${zoneLabel.toLowerCase()}.`,
            ca: `${activeName} condueix per ${zoneLabel.toLowerCase()}.`,
            en: `${activeName} progressing through ${zoneLabel.toLowerCase()}.`,
          }),
        },
        players,
        passingLines: passingLines.slice(0, 10),
        attacks,
        attacksSummary: {
          homeAttacks: params.memory.homeAttacksCount,
          awayAttacks: params.memory.awayAttacksCount,
          phaseLabel: pickLang(params.lang, {
            es: 'Radar 2D en vivo',
            ca: 'Radar 2D en directe',
            en: 'Live 2D Radar',
          }),
        },
        tacticalNote:
          players.length > 0
            ? pickLang(params.lang, {
                es: `Actividad óptica en ${zoneLabel.toLowerCase()} · Carriles ${leftPct}% / ${centerPct}% / ${rightPct}%.`,
                ca: `Activitat òptica a ${zoneLabel.toLowerCase()} · Carrils ${leftPct}% / ${centerPct}% / ${rightPct}%.`,
                en: `Live pitch load in ${zoneLabel.toLowerCase()} · Lanes ${leftPct}% / ${centerPct}% / ${rightPct}%.`,
              })
            : pickLang(params.lang, {
                es: 'Césped detectado · Analizando carriles de ataque.',
                ca: 'Gespa detectada · Analitzant carrils d’atac.',
                en: 'Pitch detected · Scanning attacking lanes.',
              }),
      },
    };
  } catch {
    return { ok: false, reason: 'cors_blocked' };
  }
}
