// Vilka expansionsmoduler servern känner till. Lägg till nya expansioner här.

import type { ExpansionModule } from "../shared/expansion";
import type { ExpansionId } from "../shared/tiles";
import { baseModule, createEngine, type EngineApi } from "../engine/index";
import { riverModule } from "../expansions/river/index";
import { abbotModule } from "../expansions/abbot/index";
import { innsCathedralsModule } from "../expansions/inns-cathedrals/index";
import { tradersBuildersModule } from "../expansions/traders-builders/index";
import { goldMinesModule } from "../expansions/gold-mines/index";
import { mageWitchModule } from "../expansions/mage-witch/index";
import { princessDragonModule } from "../expansions/princess-dragon/index";
import { ferriesModule } from "../expansions/ferries/index";
import { flyingMachinesModule } from "../expansions/flying-machines/index";
import { cropCircles2Module } from "../expansions/crop-circles-2/index";
import { allTileTypes } from "../tiles/index";
import { availableLanguages } from "../i18n/index";
import type { AvailableOptions } from "../shared/messages";
import { MAX_HAND_SIZE } from "./options";

// Mage & Witch efter I&C (poängordningen följer registreringsordningen).
export const MODULES: ExpansionModule[] = [baseModule, riverModule, abbotModule, innsCathedralsModule, tradersBuildersModule, goldMinesModule, mageWitchModule, princessDragonModule, ferriesModule, flyingMachinesModule, cropCircles2Module];

export function availableExpansions(modules: ExpansionModule[] = MODULES): ExpansionId[] {
  return modules.map((m) => m.id);
}

export function availableOptions(modules: ExpansionModule[] = MODULES): AvailableOptions {
  const variants: AvailableOptions["variants"] = {};
  for (const m of modules) if (m.variants.length) variants[m.id] = m.variants;
  return {
    expansions: availableExpansions(modules),
    variants,
    languages: availableLanguages().map((l) => l.code),
    maxHandSize: MAX_HAND_SIZE,
  };
}

export function createGameEngine(modules: ExpansionModule[] = MODULES): EngineApi {
  return createEngine(modules, allTileTypes().values());
}
