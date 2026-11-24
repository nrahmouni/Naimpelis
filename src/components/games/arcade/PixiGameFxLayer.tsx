import React, { useEffect, useImperativeHandle, useRef } from 'react';
import { Application, Assets, Container, Graphics, Sprite, type Texture } from 'pixi.js';
import { resolveGameAssetUrl } from '../../../shared/gameAssetsCdn';

export type PixiFxPreset =
  | 'goal'
  | 'hit'
  | 'explosion'
  | 'spark'
  | 'magic'
  | 'victory'
  | 'strike'
  | 'lineClear'
  | 'coin'
  | 'smash'
  | 'boost'
  | 'merge';

export interface PixiGameFxHandle {
  /** Emit additive/composited Kenney particle burst at normalized [0..1] viewport coordinates */
  emitBurst: (normX: number, normY: number, preset?: PixiFxPreset, count?: number) => void;
}

const FX_SPRITES: Record<PixiFxPreset, readonly string[]> = {
  goal: [
    'assets/games/particles/star_07.png',
    'assets/games/particles/flare_01.png',
    'assets/games/particles/magic_04.png',
  ],
  hit: [
    'assets/games/particles/spark_01.png',
    'assets/games/particles/light_01.png',
    'assets/games/particles/flare_01.png',
  ],
  explosion: [
    'assets/games/explosion/groundExplosion02.png',
    'assets/games/explosion/groundExplosion04.png',
    'assets/games/particles/muzzle_01.png',
    'assets/games/particles/spark_02.png',
  ],
  spark: [
    'assets/games/particles/spark_01.png',
    'assets/games/particles/spark_02.png',
    'assets/games/particles/spark_03.png',
  ],
  magic: [
    'assets/games/particles/magic_04.png',
    'assets/games/particles/twirl_01.png',
    'assets/games/particles/star_04.png',
  ],
  victory: [
    'assets/games/particles/star_07.png',
    'assets/games/particles/magic_04.png',
    'assets/games/particles/flare_01.png',
    'assets/games/particles/star_01.png',
  ],
  strike: [
    'assets/games/particles/star_07.png',
    'assets/games/particles/spark_02.png',
    'assets/games/particles/flare_01.png',
  ],
  lineClear: [
    'assets/games/particles/light_01.png',
    'assets/games/particles/spark_03.png',
    'assets/games/particles/star_04.png',
  ],
  coin: [
    'assets/games/particles/star_04.png',
    'assets/games/particles/spark_01.png',
    'assets/games/particles/flare_01.png',
  ],
  smash: [
    'assets/games/particles/slash_01.png',
    'assets/games/particles/spark_02.png',
    'assets/games/particles/star_07.png',
  ],
  boost: [
    'assets/games/particles/twirl_01.png',
    'assets/games/particles/spark_03.png',
    'assets/games/particles/light_01.png',
  ],
  merge: [
    'assets/games/particles/magic_04.png',
    'assets/games/particles/star_01.png',
    'assets/games/particles/flare_01.png',
  ],
};

const FX_TINTS: Record<PixiFxPreset, readonly number[]> = {
  goal: [0x22c55e, 0xfacc15, 0x38bdf8, 0xffffff],
  hit: [0x38bdf8, 0xfacc15, 0xf43f5e],
  explosion: [0xf97316, 0xfacc15, 0xef4444],
  spark: [0x22d3ee, 0xfde047, 0xa855f7],
  magic: [0xa855f7, 0x38bdf8, 0xec4899],
  victory: [0xfacc15, 0x38bdf8, 0xf43f5e, 0x22c55e],
  strike: [0xfacc15, 0x38bdf8, 0xf97316],
  lineClear: [0x38bdf8, 0xa855f7, 0xffffff],
  coin: [0xfacc15, 0xfde047, 0x22d3ee],
  smash: [0xf43f5e, 0xfacc15, 0x22d3ee],
  boost: [0x22d3ee, 0x38bdf8, 0x7c3aed],
  merge: [0xf59e0b, 0xfacc15, 0x38bdf8],
};

