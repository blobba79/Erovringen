import { describe, expect, test } from "bun:test";
import { TILE_DATA } from "../../../src/tiles/index";
import { goldMinesModule, goldRate } from "../../../src/expansions/gold-mines/index";
import { realEngine, setupOf } from "../../engine/helpers";
import { CONFIRM, NOFIG, fig$, place$, play, scenario, score, type Rot } from "../../engine/scenario";
import { playGame, type Strategy } from "../../players/random-player";
import type { GameState, Pos } from "../../../src/shared/state";
import type { ExpansionId } from "../../../src/shared/tiles";

const eng = realEngine();
const EXP: ExpansionId[] = ["base", "gold-mines"];
const sc = (o: Parameters<typeof scenario>[1]) => scenario(eng, { expansions: EXP, ...o });
const M = (p: string) => `${p}:meeple:0`;
const bar = (i: number) => `gold-bar:${i}`;
const GM = (t: string) => `gold-mines/${t}`;
const gold = (s: GameState, p: string) => s.players.find((x) => x.id === p)!.counters.gold ?? 0;
const barsOn = (s: GameState): string[] =>
  s.figures.filter((f) => f.kind === "gold-bar" && f.location.at === "tile")
    .map((f) => (f.location.at === "tile" ? `${f.location.pos.x},${f.location.pos.y}` : "")).sort();
const putBar = (s: GameState, i: number, x: number, y: number) => {
  s.figures.find((f) => f.id === bar(i))!.location = { at: "tile", pos: { x, y } };
};
const goldSteps = (s: GameState) => eng.legalSteps(s).filter((x) => x.type === "expansion");
const placeGold = (pos: Pos) => ({ type: "expansion" as const, expansion: "gold-mines" as ExpansionId, action: "placeGold", data: { pos } });

describe("modulen", () => {
  test("8 brickor med guldsymbol, 16 neutrala tackor, räknare från start, varianten", () => {
    expect(goldMinesModule.tileSets[0]!.tiles.reduce((a, t) => a + t.count, 0)).toBe(8);
    expect(TILE_DATA["gold-mines"]!.tiles.every((t) => t.symbols?.includes("gold"))).toBe(true);
    const s = eng.newGame(setupOf(EXP, { n: 3 }));
    const bars = s.figures.filter((f) => f.kind === "gold-bar");
    expect(bars.length).toBe(16);
    expect(bars.every((f) => f.owner === null && f.location.at === "supply")).toBe(true);
    expect(s.players.every((p) => p.counters.gold === 0)).toBe(true);
    expect(goldMinesModule.variants).toEqual([
      { id: "distribution", options: ["one-at-a-time", "per-feature"], default: "one-at-a-time" },
    ]);
  });
});

