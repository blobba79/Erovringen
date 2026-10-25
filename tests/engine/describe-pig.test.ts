// Förhandsvisningen av ett fält (describeFeature) visar 4 poäng per färdig stad för den som har en gris.

import { describe, expect, test } from "bun:test";
import { describeFeature } from "../../src/engine/index";
import { realEngine } from "./helpers";
import { scenario, type Rot } from "./scenario";

const eng = realEngine();
const EXP = ["base", "traders-builders"] as const;
// Två C mot varandra: en färdig stad, och ett fält runt dem.
const board: [string, number, number, Rot][] = [["base/C", 0, 0, 0], ["base/C", 0, -1, 180]];
const fig = (id: string) => ({ id, x: 0, y: 0, feature: "field0" });
const view = (figures: { id: string; x: number; y: number; feature: string }[]) =>
  describeFeature(scenario(eng, { expansions: [...EXP], board, figures }), eng.types, { x: 0, y: 0 }, "field0")!;

describe("fältets värde i förhandsvisningen", () => {
  test("3 per färdig stad utan gris", () => {
    const d = view([fig("p1:meeple:0")]);
    expect(d).toMatchObject({ kind: "field", completedCities: 1, owners: ["p1"], value: 3, valueByOwner: { p1: 3 } });
  });

  test("4 per färdig stad för den som har grisen", () => {
    const d = view([fig("p1:meeple:0"), fig("p1:pig:0")]);
    expect(d).toMatchObject({ owners: ["p1"], value: 4, valueByOwner: { p1: 4 } });
  });

  test("grisen räknas inte vid majoritet: ägaren utan majoritet får inget extra", () => {
    const d = view([fig("p1:pig:0"), fig("p1:meeple:0"), fig("p2:meeple:0"), fig("p2:meeple:1")]);
    expect(d).toMatchObject({ owners: ["p2"], value: 3, valueByOwner: { p2: 3 } });
  });

  test("delad majoritet där bara en har gris: grundvärdet i value, 4 och 3 per ägare", () => {
    const d = view([fig("p1:meeple:0"), fig("p1:pig:0"), fig("p2:meeple:0")]);
    expect(d.owners.sort()).toEqual(["p1", "p2"]);
    expect(d.value).toBe(3);
    expect(d.valueByOwner).toEqual({ p1: 4, p2: 3 });
  });

  test("andra områden har ingen fältvärdering", () => {
    const s = scenario(eng, { expansions: [...EXP], board: [["base/L", 0, 0, 0]], figures: [{ id: "p1:meeple:0", x: 0, y: 0, feature: "cloister" }] });
    const d = describeFeature(s, eng.types, { x: 0, y: 0 }, "cloister")!;
    expect(d.valueByOwner).toEqual({});
    expect(d.value).toBe(1);
  });

  test("värdet stämmer med slutpoängen", () => {
    const s = scenario(eng, { expansions: [...EXP], board, hands: [["base/L"], []], pile: [], figures: [fig("p1:meeple:0"), fig("p1:pig:0")] });
    const d = describeFeature(s, eng.types, { x: 0, y: 0 }, "field0")!;
    const r = eng.apply(s, "p1", { type: "placeTile", pos: { x: 1, y: 0 }, rotation: 0 });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    const a = eng.apply(r.state, "p1", { type: "noFigure" });
    if (!a.ok) throw new Error(a.error);
    const done = eng.apply(a.state, "p1", { type: "confirm" });
    if (!done.ok) throw new Error(done.error);
    expect(done.state.players[0]!.score).toBe(d.valueByOwner.p1 as number);
  });
});
