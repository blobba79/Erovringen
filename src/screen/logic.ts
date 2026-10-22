// Ren logik för storskärmen: kamera, siffror, markeringar och former. Ingen DOM här.

import type { Shape } from "../shared/style";
import type { Figure, PlacedTile, Pos } from "../shared/state";
import type { FeatureRef } from "../shared/expansion";
import type { InspectResult } from "../shared/messages";
import type { TileType } from "../shared/tiles";
import { computeGeometry, rotatePoint, rotateShape } from "../geometry/index";

export interface Camera {
  x: number;
  y: number;
  /** Hur många rutor som syns över skärmens bredd. */
  zoom: number;
  /** Grader medurs. */
  rotation: number;
}

export interface View {
  width: number;
  height: number;
}

export interface XY {
  x: number;
  y: number;
}

export const DEFAULT_CAMERA: Camera = { x: 0, y: 0, zoom: 8, rotation: 0 };

/** Pixlar per ruta. */
export function pxPerTile(cam: Camera, view: View): number {
  return view.width / cam.zoom;
}

/** Kartpunkt (i rutor) till skärmpixel. Kameran rotaterar kartan medurs. */
export function worldToScreen(cam: Camera, view: View, p: XY): XY {
  const s = pxPerTile(cam, view);
  const a = (cam.rotation * Math.PI) / 180;
  const dx = (p.x - cam.x) * s;
  const dy = (p.y - cam.y) * s;
  return {
    x: view.width / 2 + dx * Math.cos(a) - dy * Math.sin(a),
    y: view.height / 2 + dx * Math.sin(a) + dy * Math.cos(a),
  };
}

export function screenToWorld(cam: Camera, view: View, p: XY): XY {
  const s = pxPerTile(cam, view);
  const a = (cam.rotation * Math.PI) / 180;
  const dx = p.x - view.width / 2;
  const dy = p.y - view.height / 2;
  return {
    x: cam.x + (dx * Math.cos(a) + dy * Math.sin(a)) / s,
    y: cam.y + (-dx * Math.sin(a) + dy * Math.cos(a)) / s,
  };
}

function angleDiff(from: number, to: number): number {
  return ((((to - from) % 360) + 540) % 360) - 180;
}

/** Ett steg av mjuk följning mot målkameran (exponentiell, oberoende av bildfrekvensen). */
export function stepCamera(cur: Camera, target: Camera, dtSeconds: number, rate = 9): Camera {
  const k = 1 - Math.exp(-rate * Math.max(0, dtSeconds));
  const dr = angleDiff(cur.rotation, target.rotation);
  const next: Camera = {
    x: cur.x + (target.x - cur.x) * k,
    y: cur.y + (target.y - cur.y) * k,
    // zoom i logaritmen så att in- och utzoomning känns lika snabba
    zoom: Math.exp(Math.log(cur.zoom) + (Math.log(target.zoom) - Math.log(cur.zoom)) * k),
    rotation: cur.rotation + dr * k,
  };
  const close =
    Math.abs(next.x - target.x) < 1e-3 && Math.abs(next.y - target.y) < 1e-3 &&
    Math.abs(next.zoom - target.zoom) < 1e-3 && Math.abs(angleDiff(next.rotation, target.rotation)) < 0.05;
  return close ? { ...target } : next;
}

export function sameCamera(a: Camera, b: Camera): boolean {
  return a.x === b.x && a.y === b.y && a.zoom === b.zoom && a.rotation === b.rotation;
}

/** Kamera som visar hela kartan, norr uppåt. */
export function fitCamera(board: Record<string, PlacedTile>, view: View): Camera {
  const tiles = Object.values(board);
  if (tiles.length === 0) return { ...DEFAULT_CAMERA };
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (const t of tiles) {
    x0 = Math.min(x0, t.pos.x); x1 = Math.max(x1, t.pos.x);
    y0 = Math.min(y0, t.pos.y); y1 = Math.max(y1, t.pos.y);
  }
  const w = x1 - x0 + 3, h = y1 - y0 + 3;
  const aspect = view.width / Math.max(1, view.height);
  return { x: (x0 + x1) / 2, y: (y0 + y1) / 2, zoom: Math.max(6, w, h * aspect), rotation: 0 };
}

/** Rutor har sin mittpunkt i heltalskoordinater; rutans fyra hörn i kartan. */
export function squareShape(pos: Pos): Shape {
  const { x, y } = pos;
  return [[[x - 0.5, y - 0.5], [x + 0.5, y - 0.5], [x + 0.5, y + 0.5], [x - 0.5, y + 0.5]]];
}

/** Siffra på en plats: skärmläge, alltid upprätt (ingen rotation följer med kartan). */
export interface SpotLabel {
  n: number;
  x: number;
  y: number;
  /** Teckenstorlek i pixlar. */
  size: number;
  visible: boolean;
}

export function spotLabels(spots: readonly Pos[], cam: Camera, view: View): SpotLabel[] {
  const s = pxPerTile(cam, view);
  return spots.map((p, i) => {
    const c = worldToScreen(cam, view, p);
    const half = s * 0.7;
    return {
      n: i + 1,
      x: c.x,
      y: c.y,
      size: Math.max(18, s * 0.55),
      visible: c.x > -half && c.x < view.width + half && c.y > -half && c.y < view.height + half,
    };
  });
}

/** Det som markeras på kartan för ett inspect-svar. */
export interface InspectMarks {
  area: Pos[];
  open: Pos[];
  blocked: Pos[];
  closing: { pos: Pos; count: number }[];
  cities: Pos[];
}

