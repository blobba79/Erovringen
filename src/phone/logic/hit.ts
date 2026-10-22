// Träff på en del av brickan när den visas stor på telefonen.

import type { Point, Shape, TileGeometry } from "../../shared/style";
import type { Rotation } from "../../shared/tiles";
import { pointInShape, polyDist, rotatePoint, rotateShape } from "../../geometry/index";

/** Hur nära (i brickans enhet, från mittlinjen) ett tryck får vara en väg eller flod som missats. */
export const LINE_TOLERANCE = 0.14;

const priority = (kind: string): number => (kind === "field" ? 2 : kind === "city" ? 1 : 0);

/**
 * `p` är trycket i den visade (roterade) brickans enhetskvadrat. Returnerar id på delen
 * bland `allowed` som träffas, annars null. Fält ger vika för andra delar där de överlappar.
 */
export function featureAtPoint(
  geometry: TileGeometry,
  rotation: Rotation,
  p: Point,
  allowed: ReadonlySet<string>,
): string | null {
  const q = rotatePoint(p, (360 - rotation) % 360);
  const cands = geometry.features.filter((f) => allowed.has(f.feature));
  const hits = cands.filter((f) => pointInShape(q, f.area)).sort((a, b) => priority(a.kind) - priority(b.kind));
  if (hits[0]) return hits[0].feature;
  let best: string | null = null;
  let bestD = LINE_TOLERANCE;
  for (const f of cands) {
    if (!f.centerline) continue;
    const d = polyDist(q, f.centerline);
    if (d < bestD) {
      bestD = d;
      best = f.feature;
    }
  }
  return best;
}

/** Delens form i den visade brickans pixlar. */
export function shapeInPixels(area: Shape, rotation: Rotation, size: number): Shape {
  return rotateShape(area, rotation).map((poly) => poly.map(([x, y]) => [x * size, y * size] as Point));
}
