// Kartan: grannar, lediga platser och om en bricka passar geometriskt (kantmatchning).

import type { Rotation, TileType } from "../shared/tiles";
import type { GameState, PlacedTile, Pos } from "../shared/state";
import { EDGES, ROTATIONS, comparePos, neighbour, opposite, parseKey, posKey } from "./geometry";
import { rotateTile, type RotatedTile } from "./tileinfo";

export type Board = GameState["board"];
export type TileTypes = Map<string, TileType>;

export function toTileTypes(src: Iterable<TileType> | Map<string, TileType>): TileTypes {
  if (src instanceof Map) return src;
  const m: TileTypes = new Map();
  for (const t of src) m.set(t.id, t);
  return m;
}

export function getType(types: TileTypes, id: string): TileType {
  const t = types.get(id);
  if (!t) throw new Error(`unknown tile type ${id}`);
  return t;
}

export function tileAt(board: Board, p: Pos): PlacedTile | undefined {
  return board[posKey(p)];
}

export function rotatedAt(board: Board, types: TileTypes, p: Pos): RotatedTile | undefined {
  const t = tileAt(board, p);
  return t ? rotateTile(getType(types, t.type), t.rotation) : undefined;
}

/** Lediga rutor som gränsar till minst en bricka, i fast ordning (vänster till höger, uppifrån och ner). */
export function frontier(board: Board): Pos[] {
  const seen = new Set<string>();
  const out: Pos[] = [];
  for (const k of Object.keys(board)) {
    const p = parseKey(k);
    for (const e of EDGES) {
      const n = neighbour(p, e);
      const nk = posKey(n);
      if (!board[nk] && !seen.has(nk)) {
        seen.add(nk);
        out.push(n);
      }
    }
  }
  return out.sort(comparePos);
}

/** Alla kanter mot grannar måste passa (samma sort) och minst en granne måste finnas. */
export function fitsGeometry(board: Board, types: TileTypes, rt: RotatedTile, pos: Pos): boolean {
  if (board[posKey(pos)]) return false;
  let touching = false;
  for (const e of EDGES) {
    const nb = rotatedAt(board, types, neighbour(pos, e));
    if (!nb) continue;
    touching = true;
    if (nb.edgeKind[opposite(e)] !== rt.edgeKind[e]) return false;
  }
  return touching;
}

/** Alla geometriskt tillåtna (plats, rotation) för en brickstyp, utan expansionernas regler. */
export function geometricPlacements(
  board: Board,
  types: TileTypes,
  typeId: string,
): { pos: Pos; rotation: Rotation }[] {
  const type = getType(types, typeId);
  const out: { pos: Pos; rotation: Rotation }[] = [];
  for (const pos of frontier(board)) {
    for (const rotation of ROTATIONS) {
      if (fitsGeometry(board, types, rotateTile(type, rotation), pos)) out.push({ pos, rotation });
    }
  }
  return out;
}
