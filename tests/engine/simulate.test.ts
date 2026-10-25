// engine.simulate (datorspelarens provspelning) ger samma nya tillstånd som apply, bara utan händelser.

import { describe, expect, test } from "bun:test";
import type { ExpansionId } from "../../src/shared/tiles";
import { actorOf } from "../../src/engine/index";
import { chooseStep, makeRng } from "../players/random-player";
import { realEngine, setupOf } from "./helpers";

const eng = realEngine();
const ALL: ExpansionId[] = [
  "base", "river", "abbot", "inns-cathedrals", "traders-builders", "gold-mines", "mage-witch",
  "princess-dragon", "ferries", "flying-machines", "crop-circles-2",
];

describe("simulate", () => {
  test("samma tillstånd som apply för alla delsteg i några partier med alla expansioner", () => {
    let confirms = 0;
    for (let g = 0; g < 3; g++) {
      let s = eng.newGame(setupOf(ALL, { n: 2 + g, seed: 300 + g, variants: { "river.startTile": "shuffle" } }));
      const rnd = makeRng(g + 11);
      for (let guard = 0; !s.finished && guard < 5000; guard++) {
        const who = actorOf(s);
        const step = chooseStep(eng.legalSteps(s), rnd, "eager");
        const a = eng.apply(s, who, step);
        const b = eng.simulate(s, who, step);
        expect(b.ok).toBe(a.ok);
        if (!a.ok || !b.ok) throw new Error("nekat steg");
        expect(JSON.stringify(b.state)).toBe(JSON.stringify(a.state));
        if (step.type === "confirm") {
          confirms++;
          expect(b.events).toEqual([]);
        }
        s = a.state;
      }
      expect(s.finished).toBe(true);
    }
    expect(confirms).toBeGreaterThan(100);
  }, 300_000);

  test("nekar bekräfta av fel spelare eller i fel fas", () => {
    const s = eng.newGame(setupOf(["base"], { n: 2 }));
    expect(eng.simulate(s, actorOf(s), { type: "confirm" }).ok).toBe(false);
    expect(eng.simulate(s, "p2", { type: "confirm" }).ok).toBe(false);
  });
});
