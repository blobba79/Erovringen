// Värdens ingrepp mitt i en tur som delsteg: hoppa över eller ta bort den som väljer (turn.actor).
// Steget ligger i turn.pending och spelas om med resten, så ångra och bekräfta ger rätt tillstånd.

import { describe, expect, test } from "bun:test";
import type { GameState, Step } from "../../src/shared/state";
import { actorOf } from "../../src/engine/index";
import { removePlayerStep, skipActorStep } from "../../src/engine/host";
import { baseExt } from "../../src/engine/context";
import { realEngine } from "./helpers";
import { CONFIRM, NOFIG, place$, play, scenario } from "./scenario";

const eng = realEngine();
const expansion = (id: string, action: string, data: unknown): Step => ({ type: "expansion", expansion: id as never, action, data });

function act(s: GameState, step: Step): GameState {
  const who = actorOf(s);
  const r = eng.apply(s, who, step);
  if (!r.ok) throw new Error(`${who} ${JSON.stringify(step)} nekades: ${r.error}`);
  return r.state;
}
const firstExpansion = (s: GameState) => eng.legalSteps(s).find((x) => x.type === "expansion")!;
const at = (s: GameState, id: string) => s.figures.find((f) => f.id === id)!.location.at;

/** Tre spelare; p1 lägger en sädescirkelbricka, alla tre har en bonde på ett fält. */
function circle(mode: "remove"): GameState {
  const s = scenario(eng, {
    n: 3, expansions: ["base", "crop-circles-2"],
    board: [["base/L", 0, 0, 0], ["base/L", 0, 5, 0], ["base/L", 0, 9, 0]],
    hands: [["crop-circles-2/CFR"], ["base/L"], ["base/L"]], pile: ["base/L", "base/L", "base/L"],
    figures: [
      { id: "p2:meeple:0", x: 0, y: 0, feature: "field0" },
      { id: "p1:meeple:0", x: 0, y: 5, feature: "field0" },
      { id: "p3:meeple:0", x: 0, y: 9, feature: "field0" },
    ],
  });
  const r = play(eng, s, place$(1, 0, 0), NOFIG, CONFIRM).state;
  return act(r, expansion("crop-circles-2", "mode", { choice: mode }));
}

describe("Crop Circles II: värden hoppar över en spelare i mitten", () => {
  test("p2 hoppas över, p3 tar bort sin följare och p1 kan bekräfta", () => {
    let r = circle("remove");
    expect(r.turn.actor).toBe("p2");
    r = act(r, skipActorStep());
    expect(r.turn.actor).toBe("p3");
    r = act(r, firstExpansion(r));
    expect(r.turn.phase === "confirm" || actorOf(r) === "p1").toBe(true);
    while (r.turn.phase === "crop-circles-2") r = act(r, firstExpansion(r));
    expect(r.turn.pending.at(-3)).toEqual(skipActorStep());
    // Förut gav omspelningen utan överhoppet error.internal här.
    const c = eng.apply(r, "p1", CONFIRM);
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(at(c.state, "p3:meeple:0")).toBe("supply");
    expect(at(c.state, "p2:meeple:0")).toBe("feature");
    expect(c.state.turn.player).toBe("p2");
  });

  test("steget kan inte göras när ingen väljer", () => {
    const s = scenario(eng, { expansions: ["base", "crop-circles-2"], board: [["base/L", 0, 0, 0]], hands: [["base/L"], []] });
    const r = eng.apply(s, "p1", skipActorStep());
    expect(r.ok).toBe(false);
  });

  test("ångra spärras så långt tillbaka som överhoppet, men inte för den som har tur efteråt", () => {
    let r = circle("remove");
    // Mitt i cirkeln: den som har tur valde läget, ingen annan har gjort något: ångra går.
    expect(eng.canUndo(r)).toBe(true);
    r = act(r, skipActorStep());
    expect(eng.canUndo(r)).toBe(false);
    expect(eng.legalSteps(r).some((x) => x.type === "undo")).toBe(false);
  });
});

