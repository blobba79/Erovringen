import { expect, test } from "bun:test";
import { allTileTypes } from "../../src/tiles";
import { computeGeometry } from "../../src/geometry";
import { cellshadedStyle } from "../../src/styles/cellshaded";

/** Låtsas-canvas som bara räknar anrop och aldrig kastar. */
function fakeCtx() {
  const calls = { n: 0 };
  const ctx: unknown = new Proxy({}, {
    get: (_t, k) => (k === "calls" ? calls : () => { calls.n++; }),
    set: () => true,
  });
  return { ctx: ctx as CanvasRenderingContext2D, calls };
}

test("stilen ritar alla brickor i alla vridningar utan fel och är deterministisk", () => {
  for (const t of allTileTypes().values()) {
    for (const rotation of [0, 90, 180, 270] as const) {
      const a = fakeCtx();
      cellshadedStyle.drawTile({ ctx: a.ctx, tile: t, geometry: computeGeometry(t), rotation, size: 100 });
      const b = fakeCtx();
      cellshadedStyle.drawTile({ ctx: b.ctx, tile: t, geometry: computeGeometry(t), rotation, size: 100 });
      expect(a.calls.n, t.id).toBeGreaterThan(10);
      expect(a.calls.n, t.id).toBe(b.calls.n);
    }
  }
});

test("pjäser och markeringar ritas", () => {
  const { ctx, calls } = fakeCtx();
  for (const kind of ["meeple", "large-meeple", "abbot", "builder", "okänd"]) {
    cellshadedStyle.drawFigure({ ctx, kind, color: "#E53935", x: 50, y: 50, size: 40 });
    cellshadedStyle.drawFigure({ ctx, kind, color: null, x: 50, y: 50, size: 40 });
  }
  for (const kind of ["area", "open", "blocked", "preview"] as const) cellshadedStyle.drawHighlight({ ctx, shapes: [[[[0, 0], [10, 0], [10, 10]]]], kind });
  expect(calls.n).toBeGreaterThan(100);
  expect(cellshadedStyle.colors.outline).toBe("#1F2A2E");
});