const SHOCKWAVE_PRESETS = new Set<PixiFxPreset>([
  'goal',
  'explosion',
  'smash',
  'strike',
  'lineClear',
  'victory',
  'merge',
]);

interface ActivePixiParticle {
  sprite: Sprite;
  vx: number;
  vy: number;
  vr: number;
  life: number;
  maxLife: number;
  baseScale: number;
  growFactor: number;
}

interface ActivePixiRing {
  gfx: Graphics;
  life: number;
  maxLife: number;
  maxScale: number;
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export const PixiGameFxLayer = React.forwardRef<
  PixiGameFxHandle,
  { className?: string; enabled?: boolean }
>(({ className = '', enabled = true }, ref) => {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const particlesRef = useRef<ActivePixiParticle[]>([]);
  const ringsRef = useRef<ActivePixiRing[]>([]);
  const stageRef = useRef<Container | null>(null);
  const texturesRef = useRef<Map<string, Texture>>(new Map());
  const readyRef = useRef(false);
  const useAdditiveRef = useRef(true);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !enabled || typeof window === 'undefined' || prefersReducedMotion()) return;

    let glSupported = false;
    try {
      const probe = document.createElement('canvas');
      const gl = probe.getContext('webgl2') || probe.getContext('webgl');
      if (gl) {
        const ext = gl.getExtension('WEBGL_debug_renderer_info');
        const gpu = ext ? String(gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) || '') : '';
        glSupported = !/SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
        gl.getExtension('WEBGL_lose_context')?.loseContext();
      }
    } catch {
      glSupported = false;
    }

    useAdditiveRef.current = glSupported;
    let disposed = false;
    const app = new Application();
    const particleContainer = new Container();

    const uniquePaths = Array.from(new Set(Object.values(FX_SPRITES).flat()));

    void (async () => {
      try {
        await app.init({
          backgroundAlpha: 0,
          antialias: false,
          preference: glSupported ? 'webgl' : 'canvas',
          powerPreference: 'low-power',
          resolution: glSupported ? Math.min(1.5, window.devicePixelRatio || 1) : 1,
          autoDensity: true,
          resizeTo: host,
        });
        if (disposed) {
          app.destroy(true);
          return;
        }
        const canvasEl = app.canvas;
        canvasEl.style.width = '100%';
        canvasEl.style.height = '100%';
        canvasEl.style.pointerEvents = 'none';
        canvasEl.style.display = 'block';
        host.innerHTML = '';
        host.appendChild(canvasEl);

        app.stage.addChild(particleContainer);
        stageRef.current = particleContainer;
        readyRef.current = true;

        // Preload Kenney particle textures asynchronously
        await Promise.all(
          uniquePaths.map(async (relPath) => {
            if (disposed) return;
            try {
              const url = resolveGameAssetUrl(relPath);
              const tex = await Assets.load<Texture>({
                src: url,
                loadParser: 'loadTextures',
              });
              if (tex && !disposed) {
                texturesRef.current.set(relPath, tex);
              }
            } catch {
              // ignore individual CDN load errors safely
            }
          })
        );

        app.ticker.add((ticker) => {
          const dt = Math.min(0.05, ticker.deltaMS / 1000);
          const list = particlesRef.current;
          for (let i = list.length - 1; i >= 0; i -= 1) {
            const p = list[i];
            p.life -= dt;
            if (p.life <= 0) {
              p.sprite.parent?.removeChild(p.sprite);
              p.sprite.destroy();
              list.splice(i, 1);
              continue;
            }
            p.sprite.x += p.vx * dt;
            p.sprite.y += p.vy * dt;
            p.vx *= 0.96;
            p.vy = p.vy * 0.96 + 90 * dt;
            p.sprite.rotation += p.vr * dt;
            const norm = p.life / p.maxLife;
            p.sprite.alpha = Math.min(1, norm * 1.35);
            const sc = p.baseScale * (1 + (1 - norm) * p.growFactor);
            p.sprite.scale.set(sc);
          }

          const ringList = ringsRef.current;
          for (let i = ringList.length - 1; i >= 0; i -= 1) {
            const r = ringList[i];
            r.life -= dt;
            if (r.life <= 0) {
              r.gfx.parent?.removeChild(r.gfx);
              r.gfx.destroy();
              ringList.splice(i, 1);
              continue;
            }
            const progress = 1 - r.life / r.maxLife;
            const eased = 1 - Math.pow(1 - progress, 2.2);
            r.gfx.scale.set(0.25 + eased * r.maxScale);
            r.gfx.alpha = Math.max(0, (1 - progress) * 0.85);
          }
        });
      } catch {
        readyRef.current = false;
      }
    })();

