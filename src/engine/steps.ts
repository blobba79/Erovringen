// Utför ett delsteg på ett (redan klonat) tillstånd. Delstegen verkställs direkt; ångra och
// bekräfta hanteras i engine.ts genom att spela upp delstegen från ögonblicksbilden.

import type { GameEvent, GameState, Step } from "../shared/state";
import { analyze } from "./features";
import type { ExpansionModule } from "../shared/expansion";
import { activeModules, engineHook, makeCtx, playerOf, type EngineHookContext, type Env } from "./context";
import { applyHostStep } from "./host";
import { exchangeAllowed, figureSteps } from "./legal";
import { hasAnyPlacement, isLegalPlacement } from "./placement";
import { addScore, adjustedPoints, areaValue, notifyAreaScored, returnToSupply } from "./scoring";
import { chosenIndex, phaseForHand } from "./turnstate";
import { baseExt } from "./context";
import { posKey } from "./geometry";

/** Returnerar en feltext-nyckel, eller null om steget lyckades. */
export function applyCore(env: Env, state: GameState, step: Step, events: GameEvent[]): string | null {
  const turn = state.turn;
  const player = turn.player;
  const hand = playerOf(state, player).hand;
  const ctx = makeCtx(env, state, player, events);
  const mods = activeModules(env, state.setup);
  switch (step.type) {
    case "chooseTile": {
      if (turn.phase !== "chooseTile") return "error.illegalStep";
      const t = hand[step.handIndex];
      if (t === undefined) return "error.invalidTile";
      if (!hasAnyPlacement(env, state, player, t)) return "error.noPlacement";
      turn.pending.push(step);
      turn.phase = "placeTile";
      return null;
    }
    case "exchangeTile": {
      if (!exchangeAllowed(env, state)) return "error.exchangeNotAllowed";
      const old = hand[step.handIndex];
      if (old === undefined) return "error.invalidTile";
      baseExt(state).discarded.push(old);
      let custom: { tile?: string } | undefined;
      for (const m of mods) {
        custom = engineHook(m, "exchangeDraw")?.(ctx);
        if (custom) break;
      }
      const fresh = custom ? custom.tile : state.drawPile.shift();
      if (fresh !== undefined) {
        hand[step.handIndex] = fresh;
        events.push({ type: "tileDrawn", player });
      } else hand.splice(step.handIndex, 1);
      turn.pending.push(step);
      turn.phase = phaseForHand(hand.length);
      return null;
    }
    case "placeTile": {
      if (turn.phase !== "placeTile") return "error.illegalStep";
      const idx = chosenIndex(state);
      const tile = idx === null ? undefined : hand[idx];
      if (idx === null || tile === undefined) return "error.illegalStep";
      if (!isLegalPlacement(env, state, player, tile, step.pos, step.rotation)) return "error.illegalPlacement";
      hand.splice(idx, 1);
      const placed = { type: tile, pos: { ...step.pos }, rotation: step.rotation };
      state.board[posKey(step.pos)] = placed;
      events.push({ type: "tilePlaced", tile: placed, player });
      turn.pending.push(step);
      turn.phase = "placeFigure";
      for (const m of mods) m.hooks.afterTilePlaced?.(ctx, step.pos);
      return null;
    }
    case "placeFigure": {
      if (turn.phase !== "placeFigure") return "error.illegalStep";
      const ok = figureSteps(env, state).find(
        (s) => s.type === "placeFigure" && s.kind === step.kind && s.feature === step.feature &&
          s.pos.x === step.pos.x && s.pos.y === step.pos.y,
      );
      if (!ok) return explainFigureError(env, state, step);
      const fig = state.figures.find((f) => f.kind === step.kind && f.owner === player && f.location.at === "supply")!;
      fig.location = { at: "feature", pos: { ...step.pos }, feature: step.feature };
      events.push({ type: "figurePlaced", figure: fig.id, location: fig.location });
      turn.pending.push(step);
      turn.phase = phaseAfterFigure(ctx, mods);
      return null;
    }
    case "noFigure":
      if (turn.phase !== "placeFigure") return "error.illegalStep";
      turn.pending.push(step);
      turn.phase = phaseAfterFigure(ctx, mods);
      return null;
    case "returnFigure": {
      if (turn.phase !== "placeFigure") return "error.illegalStep";
      const offered = mods.some((m) =>
        m.hooks.extraSteps?.(ctx, "placeFigure").some((s) => s.type === "returnFigure" && s.figure === step.figure),
      );
      const fig = state.figures.find((f) => f.id === step.figure);
      if (!offered || !fig || fig.location.at !== "feature") return "error.illegalFigure";
      const an = analyze(state.board, state.figures, env.types);
      const area = an.areaAt(fig.location.pos, fig.location.feature);
      if (area) {
        notifyAreaScored(ctx, area, false); // fen ger 3 poäng även när abboten tas hem (s. 54)
        addScore(ctx, player, adjustedPoints(ctx, area, areaValue(an, area), false), "return", area);
      }
      returnToSupply(ctx, fig);
      turn.pending.push(step);
      turn.phase = phaseAfterFigure(ctx, mods);
      return null;
    }
    case "expansion": {
      if (step.expansion === "base") return applyHostStep(env, state, step, events);
      const m = mods.find((x) => x.id === step.expansion);
      if (!m?.hooks.applyStep) return "error.illegalStep";
      const err = m.hooks.applyStep(ctx, step);
      if (err) return err;
      turn.pending.push(step);
      return null;
    }
    default:
      return "error.illegalStep";
  }
}

/** Fasen efter pjässteget: en modul (färjorna) kan lägga en egen fas före "confirm". */
export function phaseAfterFigure(ctx: EngineHookContext, mods: ExpansionModule[]): string {
  for (const m of mods) {
    const phase = engineHook(m, "afterFigureStep")?.(ctx);
    if (phase !== undefined) return phase;
  }
  return "confirm";
}

function explainFigureError(env: Env, state: GameState, step: Extract<Step, { type: "placeFigure" }>): string {
  const player = state.turn.player;
  const defs = activeModules(env, state.setup).flatMap((m) => m.figures);
  const def = defs.find((d) => d.kind === step.kind && !d.neutral);
  if (!def) return "error.illegalFigure";
  if (!state.figures.some((f) => f.kind === step.kind && f.owner === player && f.location.at === "supply"))
    return "error.noFigureLeft";
  const an = analyze(state.board, state.figures, env.types);
  const area = an.areaAt(step.pos, step.feature);
  if (!area || !def.placeableOn.includes(area.kind)) return "error.illegalFigure";
  return area.figures.some((f) => f.owner !== null) ? "error.featureOccupied" : "error.illegalFigure";
}
