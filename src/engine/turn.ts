// Turens början och slut: poängräkning, påfyllning av handen, nästa spelare och spelets slut.

import type { GameEvent, GameState, PlayerId } from "../shared/state";
import { analyze, type Area } from "./features";
import { activeModules, baseExt, engineHook, makeCtx, playerOf, type Env } from "./context";
import { shuffle } from "./rng";
import { scoreCompleted, scoreFinal } from "./scoring";
import { phaseForHand, placedStep } from "./turnstate";

export function beginTurn(env: Env, state: GameState, player: PlayerId, events: GameEvent[], extra = false): void {
  state.turn = { player, phase: phaseForHand(playerOf(state, player).hand.length), pending: [] };
  delete baseExt(state).undoLock;
  events.push({ type: "turnStarted", player });
  // Moduler som vill göra något när en tur börjar (fens poäng). `extra`: byggmästarens extra tur.
  const ctx = makeCtx(env, state, player, events);
  for (const m of activeModules(env, state.setup)) engineHook(m, "turnStarted")?.(ctx, extra);
}

/** Fyll handen från högen upp till handstorleken. */
export function refillHand(state: GameState, player: PlayerId, events: GameEvent[]): void {
  const p = playerOf(state, player);
  while (p.hand.length < state.setup.handSize && state.drawPile.length > 0) {
    p.hand.push(state.drawPile.shift() as string);
    events.push({ type: "tileDrawn", player });
  }
}

/** Nästa spelare (i sittordning) som har brickor på hand; null om ingen har det. */
function nextPlayerWithTiles(state: GameState, from: PlayerId): PlayerId | null {
  const i = state.players.findIndex((p) => p.id === from);
  for (let k = 1; k <= state.players.length; k++) {
    const p = state.players[(i + k) % state.players.length]!;
    if (p.hand.length > 0) return p.id;
  }
  return null;
}

function nearPlaced(a: Area, pos: { x: number; y: number }): boolean {
  if (a.kind === "cloister" || a.kind === "garden")
    return a.nodes.some((n) => Math.abs(n.pos.x - pos.x) <= 1 && Math.abs(n.pos.y - pos.y) <= 1);
  return a.tiles.some((t) => t.x === pos.x && t.y === pos.y);
}

export function endGame(env: Env, state: GameState, events: GameEvent[]): void {
  const ctx = makeCtx(env, state, state.turn.player, events);
  scoreFinal(ctx, analyze(state.board, state.figures, env.types));
  for (const m of activeModules(env, state.setup)) m.hooks.finalScoring?.(ctx);
  state.finished = true;
  state.turn = { player: state.turn.player, phase: "finished", pending: [] };
  events.push({ type: "gameEnded" });
}

/**
 * Lägg tillbaka brickor i högen (en borttagen eller överhoppad spelares hand). En modul som styr
 * utdelningen (floden) får lägga tillbaka dem själv. Annars läggs de sist och högen blandas, men
 * bara om `always` är sant. Returnerar true om brickorna lades tillbaka.
 */
export function returnTiles(env: Env, state: GameState, tiles: string[], always = true): boolean {
  if (tiles.length === 0) return true;
  const ctx = makeCtx(env, state, state.turn.player, []);
  if (activeModules(env, state.setup).some((m) => engineHook(m, "returnTiles")?.(ctx, tiles))) return true;
  if (!always) return false;
  state.drawPile.push(...tiles);
  shuffle(state, state.drawPile);
  return true;
}

/** "Bekräfta drag": räkna poäng för det som brickan avslutade, fyll på handen och gå vidare. */
export function finishTurn(env: Env, state: GameState, events: GameEvent[]): void {
  const player = state.turn.player;
  const ctx = makeCtx(env, state, player, events);
  const placed = placedStep(state);
  if (placed) {
    const an = analyze(state.board, state.figures, env.types);
    // Moduler (färjorna) kan ange fler rutor där färdiga områden ska räknas.
    const around = [placed.pos, ...activeModules(env, state.setup).flatMap((m) => engineHook(m, "scoreAround")?.(ctx) ?? [])];
    scoreCompleted(ctx, an, an.areas.filter((a) => a.complete && around.some((p) => nearPlaced(a, p))));
  }
  delete baseExt(state).snapshot;
  delete baseExt(state).undoLock;
  state.turn.pending = [];
  // Alla moduler tillfrågas (de nollställer sina egna flaggor, och Gold Mines delar ut guld), inte bara
  // fram till första ja. Sker före en eventuell fas efter poängräkningen; resultatet sparas till turens slut.
  const ext = baseExt(state);
  const again = activeModules(env, state.setup).map((m) => m.hooks.extraTurn?.(ctx) ?? false).some(Boolean) || ext.extraTurnPending === true;
  delete ext.extraTurnPending;
  // En modul (Crop Circles II) kan lägga en fas efter poängräkningen; turen avslutas när den är klar.
  for (const m of activeModules(env, state.setup)) {
    const phase = engineHook(m, "afterScoring")?.(ctx);
    if (phase === undefined) continue;
    if (again) ext.extraTurnPending = true;
    state.turn.phase = phase;
    return;
  }
  for (const m of activeModules(env, state.setup)) {
    const handled = engineHook(m, "dealAfterTurn")?.(ctx, again);
    if (handled === undefined) continue;
    if (handled === null) endGame(env, state, events);
    else beginTurn(env, state, handled, events, again && handled === player);
    return;
  }
  refillHand(state, player, events);
  const next = again && playerOf(state, player).hand.length > 0 ? player : nextPlayerWithTiles(state, player);
  if (next === null) endGame(env, state, events);
  else beginTurn(env, state, next, events, again && next === player);
}
