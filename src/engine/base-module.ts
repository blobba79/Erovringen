// Grundspelets modul: brickorna och den vanliga pjäsen. Floden och abboten är egna moduler.

import type { ExpansionModule } from "../shared/expansion";
import type { TileSet } from "../shared/tiles";
import { TILE_DATA } from "../tiles/index";

export function makeBaseModule(tileSet: TileSet = (TILE_DATA.base as { set: TileSet }).set): ExpansionModule {
  return {
    id: "base",
    tileSets: [tileSet],
    // Sju i förrådet: den åttonde är poängmarkören.
    figures: [{ kind: "meeple", count: 7, placeableOn: ["city", "road", "field", "cloister"] }],
    variants: [],
    hooks: {},
  };
}

export const baseModule: ExpansionModule = makeBaseModule();
