import {
  HS_ARENA_H,
  HS_ARENA_W,
  HS_BALL_RADIUS,
  HS_CROSSBAR_Y,
  HS_GOAL_H,
  HS_GOAL_W,
  HS_GROUND_Y,
  HS_HEAD_RADIUS,
  HS_POST_RADIUS,
  getHeadSoccerSkin,
  type HeadSoccerSimulation,
  type HeadSoccerSkinId,
} from '../../shared/headSoccer';
import {
  drawArcadeSprite,
  preloadArcadeSprites,
} from './arcade/arcadeSprites';

let preloadedHeadSoccer = false;
function ensureHeadSoccerAssets(): void {
  if (preloadedHeadSoccer) return;
  preloadedHeadSoccer = true;
  preloadArcadeSprites([
    'assets/games/sports/ball_soccer1.png',
    'assets/games/particles/star_07.png',
  ]);
}

export interface ConfettiDot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  life: number;
}

export function drawStadiumAndField(
  ctx: CanvasRenderingContext2D,
  timeSec: number,
  goalCelebration = false
) {
  ensureHeadSoccerAssets();

  // 1. Rich Stadium Twilight Sky + Horizon Atmospheric Glow
  const skyGrad = ctx.createLinearGradient(0, 0, 0, HS_GROUND_Y);
  skyGrad.addColorStop(0, '#050b1f');
  skyGrad.addColorStop(0.45, '#102148');
  skyGrad.addColorStop(0.85, '#1e3a6e');
  skyGrad.addColorStop(1, '#2d4d88');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, HS_ARENA_W, HS_GROUND_Y);

  // Subtle stars + drifting clouds in upper stadium aperture
  ctx.fillStyle = 'rgba(241, 245, 249, 0.5)';
  for (let i = 0; i < 28; i += 1) {
    const sx = ((i * 137) % (HS_ARENA_W - 40)) + 20;
    const sy = ((i * 53) % 95) + 12;
    ctx.fillRect(sx, sy, i % 3 === 0 ? 2 : 1.2, i % 3 === 0 ? 2 : 1.2);
  }
  ctx.fillStyle = 'rgba(148, 197, 255, 0.08)';
  for (let c = 0; c < 4; c += 1) {
    const cx = ((c * 240 + timeSec * (7 + c * 1.5)) % (HS_ARENA_W + 180)) - 90;
    const cy = 62 + (c % 2) * 26;
    ctx.beginPath();
    ctx.ellipse(cx, cy, 74, 18, 0, 0, Math.PI * 2);
    ctx.ellipse(cx + 38, cy - 6, 50, 14, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  // 2. Curved Stadium Roof Truss Canopy Silhouette + Steel Ribs
  ctx.fillStyle = '#070d1f';
  ctx.beginPath();
  ctx.moveTo(0, 96);
  ctx.quadraticCurveTo(HS_ARENA_W * 0.5, 44, HS_ARENA_W, 96);
  ctx.lineTo(HS_ARENA_W, 0);
  ctx.lineTo(0, 0);
  ctx.closePath();
  ctx.fill();

  ctx.strokeStyle = 'rgba(56, 189, 248, 0.34)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(0, 96);
  ctx.quadraticCurveTo(HS_ARENA_W * 0.5, 44, HS_ARENA_W, 96);
  ctx.stroke();

  ctx.strokeStyle = 'rgba(148, 163, 184, 0.14)';
  ctx.lineWidth = 1.5;
  for (let r = 80; r < HS_ARENA_W; r += 90) {
    ctx.beginPath();
    ctx.moveTo(r, 0);
    ctx.lineTo(r + (r < HS_ARENA_W / 2 ? 12 : -12), 78);
    ctx.stroke();
  }

  // 3. 4 Stadium Floodlight Towers + Diagonal Volumetric Beams
  const towers = [95, 310, 590, 805];
  for (const fx of towers) {
    // Truss mast
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(fx, 44);
    ctx.lineTo(fx, 195);
    ctx.stroke();

    // Volumetric light beam cone angled toward midfield
    const beamDir = fx < HS_ARENA_W * 0.5 ? 115 : -115;
    const beamGrad = ctx.createLinearGradient(fx, 44, fx + beamDir, HS_GROUND_Y);
    beamGrad.addColorStop(0, goalCelebration ? 'rgba(250, 204, 21, 0.26)' : 'rgba(224, 242, 254, 0.2)');
    beamGrad.addColorStop(0.55, 'rgba(148, 163, 255, 0.06)');
    beamGrad.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = beamGrad;
    ctx.beginPath();
    ctx.moveTo(fx - 22, 46);
    ctx.lineTo(fx + 22, 46);
    ctx.lineTo(fx + beamDir + 120, HS_GROUND_Y);
    ctx.lineTo(fx + beamDir - 120, HS_GROUND_Y);
    ctx.closePath();
    ctx.fill();

    // Light fixture bank
    ctx.fillStyle = '#334155';
    ctx.fillRect(fx - 28, 30, 56, 15);
    ctx.fillStyle = '#fef9c3';
    for (let lx = -20; lx <= 20; lx += 10) {
      ctx.beginPath();
      ctx.arc(fx + lx, 38, 3.3, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // 4. Two-Tier Grandstand Bowls + Animated Cheering Crowd
  ctx.fillStyle = '#0c1326';
  ctx.fillRect(0, 175, HS_ARENA_W, HS_GROUND_Y - 175);

  // Upper & lower tier railings
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 175, HS_ARENA_W, 8);
  ctx.fillRect(0, 265, HS_ARENA_W, 10);
  ctx.fillRect(0, 345, HS_ARENA_W, 8);

  const crowdColors = ['#9146FF', '#FACC15', '#38BDF8', '#EF4444', '#10B981', '#F8FAFC'];
  const waveSpeed = goalCelebration ? 8.5 : 3.2;
  const waveAmp = goalCelebration ? 4.8 : 1.9;
  for (let row = 0; row < 4; row += 1) {
    const baseY = 205 + row * 48;
    for (let i = 0; i < 46; i += 1) {
      const cx = 12 + i * 19.6 + (row % 2) * 9;
      const bounce = Math.sin(timeSec * waveSpeed + i * 0.72 + row * 1.1) * waveAmp;
      ctx.fillStyle = crowdColors[(i * 3 + row) % crowdColors.length];
      ctx.globalAlpha = 0.62;
      ctx.beginPath();
      ctx.arc(cx, baseY + bounce, 5.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillRect(cx - 4.5, baseY + bounce + 4, 9, 10);
    }
  }
  ctx.globalAlpha = 1;

  // 5. Center Stadium Jumbotron Screen
  ctx.fillStyle = '#070b18';
  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(HS_ARENA_W / 2 - 96, 114, 192, 50, 8);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = goalCelebration ? '#facc15' : '#e0f2fe';
  ctx.font = '800 12px system-ui, sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText(
    goalCelebration ? '★ ¡GOOOOL EN EL ESTADIO! ★' : 'COPA CABEZONES · DIRECTO',
    HS_ARENA_W / 2,
    143
  );

  // 6. Pitch-Side Illuminated LED Advertising Boards
  ctx.fillStyle = '#070b16';
  ctx.fillRect(0, HS_GROUND_Y - 28, HS_ARENA_W, 28);
  ctx.strokeStyle = 'rgba(56, 189, 248, 0.65)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, HS_GROUND_Y - 28);
  ctx.lineTo(HS_ARENA_W, HS_GROUND_Y - 28);
  ctx.stroke();

  ctx.fillStyle = 'rgba(191, 148, 255, 0.85)';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (let bx = 110; bx < HS_ARENA_W; bx += 225) {
    ctx.fillText('COPA CABEZONES · ARENA PRO', bx, HS_GROUND_Y - 10);
  }

  // 7. Crisp Mowed Emerald Pitch, Top Depth Vignette & Chalk Markings
  const stripeW = HS_ARENA_W / 12;
  for (let i = 0; i < 12; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? '#168a3e' : '#147235';
    ctx.fillRect(i * stripeW, HS_GROUND_Y, stripeW + 1, HS_ARENA_H - HS_GROUND_Y);
  }

  const pitchSheen = ctx.createLinearGradient(0, HS_GROUND_Y, 0, HS_ARENA_H);
  pitchSheen.addColorStop(0, 'rgba(134, 239, 172, 0.16)');
  pitchSheen.addColorStop(0.35, 'rgba(0, 0, 0, 0)');
  pitchSheen.addColorStop(1, 'rgba(3, 18, 9, 0.42)');
  ctx.fillStyle = pitchSheen;
  ctx.fillRect(0, HS_GROUND_Y, HS_ARENA_W, HS_ARENA_H - HS_GROUND_Y);

  // Bright top turf lip & chalk line
  ctx.fillStyle = '#4ade80';
  ctx.fillRect(0, HS_GROUND_Y, HS_ARENA_W, 5);
  ctx.fillStyle = 'rgba(255,255,255,0.92)';
  ctx.fillRect(HS_GOAL_W, HS_GROUND_Y + 1, HS_ARENA_W - HS_GOAL_W * 2, 2.5);

  // Penalty area ticks & center spot
  ctx.strokeStyle = 'rgba(255,255,255,0.45)';
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.arc(HS_ARENA_W / 2, HS_GROUND_Y + 18, 46, Math.PI, Math.PI * 2);
  ctx.stroke();

  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(HS_ARENA_W / 2, HS_GROUND_Y + 3, 4.5, 0, Math.PI * 2);
  ctx.fill();
}

export function drawGoals(
  ctx: CanvasRenderingContext2D,
  netRipple = 0,
  goalBannerSide: 0 | 1 | null = null,
  timeSec = 0
) {
  const drawSingleGoal = (side: 'left' | 'right') => {
    const isHitGoal =
      netRipple > 0.02 &&
      ((side === 'left' && goalBannerSide === 1) || (side === 'right' && goalBannerSide === 0));
    const rippleAmp = isHitGoal ? netRipple * 7.5 : 0;

    const xStart = side === 'left' ? 8 : HS_ARENA_W - HS_GOAL_W;
    const w = HS_GOAL_W - 8;
    const postX = side === 'left' ? HS_GOAL_W : HS_ARENA_W - HS_GOAL_W;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.38)';
    ctx.fillRect(xStart, HS_CROSSBAR_Y, w, HS_GOAL_H);

    // Woven animated net lines
    ctx.strokeStyle = isHitGoal ? 'rgba(250, 204, 21, 0.6)' : 'rgba(241, 245, 249, 0.36)';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    for (let x = xStart; x <= xStart + w; x += 11) {
      const wave = rippleAmp * Math.sin(timeSec * 24 + x * 0.25);
      ctx.moveTo(x + wave * 0.4, HS_CROSSBAR_Y);
      ctx.lineTo(x + wave, HS_GROUND_Y);
    }
    for (let y = HS_CROSSBAR_Y; y <= HS_GROUND_Y; y += 11) {
      const wave = rippleAmp * Math.cos(timeSec * 22 + y * 0.2);
      ctx.moveTo(xStart, y + wave * 0.35);
      ctx.lineTo(xStart + w, y - wave * 0.25);
    }
    ctx.stroke();

    // Inner depth stanchions
    ctx.strokeStyle = '#94a3b8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    if (side === 'left') {
      ctx.moveTo(postX, HS_CROSSBAR_Y);
      ctx.lineTo(10, HS_CROSSBAR_Y + 14);
      ctx.lineTo(10, HS_GROUND_Y);
    } else {
      ctx.moveTo(postX, HS_CROSSBAR_Y);
      ctx.lineTo(HS_ARENA_W - 10, HS_CROSSBAR_Y + 14);
      ctx.lineTo(HS_ARENA_W - 10, HS_GROUND_Y);
    }
    ctx.stroke();

    // Outer white goal frame
    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(side === 'left' ? 10 : HS_ARENA_W - 10, HS_CROSSBAR_Y);
    ctx.lineTo(postX, HS_CROSSBAR_Y);
    ctx.lineTo(postX, HS_GROUND_Y);
    ctx.stroke();

    ctx.fillStyle = '#e2e8f0';
    ctx.beginPath();
    ctx.arc(postX, HS_CROSSBAR_Y, HS_POST_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  };

  drawSingleGoal('left');
  drawSingleGoal('right');
}

export function drawCaricaturePlayer(
  ctx: CanvasRenderingContext2D,
  player: HeadSoccerSimulation['players'][number],
  ballX: number,
  ballY: number,
  skinId: HeadSoccerSkinId,
  superCharge = 0
) {
  const skin = getHeadSoccerSkin(skinId);
  const { x, y, facing, kickTimer, onGround } = player;

  const heightAboveGround = Math.max(0, HS_GROUND_Y - HS_HEAD_RADIUS - y);
  const shadowScale = Math.max(0.42, 1 - heightAboveGround / 240);
  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  ctx.beginPath();
  ctx.ellipse(x, HS_GROUND_Y + 4, 24 * shadowScale, 6 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();

  // Super Ready gold turf glow ring
  if (superCharge >= 100) {
    ctx.save();
    ctx.strokeStyle = 'rgba(250, 204, 21, 0.85)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(x, HS_GROUND_Y + 3, 28, 7, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  const swingProgress = kickTimer > 0 ? 1 - kickTimer / 0.22 : 0;
  const bootAngle = facing * (kickTimer > 0 ? -Math.sin(swingProgress * Math.PI) * 1.15 : 0.08);
  const bootOffsetX = facing * (10 + Math.sin(swingProgress * Math.PI) * 20);
  const bootOffsetY = HS_HEAD_RADIUS - 2 - Math.sin(swingProgress * Math.PI) * 12;

  ctx.save();
  ctx.translate(x + bootOffsetX, y + bootOffsetY);
  ctx.rotate(bootAngle);
  ctx.fillStyle = skin.secondary;
  ctx.fillRect(-5, -10, 10, 10);
  ctx.fillStyle = '#0f172a';
  ctx.strokeStyle = skin.boot;
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.roundRect(-8, -2, 22, 12, 5);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = '#e2e8f0';
  ctx.fillRect(-5, 10, 4, 3);
  ctx.fillRect(3, 10, 4, 3);
  ctx.restore();

  // Jersey Torso & Collar
  ctx.save();
  ctx.fillStyle = skin.primary;
  ctx.strokeStyle = skin.secondary;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(x - 14, y + HS_HEAD_RADIUS - 12, 28, 16, 7);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = skin.boot;
  ctx.fillRect(x - 6, y + HS_HEAD_RADIUS - 9, 12, 3);
  ctx.restore();

  ctx.save();
  ctx.translate(x, y);
  const tilt = Math.max(-0.14, Math.min(0.14, player.vx * 0.00035));
  ctx.rotate(tilt);

  // Dynamic cleat arc trail when kicking
  if (kickTimer > 0) {
    ctx.save();
    ctx.strokeStyle = superCharge >= 100 ? 'rgba(250, 204, 21, 0.7)' : 'rgba(248, 250, 252, 0.45)';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(0, HS_HEAD_RADIUS - 4, 26, facing > 0 ? -0.5 : Math.PI - 0.3, facing > 0 ? 0.5 : Math.PI + 0.5);
    ctx.stroke();
    ctx.restore();
  }

  // Head + Glossy 3D Specular Sheen
  const headGrad = ctx.createRadialGradient(-7, -9, 6, 0, 0, HS_HEAD_RADIUS);
  headGrad.addColorStop(0, '#ffe8d6');
  headGrad.addColorStop(0.55, skin.skinTone);
  headGrad.addColorStop(1, '#c97a4b');
  ctx.fillStyle = headGrad;
  ctx.strokeStyle = superCharge >= 100 ? '#facc15' : '#0f172a';
  ctx.lineWidth = superCharge >= 100 ? 3.4 : 3;
  ctx.beginPath();
  ctx.arc(0, 0, HS_HEAD_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = 'rgba(255, 255, 255, 0.24)';
  ctx.beginPath();
  ctx.ellipse(-8, -10, 9, 5, -0.45, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = skin.hair;
  if (skinId === 'striker') {
    ctx.beginPath();
    ctx.moveTo(-24, -10);
    ctx.lineTo(-18, -32);
    ctx.lineTo(-6, -24);
    ctx.lineTo(2, -35);
    ctx.lineTo(13, -24);
    ctx.lineTo(23, -31);
    ctx.lineTo(25, -10);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = skin.primary;
    ctx.fillRect(-26, -13, 52, 6);
  } else if (skinId === 'furia') {
    ctx.beginPath();
    ctx.arc(0, -6, HS_HEAD_RADIUS - 1, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FACC15';
    ctx.fillRect(-26, -11, 52, 5);
  } else if (skinId === 'ninja' || skinId === 'astro') {
    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(0, -5, HS_HEAD_RADIUS, Math.PI, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = skin.boot;
    ctx.fillRect(facing > 0 ? -2 : -22, -9, 24, 9);
  } else {
    ctx.beginPath();
    ctx.arc(0, -8, HS_HEAD_RADIUS - 1, Math.PI * 0.95, Math.PI * 2.05);
    ctx.fill();
  }

  const lookAngle = Math.atan2(ballY - y, ballX - x);
  const px = Math.cos(lookAngle) * 2.5;
  const py = Math.sin(lookAngle) * 2.5;
  const eyeCenterX = facing * 8;
  for (const dx of [-7, 7]) {
    const ex = eyeCenterX + dx;
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#0f172a';
    ctx.lineWidth = 1.6;
    ctx.beginPath();
    ctx.ellipse(ex, -1, 5.5, 6.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = '#0f172a';
    ctx.beginPath();
    ctx.arc(ex + px, -1 + py, 2.7, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(ex + px - 1, -2.5 + py, 1, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2.2;
  ctx.lineCap = 'round';
  ctx.beginPath();
  ctx.moveTo(eyeCenterX - 11, -10);
  ctx.lineTo(eyeCenterX - 3, -8);
  ctx.moveTo(eyeCenterX + 3, -8);
  ctx.lineTo(eyeCenterX + 11, -10);
  ctx.stroke();

  ctx.beginPath();
  if (kickTimer > 0 || !onGround) {
    ctx.fillStyle = '#7f1d1d';
    ctx.ellipse(facing * 9, 13, 6, 4.5, 0, 0, Math.PI * 2);
    ctx.fill();
  } else {
    ctx.arc(facing * 8, 11, 6.5, 0.15, Math.PI - 0.15);
    ctx.stroke();
  }

  ctx.restore();
}

export function drawSoccerBall(ctx: CanvasRenderingContext2D, ball: HeadSoccerSimulation['ball']) {
  const height = Math.max(0, HS_GROUND_Y - HS_BALL_RADIUS - ball.y);
  const scale = Math.max(0.35, 1 - height / 280);
  ctx.fillStyle = 'rgba(0,0,0,0.35)';
  ctx.beginPath();
  ctx.ellipse(ball.x, HS_GROUND_Y + 4, HS_BALL_RADIUS * scale, 5 * scale, 0, 0, Math.PI * 2);
  ctx.fill();

  // Super Shot Comet Trail
  const superTrail = ball.superTrail ?? 0;
  if (superTrail > 0.05) {
    const spd = Math.max(1, Math.hypot(ball.vx, ball.vy));
    const ux = -ball.vx / spd;
    const uy = -ball.vy / spd;
    const tailLen = 58 * superTrail;
    const grad = ctx.createLinearGradient(ball.x, ball.y, ball.x + ux * tailLen, ball.y + uy * tailLen);
    grad.addColorStop(0, 'rgba(250, 204, 21, 0.88)');
    grad.addColorStop(0.5, 'rgba(249, 115, 22, 0.55)');
    grad.addColorStop(1, 'rgba(239, 68, 68, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, HS_BALL_RADIUS + 8, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = grad;
    ctx.lineWidth = HS_BALL_RADIUS * 1.4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(ball.x, ball.y);
    ctx.lineTo(ball.x + ux * tailLen, ball.y + uy * tailLen);
    ctx.stroke();
  }

  if (
    drawArcadeSprite(
      ctx,
      'assets/games/sports/ball_soccer1.png',
      ball.x,
      ball.y,
      HS_BALL_RADIUS * 2.18,
      HS_BALL_RADIUS * 2.18,
      ball.angle
    )
  ) {
    return;
  }

  ctx.save();
  ctx.translate(ball.x, ball.y);
  ctx.rotate(ball.angle);

  const grad = ctx.createRadialGradient(-5, -5, 3, 0, 0, HS_BALL_RADIUS);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.75, '#e2e8f0');
  grad.addColorStop(1, '#94a3b8');
  ctx.fillStyle = grad;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 2.2;
  ctx.beginPath();
  ctx.arc(0, 0, HS_BALL_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#1e293b';
  ctx.beginPath();
  for (let i = 0; i < 5; i += 1) {
    const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
    const px = Math.cos(a) * 6.5;
    const py = Math.sin(a) * 6.5;
    if (i === 0) ctx.moveTo(px, py);
    else ctx.lineTo(px, py);
  }
  ctx.closePath();
  ctx.fill();

  for (let i = 0; i < 5; i += 1) {
    const a = (i * Math.PI * 2) / 5 - Math.PI / 2;
    const cx = Math.cos(a) * 14.5;
    const cy = Math.sin(a) * 14.5;
    ctx.beginPath();
    ctx.arc(cx, cy, 4, 0, Math.PI * 2);
    ctx.fill();
  }

  ctx.restore();
}
