// Kameran: servern äger den. Se `camera` och `MapControl` i src/shared/messages.ts.
// Enheter: x, y i rutor (ruta (0,0) har sin mittpunkt i (0,0), y söderut), zoom = rutor över
// skärmens bredd, rotation i grader medurs.
// `pan` räknas som fingrets rörelse: kartan följer fingret, alltså flyttas kamerapunkten åt
// motsatt håll (i kartans riktningar, med hänsyn till rotationen).

import type { MapControl } from "../shared/messages";
import type { Pos } from "../shared/state";

export interface Camera {
  x: number;
  y: number;
  zoom: number;
  rotation: number;
}

export const MIN_ZOOM = 3;
export const MAX_ZOOM = 120;
export const ASPECT = 16 / 9;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const finite = (v: unknown, fallback: number) => (typeof v === "number" && Number.isFinite(v) ? v : fallback);

export const initialCamera = (): Camera => ({ x: 0, y: 0, zoom: 8, rotation: 0 });

/** Hela kartan och alla givna platser, norr uppåt. */
export function fitAll(tiles: Pos[], spots: Pos[]): Camera {
  const all = [...tiles, ...spots];
  if (all.length === 0) return initialCamera();
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const p of all) {
    x0 = Math.min(x0, p.x - 0.5);
    y0 = Math.min(y0, p.y - 0.5);
    x1 = Math.max(x1, p.x + 0.5);
    y1 = Math.max(y1, p.y + 0.5);
  }
  const pad = 0.6;
  const w = x1 - x0 + 2 * pad;
  const h = y1 - y0 + 2 * pad;
  return {
    x: (x0 + x1) / 2,
    y: (y0 + y1) / 2,
    zoom: clamp(Math.max(w, h * ASPECT), MIN_ZOOM + 3, MAX_ZOOM),
    rotation: 0,
  };
}

export function applyControl(cam: Camera, c: MapControl, tiles: () => Pos[], spots: () => Pos[]): Camera {
  switch (c.type) {
    case "pan": {
      const sx = finite(c.dx, 0) * cam.zoom;
      const sy = finite(c.dy, 0) * cam.zoom;
      const a = (-cam.rotation * Math.PI) / 180; // skärm -> karta
      const wx = sx * Math.cos(a) - sy * Math.sin(a);
      const wy = sx * Math.sin(a) + sy * Math.cos(a);
      return { ...cam, x: cam.x - wx, y: cam.y - wy };
    }
    case "zoom": {
      const f = finite(c.factor, 1);
      if (f <= 0) return cam;
      return { ...cam, zoom: clamp(cam.zoom / f, MIN_ZOOM, MAX_ZOOM) };
    }
    case "rotate": {
      const r = (((cam.rotation + finite(c.degrees, 0)) % 360) + 360) % 360;
      return { ...cam, rotation: r };
    }
    case "fitAll":
      return fitAll(tiles(), spots());
    default:
      return cam;
  }
}
