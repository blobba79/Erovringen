// Byggmästarens dubbeltur: spärren mot kedjor gäller bara den direkt efterföljande turen. Hoppar värden
// över nästa spelare ska spelaren som haft dubbeltur få en ny dubbeltur på nästa tur.

import { describe, expect, test } from "bun:test";
import { baseExt } from "../../../src/engine/context";
import { finishTurn } from "../../../src/engine/turn";
import { realEngine } from "../../engine/helpers";
import { CONFIRM, NOFIG, place$, play, scenario } from "../../engine/scenario";

const eng = realEngine();
const second = (s: { ext: Record<string, unknown> }) => (s.ext["traders-builders"] as { second: string | null }).second;

function start() {
  return scenario(eng, {
    expansions: ["base", "traders-builders"], board: [["base/RFr", 0, 0, 0]],
    hands: [["base/RFr"], ["base/RFr"]], pile: ["base/RFr", "base/RFr", "base/RFr", "base/RFr", "base/RFr"],
    figures: [{ id: "p1:meeple:0", x: 0, y: 0, feature: "road0" }, { id: "p1:builder:0", x: 0, y: 0, feature: "road0" }],
  });
}

describe("byggmästaren efter att värden hoppat över en spelare", () => {
  test("dubbelturen kommer tillbaka när p2 hoppas över i stället för att spela", () => {
    // Första delen: brickan bygger vidare på byggmästarens väg, extra tur.
    let st = play(eng, start(), place$(1, 0, 0), NOFIG, CONFIRM).state;
    expect(st.turn.player).toBe("p1");
    // Andra delen: ingen kedja, sedan p2:s tur.
    st = play(eng, st, place$(2, 0, 0), NOFIG, CONFIRM).state;
    expect(st.turn.player).toBe("p2");
    expect(second(st)).toBeNull(); // nollställd när p2:s tur började
    // Värden hoppar över p2 (en hel tur utan delsteg).
    const t = structuredClone(st);
    finishTurn(eng.env, t, []);
    expect(t.turn.player).toBe("p1");
    expect(second(t)).toBeNull(); // även när p1 får turen igen utan att någon annan spelat
    expect(baseExt(t).snapshot).toBeUndefined();
    // p1 bygger vidare igen och får en ny dubbeltur.
    const r = play(eng, t, place$(3, 0, 0), NOFIG, CONFIRM).state;
    expect(r.turn.player).toBe("p1");
    expect(r.turn.phase).toBe("placeTile");
  });

  test("efter en vanlig dubbeltur kedjar den extra turen fortfarande inte", () => {
    let st = play(eng, start(), place$(1, 0, 0), NOFIG, CONFIRM).state;
    st = play(eng, st, place$(2, 0, 0), NOFIG, CONFIRM).state;
    expect(st.turn.player).toBe("p2");
    expect(second(st)).toBeNull();
  });
});
