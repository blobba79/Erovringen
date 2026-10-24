import { describe, expect, test } from "bun:test";
import { enterPhase, leavePhase } from "../../src/engine/phases";
import type { GameState } from "../../src/shared/state";

const stateIn = (phase: string) => ({ turn: { player: "p1", phase, pending: [] }, ext: { base: { discarded: [] } } }) as unknown as GameState;

describe("expansionsfaser", () => {
  test("två moduler som vill ha en egen fas samma tur körs i tur och ordning", () => {
    const s = stateIn("placeFigure");
    enterPhase(s, "gold");
    enterPhase(s, "mage-witch");
    expect(s.turn.phase).toBe("gold");
    leavePhase(s);
    expect(s.turn.phase).toBe("mage-witch");
    leavePhase(s);
    expect(s.turn.phase).toBe("placeFigure");
  });

  test("en ensam fas går tillbaka till placeFigure", () => {
    const s = stateIn("placeFigure");
    enterPhase(s, "mage-witch");
    leavePhase(s);
    expect(s.turn.phase).toBe("placeFigure");
  });
});
