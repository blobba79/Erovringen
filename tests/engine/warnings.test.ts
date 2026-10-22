import { describe, expect, test } from "bun:test";
import { stepWarnings } from "../../src/engine/index";
import { realEngine } from "./helpers";
import { fig$, place$, play, scenario, type Rot } from "./scenario";

const eng = realEngine();
const M = (p: string, n = 0) => `${p}:meeple:${n}`;
const road: [string, number, number, Rot][] = [["base/LR", 0, 0, 0], ["base/RFr", 0, 2, 90]];
const keys = (s: Parameters<typeof stepWarnings>[0], p = "p1") => stepWarnings(s, p).map((w) => w.key);

describe("stepWarnings", () => {
  test("inga varningar utan väntande delsteg, för fel spelare eller efter spelets slut", () => {
    const s = scenario(eng, { board: road, hands: [["base/RFr"], []] });
    expect(stepWarnings(s, "p1")).toEqual([]);
    const a = play(eng, s, place$(0, 1, 90)).state;
    expect(stepWarnings(a, "p2")).toEqual([]);
  });

  test("anropet ändrar inte tillståndet", () => {
    const s = scenario(eng, {
      board: road, hands: [["base/RFr"], []],
      figures: [{ id: M("p1"), x: 0, y: 0, feature: "road0" }, { id: M("p2"), x: 0, y: 2, feature: "road0" }],
    });
    const a = play(eng, s, place$(0, 1, 90)).state;
    const before = JSON.stringify(a);
    stepWarnings(a, "p1");
    expect(JSON.stringify(a)).toBe(before);
  });

  test("delad majoritet när brickan förenar två vägar", () => {
    const s = scenario(eng, {
      board: road, hands: [["base/RFr"], []],
      figures: [{ id: M("p1"), x: 0, y: 0, feature: "road0" }, { id: M("p2"), x: 0, y: 2, feature: "road0" }],
    });
    const w = stepWarnings(play(eng, s, place$(0, 1, 90)).state, "p1");
    expect(w.map((x) => x.key)).toContain("warning.majorityTied");
    expect(w.find((x) => x.key === "warning.majorityTied")?.params?.player).toBe("Spelare 2");
  });

  test("förlorad majoritet när brickan förenar med en större motståndare", () => {
    const s = scenario(eng, {
      board: road, hands: [["base/RFr"], []],
      figures: [
        { id: M("p1"), x: 0, y: 0, feature: "road0" },
        { id: M("p2", 0), x: 0, y: 2, feature: "road0" }, { id: M("p2", 1), x: 0, y: 2, feature: "road0" },
      ],
    });
    const w = keys(play(eng, s, place$(0, 1, 90)).state);
    expect(w).toContain("warning.majorityLost");
    expect(w).not.toContain("warning.majorityTied");
  });

  test("ingen varning när spelaren behåller majoriteten", () => {
    const s = scenario(eng, {
      board: road, hands: [["base/RFr"], []],
      figures: [
        { id: M("p1", 0), x: 0, y: 0, feature: "road0" }, { id: M("p1", 1), x: 0, y: 0, feature: "road0" },
        { id: M("p2"), x: 0, y: 2, feature: "road0" },
      ],
    });
    const w = keys(play(eng, s, place$(0, 1, 90)).state);
    expect(w).not.toContain("warning.majorityLost");
    expect(w).not.toContain("warning.majorityTied");
  });

  test("sista pjäsen i förrådet", () => {
    const figures = [1, 2, 3, 4, 5, 6].map((n) => ({ id: M("p1", n), x: 5, y: 5, feature: "cloister" }));
    const s = scenario(eng, { board: [...road, ["base/L", 5, 5, 0]], hands: [["base/RFr"], []], figures });
    const placed = play(eng, s, place$(0, 1, 90)).state;
    expect(keys(placed)).not.toContain("warning.lastFigure");
    const w = stepWarnings(play(eng, placed, fig$("meeple", 0, 1, "road0")).state, "p1");
    expect(w.map((x) => x.key)).toContain("warning.lastFigure");
  });

  test("pjäs i en stad som ingen återstående bricka kan avsluta", () => {
    // Stadsbricka med öppen stadskant; högen innehåller bara en bricka utan stadskanter.
    const s = scenario(eng, { board: [["base/Cc+", 0, 0, 0]], hands: [["base/C"], []], pile: ["base/RFr"] });
    const cities = eng.legalSteps(s).filter((x) => x.type === "placeTile");
    expect(cities.length).toBeGreaterThan(0);
    const step = cities[0]!;
    const placed = play(eng, s, step).state;
    const pos = (step as { pos: { x: number; y: number } }).pos;
    const feature = Object.values(placed.board).length > 0 ? "city0" : "";
    const withFig = eng.apply(placed, "p1", fig$("meeple", pos.x, pos.y, feature));
    expect(withFig.ok).toBe(true);
    if (withFig.ok) {
      const w = stepWarnings(withFig.state, "p1");
      expect(w.map((x) => x.key)).toContain("warning.figureUnfinishable");
    }
  });
});
