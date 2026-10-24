// Gemensamma hjälpmedel för motortesterna.

import type { ExpansionModule } from "../../src/shared/expansion";
import type { ExpansionId, TileType } from "../../src/shared/tiles";
import type { GameSetup, GameState, PlacedTile, Pos } from "../../src/shared/state";
import { allTileTypes } from "../../src/tiles/index";
import { baseModule, createEngine, type EngineApi } from "../../src/engine/index";
import { riverModule } from "../../src/expansions/river/index";
import { abbotModule } from "../../src/expansions/abbot/index";
import { innsCathedralsModule } from "../../src/expansions/inns-cathedrals/index";
import { tradersBuildersModule } from "../../src/expansions/traders-builders/index";
import { goldMinesModule } from "../../src/expansions/gold-mines/index";

export const ALL_MODULES: ExpansionModule[] = [baseModule, riverModule, abbotModule, innsCathedralsModule, tradersBuildersModule, goldMinesModule];

export function realEngine(): EngineApi {
  return createEngine(ALL_MODULES, allTileTypes().values());
}

export function setupOf(
  expansions: ExpansionId[] = ["base"],
  opts: Partial<GameSetup> & { n?: number } = {},
): GameSetup {
  const n = opts.n ?? 2;
  const colors = ["red", "blue", "green", "yellow", "black", "gray"];
  return {
    expansions,
    variants: {},
    handSize: 1,
    showClosingTiles: false,
    players: Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `Spelare ${i + 1}`, color: colors[i]! })),
    seed: 1,
    ...opts,
  };
}

/** Små handgjorda brickor för enhetstester. */
export const T = {
  /** Bara fält med ett kloster i mitten. */
  cloister: tile("t/cloister", [
    { id: "cloister", kind: "cloister" },
    { id: "field0", kind: "field", halfEdges: ["NL", "NR", "EL", "ER", "SL", "SR", "WL", "WR"], adjacentCities: [] },
  ]),
  /** Gräs rakt igenom. */
  grass: tile("t/grass", [
    { id: "field0", kind: "field", halfEdges: ["NL", "NR", "EL", "ER", "SL", "SR", "WL", "WR"], adjacentCities: [] },
  ]),
};

export function tile(id: string, features: unknown[], expansion: ExpansionId = "base"): TileType {
  return { id, expansion, features } as TileType;
}

/** Lägg brickor direkt på en karta (utan regler) för poängtester. */
export function place(state: GameState, type: string, x: number, y: number, rotation: 0 | 90 | 180 | 270 = 0): PlacedTile {
  const t = { type, pos: { x, y }, rotation };
  state.board[`${x},${y}`] = t;
  return t;
}

export function putFigure(state: GameState, id: string, pos: Pos, feature: string): void {
  const f = state.figures.find((x) => x.id === id)!;
  f.location = { at: "feature", pos, feature };
}
