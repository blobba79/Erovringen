import type { ExpansionId, TileSet, TileType } from "../shared/tiles";
import base from "./base.json";
import river from "./river.json";
import innsCathedrals from "./inns-cathedrals.json";
import tradersBuilders from "./traders-builders.json";
import princessDragon from "./princess-dragon.json";
import flyingMachines from "./flying-machines.json";
import ferries from "./ferries.json";
import goldMines from "./gold-mines.json";
import mageWitch from "./mage-witch.json";
import cropCircles2 from "./crop-circles-2.json";

export interface ExpansionTiles {
  set: TileSet;
  tiles: TileType[];
}

/** Abboten har inga egna brickor (trädgårdarna sitter på grundbrickorna och River I). */
export const TILE_DATA: Partial<Record<ExpansionId, ExpansionTiles>> = {
  base: base as ExpansionTiles,
  river: river as ExpansionTiles,
  "inns-cathedrals": innsCathedrals as ExpansionTiles,
  "traders-builders": tradersBuilders as ExpansionTiles,
  "princess-dragon": princessDragon as ExpansionTiles,
  "flying-machines": flyingMachines as ExpansionTiles,
  ferries: ferries as ExpansionTiles,
  "gold-mines": goldMines as ExpansionTiles,
  "mage-witch": mageWitch as ExpansionTiles,
  "crop-circles-2": cropCircles2 as ExpansionTiles,
};

export function getTileData(expansion: ExpansionId): ExpansionTiles | undefined {
  return TILE_DATA[expansion];
}

/** Alla brickstyper i alla expansioner, med id som nyckel. */
export function allTileTypes(): Map<string, TileType> {
  const m = new Map<string, TileType>();
  for (const d of Object.values(TILE_DATA)) for (const t of d.tiles) m.set(t.id, t);
  return m;
}
