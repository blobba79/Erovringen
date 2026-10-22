// Gemensamma ritverktyg för den cellshadade stilen.
import type { Point, Shape } from "../../shared/style";
import { THEME } from "./theme";

export type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** Slumptal som bara beror på en sträng (brickans id), så att dekorationerna alltid blir likadana. */
export function rng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  let a = h >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Blanda en #rrggbb-färg mot svart (t>0) eller vitt (t<0). Andra färgformat lämnas orörda. */
export function shade(color: string, t: number): string {
  const m = /^#([0-9a-f]{6})$/i.exec(color);
  if (!m) return color;
  const n = parseInt(m[1] as string, 16);
  const ch = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(t >= 0 ? v * (1 - t) : v + (255 - v) * -t));
  return `rgb(${ch[0]},${ch[1]},${ch[2]})`;
}

export function pathShape(ctx: Ctx, shape: Shape, dx = 0, dy = 0): void {
  ctx.beginPath();
  for (const poly of shape) {
    poly.forEach((p, i) => (i ? ctx.lineTo(p[0] + dx, p[1] + dy) : ctx.moveTo(p[0] + dx, p[1] + dy)));
    ctx.closePath();
  }
}

export function pathPoly(ctx: Ctx, pts: readonly Point[], close = true): void {
  ctx.beginPath();
  pts.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
  if (close) ctx.closePath();
}

/** Fyll med färg och rita kontur med stilens standardlinje (w anges i nuvarande enheter). */
export function fillOutline(ctx: Ctx, fill: string, w: number): void {
  ctx.fillStyle = fill;
  ctx.fill();
  ctx.lineWidth = w;
  ctx.lineJoin = "round";
  ctx.strokeStyle = THEME.outline;
  ctx.stroke();
}

/** Mjuk-fri kastskugga: samma form förskjuten snett nedåt åt höger, fylld med halvgenomskinlig svart. */
export function dropShadow(ctx: Ctx, draw: () => void, dist: number): void {
  ctx.save();
  ctx.translate(THEME.shadowDir[0] * dist, THEME.shadowDir[1] * dist);
  ctx.fillStyle = `rgba(0,0,0,${THEME.shadowAlpha})`;
  ctx.strokeStyle = "rgba(0,0,0,0)";
  draw();
  ctx.fill();
  ctx.restore();
}

export function ellipse(ctx: Ctx, x: number, y: number, rx: number, ry: number): void {
  ctx.beginPath();
  ctx.ellipse(x, y, rx, ry, 0, 0, Math.PI * 2);
}

/** Cirkel med två toner (hård gräns): mörk bas och ljusare cirkel förskjuten uppåt vänster. */
export function twoToneBall(ctx: Ctx, x: number, y: number, r: number, light: string, dark: string, glint: string | null, ow: number): void {
  ellipse(ctx, x, y, r, r);
  fillOutline(ctx, dark, ow);
  ellipse(ctx, x - r * 0.18, y - r * 0.2, r * 0.74, r * 0.74);
  ctx.fillStyle = light;
  ctx.fill();
  if (glint) {
    ellipse(ctx, x - r * 0.38, y - r * 0.42, r * 0.17, r * 0.17);
    ctx.fillStyle = glint;
    ctx.fill();
  }
}
