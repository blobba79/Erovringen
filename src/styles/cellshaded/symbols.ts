// Enkla ikoner för symboler och egenskaper (vulkan, drake, portal, guld, magiker, flygmaskin,
// skördecirkel, färja, katedral, varor, värdshus, prinsessa). Mitt (x, y), storlek s, enhetskoordinater.
import { THEME } from "./theme";
import { type Ctx, dropShadow, ellipse, fillOutline, pathPoly, twoToneBall } from "./util";

const ow = THEME.outlineW * 0.8;
type P = [number, number];

function poly(ctx: Ctx, x: number, y: number, s: number, pts: P[], fill: string): void {
  pathPoly(ctx, pts.map(([a, b]) => [x + a * s, y + b * s] as P));
  fillOutline(ctx, fill, ow);
}

function volcano(ctx: Ctx, x: number, y: number, s: number): void {
  const c = THEME.symbol.volcano;
  dropShadow(ctx, () => pathPoly(ctx, [[x - s * 0.5, y + s * 0.4], [x - s * 0.15, y - s * 0.3], [x + s * 0.15, y - s * 0.3], [x + s * 0.5, y + s * 0.4]]), s * 0.12);
  poly(ctx, x, y, s, [[-0.5, 0.4], [-0.16, -0.28], [0.16, -0.28], [0.5, 0.4]], c.rock);
  poly(ctx, x, y, s, [[0, 0.4], [0.5, 0.4], [0.16, -0.28], [0, -0.28]], c.rockDark);
  poly(ctx, x, y, s, [[-0.2, -0.28], [-0.1, -0.5], [0, -0.34], [0.1, -0.55], [0.2, -0.28]], c.lava);
  poly(ctx, x, y, s, [[-0.06, -0.28], [0, -0.4], [0.06, -0.28]], c.lavaLight);
}

function dragon(ctx: Ctx, x: number, y: number, s: number): void {
  const c = THEME.symbol.dragon;
  poly(ctx, x, y, s, [[-0.05, 0], [-0.55, -0.45], [-0.35, 0.05], [-0.5, 0.15]], c.wing);
  poly(ctx, x, y, s, [[0.05, 0], [0.55, -0.45], [0.35, 0.05], [0.5, 0.15]], c.wing);
  poly(ctx, x, y, s, [[-0.2, -0.1], [0.2, -0.1], [0.25, 0.3], [0, 0.5], [-0.25, 0.3]], c.body);
  poly(ctx, x, y, s, [[0, -0.1], [0.2, -0.1], [0.25, 0.3], [0, 0.5]], c.bodyDark);
  poly(ctx, x, y, s, [[-0.17, -0.45], [0.17, -0.45], [0.22, -0.12], [0, -0.02], [-0.22, -0.12]], c.body);
  poly(ctx, x, y, s, [[-0.17, -0.45], [-0.26, -0.62], [-0.08, -0.5]], c.bodyDark);
  poly(ctx, x, y, s, [[0.17, -0.45], [0.26, -0.62], [0.08, -0.5]], c.bodyDark);
  for (const dx of [-0.08, 0.08]) { ellipse(ctx, x + dx * s, y - s * 0.28, s * 0.045, s * 0.045); ctx.fillStyle = c.eye; ctx.fill(); }
}

function portal(ctx: Ctx, x: number, y: number, s: number): void {
  const c = THEME.symbol.portal;
  ellipse(ctx, x, y, s * 0.4, s * 0.5);
  fillOutline(ctx, c.ringDark, ow);
  ellipse(ctx, x - s * 0.04, y - s * 0.04, s * 0.3, s * 0.4);
  ctx.fillStyle = c.ring;
  ctx.fill();
  ellipse(ctx, x, y, s * 0.17, s * 0.26);
  ctx.fillStyle = c.core;
  ctx.fill();
  ctx.strokeStyle = THEME.outline;
  ctx.lineWidth = ow * 0.6;
  ctx.stroke();
}

function ingot(ctx: Ctx, x: number, y: number, s: number): void {
  const c = THEME.symbol.gold;
  poly(ctx, x, y, s, [[-0.3, 0.2], [-0.18, -0.12], [0.18, -0.12], [0.3, 0.2]], c.light);
  poly(ctx, x, y, s, [[0, 0.2], [0.3, 0.2], [0.18, -0.12], [0, -0.12]], c.dark);
  poly(ctx, x, y, s, [[-0.12, -0.06], [-0.04, -0.06], [-0.08, 0.04]], c.glint);
}

