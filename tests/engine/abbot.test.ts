import { describe, expect, test } from "bun:test";
import { realEngine } from "./helpers";
import { CONFIRM, NOFIG, fig$, inSupply, place$, play, reasons, scenario, score, type Rot } from "./scenario";

const eng = realEngine();
const ring: [string, number, number, Rot][] = [
  ["base/L", -1, -1, 0], ["base/L", 0, -1, 0], ["base/L", 1, -1, 0],
  ["base/L", -1, 0, 0], ["base/L", 1, 0, 0], ["base/L", -1, 1, 0], ["base/L", 0, 1, 0],
];

describe("abboten", () => {
  test("alla spelare får en abbot; utan modulen finns ingen", () => {
    const s = eng.newGame({ ...scenario(eng, { board: [] }).setup, expansions: ["base", "abbot"] });
    expect(s.figures.filter((f) => f.kind === "abbot").map((f) => f.owner)).toEqual(["p1", "p2"]);
    const noAbbot = scenario(eng, { board: [["base/L", 0, 0, 0]], expansions: ["base"], hands: [["base/L"], []] });
    expect(noAbbot.figures.some((f) => f.kind === "abbot")).toBe(false);
  });

  test("abboten kan stå på kloster och trädgård men inte på väg eller fält", () => {
    const s = scenario(eng, { board: [["base/RCr", 0, 0, 0]], hands: [["base/LR"], []] });
    const placed = play(eng, s, place$(1, 0, 90)).state; // LR vänd så att vägen går västerut mot startbrickans väg
    expect(placed.turn.phase).toBe("placeFigure");
    const figs = eng.legalSteps(placed).filter((x) => x.type === "placeFigure");
    const kinds = figs.map((x) => (x.type === "placeFigure" ? `${x.kind}:${x.feature}` : ""));
    expect(kinds).toContain("abbot:cloister");
    expect(kinds).toContain("meeple:cloister");
    expect(kinds).toContain("meeple:road0");
    expect(kinds).not.toContain("abbot:road0");
    expect(kinds).not.toContain("abbot:field0");
  });

  test("trädgård: bara abboten får stå där", () => {
    const s = scenario(eng, { board: [["base/RCr", 0, 0, 0]], hands: [["base/CG"], []] });
    const placed = play(eng, s, place$(0, -1, 180)).state;
    const kinds = eng.legalSteps(placed).filter((x) => x.type === "placeFigure").map((x) => (x.type === "placeFigure" ? `${x.kind}:${x.feature}` : ""));
    expect(kinds).toContain("abbot:garden");
    expect(kinds).not.toContain("meeple:garden");
  });

  test("abboten kan inte läggas på ett kloster som inte är på brickan som just lagts", () => {
    const s = scenario(eng, { board: [["base/L", 0, 0, 0]], hands: [["base/L"], []] });
    const placed = play(eng, s, place$(1, 0, 0)).state;
    expect(eng.apply(placed, "p1", fig$("abbot", 0, 0, "cloister"))).toMatchObject({ ok: false });
  });

  test("ta tillbaka abboten i stället för att placera en pjäs: poäng som kloster", () => {
    const s = scenario(eng, {
      board: [["base/L", 0, 0, 0], ["base/L", 1, 0, 0], ["base/L", 0, 1, 0]], hands: [["base/L"], []],
      figures: [{ id: "p1:abbot:0", x: 0, y: 0, feature: "cloister" }],
    });
    const placed = play(eng, s, place$(1, 1, 0)).state;
    const steps = eng.legalSteps(placed);
    expect(steps).toContainEqual({ type: "returnFigure", figure: "p1:abbot:0" });
    const r = play(eng, placed, { type: "returnFigure", figure: "p1:abbot:0" });
    expect(score(r.state, "p1")).toBe(4); // sig själv + (1,0), (0,1), (1,1)
    expect(inSupply(r.state, "p1:abbot:0")).toBe(true);
    expect(r.state.turn.phase).toBe("confirm");
    expect(eng.legalSteps(r.state).map((x) => x.type)).toEqual(["confirm", "undo"]);
    const done = play(eng, r.state, CONFIRM);
    expect(reasons(done.events)).toContain("p1:return:4");
    // Ångra tar tillbaka både poängen och återlämningen.
    const u = play(eng, r.state, { type: "undo" }).state;
    expect(score(u, "p1")).toBe(0);
    expect(inSupply(u, "p1:abbot:0")).toBe(false);
  });

  test("abboten kan bara tas tillbaka av ägaren och inte efter att en pjäs placerats", () => {
    const s = scenario(eng, {
      board: [["base/L", 0, 0, 0]], hands: [["base/L"], []],
      figures: [{ id: "p2:abbot:0", x: 0, y: 0, feature: "cloister" }],
    });
    const placed = play(eng, s, place$(1, 0, 0)).state;
    expect(eng.legalSteps(placed).some((x) => x.type === "returnFigure")).toBe(false);
    expect(eng.apply(placed, "p1", { type: "returnFigure", figure: "p2:abbot:0" })).toMatchObject({ ok: false, error: "error.illegalFigure" });
    const s2 = scenario(eng, {
      board: [["base/L", 0, 0, 0]], hands: [["base/L"], []],
      figures: [{ id: "p1:abbot:0", x: 0, y: 0, feature: "cloister" }],
    });
    const after = play(eng, s2, place$(1, 0, 0), fig$("meeple", 1, 0, "cloister")).state;
    expect(eng.legalSteps(after).some((x) => x.type === "returnFigure")).toBe(false);
  });

  test("färdigt kloster med abbot: 9 poäng och abboten går hem", () => {
    const s = scenario(eng, {
      board: [["base/L", 0, 0, 0], ...ring], hands: [["base/L"], []],
      figures: [{ id: "p2:abbot:0", x: 0, y: 0, feature: "cloister" }],
    });
    const r = play(eng, s, place$(1, 1, 0), NOFIG, CONFIRM);
    expect(score(r.state, "p2")).toBe(9);
    expect(inSupply(r.state, "p2:abbot:0")).toBe(true);
  });

  test("abbot på trädgård: färdig trädgård ger 9", () => {
    const s = scenario(eng, {
      board: [
        ["base/CG", 0, 0, 0], ["base/C", 0, -1, 180], ["base/L", -1, -1, 0], ["base/L", 1, -1, 0], ["base/L", -1, 0, 0],
        ["base/L", 1, 0, 0], ["base/L", -1, 1, 0], ["base/L", 0, 1, 0],
      ],
      hands: [["base/L"], []], figures: [{ id: "p2:abbot:0", x: 0, y: 0, feature: "garden" }],
    });
    expect(eng.analyze(s).areaAt({ x: 0, y: 0 }, "garden")!.openSquares).toHaveLength(1);
    const r = play(eng, s, place$(1, 1, 0), NOFIG, CONFIRM);
    expect(score(r.state, "p2")).toBe(9);
    expect(reasons(r.events)).toContain("p2:garden:9");
    expect(inSupply(r.state, "p2:abbot:0")).toBe(true);
  });

  test("slutet: abbot som är kvar ger 1 per bricka", () => {
    const s = scenario(eng, {
      board: [["base/L", 0, 0, 0]], hands: [["base/L"], []], pile: [],
      figures: [{ id: "p2:abbot:0", x: 0, y: 0, feature: "cloister" }],
    });
    const r = play(eng, s, place$(1, 0, 0), NOFIG, CONFIRM);
    expect(r.state.finished).toBe(true);
    expect(score(r.state, "p2")).toBe(2);
  });
});
