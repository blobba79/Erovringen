// Abboten tas hem och klostret räknas: fen intill abboten ger sina 3 poäng (s. 54, s. 214 "fairy friend: yes").

import { describe, expect, test } from "bun:test";
import { realEngine } from "./helpers";
import { CONFIRM, place$, play, reasons, scenario, score } from "./scenario";

const eng = realEngine();

describe("abboten och fen", () => {
  test("fen intill abboten ger 3 poäng när abboten tas hem", () => {
    const s = scenario(eng, {
      expansions: ["base", "abbot", "princess-dragon"],
      board: [["base/L", 0, 0, 0], ["base/L", 1, 0, 0], ["base/L", 0, 1, 0]], hands: [["base/L"], []],
      figures: [{ id: "p1:abbot:0", x: 0, y: 0, feature: "cloister" }],
    });
    s.figures.find((f) => f.id === "fairy:0")!.location = { at: "figure", figure: "p1:abbot:0" };
    const placed = play(eng, s, place$(1, 1, 0)).state;
    const r = play(eng, placed, { type: "returnFigure", figure: "p1:abbot:0" });
    const done = play(eng, r.state, CONFIRM);
    expect(reasons([...r.events, ...done.events])).toEqual(expect.arrayContaining(["p1:fairy.feature:3", "p1:return:4"]));
    expect(score(done.state, "p1")).toBe(7);
    // Fen blir kvar på klosterrutan.
    expect(done.state.figures.find((f) => f.id === "fairy:0")!.location).toEqual({ at: "tile", pos: { x: 0, y: 0 } });
  });
});
