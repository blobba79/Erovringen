// Platser för en bricka: vilka rutor som visas för en vald kant, deras nummer och rotationerna.
// Regeln står vid EdgeChoice i src/shared/messages.ts.

import type { EdgeChoice, PublicState } from "../../shared/messages";
import type { Pos, Step } from "../../shared/state";
import type { Rotation } from "../../shared/tiles";

export interface Placement {
  pos: Pos;
  rotation: Rotation;
}

type Board = PublicState["board"];

/** Grannens riktning per sida: 0 = N, 1 = E, 2 = S, 3 = W (y växer söderut). */
export const SIDE_DELTA: readonly (readonly [number, number])[] = [
  [0, -1],
  [1, 0],
  [0, 1],
  [-1, 0],
];

export const key = (p: Pos): string => `${p.x},${p.y}`;

export function placementsOf(steps: readonly Step[]): Placement[] {
  const out: Placement[] = [];
  for (const s of steps) if (s.type === "placeTile") out.push({ pos: s.pos, rotation: s.rotation });
  return out;
}

export function hasNeighbor(board: Board, pos: Pos, side: number): boolean {
  const d = SIDE_DELTA[((side % 4) + 4) % 4]!;
  return `${pos.x + d[0]},${pos.y + d[1]}` in board;
}

/** Den oroterade brickans kant k hamnar på sidan (k + r/90) % 4. */
export const sideOf = (edge: number, rotation: Rotation): number => (edge + rotation / 90) % 4;

/** Alla tillåtna rotationer på en plats, i stigande ordning. */
export function rotationsAt(placements: readonly Placement[], pos: Pos): Rotation[] {
  return placements
    .filter((p) => p.pos.x === pos.x && p.pos.y === pos.y)
    .map((p) => p.rotation)
    .sort((a, b) => a - b);
}

/** Rotationer på platsen där den valda kanten ligger mot en befintlig bricka. */
export function rotationsForEdge(placements: readonly Placement[], board: Board, pos: Pos, edge: EdgeChoice): Rotation[] {
  const all = rotationsAt(placements, pos);
  if (edge === "all") return all;
  return all.filter((r) => hasNeighbor(board, pos, sideOf(edge, r)));
}

/** Platserna för kanten, numrerade i ordning: stigande y, sedan stigande x. */
export function spotsFor(placements: readonly Placement[], board: Board, edge: EdgeChoice): Pos[] {
  const seen = new Map<string, Pos>();
  for (const p of placements) {
    const k = key(p.pos);
    if (seen.has(k)) continue;
    if (rotationsForEdge(placements, board, p.pos, edge).length > 0) seen.set(k, p.pos);
  }
  return [...seen.values()].sort((a, b) => a.y - b.y || a.x - b.x);
}

/** Rotationen som används när spelaren väljer en plats. */
export function initialRotation(placements: readonly Placement[], board: Board, pos: Pos, edge: EdgeChoice): Rotation | null {
  return rotationsForEdge(placements, board, pos, edge)[0] ?? rotationsAt(placements, pos)[0] ?? null;
}

/** Nästa tillåtna rotation efter `current` (växlar bara mellan tillåtna). */
export function nextRotation(rotations: readonly Rotation[], current: Rotation): Rotation | null {
  if (rotations.length === 0) return null;
  return rotations.find((r) => r > current) ?? rotations[0]!;
}
