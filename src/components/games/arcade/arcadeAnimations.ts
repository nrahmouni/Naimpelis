import gsap from 'gsap';
import confetti from 'canvas-confetti';
import { drawArcadeSprite, preloadArcadeSprites } from './arcadeSprites';

export const ONLINE_LIBRARY_SPRITES = [
  // Kenney Sports Pack
  'assets/games/sports/ball_bowling1.png',
  'assets/games/sports/ball_bowling2.png',
  'assets/games/sports/ball_bowling3.png',
  'assets/games/sports/ball_soccer1.png',
  'assets/games/sports/ball_soccer2.png',
  'assets/games/sports/ball_tennis1.png',
  'assets/games/sports/ball_tennis2.png',
  'assets/games/sports/ball_puck.png',
  'assets/games/sports/racket_metal.png',
  'assets/games/sports/racket_wood.png',
  'assets/games/sports/character_blue_1.png',
  'assets/games/sports/character_blue_2.png',
  'assets/games/sports/character_blue_3.png',
  'assets/games/sports/character_red_1.png',
  'assets/games/sports/character_red_2.png',
  'assets/games/sports/character_red_3.png',
  // Kenney Rolling Ball Pack
  'assets/games/rolling/ball_blue_large.png',
  'assets/games/rolling/ball_red_large.png',
  'assets/games/rolling/block_large.png',
  'assets/games/rolling/block_corner_large.png',
  'assets/games/rolling/hole_large.png',
  'assets/games/rolling/hole_large_end.png',
  // Kenney Particle Pack
  'assets/games/particles/spark_01.png',
  'assets/games/particles/spark_02.png',
  'assets/games/particles/spark_03.png',
  'assets/games/particles/star_01.png',
  'assets/games/particles/star_04.png',
  'assets/games/particles/star_07.png',
  'assets/games/particles/flare_01.png',
  'assets/games/particles/slash_01.png',
  'assets/games/particles/slash_02.png',
  'assets/games/particles/smoke_01.png',
  'assets/games/particles/circle_02.png',
  'assets/games/particles/magic_04.png',
  'assets/games/particles/muzzle_01.png',
  'assets/games/particles/twirl_01.png',
  'assets/games/particles/light_01.png',
  // Kenney Toon Characters
  'assets/games/toon/male_idle.png',
  'assets/games/toon/male_run0.png',
  'assets/games/toon/male_run1.png',
  'assets/games/toon/male_run2.png',
  'assets/games/toon/male_kick.png',
  'assets/games/toon/male_jump.png',
  'assets/games/toon/male_cheer0.png',
  'assets/games/toon/female_idle.png',
  'assets/games/toon/female_kick.png',
  'assets/games/toon/female_cheer0.png',
  'assets/games/toon/robot_idle.png',
  'assets/games/toon/robot_cheer0.png',
] as const;

export function preloadOnlineGameAssets(): void {
  preloadArcadeSprites(ONLINE_LIBRARY_SPRITES);
}

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function fireVictoryConfetti(theme: 'gold' | 'goal' | 'strike' | 'arcade' = 'gold'): void {
  if (typeof window === 'undefined' || prefersReducedMotion()) return;
  const palettes: Record<typeof theme, string[]> = {
    gold: ['#FACC15', '#FDE047', '#F59E0B', '#FFFFFF', '#7C3AED'],
    goal: ['#22C55E', '#38BDF8', '#FACC15', '#FFFFFF'],
    strike: ['#38BDF8', '#22D3EE', '#F43F5E', '#FACC15'],
    arcade: ['#A855F7', '#06B6D4', '#EC4899', '#FACC15'],
  };
  const colors = palettes[theme];
  try {
    void confetti({
      particleCount: 55,
      spread: 68,
      origin: { x: 0.25, y: 0.65 },
      colors,
      disableForReducedMotion: true,
    });
    void confetti({
      particleCount: 55,
      spread: 68,
      origin: { x: 0.75, y: 0.65 },
      colors,
      disableForReducedMotion: true,
    });
  } catch {
    // Headless / jsdom environments without full 2D canvas context
  }
}

export function animateModalEntrance(el: HTMLElement | null): void {
  if (!el || prefersReducedMotion()) return;
  try {
    gsap.fromTo(
      el,
      { opacity: 0, scale: 0.88, y: 18 },
      { opacity: 1, scale: 1, y: 0, duration: 0.42, ease: 'back.out(1.6)', clearProps: 'transform' }
    );
  } catch {
    // ignore in minimal environments
  }
}

export function animateStaggerCards(container: HTMLElement | null, selector: string): void {
  if (!container || prefersReducedMotion()) return;
  const nodes = container.querySelectorAll(selector);
  if (!nodes.length) return;
  try {
    gsap.fromTo(
      nodes,
      { opacity: 0, y: 14, scale: 0.96 },
      {
        opacity: 1,
        y: 0,
        scale: 1,
        duration: 0.34,
        stagger: 0.025,
        ease: 'power2.out',
        clearProps: 'transform',
      }
    );
  } catch {
    // ignore
  }
}

export function animateHudPulse(el: HTMLElement | null): void {
  if (!el || prefersReducedMotion()) return;
  try {
    gsap.fromTo(
      el,
      { scale: 1.14 },
      { scale: 1, duration: 0.28, ease: 'elastic.out(1, 0.5)', clearProps: 'transform' }
    );
  } catch {
    // ignore
  }
}

export interface SpriteVfxParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  size: number;
  life: number;
  maxLife: number;
  rot: number;
  vRot: number;
  sprite: string;
}

export class GameSpriteVfxPool {
  private items: SpriteVfxParticle[] = [];

  clear(): void {
    this.items = [];
  }

  emitBurst(
    x: number,
    y: number,
    sprites: readonly string[],
    count = 8,
    speed = 180,
    size = 28,
    life = 0.5
  ): void {
    for (let i = 0; i < count; i += 1) {
      const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.45;
      const spd = speed * (0.45 + Math.random() * 0.75);
      this.items.push({
        x,
        y,
        vx: Math.cos(angle) * spd,
        vy: Math.sin(angle) * spd - 35,
        size: size * (0.75 + Math.random() * 0.55),
        life,
        maxLife: life,
        rot: Math.random() * Math.PI * 2,
        vRot: (Math.random() - 0.5) * 8,
        sprite: sprites[i % sprites.length],
      });
    }
  }

  emitHitRing(x: number, y: number, sprite = 'assets/games/particles/flare_01.png', size = 64): void {
    this.items.push({
      x,
      y,
      vx: 0,
      vy: 0,
      size,
      life: 0.28,
      maxLife: 0.28,
      rot: Math.random() * Math.PI,
      vRot: 5,
      sprite,
    });
  }

  stepAndDraw(ctx: CanvasRenderingContext2D, dt: number): void {
    for (let i = this.items.length - 1; i >= 0; i -= 1) {
      const p = this.items[i];
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.rot += p.vRot * dt;
      p.life -= dt;
      if (p.life <= 0) {
        this.items.splice(i, 1);
        continue;
      }
      const alpha = Math.max(0, Math.min(1, p.life / p.maxLife));
      const scale = p.vx === 0 && p.vy === 0 ? 1 + (1 - alpha) * 0.7 : 0.7 + alpha * 0.45;
      drawArcadeSprite(ctx, p.sprite, p.x, p.y, p.size * scale, p.size * scale, p.rot, alpha);
    }
  }
}
