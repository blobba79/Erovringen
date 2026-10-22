// Poäng för områden: värde, majoritet, utdelning under spelet och vid slutet.

import type { FeatureRef } from "../shared/expansion";
import type { Figure, PlayerId } from "../shared/state";
import type { EngineHookContext } from "./context";
import { activeModules, playerOf } from "./context";
import type { Analysis, Area } from "./features";

/** Pjäsernas vikt vid majoritet. Standard 1; stora pjäser räknas som två. */
const STRENGTH: Record<string, number> = { "large-meeple": 2 };

export function strength(f: Figure): number {
  if (f.owner === null) return 0;
  return STRENGTH[f.kind] ?? 1;
}

/** Spelare med flest pjäser på området (lika = alla). Tom om ingen står där. */
export function majorityOwners(area: Area): PlayerId[] {
  const sums = new Map<PlayerId, number>();
  for (const f of area.figures) if (f.owner !== null) sums.set(f.owner, (sums.get(f.owner) ?? 0) + strength(f));
  let best = 0;
  for (const v of sums.values()) best = Math.max(best, v);
  if (best === 0) return [];
  return [...sums].filter(([, v]) => v === best).map(([p]) => p);
}

/** Antal färdiga städer som fältet gränsar till. */
export function completedCitiesAround(an: Analysis, field: Area): number {
  return field.adjacentCities.filter((id) => an.areas[id]?.complete).length;
}

/**
 * Områdets värde om det räknades nu: färdig stad 2 per bricka och sköld, ofärdig 1 (slutpoängen).
 * Fält: 3 per färdig stad. Områden utan poängregel (flod, okända sorter): 0.
 */
export function areaValue(an: Analysis, area: Area): number {
  switch (area.kind) {
    case "city":
      return (area.tiles.length + area.pennants) * (area.complete ? 2 : 1);
    case "road":
      return area.tiles.length;
    case "cloister":
    case "garden":
      return 9 - area.openSquares.length;
    case "field":
      return 3 * completedCitiesAround(an, area);
    default:
      return 0;
  }
}

export function adjustedPoints(ctx: EngineHookContext, area: Area, points: number, final: boolean): number {
  const ref: FeatureRef = area.nodes[0] as FeatureRef;
  for (const m of activeModules(ctx.env, ctx.state.setup)) {
    if (m.hooks.scoreFeature) points = m.hooks.scoreFeature(ctx, ref, points, final);
  }
  return points;
}

export function addScore(ctx: EngineHookContext, player: PlayerId, points: number, reason: string, area: Area): void {
  if (points <= 0) return;
  playerOf(ctx.state, player).score += points;
  const ref = area.nodes[0] as FeatureRef;
  ctx.emit({ type: "scored", player, points, reason, pos: ref.pos, feature: ref.feature });
}

export function returnToSupply(ctx: EngineHookContext, f: Figure): void {
  const real = ctx.state.figures.find((x) => x.id === f.id)!;
  real.location = { at: "supply" };
  ctx.emit({ type: "figureReturned", figure: f.id });
}

/** Poäng för färdiga områden under spelet: ägarna får poäng och pjäserna (utom fältpjäserna) går hem. */
export function scoreCompleted(ctx: EngineHookContext, an: Analysis, areas: Area[]): void {
  for (const area of areas) {
    if (!area.complete || area.kind === "river") continue;
    const ref = area.nodes[0] as FeatureRef;
    ctx.emit({ type: "featureCompleted", pos: ref.pos, feature: ref.feature });
    const owners = majorityOwners(area);
    if (owners.length) {
      const pts = adjustedPoints(ctx, area, areaValue(an, area), false);
      for (const o of owners) addScore(ctx, o, pts, area.kind, area);
    }
    for (const f of area.figures) if (f.owner !== null) returnToSupply(ctx, f);
  }
}

/** Slutpoäng: ofärdiga städer, vägar och kloster (1 per bricka), sedan fälten (3 per färdig stad). */
export function scoreFinal(ctx: EngineHookContext, an: Analysis): void {
  for (const area of an.areas) {
    if (area.kind === "river" || area.figures.length === 0) continue;
    const owners = majorityOwners(area);
    if (!owners.length) continue;
    const pts = adjustedPoints(ctx, area, areaValue(an, area), true);
    for (const o of owners) addScore(ctx, o, pts, `final.${area.kind === "field" ? "farm" : area.kind}`, area);
  }
}
