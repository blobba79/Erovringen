// Roterade brickor: kanternas sorter och vilket område som ligger vid varje kant/halvkant.

import type { Edge, Feature, HalfEdge, Rotation, TileType } from "../shared/tiles";
import { ROTATIONS, rotateEdge, rotateHalf } from "./geometry";

export type EdgeKind = "city" | "road" | "river" | "field";

export interface RotatedTile {
  type: TileType;
  rotation: Rotation;
  /** Områdena med kanter och halvkanter roterade; id oförändrade. */
  features: Feature[];
  edgeKind: Record<Edge, EdgeKind>;
  /** Område (stad/väg/flod) vid kanten; saknas för fältkanter. */
  edgeFeature: Partial<Record<Edge, string>>;
  /** Fältområde vid halvkanten; saknas där en stad ligger. */
  halfFeature: Partial<Record<HalfEdge, string>>;
  /** Lika för rotationer som ger samma bricka (symmetri). */
  signature: string;
}

const cache = new WeakMap<TileType, RotatedTile[]>();

function rotateFeature(f: Feature, rot: Rotation): Feature {
  const g = f as unknown as { edges?: Edge[]; halfEdges?: HalfEdge[] };
  const copy: Record<string, unknown> = { ...f };
  if (g.edges) copy.edges = g.edges.map((e) => rotateEdge(e, rot));
  if (g.halfEdges) copy.halfEdges = g.halfEdges.map((h) => rotateHalf(h, rot));
  return copy as unknown as Feature;
}

function build(type: TileType, rotation: Rotation): RotatedTile {
  const features = type.features.map((f) => rotateFeature(f, rotation));
  const edgeKind = { N: "field", E: "field", S: "field", W: "field" } as Record<Edge, EdgeKind>;
  const edgeFeature: Partial<Record<Edge, string>> = {};
  const halfFeature: Partial<Record<HalfEdge, string>> = {};
  for (const f of features) {
    if (f.kind === "city" || f.kind === "road" || f.kind === "river") {
      for (const e of (f as { edges: Edge[] }).edges) {
        edgeKind[e] = f.kind as EdgeKind;
        edgeFeature[e] = f.id;
      }
    } else if (f.kind === "field") {
      for (const h of (f as { halfEdges: HalfEdge[] }).halfEdges) halfFeature[h] = f.id;
    }
  }
  const sig = features
    .map((f) => {
      const g = f as unknown as { edges?: Edge[]; halfEdges?: HalfEdge[]; pennants?: number };
      return JSON.stringify([f.kind, [...(g.edges ?? [])].sort(), [...(g.halfEdges ?? [])].sort(), g.pennants ?? 0, f.props ?? {}]);
    })
    .sort()
    .join("|");
  // En symbol med riktning (t.ex. flygmaskinens "flier:N") gör varje vridning olik de andra.
  const directed = (type.symbols ?? []).some((s) => String(s).includes(":"));
  return { type, rotation, features, edgeKind, edgeFeature, halfFeature, signature: directed ? `${sig}#${rotation}` : sig };
}

export function rotateTile(type: TileType, rotation: Rotation): RotatedTile {
  let arr = cache.get(type);
  if (!arr) {
    arr = ROTATIONS.map((r) => build(type, r));
    cache.set(type, arr);
  }
  return arr[rotation / 90] as RotatedTile;
}

/** Rotationer som ger olika brickor (symmetriska brickor ger färre än fyra). */
export function distinctRotations(type: TileType): Rotation[] {
  const seen = new Set<string>();
  const out: Rotation[] = [];
  for (const r of ROTATIONS) {
    const s = rotateTile(type, r).signature;
    if (!seen.has(s)) {
      seen.add(s);
      out.push(r);
    }
  }
  return out;
}

export function featureById(t: RotatedTile, id: string): Feature | undefined {
  return t.features.find((f) => f.id === id);
}
