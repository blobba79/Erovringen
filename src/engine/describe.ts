// Beskrivning av ett område för markering på storskärmen: utbredning, pjäser, majoritet, värde just nu
// och vad som återstår för att det ska bli klart.

import type { Edge } from "../shared/tiles";
import type { Figure, GameState, PlayerId, Pos } from "../shared/state";
import type { FeatureRef } from "../shared/expansion";
import { analyze, type Analysis, type Area } from "./features";
import type { TileTypes } from "./board";
import { areaValue, completedCitiesAround, majorityOwners } from "./scoring";

export interface AreaDescription {
  kind: string;
  /** Alla delar av området (bricka + områdes-id). */
  nodes: FeatureRef[];
  tiles: Pos[];
  complete: boolean;
  figures: Figure[];
  /** Spelare som har majoritet just nu (tom om ingen pjäs står där). */
  owners: PlayerId[];
  /** Vad området ger om det räknades nu (slutpoängen för ofärdiga områden). */
  value: number;
  /**
   * Fält: vad varje ägare med majoritet får (4 per färdig stad för den som har en gris, annars 3). `value` är
   * detsamma om alla får lika mycket, annars grundvärdet. Tom för andra områden.
   */
  valueByOwner: Record<PlayerId, number>;
  /** Stad/väg: öppna kanter. */
  openEdges: { pos: Pos; edge: Edge }[];
  /** Kloster/trädgård: de tomma rutorna av de åtta omkring, och hur många som är fyllda. */
  openSquares: Pos[];
  filledSquares: number;
  /** Fält: antal färdiga städer det gränsar till, och städernas delar. */
  completedCities: number;
  adjacentCities: FeatureRef[];
}

/**
 * Fält: vad varje ägare med majoritet får om området räknades nu. Den som har en gris (Traders & Builders)
 * får 4 per färdig stad i stället för 3 (grisens påslag är 1 per stad). Tom för andra områden.
 */
function fieldValues(an: Analysis, area: Area, owners: PlayerId[]): Record<PlayerId, number> {
  if (area.kind !== "field") return {};
  const cities = completedCitiesAround(an, area);
  const out: Record<PlayerId, number> = {};
  for (const o of owners) {
    const pig = area.figures.some((f) => f.kind === "pig" && f.owner === o);
    out[o] = (pig ? 4 : 3) * cities;
  }
  return out;
}

export function describeArea(an: Analysis, area: Area): AreaDescription {
  const owners = majorityOwners(area);
  const byOwner = fieldValues(an, area, owners);
  const amounts = Object.values(byOwner);
  // Ett fält ger olika mycket om bara en av ägarna har en gris: `value` är då grundvärdet (3 per stad).
  const value = amounts.length > 0 && amounts.every((v) => v === amounts[0]) ? (amounts[0] as number) : areaValue(an, area);
  return {
    kind: area.kind,
    nodes: area.nodes,
    tiles: area.tiles,
    complete: area.complete,
    figures: area.figures,
    owners,
    value,
    valueByOwner: byOwner,
    openEdges: area.openEdges,
    openSquares: area.openSquares,
    filledSquares: area.kind === "cloister" || area.kind === "garden" ? 8 - area.openSquares.length : 0,
    completedCities: area.kind === "field" ? completedCitiesAround(an, area) : 0,
    adjacentCities: area.adjacentCities.map((id) => an.areas[id]!.nodes[0]!),
  };
}

/** Området som en viss del av en bricka hör till, eller undefined. */
export function describeFeature(
  state: GameState, types: TileTypes, pos: Pos, feature: string,
): AreaDescription | undefined {
  const an = analyze(state.board, state.figures, types);
  const area = an.areaAt(pos, feature);
  return area ? describeArea(an, area) : undefined;
}
