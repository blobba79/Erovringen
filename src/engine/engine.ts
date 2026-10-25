// Fabriken som sätter ihop motorn: createEngine(moduler, brickor) -> Engine.

import type { ExpansionModule } from "../shared/expansion";
import type { TileType } from "../shared/tiles";
import type {
  ApplyResult, Engine, GameEvent, GameSetup, GameState, PlayerId, Pos, Step,
} from "../shared/state";
import { toTileTypes, type TileTypes } from "./board";
import { baseModule } from "./base-module";
import { actorOf, baseExt, engineHook, type Env } from "./context";
import { isHostStep } from "./host";
import { analyze, registerEdgeLinks, type Analysis } from "./features";
import { legalSteps, undoAllowed } from "./legal";
import { legalPlacements } from "./placement";
import { newGame } from "./setup";
import { applyCore } from "./steps";
import { finishTurn } from "./turn";

export interface EngineApi extends Engine {
  readonly env: Env;
  readonly types: TileTypes;
  /** Områden på kartan (för markering, förhandsvisning och poäng just nu). */
  analyze(state: GameState): Analysis;
  /** Tillåtna (plats, rotation) för en brickstyp för spelaren vars tur det är. */
  /** Får spelaren som har tur ångra just nu (även när en annan spelare väljer)? */
  canUndo(state: GameState): boolean;
  placementsFor(state: GameState, tileId: string): { pos: Pos; rotation: 0 | 90 | 180 | 270 }[];
  /**
   * Som `apply`, men för provspelning (datorspelaren): "confirm" avslutar turen direkt på en kopia av
   * tillståndet i stället för att spela om hela turen, och ger inga händelser. Samma nya tillstånd som `apply`.
   */
  simulate(state: GameState, player: PlayerId, step: Step): ApplyResult;
}

const fail = (error: string): ApplyResult => ({ ok: false, error });

function clone<T>(x: T): T {
  return structuredClone(x);
}

/** Spela upp delstegen från en ögonblicksbild (ångra och bekräfta). */
function replay(env: Env, snapshot: GameState, steps: Step[], events: GameEvent[]): GameState {
  const s = clone(snapshot);
  if (steps.length > 0) baseExt(s).snapshot = clone(snapshot);
  for (const step of steps) {
    const err = applyCore(env, s, step, events);
    if (err) throw new Error(`omspelning misslyckades: ${err}`);
  }
  return s;
}

export function createEngine(
  modules: ExpansionModule[],
  tileTypes: Iterable<TileType> | Map<string, TileType>,
): EngineApi {
  const ordered = [...modules].sort((a, b) => (a.id === "base" ? -1 : b.id === "base" ? 1 : 0));
  if (!ordered.some((m) => m.id === "base")) ordered.unshift(baseModule);
  const env: Env = { modules: ordered, types: toTileTypes(tileTypes) };
  for (const m of ordered) registerEdgeLinks(engineHook(m, "edgeLinks"));

  function apply(state: GameState, player: PlayerId, step: Step): ApplyResult {
    if (state.finished) return fail("error.gameFinished");
    const events: GameEvent[] = [];
    const pending = state.turn.pending;
    // Delstegen görs av `actor` om den är satt; ångra hör alltid till spelaren som har tur.
    if (step.type === "undo" ? player !== state.turn.player : player !== actorOf(state)) return fail("error.notYourTurn");
    if (step.type === "undo") {
      if (!undoAllowed(env, state)) return fail("error.nothingToUndo");
      const snap = baseExt(state).snapshot;
      if (pending.length === 0 || !snap) return fail("error.nothingToUndo");
      const lock = baseExt(state).undoLock;
      const back = replay(env, snap, pending.slice(0, -1), events);
      if (lock !== undefined) baseExt(back).undoLock = lock; // spärren gäller även efter ångra
      return { ok: true, state: back, events };
    }
    if (step.type === "confirm") {
      if (state.turn.phase !== "confirm") return fail("error.illegalStep");
      const snap = baseExt(state).snapshot;
      // Spela om turen för att få med alla händelser (bricka, pjäs, poäng) i en följd.
      const s = snap ? replay(env, snap, pending, events) : clone(state);
      finishTurn(env, s, events);
      return { ok: true, state: s, events };
    }
    const s = clone(state);
    if (pending.length === 0) {
      const snap = clone(state);
      delete baseExt(snap).snapshot;
      baseExt(s).snapshot = snap;
    }
    const err = applyCore(env, s, step, events);
    if (err) return fail(err);
    // En annan spelares val och värdens ingrepp kan inte ångras av den som har tur.
    if (player !== s.turn.player || isHostStep(step)) baseExt(s).undoLock = s.turn.pending.length;
    return { ok: true, state: s, events };
  }

  function simulate(state: GameState, player: PlayerId, step: Step): ApplyResult {
    if (step.type !== "confirm") return apply(state, player, step);
    if (state.finished) return fail("error.gameFinished");
    if (player !== actorOf(state)) return fail("error.notYourTurn");
    if (state.turn.phase !== "confirm") return fail("error.illegalStep");
    const s = clone(state);
    finishTurn(env, s, []);
    return { ok: true, state: s, events: [] };
  }

  return {
    env,
    types: env.types,
    simulate,
    newGame: (setup: GameSetup) => newGame(env, setup),
    legalSteps: (state) => legalSteps(env, state),
    apply,
    canUndo: (state) => !state.finished && undoAllowed(env, state),
    analyze: (state) => analyze(state.board, state.figures, env.types),
    placementsFor: (state, tileId) => legalPlacements(env, state, state.turn.player, tileId),
  };
}
