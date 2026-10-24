// Pjäser för expansionerna: byggmästare, gris, magiker, häxa, drake och fe. Ritas i enheter där pjäsen är 1 hög.
import type { Ctx } from "./util";
import { ellipse, pathPoly, shade } from "./util";
import { THEME } from "./theme";

type P = [number, number];

function blob(ctx: Ctx, fill: string, ow: number, alpha = 1): void {
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = ow;
  ctx.lineJoin = "round";
  ctx.strokeStyle = THEME.outline;
  ctx.stroke();
  ctx.globalAlpha = 1;
}
function poly(ctx: Ctx, pts: P[], fill: string, ow: number, alpha = 1): void {
  pathPoly(ctx, pts);
  blob(ctx, fill, ow, alpha);
}
function oval(ctx: Ctx, cx: number, cy: number, rx: number, ry: number, fill: string, ow: number): void {
  ellipse(ctx, cx, cy, rx, ry);
  blob(ctx, fill, ow);
}
function dot(ctx: Ctx, cx: number, cy: number, r: number, fill: string = THEME.outline): void {
  ellipse(ctx, cx, cy, r, r);
  ctx.fillStyle = fill;
  ctx.fill();
}
function sparkle(ctx: Ctx, cx: number, cy: number, r: number, fill: string): void {
  const k = r * 0.3;
  pathPoly(ctx, [[cx, cy - r], [cx + k, cy - k], [cx + r, cy], [cx + k, cy + k], [cx, cy + r], [cx - k, cy + k], [cx - r, cy], [cx - k, cy - k]]);
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = 0.012;
  ctx.strokeStyle = THEME.outline;
  ctx.stroke();
}
/** Kropp i två toner (höger halva mörkare). */
function twoTone(ctx: Ctx, pts: P[], light: string, dark: string, ow: number): void {
  pathPoly(ctx, pts);
  ctx.fillStyle = light;
  ctx.fill();
  ctx.save();
  pathPoly(ctx, pts);
  ctx.clip();
  ctx.fillStyle = dark;
  ctx.fillRect(0.02, -1, 1, 2);
  ctx.restore();
  pathPoly(ctx, pts);
  ctx.lineWidth = ow;
  ctx.lineJoin = "round";
  ctx.strokeStyle = THEME.outline;
  ctx.stroke();
}
function ball(ctx: Ctx, cx: number, cy: number, r: number, light: string, dark: string, ow: number): void {
  ellipse(ctx, cx, cy, r, r);
  ctx.fillStyle = dark;
  ctx.fill();
  ellipse(ctx, cx - r * 0.15, cy - r * 0.15, r * 0.82, r * 0.82);
  ctx.fillStyle = light;
  ctx.fill();
  ellipse(ctx, cx, cy, r, r);
  ctx.lineWidth = ow;
  ctx.strokeStyle = THEME.outline;
  ctx.stroke();
  dot(ctx, cx - r * 0.4, cy - r * 0.42, r * 0.17, THEME.figure.glint);
}

/** Byggmästare (spelarpjäs): smal och hög, gul hjälm, hammare. */
export function drawBuilder(ctx: Ctx, light: string, dark: string, ow: number): void {
  const e = THEME.figure.extra;
  ctx.save();
  ctx.translate(0.3, 0.02);
  ctx.rotate(0.35);
  poly(ctx, [[-0.025, -0.2], [0.025, -0.2], [0.025, 0.28], [-0.025, 0.28]], e.wood, ow * 0.8);
  poly(ctx, [[-0.12, -0.3], [0.12, -0.3], [0.12, -0.16], [-0.12, -0.16]], e.metal, ow * 0.8);
  ctx.restore();
  twoTone(ctx, [[-0.1, -0.12], [-0.26, 0.46], [0.26, 0.46], [0.1, -0.12]], light, dark, ow);
  poly(ctx, [[-0.2, 0.12], [0.2, 0.12], [0.22, 0.22], [-0.22, 0.22]], dark, ow * 0.7);
  ball(ctx, 0, -0.22, 0.15, e.skin, shade(e.skin, 0.2), ow);
  ellipse(ctx, 0, -0.27, 0.19, 0.13);
  ctx.fillStyle = e.hat;
  ctx.fill();
  ctx.save();
  ellipse(ctx, 0, -0.27, 0.19, 0.13);
  ctx.clip();
  ctx.fillStyle = shade(e.hat, 0.2);
  ctx.fillRect(0.03, -0.5, 0.3, 0.5);
  ctx.restore();
  ellipse(ctx, 0, -0.27, 0.19, 0.13);
  ctx.lineWidth = ow;
  ctx.strokeStyle = THEME.outline;
  ctx.stroke();
  poly(ctx, [[-0.24, -0.2], [0.24, -0.2], [0.24, -0.15], [-0.24, -0.15]], e.hat, ow * 0.8);
}

