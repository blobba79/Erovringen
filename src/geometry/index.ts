// Brickgeometri: formerna på brickans delar i enhetskvadraten, räknade från brickdatan.
// Samma för alla grafikstilar och för foton (markeringar och pjäsplatser).
import type { Edge, FieldFeature, HalfEdge, TileType } from "../shared/tiles";
import type { FeatureGeometry, GeometryFn, Point, Shape, TileGeometry } from "../shared/style";
import { HALF_EDGE_SEG, circle, clockwise, pointInShape, polyDist, polyMidpoint } from "./math";
import { cityPolygon } from "./cities";
import { RIVER_HALF, ROAD_HALF, bandShape, centerline, extendedLine } from "./lines";
import { flood, maskOf, nearestFree, pole, seedCells, traceMask } from "./raster";

export * from "./math";
export { CITY_DEPTH } from "./cities";
export { ROAD_HALF, RIVER_HALF } from "./lines";

const box = (x0: number, y0: number, x1: number, y1: number): Point[] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];

/** Mittområdets form för kloster, trädgård och okända mittsymboler. */
function centerShape(kind: string): Point[] {
  if (kind === "cloister") return box(0.26, 0.26, 0.74, 0.74);
  if (kind === "garden") return circle([0.5, 0.5], 0.2, 20);
  return circle([0.5, 0.5], 0.15, 16);
}


const cache = new WeakMap<TileType, TileGeometry>();

export const computeGeometry: GeometryFn = (tile) => {
  const hit = cache.get(tile);
  if (hit) return hit;
  const feats: FeatureGeometry[] = [];
  const blockers: ((p: Point) => boolean)[] = [];

  const cities = tile.features.filter((f) => f.kind === "city") as Extract<TileType["features"][number], { kind: "city" }>[];
  for (const c of cities) {
    const shape: Shape = [clockwise(cityPolygon(c.edges))];
    blockers.push((p) => pointInShape(p, shape));
    const m = maskOf((p) => pointInShape(p, shape));
    feats.push({ feature: c.id, kind: "city", area: shape, anchor: pole(m) ?? [0.5, 0.5] });
  }

  for (const f of tile.features) {
    if (f.kind === "road" || f.kind === "river") {
      const edges = (f as { edges: Edge[] }).edges;
      const half = f.kind === "road" ? ROAD_HALF : RIVER_HALF;
      const line = centerline(edges);
      const ext = extendedLine(line, edges);
      blockers.push((p) => polyDist(p, ext) < half);
      feats.push({ feature: f.id, kind: f.kind, area: bandShape(line, half), centerline: line, anchor: polyMidpoint(line) });
    } else if (f.kind !== "city" && f.kind !== "field") {
      const shape: Shape = [centerShape(f.kind)];
      blockers.push((p) => pointInShape(p, shape));
      feats.push({ feature: f.id, kind: f.kind, area: shape, anchor: [0.5, 0.5] });
    }
  }

  const blocked = maskOf((p) => blockers.some((b) => b(p)));
  const fields = tile.features.filter((f) => f.kind === "field") as FieldFeature[];
  const seeds = fields.map((f) => f.halfEdges.flatMap((h: HalfEdge) => // "I" = fältet i mitten
    HALF_EDGE_SEG[h] ? seedCells(HALF_EDGE_SEG[h][0], HALF_EDGE_SEG[h][1], blocked) : nearestFree([0.5, 0.5], blocked)));
  const label = flood(blocked, seeds);
  fields.forEach((f, i) => {
    const m = new Uint8Array(blocked.length);
    for (let c = 0; c < m.length; c++) if (label[c] === i) m[c] = 1;
    let area = traceMask(m);
    let anchor = pole(m);
    if (!anchor || area.length === 0) {
      const seg = HALF_EDGE_SEG[f.halfEdges[0] as HalfEdge] ?? ([[0.4, 0.5], [0.6, 0.5]] as const);
      anchor = [(seg[0][0] + seg[1][0]) / 2 * 0.9 + 0.05, (seg[0][1] + seg[1][1]) / 2 * 0.9 + 0.05];
      area = [circle(anchor, 0.04, 8)];
    }
    feats.push({ feature: f.id, kind: "field", area, anchor });
  });

  // behåll brickdatans ordning
  const order = new Map(tile.features.map((f, i) => [f.id, i]));
  feats.sort((a, b) => (order.get(a.feature) ?? 0) - (order.get(b.feature) ?? 0));
  const geo: TileGeometry = { tile: tile.id, features: feats };
  cache.set(tile, geo);
  return geo;
};
