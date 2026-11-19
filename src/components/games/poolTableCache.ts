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
  octx.shadowColor = 'rgba(0,0,0,0.65)';
  octx.shadowBlur = 22;
  octx.shadowOffsetY = 8;
  const woodGrad = octx.createLinearGradient(outerX, outerY, outerX, outerY + outerH);
  woodGrad.addColorStop(0, '#4E2A1B');
  woodGrad.addColorStop(0.5, '#331A10');
  woodGrad.addColorStop(1, '#221009');
  octx.fillStyle = woodGrad;
  octx.beginPath();
  octx.roundRect(outerX, outerY, outerW, outerH, 26);
  octx.fill();
  octx.restore();

  octx.strokeStyle = 'rgba(255,255,255,0.14)';
  octx.lineWidth = 2;
  octx.beginPath();
  octx.roundRect(outerX + 3, outerY + 3, outerW - 6, outerH - 6, 23);
  octx.stroke();

  octx.fillStyle = '#3F4451';
  const cornerSize = 36;
  [
    [outerX, outerY],
    [outerX + outerW - cornerSize, outerY],
    [outerX, outerY + outerH - cornerSize],
    [outerX + outerW - cornerSize, outerY + outerH - cornerSize],
  ].forEach(([cx, cy]) => {
    octx.beginPath();
    octx.roundRect(cx, cy, cornerSize, cornerSize, 10);
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

  const feltLight = octx.createRadialGradient(
    POOL_TABLE_W * 0.5,
    POOL_TABLE_H * 0.5,
    40,
    POOL_TABLE_W * 0.5,
    POOL_TABLE_H * 0.5,
    POOL_TABLE_W * 0.65
  );
  feltLight.addColorStop(0, 'rgba(34, 197, 94, 0.14)');
  feltLight.addColorStop(0.6, 'rgba(6, 78, 59, 0.05)');
  feltLight.addColorStop(1, 'rgba(2, 18, 14, 0.45)');
  octx.fillStyle = feltLight;
  octx.fillRect(0, 0, POOL_TABLE_W, POOL_TABLE_H);

  octx.strokeStyle = 'rgba(0,0,0,0.48)';
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

  octx.fillStyle = 'rgba(255,255,255,0.28)';
  octx.beginPath();
  octx.arc(750, POOL_FOOT_SPOT_Y, 4, 0, Math.PI * 2);
  octx.fill();
  octx.beginPath();
  octx.arc(POOL_HEAD_STRING_X, POOL_FOOT_SPOT_Y, 3, 0, Math.PI * 2);
  octx.fill();
  octx.restore();

  octx.fillStyle = '#0D5742';
  octx.strokeStyle = 'rgba(255,255,255,0.12)';
  octx.lineWidth = 1;
  const drawRail = (pts: Array<[number, number]>) => {
    octx.beginPath();
    octx.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i += 1) octx.lineTo(pts[i][0], pts[i][1]);
    octx.closePath();
    octx.fill();
    octx.stroke();
  };
  drawRail([[20, -14], [478, -14], [472, 0], [30, 0]]);
  drawRail([[522, -14], [980, -14], [970, 0], [528, 0]]);
  drawRail([[20, POOL_TABLE_H + 14], [478, POOL_TABLE_H + 14], [472, POOL_TABLE_H], [30, POOL_TABLE_H]]);
  drawRail([[522, POOL_TABLE_H + 14], [980, POOL_TABLE_H + 14], [970, POOL_TABLE_H], [528, POOL_TABLE_H]]);
  drawRail([[-14, 20], [0, 30], [0, 470], [-14, 480]]);
  drawRail([[POOL_TABLE_W + 14, 20], [POOL_TABLE_W, 30], [POOL_TABLE_W, 470], [POOL_TABLE_W + 14, 480]]);

  octx.fillStyle = '#E5D3B3';
  const diamondX = [125, 250, 375, 625, 750, 875];
  const diamondY = [125, 250, 375];
  const drawDiamond = (x: number, y: number) => {
    octx.beginPath();
    octx.moveTo(x, y - 3.5);
    octx.lineTo(x + 3.5, y);
    octx.lineTo(x, y + 3.5);
    octx.lineTo(x - 3.5, y);
    octx.closePath();
    octx.fill();
  };
  for (const dx of diamondX) {
    drawDiamond(dx, -25);
    drawDiamond(dx, POOL_TABLE_H + 25);
  }
  for (const dy of diamondY) {
    drawDiamond(-25, dy);
    drawDiamond(POOL_TABLE_W + 25, dy);
  }

  for (const p of POOL_POCKETS) {
    octx.fillStyle = '#1E1510';
    octx.beginPath();
    octx.arc(p.x, p.y, p.captureR + 5, 0, Math.PI * 2);
    octx.fill();

    const pGrad = octx.createRadialGradient(p.x, p.y, 2, p.x, p.y, p.captureR);
    pGrad.addColorStop(0, '#020305');
    pGrad.addColorStop(0.75, '#090B10');
    pGrad.addColorStop(1, '#1A1C22');
    octx.fillStyle = pGrad;
    octx.beginPath();
    octx.arc(p.x, p.y, p.captureR, 0, Math.PI * 2);
    octx.fill();
  }

  octx.restore();
  return off;
}
