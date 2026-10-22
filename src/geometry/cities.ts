// Stadsytor: polygoner längs kanterna, byggda i en kanonisk vridning som sedan roteras.
import type { Edge } from "../shared/tiles";
import type { Point } from "../shared/style";
import { EDGES, EDGE_MID, rotatePoint, clipHalfPlane, circle } from "./math";

/** Hur djupt en enkel stad går in från sin kant (mitt på kanten). */
export const CITY_DEPTH = 0.3;
const STEPS = 12;

/** Bågprofil: 0 i ändarna, 1 i mitten, rundad. */
const arch = (t: number) => Math.pow(Math.sin(Math.PI * t), 0.6);

/** Nyckeln skrivs i ordningen N,E,S,W: {N,W} blir "NW", {N,E,W} blir "NEW". */
function canonical(key: string): Point[] | null {
  const d = CITY_DEPTH;
  const pts: Point[] = [];
  switch (key) {
    case "N":
      pts.push([0, 0], [1, 0]);
      for (let i = 1; i < STEPS; i++) pts.push([1 - i / STEPS, d * arch(i / STEPS)]);
      return pts;
    case "NW": // hörn: kurva från (1,0) till (0,1)
      pts.push([0, 0], [1, 0]);
      for (let i = 1; i < STEPS; i++) {
        const t = i / STEPS, u = 1 - t;
        pts.push([u * u + 2 * u * t * 0.26, 2 * u * t * 0.26 + t * t]);
      }
      pts.push([0, 1]);
      return pts;
    case "NS": // genomgående band, ihopsnört i mitten
      pts.push([0, 0], [1, 0]);
      for (let i = 1; i < STEPS; i++) pts.push([1 - 0.28 * arch(i / STEPS), i / STEPS]);
      pts.push([1, 1], [0, 1]);
      for (let i = STEPS - 1; i > 0; i--) pts.push([0.28 * arch(i / STEPS), i / STEPS]);
      return pts;
    case "NEW": // tre kanter, fält vid S
      pts.push([0, 0], [1, 0], [1, 1]);
      for (let i = 1; i < STEPS; i++) pts.push([1 - i / STEPS, 1 - d * arch(i / STEPS)]);
      pts.push([0, 1]);
      return pts;
    case "NESW":
      return [[0, 0], [1, 0], [1, 1], [0, 1]];
  }
  return null;
}

/** Polygonen för en sammanhängande stad som täcker `edges` (oroterad bricka). */
export function cityPolygon(edges: readonly Edge[]): Point[] {
  for (let k = 0; k < 4; k++) {
    const rotated = edges.map((e) => EDGES[(EDGES.indexOf(e) + k) % 4] as Edge);
    const key = EDGES.filter((e) => rotated.includes(e)).join("");
    const poly = canonical(key);
    if (poly) return poly.map((p) => rotatePoint(p, (4 - k) * 90));
  }
  return circle([0.5, 0.5], 0.2);
}

const CORNER: Record<string, Point> = { NE: [1, 0], EN: [1, 0], ES: [1, 1], SE: [1, 1], SW: [0, 1], WS: [0, 1], WN: [0, 0], NW: [0, 0] };

/** Dela två separata städer som möts i ett hörn längs hörnets diagonal. */
export function clipToOwnSide(poly: Point[], edge: Edge, neighbour: Edge): Point[] {
  const c = CORNER[edge + neighbour];
  if (!c) return poly;
  const m = EDGE_MID[edge];
  const dx = c[0] - 0.5, dy = c[1] - 0.5;
  let n: Point = [-dy, dx];
  if (n[0] * (m[0] - 0.5) + n[1] * (m[1] - 0.5) < 0) n = [dy, -dx];
  return clipHalfPlane(poly, [0.5, 0.5], n);
}
