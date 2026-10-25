// Färjorna och turen: en färja flyttas högst en gång per tur, även över byggmästarens dubbeltur (s. 148),
// och en färja som slår ihop magikerns och häxans vägar ger ett val i Mage & Witch (s. 154-155).

import { describe, expect, test } from "bun:test";
import type { GameState, Step } from "../../../src/shared/state";
import type { ExpansionId } from "../../../src/shared/tiles";
import { realEngine } from "../../engine/helpers";
import { CONFIRM, NOFIG, place$, play, scenario, type Rot } from "../../engine/scenario";

const eng = realEngine();
const LAKE = "ferries/RRR"; // vägar vid E, S och W
const CAP = "base/LR"; // kloster med en väg åt S (rot 0), W (90), N (180), E (270)
const phase = (s: GameState) => s.turn.phase;

const putFerry = (s: GameState, id: string, x: number, y: number, key: string) => {
  s.figures.find((f) => f.id === id)!.location = { at: "feature", pos: { x, y }, feature: key };
};
const placeFerry = (choice: string): Step => ({ type: "expansion", expansion: "ferries", action: "place", data: { choice } });
const moveFerry = (figure: string, x: number, y: number, choice: string): Step => ({
  type: "expansion", expansion: "ferries", action: "move", data: { figure, pos: { x, y }, choice },
});
const TAKE: Step = { type: "expansion", expansion: "traders-builders", action: "extraTurn", data: { choice: "take" } };
const moves = (s: GameState) =>
  eng.legalSteps(s).flatMap((x) => (x.type === "expansion" && x.action === "move" ? [(x.data as { figure: string }).figure] : []));

describe("en färja flyttas högst en gång per tur, även i byggmästarens dubbeltur", () => {
  const EXP: ExpansionId[] = ["base", "ferries", "traders-builders"];
  // Sjön (1,0) med färjan E-S: vägen (1,1) - sjön - (2,0) - nya brickor åt öster. p1 har följare och byggmästare på (1,1).
  const start = () => {
    const s = scenario(eng, {
      expansions: EXP, n: 2,
      board: [[CAP, 0, 0, 270], [LAKE, 1, 0, 0], [CAP, 1, 1, 180], ["base/RFr", 2, 0, 0]],
      hands: [["base/RFr"], ["base/RFr"]], pile: ["base/RFr", "base/RFr", "base/L", "base/L"],
      figures: [
        { id: "p1:meeple:0", x: 1, y: 1, feature: "road0" }, { id: "p1:builder:0", x: 1, y: 1, feature: "road0" },
      ],
    });
    putFerry(s, "ferry:0", 1, 0, "E-S");
    return s;
  };

  test("färjan som flyttats i första delen får inte flyttas i andra delen", () => {
    // Del 1: (3,0) bygger vidare på vägen med färjan; färjan flyttas till E-W (den vidgar fortfarande österut).
    let st = play(eng, start(), place$(3, 0, 0), NOFIG).state;
    expect(phase(st)).toBe("ferries-move");
    st = play(eng, st, moveFerry("ferry:0", 1, 0, "E-W"), CONFIRM).state;
    expect(phase(st)).toBe("tb-extra");
    st = play(eng, st, TAKE, CONFIRM).state;
    expect(st.turn.player).toBe("p1");
    // Del 2: (4,0) bygger vidare på samma väg, och färjan E-W är den första på den. Ändå ingen flytt.
    st = play(eng, st, place$(4, 0, 0), NOFIG).state;
    expect(phase(st)).toBe("confirm");
    expect(moves(st)).toEqual([]);
    expect(st.ext.ferries).toMatchObject({ moved: ["ferry:0"] });
  });

  test("kontroll: utan flytt i första delen får färjan flyttas i andra delen", () => {
    let st = play(eng, start(), place$(3, 0, 0), NOFIG).state;
    st = play(eng, st, { type: "expansion", expansion: "ferries", action: "skip", data: {} }, CONFIRM, TAKE, CONFIRM).state;
    expect(st.turn.player).toBe("p1");
    st = play(eng, st, place$(4, 0, 0), NOFIG).state;
    expect(phase(st)).toBe("ferries-move");
    expect(moves(st)).toEqual(["ferry:0", "ferry:0"]);
  });

  test("nästa spelares tur: färjan får flyttas igen", () => {
    let st = play(eng, start(), place$(3, 0, 0), NOFIG, moveFerry("ferry:0", 1, 0, "E-W"), CONFIRM, TAKE, CONFIRM).state;
    st = play(eng, st, place$(4, 0, 0), NOFIG, CONFIRM).state;
    expect(st.turn.player).toBe("p2");
    st = play(eng, st, place$(5, 0, 0), NOFIG).state;
    expect(phase(st)).toBe("ferries-move");
    expect(new Set(moves(st))).toEqual(new Set(["ferry:0"]));
    expect(st.ext.ferries).toMatchObject({ moved: [] });
  });

  test("första delen utan dubbeltur: färjan flyttas en gång som förut", () => {
    let st = play(eng, start(), place$(3, 0, 0), NOFIG, moveFerry("ferry:0", 1, 0, "E-W")).state;
    expect(phase(st)).toBe("confirm");
    expect(moves(st)).toEqual([]);
  });
});

