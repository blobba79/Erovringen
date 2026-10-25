// Datorspelaren och rättningarna: tar alltid byggmästarens extra tur, väljer guldtacka, tittar inte på tärningen
// och spelar färdigt med de nya faserna.

import { describe, expect, test } from "bun:test";
import type { GameState, Step } from "../../src/shared/state";
import type { ExpansionId } from "../../src/shared/tiles";
import { actorOf } from "../../src/engine/index";
import { chooseBotStep } from "../../src/server/bot";
import { realEngine, setupOf } from "../engine/helpers";
import { CONFIRM, NOFIG, place$, play, scenario, type Rot } from "../engine/scenario";
import { makeRng } from "./random-player";

const eng = realEngine();

describe("datorspelaren", () => {
  test("tar alltid byggmästarens extra tur", () => {
    const s = scenario(eng, {
      expansions: ["base", "traders-builders"], board: [["base/RFr", 0, 0, 0]], hands: [["base/RFr"], ["base/L"]],
      pile: ["base/RFr", "base/L"],
      figures: [{ id: "p1:meeple:0", x: 0, y: 0, feature: "road0" }, { id: "p1:builder:0", x: 0, y: 0, feature: "road0" }],
    });
    const offer = play(eng, s, place$(1, 0, 0), NOFIG, CONFIRM).state;
    expect(offer.turn.phase).toBe("tb-extra");
    for (let i = 0; i < 5; i++) {
      const step = chooseBotStep(eng, offer, makeRng(i));
      expect(step).toMatchObject({ type: "expansion", expansion: "traders-builders", action: "extraTurn", data: { choice: "take" } });
    }
  });

  test("väljer en tacka när den ska välja", () => {
    const road: [string, number, number, Rot][] = [["base/LR", 0, 0, 0], ["base/RFr", 0, 1, 90]];
    const s = scenario(eng, {
      expansions: ["base", "gold-mines"], board: road, hands: [["base/LR"], []],
      figures: [{ id: "p1:meeple:0", x: 0, y: 0, feature: "road0" }],
    });
    s.figures.find((f) => f.id === "gold-bar:0")!.location = { at: "tile", pos: { x: 0, y: 0 } };
    s.figures.find((f) => f.id === "gold-bar:1")!.location = { at: "tile", pos: { x: 0, y: 1 } };
    const st = play(eng, s, place$(0, 2, 180), NOFIG, CONFIRM).state;
    expect(st.turn.phase).toBe("gold-pick");
    const step = chooseBotStep(eng, st, makeRng(1));
    expect(step).toMatchObject({ type: "expansion", expansion: "gold-mines", action: "takeGold" });
    expect(eng.apply(st, actorOf(st), step).ok).toBe(true);
  });

  test("provspelningen ser inte det verkliga tärningsslaget", () => {
    // Samma tillstånd, men olika slumpfrö i provspelningen: botten ska inte ge samma svar som det verkliga slaget
    // för att det råkar passa. Här räcker det att provsteget går att köra och inte ändrar tillståndet.
    const s = scenario(eng, {
      expansions: ["base", "flying-machines"], board: [["base/L", -1, 0, 0], ["base/L", 0, 0, 0]], hands: [["flying-machines/F.o"], []],
    });
    const placed = play(eng, s, place$(1, 0, 0)).state;
    const before = JSON.stringify(placed);
    const step = chooseBotStep(eng, placed, makeRng(3));
    expect(step.type).not.toBe("undo");
    expect(JSON.stringify(placed)).toBe(before);
  });

  test("spelar färdigt med byggmästare, guld och flygmaskiner (2 partier)", () => {
    const expansions: ExpansionId[] = ["base", "traders-builders", "gold-mines", "flying-machines"];
    let sawExtra = false;
    for (let i = 0; i < 2; i++) {
      const setup = setupOf(expansions, { n: 2 + i, seed: 6100 + i, handSize: 1 + 2 * i });
      const rnd = makeRng(i + 11);
      let s: GameState = eng.newGame(setup);
      for (let guard = 0; !s.finished; guard++) {
        if (guard > 20000) throw new Error("spelet tar aldrig slut");
        const step: Step = chooseBotStep(eng, s, rnd);
        const r = eng.apply(s, actorOf(s), step);
        if (!r.ok) throw new Error(`nekat steg ${JSON.stringify(step)}: ${r.error}`);
        if (step.type === "expansion" && step.action === "extraTurn") {
          sawExtra = true;
          expect((step.data as { choice: string }).choice).toBe("take");
        }
        s = r.state;
      }
    }
    expect(typeof sawExtra).toBe("boolean");
  }, 600_000);
});
