// Kontroller av brickdata: struktur och kantmönster. Används av tests/tiles och kan köras för hand:
//   npx bun scripts/tiles/check.ts
import type { Edge, FieldFeature, HalfEdge, TileType } from "../../src/shared/tiles";
import { canon } from "./pdfcounts";

export const EDGES: Edge[] = ["N", "E", "S", "W"];
export const halves = (e: Edge): HalfEdge[] => [`${e}L`, `${e}R`] as HalfEdge[];

/** Kanttyp per kant (N,E,S,W): c = stad, r = väg, s = flod, f = fält. */
export function edgeTypes(t: TileType): string {
  return EDGES.map((e) => {
    for (const f of t.features) {
      if ((f.kind === "city" || f.kind === "road" || f.kind === "river") && (f as { edges: Edge[] }).edges.includes(e))
        return f.kind === "city" ? "c" : f.kind === "road" ? "r" : "s";
    }
    return "f";
  }).join("");
}

export const topology = (t: TileType): string => canon(edgeTypes(t));

/** Lista med fel; tom lista = bricktypen är strukturellt rimlig. */
export function structuralErrors(t: TileType): string[] {
  const errs: string[] = [];
  const ids = new Set<string>();
  for (const f of t.features) {
    if (ids.has(f.id)) errs.push(`${t.id}: dubblerat områdes-id ${f.id}`);
    ids.add(f.id);
  }
  const cityIds = new Set(t.features.filter((f) => f.kind === "city").map((f) => f.id));
  const seenHalves = new Map<string, number>();
  for (const ff of t.features) {
    if (ff.kind === "field") {
      const f = ff as FieldFeature;
      for (const h of f.halfEdges) seenHalves.set(h, (seenHalves.get(h) ?? 0) + 1);
      for (const c of f.adjacentCities) if (!cityIds.has(c)) errs.push(`${t.id}: ${f.id} pekar på saknad stad ${c}`);
    }
  }
  for (const e of EDGES) {
    const lin = t.features.filter(
      (f) => (f.kind === "city" || f.kind === "road" || f.kind === "river") && (f as { edges: Edge[] }).edges.includes(e),
    );
    if (lin.length > 1) errs.push(`${t.id}: kant ${e} täcks av ${lin.length} områden`);
    const isCity = lin.length === 1 && lin[0]!.kind === "city";
    for (const h of halves(e)) {
      const n = seenHalves.get(h) ?? 0;
      if (isCity && n !== 0) errs.push(`${t.id}: ${h} ligger i fält fast kanten är stad`);
      if (!isCity && n !== 1) errs.push(`${t.id}: ${h} täcks ${n} gånger av fält`);
    }
  }
  return errs;
}

if (import.meta.main) {
  const { TILE_DATA } = await import("../../src/tiles/index");
  let bad = 0;
  for (const [exp, d] of Object.entries(TILE_DATA)) {
    const total = d.set.tiles.reduce((a, t) => a + t.count, 0);
    console.log(exp, d.tiles.length, "typer,", total, "brickor");
    for (const t of d.tiles) for (const e of structuralErrors(t)) { console.log("  FEL", e); bad++; }
  }
  process.exit(bad ? 1 : 0);
}