function gold(ctx: Ctx, x: number, y: number, s: number): void {
  ingot(ctx, x - s * 0.17, y + s * 0.2, s * 0.9);
  ingot(ctx, x + s * 0.22, y + s * 0.22, s * 0.9);
  ingot(ctx, x + s * 0.02, y - s * 0.13, s * 0.9);
}

function mage(ctx: Ctx, x: number, y: number, s: number): void {
  const c = THEME.symbol.mage;
  poly(ctx, x, y, s, [[-0.38, 0.28], [0.38, 0.28], [0.25, 0.14], [0.08, -0.5], [-0.08, -0.5], [-0.25, 0.14]], c.hat);
  poly(ctx, x, y, s, [[0, 0.28], [0.38, 0.28], [0.25, 0.14], [0.08, -0.5], [0, -0.5]], c.hatDark);
  poly(ctx, x, y, s, [[0, -0.12], [0.05, -0.02], [0.15, -0.01], [0.07, 0.06], [0.09, 0.16], [0, 0.1], [-0.09, 0.16], [-0.07, 0.06], [-0.15, -0.01], [-0.05, -0.02]], c.star);
}

function flier(ctx: Ctx, x: number, y: number, s: number, dir: string, rot: number): void {
  const c = THEME.symbol.flier;
  poly(ctx, x, y, s, [[-0.5, -0.05], [-0.1, -0.12], [0.5, -0.05], [0.5, 0.05], [-0.1, 0.12]], c.body);
  poly(ctx, x, y, s, [[-0.1, 0.12], [0.5, 0.05], [0.5, -0.05], [-0.1, 0]], c.dark);
  poly(ctx, x, y, s, [[-0.5, -0.05], [-0.5, -0.32], [-0.38, -0.05]], c.dark);
  poly(ctx, x, y, s, [[0.5, -0.3], [0.58, -0.3], [0.58, 0.3], [0.5, 0.3]], c.prop);
  const ang = dir === "NW" ? (-3 * Math.PI) / 4 : Math.PI; // pil dit maskinen får flyga
  ctx.save();
  ctx.translate(x, y + s * 0.5);
  ctx.rotate(ang + (rot * Math.PI) / 180);
  poly(ctx, 0, 0, s, [[-0.4, -0.04], [0.1, -0.04], [0.1, -0.14], [0.4, 0], [0.1, 0.14], [0.1, 0.04], [-0.4, 0.04]], c.arrow);
  ctx.restore();
}

function cropCircle(ctx: Ctx, x: number, y: number, s: number): void {
  const c = THEME.symbol.cropCircle;
  twoToneBall(ctx, x, y, s * 0.46, c.ring, c.ringDark, null, ow);
  ellipse(ctx, x, y, s * 0.27, s * 0.27);
  ctx.fillStyle = c.fill;
  ctx.fill();
  ctx.lineWidth = ow * 0.6;
  ctx.strokeStyle = THEME.outline;
  ctx.stroke();
  ellipse(ctx, x, y, s * 0.09, s * 0.09);
  ctx.fillStyle = c.ring;
  ctx.fill();
}

function ferry(ctx: Ctx, x: number, y: number, s: number): void {
  const c = THEME.symbol.ferry;
  poly(ctx, x, y, s, [[-0.45, 0.15], [0.45, 0.15], [0.3, 0.42], [-0.3, 0.42]], c.hull);
  poly(ctx, x, y, s, [[0, 0.15], [0.45, 0.15], [0.3, 0.42], [0, 0.42]], c.hullDark);
  poly(ctx, x, y, s, [[-0.04, -0.5], [-0.04, 0.12], [-0.36, 0.12]], c.sail);
  poly(ctx, x, y, s, [[0.04, -0.4], [0.4, 0.12], [0.04, 0.12]], c.sailDark);
}

function cathedral(ctx: Ctx, x: number, y: number, s: number): void {
  const c = THEME.symbol.cathedral;
  poly(ctx, x, y, s, [[-0.36, 0.45], [-0.36, -0.05], [0.36, -0.05], [0.36, 0.45]], c.wall);
  poly(ctx, x, y, s, [[0, 0.45], [0, -0.05], [0.36, -0.05], [0.36, 0.45]], c.wallDark);
  poly(ctx, x, y, s, [[-0.45, -0.05], [0, -0.42], [0.45, -0.05]], c.roof);
  poly(ctx, x, y, s, [[0, -0.42], [0.45, -0.05], [0, -0.05]], c.roofDark);
  poly(ctx, x, y, s, [[-0.04, -0.7], [0.04, -0.7], [0.04, -0.62], [0.12, -0.62], [0.12, -0.55], [0.04, -0.55], [0.04, -0.42], [-0.04, -0.42], [-0.04, -0.55], [-0.12, -0.55], [-0.12, -0.62], [-0.04, -0.62]], c.cross);
  poly(ctx, x, y, s, [[-0.1, 0.45], [-0.1, 0.2], [0, 0.1], [0.1, 0.2], [0.1, 0.45]], c.roofDark);
}

