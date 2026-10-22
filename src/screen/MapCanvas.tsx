// Kartan på canvas, med mjuk kamera mot serverns mål.

import { useEffect, useMemo, useRef } from "preact/hooks";
import { analyze } from "../engine/index";
import type { Model } from "./store";
import { type Camera, type View, featureShapes, fitCamera, inspectMarks, sameCamera, stepCamera } from "./logic";
import { drawMap, type DrawModel } from "./render";
import { style, tileTypes } from "./data";
import type { InspectResult } from "../shared/messages";
import type { Shape } from "../shared/style";
import type { Pos } from "../shared/state";
import type { ReplayPlayer } from "./replay";

/** Markerade områden: valt område i förhandsvisningen och ett väntande placeFigure. */
function areaShapesOf(m: Model): Shape[] {
  const state = m.state;
  if (!state) return [];
  const refs: { pos: { x: number; y: number }; feature: string }[] = [];
  if (m.preview?.preview.feature) refs.push(m.preview.preview.feature);
  for (const s of state.turn.pending) if (s.type === "placeFigure") refs.push({ pos: s.pos, feature: s.feature });
  if (refs.length === 0) return [];
  const an = analyze(state.board, state.figures, tileTypes);
  const shapes: Shape[] = [];
  for (const r of refs) {
    const area = an.areaAt(r.pos, r.feature);
    if (area) shapes.push(...featureShapes(tileTypes, state.board, area.nodes));
  }
  return shapes;
}

export function MapCanvas({ model, inspect, replay, marks }: { model: Model; inspect?: InspectResult; replay?: ReplayPlayer; marks?: Pos[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const live = useRef<{ draw: DrawModel; target: Camera | undefined; replay?: ReplayPlayer }>({ draw: { areaShapes: [], previewSpots: [] }, target: undefined });

  const draw = useMemo<DrawModel>(() => {
    const state = model.state;
    const pending = state?.turn.pending.find((s) => s.type === "placeTile");
    return {
      state,
      areaShapes: areaShapesOf(model),
      previewSpots: model.preview?.preview.spots ?? [],
      pendingTile: pending && pending.type === "placeTile" ? pending.pos : undefined,
      inspect: inspect ? inspectMarks(inspect) : undefined,
      prevFigures: model.prevFigures,
      marks,
    };
    // eslint-disable-next-line
  }, [model.state, model.preview, inspect, model.prevFigures, marks]);
  live.current.draw = draw;
  live.current.target = model.camera;
  live.current.replay = replay;

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let view: View = { width: 1, height: 1 };
    let dpr = 1;
    let cur: Camera | undefined;
    let last = performance.now();
    let raf = 0;

    const resize = () => {
      dpr = window.devicePixelRatio || 1;
      view = { width: canvas.clientWidth, height: canvas.clientHeight };
      canvas.width = Math.max(1, Math.round(view.width * dpr));
      canvas.height = Math.max(1, Math.round(view.height * dpr));
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(canvas);

    const frame = (now: number) => {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      const { draw: dm, target } = live.current;
      const goal = target ?? (dm.state ? fitCamera(dm.state.board, view) : { x: 0, y: 0, zoom: 8, rotation: 0 });
      cur = cur ? (sameCamera(cur, goal) ? cur : stepCamera(cur, goal, dt)) : goal;
      drawMap(ctx, view, dpr, cur, style, tileTypes, { ...dm, replay: live.current.replay?.view(now) });
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} class="map" />;
}
