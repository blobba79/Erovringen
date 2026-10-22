// Varningar för nybörjare om den aktiva spelarens väntande delsteg (fas 3).
import type { GameState, PlayerId } from "../shared/state";
import type { Warning } from "../shared/messages";

/** Varningar för `state.turn.pending`. Tom lista om inget är värt att varna för. */
export function stepWarnings(_state: GameState, _player: PlayerId): Warning[] {
  return [];
}
