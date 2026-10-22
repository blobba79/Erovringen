// Rutnätsberäkningar: fält är "resten" av brickan, så de räknas fram på ett fint rutnät
// och görs sedan om till förenklade polygoner. Allt är deterministiskt.
import type { Point, Shape } from "../shared/style";

export const G = 80;
const CELL = 1 / G;
export const cellCenter = (i: number): Point => [((i % G) + 0.5) * CELL, (Math.floor(i / G) + 0.5) * CELL];

export function maskOf(test: (p: Point) => boolean): Uint8Array {
  const m = new Uint8Array(G * G);
  for (let i = 0; i < G * G; i++) if (test(cellCenter(i))) m[i] = 1;
  return m;
}

/** Rutor längs en sträcka på ramen som inte är blockerade; annars närmaste fria ruta. */
export function seedCells(a: Point, b: Point, blocked: Uint8Array): number[] {
  const out: number[] = [];
  const n = G;
  for (let s = 0; s < n; s++) {
    const t = (s + 0.5) / n;
    const x = Math.min(G - 1, Math.floor((a[0] + (b[0] - a[0]) * t) * G));
    const y = Math.min(G - 1, Math.floor((a[1] + (b[1] - a[1]) * t) * G));
    // gå en ruta inåt från ramen
    const ix = a[0] === b[0] ? (a[0] === 0 ? 0 : G - 1) : x;
    const iy = a[1] === b[1] ? (a[1] === 0 ? 0 : G - 1) : y;
    const i = iy * G + ix;
    if (!blocked[i] && !out.includes(i)) out.push(i);
  }
  if (out.length === 0) out.push(...nearestFree([(a[0] + b[0]) / 2, (a[1] + b[1]) / 2], blocked));
  return out;
}

/** Närmaste fria ruta till en punkt (tom lista om allt är blockerat). */
export function nearestFree(p: Point, blocked: Uint8Array): number[] {
  let best = -1, bd = Infinity;
  for (let i = 0; i < G * G; i++) {
    if (blocked[i]) continue;
    const c = cellCenter(i), d = Math.hypot(c[0] - p[0], c[1] - p[1]);
    if (d < bd) { bd = d; best = i; }
  }
  return best >= 0 ? [best] : [];
}

/** Flerkälls-bredden-först från varje fälts utgångsrutor. Returnerar fältindex per ruta, -1 = ingen. */
export function flood(blocked: Uint8Array, seeds: number[][]): Int16Array {
  const label = new Int16Array(G * G).fill(-1);
  let frontier: number[] = [];
  seeds.forEach((cells, f) => {
    for (const c of cells) if ((label[c] as number) < 0) { label[c] = f; frontier.push(c); }
  });
  while (frontier.length) {
    const next: number[] = [];
    for (const c of frontier) {
      const x = c % G, y = (c / G) | 0;
      for (const [dx, dy] of [[1, 0], [0, 1], [-1, 0], [0, -1]] as const) {
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= G || ny >= G) continue;
        const n = ny * G + nx;
        if (blocked[n] || (label[n] as number) >= 0) continue;
        label[n] = label[c] as number;
        next.push(n);
      }
    }
    frontier = next;
  }
  return label;
}

