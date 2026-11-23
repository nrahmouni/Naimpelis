const SPRITE_CACHE = new Map<string, { img: HTMLImageElement; failed: boolean }>();

function normalizeAssetUrl(relPath: string): string {
  const clean = relPath.replace(/^\/+/, '');
  if (typeof window !== 'undefined' && window.location?.protocol === 'file:') {
    return `./${clean}`;
  }
  return `/${clean}`;
}

export function getArcadeSprite(relPath: string): HTMLImageElement | null {
  if (!relPath || typeof Image === 'undefined') return null;
  let entry = SPRITE_CACHE.get(relPath);
  if (!entry) {
    const img = new Image();
    const record = { img, failed: false };
    img.onerror = () => {
      record.failed = true;
    };
    img.src = normalizeAssetUrl(relPath);
    SPRITE_CACHE.set(relPath, record);
    return null;
  }
  if (entry.failed) return null;
  if (entry.img.complete && entry.img.naturalWidth > 0) {
    return entry.img;
  }
  return null;
}

export function preloadArcadeSprites(paths: readonly string[]): void {
  for (const p of paths) {
    getArcadeSprite(p);
  }
}

export function drawArcadeSprite(
  ctx: CanvasRenderingContext2D,
  relPath: string,
  cx: number,
  cy: number,
  w: number,
  h: number,
  rot = 0,
  alpha = 1
): boolean {
  const img = getArcadeSprite(relPath);
  if (!img) return false;
  ctx.save();
  if (alpha < 1) ctx.globalAlpha = alpha;
  ctx.translate(cx, cy);
  if (rot) ctx.rotate(rot);
  ctx.drawImage(img, -w / 2, -h / 2, w, h);
  ctx.restore();
  return true;
}

export function drawArcadeSpriteRect(
  ctx: CanvasRenderingContext2D,
  relPath: string,
  x: number,
  y: number,
  w: number,
  h: number,
  alpha = 1
): boolean {
  const img = getArcadeSprite(relPath);
  if (!img) return false;
  ctx.save();
  if (alpha < 1) ctx.globalAlpha = alpha;
  ctx.drawImage(img, x, y, w, h);
  ctx.restore();
  return true;
}

export function drawArcadeTiledBg(
  ctx: CanvasRenderingContext2D,
  relPath: string,
  canvasW: number,
  canvasH: number,
  scrollX = 0,
  scrollY = 0
): boolean {
  const img = getArcadeSprite(relPath);
  if (!img || !img.naturalWidth || !img.naturalHeight) return false;
  const tw = img.naturalWidth;
  const th = img.naturalHeight;
  const ox = ((scrollX % tw) + tw) % tw - tw;
  const oy = ((scrollY % th) + th) % th - th;
  for (let x = ox; x < canvasW; x += tw) {
    for (let y = oy; y < canvasH; y += th) {
      ctx.drawImage(img, x, y, tw, th);
    }
  }
  return true;
}

export const EXPLOSION_FRAMES = [
  'assets/games/explosion/groundExplosion00.png',
  'assets/games/explosion/groundExplosion01.png',
  'assets/games/explosion/groundExplosion02.png',
  'assets/games/explosion/groundExplosion03.png',
  'assets/games/explosion/groundExplosion04.png',
  'assets/games/explosion/groundExplosion05.png',
  'assets/games/explosion/groundExplosion06.png',
  'assets/games/explosion/groundExplosion07.png',
  'assets/games/explosion/groundExplosion08.png',
] as const;
