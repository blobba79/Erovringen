// Hjälpfunktioner för turens läge: vilken bricka som ska läggas och var den lades.

import type { GameState, Step } from "../shared/state";
import { playerOf } from "./context";

type PlaceStep = Extract<Step, { type: "placeTile" }>;

/** Turens fas när handen ser ut så här. */
export function phaseForHand(handLength: number): string {
  return handLength === 0 ? "confirm" : handLength === 1 ? "placeTile" : "chooseTile";
}

/** Indexet i handen för brickan som ska läggas, eller null om den ännu inte valts. */
export function chosenIndex(state: GameState): number | null {
  const c = state.turn.pending.find((s) => s.type === "chooseTile");
  if (c && c.type === "chooseTile") return c.handIndex;
  return playerOf(state, state.turn.player).hand.length === 1 ? 0 : null;
}

/** Brickstypen som ska läggas just nu. */
export function currentTile(state: GameState): string | undefined {
  const i = chosenIndex(state);
  return i === null ? undefined : playerOf(state, state.turn.player).hand[i];
}

/** Turens placering av bricka, om den gjorts. */
export function placedStep(state: GameState): PlaceStep | undefined {
  return state.turn.pending.find((s): s is PlaceStep => s.type === "placeTile");
}
