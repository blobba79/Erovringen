const COLORS: Record<string, string> = {
  "goods.wine": "#8e2a5a", "goods.grain": "#d9a521", "goods.cloth": "#3f7fbf", gold: "#f2c200",
};

/** Spelarens räknare som inte är noll, i stabil ordning (id), med färg till ikonen. */
export function visibleCounters(counters: Record<string, number> | undefined): { id: string; count: number; color: string }[] {
  return Object.entries(counters ?? {})
    .filter(([, n]) => n !== 0)
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([id, count]) => ({ id, count, color: COLORS[id] ?? "#999999" }));
}
