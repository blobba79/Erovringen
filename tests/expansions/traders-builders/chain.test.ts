// Byggmästaren och faser efter poängräkningen: "once more and only once more" (s. 208, steg 9a).
// När en fas läggs efter poängräkningen (drakens variant "after", en sädescirkel) frågas extraTurn två
// gånger i samma tur; den andra frågan får inte nollställa spärren mot kedjor.

import { describe, expect, test } from "bun:test";
import type { GameState, Step } from "../../../src/shared/state";
import type { ExpansionId } from "../../../src/shared/tiles";
import { actorOf } from "../../../src/engine/index";
import { realEngine } from "../../engine/helpers";
import { CONFIRM, NOFIG, place$, play, scenario, type Rot } from "../../engine/scenario";

const eng = realEngine();
const phase = (s: GameState) => s.turn.phase;

/** Utför ett delsteg av den som ska välja (actor, annars den som har tur). */
function act(s: GameState, step: Step): GameState {
  const r = eng.apply(s, actorOf(s), step);
  if (!r.ok) throw new Error(`${JSON.stringify(step)} nekades: ${r.error}`);
  return r.state;
}

describe("byggmästaren kedjar inte med en fas efter poängräkningen", () => {
  test("drakens variant after: en extra tur, inte två", () => {
    const EXP: ExpansionId[] = ["base", "traders-builders", "princess-dragon"];
    // Vägen (0,0)-(1,0) med p1:s följare och byggmästare. Draken står på (0,1) och går nedåt längs en rad
    // brickor, långt från vägen.
    const board: [string, number, number, Rot][] = [["base/RFr", 0, 0, 0]];
    for (let y = 1; y <= 7; y++) board.push(["base/L", 0, y, 0]);
    const s = scenario(eng, {
      expansions: EXP, board, hands: [["princess-dragon/RFr.d"], ["base/L"]],
      pile: ["base/RFr", "base/RFr", "base/L", "base/L"],
      figures: [{ id: "p1:meeple:0", x: 0, y: 0, feature: "road0" }, { id: "p1:builder:0", x: 0, y: 0, feature: "road0" }],
      variants: { "princess-dragon.dragonTiming": "after" },
    });
    s.figures.find((f) => f.id === "dragon:0")!.location = { at: "tile", pos: { x: 0, y: 1 } };
    let st = play(eng, s, place$(1, 0, 0), NOFIG, CONFIRM).state; // brickan bygger vidare: extra tur väntar
    // Draken flyttar efter poängräkningen; välj alltid draget längst ner.
    for (let i = 0; i < 10 && phase(st) === "dragon"; i++) {
      const moves = eng.legalSteps(st).filter((x) => x.type === "expansion" && x.action === "move");
      const y = (m: Step) => (m as { data: { pos: { y: number } } }).data.pos.y;
      moves.sort((a, b) => y(b) - y(a));
      st = act(st, moves[0]!);
    }
    expect(phase(st)).toBe("confirm");
    st = play(eng, st, CONFIRM).state;
    expect(st.turn.player).toBe("p1"); // extra tur
    expect(st.turn.phase).toBe("placeTile");
    // Den extra turen bygger vidare igen (2,0): ingen tredje tur.
    st = play(eng, st, place$(2, 0, 0), NOFIG, CONFIRM).state;
    expect(st.turn.player).toBe("p2");
  });

  test("sädescirkel: en extra tur, inte två", () => {
    const EXP: ExpansionId[] = ["base", "traders-builders", "crop-circles-2"];
    const RR = "crop-circles-2/RRr";
    // p1:s väg på (0,0) med följare och byggmästare; p2 har en följare på en egen väg långt bort, så att
    // vägcirkeln får ett val. Brickan med cirkeln läggs i alla vridningar vid (1,0); den som bygger vidare
    // ger en extra tur.
    const mk = () => scenario(eng, {
      expansions: EXP, n: 2, board: [["base/RFr", 0, 0, 0], ["base/RFr", 0, 9, 0]], hands: [[RR], ["base/L"]],
      pile: [RR, RR, RR, RR],
      figures: [
        { id: "p1:meeple:0", x: 0, y: 0, feature: "road0" }, { id: "p1:builder:0", x: 0, y: 0, feature: "road0" },
        { id: "p2:meeple:0", x: 0, y: 9, feature: "road0" },
      ],
    });
    const finish = (st: GameState): GameState => {
      for (let i = 0; i < 30 && (phase(st) === "crop-circles-2" || phase(st) === "confirm"); i++) {
        if (phase(st) === "confirm") {
          st = play(eng, st, CONFIRM).state;
          continue;
        }
        const opts = eng.legalSteps(st).filter((x) => x.type === "expansion");
        st = act(st, opts.find((x) => x.type === "expansion" && x.action === "skip") ?? opts[0]!);
      }
      return st;
    };
    let tested = 0;
    for (const rot of [0, 90, 180, 270] as Rot[]) {
      const first = eng.apply(mk(), "p1", place$(1, 0, rot));
      if (!first.ok) continue;
      let st = play(eng, first.state, NOFIG, CONFIRM).state;
      if (phase(st) !== "crop-circles-2") continue;
      st = finish(st);
      if (st.turn.player !== "p1") continue; // brickan byggde inte vidare på byggmästarens väg
      // Extra turen: ingen placering får ge en tredje tur.
      for (const step of eng.legalSteps(st).filter((x) => x.type === "placeTile")) {
        const p = eng.apply(st, "p1", step);
        if (!p.ok) continue;
        const r = finish(play(eng, p.state, NOFIG).state);
        expect(r.turn.player).toBe("p2");
        tested++;
      }
    }
    expect(tested).toBeGreaterThan(0);
  });
});