/** Gris (spelarpjäs): kroppen i spelarfärg, rosa nos, öra och ringlad svans. */
export function drawPig(ctx: Ctx, light: string, dark: string, ow: number): void {
  const e = THEME.figure.extra;
  for (const lx of [-0.2, -0.04, 0.12, 0.28]) poly(ctx, [[lx - 0.05, 0.2], [lx + 0.05, 0.2], [lx + 0.05, 0.43], [lx - 0.05, 0.43]], dark, ow * 0.8);
  pathPoly(ctx, [[0.46, 0.0], [0.54, -0.08], [0.52, 0.02], [0.44, 0.08]], false);
  ctx.lineWidth = ow * 1.4;
  ctx.lineJoin = "round";
  ctx.strokeStyle = THEME.outline;
  ctx.stroke();
  twoTone(ctx, ellipsePts(0.08, 0.1, 0.42, 0.27), light, dark, ow);
  poly(ctx, [[-0.32, -0.12], [-0.22, -0.36], [-0.1, -0.12]], e.pigDark, ow);
  oval(ctx, -0.26, -0.02, 0.2, 0.19, e.pig, ow);
  oval(ctx, -0.42, 0.02, 0.1, 0.09, e.pigDark, ow);
  dot(ctx, -0.45, 0.0, 0.015);
  dot(ctx, -0.39, 0.0, 0.015);
  dot(ctx, -0.25, -0.06, 0.03);
}

function ellipsePts(cx: number, cy: number, rx: number, ry: number): P[] {
  const out: P[] = [];
  for (let i = 0; i < 24; i++) out.push([cx + Math.cos((i / 24) * Math.PI * 2) * rx, cy + Math.sin((i / 24) * Math.PI * 2) * ry]);
  return out;
}

/** Magiker (neutral): lila kåpa, spetsig hatt med stjärna, vitt skägg. */
export function drawMage(ctx: Ctx, ow: number): void {
  const e = THEME.figure.extra, dk = shade(e.mage, 0.28);
  twoTone(ctx, [[-0.14, -0.1], [-0.4, 0.46], [0.4, 0.46], [0.14, -0.1]], e.mage, dk, ow);
  ball(ctx, 0, -0.2, 0.16, e.skin, shade(e.skin, 0.2), ow);
  poly(ctx, [[-0.1, -0.12], [0.1, -0.12], [0.04, 0.12], [0, 0.2], [-0.04, 0.12]], "#F5F5F5", ow * 0.8);
  poly(ctx, [[-0.26, -0.27], [0.26, -0.27], [0.2, -0.2], [-0.2, -0.2]], dk, ow);
  poly(ctx, [[-0.17, -0.25], [0.02, -0.54], [0.17, -0.25]], e.mage, ow);
  sparkle(ctx, 0, -0.34, 0.06, THEME.symbol.mage.star);
}

/** Häxa (neutral): mörk kåpa, bred hatt, kvast. */
export function drawWitch(ctx: Ctx, ow: number): void {
  const e = THEME.figure.extra, dk = shade(e.witch, 0.35);
  ctx.save();
  ctx.translate(0.3, 0.05);
  ctx.rotate(-0.25);
  poly(ctx, [[-0.02, -0.3], [0.02, -0.3], [0.02, 0.25], [-0.02, 0.25]], e.wood, ow * 0.8);
  poly(ctx, [[-0.09, 0.2], [0.09, 0.2], [0.14, 0.5], [-0.14, 0.5]], THEME.symbol.goods.grainDark, ow * 0.8);
  ctx.restore();
  twoTone(ctx, [[-0.12, -0.1], [-0.36, 0.46], [0.36, 0.46], [0.12, -0.1]], e.witch, dk, ow);
  ball(ctx, 0, -0.2, 0.15, "#BFE3A0", "#8FBF74", ow);
  oval(ctx, 0, -0.27, 0.32, 0.07, e.witch, ow);
  poly(ctx, [[-0.16, -0.28], [0.1, -0.56], [0.16, -0.28]], e.witch, ow);
  poly(ctx, [[-0.16, -0.31], [0.16, -0.31], [0.15, -0.37], [-0.15, -0.37]], e.witchBand, ow * 0.6);
}

