import { describe, expect, test } from "bun:test";
import { featureAnchor, figureSpots, targetLabels, worldToScreen, type Camera } from "../../src/screen/logic";
import { computeGeometry, rotatePoint } from "../../src/geometry/index";
import { allTileTypes } from "../../src/tiles/index";
import { toTileTypes } from "../../src/engine/index";
import { devEngine, devSetup } from "../../src/screen/dev/game";
import type { Figure, PlacedTile } from "../../src/shared/state";

const types = toTileTypes(allTileTypes());
const view = { width: 1600, height: 900 };
const cam: Camera = { x: 0, y: 0, zoom: 16, rotation: 0 };
const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-6);

const start = devEngine().newGame(devSetup(2, 3)).board["0,0"]!;
const board: Record<string, PlacedTile> = { "0,0": start };
const type = types.get(start.type)!;
const geo = computeGeometry(type);

describe("siffror på expansionens mål", () => {
  test("mål utan område står mitt på rutan, numrerade från 1 i given ordning", () => {
    const l = targetLabels([{ pos: { x: 2, y: 0 } }, { pos: { x: 0, y: 1 } }], types, board, cam, view);
    expect(l.map((x) => x.n)).toEqual([1, 2]);
    close(l[0]!.x, 800 + 200); close(l[0]!.y, 450);
    close(l[1]!.x, 800); close(l[1]!.y, 450 + 100);
  });

  test("mål med område står på områdets mittpunkt (ankaret), vridet med brickan", () => {
    const f = geo.features[0]!;
    const [ax, ay] = rotatePoint(f.anchor, start.rotation);
    const [l] = targetLabels([{ pos: { x: 0, y: 0 }, feature: f.feature }], types, board, cam, view);
    const c = worldToScreen(cam, view, { x: -0.5 + ax, y: -0.5 + ay });
    close(l!.x, c.x); close(l!.y, c.y);
    expect(featureAnchor(types, board, { x: 0, y: 0 }, f.feature)).toEqual({ x: -0.5 + ax, y: -0.5 + ay });
  });

  test("okänt område eller saknad bricka ger rutans mitt; siffrorna har samma storlek och synlighet som platssiffrorna", () => {
    expect(featureAnchor(types, board, { x: 0, y: 0 }, "finns-inte")).toEqual({ x: 0, y: 0 });
    expect(featureAnchor(types, board, { x: 4, y: 4 }, "city0")).toEqual({ x: 4, y: 4 });
    const l = targetLabels([{ pos: { x: 500, y: 0 } }, { pos: { x: 0, y: 0 } }], types, board, { ...cam, zoom: 200 }, view);
    expect(l.map((x) => x.visible)).toEqual([false, true]);
    expect(l[1]!.size).toBe(18);
  });
});

describe("pjäser på rutor och vid pjäser", () => {
  const figs: Figure[] = [
    { id: "gold1", kind: "gold-bar", owner: null, location: { at: "tile", pos: { x: 0, y: 0 } } },
    { id: "gold2", kind: "gold-bar", owner: null, location: { at: "tile", pos: { x: 0, y: 0 } } },
    { id: "m1", kind: "meeple", owner: "p1", location: { at: "feature", pos: { x: 0, y: 0 }, feature: geo.features[0]!.feature } },
    { id: "fairy", kind: "fairy", owner: "p1", location: { at: "figure", figure: "m1" } },
  ];
  const spots = figureSpots(figs, types, board);

  test("alla ritas, och flera på samma ruta hamnar inte på varandra", () => {
    expect(spots.map((s) => s.id).sort()).toEqual(["fairy", "gold1", "gold2", "m1"]);
    const keys = new Set(spots.map((s) => `${s.x.toFixed(3)},${s.y.toFixed(3)}`));
    expect(keys.size).toBe(4);
    const [g1, g2] = [spots.find((s) => s.id === "gold1")!, spots.find((s) => s.id === "gold2")!];
    expect(g2.x).toBeGreaterThan(g1.x);
    close(g1.x, 0); close(g1.y, 0);
  });

  test("en pjäs vid en pjäs (fen) står bredvid pjäsen den hör till", () => {
    const m = spots.find((s) => s.id === "m1")!;
    const fairy = spots.find((s) => s.id === "fairy")!;
    expect(Math.hypot(fairy.x - m.x, fairy.y - m.y)).toBeGreaterThan(0.1);
    expect(Math.hypot(fairy.x - m.x, fairy.y - m.y)).toBeLessThan(0.5);
  });

  test("en pjäs vid en pjäs som inte finns ritas inte", () => {
    expect(figureSpots([{ id: "f", kind: "fairy", owner: null, location: { at: "figure", figure: "saknas" } }], types, board)).toEqual([]);
  });
});
