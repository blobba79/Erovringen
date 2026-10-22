// Små geometrihjälpare i brickans enhetskvadrat (y växer nedåt).
import type { Edge, HalfEdge, Rotation } from "../shared/tiles";
import type { Point, Shape } from "../shared/style";

export const EDGES: readonly Edge[] = ["N", "E", "S", "W"];

/** Mittpunkt på en kant. */
export const EDGE_MID: Record<Edge, Point> = { N: [0.5, 0], E: [1, 0.5], S: [0.5, 1], W: [0, 0.5] };

/** Halvkantens sträcka längs brickans ram (L/R sett från mitten utåt). */
export const HALF_EDGE_SEG: Record<HalfEdge, readonly [Point, Point]> = {
  NL: [[0, 0], [0.5, 0]], NR: [[0.5, 0], [1, 0]],
  EL: [[1, 0], [1, 0.5]], ER: [[1, 0.5], [1, 1]],
  SL: [[1, 1], [0.5, 1]], SR: [[0.5, 1], [0, 1]],
  WL: [[0, 1], [0, 0.5]], WR: [[0, 0.5], [0, 0]],
};

/** Rotera en punkt 90 grader medurs k gånger runt brickans mitt. */
export function rotatePoint(p: Point, rotation: Rotation | number): Point {
  let [x, y] = p;
  const k = ((Math.round(rotation / 90) % 4) + 4) % 4;
  for (let i = 0; i < k; i++) [x, y] = [1 - y, x];
  return [x, y];
}

export function rotateShape(s: Shape, rotation: Rotation | number): Shape {
  return s.map((poly) => poly.map((p) => rotatePoint(p, rotation)));
}

export function rotateEdge(e: Edge, rotation: Rotation | number): Edge {
  const k = ((Math.round(rotation / 90) % 4) + 4) % 4;
  return EDGES[(EDGES.indexOf(e) + k) % 4] as Edge;
}

export function rotateHalfEdge(h: HalfEdge, rotation: Rotation | number): HalfEdge {
  if (h.length < 2) return h; // "I" = fältet i mitten
  return (rotateEdge(h[0] as Edge, rotation) + h[1]) as HalfEdge;
}

export function dist(a: Point, b: Point): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

export function lerp(a: Point, b: Point, t: number): Point {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

/** Punkt i form enligt nollskilda varvtalet (som canvas fill), så överlappande delar och hål fungerar. */
export function pointInShape(p: Point, shape: Shape): boolean {
  let wn = 0;
  for (const poly of shape) {
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
      const a = poly[j] as Point, b = poly[i] as Point;
      const cross = (b[0] - a[0]) * (p[1] - a[1]) - (p[0] - a[0]) * (b[1] - a[1]);
      if (a[1] <= p[1]) { if (b[1] > p[1] && cross > 0) wn++; }
      else if (b[1] <= p[1] && cross < 0) wn--;
    }
  }
  return wn !== 0;
}

/** Tecknad area (positiv = medurs på skärmen, y nedåt). */
export function signedArea(poly: readonly Point[]): number {
  let s = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i] as Point, b = poly[(i + 1) % poly.length] as Point;
    s += a[0] * b[1] - b[0] * a[1];
  }
  return s / 2;
}

/** Vänd polygonen så att den löper medurs på skärmen. */
export function clockwise(poly: Point[]): Point[] {
  return signedArea(poly) < 0 ? [...poly].reverse() : poly;
}

/** Avstånd från punkt till sträcka. */
export function segDist(p: Point, a: Point, b: Point): number {
  const dx = b[0] - a[0], dy = b[1] - a[1];
  const l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / l2));
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
}

export function polyDist(p: Point, line: readonly Point[]): number {
  if (line.length === 1) return dist(p, line[0] as Point);
  let d = Infinity;
  for (let i = 0; i + 1 < line.length; i++) d = Math.min(d, segDist(p, line[i] as Point, line[i + 1] as Point));
  return d;
}

/** Klipp en polygon mot halvplanet n·(p-o) >= 0 (Sutherland-Hodgman). */
export function clipHalfPlane(poly: readonly Point[], o: Point, n: Point): Point[] {
  const f = (p: Point) => n[0] * (p[0] - o[0]) + n[1] * (p[1] - o[1]);
  const out: Point[] = [];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i] as Point, b = poly[(i + 1) % poly.length] as Point;
    const fa = f(a), fb = f(b);
    if (fa >= 0) out.push(a);
    if (fa >= 0 !== fb >= 0) out.push(lerp(a, b, fa / (fa - fb)));
  }
  return out;
}

/** Punkten på halva längden längs en bruten linje. */
export function polyMidpoint(line: readonly Point[]): Point {
  let total = 0;
  for (let i = 0; i + 1 < line.length; i++) total += dist(line[i] as Point, line[i + 1] as Point);
  let target = total / 2;
  for (let i = 0; i + 1 < line.length; i++) {
    const a = line[i] as Point, b = line[i + 1] as Point;
    const l = dist(a, b);
    if (target <= l && l > 0) return lerp(a, b, target / l);
    target -= l;
  }
  return line[0] ?? [0.5, 0.5];
}

export function circle(c: Point, r: number, n = 16): Point[] {
  return Array.from({ length: n }, (_, i) => [c[0] + r * Math.cos((2 * Math.PI * i) / n), c[1] + r * Math.sin((2 * Math.PI * i) / n)] as Point);
}
