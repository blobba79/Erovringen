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
  /** Stad/väg: öppna kanter. */
  openEdges: { pos: Pos; edge: Edge }[];
  /** Kloster/trädgård: de tomma rutorna av de åtta omkring, och hur många som är fyllda. */
  openSquares: Pos[];
  filledSquares: number;
  /** Fält: antal färdiga städer det gränsar till, och städernas delar. */
  completedCities: number;
  adjacentCities: FeatureRef[];
}

export function describeArea(an: Analysis, area: Area): AreaDescription {
  return {
    kind: area.kind,
    nodes: area.nodes,
    tiles: area.tiles,
    complete: area.complete,
    figures: area.figures,
    owners: majorityOwners(area),
    value: areaValue(an, area),
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
