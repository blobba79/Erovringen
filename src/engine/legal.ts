// Tillåtna delsteg just nu.

import type { GameState, Step } from "../shared/state";
import { analyze } from "./features";
import { rotatedAt } from "./board";
import { activeModules, makeCtx, playerOf, type Env } from "./context";
import { hasAnyPlacement, legalPlacements } from "./placement";
import { currentTile, placedStep } from "./turnstate";

export function exchangeAllowed(env: Env, state: GameState): boolean {
  const { turn } = state;
  if (turn.phase !== "chooseTile" && turn.phase !== "placeTile") return false;
  if (turn.pending.some((s) => s.type === "chooseTile")) return false;
  const hand = playerOf(state, turn.player).hand;
  return hand.length > 0 && !hand.some((t) => hasAnyPlacement(env, state, turn.player, t));
}

/** Pjäser som får ställas på brickan som just lagts. */
export function figureSteps(env: Env, state: GameState): Step[] {
  const placed = placedStep(state);
  if (!placed) return [];
  const player = state.turn.player;
  const rt = rotatedAt(state.board, env.types, placed.pos);
  if (!rt) return [];
  const an = analyze(state.board, state.figures, env.types);
  const out: Step[] = [];
  const seen = new Set<string>();
  for (const m of activeModules(env, state.setup)) {
    for (const def of m.figures) {
      if (def.neutral || seen.has(def.kind)) continue;
      seen.add(def.kind);
      if (!state.figures.some((f) => f.kind === def.kind && f.owner === player && f.location.at === "supply")) continue;
      for (const feature of rt.features) {
        if (!def.placeableOn.includes(feature.kind)) continue;
        if ((an.areaAt(placed.pos, feature.id)?.figures.length ?? 0) > 0) continue;
        out.push({ type: "placeFigure", kind: def.kind, pos: placed.pos, feature: feature.id });
      }
    }
  }
  return out;
}

export function legalSteps(env: Env, state: GameState): Step[] {
  if (state.finished) return [];
  const { turn } = state;
  const player = turn.player;
  const hand = playerOf(state, player).hand;
  const out: Step[] = [];
  switch (turn.phase) {
    case "chooseTile":
    case "placeTile": {
      if (exchangeAllowed(env, state)) {
        hand.forEach((_, handIndex) => out.push({ type: "exchangeTile", handIndex }));
      } else if (turn.phase === "chooseTile") {
        hand.forEach((t, handIndex) => {
          if (hasAnyPlacement(env, state, player, t)) out.push({ type: "chooseTile", handIndex });
        });
      } else {
        const tile = currentTile(state);
        if (tile) for (const p of legalPlacements(env, state, player, tile)) out.push({ type: "placeTile", ...p });
      }
      break;
    }
    case "placeFigure":
      out.push(...figureSteps(env, state), { type: "noFigure" });
      break;
    case "confirm":
      out.push({ type: "confirm" });
      break;
  }
  const ctx = makeCtx(env, state, player, []);
  for (const m of activeModules(env, state.setup)) if (m.hooks.extraSteps) out.push(...m.hooks.extraSteps(ctx, turn.phase));
  if (turn.pending.length > 0) out.push({ type: "undo" });
  return out;
}
