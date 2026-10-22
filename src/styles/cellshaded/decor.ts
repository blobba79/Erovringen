// Var dekorationer hamnar (hus, träd, symboler). Räknas i oroterade koordinater och beror bara på brickans id.
import type { FeatureGeometry, Point } from "../../shared/style";
import { dist, pointInShape, polyDist, signedArea } from "../../geometry/math";
import { THEME } from "./theme";
import { rng } from "./util";

/** Avstånd till närmaste hårda del (stad, väg, flod, kloster); negativt inuti. */
function clearance(p: Point, hard: readonly FeatureGeometry[]): number {
  let best = 1;
  for (const f of hard) {
    if (pointInShape(p, f.area)) return -dist(p, f.anchor) - 0.01;
    if (f.centerline) best = Math.min(best, polyDist(p, f.centerline) - (f.kind === "river" ? 0.125 : 0.085));
    else for (const poly of f.area) for (const v of poly) best = Math.min(best, dist(p, v));
    if (f.kind === "cloister" || f.kind === "garden") best = Math.min(best, dist(p, f.anchor) - 0.22);
  }
  return best;
}

const isHard = (f: FeatureGeometry) => f.kind !== "field";

/** Hus inne i en stad: lyckad placering av upp till ett antal hus, undan från `avoid`. */
export function housesFor(seed: string, city: FeatureGeometry, avoid: readonly Point[]): Point[] {
  const r = rng("houses:" + seed + city.feature);
  const area = Math.abs(signedArea(city.area[0] ?? []));
  const want = Math.min(7, Math.round(area * 14));
  const s = THEME.house.size, out: Point[] = [];
  for (let i = 0; i < 120 && out.length < want; i++) {
    const p: Point = [0.06 + r() * 0.88, 0.06 + r() * 0.88];
    const inside = [[0, 0], [-1, -1], [1, -1], [-1, 1], [1, 1]].every(([a, b]) => pointInShape([p[0] + (a as number) * s * 0.7, p[1] + (b as number) * s * 0.55], city.area));
    if (!inside) continue;
    if (avoid.some((a) => dist(a, p) < s * 1.5) || out.some((o) => dist(o, p) < s * 1.45)) continue;
    out.push(p);
  }
  return out.sort((a, b) => a[1] - b[1]);
}

/** Träd på fälten, utanför vägar, städer och pjäsplatser. */
export function treesFor(seed: string, fields: readonly FeatureGeometry[], hard: readonly FeatureGeometry[], avoid: readonly Point[]): { p: Point; r: number }[] {
  const r = rng("trees:" + seed);
  const [lo, hi] = THEME.treesPerTile;
  const want = lo + Math.floor(r() * (hi - lo + 1));
  const out: { p: Point; r: number }[] = [];
  for (let i = 0; i < 80 && out.length < want; i++) {
    const p: Point = [0.05 + r() * 0.9, 0.05 + r() * 0.9];
    const rad = THEME.tree.r * (0.8 + r() * 0.4);
    if (!fields.some((f) => pointInShape(p, f.area))) continue;
    if (clearance(p, hard.filter(isHard)) < rad + 0.02) continue;
    if (avoid.some((a) => dist(a, p) < rad + 0.1) || out.some((o) => dist(o.p, p) < o.r + rad + 0.03)) continue;
    out.push({ p, r: rad });
  }
  return out.sort((a, b) => a.p[1] - b.p[1]);
}

/** Bästa lediga platser för brickans symboler (så öppen mark som möjligt). */
export function symbolSpots(count: number, geo: readonly FeatureGeometry[], taken: readonly Point[]): Point[] {
  const hard = geo.filter(isHard);
  const spots: Point[] = [];
  for (let n = 0; n < count; n++) {
    let best: Point = [0.5, 0.5], bs = -Infinity;
    for (let i = 2; i < 9; i++) for (let j = 2; j < 9; j++) {
      const p: Point = [i / 10, j / 10];
      let s = Math.min(clearance(p, hard), 0.35) + 0.01 * (Math.min(p[0], 1 - p[0], p[1], 1 - p[1]));
      for (const t of [...taken, ...spots]) s = Math.min(s, dist(t, p) - 0.1);
      if (s > bs + 1e-9) { bs = s; best = p; }
    }
    spots.push(best);
  }
  return spots;
}
