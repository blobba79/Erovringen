import { describe, expect, test } from "bun:test";
import type { Figure } from "../../src/shared/state";
import { stepWarnings } from "../../src/engine/index";
import { realEngine } from "./helpers";
import { fig$, place$, play, scenario, type Rot } from "./scenario";

const eng = realEngine();
const M = (p: string, n = 0) => `${p}:meeple:${n}`;
const road: [string, number, number, Rot][] = [["base/LR", 0, 0, 0], ["base/RFr", 0, 2, 90]];
const closedRoad: [string, number, number, Rot][] = [["base/LR", 0, 0, 0], ["base/LR", 0, 2, 180]];
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
    // Vägen är öppen i ena änden (RFr), så pjäsen blir kvar.
    const w = stepWarnings(play(eng, placed, fig$("meeple", 0, 1, "road0")).state, "p1");
    expect(w.map((x) => x.key)).toContain("warning.lastFigure");
  });

  test("pjäs i en stad som ingen återstående bricka kan avsluta", () => {
    // Stadsbrickan lägger till en öppen kant åt öster; högen innehåller bara en bricka utan stadskanter.
    const s = scenario(eng, { board: [["base/C", 0, 0, 0]], hands: [["base/Cc.1"], []], pile: ["base/L"] });
    const w = stepWarnings(play(eng, s, place$(0, -1, 180), fig$("meeple", 0, -1, "city0")).state, "p1");
    expect(w.map((x) => x.key)).toEqual(["warning.figureUnfinishable"]);
    expect(w[0]!.pos).toEqual({ x: 1, y: -1 });
  });

  test("brickor på andra spelares händer räknas som kvarvarande, tom hög ger ingen varning", () => {
    const run = (p2hand: string[], pile: string[]) => {
      const s = scenario(eng, { board: [["base/C", 0, 0, 0]], hands: [["base/Cc.1"], p2hand], pile });
      return keys(play(eng, s, place$(0, -1, 180), fig$("meeple", 0, -1, "city0")).state);
    };
    expect(run(["base/C"], [])).toEqual([]);
    expect(run([], [])).toEqual([]);
    expect(run([], ["base/L"])).toEqual(["warning.figureUnfinishable"]);
  });

  describe("tileBlocks", () => {
    test("en egen stad blir omöjlig att avsluta", () => {
      const s = scenario(eng, {
        board: [["base/C", 0, 0, 0]], hands: [["base/Cc.1"], []], pile: ["base/L"],
        figures: [{ id: M("p1"), x: 0, y: 0, feature: "city0" }],
      });
      const w = stepWarnings(play(eng, s, place$(0, -1, 180)).state, "p1");
      expect(w.map((x) => x.key)).toEqual(["warning.tileBlocks"]);
      expect(w[0]!.params?.area).toBe("city");
    });

    test("den enda passande brickan är den spelaren lägger någon annanstans", () => {
      const s = scenario(eng, {
        board: [["base/C", 0, 0, 0]], hands: [["base/C"], []], pile: ["base/L"],
        figures: [{ id: M("p1"), x: 0, y: 0, feature: "city0" }],
      });
      expect(keys(play(eng, s, place$(1, 0, 180)).state)).toEqual(["warning.tileBlocks"]);
    });

    test("ingen varning när en passande bricka finns kvar", () => {
      const s = scenario(eng, {
        board: [["base/C", 0, 0, 0]], hands: [["base/C"], []], pile: ["base/C"],
        figures: [{ id: M("p1"), x: 0, y: 0, feature: "city0" }],
      });
      expect(keys(play(eng, s, place$(1, 0, 180)).state)).toEqual([]);
    });
  });

  describe("lastFigure", () => {
    const six = [1, 2, 3, 4, 5, 6].map((n) => ({ id: M("p1", n), x: 5, y: 5, feature: "cloister" }));

    test("inte för abboten", () => {
      const s = scenario(eng, { board: [["base/L", 0, 0, 0]], hands: [["base/L"], []] });
      const w = stepWarnings(play(eng, s, place$(1, 0, 0), fig$("abbot", 1, 0, "cloister")).state, "p1");
      expect(w.map((x) => x.key)).not.toContain("warning.lastFigure");
    });

    test("inte när området avslutas samma tur", () => {
      const s = scenario(eng, { board: [...closedRoad, ["base/L", 5, 5, 0]], hands: [["base/RFr"], []], figures: six });
      const w = stepWarnings(play(eng, s, place$(0, 1, 90), fig$("meeple", 0, 1, "road0")).state, "p1");
      expect(w.map((x) => x.key)).not.toContain("warning.lastFigure");
    });
  });

  describe("opponentScores", () => {
    test("stad med sköld", () => {
      // Stad av två brickor (en med sköld) och en tredje som sluter den: (3 + 1) * 2 = 8 poäng.
      const s = scenario(eng, {
        board: [["base/Cc+", 0, 0, 0], ["base/C", -1, 0, 90]], hands: [["base/C"], []],
        figures: [{ id: M("p2"), x: 0, y: 0, feature: "city0" }],
      });
      const w = stepWarnings(play(eng, s, place$(0, -1, 180)).state, "p1");
      expect(w.map((x) => x.key)).toEqual(["warning.opponentScores"]);
      expect(w[0]!.params).toEqual({ area: "city", player: "Spelare 2", points: 8 });
    });

    test("väg", () => {
      const s = scenario(eng, {
        board: closedRoad, hands: [["base/RFr"], []],
        figures: [{ id: M("p2"), x: 0, y: 0, feature: "road0" }],
      });
      const w = stepWarnings(play(eng, s, place$(0, 1, 90)).state, "p1");
      expect(w.map((x) => x.key)).toEqual(["warning.opponentScores"]);
      expect(w[0]!.params).toMatchObject({ area: "road", points: 3 });
    });

    test("kloster som fullbordas av en grannbricka", () => {
      const ring: [string, number, number, Rot][] = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1]]
        .map(([x, y]) => ["base/L", x!, y!, 0]);
      const s = scenario(eng, {
        board: [["base/L", 0, 0, 0], ...ring], hands: [["base/L"], []],
        figures: [{ id: M("p2"), x: 0, y: 0, feature: "cloister" }],
      });
      const w = stepWarnings(play(eng, s, place$(1, 1, 0)).state, "p1");
      expect(w.map((x) => x.key)).toEqual(["warning.opponentScores"]);
      expect(w[0]!.params).toMatchObject({ area: "cloister", points: 9 });
    });

    test("inget larm när området är spelarens eget", () => {
      const s = scenario(eng, {
        board: closedRoad, hands: [["base/RFr"], []],
        figures: [{ id: M("p1"), x: 0, y: 0, feature: "road0" }],
      });
      expect(keys(play(eng, s, place$(0, 1, 90)).state)).toEqual([]);
    });

    test("flera motståndare lika: alla namn", () => {
      const s = scenario(eng, {
        board: closedRoad, hands: [["base/RFr"], [], []], n: 3,
        figures: [{ id: M("p2"), x: 0, y: 0, feature: "road0" }, { id: M("p3"), x: 0, y: 2, feature: "road0" }],
      });
      const w = stepWarnings(play(eng, s, place$(0, 1, 90)).state, "p1");
      expect(w[0]!.params?.player).toBe("Spelare 2, Spelare 3");
    });

    test("delad majoritet i ett område som brickan avslutar", () => {
      const s = scenario(eng, {
        board: closedRoad, hands: [["base/RFr"], []],
        figures: [{ id: M("p1"), x: 0, y: 0, feature: "road0" }, { id: M("p2"), x: 0, y: 2, feature: "road0" }],
      });
      const w = stepWarnings(play(eng, s, place$(0, 1, 90)).state, "p1");
      expect(w.map((x) => x.key)).toEqual(["warning.majorityTied"]);
    });
  });

  describe("majoritet", () => {
    const fields: [string, number, number, Rot][] = [["base/L", 0, 0, 0], ["base/L", 2, 0, 0]];

    test("i fält: förlorad", () => {
      const s = scenario(eng, {
        board: fields, hands: [["base/L"], []],
        figures: [
          { id: M("p1"), x: 0, y: 0, feature: "field0" },
          { id: M("p2", 0), x: 2, y: 0, feature: "field0" }, { id: M("p2", 1), x: 2, y: 0, feature: "field0" },
        ],
      });
      expect(keys(play(eng, s, place$(1, 0, 0)).state)).toEqual(["warning.majorityLost"]);
    });

    test("stor pjäs väger 2", () => {
      const s = scenario(eng, {
        board: fields, hands: [["base/L"], []],
        figures: [{ id: M("p1"), x: 0, y: 0, feature: "field0" }, { id: M("p2"), x: 2, y: 0, feature: "field0" }],
      });
      const big: Figure = {
        id: "p2:large-meeple:0", kind: "large-meeple", owner: "p2",
        location: { at: "feature", pos: { x: 2, y: 0 }, feature: "field0" },
      };
      s.figures.push(big);
      const w = stepWarnings(play(eng, s, place$(1, 0, 0)).state, "p1");
      expect(w.map((x) => x.key)).toEqual(["warning.majorityLost"]);
    });

    test("flera motståndare lika: alla namn", () => {
      const s = scenario(eng, {
        board: [...fields, ["base/L", 1, 1, 0]], hands: [["base/L"], [], []], n: 3,
        figures: [
          { id: M("p1", 0), x: 0, y: 0, feature: "field0" }, { id: M("p1", 1), x: 0, y: 0, feature: "field0" },
          { id: M("p2", 0), x: 2, y: 0, feature: "field0" }, { id: M("p2", 1), x: 2, y: 0, feature: "field0" },
          { id: M("p2", 2), x: 2, y: 0, feature: "field0" },
          { id: M("p3", 0), x: 1, y: 1, feature: "field0" }, { id: M("p3", 1), x: 1, y: 1, feature: "field0" },
          { id: M("p3", 2), x: 1, y: 1, feature: "field0" },
        ],
      });
      const w = stepWarnings(play(eng, s, place$(1, 0, 0)).state, "p1");
      expect(w.find((x) => x.key === "warning.majorityLost")?.params?.player).toBe("Spelare 2, Spelare 3");
    });
  });
});