/** Drake (neutral): röd, med vingar, horn och ljus buk. Ritas större av drawFigure. */
export function drawDragon(ctx: Ctx, ow: number): void {
  const e = THEME.figure.extra, dk = shade(e.dragon, 0.28);
  poly(ctx, [[0.05, -0.05], [0.0, -0.5], [0.2, -0.34], [0.34, -0.5], [0.4, -0.2], [0.2, 0.05]], e.dragonWing, ow);
  poly(ctx, [[0.2, 0.3], [0.46, 0.34], [0.54, 0.16], [0.5, 0.42], [0.2, 0.44]], e.dragon, ow);
  twoTone(ctx, ellipsePts(0, 0.14, 0.3, 0.3), e.dragon, dk, ow);
  oval(ctx, -0.04, 0.2, 0.14, 0.2, e.dragonBelly, ow * 0.7);
  poly(ctx, [[-0.2, 0.4], [-0.08, 0.4], [-0.1, 0.48], [-0.26, 0.48]], dk, ow);
  poly(ctx, [[0.04, 0.4], [0.18, 0.4], [0.22, 0.48], [0.06, 0.48]], dk, ow);
  oval(ctx, -0.14, -0.2, 0.2, 0.17, e.dragon, ow);
  oval(ctx, -0.3, -0.14, 0.12, 0.09, e.dragon, ow);
  poly(ctx, [[-0.22, -0.32], [-0.2, -0.5], [-0.12, -0.32]], e.dragonBelly, ow * 0.8);
  poly(ctx, [[-0.08, -0.32], [-0.02, -0.48], [0.03, -0.28]], e.dragonBelly, ow * 0.8);
  dot(ctx, -0.16, -0.23, 0.035);
  dot(ctx, -0.17, -0.24, 0.012, e.eye);
  dot(ctx, -0.34, -0.17, 0.014);
}

/** Fe (neutral): liten och ljus med genomskinliga vingar och glitter. */
export function drawFairy(ctx: Ctx, ow: number): void {
  const e = THEME.figure.extra;
  poly(ctx, [[-0.04, -0.02], [-0.36, -0.36], [-0.44, -0.08], [-0.06, 0.08]], e.fairyWing, ow * 0.8, 0.85);
  poly(ctx, [[0.04, -0.02], [0.36, -0.36], [0.44, -0.08], [0.06, 0.08]], e.fairyWing, ow * 0.8, 0.85);
  poly(ctx, [[-0.04, 0.06], [-0.28, 0.2], [-0.1, 0.24]], e.fairyWing, ow * 0.7, 0.85);
  poly(ctx, [[0.04, 0.06], [0.28, 0.2], [0.1, 0.24]], e.fairyWing, ow * 0.7, 0.85);
  twoTone(ctx, [[-0.08, -0.04], [-0.2, 0.34], [0.2, 0.34], [0.08, -0.04]], e.fairy, shade(e.fairy, 0.12), ow);
  poly(ctx, [[-0.07, 0.34], [-0.05, 0.46], [0.0, 0.46], [-0.01, 0.34]], e.skin, ow * 0.7);
  poly(ctx, [[0.03, 0.34], [0.05, 0.46], [0.1, 0.46], [0.08, 0.34]], e.skin, ow * 0.7);
  ball(ctx, 0, -0.17, 0.14, e.skin, shade(e.skin, 0.2), ow);
  oval(ctx, 0, -0.3, 0.12, 0.05, "#F9C74F", ow * 0.8);
  sparkle(ctx, 0, -0.42, 0.07, e.sparkle);
  sparkle(ctx, -0.38, 0.28, 0.07, e.sparkle);
  sparkle(ctx, 0.4, -0.5, 0.05, e.sparkle);
  sparkle(ctx, 0.36, 0.2, 0.05, e.sparkle);
}