describe("den som har tur väljer sist och hoppas över (punkt 2)", () => {
  test("de andras val ligger kvar och turen går vidare till bekräfta", () => {
    let r = circle("remove");
    r = act(r, firstExpansion(r)); // p2
    r = act(r, firstExpansion(r)); // p3
    expect(r.turn.player).toBe("p1");
    // p1 väljer sist (eller så är cirkeln redan klar om p1 inte har något att ta bort)
    expect(r.turn.phase).toBe("crop-circles-2");
    expect(actorOf(r)).toBe("p1");
    r = act(r, skipActorStep());
    expect(r.turn.phase).toBe("confirm");
    expect(at(r, "p2:meeple:0")).toBe("supply");
    expect(at(r, "p3:meeple:0")).toBe("supply");
    expect(at(r, "p1:meeple:0")).toBe("feature");
    const c = eng.apply(r, "p1", CONFIRM);
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    // Omspelningen behåller de andras val.
    expect(at(c.state, "p2:meeple:0")).toBe("supply");
    expect(at(c.state, "p3:meeple:0")).toBe("supply");
  });
});

describe("borttagning som delsteg", () => {
  test("den som väljer tas bort: pjäserna försvinner och turen går vidare, bekräfta fungerar", () => {
    let r = circle("remove");
    expect(r.turn.actor).toBe("p2");
    r = act(r, removePlayerStep("p2"));
    expect(r.players.map((p) => p.id)).toEqual(["p1", "p3"]);
    expect(r.setup.players.map((p) => p.id)).toEqual(["p1", "p3"]);
    expect(r.figures.some((f) => f.owner === "p2")).toBe(false);
    expect(r.turn.actor).toBe("p3");
    while (r.turn.phase === "crop-circles-2") r = act(r, firstExpansion(r));
    const c = eng.apply(r, "p1", CONFIRM);
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    // Omspelningen från ögonblicksbilden tar bort p2 igen, hen kommer inte tillbaka.
    expect(c.state.players.map((p) => p.id)).toEqual(["p1", "p3"]);
    expect(c.state.figures.some((f) => f.owner === "p2")).toBe(false);
    expect(c.state.turn.player).toBe("p3");
  });

  test("en spelare som varken har tur eller väljer tas bort mitt i en tur och kommer inte tillbaka vid bekräfta", () => {
    const s = scenario(eng, {
      n: 3, expansions: ["base"], board: [["base/L", 0, 0, 0]], hands: [["base/L"], ["base/L"], ["base/L"]],
      pile: ["base/L", "base/L", "base/L"],
      figures: [{ id: "p3:meeple:0", x: 0, y: 0, feature: "field0" }],
    });
    let r = play(eng, s, place$(1, 0, 0), NOFIG);
    r = { ...r, state: act(r.state, removePlayerStep("p3")) };
    expect(r.state.players.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(eng.canUndo(r.state)).toBe(false);
    const c = eng.apply(r.state, "p1", CONFIRM);
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.state.players.map((p) => p.id)).toEqual(["p1", "p2"]);
    expect(c.state.figures.some((f) => f.owner === "p3")).toBe(false);
    expect(c.state.turn.player).toBe("p2");
  });

  test("turens spelare kan inte tas bort som delsteg", () => {
    const s = scenario(eng, { n: 3, expansions: ["base"], board: [["base/L", 0, 0, 0]], hands: [["base/L"], [], []] });
    expect(eng.apply(s, "p1", removePlayerStep("p1")).ok).toBe(false);
  });
});

describe("ångra spärras bara så långt tillbaka som någon annans val (punkt 5)", () => {
  test("spärren lyfts inte av ångra och nollställs när turen byter", () => {
    let r = circle("remove");
    r = act(r, firstExpansion(r)); // p2:s val
    expect(eng.canUndo(r)).toBe(false);
    expect(baseExt(r).undoLock).toBe(2);
    while (r.turn.phase === "crop-circles-2") r = act(r, firstExpansion(r));
    const c = eng.apply(r, "p1", CONFIRM);
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(baseExt(c.state).undoLock).toBeUndefined();
  });
});
