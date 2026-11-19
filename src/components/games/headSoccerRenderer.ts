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

export interface ConfettiDot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  color: string;
  size: number;
  life: number;
}

export function drawStadiumAndField(ctx: CanvasRenderingContext2D, timeSec: number) {
  const skyGrad = ctx.createLinearGradient(0, 0, 0, HS_GROUND_Y);
  skyGrad.addColorStop(0, '#090b1a');
  skyGrad.addColorStop(0.55, '#131836');
  skyGrad.addColorStop(1, '#1e293b');
  ctx.fillStyle = skyGrad;
  ctx.fillRect(0, 0, HS_ARENA_W, HS_GROUND_Y);

  for (const fx of [140, 450, 760]) {
    const beam = ctx.createRadialGradient(fx, 26, 8, fx, 140, 290);
    beam.addColorStop(0, 'rgba(255, 255, 235, 0.25)');
    beam.addColorStop(0.5, 'rgba(148, 163, 255, 0.08)');
    beam.addColorStop(1, 'rgba(15, 23, 42, 0)');
    ctx.fillStyle = beam;
    ctx.fillRect(0, 0, HS_ARENA_W, HS_GROUND_Y);

    ctx.fillStyle = '#e2e8f0';
    ctx.fillRect(fx - 26, 12, 52, 10);
    ctx.fillStyle = '#fef08a';
    for (let i = -20; i <= 20; i += 10) {
      ctx.beginPath();
      ctx.arc(fx + i, 22, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 255, HS_ARENA_W, HS_GROUND_Y - 255);
  ctx.fillStyle = '#1e293b';
  ctx.fillRect(0, 295, HS_ARENA_W, 10);
  ctx.fillRect(0, 345, HS_ARENA_W, 10);

  const crowdColors = ['#9146FF', '#FACC15', '#38BDF8', '#EF4444', '#10B981', '#F8FAFC'];
  for (let row = 0; row < 3; row += 1) {
    const baseY = 278 + row * 38;
    for (let i = 0; i < 42; i += 1) {
      const cx = 14 + i * 21.5 + (row % 2) * 10;
      const bounce = Math.sin(timeSec * 3.4 + i * 0.9 + row) * 2.1;
      ctx.fillStyle = crowdColors[(i + row * 2) % crowdColors.length];
      ctx.globalAlpha = 0.55;
      ctx.beginPath();
      ctx.arc(cx, baseY + bounce, 5.5, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.globalAlpha = 1;

  ctx.fillStyle = '#090d16';
  ctx.fillRect(0, HS_GROUND_Y - 26, HS_ARENA_W, 26);
  ctx.strokeStyle = 'rgba(145, 70, 255, 0.55)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, HS_GROUND_Y - 26);
  ctx.lineTo(HS_ARENA_W, HS_GROUND_Y - 26);
  ctx.stroke();

  ctx.fillStyle = 'rgba(191, 148, 255, 0.72)';
  ctx.font = 'bold 11px system-ui, sans-serif';
  ctx.textAlign = 'center';
  for (let bx = 90; bx < HS_ARENA_W; bx += 220) {
    ctx.fillText('RIFFANTV · COPA CABEZONES', bx, HS_GROUND_Y - 9);
  }

  const stripeW = HS_ARENA_W / 10;
  for (let i = 0; i < 10; i += 1) {
    ctx.fillStyle = i % 2 === 0 ? '#15803d' : '#166534';
    ctx.fillRect(i * stripeW, HS_GROUND_Y, stripeW + 1, HS_ARENA_H - HS_GROUND_Y);
  }

  ctx.fillStyle = '#22c55e';
  ctx.fillRect(0, HS_GROUND_Y, HS_ARENA_W, 5);
  ctx.fillStyle = 'rgba(255,255,255,0.85)';
  ctx.fillRect(HS_GOAL_W, HS_GROUND_Y + 1, HS_ARENA_W - HS_GOAL_W * 2, 2.5);
  ctx.beginPath();
  ctx.arc(HS_ARENA_W / 2, HS_GROUND_Y + 16, 42, Math.PI, Math.PI * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.35)';
  ctx.lineWidth = 2.5;
  ctx.stroke();
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(HS_ARENA_W / 2, HS_GROUND_Y + 3, 4, 0, Math.PI * 2);
  ctx.fill();
}

export function drawGoals(ctx: CanvasRenderingContext2D) {
  const drawSingleGoal = (side: 'left' | 'right') => {
    const xStart = side === 'left' ? 8 : HS_ARENA_W - HS_GOAL_W;
    const w = HS_GOAL_W - 8;
    const postX = side === 'left' ? HS_GOAL_W : HS_ARENA_W - HS_GOAL_W;

    ctx.fillStyle = 'rgba(15, 23, 42, 0.35)';
    ctx.fillRect(xStart, HS_CROSSBAR_Y, w, HS_GOAL_H);

    ctx.strokeStyle = 'rgba(241, 245, 249, 0.34)';
    ctx.lineWidth = 1.25;
    ctx.beginPath();
    for (let x = xStart; x <= xStart + w; x += 12) {
      ctx.moveTo(x, HS_CROSSBAR_Y);
      ctx.lineTo(x, HS_GROUND_Y);
    }
    for (let y = HS_CROSSBAR_Y; y <= HS_GROUND_Y; y += 12) {
      ctx.moveTo(xStart, y);
      ctx.lineTo(xStart + w, y);
    }
    ctx.stroke();

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

    ctx.strokeStyle = '#f8fafc';
    ctx.lineWidth = 7;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(side === 'left' ? 10 : HS_ARENA_W - 10, HS_CROSSBAR_Y);
    ctx.lineTo(postX, HS_CROSSBAR_Y);
    ctx.lineTo(postX, HS_GROUND_Y);
    ctx.stroke();

    ctx.fillStyle = '#cbd5e1';
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
  skinId: HeadSoccerSkinId
) {
  const skin = getHeadSoccerSkin(skinId);
  const { x, y, facing, kickTimer, onGround } = player;

  const heightAboveGround = Math.max(0, HS_GROUND_Y - HS_HEAD_RADIUS - y);
  const shadowScale = Math.max(0.42, 1 - heightAboveGround / 240);
  ctx.fillStyle = 'rgba(0,0,0,0.34)';
  ctx.beginPath();
  ctx.ellipse(x, HS_GROUND_Y + 4, 24 * shadowScale, 6 * shadowScale, 0, 0, Math.PI * 2);
  ctx.fill();

  const swingProgress = kickTimer > 0 ? 1 - kickTimer / 0.2 : 0;
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

  ctx.save();
  ctx.fillStyle = skin.primary;
  ctx.strokeStyle = skin.secondary;
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.roundRect(x - 13, y + HS_HEAD_RADIUS - 11, 26, 15, 7);
  ctx.fill();
  ctx.stroke();
  ctx.fillStyle = skin.boot;
  ctx.fillRect(x - 6, y + HS_HEAD_RADIUS - 9, 12, 3);
  ctx.restore();

  ctx.save();
  ctx.translate(x, y);
  const tilt = Math.max(-0.14, Math.min(0.14, player.vx * 0.00035));
  ctx.rotate(tilt);

  const headGrad = ctx.createRadialGradient(-7, -9, 6, 0, 0, HS_HEAD_RADIUS);
  headGrad.addColorStop(0, '#ffe8d6');
  headGrad.addColorStop(0.55, skin.skinTone);
  headGrad.addColorStop(1, '#c97a4b');
  ctx.fillStyle = headGrad;
  ctx.strokeStyle = '#0f172a';
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(0, 0, HS_HEAD_RADIUS, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

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
