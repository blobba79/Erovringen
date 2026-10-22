// Hus, kloster, trädgård, träd och sköld. Allt ritas i brickans enhetskoordinater (ctx är redan skalad).
import { THEME } from "./theme";
import { type Ctx, dropShadow, ellipse, fillOutline, pathPoly, twoToneBall } from "./util";

const ow = THEME.outlineW;

/** Fyll en polygon och lägg en mörkare halva (x >= mx) ovanpå, klippt till polygonen. Sedan kontur. */
function twoToneSplit(ctx: Ctx, pts: [number, number][], mx: number, light: string, dark: string, w: number): void {
  pathPoly(ctx, pts);
  ctx.fillStyle = light;
  ctx.fill();
  ctx.save();
  pathPoly(ctx, pts);
  ctx.clip();
  ctx.fillStyle = dark;
  ctx.fillRect(mx, -10, 10, 20);
  ctx.restore();
  pathPoly(ctx, pts);
  ctx.lineWidth = w;
  ctx.lineJoin = "round";
  ctx.strokeStyle = THEME.outline;
  ctx.stroke();
}

/** Litet hus med mittpunkt (x, y) och bredd s. */
export function house(ctx: Ctx, x: number, y: number, s: number): void {
  const h = THEME.house;
  const wall: [number, number][] = [[x - s / 2, y - s * 0.05], [x + s / 2, y - s * 0.05], [x + s / 2, y + s * 0.5], [x - s / 2, y + s * 0.5]];
  const roof: [number, number][] = [[x - s * 0.62, y - s * 0.05], [x, y - s * 0.6], [x + s * 0.62, y - s * 0.05]];
  dropShadow(ctx, () => pathPoly(ctx, [[x - s * 0.5, y + s * 0.5], [x + s * 0.5, y + s * 0.5], [x + s * 0.5 + s * 0.6, y + s * 0.5 + s * 0.4], [x + s * 0.5, y + s * 0.5 + s * 0.4], [x - s * 0.5, y + s * 0.5 + s * 0.4]]), 0);
  twoToneSplit(ctx, wall, x, h.wallLight, h.wallDark, ow * 0.75);
  twoToneSplit(ctx, roof, x, h.roofLight, h.roofDark, ow * 0.75);
}

/** Kloster med mittpunkt (x, y). */
export function cloisterBuilding(ctx: Ctx, x: number, y: number): void {
  const s = THEME.cloister.size, h = THEME.house;
  const wall: [number, number][] = [[x - s / 2, y - s * 0.08], [x + s / 2, y - s * 0.08], [x + s / 2, y + s * 0.4], [x - s / 2, y + s * 0.4]];
  const roof: [number, number][] = [[x - s * 0.6, y - s * 0.08], [x, y - s * 0.62], [x + s * 0.6, y - s * 0.08]];
  dropShadow(ctx, () => pathPoly(ctx, [[x - s * 0.5, y + s * 0.4], [x + s * 0.5, y + s * 0.4], [x + s * 1.0, y + s * 0.8], [x - s * 0.1, y + s * 0.8]]), 0);
  twoToneSplit(ctx, wall, x, h.wallLight, h.wallDark, ow);
  twoToneSplit(ctx, roof, x, h.roofLight, h.roofDark, ow);
  // dörr
  pathPoly(ctx, [[x - s * 0.1, y + s * 0.4], [x - s * 0.1, y + s * 0.18], [x + s * 0.1, y + s * 0.18], [x + s * 0.1, y + s * 0.4]]);
  fillOutline(ctx, THEME.cloister.door, ow * 0.7);
  // kors på taket
  ctx.fillStyle = THEME.cloister.cross;
  ctx.strokeStyle = THEME.outline;
  ctx.lineWidth = ow * 0.6;
  const cy = y - s * 0.62;
  for (const r of [[x - s * 0.025, cy - s * 0.2, s * 0.05, s * 0.2], [x - s * 0.08, cy - s * 0.15, s * 0.16, s * 0.045]] as const) {
    ctx.fillRect(r[0], r[1], r[2], r[3]);
    ctx.strokeRect(r[0], r[1], r[2], r[3]);
  }
}

/** Trädgård: rund häck med blommor. */
export function garden(ctx: Ctx, x: number, y: number, r: number): void {
  const g = THEME.garden;
  dropShadow(ctx, () => ellipse(ctx, x, y, r, r), r * 0.3);
  twoToneBall(ctx, x, y, r, g.hedgeLight, g.hedge, null, ow);
  const pts: [number, number, string][] = [[-0.4, -0.2, g.flower], [0.1, -0.45, g.flower2], [0.35, 0.05, g.flower], [-0.1, 0.25, g.flower2], [0.2, 0.4, g.flower], [-0.45, 0.3, g.flower2]];
  for (const [dx, dy, c] of pts) {
    ellipse(ctx, x + dx * r, y + dy * r, r * 0.11, r * 0.11);
    ctx.fillStyle = c;
    ctx.fill();
  }
}

export function tree(ctx: Ctx, x: number, y: number, r: number): void {
  const t = THEME.tree;
  dropShadow(ctx, () => ellipse(ctx, x + r * 0.3, y + r * 0.45, r, r * 0.85), r * 0.35);
  twoToneBall(ctx, x, y, r, t.light, t.dark, t.glint, ow * 0.8);
}

/** Sköld (poängbricka): ljus vänster halva, mörk höger halva. */
export function shield(ctx: Ctx, x: number, y: number, s: number): void {
  const sh = THEME.shield;
  const pts: [number, number][] = [[x - s / 2, y - s * 0.5], [x + s / 2, y - s * 0.5], [x + s / 2, y + s * 0.05], [x + s * 0.3, y + s * 0.32], [x, y + s * 0.55], [x - s * 0.3, y + s * 0.32], [x - s / 2, y + s * 0.05]];
  dropShadow(ctx, () => pathPoly(ctx, pts), s * 0.14);
  twoToneSplit(ctx, pts, x, sh.light, sh.dark, ow * 0.8);
  // vit kantlinje i mitten (hård, tunn)
  ctx.strokeStyle = sh.trim;
  ctx.lineWidth = ow * 0.45;
  ctx.beginPath();
  ctx.moveTo(x, y - s * 0.38);
  ctx.lineTo(x, y + s * 0.38);
  ctx.moveTo(x - s * 0.3, y - s * 0.12);
  ctx.lineTo(x + s * 0.3, y - s * 0.12);
  ctx.stroke();
}
