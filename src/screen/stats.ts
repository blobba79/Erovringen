// Statistik efter spelet: poängkurva, poäng per orsak och rekord. Ren logik.

import type { GameStats } from "../shared/messages";
import type { PlayerId, Pos } from "../shared/state";

export interface ChartLine {
  player: PlayerId;
  /** Punkter i diagrammets koordinater (0..width, 0..height). */
  points: { x: number; y: number }[];
  path: string;
}

export interface Chart {
  lines: ChartLine[];
  maxScore: number;
  turns: number;
}

/** Poängkurvan: en linje per spelare, x = tur, y = poäng (uppåt är mer poäng). */
export function scoreChart(stats: Pick<GameStats, "scoreTimeline">, players: readonly PlayerId[], width: number, height: number): Chart {
  const tl = stats.scoreTimeline;
  const turns = Math.max(0, tl.length - 1);
  const maxScore = Math.max(10, ...tl.flatMap((row) => players.map((p) => row[p] ?? 0)));
  const lines = players.map((player) => {
    const points = tl.map((row, i) => ({
      x: turns === 0 ? 0 : (i / turns) * width,
      y: height - ((row[player] ?? 0) / maxScore) * height,
    }));
    const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    return { player, points, path };
  });
  return { lines, maxScore, turns };
}

/** Jämna värden för skalstreck på y-axeln, upp till maxScore. */
export function axisTicks(maxScore: number, count = 4): number[] {
  const rough = maxScore / count;
  const mag = 10 ** Math.floor(Math.log10(Math.max(1, rough)));
  const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= rough) ?? rough;
  const out: number[] = [];
  for (let v = 0; v <= maxScore; v += step) out.push(v);
  return out;
}

export interface ReasonRow {
  reason: string;
  /** Poäng per spelare i samma ordning som `players`. */
  values: number[];
  total: number;
}

/** Poäng per orsak: orsaker med mest poäng först. */
export function reasonRows(stats: Pick<GameStats, "pointsByReason">, players: readonly PlayerId[]): ReasonRow[] {
  const reasons = new Set<string>();
  for (const p of players) for (const r of Object.keys(stats.pointsByReason[p] ?? {})) reasons.add(r);
  return [...reasons]
    .map((reason) => {
      const values = players.map((p) => stats.pointsByReason[p]?.[reason] ?? 0);
      return { reason, values, total: values.reduce((a, b) => a + b, 0) };
    })
    .filter((r) => r.total > 0)
    .sort((a, b) => b.total - a.total || (a.reason < b.reason ? -1 : 1));
}

/** Rekord med plats på kartan, att markera. */
export function recordMarks(stats: Pick<GameStats, "records">): Pos[] {
  return stats.records.flatMap((r) => (r.pos ? [r.pos] : []));
}
