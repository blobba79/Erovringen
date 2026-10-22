// "Vad kan jag göra?": vilka texter som gäller för den aktuella fasen och de påslagna expansionerna.

import type { ExpansionId } from "../../shared/tiles";

/** Faserna grundspelet känner till; andra faser (från expansioner) får den allmänna texten. */
export const BASE_PHASES = ["chooseTile", "placeTile", "placeFigure", "confirm"] as const;

/**
 * I vilka faser en expansions text gäller. Saknas expansionen här visas dess text i alla faser
 * (om texten finns). Grundspelet har inga egna expansionstexter.
 */
export const EXPANSION_PHASES: Partial<Record<ExpansionId, readonly string[]>> = {
  river: ["chooseTile", "placeTile"],
  abbot: ["placeFigure", "confirm"],
};

export interface HelpKeys {
  phase: string;
  expansions: string[];
}

export function helpKeys(phase: string, expansions: readonly ExpansionId[], exists: (key: string) => boolean = () => true): HelpKeys {
  const known = (BASE_PHASES as readonly string[]).includes(phase);
  const own = `help.phase.${phase}`;
  const phaseKey = known || exists(own) ? own : "help.phase.other";
  const exp: string[] = [];
  for (const id of expansions) {
    if (id === "base") continue;
    const where = EXPANSION_PHASES[id];
    if (where && !where.includes(phase)) continue;
    const key = `help.expansion.${id}`;
    if (exists(key)) exp.push(key);
  }
  return { phase: phaseKey, expansions: exp };
}
