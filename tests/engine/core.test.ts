import { describe, expect, test } from "bun:test";
import { allTileTypes, TILE_DATA } from "../../src/tiles/index";
import {
  distinctRotations, frontier, geometricPlacements, nextRandom, oppositeHalf, rotateEdge, rotateHalf,
  rotateTile, shuffle,
} from "../../src/engine/index";
import { realEngine, setupOf } from "./helpers";

const types = allTileTypes();

describe("geometri", () => {
  test("rotation av kanter och halvkanter", () => {
    expect(rotateEdge("N", 90)).toBe("E");
    expect(rotateEdge("W", 90)).toBe("N");
    expect(rotateHalf("NL", 90)).toBe("EL");
    expect(rotateHalf("WR", 180)).toBe("ER");
    expect(oppositeHalf("NL")).toBe("SR");
    expect(oppositeHalf("ER")).toBe("WL");
  });

  test("startbrickan RCr roterad 90 grader", () => {
    const rt = rotateTile(types.get("base/RCr")!, 90);
    expect(rt.edgeKind).toEqual({ N: "road", E: "city", S: "road", W: "field" });
    // Fältet norr om vägen (EL, WR) hamnar öster om vägen: ER och... EL->SL, WR->NR
    expect(rt.halfFeature.SL).toBe("field0");
    expect(rt.halfFeature.NR).toBe("field0");
  });

  test("symmetriska brickor har färre rotationer", () => {
    expect(distinctRotations(types.get("base/L")!)).toHaveLength(1);
    expect(distinctRotations(types.get("base/Rr")!)).toHaveLength(4);
    expect(distinctRotations(types.get("base/RFr")!)).toHaveLength(2);
  });

  test("alla brickors kanter är konsistenta", () => {
    for (const t of types.values())
      for (const r of [0, 90, 180, 270] as const) {
        const rt = rotateTile(t, r);
        for (const [e, id] of Object.entries(rt.edgeFeature)) expect(rt.features.some((f) => f.id === id), `${t.id} ${e}`).toBe(true);
      }
  });
});

describe("slump", () => {
  test("samma frö ger samma ordning", () => {
    const a = { rng: 42 };
    const b = { rng: 42 };
    expect(shuffle(a, [1, 2, 3, 4, 5, 6])).toEqual(shuffle(b, [1, 2, 3, 4, 5, 6]));
    expect(nextRandom({ rng: 1 })).toBeLessThan(1);
  });
});

describe("kartan", () => {
  test("lediga platser runt startbrickan, i fast ordning", () => {
    const board = { "0,0": { type: "base/RCr", pos: { x: 0, y: 0 }, rotation: 0 as const } };
    expect(frontier(board)).toEqual([{ x: 0, y: -1 }, { x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]);
  });

  test("kantmatchning mot startbrickan (stad norrut, väg öst-väst)", () => {
    const board = { "0,0": { type: "base/RCr", pos: { x: 0, y: 0 }, rotation: 0 as const } };
    // En stadsbricka med en stadskant: måste ligga ovanför med stadskanten söderut.
    const p = geometricPlacements(board, types, "base/C").filter((x) => x.pos.y === -1);
    expect(p.map((x) => x.rotation)).toEqual([180]);
    // Under startbrickan (fältkant) går bara rotationer med fält norrut.
    expect(geometricPlacements(board, types, "base/C").filter((x) => x.pos.y === 1).map((x) => x.rotation)).toEqual([90, 180, 270]);
  });
});

describe("nytt spel", () => {
  const eng = realEngine();

  test("grundspelet: 71 brickor i högen, startbricka på kartan, händer, pjäser", () => {
    const s = eng.newGame(setupOf(["base"], { n: 3 }));
    expect(s.board["0,0"]?.type).toBe("base/RCr");
    expect(s.drawPile.length + s.players.reduce((n, p) => n + p.hand.length, 0)).toBe(71);
    expect(s.players.every((p) => p.hand.length === 1)).toBe(true);
    expect(s.figures.filter((f) => f.kind === "meeple" && f.owner === "p1")).toHaveLength(7);
    expect(s.figures.some((f) => f.kind === "abbot")).toBe(false);
    expect(s.turn.phase).toBe("placeTile");
  });

  test("tillståndet är ren JSON och deterministiskt per frö", () => {
    const a = eng.newGame(setupOf(["base", "river", "abbot"], { seed: 7 }));
    const b = eng.newGame(setupOf(["base", "river", "abbot"], { seed: 7 }));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
    expect(JSON.parse(JSON.stringify(a))).toEqual(a);
    expect(JSON.stringify(eng.newGame(setupOf(["base"], { seed: 8 })))).not.toBe(JSON.stringify(eng.newGame(setupOf(["base"], { seed: 7 }))));
  });

  test("startspelaren slumpas", () => {
    const first = new Set<string>();
    for (let seed = 1; seed <= 40; seed++) first.add(eng.newGame(setupOf(["base"], { n: 4, seed })).turn.player);
    expect(first.size).toBeGreaterThan(1);
  });

  test("handstorlek 3: tre brickor var, valfas först", () => {
    const s = eng.newGame(setupOf(["base"], { handSize: 3 }));
    expect(s.players.every((p) => p.hand.length === 3)).toBe(true);
    expect(s.turn.phase).toBe("chooseTile");
    const steps = eng.legalSteps(s);
    expect(steps.every((x) => x.type === "chooseTile" || x.type === "exchangeTile")).toBe(true);
  });

  test("med floden: källan är startbricka, 20 flodbrickor först i högen, sjön sist av dem", () => {
    const s = eng.newGame(setupOf(["base", "river"], { n: 2 }));
    expect(s.board["0,0"]?.type).toBe("river/s");
    const all = [...s.players.flatMap((p) => p.hand), ...s.drawPile];
    // 71 vanliga utan startbrickan (som väntar tills sjön är lagd) + 2 x 10 flodbrickor + sjön.
    expect(all).toHaveLength(71 + 21);
    expect(s.players.map((p) => p.hand.length)).toEqual([1, 1]);
    expect(s.drawPile.indexOf("river/I.e")).toBe(20 - 2);
    expect(s.drawPile.slice(0, 18).every((t) => t.startsWith("river/") && t !== "river/I.e")).toBe(true);
    expect(s.drawPile.slice(19).some((t) => t.startsWith("river/"))).toBe(false);
    expect(all.filter((t) => t === "base/RCr")).toHaveLength(3);
  });

  test("brickdatan i högen stämmer med mängderna", () => {
    const total = (TILE_DATA.base!.set.tiles.reduce((n, t) => n + t.count, 0));
    expect(total).toBe(72);
  });
});
