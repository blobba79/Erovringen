// Expansionernas egna faser efter att brickan lagts (guld, magikern, färjan …). Flera moduler kan
// vilja ha en egen fas samma tur: de körs i tur och ordning, och sist kommer "placeFigure".

import type { GameState } from "../shared/state";
import { baseExt } from "./context";

/** Gå in i en egen fas nu, eller ställ den i kö om en annan modul redan har en fas igång. */
export function enterPhase(state: GameState, phase: string): void {
  if (state.turn.phase === "placeFigure") state.turn.phase = phase;
  else (baseExt(state).phaseQueue ??= []).push(phase);
}

/** Den egna fasen är klar: nästa fas i kön, annars "placeFigure". */
export function leavePhase(state: GameState): void {
  state.turn.phase = baseExt(state).phaseQueue?.shift() ?? "placeFigure";
}
