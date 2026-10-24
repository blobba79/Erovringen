import { describe, expect, test } from "bun:test";
import { TILE_DATA } from "../../../src/tiles/index";
import { ferriesModule } from "../../../src/expansions/ferries/index";
import { realEngine, setupOf } from "../../engine/helpers";
import { CONFIRM, NOFIG, fig$, inSupply, place$, play, scenario, score, type Rot } from "../../engine/scenario";
import { playGame, type Strategy } from "../../players/random-player";
import type { GameState, Step } from "../../../src/shared/state";
import type { ExpansionId } from "../../../src/shared/tiles";

const eng = realEngine();
const EXP: ExpansionId[] = ["base", "ferries"];
const sc = (o: Parameters<typeof scenario>[1]) => scenario(eng, { expansions: EXP, ...o });
const LAKE = "ferries/RRR"; // vägar vid E, S och W
const LAKE4 = "ferries/RRRR";
const CAP = "base/LR"; // kloster med en väg åt S (rot 0), W (90), N (180), E (270)
const M = (p: string) => `${p}:meeple:0`;
const phase = (s: GameState) => s.turn.phase;

const putFerry = (s: GameState, id: string, x: number, y: number, key: string) => {
  s.figures.find((f) => f.id === id)!.location = { at: "feature", pos: { x, y }, feature: key };
};
const placeFerry = (choice: string): Step => ({ type: "expansion", expansion: "ferries", action: "place", data: { choice } });
const moveFerry = (figure: string, x: number, y: number, choice: string): Step => ({
  type: "expansion", expansion: "ferries", action: "move", data: { figure, pos: { x, y }, choice },
});
const SKIP: Step = { type: "expansion", expansion: "ferries", action: "skip", data: {} };
const ferryActions = (s: GameState) =>
  eng.legalSteps(s).flatMap((x) => (x.type === "expansion" ? [`${x.action}:${JSON.stringify((x.data as { choice?: string }).choice ?? "")}`] : []));
const ferryAt = (s: GameState, id: string) => s.figures.find((f) => f.id === id)!.location;

describe("modulen", () => {
  test("8 sjöbrickor och 8 neutrala färjor", () => {
    expect(ferriesModule.tileSets[0]!.tiles.reduce((a, t) => a + t.count, 0)).toBe(8);
    expect(TILE_DATA.ferries!.tiles.length).toBe(3);
    const s = eng.newGame(setupOf(EXP, { n: 3 }));
    const ferries = s.figures.filter((f) => f.kind === "ferry");
    expect(ferries.length).toBe(8);
    expect(ferries.every((f) => f.owner === null && f.location.at === "supply")).toBe(true);
  });
});

describe("lägga en färja", () => {
  const start = () => sc({ board: [["base/RFr", 0, 0, 0]], hands: [[LAKE], []] });

  test("efter pjässteget måste spelaren lägga en färja; bekräfta går inte förrän den ligger", () => {
    let r = play(eng, start(), place$(1, 0, 0));
    expect(phase(r.state)).toBe("placeFigure");
    r = play(eng, r.state, NOFIG);
    expect(phase(r.state)).toBe("ferries-place");
    expect(eng.legalSteps(r.state).some((x) => x.type === "confirm")).toBe(false);
    expect(ferryActions(r.state).filter((a) => a.startsWith("place")).sort()).toEqual(['place:"E-S"', 'place:"E-W"', 'place:"S-W"']);
    r = play(eng, r.state, placeFerry("S-W"));
    expect(phase(r.state)).toBe("confirm");
    expect(ferryAt(r.state, "ferry:0")).toEqual({ at: "feature", pos: { x: 1, y: 0 }, feature: "S-W" });
  });

  test("även med en följare på sjöbrickan; ångra tar tillbaka färjan", () => {
    let r = play(eng, start(), place$(1, 0, 0), fig$("meeple", 1, 0, "road2"));
    expect(phase(r.state)).toBe("ferries-place");
    const before = r.state;
    r = play(eng, r.state, placeFerry("E-W"));
    const u = eng.apply(r.state, "p1", { type: "undo" });
    expect(u.ok && JSON.stringify(u.state)).toBe(JSON.stringify(before));
  });

  test("fyra vägändar ger sex kantpar", () => {
    const s = sc({ board: [["base/RFr", 0, 0, 0]], hands: [[LAKE4], []] });
    const r = play(eng, s, place$(1, 0, 0), NOFIG);
    expect(ferryActions(r.state).filter((a) => a.startsWith("place")).length).toBe(6);
  });

  test("en vanlig bricka ger ingen färjefas", () => {
    const s = sc({ board: [["base/RFr", 0, 0, 0]], hands: [["base/RFr"], []] });
    const r = play(eng, s, place$(1, 0, 0), NOFIG);
    expect(phase(r.state)).toBe("confirm");
  });

  test("en lagd färja förbinder vägarna: en väg färdig med färjan räknas", () => {
    // kloster-väg (0,0) E, sjö (1,0), kloster-väg (2,0) W
    const s = sc({
      board: [[CAP, 0, 0, 270], [CAP, 2, 0, 90]],
      hands: [[LAKE], []],
      figures: [{ id: M("p2"), x: 0, y: 0, feature: "road0" }],
    });
    // utan färja ligger de två vägarna i skilda områden
    const r = play(eng, s, place$(1, 0, 0), NOFIG);
    expect(eng.analyze(r.state).areaAt({ x: 0, y: 0 }, "road0")!.tiles.length).toBe(2);
    const r2 = play(eng, r.state, placeFerry("E-W"));
    const a = eng.analyze(r2.state).areaAt({ x: 0, y: 0 }, "road0")!;
    expect(a.tiles.length).toBe(3);
    expect(a.complete).toBe(true);
  });
});

