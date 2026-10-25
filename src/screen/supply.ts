// Pjäser i förrådet för poängrutan. Ren logik, ingen DOM.

import type { PublicState } from "../shared/messages";
import type { Figure } from "../shared/state";

export interface SupplyCount {
  kind: string;
  count: number;
}

const KIND_ORDER = ["meeple", "large-meeple", "big-meeple", "abbot", "builder", "pig", "wagon", "barn", "mayor"];

function groupKinds(figures: Pick<Figure, "kind">[]): SupplyCount[] {
  const by = new Map<string, number>();
  for (const f of figures) by.set(f.kind, (by.get(f.kind) ?? 0) + 1);
  const rank = (k: string) => {
    const i = KIND_ORDER.indexOf(k);
    return i < 0 ? KIND_ORDER.length : i;
  };
  return [...by]
    .map(([kind, count]) => ({ kind, count }))
    .sort((a, b) => rank(a.kind) - rank(b.kind) || (a.kind < b.kind ? -1 : 1));
}

/** Pjäserna en spelare har kvar att ställa ut, per sort. */
export function playerSupply(state: Pick<PublicState, "figures">, player: string): SupplyCount[] {
  return groupKinds(state.figures.filter((f) => f.owner === player && f.location.at === "supply"));
}

/** Neutrala pjäser som inte står på kartan. Utdelade guldtackor (Gold Mines `taken`) räknas inte. */
export function neutralSupply(state: Pick<PublicState, "figures" | "ext">): SupplyCount[] {
  const ext = state.ext as Record<string, { taken?: string[] } | undefined> | undefined;
  const taken = new Set(ext?.["gold-mines"]?.taken ?? []);
  return groupKinds(state.figures.filter((f) => f.owner === null && f.location.at === "supply" && !taken.has(f.id)));
}

/** Tid utan musrörelse innan pekaren döljs (ms). */
export const CURSOR_HIDE_MS = 10_000;
