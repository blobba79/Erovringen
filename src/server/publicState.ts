// Tillståndet som visas för alla: händer, slumptal, hög och motorns ögonblicksbild är borttagna.

import type { PublicState } from "../shared/messages";
import type { GameState } from "../shared/state";

export function toPublicState(s: GameState): PublicState {
  const remaining: Record<string, number> = {};
  const count = (t: string) => (remaining[t] = (remaining[t] ?? 0) + 1);
  s.drawPile.forEach(count);
  for (const p of s.players) p.hand.forEach(count);
  const { rng: _rng, drawPile, players, ext, ...rest } = s;
  const base = (ext.base ?? {}) as Record<string, unknown>;
  const { snapshot: _snapshot, ...publicBase } = base;
  return {
    ...rest,
    ext: { ...ext, base: publicBase },
    players: players.map(({ hand, ...p }) => ({ ...p, handCount: hand.length })),
    drawPileCount: drawPile.length,
    remaining,
  };
}
