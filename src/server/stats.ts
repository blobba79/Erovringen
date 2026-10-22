// Statistik efter spelet: räknas ur partiets händelser, tur för tur, så att den går att bygga upp
// igen när ett sparat spel spelas om (eller läsas ur den sparade räknaren).

import type { GameStats } from "../shared/messages";
import type { GameEvent, GameState, PlayerId, Pos } from "../shared/state";

type Rec = { player: PlayerId; value: number; pos?: Pos };

/** Det som sparas i filen så att statistiken överlever även när spelet inte kan spelas om. */
export interface TrackerData {
  timeline: Record<PlayerId, number>[];
  byReason: Record<PlayerId, Record<string, number>>;
  best: Record<string, Rec>;
  turns: number;
}

const scores = (s: GameState): Record<PlayerId, number> => Object.fromEntries(s.players.map((p) => [p.id, p.score]));

export class StatsTracker {
  private timeline: Record<PlayerId, number>[];
  private byReason: Record<PlayerId, Record<string, number>> = {};
  private best: Record<string, Rec> = {};
  private turns = 0;

  /** Börjar från ett tillstånd (poängkurvans nollpunkt). */
  constructor(state: GameState) {
    this.timeline = [scores(state)];
  }

  static fromData(state: GameState, data: unknown): StatsTracker {
    const t = new StatsTracker(state);
    const d = data as Partial<TrackerData> | undefined;
    if (!d || !Array.isArray(d.timeline) || d.timeline.length === 0 || typeof d.turns !== "number") return t;
    t.timeline = d.timeline;
    t.byReason = d.byReason ?? {};
    t.best = d.best ?? {};
    t.turns = d.turns;
    return t;
  }

  toData(): TrackerData {
    return { timeline: this.timeline, byReason: this.byReason, best: this.best, turns: this.turns };
  }

  private raise(key: string, player: PlayerId, value: number, pos?: Pos): void {
    const cur = this.best[key];
    if (!cur || value > cur.value) this.best[key] = pos ? { player, value, pos } : { player, value };
  }

  /** En avslutad tur: händelserna och tillståndet efteråt. */
  addTurn(events: GameEvent[], after: GameState): void {
    this.turns++;
    const turnPoints: Record<PlayerId, number> = {};
    for (const e of events) {
      if (e.type !== "scored") continue;
      const r = (this.byReason[e.player] ??= {});
      r[e.reason] = (r[e.reason] ?? 0) + e.points;
      turnPoints[e.player] = (turnPoints[e.player] ?? 0) + e.points;
      if (e.reason === "city" || e.reason === "final.city") this.raise("stats.biggestCity", e.player, e.points, e.pos);
      if (e.reason === "road" || e.reason === "final.road") this.raise("stats.longestRoad", e.player, e.points, e.pos);
    }
    for (const [p, v] of Object.entries(turnPoints)) this.raise("stats.bestTurn", p, v);
    this.timeline.push(scores(after));
  }

  result(durationSeconds: number): GameStats {
    const records: GameStats["records"] = [];
    for (const key of ["stats.biggestCity", "stats.longestRoad"]) {
      const b = this.best[key];
      if (b) records.push({ key, player: b.player, value: b.value, ...(b.pos ? { pos: b.pos } : {}) });
    }
    // Mest poäng från fält: summan av slutpoängen för fält.
    let farm: Rec | undefined;
    for (const [p, r] of Object.entries(this.byReason)) {
      const v = r["final.farm"] ?? 0;
      if (v > 0 && (!farm || v > farm.value)) farm = { player: p, value: v };
    }
    if (farm) records.push({ key: "stats.mostFarmPoints", player: farm.player, value: farm.value });
    const bt = this.best["stats.bestTurn"];
    if (bt) records.push({ key: "stats.bestTurn", player: bt.player, value: bt.value });
    return {
      scoreTimeline: this.timeline,
      pointsByReason: this.byReason,
      records,
      turns: this.turns,
      durationSeconds: Math.round(durationSeconds),
    };
  }
}