describe("utläggning av tackor", () => {
  test("en enda granne: en tacka på brickan och en på grannen, direkt", () => {
    const s = sc({ board: [["base/L", 0, 0, 0]], hands: [[GM("LRr")], []] });
    const r = play(eng, s, place$(1, 0, 0));
    expect(barsOn(r.state)).toEqual(["0,0", "1,0"]);
    expect(r.state.turn.phase).toBe("placeFigure");
  });

  test("flera grannar (diagonalt räknas): spelaren väljer i fasen gold, pjäs får inte ställas före", () => {
    const s = sc({ board: [["base/L", 0, 0, 0], ["base/L", 0, 1, 0]], hands: [[GM("LRr")], []] });
    const a = play(eng, s, place$(1, 0, 0)).state;
    expect(a.turn.phase).toBe("gold");
    expect(barsOn(a)).toEqual(["1,0"]);
    const steps = goldSteps(a);
    expect(steps.map((x) => (x as { data: { pos: Pos } }).data.pos).sort((p, q) => p.y - q.y)).toEqual([{ x: 0, y: 0 }, { x: 0, y: 1 }]);
    expect(eng.legalSteps(a).some((x) => x.type === "placeFigure" || x.type === "noFigure" || x.type === "confirm")).toBe(false);
    expect(eng.apply(a, "p1", fig$("meeple", 1, 0, "cloister")).ok).toBe(false);
    expect(eng.apply(a, "p1", placeGold({ x: 5, y: 5 })).ok).toBe(false);
    expect(eng.apply(a, "p1", placeGold({ x: 1, y: 0 })).ok).toBe(false); // inte på brickan själv igen
    const b = play(eng, a, placeGold({ x: 0, y: 1 })).state;
    expect(barsOn(b)).toEqual(["0,1", "1,0"]);
    expect(b.turn.phase).toBe("placeFigure");
    // Ångra går tillbaka till valet.
    const u = play(eng, b, { type: "undo" }).state;
    expect(u.turn.phase).toBe("gold");
    expect(barsOn(u)).toEqual(["1,0"]);
    // Pjäsen får ställas efteråt.
    expect(eng.legalSteps(b).some((x) => x.type === "placeFigure")).toBe(true);
  });

  test("en bricka utan guldsymbol lägger ingen tacka", () => {
    const s = sc({ board: [["base/L", 0, 0, 0]], hands: [["base/L"], []] });
    expect(barsOn(play(eng, s, place$(1, 0, 0)).state)).toEqual([]);
  });

  test("tackorna tar slut: den sista läggs på brickan, sedan inga", () => {
    const s = sc({ board: [["base/L", 0, 0, 0], ["base/L", 0, 1, 0]], hands: [[GM("LRr")], []] });
    for (let i = 0; i < 15; i++) putBar(s, i, 3, 3);
    const a = play(eng, s, place$(1, 0, 0)).state;
    expect(a.turn.phase).toBe("placeFigure");
    expect(barsOn(a).filter((k) => k === "1,0").length).toBe(1);
    const t = sc({ board: [["base/L", 0, 0, 0]], hands: [[GM("LRr")], []] });
    for (let i = 0; i < 16; i++) putBar(t, i, 3, 3);
    expect(barsOn(play(eng, t, place$(1, 0, 0)).state).filter((k) => k !== "3,3")).toEqual([]);
  });
});

// Väg nord-syd: kloster med väg söderut (LR), rak väg (RFr vriden), kloster med väg norrut (LR vriden 180).
const roadBoard: [string, number, number, Rot][] = [["base/LR", 0, 0, 0], ["base/RFr", 0, 1, 90]];
const roadScenario = (variants: Record<string, string>, bars: [number, number][], figs: { id: string; y: number }[]) => {
  const s = sc({
    board: roadBoard, hands: [["base/LR"], []], variants,
    figures: figs.map((f) => ({ id: f.id, x: 0, y: f.y, feature: "road0" })),
  });
  bars.forEach(([x, y], i) => putBar(s, i, x, y));
  return s;
};
const finishRoad = (s: GameState) => play(eng, s, place$(0, 2, 180), NOFIG, CONFIRM).state;

