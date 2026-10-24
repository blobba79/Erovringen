// Klienterna analyserar områden utan att skapa en motor. Modulernas `edgeLinks` (färjor) måste då
// anmälas här, annars slås inte vägar över en färja ihop i områdesmarkeringen.

import type { ExpansionModule } from "../shared/expansion";
import { registerEdgeLinks } from "../engine/features";
import { engineHook } from "../engine/context";
import { ferriesModule } from "../expansions/ferries/index";

/** Moduler med förbindelser mellan kanter. Lägg till fler här om en ny expansion får egna. */
export const CLIENT_MODULES: ExpansionModule[] = [ferriesModule];

export function registerClientModules(modules: ExpansionModule[] = CLIENT_MODULES): void {
  for (const m of modules) registerEdgeLinks(engineHook(m, "edgeLinks"));
}
