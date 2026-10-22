// Handbyggda lägen för poäng- och turtester.

import type { ExpansionId } from "../../src/shared/tiles";
import type { GameEvent, GameState, Step } from "../../src/shared/state";
import type { EngineApi } from "../../src/engine/index";
import { place, putFigure, setupOf } from "./helpers";

export type Rot = 0 | 90 | 180 | 270;

export interface ScenarioOpts {
  /** [brickstyp, x, y, rotation] */
  board: [string, number, number, Rot][];
  /** Brickor på hand per spelare (p1 först). */
  hands?: string[][];
  /** Högen; standard en reservbricka så att spelet inte tar slut. Tom hög = sista draget. */
  pile?: string[];
  figures?: { id: string; x: number; y: number; feature: string }[];
  expansions?: ExpansionId[];
  n?: number;
  handSize?: number;
  variants?: Record<string, string>;
}

/** Ett handbyggt läge: karta, händer, hög och pjäser är satta, p1 har turen. */
export function scenario(eng: EngineApi, o: ScenarioOpts): GameState {
  const s = eng.newGame(
    setupOf(o.expansions ?? ["base", "abbot"], { n: o.n ?? 2, handSize: o.handSize ?? 1, variants: o.variants ?? {} }),
  );
  s.board = {};
  for (const [type, x, y, rotation] of o.board) place(s, type, x, y, rotation);
  s.drawPile = o.pile ?? ["base/L"];
  s.players.forEach((p, i) => (p.hand = [...(o.hands?.[i] ?? [])]));
  for (const f of o.figures ?? []) putFigure(s, f.id, { x: f.x, y: f.y }, f.feature);
  const first = s.players[0]!;
  const n = first.hand.length;
  s.turn = { player: first.id, phase: n > 1 ? "chooseTile" : n === 1 ? "placeTile" : "confirm", pending: [] };
  return s;
}

/** Utför delstegen i tur och ordning för den som har turen; kastar vid fel. */
export function play(eng: EngineApi, s: GameState, ...steps: Step[]): { state: GameState; events: GameEvent[] } {
  let state = s;
  const events: GameEvent[] = [];
  for (const step of steps) {
    const r = eng.apply(state, state.turn.player, step);
    if (!r.ok) throw new Error(`${JSON.stringify(step)} nekades: ${r.error}`);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}

export const score = (s: GameState, id: string) => s.players.find((p) => p.id === id)!.score;
export const inSupply = (s: GameState, id: string) => s.figures.find((f) => f.id === id)!.location.at === "supply";
export const place$ = (x: number, y: number, rotation: Rot): Step => ({ type: "placeTile", pos: { x, y }, rotation });
export const fig$ = (kind: string, x: number, y: number, feature: string): Step => ({
  type: "placeFigure", kind, pos: { x, y }, feature,
});
export const CONFIRM: Step = { type: "confirm" };
export const NOFIG: Step = { type: "noFigure" };
export const reasons = (events: GameEvent[]) =>
  events.filter((e) => e.type === "scored").map((e) => (e.type === "scored" ? `${e.player}:${e.reason}:${e.points}` : ""));
