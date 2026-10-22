// Startvalen: vad som kan väljas kommer från servern (`lobby.available`), inte från listor här.

import type { AvailableOptions, SavedGameInfo, StartOptions } from "../../shared/messages";
import type { RuleVariantDefinition } from "../../shared/expansion";
import type { ExpansionId } from "../../shared/tiles";

export interface VariantChoice {
  /** Nyckeln i `StartOptions.variants`: "<expansion>.<id>". */
  key: string;
  expansion: ExpansionId;
  options: string[];
  default: string;
  value: string;
}

export interface StartChoices {
  /** Expansioner som går att bocka i och ur (grundspelet ingår alltid och tas bort ur listan). */
  expansions: { id: ExpansionId; on: boolean }[];
  variants: VariantChoice[];
  languages: string[];
  /** Största antal brickor på hand. */
  maxHandSize: number;
}

export function startChoices(available: AvailableOptions, options: StartOptions): StartChoices {
  const on = new Set(options.expansions);
  const variants: VariantChoice[] = [];
  const ids: ExpansionId[] = ["base", ...available.expansions.filter((e) => e !== "base")];
  for (const id of ids) {
    if (id !== "base" && !on.has(id)) continue;
    const defs: RuleVariantDefinition[] = available.variants[id] ?? [];
    for (const v of defs) {
      const key = `${id}.${v.id}`;
      const cur = options.variants[key];
      variants.push({ key, expansion: id, options: v.options, default: v.default, value: cur && v.options.includes(cur) ? cur : v.default });
    }
  }
  return {
    expansions: available.expansions.filter((e) => e !== "base").map((id) => ({ id, on: on.has(id) })),
    variants,
    languages: available.languages,
    maxHandSize: Math.max(1, available.maxHandSize),
  };
}

/** Bocka en expansion i eller ur; varianter för en avslagen expansion tas bort. */
export function toggleExpansion(options: StartOptions, id: ExpansionId): StartOptions {
  const has = options.expansions.includes(id);
  const expansions = has ? options.expansions.filter((e) => e !== id) : [...options.expansions, id];
  const variants = has
    ? Object.fromEntries(Object.entries(options.variants).filter(([k]) => !k.startsWith(`${id}.`)))
    : options.variants;
  return { ...options, expansions, variants };
}

export function setVariant(options: StartOptions, key: string, value: string): StartOptions {
  return { ...options, variants: { ...options.variants, [key]: value } };
}

export function changeHandSize(options: StartOptions, delta: number, max: number): StartOptions {
  return { ...options, handSize: Math.min(Math.max(1, max), Math.max(1, options.handSize + delta)) };
}

/** Val av sparat spel (eller null = nytt spel). Ett som inte går att läsa kan inte väljas. */
export function chooseSave(options: StartOptions, saves: readonly SavedGameInfo[], id: string | null): StartOptions {
  const { savedGame: _drop, ...rest } = options;
  if (id === null) return rest;
  const s = saves.find((x) => x.id === id);
  return s && s.readable ? { ...rest, savedGame: id } : rest;
}

/** Färgerna i det sparade spelet som fortsätts: en ny anslutning tar tillbaka en plats genom att välja dess färg. */
export function savedColors(options: StartOptions | undefined, saves: readonly SavedGameInfo[] | undefined): string[] {
  const id = options?.savedGame;
  if (id === undefined) return [];
  return saves?.find((x) => x.id === id && x.readable)?.players.map((p) => p.color) ?? [];
}
