// Ritar kartan på canvas. Brickor ritas en gång per (typ, rotation, storlek) till en bild och cachas.

import type { GraphicStyle, Shape } from "../shared/style";
import type { PlacedTile, Pos } from "../shared/state";
import type { PublicState } from "../shared/messages";
import type { TileType } from "../shared/tiles";
import { computeGeometry } from "../geometry/index";
import {
  type Camera, type InspectMarks, type View, type XY,
  cacheSize, figureSpots, pxPerTile, spotLabels, squareShape, tileCacheKey, worldToScreen,
} from "./logic";

export type TileTypeMap = Map<string, TileType>;

const cache = new Map<string, HTMLCanvasElement>();
const MAX_CACHE = 700;

/** Brickbild i given storlek (pixlar); cachas per typ, rotation och storlek. */
export function tileImage(style: GraphicStyle, types: TileTypeMap, placed: Pick<PlacedTile, "type" | "rotation">, size: number): HTMLCanvasElement | undefined {
  const key = `${style.id}|${tileCacheKey(placed.type, placed.rotation, size)}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const type = types.get(placed.type);
  if (!type) return undefined;
  if (cache.size >= MAX_CACHE) cache.clear();
  const c = document.createElement("canvas");
  c.width = c.height = size;
  const ctx = c.getContext("2d");
  if (!ctx) return undefined;
  style.drawTile({ ctx, tile: type, geometry: computeGeometry(type), rotation: placed.rotation, size });
  cache.set(key, c);
  return c;
}

export interface DrawModel {
  state?: PublicState;
  /** Former som markeras (kartans rutor), färdigräknade av anroparen. */
  areaShapes: Shape[];
  previewSpots: Pos[];
  pendingTile?: Pos;
  inspect?: InspectMarks;
}

const toScreen = (cam: Camera, view: View, shapes: readonly Shape[]): Shape[] =>
  shapes.map((shape) => shape.map((poly) => poly.map(([x, y]) => {
    const p = worldToScreen(cam, view, { x, y });
    return [p.x, p.y] as const;
  })));

function drawText(ctx: CanvasRenderingContext2D, text: string, at: XY, size: number, fill: string, stroke: string): void {
  ctx.font = `800 ${size}px system-ui, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(3, size * 0.18);
  ctx.strokeStyle = stroke;
  ctx.strokeText(text, at.x, at.y);
  ctx.fillStyle = fill;
  ctx.fillText(text, at.x, at.y);
}

export function drawMap(
  ctx: CanvasRenderingContext2D, view: View, dpr: number, cam: Camera,
  style: GraphicStyle, types: TileTypeMap, model: DrawModel,
): void {
  const colors = style.colors;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.fillStyle = colors.background ?? "#000";
  ctx.fillRect(0, 0, view.width, view.height);

  const px = pxPerTile(cam, view);
  const state = model.state;
  if (state) {
    const size = cacheSize(px * dpr);
    const reach = px * 0.8 + Math.hypot(view.width, view.height) / 2;
    const center = { x: view.width / 2, y: view.height / 2 };
    const a = (cam.rotation * Math.PI) / 180;
    for (const t of Object.values(state.board)) {
      const c = worldToScreen(cam, view, t.pos);
      if (Math.hypot(c.x - center.x, c.y - center.y) > reach) continue;
      const img = tileImage(style, types, t, size);
      if (!img) continue;
      ctx.save();
      ctx.translate(c.x, c.y);
      ctx.rotate(a);
      const s = px + 0.75; // lite överlapp mot hårfina springor
      ctx.drawImage(img, -s / 2, -s / 2, s, s);
      ctx.restore();
    }
  }

  // markeringar (i skärmens pixlar)
  const hl = (shapes: Shape[], kind: "area" | "open" | "blocked" | "preview") => {
    if (shapes.length) style.drawHighlight({ ctx, shapes: toScreen(cam, view, shapes), kind });
  };
  const squares = (ps: readonly Pos[]) => ps.map(squareShape);
  hl(squares(model.previewSpots), "preview");
  if (model.pendingTile) hl([squareShape(model.pendingTile)], "preview");
  const ins = model.inspect;
  if (ins) {
    hl(squares(ins.area), "area");
    hl(squares(ins.cities), "area");
    hl(squares(ins.open), "open");
    hl(squares(ins.blocked), "blocked");
  }
  hl(model.areaShapes, "area");

  // pjäser, upprätta
  if (state) {
    const players = new Map(state.players.map((p) => [p.id, p.color]));
    for (const f of figureSpots(state.figures, types, state.board)) {
      const c = worldToScreen(cam, view, f);
      style.drawFigure({ ctx, kind: f.kind, color: f.owner ? players.get(f.owner) ?? null : null, x: c.x, y: c.y - px * 0.1, size: px * 0.5 });
    }
  }

  // siffror på platserna, alltid upprätta
  const text = colors.text ?? "#fff";
  const outline = colors.outline ?? "#000";
  for (const l of spotLabels(model.previewSpots, cam, view)) {
    if (l.visible) drawText(ctx, String(l.n), l, l.size, text, outline);
  }
  if (ins) {
    for (const c of ins.closing) {
      const p = worldToScreen(cam, view, c.pos);
      drawText(ctx, String(c.count), p, Math.max(16, px * 0.4), text, outline);
    }
  }

  // sikte i mitten
  const cx = view.width / 2, cy = view.height / 2, r = Math.max(14, px * 0.18);
  ctx.save();
  ctx.lineWidth = 4;
  ctx.strokeStyle = outline;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.moveTo(cx - r * 1.7, cy); ctx.lineTo(cx - r * 0.5, cy);
  ctx.moveTo(cx + r * 0.5, cy); ctx.lineTo(cx + r * 1.7, cy);
  ctx.moveTo(cx, cy - r * 1.7); ctx.lineTo(cx, cy - r * 0.5);
  ctx.moveTo(cx, cy + r * 0.5); ctx.lineTo(cx, cy + r * 1.7);
  ctx.stroke();
  ctx.lineWidth = 2;
  ctx.strokeStyle = text;
  ctx.stroke();
  ctx.restore();
}
