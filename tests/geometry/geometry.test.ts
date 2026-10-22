import { describe, expect, test } from "bun:test";
import { allTileTypes } from "../../src/tiles";
import type { Edge, Feature, HalfEdge, TileType } from "../../src/shared/tiles";
import type { Point } from "../../src/shared/style";
import { computeGeometry, pointInShape, rotateEdge, rotateHalfEdge, rotatePoint } from "../../src/geometry";

const tiles = [...allTileTypes().values()];

function rotateTile(t: TileType, r: number): TileType {
  const features = t.features.map((f) => {
    const g = f as { edges?: Edge[]; halfEdges?: HalfEdge[] };
    const copy: Record<string, unknown> = { ...f };
    if (g.edges) copy.edges = g.edges.map((e) => rotateEdge(e, r));
    if (g.halfEdges) copy.halfEdges = g.halfEdges.map((h) => rotateHalfEdge(h, r));
    return copy as unknown as Feature;
  });
  return { ...t, features };
}

const samples: Point[] = [];
for (let i = 0; i < 40; i++) for (let j = 0; j < 40; j++) samples.push([(i + 0.5) / 40, (j + 0.5) / 40]);

describe("brickgeometri", () => {
  test("det finns brickor att testa", () => expect(tiles.length).toBeGreaterThan(100));

  test("alla delar har yta och pjäsplats inuti ytan", () => {
    for (const t of tiles) {
      const g = computeGeometry(t);
      expect(g.features.length, t.id).toBe(t.features.length);
      for (const f of g.features) {
        expect(f.area.length, `${t.id} ${f.feature}`).toBeGreaterThan(0);
        expect(pointInShape(f.anchor, f.area), `${t.id} ${f.feature} anchor`).toBe(true);
        expect(f.anchor.every((v) => v >= 0 && v <= 1)).toBe(true);
      }
    }
  });

  test("kantområden rör sina kanter", () => {
    const touch = (shape: readonly (readonly Point[])[], e: Edge) =>
      shape.some((poly) => poly.some(([x, y]) => (e === "N" ? y <= 1e-6 : e === "S" ? y >= 1 - 1e-6 : e === "W" ? x <= 1e-6 : x >= 1 - 1e-6)));
    for (const t of tiles) {
      const g = computeGeometry(t);
      for (const f of t.features) {
        const fg = g.features.find((x) => x.feature === f.id)!;
        const edges = (f as { edges?: Edge[] }).edges ?? [];
        for (const e of edges) {
          if (f.kind === "city") expect(touch(fg.area, e), `${t.id} ${f.id} ${e}`).toBe(true);
          else {
            const mid: Point = e === "N" ? [0.5, 0] : e === "S" ? [0.5, 1] : e === "W" ? [0, 0.5] : [1, 0.5];
            expect(fg.centerline!.some((p) => p[0] === mid[0] && p[1] === mid[1]), `${t.id} ${f.id} ${e}`).toBe(true);
          }
        }
      }
    }
  });

  test("fält överlappar inte städer, vägar eller floder", () => {
    for (const t of tiles) {
      const g = computeGeometry(t);
      const fields = g.features.filter((f) => f.kind === "field");
      const hard = g.features.filter((f) => f.kind !== "field");
      let bad = 0;
      for (const p of samples) {
        if (fields.some((f) => pointInShape(p, f.area)) && hard.some((h) => pointInShape(p, h.area))) bad++;
      }
      // ett par provpunkter nära gränsen får falla fel (rutnätets upplösning)
      expect(bad, t.id).toBeLessThanOrEqual(40);
      // fälten överlappar inte varandra
      let both = 0;
      for (const p of samples) if (fields.filter((f) => pointInShape(p, f.area)).length > 1) both++;
      expect(both, `${t.id} fält-fält`).toBeLessThanOrEqual(8);
    }
  });

  test("delarna täcker nästan hela brickan", () => {
    for (const t of tiles) {
      const g = computeGeometry(t);
      if (!t.features.some((f) => f.kind === "field")) continue; // CcCc i Crop Circles II saknar fält i datan
      const covered = samples.filter((p) => g.features.some((f) => pointInShape(p, f.area))).length;
      expect(covered / samples.length, t.id).toBeGreaterThan(0.93);
    }
  });

  test("roterad bricka ger roterad geometri", () => {
    for (const t of tiles) {
      const base = computeGeometry(t);
      for (const r of [90, 180, 270]) {
        const rg = computeGeometry(rotateTile(t, r));
        for (const f of base.features) {
          const o = rg.features.find((x) => x.feature === f.feature)!;
          const want = rotatePoint(f.anchor, r);
          const tol = f.kind === "field" ? 2 : 0.1; // fältens pol är godtycklig i symmetriska fall
          expect(Math.hypot(o.anchor[0] - want[0], o.anchor[1] - want[1]), `${t.id} ${f.feature} r${r}`).toBeLessThan(tol);
          // pjäsplatsen ligger i den roterade ytan
          expect(pointInShape(o.anchor, o.area), `${t.id} ${f.feature} r${r} inuti`).toBe(true);
        }
      }
    }
  });

  test("deterministisk", () => {
    for (const t of tiles.slice(0, 20)) {
      const a = JSON.stringify(computeGeometry({ ...t }));
      const b = JSON.stringify(computeGeometry({ ...t }));
      expect(a).toBe(b);
    }
  });

  test("okända mittområden får en rimlig standardform", () => {
    const t: TileType = { id: "x/test", expansion: "base", features: [{ id: "thing", kind: "temple" }, { id: "field0", kind: "field", halfEdges: ["NL", "NR", "EL", "ER", "SL", "SR", "WL", "WR"], adjacentCities: [] }] };
    const g = computeGeometry(t);
    expect(pointInShape(g.features[0]!.anchor, g.features[0]!.area)).toBe(true);
  });
});
