import { expect, test } from "bun:test";
import { allTileTypes } from "../../src/tiles";
import { computeGeometry } from "../../src/geometry";
import { cellshadedStyle } from "../../src/styles/cellshaded";
import { endsAtCenter, shortenLine } from "../../src/styles/cellshaded/junction";

test("brickor med vägslut ritas i alla vridningar och geometrin är oförändrad av ritningen", () => {
  const ctx = new Proxy({}, { get: () => () => {}, set: () => true }) as unknown as CanvasRenderingContext2D;
  let found = 0;
  for (const t of allTileTypes().values()) {
    const geometry = computeGeometry(t);
    const before = JSON.stringify(geometry);
    if (geometry.features.some((f) => endsAtCenter(f.centerline))) found++;
    for (const rotation of [0, 90, 180, 270] as const) cellshadedStyle.drawTile({ ctx, tile: t, geometry, rotation, size: 100 });
    expect(JSON.stringify(geometry), t.id).toBe(before);
    expect(JSON.stringify(computeGeometry(t)), t.id).toBe(before);
  }
  expect(found).toBeGreaterThan(5);
});

test("vägen kortas så att den slutar före mitten", () => {
  const t = [...allTileTypes().values()].find((x) => computeGeometry(x).features.filter((f) => endsAtCenter(f.centerline)).length >= 3)!;
  const line = computeGeometry(t).features.find((f) => endsAtCenter(f.centerline))!.centerline!;
  const s = shortenLine(line);
  expect(Math.hypot(s[1]![0] - 0.5, s[1]![1] - 0.5)).toBeGreaterThan(0.15);
});
