// Draken när värden hoppar över eller tar bort den som flyttar: draken flyttar alltid sex rutor (s. 56),
// nästa spelare i tur och ordning tar över det överhoppade steget, och överhoppet är ett delsteg i turen.

import { describe, expect, test } from "bun:test";
import type { GameState, Step } from "../../../src/shared/state";
import { actorOf } from "../../../src/engine/index";
import { removePlayerStep, skipActorStep } from "../../../src/engine/host";
import { realEngine } from "../../engine/helpers";
import { CONFIRM, NOFIG, place$, play, scenario, type Rot } from "../../engine/scenario";

const eng = realEngine();

/** En rad av tio vägbrickor; draken står på (1,0) och p1 lägger dragbrickan i änden av raden. */
function lineGame(): GameState {
  const board: [string, number, number, Rot][] = [];
  for (let x = 0; x < 8; x++) board.push(["base/RFr", x, 0, 0]);
  const s = scenario(eng, {
    n: 3, expansions: ["base", "princess-dragon"], board,
    hands: [["princess-dragon/RFr.d"], ["base/L"], ["base/L"]], pile: ["base/L", "base/L", "base/L"],
  });
  s.figures.find((f) => f.id === "dragon:0")!.location = { at: "tile", pos: { x: 1, y: 0 } };
  return play(eng, s, place$(8, 0, 0), NOFIG).state;
}

const act = (s: GameState, step: Step): GameState => {
  const r = eng.apply(s, actorOf(s), step);
  if (!r.ok) throw new Error(`${actorOf(s)} ${JSON.stringify(step)} nekades: ${r.error}`);
  return r.state;
};
/** Draget längst åt höger, så att flytten alltid kan fortsätta. */
const rightMost = (s: GameState): Step => {
  const x = (m: Step) => (m as { data: { pos: { x: number } } }).data.pos.x;
  return eng.legalSteps(s).filter((m) => m.type === "expansion" && m.action === "move").sort((a, b) => x(b) - x(a))[0]!;
};
const dragonX = (s: GameState) => {
  const l = s.figures.find((f) => f.id === "dragon:0")!.location;
  return l.at === "tile" ? l.pos.x : -1;
};
const movesIn = (s: GameState) => s.turn.pending.filter((p) => p.type === "expansion" && p.action === "move").length;

/** Flyttar tills fasen är slut och returnerar tillståndet och vilka som flyttade, i ordning. */
function finishMove(s: GameState): { state: GameState; movers: string[] } {
  const movers: string[] = [];
  for (let i = 0; i < 10 && s.turn.phase === "dragon"; i++) {
    movers.push(actorOf(s));
    s = act(s, rightMost(s));
  }
  return { state: s, movers };
}

