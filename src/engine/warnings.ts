// Varningar för nybörjare om den aktiva spelarens väntande delsteg (fas 3).
// `state` är tillståndet efter de väntande delstegen; ögonblicksbilden från turens början finns i
// `state.ext.base.snapshot`. Hellre inga falsklarm än heltäckande: varje varning bygger på säkra fakta.

import type { GameState, PlayerId, Pos } from "../shared/state";
import type { TileType } from "../shared/tiles";
import type { Warning } from "../shared/messages";
import { fitsGeometry, getType, toTileTypes, type TileTypes } from "./board";
import { baseExt } from "./context";
import { analyze, type Area } from "./features";
import { ROTATIONS, neighbour } from "./geometry";
import { areaValue, majorityOwners } from "./scoring";
import { rotateTile } from "./tileinfo";
import { allTileTypes } from "../tiles/index";

let defaultTypes: TileTypes | undefined;

/**
 * Varningar för `state.turn.pending`. Tom lista om inget är värt att varna för.
 * `types` är brickdata (standard: alla brickor i `src/tiles`).
 */
export function stepWarnings(
  state: GameState, player: PlayerId, types?: Iterable<TileType> | Map<string, TileType>,
): Warning[] {
  const pending = state.turn.pending;
  if (state.finished || state.turn.player !== player || pending.length === 0) return [];
  const placed = pending.find((s) => s.type === "placeTile");
  const placedFig = pending.find((s) => s.type === "placeFigure");
  if (!placed && !placedFig) return [];
  const tt = types ? toTileTypes(types) : (defaultTypes ??= toTileTypes(allTileTypes()));
  const out: Warning[] = [];
  const an = analyze(state.board, state.figures, tt);
  const snap = baseExt(state)?.snapshot;
  const before = snap ? analyze(snap.board, snap.figures, tt) : undefined;
  const nameOf = (id: PlayerId) => state.players.find((p) => p.id === id)?.name ?? id;
  const pool = remainingTypes(state, tt);

  // Områden (stad/väg) där spelaren har pjäs och som inte går att avsluta.
  const newFigureId = placedFig && snap ? justPlacedFigure(state, snap, player) : undefined;
  const seen = new Set<number>();
  for (const f of state.figures) {
    if (f.owner !== player || f.location.at !== "feature") continue;
    const a = an.areaAt(f.location.pos, f.location.feature);
    if (!a || seen.has(a.id) || (a.kind !== "city" && a.kind !== "road") || a.complete) continue;
    const pos = unfinishableOpening(a, state.board, tt, pool);
    if (!pos) continue;
    seen.add(a.id);
    if (newFigureId === f.id) {
      out.push({ key: "warning.figureUnfinishable", params: { area: a.kind }, pos });
    } else if (before && snap) {
      const ba = before.areaAt(f.location.pos, f.location.feature);
      if (ba && !unfinishableOpening(ba, snap.board, tt, pool)) {
        out.push({ key: "warning.tileBlocks", params: { area: a.kind }, pos });
      }
    }
  }

  // Sista pjäsen i förrådet.
  if (placedFig && placedFig.type === "placeFigure") {
    const left = state.figures.filter(
      (f) => f.owner === player && f.kind === placedFig.kind && f.location.at === "supply",
    ).length;
    if (left === 0) out.push({ key: "warning.lastFigure", params: { kind: placedFig.kind }, pos: placedFig.pos });
  }

  if (placed && placed.type === "placeTile" && before) {
    // Motståndare får majoritet, eller lika, där spelaren hade majoritet.
    const done = new Set<number>();
    for (const ba of before.areas) {
      if (ba.kind !== "city" && ba.kind !== "road" && ba.kind !== "field") continue;
      const bo = majorityOwners(ba);
      if (!bo.includes(player) || bo.some((p) => p !== player)) continue;
      const node = ba.nodes[0]!;
      const a = an.areaAt(node.pos, node.feature);
      if (!a || a.complete || done.has(a.id)) continue;
      const owners = majorityOwners(a);
      const rivals = owners.filter((p) => p !== player);
      if (rivals.length === 0) continue;
      done.add(a.id);
      out.push({
        key: owners.includes(player) ? "warning.majorityTied" : "warning.majorityLost",
        params: { area: a.kind, player: nameOf(rivals[0]!) },
        pos: placed.pos,
      });
    }
    // Stänger ett område som bara en motståndare får poäng för.
    for (const a of an.areas) {
      if (!a.complete || !["city", "road", "cloister", "garden"].includes(a.kind)) continue;
      if (!a.tiles.some((t) => t.x === placed.pos.x && t.y === placed.pos.y)) continue;
      const owners = majorityOwners(a);
      if (owners.length === 0 || owners.includes(player)) continue;
      const points = areaValue(an, a);
      if (points <= 0) continue;
      out.push({
        key: "warning.opponentScores",
        params: { area: a.kind, player: nameOf(owners[0]!), points },
        pos: placed.pos,
      });
    }
  }
  return out;
}

/** Pjäsen som ställdes under turen (låg i förrådet i ögonblicksbilden). */
function justPlacedFigure(state: GameState, snap: GameState, player: PlayerId): string | undefined {
  return state.figures.find(
    (f) => f.owner === player && f.location.at === "feature" &&
      snap.figures.find((g) => g.id === f.id)?.location.at === "supply",
  )?.id;
}

/** Brickstyper som ännu kan komma: högen och alla händer (utan dubbletter). */
function remainingTypes(state: GameState, types: TileTypes): TileType[] {
  const ids = new Set<string>(state.drawPile);
  for (const p of state.players) for (const t of p.hand) ids.add(t);
  return [...ids].map((id) => types.get(id)).filter((t): t is TileType => !!t);
}

/**
 * Första öppningen (tom ruta intill en öppen kant) som ingen återstående bricka kan fylla,
 * eller undefined. Är inga brickor kvar alls (spelet slutar) varnas inte.
 */
function unfinishableOpening(a: Area, board: GameState["board"], types: TileTypes, pool: TileType[]): Pos | undefined {
  if (pool.length === 0) return undefined;
  const cache = new Map<string, boolean>();
  for (const { pos, edge } of a.openEdges) {
    const sq = neighbour(pos, edge);
    const k = `${sq.x},${sq.y}`;
    let fits = cache.get(k);
    if (fits === undefined) {
      fits = pool.some((t) =>
        ROTATIONS.some((r) => fitsGeometry(board, types, rotateTile(getType(types, t.id), r), sq)));
      cache.set(k, fits);
    }
    if (!fits) return sq;
  }
  return undefined;
}
