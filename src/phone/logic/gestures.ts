// Pekplattan: fingerrörelser blir MapControl. Rena funktioner, ingen DOM.
//
// Enheter (se MapControl i src/shared/messages.ts):
// - pan: fingrarnas förflyttning delad med plattans bredd, båda axlarna (kartan följer fingret:
//   fingret åt höger ger dx > 0). Plattan har skärmens 16:9, så andelen av plattans bredd är
//   också andelen av storskärmens bredd.
// - zoom: avståndet mellan fingrarna nu delat med förra (nyp isär = större än 1).
// - rotate: grader medurs som fingerparets linje har vridits.
// Rörelserna samlas och skickas högst vart `intervalMs`.

import type { MapControl } from "../../shared/messages";

export type GestureOutput = MapControl | { type: "tap" };

export const TAP_MAX_MOVE = 10;
export const TAP_MAX_MS = 300;
export const DEFAULT_INTERVAL_MS = 50;

interface P {
  x: number;
  y: number;
}

export function normalizeDegrees(d: number): number {
  let r = d % 360;
  if (r > 180) r -= 360;
  if (r <= -180) r += 360;
  return r;
}

export class GestureTracker {
  private pointers = new Map<number, P>();
  private dx = 0;
  private dy = 0;
  private zoom = 1;
  private rot = 0;
  private lastEmit = -Infinity;
  private startT = 0;
  private startP: P | null = null;
  private travel = 0;
  private maxPointers = 0;

  constructor(
    private width: number,
    private intervalMs = DEFAULT_INTERVAL_MS,
  ) {}

  setWidth(w: number): void {
    if (w > 0) this.width = w;
  }

  down(id: number, x: number, y: number, t: number): GestureOutput[] {
    if (this.pointers.size === 0) {
      this.startT = t;
      this.startP = { x, y };
      this.travel = 0;
      this.maxPointers = 0;
    }
    this.pointers.set(id, { x, y });
    this.maxPointers = Math.max(this.maxPointers, this.pointers.size);
    return [];
  }

  move(id: number, x: number, y: number, t: number): GestureOutput[] {
    const prev = this.pointers.get(id);
    if (!prev) return [];
    const w = this.width;
    if (this.pointers.size === 1) {
      this.dx += (x - prev.x) / w;
      this.dy += (y - prev.y) / w;
      if (this.startP) this.travel = Math.max(this.travel, Math.hypot(x - this.startP.x, y - this.startP.y));
    } else if (this.pointers.size >= 2) {
      const o = [...this.pointers.entries()].find(([k]) => k !== id)![1];
      const midOld = { x: (prev.x + o.x) / 2, y: (prev.y + o.y) / 2 };
      const midNew = { x: (x + o.x) / 2, y: (y + o.y) / 2 };
      const d0 = Math.hypot(prev.x - o.x, prev.y - o.y);
      const d1 = Math.hypot(x - o.x, y - o.y);
      if (d0 > 1 && d1 > 1) {
        this.zoom *= d1 / d0;
        const a0 = Math.atan2(prev.y - o.y, prev.x - o.x);
        const a1 = Math.atan2(y - o.y, x - o.x);
        this.rot += normalizeDegrees(((a1 - a0) * 180) / Math.PI);
      }
      this.dx += (midNew.x - midOld.x) / w;
      this.dy += (midNew.y - midOld.y) / w;
    }
    this.pointers.set(id, { x, y });
    if (t - this.lastEmit >= this.intervalMs) return this.flush(t);
    return [];
  }

  up(id: number, t: number): GestureOutput[] {
    if (!this.pointers.has(id)) return [];
    const out = this.flush(t);
    this.pointers.delete(id);
    if (this.pointers.size === 0) {
      const isTap = this.maxPointers === 1 && this.travel < TAP_MAX_MOVE && t - this.startT < TAP_MAX_MS;
      this.startP = null;
      if (isTap) out.push({ type: "tap" });
    }
    return out;
  }

  cancel(): void {
    this.pointers.clear();
    this.dx = this.dy = this.rot = 0;
    this.zoom = 1;
    this.startP = null;
  }

  /** Skickar det som samlats sedan sist. */
  flush(t: number): GestureOutput[] {
    const out: GestureOutput[] = [];
    if (this.dx !== 0 || this.dy !== 0) out.push({ type: "pan", dx: this.dx, dy: this.dy });
    if (this.zoom !== 1) out.push({ type: "zoom", factor: this.zoom });
    if (this.rot !== 0) out.push({ type: "rotate", degrees: this.rot });
    this.dx = this.dy = this.rot = 0;
    this.zoom = 1;
    if (out.length > 0) this.lastEmit = t;
    return out;
  }
}