describe("utdelning", () => {
  test("ensam majoritet får alla tackor på vägens brickor; tackor utanför ligger kvar", () => {
    const s = roadScenario({}, [[0, 0], [0, 1], [0, 1], [7, 7]], [{ id: M("p1"), y: 0 }]);
    const r = finishRoad(s);
    expect(gold(r, "p1")).toBe(3);
    expect(gold(r, "p2")).toBe(0);
    expect(barsOn(r)).toEqual(["7,7"]);
    expect(score(r, "p1")).toBe(3);
  });

  test("en i taget: lika majoritet delar medsols från den aktiva (ROD, BLÅ, ROD)", () => {
    const s = roadScenario({}, [[0, 0], [0, 1], [0, 1]], [{ id: M("p1"), y: 0 }, { id: M("p2"), y: 1 }]);
    const r = finishRoad(s);
    expect([gold(r, "p1"), gold(r, "p2")]).toEqual([2, 1]);
    expect(barsOn(r)).toEqual([]);
  });

  test("en i taget: är den aktiva inte berättigad börjar nästa berättigade", () => {
    const s = roadScenario({}, [[0, 0], [0, 1]], [{ id: M("p2"), y: 0 }]);
    const r = finishRoad(s);
    expect([gold(r, "p1"), gold(r, "p2")]).toEqual([0, 2]);
  });

  test("per område: varje berättigad spelare tar en tacka", () => {
    const v = { "gold-mines.distribution": "per-feature" };
    const s = roadScenario(v, [[0, 0], [0, 1], [0, 1]], [{ id: M("p1"), y: 0 }, { id: M("p2"), y: 1 }]);
    const r = finishRoad(s);
    expect([gold(r, "p1"), gold(r, "p2")]).toEqual([1, 1]);
    expect(barsOn(r)).toEqual(["0,1"]); // den tredje ligger kvar
    const single = finishRoad(roadScenario(v, [[0, 0], [0, 1], [0, 1]], [{ id: M("p1"), y: 0 }]));
    expect(gold(single, "p1")).toBe(1);
  });

  test("per område: finns bara en tacka får den aktiva den", () => {
    const v = { "gold-mines.distribution": "per-feature" };
    const r = finishRoad(roadScenario(v, [[0, 1]], [{ id: M("p1"), y: 0 }, { id: M("p2"), y: 1 }]));
    expect([gold(r, "p1"), gold(r, "p2")]).toEqual([1, 0]);
  });

  test("ingen majoritet (ingen följare) ger ingen guld; ofärdigt område ger ingen guld", () => {
    const none = finishRoad(roadScenario({}, [[0, 0]], []));
    expect(gold(none, "p1") + gold(none, "p2")).toBe(0);
    expect(barsOn(none)).toEqual(["0,0"]);
    const s = roadScenario({}, [[0, 0]], [{ id: M("p1"), y: 0 }]);
    s.players[0]!.hand = ["base/L"];
    const open = play(eng, s, place$(1, 1, 0), NOFIG, CONFIRM).state;
    expect(gold(open, "p1")).toBe(0);
  });

  test("kloster: brickan och de åtta grannarna, inte rutor längre bort; bönder får inget", () => {
    const board: [string, number, number, Rot][] = [];
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) if (x || y) board.push(["base/L", x, y, 0]);
    board.push(["base/L", 0, 0, 0], ["base/L", 2, 0, 0]);
    const s = sc({ board: board.filter(([, x, y]) => !(x === 1 && y === 1)), hands: [["base/L"], []],
      figures: [{ id: M("p1"), x: 0, y: 0, feature: "cloister" }, { id: M("p2"), x: 2, y: 0, feature: "field0" }] });
    putBar(s, 0, 0, 0);
    putBar(s, 1, -1, -1);
    putBar(s, 2, 2, 0);
    const r = play(eng, s, place$(1, 1, 0), NOFIG, CONFIRM).state;
    expect(score(r, "p1")).toBe(9);
    expect(gold(r, "p1")).toBe(2);
    expect(gold(r, "p2")).toBe(0);
    expect(barsOn(r)).toEqual(["2,0"]);
  });

  test("abbotens 'ta tillbaka' räknar poäng men delar inte ut guld", () => {
    const s = scenario(eng, {
      expansions: ["base", "abbot", "gold-mines"], board: [["base/CG", 0, 0, 0]], hands: [["base/L"], []],
      figures: [{ id: "p1:abbot:0", x: 0, y: 0, feature: "garden" }],
    });
    putBar(s, 0, 0, 0);
    const r = play(eng, s, place$(1, 0, 0), { type: "returnFigure", figure: "p1:abbot:0" }, CONFIRM).state;
    expect(gold(r, "p1")).toBe(0);
    expect(barsOn(r)).toEqual(["0,0"]);
  });

  test("tackor som delats ut läggs inte ut igen", () => {
    const s = roadScenario({}, [[0, 0]], [{ id: M("p1"), y: 0 }]);
    const r = finishRoad(s);
    expect(gold(r, "p1")).toBe(1);
    const given = r.figures.find((f) => f.id === bar(0))!;
    expect(given.location.at).toBe("supply");
    expect((r.ext["gold-mines"] as { taken: string[] }).taken).toEqual([bar(0)]);
  });
});