const keyOf = (p: Pos) => `${p.x},${p.y}`;

export function inspectMarks(r: InspectResult): InspectMarks {
  const blockedKeys = new Set(r.blockedSpots.map(keyOf));
  const open = r.openSpots.filter((p) => !blockedKeys.has(keyOf(p)));
  const closing = Object.entries(r.closingTiles ?? {}).flatMap(([k, count]) => {
    const [x, y] = k.split(",").map(Number);
    return x === undefined || y === undefined || Number.isNaN(x) || Number.isNaN(y) ? [] : [{ pos: { x, y }, count }];
  });
  return { area: r.tiles, open, blocked: r.blockedSpots, closing, cities: r.completedCities ?? [] };
}

/** Brickans områden (delar) som former i kartans koordinater (rutor). */
export function featureShapes(
  types: Map<string, TileType>, board: Record<string, PlacedTile>, nodes: readonly FeatureRef[],
): Shape[] {
  const out: Shape[] = [];
  for (const n of nodes) {
    const placed = board[`${n.pos.x},${n.pos.y}`];
    const type = placed && types.get(placed.type);
    if (!placed || !type) continue;
    const g = computeGeometry(type).features.find((f) => f.feature === n.feature);
    if (!g) continue;
    const rotated = rotateShape(g.area, placed.rotation);
    out.push(rotated.map((poly) => poly.map(([px, py]) => [n.pos.x - 0.5 + px, n.pos.y - 0.5 + py] as const)));
  }
  return out;
}

export interface FigureSpot {
  id: string;
  kind: string;
  owner: string | null;
  x: number;
  y: number;
}

/** Var pjäserna står på kartan (kartkoordinater). Flera på samma punkt sprids lite. */
export function figureSpots(
  figures: readonly Figure[], types: Map<string, TileType>, board: Record<string, PlacedTile>,
): FigureSpot[] {
  const base = new Map<string, XY>();
  const anchorOf = (pos: Pos, feature: string): XY => {
    const placed = board[`${pos.x},${pos.y}`];
    const type = placed && types.get(placed.type);
    const g = placed && type ? computeGeometry(type).features.find((f) => f.feature === feature) : undefined;
    if (!placed || !g) return { x: pos.x, y: pos.y };
    const [ax, ay] = rotatePoint(g.anchor, placed.rotation);
    return { x: pos.x - 0.5 + ax, y: pos.y - 0.5 + ay };
  };
  for (const f of figures) {
    if (f.location.at === "feature") base.set(f.id, anchorOf(f.location.pos, f.location.feature));
    else if (f.location.at === "tile") base.set(f.id, { x: f.location.pos.x, y: f.location.pos.y });
  }
  for (const f of figures) {
    if (f.location.at === "figure") {
      const b = base.get(f.location.figure);
      if (b) base.set(f.id, { x: b.x + 0.2, y: b.y - 0.15 });
    }
  }
  const seen = new Map<string, number>();
  const out: FigureSpot[] = [];
  for (const f of figures) {
    const b = base.get(f.id);
    if (!b) continue;
    const k = `${b.x.toFixed(2)},${b.y.toFixed(2)}`;
    const i = seen.get(k) ?? 0;
    seen.set(k, i + 1);
    out.push({ id: f.id, kind: f.kind, owner: f.owner, x: b.x + i * 0.16, y: b.y - i * 0.05 });
  }
  return out;
}

/** Storlek (pixlar) för en cachad brickbild: närmaste steg uppåt, så att få storlekar behövs. */
const STEPS = [16, 24, 32, 48, 64, 96, 128, 192, 256, 384, 512];
export function cacheSize(px: number): number {
  return STEPS.find((s) => s >= px) ?? STEPS[STEPS.length - 1]!;
}

export function tileCacheKey(type: string, rotation: number, size: number): string {
  return `${type}|${rotation}|${size}`;
}

/** Fas -> nyckel i språkfilen. */
export function phaseKey(phase: string, has: (key: string) => boolean): string {
  const fixed: Record<string, string> = {
    chooseTile: "turn.chooseTile",
    placeTile: "turn.placeTile",
    placeFigure: "turn.chooseFigure",
    confirm: "turn.confirm",
  };
  const f = fixed[phase];
  if (f) return f;
  const own = `phase.${phase}`;
  return has(own) ? own : "turn.extraPlacements";
}

/** Ställning: högst poäng först, lika poäng delar placering. */
export function standings(players: readonly { id: string; score: number }[]): { id: string; score: number; rank: number }[] {
  const sorted = [...players].sort((a, b) => b.score - a.score);
  let rank = 0;
  return sorted.map((p, i) => {
    if (i === 0 || p.score !== sorted[i - 1]!.score) rank = i + 1;
    return { id: p.id, score: p.score, rank };
  });
}

/** Har adressen `?f11=1`? (webbläsaren startades utan helskärm) */
export function wantsF11(search: string): boolean {
  return new URLSearchParams(search).get("f11") === "1";
}

/** Adressens sökdel utan `f11`-parametern. */
export function withoutF11(search: string): string {
  const p = new URLSearchParams(search);
  p.delete("f11");
  const s = p.toString();
  return s ? `?${s}` : "";
}

/** Är sidan i helskärm? Riktig helskärm, eller ett fönster som fyller skärmen (F11). */
export function isFullscreenNow(
  doc: { fullscreenElement: unknown },
  win: { innerWidth: number; innerHeight: number; screen: { width: number; height: number } },
): boolean {
  return !!doc.fullscreenElement || (win.innerWidth >= win.screen.width && win.innerHeight >= win.screen.height);
}
