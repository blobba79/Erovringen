// Slumptal ur ett frö som lever i `state.rng` (mulberry32), så att allt är deterministiskt.

export interface HasRng {
  rng: number;
}

/** Nästa slumptal i [0, 1). Ändrar `holder.rng`. */
export function nextRandom(holder: HasRng): number {
  holder.rng = (holder.rng + 0x6d2b79f5) >>> 0;
  let t = holder.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function randomInt(holder: HasRng, n: number): number {
  return Math.floor(nextRandom(holder) * n);
}

/** Fisher-Yates på plats. */
export function shuffle<T>(holder: HasRng, arr: T[]): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(holder, i + 1);
    const tmp = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = tmp;
  }
  return arr;
}