describe("poäng över färjor", () => {
  test("vägen via färjan räknas när den är färdig, med sjöbrickan som en bricka", () => {
    const s = sc({
      board: [[CAP, 0, 0, 270], [LAKE, 1, 0, 0]],
      hands: [[CAP], []],
      figures: [{ id: M("p2"), x: 0, y: 0, feature: "road0" }],
    });
    putFerry(s, "ferry:0", 1, 0, "E-W");
    // brickan bygger vidare på vägen med färjan: färjan får flyttas, men spelaren hoppar över
    const r = play(eng, s, place$(2, 0, 90), NOFIG, SKIP, CONFIRM);
    expect(score(r.state, "p2")).toBe(3);
    expect(inSupply(r.state, M("p2"))).toBe(true);
  });

  test("slutpoäng: en ofärdig väg räknas över färjan (1 per bricka)", () => {
    const s = sc({
      board: [[CAP, 0, 0, 270], [LAKE, 1, 0, 0], ["base/RFr", 2, 0, 0]],
      hands: [["base/L"], []],
      pile: [],
      figures: [{ id: M("p1"), x: 0, y: 0, feature: "road0" }],
    });
    putFerry(s, "ferry:0", 1, 0, "E-W");
    const r = play(eng, s, place$(0, -1, 0), NOFIG, CONFIRM);
    expect(r.state.finished).toBe(true);
    expect(score(r.state, "p1")).toBe(3);
  });

  test("slutpoäng utan färja: sjön slutar vägen", () => {
    const s = sc({
      board: [[CAP, 0, 0, 270], [LAKE, 1, 0, 0], ["base/RFr", 2, 0, 0]],
      hands: [["base/L"], []],
      pile: [],
      figures: [{ id: M("p1"), x: 0, y: 0, feature: "road0" }],
    });
    const r = play(eng, s, place$(0, -1, 0), NOFIG, CONFIRM);
    expect(score(r.state, "p1")).toBe(2);
  });
});