function goods(ctx: Ctx, x: number, y: number, s: number, kind: string): void {
  const g = THEME.symbol.goods;
  const [l, d] = kind === "wine" ? [g.wine, g.wineDark] : kind === "grain" ? [g.grain, g.grainDark] : [g.cloth, g.clothDark];
  if (kind === "wine") {
    poly(ctx, x, y, s, [[-0.3, -0.35], [0.3, -0.35], [0.38, 0], [0.3, 0.35], [-0.3, 0.35], [-0.38, 0]], l);
    poly(ctx, x, y, s, [[0, -0.35], [0.3, -0.35], [0.38, 0], [0.3, 0.35], [0, 0.35]], d);
  } else if (kind === "grain") {
    poly(ctx, x, y, s, [[-0.3, 0.4], [-0.1, -0.4], [0.1, -0.4], [0.3, 0.4]], l);
    poly(ctx, x, y, s, [[0, 0.4], [0, -0.4], [0.1, -0.4], [0.3, 0.4]], d);
  } else {
    poly(ctx, x, y, s, [[-0.4, -0.25], [0.4, -0.25], [0.4, 0.3], [-0.4, 0.3]], l);
    poly(ctx, x, y, s, [[0, -0.25], [0.4, -0.25], [0.4, 0.3], [0, 0.3]], d);
  }
}

function inn(ctx: Ctx, x: number, y: number, s: number): void {
  const c = THEME.symbol.inn;
  poly(ctx, x, y, s, [[-0.4, 0.4], [-0.4, -0.05], [0.4, -0.05], [0.4, 0.4]], c.wall);
  poly(ctx, x, y, s, [[0, 0.4], [0, -0.05], [0.4, -0.05], [0.4, 0.4]], c.wallDark);
  poly(ctx, x, y, s, [[-0.5, -0.05], [0, -0.5], [0.5, -0.05]], c.roof);
  poly(ctx, x, y, s, [[0, -0.5], [0.5, -0.05], [0, -0.05]], c.roofDark);
  poly(ctx, x, y, s, [[0.1, 0.1], [0.3, 0.1], [0.3, 0.3], [0.1, 0.3]], c.sign);
}

function princess(ctx: Ctx, x: number, y: number, s: number): void {
  const c = THEME.symbol.princess;
  poly(ctx, x, y, s, [[-0.4, 0.3], [-0.4, -0.3], [-0.2, -0.05], [0, -0.38], [0.2, -0.05], [0.4, -0.3], [0.4, 0.3]], c.crown);
  poly(ctx, x, y, s, [[0, 0.3], [0, -0.38], [0.2, -0.05], [0.4, -0.3], [0.4, 0.3]], c.crownDark);
  ellipse(ctx, x, y + s * 0.12, s * 0.07, s * 0.07);
  ctx.fillStyle = c.gem;
  ctx.fill();
}

/** Ritar en symbol/egenskap med namn som i brickdatan. Okända namn blir en grå fråge-prick. */
export function drawSymbol(ctx: Ctx, name: string, x: number, y: number, s: number, rotation = 0): void {
  ctx.save();
  ctx.lineJoin = "round";
  const [base, arg = ""] = name.split(":");
  switch (base) {
    case "volcano": volcano(ctx, x, y, s); break;
    case "dragon": dragon(ctx, x, y, s); break;
    case "portal": portal(ctx, x, y, s); break;
    case "gold": gold(ctx, x, y, s); break;
    case "mage": mage(ctx, x, y, s); break;
    case "flier": flier(ctx, x, y, s, arg, rotation); break;
    case "crop-circle": cropCircle(ctx, x, y, s); break;
    case "ferry": ferry(ctx, x, y, s); break;
    case "cathedral": cathedral(ctx, x, y, s); break;
    case "goods": goods(ctx, x, y, s, arg); break;
    case "inn": inn(ctx, x, y, s); break;
    case "princess": princess(ctx, x, y, s); break;
    default: twoToneBall(ctx, x, y, s * 0.35, THEME.symbol.unknown.fill, THEME.symbol.unknown.dark, null, ow);
  }
  ctx.restore();
}