describe("draken flyttar sex rutor trots överhopp", () => {
  test("utan ingrepp: p1, p2, p3, p1, p2, p3", () => {
    const { state, movers } = finishMove(lineGame());
    expect(movers).toEqual(["p1", "p2", "p3", "p1", "p2", "p3"]);
    expect(dragonX(state)).toBe(7);
  });

  test("p2 hoppas över: p3 tar över hens steg och draken flyttar ändå sex rutor", () => {
    let s = act(lineGame(), rightMost(lineGame()));
    expect(actorOf(s)).toBe("p2");
    s = act(s, skipActorStep());
    expect(actorOf(s)).toBe("p3");
    const { state, movers } = finishMove(s);
    expect(movers).toEqual(["p3", "p3", "p1", "p2", "p3"]);
    expect(movesIn(state)).toBe(6);
    expect(dragonX(state)).toBe(7);
    expect(state.turn.phase).toBe("confirm");
    // Omspelningen vid bekräfta har med överhoppet: draken hamnar på samma ruta, inget error.internal.
    const c = eng.apply(state, "p1", CONFIRM);
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(dragonX(c.state)).toBe(7);
    expect(c.state.turn.player).toBe("p2");
  });

  test("den som har tur flyttar först och hoppas över: p2 tar över, p1:s senare steg ligger kvar", () => {
    let s = lineGame();
    expect(actorOf(s)).toBe("p1");
    s = act(s, skipActorStep());
    expect(actorOf(s)).toBe("p2");
    const { state, movers } = finishMove(s);
    expect(movers).toEqual(["p2", "p2", "p3", "p1", "p2", "p3"].slice(0, 6));
    expect(movesIn(state)).toBe(6);
    expect(eng.apply(state, "p1", CONFIRM).ok).toBe(true);
  });

  test("p2 tas bort: hens platser tas över av nästa spelare, sex steg och inga fler flyttare med p2", () => {
    let s = act(lineGame(), rightMost(lineGame()));
    s = act(s, removePlayerStep("p2"));
    expect(s.players.map((p) => p.id)).toEqual(["p1", "p3"]);
    const { state, movers } = finishMove(s);
    expect(movers).not.toContain("p2");
    expect(movers.length).toBe(5);
    expect(movesIn(state)).toBe(6);
    expect(dragonX(state)).toBe(7);
    const c = eng.apply(state, "p1", CONFIRM);
    expect(c.ok).toBe(true);
    if (!c.ok) return;
    expect(c.state.players.map((p) => p.id)).toEqual(["p1", "p3"]);
    expect(c.state.turn.player).toBe("p3");
  });

  test("en spelare som varken har tur eller flyttar just nu tas bort: hens senare platser tas över", () => {
    let s = act(lineGame(), rightMost(lineGame()));
    expect(actorOf(s)).toBe("p2");
    s = act(s, removePlayerStep("p3"));
    expect(actorOf(s)).toBe("p2");
    const { state, movers } = finishMove(s);
    expect(movers).not.toContain("p3");
    expect(movesIn(state)).toBe(6);
  });
});

describe("ångra efter drakens flytt (punkt 5)", () => {
  test("spärren följer den sista flytten av en annan spelare, inte hela turen", () => {
    let s = lineGame();
    expect(eng.canUndo(s)).toBe(true); // bara egna steg hittills
    s = act(s, rightMost(s)); // p1
    expect(eng.canUndo(s)).toBe(true);
    s = act(s, rightMost(s)); // p2
    expect(eng.canUndo(s)).toBe(false);
    s = act(s, rightMost(s)); // p3
    s = act(s, rightMost(s)); // p1 igen, efter de andras
    expect(actorOf(s)).toBe("p2");
    s = act(s, rightMost(s));
    s = act(s, rightMost(s));
    expect(s.turn.phase).toBe("confirm");
    expect(eng.canUndo(s)).toBe(false);
  });

  test("efter drakens flytt (variant after) kan den som har tur ångra sina egna senare steg", () => {
    // Variant "after": draken flyttar efter bekräftelsen, och flytten är då hela den följande sekvensen.
    const board: [string, number, number, Rot][] = [];
    for (let x = 0; x < 8; x++) board.push(["base/RFr", x, 0, 0]);
    const s0 = scenario(eng, {
      n: 2, expansions: ["base", "princess-dragon"], board, variants: { "princess-dragon.dragonTiming": "after" },
      hands: [["princess-dragon/RFr.d"], ["base/L"]], pile: ["base/L", "base/L", "base/L"],
    });
    s0.figures.find((f) => f.id === "dragon:0")!.location = { at: "tile", pos: { x: 1, y: 0 } };
    let s = play(eng, s0, place$(8, 0, 0), NOFIG, CONFIRM).state;
    expect(s.turn.phase).toBe("dragon");
    s = act(s, rightMost(s)); // p1
    expect(eng.canUndo(s)).toBe(true);
    s = act(s, rightMost(s)); // p2
    expect(eng.canUndo(s)).toBe(false);
    s = act(s, rightMost(s)); // p1, efter p2:s flytt
    expect(eng.canUndo(s)).toBe(true); // förut: spärrat resten av turen
    const back = eng.apply(s, "p1", { type: "undo" });
    expect(back.ok).toBe(true);
    if (!back.ok) return;
    expect(back.state.turn.pending.length).toBe(s.turn.pending.length - 1);
    expect(eng.canUndo(back.state)).toBe(false); // p2:s flytt går inte att ångra
  });
});