describe("flytta färjor", () => {
  // Sjö (1,0) med färjan E-S. Väg åt E: RFr (2,0). Kloster-väg åt S (1,1), och åt W (0,0).
  const setup = () => {
    const s = sc({
      board: [[CAP, 0, 0, 270], [LAKE, 1, 0, 0], [CAP, 1, 1, 180], ["base/RFr", 2, 0, 0]],
      hands: [[CAP], []],
      figures: [{ id: M("p2"), x: 1, y: 1, feature: "road0" }],
    });
    putFerry(s, "ferry:0", 1, 0, "E-S");
    return s;
  };

  test("en bricka som bygger vidare på en väg med färja ger val att flytta den", () => {
    const r = play(eng, setup(), place$(3, 0, 90), NOFIG);
    expect(phase(r.state)).toBe("ferries-move");
    expect(ferryActions(r.state).sort()).toEqual(['move:"E-W"', 'move:"S-W"', 'skip:""'].sort());
    expect(eng.legalSteps(r.state).some((x) => x.type === "confirm")).toBe(false);
  });

  test("hoppa över: vägen räknas med färjan där den låg", () => {
    // (3,0) kloster-väg, RFr, sjön E-S, kloster (1,1): fyra brickor
    const r = play(eng, setup(), place$(3, 0, 90), NOFIG, SKIP, CONFIRM);
    expect(score(r.state, "p2")).toBe(4);
  });

  test("flytta färjan: den väg som blir färdig av flytten räknas även om den inte rör den lagda brickan", () => {
    const r = play(eng, setup(), place$(3, 0, 90), NOFIG, moveFerry("ferry:0", 1, 0, "S-W"));
    expect(phase(r.state)).toBe("confirm"); // färjan flyttas högst en gång
    const done = play(eng, r.state, CONFIRM);
    // (0,0), sjön och (1,1) bildar en färdig väg med p2:s följare: 3 poäng. Vägen vid E har ingen följare.
    expect(score(done.state, "p2")).toBe(3);
    expect(inSupply(done.state, M("p2"))).toBe(true);
  });

  test("flytta färjan till E-W: S-vägen med p2:s följare blir en egen färdig väg på två brickor", () => {
    const r = play(eng, setup(), place$(3, 0, 90), NOFIG, moveFerry("ferry:0", 1, 0, "E-W"), CONFIRM);
    expect(score(r.state, "p2")).toBe(2);
    expect(inSupply(r.state, M("p2"))).toBe(true);
  });

  test("en färja flyttas inte till samma par, och bara till en annan kantpar på samma sjö", () => {
    const r = play(eng, setup(), place$(3, 0, 90), NOFIG);
    const bad = eng.apply(r.state, "p1", moveFerry("ferry:0", 1, 0, "E-S"));
    expect(bad.ok).toBe(false);
    const bad2 = eng.apply(r.state, "p1", moveFerry("ferry:0", 5, 5, "E-W"));
    expect(bad2.ok).toBe(false);
  });

  test("bara den första färjan på vägen får flyttas", () => {
    const s = sc({
      board: [[CAP, 0, 0, 270], [LAKE, 1, 0, 0], ["base/RFr", 2, 0, 0], [LAKE, 3, 0, 0]],
      hands: [[CAP], []],
    });
    putFerry(s, "ferry:0", 1, 0, "E-W");
    putFerry(s, "ferry:1", 3, 0, "E-W");
    // en bricka vid (4,0) bygger vidare på sjön (3,0): ferry:1 är först, ferry:0 bakom den
    const r = play(eng, s, place$(4, 0, 90), NOFIG);
    expect(phase(r.state)).toBe("ferries-move");
    const figs = eng.legalSteps(r.state).flatMap((x) => (x.type === "expansion" && x.action === "move" ? [(x.data as { figure: string }).figure] : []));
    expect(new Set(figs)).toEqual(new Set(["ferry:1"]));
  });

  test("flera riktningar: den första färjan åt varje håll får flyttas", () => {
    // RFr (1,0) mellan sjöarna (0,0) och (2,0)
    const s = sc({ board: [[LAKE, 0, 0, 0], [LAKE, 2, 0, 0]], hands: [["base/RFr"], []] });
    putFerry(s, "ferry:0", 0, 0, "E-W");
    putFerry(s, "ferry:1", 2, 0, "E-W");
    const r = play(eng, s, place$(1, 0, 0), NOFIG);
    expect(phase(r.state)).toBe("ferries-move");
    const figs = eng.legalSteps(r.state).flatMap((x) => (x.type === "expansion" && x.action === "move" ? [(x.data as { figure: string }).figure] : []));
    expect(new Set(figs)).toEqual(new Set(["ferry:0", "ferry:1"]));
    // flytta båda, i tur och ordning
    let r2 = play(eng, r.state, moveFerry("ferry:0", 0, 0, "S-W"));
    expect(phase(r2.state)).toBe("ferries-move");
    r2 = play(eng, r2.state, moveFerry("ferry:1", 2, 0, "S-W"));
    expect(phase(r2.state)).toBe("confirm");
  });

  test("en ny sjöbricka: först ny färja, sedan får andra färjor flyttas, men inte den nya", () => {
    const s = sc({ board: [[LAKE, 0, 0, 0]], hands: [[LAKE], []] });
    putFerry(s, "ferry:0", 0, 0, "E-W");
    let r = play(eng, s, place$(1, 0, 0), NOFIG);
    expect(phase(r.state)).toBe("ferries-place");
    r = play(eng, r.state, placeFerry("E-W"));
    expect(phase(r.state)).toBe("ferries-move");
    const figs = eng.legalSteps(r.state).flatMap((x) => (x.type === "expansion" && x.action === "move" ? [(x.data as { figure: string }).figure] : []));
    expect(new Set(figs)).toEqual(new Set(["ferry:0"]));
    r = play(eng, r.state, SKIP);
    expect(phase(r.state)).toBe("confirm");
  });
});

describe("slumpspel", () => {
  const run = (expansions: ExpansionId[], handSize: number, games: number, seed0: number) => {
    let ferries = 0;
    for (let i = 0; i < games; i++) {
      const strategy: Strategy = i % 2 ? "eager" : "random";
      try {
        const r = playGame(
          eng,
          setupOf(expansions, { n: 2 + (i % 4), seed: seed0 + i, handSize, variants: { "river.startTile": "shuffle" } }),
          { strategy },
        );
        expect(r.state.finished).toBe(true);
        ferries += r.state.figures.filter((f) => f.kind === "ferry" && f.location.at === "feature").length;
      } catch (e) {
        throw new Error(`parti ${i} (frö ${seed0 + i}): ${(e as Error).message}`);
      }
    }
    expect(ferries).toBeGreaterThan(0);
  };

  test("Ferries ensam, handstorlek 1", () => run(EXP, 1, 60, 100), 600_000);
  test("Ferries ensam, handstorlek 3", () => run(EXP, 3, 40, 300), 600_000);
  const ALL: ExpansionId[] = ["base", "river", "abbot", "inns-cathedrals", "traders-builders", "gold-mines", "mage-witch", "ferries"];
  test("med alla färdiga expansioner, handstorlek 1", () => run(ALL, 1, 50, 500), 600_000);
  test("med alla färdiga expansioner, handstorlek 3", () => run(ALL, 3, 40, 700), 600_000);
});
