// Delade småkomponenter och hjälpare för telefonvyn.

import { createContext } from "preact";
import { useContext, useEffect, useRef, useState } from "preact/hooks";
import type { Translate } from "../../shared/i18n";
import type { Shape } from "../../shared/style";
import type { Rotation } from "../../shared/tiles";
import type { DrawHighlightArgs } from "../../shared/style";
import { allTileTypes } from "../../tiles/index";
import { computeGeometry } from "../../geometry/index";
import cellshaded from "../../styles/cellshaded/index";
import { shapeInPixels } from "../logic/hit";
import { availableLanguages } from "../../i18n/index";
import type { Client, PhoneState } from "../client";

export const TCtx = createContext<Translate>((k) => k);
export const useT = (): Translate => useContext(TCtx);

export const ClientCtx = createContext<Client | null>(null);
export const useClient = (): Client => useContext(ClientCtx)!;

export function useClientState(c: Client): PhoneState {
  const [s, setS] = useState(c.getState());
  useEffect(() => {
    setS(c.getState());
    return c.subscribe(() => setS(c.getState()));
  }, [c]);
  return s;
}

let types: Map<string, import("../../shared/tiles").TileType> | null = null;
export const tileType = (id: string) => (types ??= allTileTypes()).get(id);

/** Sidan på en stor bricka: så bred som skärmen tillåter, men inte högre än en del av höjden. */
export function useTileSize(maxFracHeight = 0.42, max = 360): number {
  const calc = () => Math.max(160, Math.min(window.innerWidth - 32, Math.floor(window.innerHeight * maxFracHeight), max));
  const [size, setSize] = useState(calc);
  useEffect(() => {
    const f = () => setSize(calc());
    window.addEventListener("resize", f);
    return () => window.removeEventListener("resize", f);
  }, []);
  return size;
}

export interface Highlight {
  feature: string;
  kind: DrawHighlightArgs["kind"];
}

interface TileProps {
  tileId: string;
  rotation?: Rotation;
  size: number;
  highlights?: Highlight[];
  /** Tryck i brickans enhetskvadrat (den visade, roterade). */
  onPoint?: (p: [number, number]) => void;
  class?: string;
}

export function TileCanvas({ tileId, rotation = 0, size, highlights = [], onPoint, class: cls }: TileProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const hlKey = highlights.map((h) => `${h.kind}:${h.feature}`).join(",");
  useEffect(() => {
    const canvas = ref.current;
    const tile = tileType(tileId);
    if (!canvas || !tile) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.round(size * dpr);
    canvas.height = Math.round(size * dpr);
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    const geometry = computeGeometry(tile);
    cellshaded.drawTile({ ctx, tile, geometry, rotation, size });
    for (const h of highlights) {
      const g = geometry.features.find((f) => f.feature === h.feature);
      if (!g) continue;
      const shapes: Shape[] = [shapeInPixels(g.area, rotation, size)];
      cellshaded.drawHighlight({ ctx, shapes, kind: h.kind });
    }
  }, [tileId, rotation, size, hlKey]);
  return (
    <canvas
      ref={ref}
      class={cls}
      style={{ width: `${size}px`, height: `${size}px` }}
      onClick={
        onPoint
          ? (e) => {
              const r = (e.currentTarget as HTMLCanvasElement).getBoundingClientRect();
              onPoint([(e.clientX - r.left) / r.width, (e.clientY - r.top) / r.height]);
            }
          : undefined
      }
    />
  );
}

/** En pjäs i spelarens färg. */
export function FigureIcon({ kind, color, size = 30 }: { kind: string; color: string | null; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = canvas.height = Math.round(size * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, size, size);
    cellshaded.drawFigure({ ctx, kind, color, x: size / 2, y: size / 2, size: size * 0.9 });
  }, [kind, color, size]);
  return <canvas ref={ref} style={{ width: `${size}px`, height: `${size}px` }} />;
}

export function LangSelect() {
  const c = useClient();
  const s = useClientState(c);
  const t = useT();
  return (
    <label class="lang">
      <span>{t("lobby.language")}</span>
      <select value={s.lang} onChange={(e) => c.setLang((e.currentTarget as HTMLSelectElement).value)}>
        {availableLanguages().map((l) => (
          <option value={l.code}>{l.name}</option>
        ))}
      </select>
    </label>
  );
}

/** Färger att välja bland. Värdena är CSS-färger, inga texter. */
export const PALETTE = ["#d62828", "#2a6fdb", "#2e9e47", "#f2c230", "#222222", "#9b59b6", "#ee7f2d", "#8a8f98"];