/** Punkten längst från kanten i masken (och från brickans ram). */
export function pole(mask: Uint8Array): Point | null {
  const d = new Float32Array(G * G);
  const INF = 1e9;
  for (let i = 0; i < G * G; i++) d[i] = mask[i] ? INF : 0;
  const at = (x: number, y: number) => (x < 0 || y < 0 || x >= G || y >= G ? 0 : (d[y * G + x] as number));
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
    const i = y * G + x;
    if (d[i]) d[i] = Math.min(d[i] as number, at(x - 1, y) + 1, at(x, y - 1) + 1, at(x - 1, y - 1) + 1.414, at(x + 1, y - 1) + 1.414);
  }
  for (let y = G - 1; y >= 0; y--) for (let x = G - 1; x >= 0; x--) {
    const i = y * G + x;
    if (d[i]) d[i] = Math.min(d[i] as number, at(x + 1, y) + 1, at(x, y + 1) + 1, at(x + 1, y + 1) + 1.414, at(x - 1, y + 1) + 1.414);
  }
  // poäng = avstånd till kanten, med lite dragning mot brickans mitt (symmetriska former får då samma plats i alla vridningar)
  const score = new Float32Array(G * G).fill(-1e9);
  let best = -1, bv = 0;
  for (let i = 0; i < G * G; i++) {
    if (!mask[i]) continue;
    const c = cellCenter(i);
    score[i] = (d[i] as number) - 0.35 * G * Math.hypot(c[0] - 0.5, c[1] - 0.5);
    if (best < 0 || (score[i] as number) > bv + 1e-6) { bv = score[i] as number; best = i; }
  }
  if (best < 0) return null;
  // platån av nästan lika bra rutor: ta dess mitt, så att resultatet inte beror på avsökningsordningen
  let sx = 0, sy = 0, n = 0;
  for (let i = 0; i < G * G; i++) if ((score[i] as number) >= bv - 0.5) { const c = cellCenter(i); sx += c[0]; sy += c[1]; n++; }
  const mean: Point = [sx / n, sy / n];
  const mi = Math.min(G - 1, Math.floor(mean[1] * G)) * G + Math.min(G - 1, Math.floor(mean[0] * G));
  return mask[mi] && (score[mi] as number) >= bv - 2 ? mean : cellCenter(best);
}

function dpOpen(pts: Point[], eps: number): Point[] {
  if (pts.length < 3) return pts;
  const a = pts[0] as Point, b = pts[pts.length - 1] as Point;
  let idx = -1, md = 0;
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy);
  for (let i = 1; i < pts.length - 1; i++) {
    const p = pts[i] as Point;
    const d = l === 0 ? Math.hypot(p[0] - a[0], p[1] - a[1]) : Math.abs(dx * (p[1] - a[1]) - dy * (p[0] - a[0])) / l;
    if (d > md) { md = d; idx = i; }
  }
  if (md <= eps) return [a, b];
  return [...dpOpen(pts.slice(0, idx + 1), eps).slice(0, -1), ...dpOpen(pts.slice(idx), eps)];
}

function simplifyLoop(loop: Point[], eps: number): Point[] {
  if (loop.length < 4) return loop;
  let far = 0, fd = 0;
  const a = loop[0] as Point;
  loop.forEach((p, i) => { const d = Math.hypot(p[0] - a[0], p[1] - a[1]); if (d > fd) { fd = d; far = i; } });
  const first = dpOpen(loop.slice(0, far + 1), eps);
  const second = dpOpen([...loop.slice(far), a], eps);
  return [...first.slice(0, -1), ...second.slice(0, -1)];
}

/** Omskriv en rutmask till polygoner (yttre medurs, hål moturs) och förenkla dem. */
export function traceMask(mask: Uint8Array, eps = 0.9 * CELL): Shape {
  const has = (x: number, y: number) => x >= 0 && y >= 0 && x < G && y < G && mask[y * G + x] === 1;
  const next = new Map<number, number[]>(); // start-hörn -> slut-hörn
  const v = (x: number, y: number) => y * (G + 1) + x;
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const k = v(x0, y0);
    const list = next.get(k);
    if (list) list.push(v(x1, y1)); else next.set(k, [v(x1, y1)]);
  };
  for (let y = 0; y < G; y++) for (let x = 0; x < G; x++) {
    if (!has(x, y)) continue;
    if (!has(x, y - 1)) add(x, y, x + 1, y);
    if (!has(x + 1, y)) add(x + 1, y, x + 1, y + 1);
    if (!has(x, y + 1)) add(x + 1, y + 1, x, y + 1);
    if (!has(x - 1, y)) add(x, y + 1, x, y);
  }
  const loops: Point[][] = [];
  const xy = (k: number): Point => [(k % (G + 1)) * CELL, Math.floor(k / (G + 1)) * CELL];
  for (const start of [...next.keys()].sort((a, b) => a - b)) {
    while ((next.get(start) ?? []).length) {
      const loop: number[] = [start];
      let cur = start;
      for (;;) {
        const outs = next.get(cur) as number[];
        if (!outs || outs.length === 0) break;
        // vid knutpunkt: ta svängen som håller ihop samma ruta (första kvarvarande)
        const n = outs.shift() as number;
        if (n === start) break;
        loop.push(n);
        cur = n;
      }
      loops.push(loop.map(xy));
    }
  }
  return loops.map((l) => simplifyLoop(l, eps)).filter((l) => l.length >= 3);
}
