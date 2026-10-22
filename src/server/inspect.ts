// Markera område: hitta rutan och området under kamerans mitt och beskriv det.

import type { InspectResult } from "../shared/messages";
import type { GameState, Pos } from "../shared/state";
import type { Point } from "../shared/style";
import type { Rotation } from "../shared/tiles";
import type { EngineApi } from "../engine/index";
import { describeArea, isLegalPlacement, neighbour, posKey, ROTATIONS } from "../engine/index";
import { computeGeometry, dist, pointInShape, rotatePoint } from "../geometry/index";

export interface FeatureHit {
  pos: Pos;
  feature: string;
}

/** Rutan och området under en kartpunkt (rutor, ruta (0,0) har mittpunkt i (0,0)), eller undefined. */
export function featureAt(engine: EngineApi, state: GameState, x: number, y: number): FeatureHit | undefined {
  const pos = { x: Math.round(x), y: Math.round(y) };
  const placed = state.board[posKey(pos)];
  if (!placed) return undefined;
  const type = engine.types.get(placed.type);
  if (!type) return undefined;
  // Punkten i den roterade brickans enhetskvadrat, sedan tillbaka till oroterad bricka.
  const local: Point = [x - pos.x + 0.5, y - pos.y + 0.5];
  const p = rotatePoint(local, (360 - placed.rotation) % 360);
  const geo = computeGeometry(type);
  // Små områden (väg, kloster) ligger ovanpå; fält sist.
  const rank = (k: string) => (k === "field" ? 1 : 0);
  const hits = geo.features.filter((f) => pointInShape(p, f.area)).sort((a, b) => rank(a.kind) - rank(b.kind));
  if (hits[0]) return { pos, feature: hits[0].feature };
  const nearest = [...geo.features].sort((a, b) => dist(p, a.anchor) - dist(p, b.anchor))[0];
  return nearest ? { pos, feature: nearest.feature } : undefined;
}

const EMPTY: InspectResult = {
  tiles: [], figures: [], majority: [], points: 0, complete: false, openSpots: [], blockedSpots: [],
};

function fitsSomewhere(engine: EngineApi, state: GameState, tile: string, pos: Pos): boolean {
  const type = engine.types.get(tile);
  if (!type) return false;
  return ROTATIONS.some((r: Rotation) => isLegalPlacement(engine.env, state, state.turn.player, tile, pos, r));
}

export function inspectAt(
  engine: EngineApi, state: GameState, x: number, y: number, showClosingTiles: boolean,
): InspectResult {
  const hit = featureAt(engine, state, x, y);
  if (!hit) return { ...EMPTY };
  const an = engine.analyze(state);
  const area = an.areaAt(hit.pos, hit.feature);
  if (!area) return { ...EMPTY };
  const d = describeArea(an, area);

  const seen = new Set<string>();
  const openSpots: Pos[] = [];
  const addSpot = (p: Pos) => {
    const k = posKey(p);
    if (seen.has(k) || state.board[k]) return;
    seen.add(k);
    openSpots.push({ x: p.x, y: p.y });
  };
  for (const e of d.openEdges) addSpot(neighbour(e.pos, e.edge));
  for (const p of d.openSquares) addSpot(p);

  // Alla brickor som ännu inte är lagda avgör vad som går att stänga.
  const unplaced = new Set<string>(state.drawPile);
  for (const p of state.players) for (const t of p.hand) unplaced.add(t);
  const blockedSpots = openSpots.filter((s) => ![...unplaced].some((t) => fitsSomewhere(engine, state, t, s)));

  const result: InspectResult = {
    tiles: d.tiles.map((p) => ({ x: p.x, y: p.y })),
    figures: d.figures.map((f) => f.id),
    majority: d.owners,
    points: d.value,
    complete: d.complete,
    openSpots,
    blockedSpots,
  };
  if (d.kind === "field") {
    result.completedCities = area.adjacentCities
      .filter((id) => an.areas[id]?.complete)
      .flatMap((id) => an.areas[id]!.tiles.map((p) => ({ x: p.x, y: p.y })));
  }
  if (showClosingTiles) {
    const counts: Record<string, number> = {};
    for (const s of openSpots) {
      const k = posKey(s);
      const perType = new Map<string, boolean>();
      let n = 0;
      for (const t of state.drawPile) {
        let ok = perType.get(t);
        if (ok === undefined) perType.set(t, (ok = fitsSomewhere(engine, state, t, s)));
        if (ok) n++;
      }
      counts[k] = n;
    }
    result.closingTiles = counts;
  }
  return result;
}