describe("färjor och Mage & Witch", () => {
  const EXP: ExpansionId[] = ["base", "ferries", "mage-witch"];
  const mwSteps = (s: GameState) =>
    eng.legalSteps(s).flatMap((x) => (x.type === "expansion" && x.expansion === "mage-witch" ? [x] : []));

  test("en lagd färja som slår ihop magikerns och häxans vägar ger ett val före bekräftelsen", () => {
    // Sjön läggs vid (1,0): vägen västerut (0,0) har magikern, vägen söderut (1,1) har häxan.
    const board: [string, number, number, Rot][] = [[CAP, 0, 0, 270], [CAP, 1, 1, 180]];
    const s = scenario(eng, {
      expansions: EXP, board, hands: [[LAKE], []],
      figures: [{ id: "mage:0", x: 0, y: 0, feature: "road0" }, { id: "witch:0", x: 1, y: 1, feature: "road0" }],
    });
    let st = play(eng, s, place$(1, 0, 0), NOFIG).state;
    expect(phase(st)).toBe("ferries-place");
    // Färjan som binder ihop väster och söder slår ihop dem.
    st = play(eng, st, placeFerry("S-W")).state;
    expect(phase(st)).toBe("mage-witch");
    expect(eng.legalSteps(st).some((x) => x.type === "confirm")).toBe(false);
    expect(mwSteps(st).length).toBeGreaterThan(0);
    // Efter flytten fortsätter turen till bekräftelsen, och de står inte längre på samma väg.
    st = play(eng, st, mwSteps(st)[0] as Step).state;
    expect(phase(st)).toBe("confirm");
    const an = eng.analyze(st);
    const at = (id: string) => {
      const f = st.figures.find((x) => x.id === id)!;
      return f.location.at === "feature" ? an.areaAt(f.location.pos, f.location.feature)?.id : undefined;
    };
    expect(at("mage:0") === at("witch:0") && at("mage:0") !== undefined).toBe(false);
    expect(eng.legalSteps(st).some((x) => x.type === "confirm")).toBe(true);
  });

  test("även ångra fungerar: tillbaka till färjevalet", () => {
    const board: [string, number, number, Rot][] = [[CAP, 0, 0, 270], [CAP, 1, 1, 180]];
    const s = scenario(eng, {
      expansions: EXP, board, hands: [[LAKE], []],
      figures: [{ id: "mage:0", x: 0, y: 0, feature: "road0" }, { id: "witch:0", x: 1, y: 1, feature: "road0" }],
    });
    const before = play(eng, s, place$(1, 0, 0), NOFIG).state;
    const merged = play(eng, before, placeFerry("S-W")).state;
    const back = play(eng, merged, { type: "undo" }).state;
    expect(JSON.stringify(back)).toBe(JSON.stringify(before));
    // En färja som inte slår ihop dem ger inget val.
    const apart = play(eng, before, placeFerry("E-S")).state;
    expect(phase(apart)).toBe("confirm");
  });

  test("en flyttad färja som slår ihop dem ger också ett val, efter att färjorna flyttats klart", () => {
    // Färjan E-S binder (1,1) (häxan) till vägen österut; magikern står på (0,0), som sjöns västra väg är skild från.
    const s = scenario(eng, {
      expansions: EXP,
      board: [[CAP, 0, 0, 270], [LAKE, 1, 0, 0], [CAP, 1, 1, 180], ["base/RFr", 2, 0, 0]],
      hands: [[CAP], []],
      figures: [{ id: "mage:0", x: 0, y: 0, feature: "road0" }, { id: "witch:0", x: 1, y: 1, feature: "road0" }],
    });
    putFerry(s, "ferry:0", 1, 0, "E-S");
    let st = play(eng, s, place$(3, 0, 90), NOFIG).state;
    expect(phase(st)).toBe("ferries-move");
    st = play(eng, st, moveFerry("ferry:0", 1, 0, "S-W")).state; // slår ihop väster (magikern) och söder (häxan)
    expect(phase(st)).toBe("mage-witch");
    expect(mwSteps(st).length).toBeGreaterThan(0);
    st = play(eng, st, mwSteps(st)[0] as Step).state;
    expect(phase(st)).toBe("confirm");
  });

  test("utan Mage & Witch eller när de inte möts ändras inget", () => {
    const s = scenario(eng, {
      expansions: EXP, board: [[CAP, 0, 0, 270], [CAP, 1, 1, 180]], hands: [[LAKE], []],
      figures: [{ id: "mage:0", x: 0, y: 0, feature: "road0" }],
    });
    const st = play(eng, s, place$(1, 0, 0), NOFIG, placeFerry("S-W")).state;
    expect(phase(st)).toBe("confirm"); // häxan ligger i förrådet: de möts inte
  });
});
