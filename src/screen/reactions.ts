// Snabbreaktioner: en emoji visas en kort stund vid spelarens namn.

import type { PlayerId } from "../shared/state";

export const REACTION_MS = 4000;

export class ReactionBoard {
  private items = new Map<PlayerId, { emoji: string; until: number }>();

  push(player: PlayerId, emoji: string, now: number): void {
    this.items.set(player, { emoji, until: now + REACTION_MS });
  }

  /** Aktiva reaktioner nu; utgångna tas bort. En ny reaktion ersätter spelarens förra. */
  active(now: number): Record<PlayerId, string> {
    const out: Record<PlayerId, string> = {};
    for (const [p, r] of [...this.items]) {
      if (r.until <= now) this.items.delete(p);
      else out[p] = r.emoji;
    }
    return out;
  }
}
