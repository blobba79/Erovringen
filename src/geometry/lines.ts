// Mittlinjer för vägar och floder, och band runt dem.
import type { Edge } from "../shared/tiles";
import type { Point, Shape } from "../shared/style";
import { EDGE_MID, circle, clockwise } from "./math";

/** Halv bredd (i brickans enheter) som vägar och floder upptar. Stilarna bör rita ungefär lika breda. */
export const ROAD_HALF = 0.085;
export const RIVER_HALF = 0.125;
const CENTER: Point = [0.5, 0.5];

function bezier(a: Point, c: Point, b: Point, n = 10): Point[] {
  const out: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const t = i / n, u = 1 - t;
    out.push([u * u * a[0] + 2 * u * t * c[0] + t * t * b[0], u * u * a[1] + 2 * u * t * c[1] + t * t * b[1]]);
  }
  return out;
}

const isOpposite = (a: Edge, b: Edge) => ("NS".includes(a) && "NS".includes(b)) || ("EW".includes(a) && "EW".includes(b));

/**
 * Mittlinje för en väg/flod med de givna kanterna.
 * 2 kanter: rakt igenom eller en mjuk kurva; annars en stjärna in till mitten (A, mitt, B, mitt, C ...).
 */
export function centerline(edges: readonly Edge[]): Point[] {
  const mids = edges.map((e) => EDGE_MID[e]);
  if (mids.length === 0) return [CENTER, CENTER];
  if (mids.length === 1) return [mids[0] as Point, CENTER];
  if (mids.length === 2) {
    const [a, b] = mids as [Point, Point];
    return isOpposite(edges[0] as Edge, edges[1] as Edge) ? [a, CENTER, b] : bezier(a, CENTER, b);
  }
  const out: Point[] = [];
  mids.forEach((m, i) => {
    if (i > 0) out.push(CENTER);
    out.push(m);
  });
  return out;
}

/** Samma linje förlängd lite utanför brickan, så att rastrering når kanten. */
export function extendedLine(line: readonly Point[], edges: readonly Edge[]): Point[] {
  const ext: Point[] = [];
  const push = (p: Point) => ext.push([p[0] + (p[0] <= 0 ? -0.05 : p[0] >= 1 ? 0.05 : 0), p[1] + (p[1] <= 0 ? -0.05 : p[1] >= 1 ? 0.05 : 0)]);
  if (edges.length === 0) return [...line];
  line.forEach(push);
  return ext;
}

/** Bandets form (fyrhörning per sträcka, plus rund kant vid knutar) för markeringar. */
export function bandShape(line: readonly Point[], half: number): Shape {
  const polys: Point[][] = [];
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i] as Point, b = line[i + 1] as Point;
    const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
    if (l < 1e-9) continue;
    const nx = (-dy / l) * half, ny = (dx / l) * half;
    polys.push([[a[0] + nx, a[1] + ny], [b[0] + nx, b[1] + ny], [b[0] - nx, b[1] - ny], [a[0] - nx, a[1] - ny]]);
  }
  for (let i = 1; i + 1 < line.length; i++) polys.push(circle(line[i] as Point, half, 10));
  if (line.length === 2 && line[0]![0] === line[1]![0] && line[0]![1] === line[1]![1]) polys.push(circle(line[0] as Point, half, 10));
  return polys.map(clockwise);
}