    return () => {
      disposed = true;
      readyRef.current = false;
      stageRef.current = null;
      for (const p of particlesRef.current) {
        p.sprite.destroy();
      }
      particlesRef.current = [];
      for (const r of ringsRef.current) {
        r.gfx.destroy();
      }
      ringsRef.current = [];
      try {
        app.destroy(true);
      } catch {
        // ignore cleanup race
      }
      host.innerHTML = '';
    };
  }, [enabled]);

  useImperativeHandle(
    ref,
    () => ({
      emitBurst: (normX: number, normY: number, preset: PixiFxPreset = 'spark', count = 14) => {
        const container = stageRef.current;
        const host = hostRef.current;
        if (!readyRef.current || !container || !host) return;
        const w = host.clientWidth || 640;
        const h = host.clientHeight || 360;
        const cx = Math.max(0, Math.min(1, normX)) * w;
        const cy = Math.max(0, Math.min(1, normY)) * h;
        const paths = FX_SPRITES[preset] || FX_SPRITES.spark;
        const tints = FX_TINTS[preset] || FX_TINTS.spark;

        if (SHOCKWAVE_PRESETS.has(preset) && ringsRef.current.length < 10) {
          const gfx = new Graphics();
          gfx.circle(0, 0, 28).stroke({ width: 3.5, color: tints[0], alpha: 0.9 });
          gfx.position.set(cx, cy);
          gfx.scale.set(0.25);
          if (useAdditiveRef.current) gfx.blendMode = 'add';
          container.addChild(gfx);
          ringsRef.current.push({
            gfx,
            life: preset === 'victory' || preset === 'goal' ? 0.55 : 0.36,
            maxLife: preset === 'victory' || preset === 'goal' ? 0.55 : 0.36,
            maxScale: preset === 'victory' || preset === 'goal' ? 3.8 : 2.5,
          });
        }

        if (particlesRef.current.length > 140) {
          const drop = particlesRef.current.splice(0, 32);
          drop.forEach((d) => {
            d.sprite.parent?.removeChild(d.sprite);
            d.sprite.destroy();
          });
        }

        for (let i = 0; i < count; i += 1) {
          const relPath = paths[i % paths.length];
          const tex = texturesRef.current.get(relPath);
          if (!tex) continue;
          const spr = new Sprite(tex);
          spr.anchor.set(0.5);
          spr.position.set(cx, cy);
          if (useAdditiveRef.current) {
            spr.blendMode = 'add';
          }
          spr.tint = tints[i % tints.length];
          const angle = (Math.PI * 2 * i) / Math.max(1, count) + (Math.random() - 0.5) * 0.5;
          const speed = (preset === 'explosion' || preset === 'smash' ? 240 : 190) * (0.45 + Math.random() * 0.85);
          const baseScale =
            ((preset === 'goal' || preset === 'victory' || preset === 'strike' ? 54 : 42) /
              Math.max(32, tex.width || 128)) *
            (0.7 + Math.random() * 0.6);
          spr.scale.set(baseScale);
          container.addChild(spr);

          particlesRef.current.push({
            sprite: spr,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - 55,
            vr: (Math.random() - 0.5) * 6,
            life: preset === 'victory' || preset === 'strike' ? 0.85 : 0.55,
            maxLife: preset === 'victory' || preset === 'strike' ? 0.85 : 0.55,
            baseScale,
            growFactor: preset === 'explosion' ? 0.9 : 0.45,
          });
        }
      },
    }),
    []
  );

  return (
    <div
      ref={hostRef}
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 z-10 overflow-hidden ${className}`}
    />
  );
});

PixiGameFxLayer.displayName = 'PixiGameFxLayer';