describe("slutpoäng", () => {
  const fin = (g1: number, g2: number) => {
    const s = sc({ board: [["base/C", 0, 0, 0]], hands: [["base/L"], []], pile: [] });
    s.players[0]!.counters.gold = g1;
    s.players[1]!.counters.gold = g2;
    putBar(s, 0, 0, 0);
    const r = play(eng, s, place$(0, 1, 0), NOFIG, CONFIRM).state;
    expect(r.finished).toBe(true);
    return [score(r, "p1"), score(r, "p2")];
  };
  const cases: [number, number][] = [
    [0, 0], [1, 1], [2, 2], [3, 3], [4, 8], [5, 10], [6, 12], [7, 21], [8, 24], [9, 27], [10, 40], [12, 48], [16, 64],
  ];
  for (const [n, pts] of cases)
    test(`${n} tackor ger ${pts} poäng`, () => {
      expect(goldRate(n) * n).toBe(pts);
      expect(fin(n, 0)).toEqual([pts, 0]);
    });
  test("varje spelare räknas för sig; tackor kvar på brickor ger inget", () => {
    expect(fin(7, 3)).toEqual([21, 3]);
  });
});

describe("slumpspel", () => {
  const check = (s: GameState) => {
    const bars = s.figures.filter((f) => f.kind === "gold-bar");
    const held = s.players.reduce((n, p) => n + (p.counters.gold ?? 0), 0);
    const taken = (s.ext["gold-mines"] as { taken: string[] }).taken;
    expect(held).toBe(taken.length);
    expect(new Set(taken).size).toBe(taken.length);
    expect(bars.length).toBe(16);
    expect(bars.filter((f) => f.location.at === "tile").length + held).toBeLessThanOrEqual(16);
    return held;
  };
  const run = (expansions: ExpansionExpansions, hand: number, variant: string, games: number, base: number) => {
    let totalGold = 0;
    for (let i = 0; i < games; i++) {
      const seed = base + i;
      const setup = setupOf(expansions, {
        n: 2 + (i % 4), seed, handSize: hand, variants: { "gold-mines.distribution": variant, "river.startTile": "shuffle" },
      });
      const strategy: Strategy = i % 2 ? "eager" : "random";
      try {
        const r = playGame(eng, setup, { strategy });
        expect(r.state.finished).toBe(true);
        totalGold += check(r.state);
      } catch (e) {
        throw new Error(`parti ${i} (frö ${seed}): ${(e as Error).message}`);
      }
    }
    return totalGold;
  };
  type ExpansionExpansions = ExpansionId[];
  const ALL: ExpansionId[] = ["base", "river", "abbot", "inns-cathedrals", "traders-builders", "gold-mines"];

  for (const hand of [1, 3])
    for (const variant of ["one-at-a-time", "per-feature"]) {
      test(`Gold Mines ensam, handstorlek ${hand}, ${variant}`, () => {
        // Brickorna är få bland många, så tackor delas ut i en del av partierna.
        expect(run(EXP, hand, variant, 30, 20_000 + hand * 100)).toBeGreaterThanOrEqual(0);
      }, 600_000);
      test(`alla färdiga expansioner, handstorlek ${hand}, ${variant}`, () => {
        expect(run(ALL, hand, variant, 20, 30_000 + hand * 100)).toBeGreaterThanOrEqual(0);
      }, 600_000);
    }

  test("tackor delas ut i vissa partier", () => {
    expect(run(EXP, 1, "one-at-a-time", 80, 40_000)).toBeGreaterThan(0);
  }, 600_000);
});
