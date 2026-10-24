import { describe, expect, test } from "bun:test";
import { allTileTypes, TILE_DATA } from "../../../src/tiles/index";
import { baseModule, createEngine } from "../../../src/engine/index";
import { riverModule } from "../../../src/expansions/river/index";
import { abbotModule } from "../../../src/expansions/abbot/index";
import { innsCathedralsModule } from "../../../src/expansions/inns-cathedrals/index";
import { setupOf } from "../../engine/helpers";
import { CONFIRM, NOFIG, fig$, place$, play, reasons, scenario, score, type Rot } from "../../engine/scenario";
import { playGame, type Strategy } from "../../players/random-player";

const eng = createEngine([baseModule, riverModule, abbotModule, innsCathedralsModule], allTileTypes().values());
const EXP = ["base", "inns-cathedrals"] as const;
const sc = (o: Parameters<typeof scenario>[1]) => scenario(eng, { expansions: [...EXP], ...o });
const M = (p: string, n = 0) => `${p}:meeple:${n}`;
const L = (p: string) => `${p}:large-meeple:0`;
const IC = (t: string) => `inns-cathedrals/${t}`;

describe("modulen", () => {
  test("brickuppsättningen har 18 brickor och en stor pjäs per spelare", () => {
    expect(innsCathedralsModule.tileSets[0]!.tiles.reduce((a, t) => a + t.count, 0)).toBe(18);
    expect(TILE_DATA["inns-cathedrals"]!.tiles.length).toBeGreaterThan(0);
    const s = eng.newGame(setupOf([...EXP], { n: 3 }));
    expect(s.figures.filter((f) => f.kind === "large-meeple").map((f) => f.owner).sort()).toEqual(["p1", "p2", "p3"]);
  });
});

describe("värdshus", () => {
  // LR (0,0) väg mot söder, Rr.i (0,1) väg N+W, LR (-1,1) väg mot öster.
  const board: [string, number, number, Rot][] = [["base/LR", 0, 0, 0], ["base/LR", -1, 1, 270]];
  test("färdig väg med värdshus: 2 per bricka", () => {
    const s = sc({ board, hands: [[IC("Rr.i")], []] });
    const r = play(eng, s, place$(0, 1, 90), fig$("meeple", 0, 1, "road0"), CONFIRM);
    expect(reasons(r.events)).toEqual(["p1:road:6"]);
    expect(score(r.state, "p1")).toBe(6);
  });
  test("ofärdig väg med värdshus: 0 vid slutet", () => {
    const s = sc({ board: [board[0]!], hands: [[IC("Rr.i")], []], pile: [], figures: [{ id: M("p2"), x: 0, y: 0, feature: "road0" }] });
    const r = play(eng, s, place$(0, 1, 90), NOFIG, CONFIRM);
    expect(r.state.finished).toBe(true);
    expect(reasons(r.events).filter((e) => e.includes("road"))).toEqual([]);
    expect(score(r.state, "p2")).toBe(0);
  });
});

describe("katedral", () => {
  const ring: [string, number, number, Rot][] = [
    [IC("Cccc.c"), 0, 0, 0], ["base/C", 0, -1, 180], ["base/C", 1, 0, 270], ["base/C", -1, 0, 90],
  ];
  test("färdig stad med katedral: 3 per bricka", () => {
    const s = sc({ board: ring, hands: [["base/C"], []] });
    const r = play(eng, s, place$(0, 1, 0), fig$("meeple", 0, 1, "city0"), CONFIRM);
    expect(reasons(r.events)).toEqual(["p1:city:15"]);
  });
  test("ofärdig stad med katedral: 0 vid slutet", () => {
    const s = sc({
      board: ring.slice(0, 2), hands: [["base/C"], []], pile: [],
      figures: [{ id: M("p2"), x: 0, y: 0, feature: "city0" }],
    });
    const r = play(eng, s, place$(1, 0, 270), NOFIG, CONFIRM);
    expect(r.state.finished).toBe(true);
    expect(score(r.state, "p2")).toBe(0);
  });
});

describe("stora pjäsen", () => {
  // Stad med fyra armar runt Cccc+ (5 brickor, 1 sköld = 12 poäng); sista brickan läggs av p1.
  const board: [string, number, number, Rot][] = [
    ["base/C", 0, 0, 0], ["base/Cccc+", 0, -1, 0], ["base/C", 0, -2, 180], ["base/C", -1, -1, 90],
  ];
  const close = (figs: { id: string; x: number; y: number; feature: string }[]) =>
    play(eng, sc({ board, hands: [["base/C"], []], figures: figs }), place$(1, -1, 270), NOFIG, CONFIRM);
  test("räknas som två: lika mot två vanliga pjäser", () => {
    const r = close([
      { id: M("p2"), x: 0, y: 0, feature: "city0" }, { id: M("p2", 1), x: 0, y: -2, feature: "city0" },
      { id: L("p1"), x: -1, y: -1, feature: "city0" },
    ]);
    expect(reasons(r.events).sort()).toEqual(["p1:city:12", "p2:city:12"]);
  });
  test("vinner mot en vanlig pjäs och dubblar inte poängen", () => {
    const r = close([{ id: M("p2"), x: 0, y: 0, feature: "city0" }, { id: L("p1"), x: -1, y: -1, feature: "city0" }]);
    expect(reasons(r.events)).toEqual(["p1:city:12"]);
    expect(r.state.figures.find((f) => f.id === L("p1"))!.location.at).toBe("supply");
  });
  test("kan väljas som pjäs vid placering", () => {
    const s = sc({ board: [["base/Cc+", 0, 0, 0]], hands: [["base/L"], []] });
    const r = play(eng, s, place$(0, 1, 0));
    const kinds = new Set(eng.legalSteps(r.state).flatMap((x) => (x.type === "placeFigure" ? [x.kind] : [])));
    expect(kinds.has("large-meeple")).toBe(true);
  });
});

describe("slumpspel", () => {
  const GAMES = Number(process.env.IC_GAMES ?? 60);
  for (const exps of [["base", "inns-cathedrals"], ["base", "river", "abbot", "inns-cathedrals"]] as const) {
    test(`${GAMES} partier med ${exps.join("+")}, handstorlek 1 och 3`, () => {
      for (let i = 0; i < GAMES; i++) {
        const setup = setupOf([...exps], { n: 2 + (i % 5), seed: 9000 + i, handSize: i % 2 ? 3 : 1 });
        const strategy: Strategy = i % 3 ? "eager" : "random";
        try {
          const r = playGame(eng, setup, { strategy });
          expect(r.state.finished).toBe(true);
        } catch (e) {
          throw new Error(`parti ${i} (${exps.join("+")}): ${(e as Error).message}`);
        }
      }
    }, 600_000);
  }
});
