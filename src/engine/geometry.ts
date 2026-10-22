// Rutnätets geometri. x växer åt öster, y växer åt söder (norr = y - 1), som på skärmen.

import type { Edge, HalfEdge, Rotation } from "../shared/tiles";
import type { Pos, PosKey } from "../shared/state";

export const EDGES: readonly Edge[] = ["N", "E", "S", "W"];
export const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];

export function posKey(p: Pos): PosKey {
  return `${p.x},${p.y}`;
}

export function parseKey(k: string): Pos {
  const [x, y] = k.split(",");
  return { x: Number(x), y: Number(y) };
}

export function samePos(a: Pos, b: Pos): boolean {
  return a.x === b.x && a.y === b.y;
}

const DELTA: Record<Edge, Pos> = {
  N: { x: 0, y: -1 },
  E: { x: 1, y: 0 },
  S: { x: 0, y: 1 },
  W: { x: -1, y: 0 },
};

export function edgeIndex(e: Edge): number {
  return EDGES.indexOf(e);
}

export function edgeFromIndex(i: number): Edge {
  return EDGES[((i % 4) + 4) % 4] as Edge;
}

export function opposite(e: Edge): Edge {
  return edgeFromIndex(edgeIndex(e) + 2);
}

/** Medurs rotation av en kant. */
export function rotateEdge(e: Edge, rot: Rotation): Edge {
  return edgeFromIndex(edgeIndex(e) + rot / 90);
}

/** Halvkantens sida (L/R) bevaras vid rotation, bara kanten flyttas. */
export function rotateHalf(h: HalfEdge, rot: Rotation): HalfEdge {
  return (rotateEdge(h[0] as Edge, rot) + h[1]) as HalfEdge;
}

/** Halvkanten på grannbrickan som ligger mot denna (NL mot grannens SR osv.). */
export function oppositeHalf(h: HalfEdge): HalfEdge {
  return (opposite(h[0] as Edge) + (h[1] === "L" ? "R" : "L")) as HalfEdge;
}

export function neighbour(p: Pos, e: Edge): Pos {
  const d = DELTA[e];
  return { x: p.x + d.x, y: p.y + d.y };
}

/** De åtta rutorna runt p (för kloster och trädgårdar). */
export function neighbours8(p: Pos): Pos[] {
  const out: Pos[] = [];
  for (let dy = -1; dy <= 1; dy++)
    for (let dx = -1; dx <= 1; dx++) if (dx || dy) out.push({ x: p.x + dx, y: p.y + dy });
  return out;
}

/** Fast ordning vänster till höger, uppifrån och ner (för numrerade platser). */
export function comparePos(a: Pos, b: Pos): number {
  return a.y - b.y || a.x - b.x;
}

/** Kanten på a som vetter mot den angränsande rutan b, eller null. */
export function edgeBetween(a: Pos, b: Pos): Edge | null {
  for (const e of EDGES) {
    const n = neighbour(a, e);
    if (n.x === b.x && n.y === b.y) return e;
  }
  return null;
}
