// Färjor och flygmaskinens tärning på kartan: ren logik utan DOM, så att den går att testa.

import type { Figure, GameEvent, Pos } from "../shared/state";
import type { XY } from "./logic";

export const FERRY_KIND = "ferry";

export const isFerry = (f: Pick<Figure, "kind">): boolean => f.kind === FERRY_KIND;

const EDGE_MID: Record<string, XY> = { N: { x: 0, y: -0.5 }, E: { x: 0.5, y: 0 }, S: { x: 0, y: 0.5 }, W: { x: -0.5, y: 0 } };

/** Färjorna på kartan som två punkter (kanternas mittpunkter) i kartans koordinater. */
export function ferryLines(figures: readonly Figure[]): { id: string; a: XY; b: XY }[] {
  const out: { id: string; a: XY; b: XY }[] = [];
  for (const f of figures) {
    if (!isFerry(f) || f.location.at !== "feature") continue;
    const [ea, eb] = f.location.feature.split("-");
    const ma = ea ? EDGE_MID[ea] : undefined, mb = eb ? EDGE_MID[eb] : undefined;
    if (!ma || !mb || ea === eb) continue;
    const p = f.location.pos;
    out.push({ id: f.id, a: { x: p.x + ma.x, y: p.y + ma.y }, b: { x: p.x + mb.x, y: p.y + mb.y } });
  }
  return out;
}

export interface DiceData {
  player: string;
  roll: number;
  from: Pos;
  to: Pos;
  direction: string;
  kind: string;
  options: number;
}

/** Så länge tärningen visas (ms). */
export const DICE_MS = 3500;

export function diceFromEvent(e: GameEvent): DiceData | undefined {
  if (e.type !== "expansion" || e.expansion !== "flying-machines" || e.event !== "dice") return undefined;
  const d = e.data as Partial<DiceData> | null;
  if (!d || typeof d.roll !== "number" || !d.from || !d.to) return undefined;
  return { player: String(d.player ?? ""), roll: d.roll, from: d.from, to: d.to, direction: String(d.direction ?? ""), kind: String(d.kind ?? ""), options: Number(d.options ?? 0) };
}

export const diceKey = (d: DiceData): string => `${d.player}|${d.roll}|${d.from.x},${d.from.y}|${d.to.x},${d.to.y}|${d.direction}`;

export interface DiceShown { seq: number; data: DiceData }

/**
 * Nästa tärning att visa. Händelsen kan skickas igen när turen bekräftas: samma tärning visas då inte
 * om en gång. `last` är nyckeln för den senast visade; den nollställs när en tur startar utan tärning.
 */
export function nextDice(events: readonly GameEvent[], last: string | undefined, seq: number): { dice?: DiceShown; last: string | undefined } {
  let found: DiceData | undefined;
  for (const e of events) found = diceFromEvent(e) ?? found;
  if (found) {
    const key = diceKey(found);
    return key === last ? { last } : { dice: { seq: seq + 1, data: found }, last: key };
  }
  return { last: events.some((e) => e.type === "turnStarted") ? undefined : last };
}

/** Hur synlig tärningen är (0-1) efter `elapsed` ms: snabb in, kvar, tonar ut. */
export function diceAlpha(elapsed: number): number {
  if (elapsed < 0 || elapsed >= DICE_MS) return 0;
  if (elapsed < 200) return elapsed / 200;
  if (elapsed > DICE_MS - 600) return (DICE_MS - elapsed) / 600;
  return 1;
}
