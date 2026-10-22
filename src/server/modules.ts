// Vilka expansionsmoduler servern känner till. Lägg till nya expansioner här.

import type { ExpansionModule } from "../shared/expansion";
import type { ExpansionId } from "../shared/tiles";
import { baseModule, createEngine, type EngineApi } from "../engine/index";
import { riverModule } from "../expansions/river/index";
import { abbotModule } from "../expansions/abbot/index";
import { allTileTypes } from "../tiles/index";

export const MODULES: ExpansionModule[] = [baseModule, riverModule, abbotModule];

export function availableExpansions(modules: ExpansionModule[] = MODULES): ExpansionId[] {
  return modules.map((m) => m.id);
}

export function createGameEngine(modules: ExpansionModule[] = MODULES): EngineApi {
  return createEngine(modules, allTileTypes().values());
}
