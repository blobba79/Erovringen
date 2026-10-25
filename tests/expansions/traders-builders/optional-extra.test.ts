// Byggmästarens extra tur är frivillig (s. 36, not 58): efter bekräftelsen väljer spelaren att ta den eller
// hoppa över den (fasen "tb-extra"). Draken som äter byggmästaren samma tur tar inte bort den.

import { describe, expect, test } from "bun:test";
import type { GameState, Step } from "../../../src/shared/state";
import type { ExpansionId } from "../../../src/shared/tiles";
import { actorOf } from "../../../src/engine/index";
import { finishTurn } from "../../../src/engine/turn";
import { realEngine } from "../../engine/helpers";
import { CONFIRM, NOFIG, inSupply, place$, play, scenario, type Rot } from "../../engine/scenario";

const eng = realEngine();
const EXP: ExpansionId[] = ["base", "traders-builders"];
const EXTRA = (choice: "take" | "skip"): Step => ({ type: "expansion", expansion: "traders-builders", action: "extraTurn", data: { choice } });
const B = "p1:builder:0";

// En väg (0,0) med p1:s följare och byggmästare; RFr på (1,0) bygger vidare på den.
const road: [string, number, number, Rot][] = [["base/RFr", 0, 0, 0]];
const offered = (pile = ["base/RFr", "base/L"]) =>
  play(
    eng,
    scenario(eng, {
      expansions: EXP, board: road, hands: [["base/RFr"], ["base/L"]], pile,
      figures: [{ id: "p1:meeple:0", x: 0, y: 0, feature: "road0" }, { id: B, x: 0, y: 0, feature: "road0" }],
    }),
    place$(1, 0, 0), NOFIG, CONFIRM,
  ).state;

describe("byggmästarens frivilliga extra tur", () => {
  test("valet erbjuds efter bekräftelsen, med knapparna ta och hoppa över, och inget annat", () => {
    const s = offered();
    expect(s.turn.phase).toBe("tb-extra");
    expect(s.turn.player).toBe("p1");
    const steps = eng.legalSteps(s);
    expect(steps.map((x) => x.type)).toEqual(["expansion", "expansion"]);
    expect(steps.map((x) => (x as { data: { choice: string } }).data.choice)).toEqual(["take", "skip"]);
    expect(steps.every((x) => x.type === "expansion" && x.expansion === "traders-builders" && x.action === "extraTurn")).toBe(true);
    // Andra spelare väljer inte åt hen.
    expect(eng.apply(s, "p2", EXTRA("take")).ok).toBe(false);
  });

  test("hoppa över: turen går vidare till nästa spelare och byggmästaren står kvar", () => {
    const s = play(eng, offered(), EXTRA("skip")).state;
    expect(s.turn.phase).toBe("confirm");
    const next = play(eng, s, CONFIRM).state;
    expect(next.turn.player).toBe("p2");
    expect(inSupply(next, B)).toBe(false);
  });

  test("ta: samma spelare får en ny bricka och en ny tur", () => {
    const s = play(eng, offered(), EXTRA("take"), CONFIRM).state;
    expect(s.turn.player).toBe("p1");
    expect(s.turn.phase).toBe("placeTile");
    expect(s.players[0]!.hand).toEqual(["base/RFr"]);
  });

  test("ingen kedja: den extra turen ger ingen ny erbjudan", () => {
    const s = play(eng, offered(), EXTRA("take"), CONFIRM).state;
    const done = play(eng, s, place$(2, 0, 0), NOFIG, CONFIRM).state;
    expect(done.turn.player).toBe("p2");
  });

  test("ångra tar tillbaka valet", () => {
    const s = offered();
    const taken = play(eng, s, EXTRA("take"));
    expect(taken.state.turn.phase).toBe("confirm");
    const undone = play(eng, taken.state, { type: "undo" });
    expect(undone.state.turn.phase).toBe("tb-extra");
    expect(JSON.stringify(undone.state)).toBe(JSON.stringify(s));
    // Från själva erbjudandet går det inte att ångra (turen är bekräftad).
    expect(eng.legalSteps(s).some((x) => x.type === "undo")).toBe(false);
  });

  test("inga brickor kvar: ingen fråga, turen går vidare", () => {
    const s = offered([]);
    expect(s.turn.phase).not.toBe("tb-extra");
  });

  test("värden hoppar över den frånvarande: ingen extra tur, varken vid fasen eller före den", () => {
    const s = offered();
    const skipped = structuredClone(s);
    finishTurn(eng.env, skipped, []);
    expect(skipped.turn.player).toBe("p2");
    expect(skipped.turn.phase).not.toBe("tb-extra");
  });

  test("en bricka som inte bygger vidare erbjuder ingen extra tur", () => {
    const s = scenario(eng, {
      expansions: EXP, board: road, hands: [["base/L"], ["base/L"]], pile: ["base/L", "base/L"],
      figures: [{ id: "p1:meeple:0", x: 0, y: 0, feature: "road0" }, { id: B, x: 0, y: 0, feature: "road0" }],
    });
    const r = play(eng, s, place$(0, 1, 0), NOFIG, CONFIRM).state;
    expect(r.turn.player).toBe("p2");
  });
});

describe("draken äter byggmästaren samma tur som han gav en extra tur", () => {
  const act = (s: GameState, step: Step): GameState => {
    const r = eng.apply(s, actorOf(s), step);
    if (!r.ok) throw new Error(`${JSON.stringify(step)} nekades: ${r.error}`);
    return r.state;
  };

  test("den extra turen erbjuds ändå (steg 9a: 'had a builder')", () => {
    const board: [string, number, number, Rot][] = [["base/RFr", 0, 0, 0]];
    for (let y = 1; y <= 7; y++) board.push(["base/L", 0, y, 0]);
    const s = scenario(eng, {
      expansions: ["base", "traders-builders", "princess-dragon"], board, hands: [["princess-dragon/RFr.d"], ["base/L"]],
      pile: ["base/RFr", "base/RFr", "base/L", "base/L"],
      figures: [{ id: "p1:meeple:0", x: 0, y: 0, feature: "road0" }, { id: B, x: 0, y: 0, feature: "road0" }],
    });
    s.figures.find((f) => f.id === "dragon:0")!.location = { at: "tile", pos: { x: 0, y: 1 } };
    let st = play(eng, s, place$(1, 0, 0), NOFIG).state;
    expect(st.turn.phase).toBe("dragon");
    // Första draget: in på byggmästarens ruta (0,0). Sedan det första tillåtna draget tills flytten är slut.
    st = act(st, eng.legalSteps(st).find((x) => x.type === "expansion" && x.action === "move" && (x.data as { pos: { x: number; y: number } }).pos.y === 0 && (x.data as { pos: { x: number } }).pos.x === 0)!);
    expect(inSupply(st, B)).toBe(true);
    for (let i = 0; i < 10 && st.turn.phase === "dragon"; i++) st = act(st, eng.legalSteps(st).find((x) => x.type === "expansion")!);
    expect(st.turn.phase).toBe("confirm");
    st = play(eng, st, CONFIRM).state;
    expect(st.turn.phase).toBe("tb-extra");
    expect(st.turn.player).toBe("p1");
    const next = play(eng, st, EXTRA("take"), CONFIRM).state;
    expect(next.turn.player).toBe("p1");
    expect(next.turn.phase).toBe("placeTile");
  });
});
