// Nytt spel: hög, startbricka, pjäser, startspelare, expansionernas uppsättning och första handen.

import type { Figure, GameSetup, GameState } from "../shared/state";
import { activeModules, makeCtx, type Env } from "./context";
import { randomInt, shuffle } from "./rng";
import { beginTurn } from "./turn";

export const STATE_VERSION = 1;

export function newGame(env: Env, setup: GameSetup): GameState {
  if (setup.players.length < 1) throw new Error("minst en spelare krävs");
  const mods = activeModules(env, setup);
  for (const m of mods)
    for (const r of m.requires ?? [])
      if (!mods.some((x) => x.id === r)) throw new Error(`${m.id} kräver ${r}`);
  const state: GameState = {
    version: STATE_VERSION,
    setup: structuredClone(setup),
    rng: setup.seed >>> 0,
    board: {},
    drawPile: [],
    players: setup.players.map((p) => ({ ...p, score: 0, hand: [], counters: {} })),
    figures: [],
    turn: { player: "", phase: "", pending: [] },
    ext: { base: { discarded: [] } },
    finished: false,
  };
  state.setup.handSize = Math.max(1, setup.handSize || 1);

  // Hög och startbricka. Varje mängd med startbricka lämnar en; den sista (floden) läggs ut och
  // de övriga (grundspelets) blandas in i högen, där en modul kan flytta dem.
  const starts: string[] = [];
  for (const m of mods)
    for (const set of m.tileSets) {
      for (const t of set.tiles) for (let i = 0; i < t.count; i++) state.drawPile.push(t.type);
      if (set.start) {
        const i = state.drawPile.indexOf(set.start);
        if (i >= 0) state.drawPile.splice(i, 1);
        starts.push(set.start);
      }
    }
  const origin = starts.pop();
  if (origin === undefined) throw new Error("ingen startbricka");
  state.drawPile.push(...starts);
  shuffle(state, state.drawPile);
  state.board["0,0"] = { type: origin, pos: { x: 0, y: 0 }, rotation: 0 };

  // Pjäser.
  for (const m of mods)
    for (const def of m.figures) {
      if (def.neutral) {
        for (let i = 0; i < def.count; i++) state.figures.push(newFigure(`${def.kind}:${i}`, def.kind, null));
      } else
        for (const p of state.players)
          for (let i = 0; i < def.count; i++) state.figures.push(newFigure(`${p.id}:${def.kind}:${i}`, def.kind, p.id));
    }

  const startIdx = randomInt(state, state.players.length);
  const first = state.players[startIdx]!.id;
  state.turn = { player: first, phase: "", pending: [] };
  const ctx = makeCtx(env, state, first, []);
  for (const m of mods) m.hooks.setup?.(ctx);

  // Dela ut händerna, startspelaren först, så att brickorna spelas i högens ordning.
  for (let round = 0; round < state.setup.handSize; round++)
    for (let k = 0; k < state.players.length; k++) {
      const p = state.players[(startIdx + k) % state.players.length]!;
      if (state.drawPile.length) p.hand.push(state.drawPile.shift() as string);
    }
  beginTurn(state, first, []);
  return state;
}

function newFigure(id: string, kind: string, owner: string | null): Figure {
  return { id, kind, owner, location: { at: "supply" } };
}
