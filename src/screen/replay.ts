// Repris av senaste draget: händelserna blir en tidslinje med några få effekter.
// Ren logik utan DOM och klocka (tiden skickas in), så att den går att testa.

import type { FigureId, FigureLocation, GameEvent, PlacedTile, PlayerId, Pos } from "../shared/state";

export type ReplayStep =
  | { kind: "tile"; tile: PlacedTile; player: PlayerId; start: number; end: number }
  | { kind: "figurePlaced"; figure: FigureId; location: FigureLocation; start: number; end: number }
  | { kind: "figureReturned"; figure: FigureId; start: number; end: number }
  | { kind: "score"; player: PlayerId; points: number; reason: string; pos?: Pos; start: number; end: number };

export interface Replay {
  steps: ReplayStep[];
  /** Total längd i ms. */
  duration: number;
}

/** Längd per sort (ms) och högsta totala längd; längre repriser pressas ihop. */
export const STEP_MS = { tile: 1000, figure: 700, score: 900 } as const;
export const MAX_REPLAY_MS = 5000;

/** Bygger en tidslinje ur händelserna i ordning, eller undefined om inget är värt att visa. */
export function buildReplay(events: readonly GameEvent[]): Replay | undefined {
  type Raw = (ReplayStep extends infer S ? (S extends ReplayStep ? Omit<S, "start" | "end"> : never) : never) & { ms: number };
  const raw: Raw[] = [];
  for (const e of events) {
    if (e.type === "tilePlaced") raw.push({ kind: "tile", tile: e.tile, player: e.player, ms: STEP_MS.tile });
    else if (e.type === "figurePlaced") raw.push({ kind: "figurePlaced", figure: e.figure, location: e.location, ms: STEP_MS.figure });
    else if (e.type === "figureReturned") raw.push({ kind: "figureReturned", figure: e.figure, ms: STEP_MS.figure });
    else if (e.type === "scored" && e.points > 0) raw.push({ kind: "score", player: e.player, points: e.points, reason: e.reason, pos: e.pos, ms: STEP_MS.score });
  }
  if (raw.length === 0) return undefined;
  const sum = raw.reduce((a, r) => a + r.ms, 0);
  const k = Math.min(1, MAX_REPLAY_MS / sum);
  let t = 0;
  const steps = raw.map(({ ms, ...r }) => {
    const step = { ...r, start: t, end: t + ms * k } as ReplayStep;
    t += ms * k;
    return step;
  });
  return { steps, duration: t };
}

export interface ReplayView {
  /** Brickan som landar (stor och genomskinlig först, sedan på plats). */
  landing?: { tile: PlacedTile; progress: number };
  figures: { figure: FigureId; mode: "placed" | "returned"; progress: number }[];
  pops: { player: PlayerId; points: number; pos?: Pos; progress: number }[];
  /** Poäng som ännu inte "tickat upp": dras bort från spelarens poäng i ställningen. */
  pending: Record<PlayerId, number>;
  /** Vilka som just nu får poäng, för markeringen vid namnet. */
  gaining: Record<PlayerId, number>;
}

const clamp01 = (x: number) => Math.max(0, Math.min(1, x));

/** Läget vid tiden `t` (ms från start). */
export function replayView(r: Replay, t: number): ReplayView {
  const v: ReplayView = { figures: [], pops: [], pending: {}, gaining: {} };
  for (const s of r.steps) {
    const p = clamp01((t - s.start) / Math.max(1, s.end - s.start));
    const active = t >= s.start && t < s.end;
    if (s.kind === "tile") {
      if (active) v.landing = { tile: s.tile, progress: p };
    } else if (s.kind === "score") {
      const left = Math.round(s.points * (1 - p));
      if (left > 0) v.pending[s.player] = (v.pending[s.player] ?? 0) + left;
      if (active) {
        v.pops.push({ player: s.player, points: s.points, pos: s.pos, progress: p });
        v.gaining[s.player] = (v.gaining[s.player] ?? 0) + s.points;
      }
    } else if (active) {
      v.figures.push({ figure: s.figure, mode: s.kind === "figurePlaced" ? "placed" : "returned", progress: p });
    }
  }
  return v;
}

/** Skala och synlighet för brickan som landar: börjar stor och sjunker ned på sin plats. */
export function landingLook(progress: number): { scale: number; alpha: number } {
  const e = 1 - (1 - clamp01(progress)) ** 3;
  return { scale: 1 + 0.7 * (1 - e), alpha: 0.35 + 0.65 * e };
}

/** Poängen som ska visas i ställningen: slutvärdet minus det som ännu inte tickat upp. */
export function shownScore(score: number, view: ReplayView | undefined, player: PlayerId): number {
  return Math.max(0, score - (view?.pending[player] ?? 0));
}

/**
 * Håller reda på pågående repris. En ny repris ersätter den gamla direkt (den gamla hoppar fram
 * till slutläget, som redan är det som tillståndet visar), så att den aldrig blockerar nästa tur.
 */
export class ReplayPlayer {
  private replay?: Replay;
  private startedAt = 0;

  push(events: readonly GameEvent[], now: number): boolean {
    const r = buildReplay(events);
    this.replay = r;
    this.startedAt = now;
    return r !== undefined;
  }

  /** Läget nu, eller undefined när ingen repris pågår. */
  view(now: number): ReplayView | undefined {
    if (!this.replay) return undefined;
    const t = now - this.startedAt;
    if (t >= this.replay.duration) {
      this.replay = undefined;
      return undefined;
    }
    return replayView(this.replay, t);
  }

  get active(): boolean {
    return this.replay !== undefined;
  }

  clear(): void {
    this.replay = undefined;
  }
}
