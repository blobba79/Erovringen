// Efter spelet: slutställning och de viktigaste rekorden.

import type { GameStats, PublicState } from "../../shared/messages";

export interface Standing {
  id: string;
  name: string;
  color: string;
  score: number;
  rank: number;
}

/** Sorterat efter poäng; lika poäng ger samma plats. */
export function standings(state: Pick<PublicState, "players">): Standing[] {
  const sorted = [...state.players].sort((a, b) => b.score - a.score);
  return sorted.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
    score: p.score,
    rank: sorted.findIndex((q) => q.score === p.score) + 1,
  }));
}

/** De `n` största rekorden (högsta värdet först), ett per nyckel. */
export function topRecords(stats: GameStats, n = 5): GameStats["records"] {
  const best = new Map<string, GameStats["records"][number]>();
  for (const r of stats.records) {
    const cur = best.get(r.key);
    if (!cur || r.value > cur.value) best.set(r.key, r);
  }
  return [...best.values()].sort((a, b) => b.value - a.value).slice(0, n);
}
