// Var en bricka får läggas: kantmatchning plus expansionernas begränsningar (canPlaceTile).

import type { Rotation } from "../shared/tiles";
import type { GameState, PlayerId, Pos, Step } from "../shared/state";
import { fitsGeometry, frontier, getType } from "./board";
import { activeModules, makeCtx, type EngineHookContext, type Env } from "./context";
import { ROTATIONS } from "./geometry";
import { distinctRotations, rotateTile } from "./tileinfo";

/** Sammanhang för kontroll av en viss bricka (`tile` = brickstypens id). */
export function placementCtx(env: Env, state: GameState, player: PlayerId, tile: string): EngineHookContext {
  return { ...makeCtx(env, state, player, []), tile };
}

export function isLegalPlacement(
  env: Env, state: GameState, player: PlayerId, tileId: string, pos: Pos, rotation: Rotation,
): boolean {
  const type = getType(env.types, tileId);
  if (!fitsGeometry(state.board, env.types, rotateTile(type, rotation), pos)) return false;
  const step: Extract<Step, { type: "placeTile" }> = { type: "placeTile", pos, rotation };
  const ctx = placementCtx(env, state, player, tileId);
  return activeModules(env, state.setup).every((m) => !m.hooks.canPlaceTile || m.hooks.canPlaceTile(ctx, pos, step));
}

/**
 * Alla tillåtna (plats, rotation) för en brickstyp. Med `distinct` hoppas rotationer över som ger
 * samma bricka (symmetri). Platserna kommer i fast ordning (vänster till höger, uppifrån och ner).
 */
export function legalPlacements(
  env: Env, state: GameState, player: PlayerId, tileId: string, distinct = true,
): { pos: Pos; rotation: Rotation }[] {
  const type = getType(env.types, tileId);
  const rotations = distinct ? distinctRotations(type) : ROTATIONS;
  const out: { pos: Pos; rotation: Rotation }[] = [];
  for (const pos of frontier(state.board))
    for (const rotation of rotations) if (isLegalPlacement(env, state, player, tileId, pos, rotation)) out.push({ pos, rotation });
  return out;
}

export function hasAnyPlacement(env: Env, state: GameState, player: PlayerId, tileId: string): boolean {
  const type = getType(env.types, tileId);
  for (const pos of frontier(state.board))
    for (const rotation of distinctRotations(type)) if (isLegalPlacement(env, state, player, tileId, pos, rotation)) return true;
  return false;
}
