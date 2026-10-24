// Spelreglerna som text, en fil per del och språk. Importeras som text så att
// dev-servern, `bun build --compile` och Android-bygget tar med dem.
/// <reference path="./md.d.ts" />

import sv_base from "./sv/base.md" with { type: "text" };
import sv_river from "./sv/river.md" with { type: "text" };
import sv_abbot from "./sv/abbot.md" with { type: "text" };
import sv_inns from "./sv/inns-cathedrals.md" with { type: "text" };
import sv_traders from "./sv/traders-builders.md" with { type: "text" };
import sv_princess from "./sv/princess-dragon.md" with { type: "text" };
import sv_flying from "./sv/flying-machines.md" with { type: "text" };
import sv_ferries from "./sv/ferries.md" with { type: "text" };
import sv_gold from "./sv/gold-mines.md" with { type: "text" };
import sv_mage from "./sv/mage-witch.md" with { type: "text" };
import sv_crop from "./sv/crop-circles-2.md" with { type: "text" };
import en_base from "./en/base.md" with { type: "text" };
import en_river from "./en/river.md" with { type: "text" };
import en_abbot from "./en/abbot.md" with { type: "text" };
import en_inns from "./en/inns-cathedrals.md" with { type: "text" };
import en_traders from "./en/traders-builders.md" with { type: "text" };
import en_princess from "./en/princess-dragon.md" with { type: "text" };
import en_flying from "./en/flying-machines.md" with { type: "text" };
import en_ferries from "./en/ferries.md" with { type: "text" };
import en_gold from "./en/gold-mines.md" with { type: "text" };
import en_mage from "./en/mage-witch.md" with { type: "text" };
import en_crop from "./en/crop-circles-2.md" with { type: "text" };

export const RULE_IDS = [
  "base",
  "river",
  "abbot",
  "inns-cathedrals",
  "traders-builders",
  "princess-dragon",
  "flying-machines",
  "ferries",
  "gold-mines",
  "mage-witch",
  "crop-circles-2",
] as const;
export type RuleId = (typeof RULE_IDS)[number];

const sv: Record<RuleId, string> = {
  base: sv_base,
  river: sv_river,
  abbot: sv_abbot,
  "inns-cathedrals": sv_inns,
  "traders-builders": sv_traders,
  "princess-dragon": sv_princess,
  "flying-machines": sv_flying,
  ferries: sv_ferries,
  "gold-mines": sv_gold,
  "mage-witch": sv_mage,
  "crop-circles-2": sv_crop,
};

const en: Record<RuleId, string> = {
  base: en_base,
  river: en_river,
  abbot: en_abbot,
  "inns-cathedrals": en_inns,
  "traders-builders": en_traders,
  "princess-dragon": en_princess,
  "flying-machines": en_flying,
  ferries: en_ferries,
  "gold-mines": en_gold,
  "mage-witch": en_mage,
  "crop-circles-2": en_crop,
};

const TEXTS: Record<string, Record<string, string>> = { sv, en };

/** Regeltexten för en del på ett språk; engelska om språket saknas, tom sträng för okänd del. */
export function ruleText(lang: string, id: string): string {
  return TEXTS[lang]?.[id] ?? TEXTS["en"]?.[id] ?? "";
}

/** Delarna som är med, grundspelet först och sedan expansionerna i fast ordning. */
export function ruleParts(expansions: readonly string[]): RuleId[] {
  const set = new Set(expansions);
  return RULE_IDS.filter((id) => id === "base" || set.has(id));
}
