// Sammanhängande områden (städer, vägar, fält, floder, kloster, trädgårdar) över hela kartan.

import type { CityFeature, Edge, Feature, FieldFeature, HalfEdge } from "../shared/tiles";
import type { Figure, Pos } from "../shared/state";
import type { FeatureRef } from "../shared/expansion";
import { neighbour, neighbours8, opposite, oppositeHalf, parseKey, posKey, comparePos } from "./geometry";
import { rotateTile } from "./tileinfo";
import { getType, tileAt, type Board, type TileTypes } from "./board";

export interface Area {
  id: number;
  /** Områdets sort: "city", "road", "field", "river", "cloister", "garden" eller en expansions egen. */
  kind: string;
  nodes: FeatureRef[];
  /** Brickor som området täcker (en gång per bricka, även om brickan har två delar av det). */
  tiles: Pos[];
  pennants: number;
  /** Kanter (stad/väg/flod) som vetter mot en tom ruta. */
  openEdges: { pos: Pos; edge: Edge }[];
  /** Kloster/trädgård: tomma rutor bland de åtta omkring. */
  openSquares: Pos[];
  /** Pjäser som står på området. */
  figures: Figure[];
  /** Fält: id på de städer (områden) som fältet gränsar till. */
  adjacentCities: number[];
  complete: boolean;
}

export interface Analysis {
  areas: Area[];
  areaAt(pos: Pos, feature: string): Area | undefined;
}

const nodeKey = (pos: Pos, id: string) => `${posKey(pos)}|${id}`;

class UnionFind {
  parent: number[] = [];
  add(): number {
    this.parent.push(this.parent.length);
    return this.parent.length - 1;
  }
  find(i: number): number {
    let r = i;
    while (this.parent[r] !== r) r = this.parent[r] as number;
    while (this.parent[i] !== r) {
      const n = this.parent[i] as number;
      this.parent[i] = r;
      i = n;
    }
    return r;
  }
  union(a: number, b: number): void {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra !== rb) this.parent[Math.max(ra, rb)] = Math.min(ra, rb);
  }
}

const isCenter = (f: Feature) => !["city", "road", "river", "field"].includes(f.kind);

export function analyze(board: Board, figures: readonly Figure[], types: TileTypes): Analysis {
  const uf = new UnionFind();
  const index = new Map<string, number>();
  const infos: { pos: Pos; feature: Feature }[] = [];
  const positions = Object.keys(board).map(parseKey).sort(comparePos);
  for (const pos of positions) {
    const placed = tileAt(board, pos)!;
    for (const feature of rotateTile(getType(types, placed.type), placed.rotation).features) {
      index.set(nodeKey(pos, feature.id), uf.add());
      infos.push({ pos, feature });
    }
  }
  const idx = (pos: Pos, id: string) => index.get(nodeKey(pos, id));

  // Förbind områden över brickornas gränser.
  for (const { pos, feature } of infos) {
    const me = idx(pos, feature.id)!;
    if (feature.kind === "city" || feature.kind === "road" || feature.kind === "river") {
      for (const e of (feature as { edges: Edge[] }).edges) {
        const npos = neighbour(pos, e);
        const nt = tileAt(board, npos);
        if (!nt) continue;
        const rt = rotateTile(getType(types, nt.type), nt.rotation);
        const other = rt.edgeFeature[opposite(e)];
        const oi = other === undefined ? undefined : idx(npos, other);
        if (oi !== undefined && rt.edgeKind[opposite(e)] === feature.kind) uf.union(me, oi);
      }
    } else if (feature.kind === "field") {
      for (const h of (feature as FieldFeature).halfEdges) {
        const npos = neighbour(pos, h[0] as Edge);
        const nt = tileAt(board, npos);
        if (!nt) continue;
        const rt = rotateTile(getType(types, nt.type), nt.rotation);
        const other = rt.halfFeature[oppositeHalf(h as HalfEdge)];
        const oi = other === undefined ? undefined : idx(npos, other);
        if (oi !== undefined) uf.union(me, oi);
      }
    }
  }

  // Samla områden.
  const byRoot = new Map<number, Area>();
  const areas: Area[] = [];
  for (const { pos, feature } of infos) {
    const root = uf.find(idx(pos, feature.id)!);
    let a = byRoot.get(root);
    if (!a) {
      a = {
        id: areas.length, kind: feature.kind, nodes: [], tiles: [], pennants: 0, openEdges: [],
        openSquares: [], figures: [], adjacentCities: [], complete: false,
      };
      byRoot.set(root, a);
      areas.push(a);
    }
    a.nodes.push({ pos, feature: feature.id });
    if (!a.tiles.some((t) => t.x === pos.x && t.y === pos.y)) a.tiles.push(pos);
    if (feature.kind === "city") a.pennants += (feature as CityFeature).pennants ?? 0;
    if (feature.kind === "city" || feature.kind === "road" || feature.kind === "river") {
      for (const e of (feature as { edges: Edge[] }).edges)
        if (!tileAt(board, neighbour(pos, e))) a.openEdges.push({ pos, edge: e });
    } else if (isCenter(feature)) {
      if (feature.kind === "cloister" || feature.kind === "garden")
        a.openSquares = neighbours8(pos).filter((p) => !tileAt(board, p));
    }
  }
  for (const { pos, feature } of infos) {
    if (feature.kind !== "field") continue;
    const a = byRoot.get(uf.find(idx(pos, feature.id)!))!;
    for (const cid of (feature as FieldFeature).adjacentCities) {
      const ci = idx(pos, cid);
      if (ci === undefined) continue;
      const cityArea = byRoot.get(uf.find(ci))!;
      if (!a.adjacentCities.includes(cityArea.id)) a.adjacentCities.push(cityArea.id);
    }
  }
  for (const a of areas) {
    if (a.kind === "city" || a.kind === "road" || a.kind === "river") a.complete = a.openEdges.length === 0;
    else if (a.kind === "cloister" || a.kind === "garden") a.complete = a.openSquares.length === 0;
  }
  const analysis: Analysis = {
    areas,
    areaAt(pos, feature) {
      const i = idx(pos, feature);
      return i === undefined ? undefined : byRoot.get(uf.find(i));
    },
  };
  for (const f of figures) {
    if (f.location.at !== "feature") continue;
    analysis.areaAt(f.location.pos, f.location.feature)?.figures.push(f);
  }
  return analysis;
}
