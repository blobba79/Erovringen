import { expect, test } from "bun:test";
import { allTileTypes } from "../../src/tiles";
import { computeGeometry } from "../../src/geometry";
import { cellshadedStyle } from "../../src/styles/cellshaded";
import { JUNCTION_MODES, endsAtCenter, setJunctionMode, shortenLine } from "../../src/styles/cellshaded/junction";

function count(t: Parameters<typeof computeGeometry>[0]): number {
  let n = 0;
  const ctx = new Proxy({}, { get: () => () => { n++; }, set: () => true }) as unknown as CanvasRenderingContext2D;
  cellshadedStyle.drawTile({ ctx, tile: t, geometry: computeGeometry(t), rotation: 90, size: 100 });
  return n;
}

test("alla korsningslägen ritar alla brickor utan fel; standard är oförändrat", () => {
  const tiles = [...allTileTypes().values()];
  setJunctionMode("none");
  const base = tiles.map(count);
  let changed = 0;
  for (const m of JUNCTION_MODES) {
    setJunctionMode(m);
    tiles.forEach((t, i) => { if (count(t) !== base[i]) changed++; });
  }
  setJunctionMode("none");
  expect(tiles.map(count)).toEqual(base);
  expect(changed).toBeGreaterThan(0);
});

test("geometrin ändras inte av läget och förslag C kortar vägen", () => {
  const t = [...allTileTypes().values()].find((x) => computeGeometry(x).features.filter((f) => endsAtCenter(f.centerline)).length >= 3)!;
  const a = JSON.stringify(computeGeometry(t));
  setJunctionMode("C");
  expect(JSON.stringify(computeGeometry(t))).toBe(a);
  setJunctionMode("none");
  const line = computeGeometry(t).features.find((f) => endsAtCenter(f.centerline))!.centerline!;
  const s = shortenLine(line, "C");
  expect(Math.hypot(s[1]![0] - 0.5, s[1]![1] - 0.5)).toBeGreaterThan(0.1);
});
