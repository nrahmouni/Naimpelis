import {
  POOL_FOOT_SPOT_Y,
  POOL_HEAD_STRING_X,
  POOL_POCKETS,
  POOL_TABLE_H,
  POOL_TABLE_W,
} from '../../shared/pool8Ball';

export const RAIL_PAD = 44;

export function createFeltNoisePattern(): HTMLCanvasElement | null {
  if (typeof document === 'undefined') return null;
  const off = document.createElement('canvas');
  off.width = 96;
  off.height = 96;
  const ctx = off.getContext('2d');
  if (!ctx) return null;
  const img = ctx.createImageData(96, 96);
  let seed = 1337;
  for (let i = 0; i < img.data.length; i += 4) {
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const v = (seed >>> 24) & 0xff;
    const delta = ((v & 15) - 7) * 1.4;
    img.data[i] = Math.max(0, Math.min(255, 11 + delta));
    img.data[i + 1] = Math.max(0, Math.min(255, 68 + delta));
    img.data[i + 2] = Math.max(0, Math.min(255, 51 + delta));
    img.data[i + 3] = 255;
  }
  ctx.putImageData(img, 0, 0);
  return off;
}

export function buildStaticTableCache(
  cssW: number,
  cssH: number,
  dpr: number,
  scale: number,
  offsetX: number,
  offsetY: number,
  portrait: boolean,
  feltPatternRef: { current: CanvasPattern | null }
): HTMLCanvasElement {
  const off = document.createElement('canvas');
  off.width = Math.floor(cssW * dpr);
  off.height = Math.floor(cssH * dpr);
  const octx = off.getContext('2d');
  if (!octx) return off;

  octx.save();
  octx.scale(dpr, dpr);
  octx.translate(offsetX, offsetY);
  octx.scale(scale, scale);

  if (portrait) {
    octx.translate(0, POOL_TABLE_W + RAIL_PAD * 2);
    octx.rotate(-Math.PI / 2);
  }

  octx.translate(RAIL_PAD, RAIL_PAD);

  const outerX = -RAIL_PAD;
  const outerY = -RAIL_PAD;
  const outerW = POOL_TABLE_W + RAIL_PAD * 2;
  const outerH = POOL_TABLE_H + RAIL_PAD * 2;

  octx.save();
  octx.shadowColor = 'rgba(0,0,0,0.72)';
  octx.shadowBlur = 26;
  octx.shadowOffsetY = 10;
  const woodGrad = octx.createLinearGradient(outerX, outerY, outerX, outerY + outerH);
  woodGrad.addColorStop(0, '#5E3422');
  woodGrad.addColorStop(0.25, '#482517');
  woodGrad.addColorStop(0.75, '#33190E');
  woodGrad.addColorStop(1, '#1E0E07');
  octx.fillStyle = woodGrad;
  octx.beginPath();
  octx.roundRect(outerX, outerY, outerW, outerH, 26);
  octx.fill();
  octx.restore();

  // Subtle walnut wood grain highlights on rail frame
  octx.save();
  octx.beginPath();
  octx.roundRect(outerX, outerY, outerW, outerH, 26);
  octx.clip();
  octx.strokeStyle = 'rgba(255, 208, 160, 0.045)';
  octx.lineWidth = 1.2;
  for (let gy = outerY + 6; gy < outerY + outerH; gy += 9) {
    octx.beginPath();
    octx.moveTo(outerX, gy);
    octx.bezierCurveTo(
      outerX + outerW * 0.33,
      gy + (gy % 18 === 0 ? 2.5 : -2.5),
      outerX + outerW * 0.66,
      gy + (gy % 18 === 0 ? -2.5 : 2.5),
      outerX + outerW,
      gy
    );
    octx.stroke();
  }
  octx.restore();

  // Outer chamfer & warm inner bevel trim
  octx.strokeStyle = 'rgba(255,235,205,0.18)';
  octx.lineWidth = 2;
  octx.beginPath();
  octx.roundRect(outerX + 3, outerY + 3, outerW - 6, outerH - 6, 23);
  octx.stroke();
  octx.strokeStyle = 'rgba(0,0,0,0.45)';
  octx.lineWidth = 2;
  octx.beginPath();
  octx.roundRect(-16, -16, POOL_TABLE_W + 32, POOL_TABLE_H + 32, 14);
  octx.stroke();

  // Brushed brass corner castings & side pocket plates
  const cornerSize = 40;
  [
    [outerX + 1, outerY + 1, 0, 0],
    [outerX + outerW - cornerSize - 1, outerY + 1, 1, 0],
    [outerX + 1, outerY + outerH - cornerSize - 1, 0, 1],
    [outerX + outerW - cornerSize - 1, outerY + outerH - cornerSize - 1, 1, 1],
  ].forEach(([cx, cy, rx, ry]) => {
    const brassGrad = octx.createLinearGradient(cx, cy, cx + cornerSize, cy + cornerSize);
    brassGrad.addColorStop(0, '#E8C97A');
    brassGrad.addColorStop(0.45, '#B68A38');
    brassGrad.addColorStop(1, '#6C4F1A');
    octx.fillStyle = brassGrad;
    octx.beginPath();
    octx.roundRect(cx, cy, cornerSize, cornerSize, 12);
    octx.fill();
    octx.strokeStyle = 'rgba(255,248,220,0.35)';
    octx.lineWidth = 1;
    octx.stroke();

    // Brass rivet stud
    const sx = cx + (rx ? cornerSize - 10 : 10);
    const sy = cy + (ry ? cornerSize - 10 : 10);
    octx.fillStyle = '#4B3611';
    octx.beginPath();
    octx.arc(sx, sy, 2.2, 0, Math.PI * 2);
    octx.fill();
  });

  // Side pocket brass plates
  [
    [POOL_TABLE_W * 0.5 - 22, outerY + 1],
    [POOL_TABLE_W * 0.5 - 22, outerY + outerH - 18],
  ].forEach(([sx, sy]) => {
    const plateGrad = octx.createLinearGradient(sx, sy, sx, sy + 17);
    plateGrad.addColorStop(0, '#DFBE6F');
    plateGrad.addColorStop(0.5, '#A97E2E');
    plateGrad.addColorStop(1, '#6B4D18');
    octx.fillStyle = plateGrad;
    octx.beginPath();
    octx.roundRect(sx, sy, 44, 17, 6);
    octx.fill();
  });

  octx.fillStyle = '#07271E';
  octx.beginPath();
  octx.roundRect(-14, -14, POOL_TABLE_W + 28, POOL_TABLE_H + 28, 12);
  octx.fill();

  octx.save();
  octx.beginPath();
  octx.rect(0, 0, POOL_TABLE_W, POOL_TABLE_H);
  octx.clip();

  if (!feltPatternRef.current) {
    const patCanvas = createFeltNoisePattern();
    if (patCanvas) {
      feltPatternRef.current = octx.createPattern(patCanvas, 'repeat');
    }
  }
  octx.fillStyle = feltPatternRef.current || '#0B4635';
  octx.fillRect(0, 0, POOL_TABLE_W, POOL_TABLE_H);

  // Overhead warm pool-lamp spotlight + rich emerald edge vignette
  const feltLight = octx.createRadialGradient(
    POOL_TABLE_W * 0.5,
    POOL_TABLE_H * 0.5,
    36,
    POOL_TABLE_W * 0.5,
    POOL_TABLE_H * 0.5,
    POOL_TABLE_W * 0.68
  );
  feltLight.addColorStop(0, 'rgba(74, 222, 128, 0.16)');
  feltLight.addColorStop(0.45, 'rgba(16, 185, 129, 0.08)');
  feltLight.addColorStop(0.8, 'rgba(6, 78, 59, 0.08)');
  feltLight.addColorStop(1, 'rgba(2, 18, 14, 0.52)');
  octx.fillStyle = feltLight;
  octx.fillRect(0, 0, POOL_TABLE_W, POOL_TABLE_H);

  // Warm overhead lamp reflection oval
  const lampGlow = octx.createRadialGradient(
    POOL_TABLE_W * 0.5,
    POOL_TABLE_H * 0.5,
    10,
    POOL_TABLE_W * 0.5,
    POOL_TABLE_H * 0.5,
    POOL_TABLE_W * 0.36
  );
  lampGlow.addColorStop(0, 'rgba(254, 243, 199, 0.08)');
  lampGlow.addColorStop(1, 'rgba(254, 243, 199, 0)');
  octx.fillStyle = lampGlow;
  octx.fillRect(0, 0, POOL_TABLE_W, POOL_TABLE_H);

  octx.strokeStyle = 'rgba(0,0,0,0.52)';
  octx.lineWidth = 10;
  octx.strokeRect(0, 0, POOL_TABLE_W, POOL_TABLE_H);

  octx.strokeStyle = 'rgba(255,255,255,0.16)';
  octx.lineWidth = 1.5;
  octx.setLineDash([6, 6]);
  octx.beginPath();
  octx.moveTo(POOL_HEAD_STRING_X, 0);
  octx.lineTo(POOL_HEAD_STRING_X, POOL_TABLE_H);
  octx.stroke();
  octx.setLineDash([]);

  octx.fillStyle = 'rgba(255,255,255,0.32)';
  octx.beginPath();
  octx.arc(750, POOL_FOOT_SPOT_Y, 4.2, 0, Math.PI * 2);
  octx.fill();
  octx.beginPath();
  octx.arc(POOL_HEAD_STRING_X, POOL_FOOT_SPOT_Y, 3.2, 0, Math.PI * 2);
  octx.fill();
  octx.restore();

  // Cushion bevels with lighting gradient
  const drawRail = (pts: Array<[number, number]>, lightEdge: boolean) => {
    const rGrad = octx.createLinearGradient(pts[0][0], pts[0][1], pts[2][0], pts[2][1]);
    rGrad.addColorStop(0, lightEdge ? '#136D54' : '#0B4A38');
    rGrad.addColorStop(1, lightEdge ? '#0A4434' : '#0E5B45');
    octx.fillStyle = rGrad;
    octx.strokeStyle = 'rgba(255,255,255,0.14)';
    octx.lineWidth = 1;
    octx.beginPath();
    octx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i += 1) octx.lineTo(pts[i][0], pts[i][1]);
    octx.closePath();
    octx.fill();
    octx.stroke();
  };
  drawRail([[20, -14], [478, -14], [472, 0], [30, 0]], true);
  drawRail([[522, -14], [980, -14], [970, 0], [528, 0]], true);
  drawRail([[20, POOL_TABLE_H + 14], [478, POOL_TABLE_H + 14], [472, POOL_TABLE_H], [30, POOL_TABLE_H]], false);
  drawRail([[522, POOL_TABLE_H + 14], [980, POOL_TABLE_H + 14], [970, POOL_TABLE_H], [528, POOL_TABLE_H]], false);
  drawRail([[-14, 20], [0, 30], [0, 470], [-14, 480]], true);
  drawRail([[POOL_TABLE_W + 14, 20], [POOL_TABLE_W, 30], [POOL_TABLE_W, 470], [POOL_TABLE_W + 14, 480]], false);

  // Mother-of-pearl diamond sights
  const diamondX = [125, 250, 375, 625, 750, 875];
  const diamondY = [125, 250, 375];
  const drawDiamond = (x: number, y: number) => {
    const dGrad = octx.createLinearGradient(x - 4, y - 4, x + 4, y + 4);
    dGrad.addColorStop(0, '#FFFBEB');
    dGrad.addColorStop(0.6, '#E7D5B3');
    dGrad.addColorStop(1, '#A99272');
    octx.fillStyle = dGrad;
    octx.strokeStyle = 'rgba(0,0,0,0.45)';
    octx.lineWidth = 0.8;
    octx.beginPath();
    octx.moveTo(x, y - 4.2);
    octx.lineTo(x + 4.2, y);
    octx.lineTo(x, y + 4.2);
    octx.lineTo(x - 4.2, y);
    octx.closePath();
    octx.fill();
    octx.stroke();
  };
  for (const dx of diamondX) {
    drawDiamond(dx, -27);
    drawDiamond(dx, POOL_TABLE_H + 27);
  }
  for (const dy of diamondY) {
    drawDiamond(-27, dy);
    drawDiamond(POOL_TABLE_W + 27, dy);
  }

  for (const p of POOL_POCKETS) {
    // Leather pocket drop shadow & rim
    octx.fillStyle = '#140C08';
    octx.beginPath();
    octx.arc(p.x, p.y, p.captureR + 6, 0, Math.PI * 2);
    octx.fill();

    octx.strokeStyle = 'rgba(212, 175, 55, 0.32)';
    octx.lineWidth = 1.4;
    octx.beginPath();
    octx.arc(p.x, p.y, p.captureR + 4.5, 0, Math.PI * 2);
    octx.stroke();

    const pGrad = octx.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.captureR);
    pGrad.addColorStop(0, '#010204');
    pGrad.addColorStop(0.72, '#07090E');
    pGrad.addColorStop(1, '#1E2028');
    octx.fillStyle = pGrad;
    octx.beginPath();
    octx.arc(p.x, p.y, p.captureR, 0, Math.PI * 2);
    octx.fill();
  }

  octx.restore();
  return off;
}
