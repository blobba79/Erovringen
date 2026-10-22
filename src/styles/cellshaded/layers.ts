// Brickans grundlager: gräs, vägar, floder och stadsytor (utan hus och ikoner). Koordinater är i enhetskvadraten,
// redan roterade till slutlig riktning så att ljuset alltid kommer uppifrån vänster.
import type { Point, Shape } from "../../shared/style";
import { THEME } from "./theme";
import { type Ctx, dropShadow, pathPoly, pathShape, rng } from "./util";

const ow = THEME.outlineW;

function blob(r: () => number, cx: number, cy: number, rad: number): Point[] {
  const n = 7;
  const start = r() * Math.PI;
  return Array.from({ length: n }, (_, i) => {
    const a = start + (i / n) * Math.PI * 2, k = rad * (0.65 + r() * 0.5);
    return [cx + Math.cos(a) * k, cy + Math.sin(a) * k * 0.8] as Point;
  });
}

/** Gräs: grundfärg med ljusare och mörkare fläckar med hårda kanter. Fläckarna beror bara på brickans id. */
export function drawGrass(ctx: Ctx, seed: string): void {
  const g = THEME.grass, p = THEME.grassPatches;
  ctx.fillStyle = g.base;
  ctx.fillRect(0, 0, 1, 1);
  const r = rng("grass:" + seed);
  const patches: [string, number][] = [[g.dark, p.dark], [g.patch, p.light]];
  for (const [color, n] of patches) {
    ctx.fillStyle = color;
    for (let i = 0; i < n; i++) {
      pathPoly(ctx, blob(r, r(), r(), p.minR + r() * (p.maxR - p.minR)));
      ctx.fill();
    }
  }
}

/** Förläng ändar som ligger på brickans kant utåt, så att konturen når fram till grannbrickan. */
function reach(line: readonly Point[]): Point[] {
  const out = line.map((p) => [...p] as [number, number]);
  const push = (i: number, j: number) => {
    const p = out[i] as [number, number], q = line[j] as Point;
    if (p[0] <= 0 || p[0] >= 1 || p[1] <= 0 || p[1] >= 1) {
      const dx = p[0] - q[0], dy = p[1] - q[1], l = Math.hypot(dx, dy) || 1;
      p[0] += (dx / l) * 0.1;
      p[1] += (dy / l) * 0.1;
    }
  };
  if (line.length > 1) { push(0, 1); push(line.length - 1, line.length - 2); }
  return out;
}

function strokeLine(ctx: Ctx, line: readonly Point[], w: number, color: string, dx = 0, dy = 0): void {
  pathPoly(ctx, line.map((p) => [p[0] + dx, p[1] + dy] as Point), false);
  ctx.lineWidth = w;
  ctx.strokeStyle = color;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();
}

/** Väg eller flod: kontur, mörk bas, ljus yta förskjuten uppåt vänster så att en mörk skuggrand blir kvar nere/höger. */
export function drawBand(ctx: Ctx, kind: "road" | "river", line: readonly Point[], area: Shape): void {
  const t = kind === "road" ? THEME.road : THEME.river;
  const l = reach(line);
  strokeLine(ctx, l, t.width + ow * 2, THEME.outline);
  ctx.save();
  pathShape(ctx, area);
  ctx.clip();
  strokeLine(ctx, l, t.width + ow * 2, t.dark);
  strokeLine(ctx, l, t.width, t.light, -t.shade, -t.shade);
  if (kind === "river") {
    ctx.setLineDash([...THEME.river.dash]);
    strokeLine(ctx, l, THEME.river.glintW, THEME.river.glint, -t.width * 0.22, -t.width * 0.22);
    ctx.setLineDash([]);
  }
  ctx.restore();
  if (kind === "river" && line.length === 2 && line[0] !== line[1]) {
    // källa/sjö: runt vattenfång i änden
    const e = line[1] as Point;
    ctx.beginPath();
    ctx.arc(e[0], e[1], t.width * 0.72, 0, Math.PI * 2);
    ctx.fillStyle = t.dark;
    ctx.fill();
    ctx.lineWidth = ow;
    ctx.strokeStyle = THEME.outline;
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(e[0] - t.shade, e[1] - t.shade, t.width * 0.66, 0, Math.PI * 2);
    ctx.fillStyle = t.light;
    ctx.fill();
  }
}

function onBorder(a: Point, b: Point): boolean {
  const e = 1e-6;
  return (a[0] < e && b[0] < e) || (a[0] > 1 - e && b[0] > 1 - e) || (a[1] < e && b[1] < e) || (a[1] > 1 - e && b[1] > 1 - e);
}

/** Stadsyta: skugga, fyllning, mörkare band innanför muren och kontur på de kanter som inte ligger mot brickans rand. */
export function drawCityBody(ctx: Ctx, poly: readonly Point[]): void {
  const c = THEME.city;
  dropShadow(ctx, () => pathPoly(ctx, poly), 0.035);
  pathPoly(ctx, poly);
  ctx.fillStyle = c.light;
  ctx.fill();
  const wall = (width: number, color: string) => {
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    for (let i = 0; i < poly.length; i++) {
      const a = poly[i] as Point, b = poly[(i + 1) % poly.length] as Point;
      if (onBorder(a, b)) continue;
      ctx.beginPath();
      ctx.moveTo(a[0], a[1]);
      ctx.lineTo(b[0], b[1]);
      ctx.stroke();
    }
  };
  ctx.save();
  pathPoly(ctx, poly);
  ctx.clip();
  wall(c.wallBand * 2, c.dark);
  wall(ow * 2, THEME.outline);
  ctx.restore();
}
