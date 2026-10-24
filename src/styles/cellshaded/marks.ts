// Märken som ritas ovanpå kartan i skärmens pixlar: färjor över sjön, tärning och pil för flygmaskinen.
import { THEME } from "./theme";
import { type Ctx, ellipse } from "./util";

/**
 * En färja mellan två kanters mittpunkter (skärmens pixlar). Ritas som en streckad lina mellan två bryggor
 * med en liten båt i mitten, vriden längs linjen. `unit` är brickans sida i pixlar.
 */
export function drawFerry(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, unit: number): void {
  const f = THEME.symbol.ferry;
  const mx = (x1 + x2) / 2, my = (y1 + y2) / 2;
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const len = Math.hypot(x2 - x1, y2 - y1);
  const ow = Math.max(1.5, unit * 0.022);
  ctx.save();
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.setLineDash([unit * 0.05, unit * 0.05]);
  ctx.lineWidth = Math.max(2, unit * 0.025);
  ctx.strokeStyle = THEME.river.glint;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
  ctx.setLineDash([]);
  for (const [px, py] of [[x1, y1], [x2, y2]] as const) {
    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang);
    ctx.fillStyle = f.hull;
    ctx.strokeStyle = THEME.outline;
    ctx.lineWidth = ow;
    ctx.beginPath();
    ctx.rect(-unit * 0.04, -unit * 0.06, unit * 0.08, unit * 0.12);
    ctx.fill();
    ctx.stroke();
    ctx.restore();
  }
  const L = Math.min(unit * 0.4, len * 0.7), W = L * 0.42;
  // kastskugga i skärmens riktning
  ctx.save();
  ctx.translate(mx + THEME.shadowDir[0] * unit * 0.025, my + THEME.shadowDir[1] * unit * 0.025);
  ctx.rotate(ang);
  ellipse(ctx, 0, 0, L / 2, W / 2);
  ctx.fillStyle = `rgba(0,0,0,${THEME.shadowAlpha})`;
  ctx.fill();
  ctx.restore();
  ctx.translate(mx, my);
  ctx.rotate(ang);
  const hull = () => {
    ctx.beginPath();
    ctx.moveTo(-L / 2, -W / 2);
    ctx.lineTo(L * 0.28, -W / 2);
    ctx.quadraticCurveTo(L / 2, 0, L * 0.28, W / 2);
    ctx.lineTo(-L / 2, W / 2);
    ctx.closePath();
  };
  hull();
  ctx.fillStyle = f.hull;
  ctx.fill();
  ctx.save();
  hull();
  ctx.clip();
  ctx.fillStyle = f.hullDark;
  ctx.fillRect(-L, 0, L * 2, W);
  ctx.restore();
  hull();
  ctx.lineWidth = ow;
  ctx.strokeStyle = THEME.outline;
  ctx.stroke();
  ctx.fillStyle = f.sail;
  ctx.fillRect(-L * 0.28, -W * 0.28, L * 0.5, W * 0.56);
  ctx.fillStyle = f.sailDark;
  ctx.fillRect(-L * 0.28, 0, L * 0.5, W * 0.28);
  ctx.strokeRect(-L * 0.28, -W * 0.28, L * 0.5, W * 0.56);
  ctx.restore();
}

const PIPS: Record<number, readonly (readonly [number, number])[]> = {
  1: [[0, 0]],
  2: [[-1, -1], [1, 1]],
  3: [[-1, -1], [0, 0], [1, 1]],
  4: [[-1, -1], [1, -1], [-1, 1], [1, 1]],
  5: [[-1, -1], [1, -1], [0, 0], [-1, 1], [1, 1]],
  6: [[-1, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [1, 1]],
};

/** En tärning med `roll` prickar (1-6), mitt i (x, y) och med sidan `size` pixlar. */
export function drawDie(ctx: Ctx, x: number, y: number, size: number, roll: number): void {
  const r = size * 0.18;
  const half = size / 2;
  const rect = (dx: number, dy: number) => {
    ctx.beginPath();
    ctx.moveTo(-half + r + dx, -half + dy);
    ctx.arcTo(half + dx, -half + dy, half + dx, half + dy, r);
    ctx.arcTo(half + dx, half + dy, -half + dx, half + dy, r);
    ctx.arcTo(-half + dx, half + dy, -half + dx, -half + dy, r);
    ctx.arcTo(-half + dx, -half + dy, half + dx, -half + dy, r);
    ctx.closePath();
  };
  ctx.save();
  ctx.translate(x, y);
  ctx.lineJoin = "round";
  rect(size * 0.06, size * 0.08);
  ctx.fillStyle = `rgba(0,0,0,${THEME.shadowAlpha})`;
  ctx.fill();
  rect(0, 0);
  ctx.fillStyle = THEME.house.wallLight;
  ctx.fill();
  ctx.save();
  ctx.clip();
  ctx.fillStyle = THEME.house.wallDark;
  ctx.fillRect(half * 0.55, -half, half, size);
  ctx.restore();
  rect(0, 0);
  ctx.lineWidth = Math.max(2, size * 0.05);
  ctx.strokeStyle = THEME.outline;
  ctx.stroke();
  ctx.fillStyle = THEME.outline;
  const step = size * 0.26;
  for (const [px, py] of PIPS[Math.max(1, Math.min(6, Math.round(roll)))] ?? PIPS[1]!) {
    ctx.beginPath();
    ctx.arc(px * step, py * step, size * 0.075, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

/** Pil från (x1, y1) till (x2, y2) i skärmens pixlar, med kontur. */
export function drawDiceArrow(ctx: Ctx, x1: number, y1: number, x2: number, y2: number, width: number): void {
  const ang = Math.atan2(y2 - y1, x2 - x1);
  const len = Math.hypot(x2 - x1, y2 - y1);
  if (len < 1) return;
  const head = Math.min(len * 0.5, width * 3.2);
  const bx = x2 - Math.cos(ang) * head, by = y2 - Math.sin(ang) * head;
  const col = THEME.symbol.flier.arrow;
  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.strokeStyle = THEME.outline;
  ctx.lineWidth = width + 6;
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(bx, by);
  ctx.stroke();
  ctx.strokeStyle = col;
  ctx.lineWidth = width;
  ctx.stroke();
  const tri = () => {
    ctx.beginPath();
    ctx.moveTo(x2, y2);
    ctx.lineTo(bx + Math.cos(ang + Math.PI / 2) * width * 1.5, by + Math.sin(ang + Math.PI / 2) * width * 1.5);
    ctx.lineTo(bx + Math.cos(ang - Math.PI / 2) * width * 1.5, by + Math.sin(ang - Math.PI / 2) * width * 1.5);
    ctx.closePath();
  };
  tri();
  ctx.lineWidth = 6;
  ctx.strokeStyle = THEME.outline;
  ctx.stroke();
  tri();
  ctx.fillStyle = col;
  ctx.fill();
  ctx.restore();
}
