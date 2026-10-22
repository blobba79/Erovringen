// Konverterar JCloisterZone-XML (cache/) till src/tiles/<expansion>.json.
// Körs: npx bun scripts/tiles/convert.ts
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { Edge, ExpansionId, Feature, HalfEdge, TileSet, TileType } from "../../src/shared/tiles";
import { CACHE_DIR, PINNED_COMMIT, fetchAll } from "./fetch";
import { parseXml, findAll, type XNode } from "./xml";

interface Source {
  expansion: ExpansionId;
  file: string;
  set: string;
  /** Brickor (JCZ-id) som ska med trots att de inte står i mängden, eller bara dessa. */
  start?: string;
}

export const SOURCES: Source[] = [
  { expansion: "base", file: "basic", set: "basic:2", start: "BA/RCr" },
  { expansion: "river", file: "river", set: "river/1:2", start: "RI/s" },
  { expansion: "inns-cathedrals", file: "inns_and_cathedrals", set: "inns-and-cathedrals:1" },
  { expansion: "traders-builders", file: "traders_and_builders", set: "traders-and-builders:1" },
  { expansion: "princess-dragon", file: "princess_and_dragon", set: "princess-and-dragon:1" },
  { expansion: "flying-machines", file: "flier", set: "flier:1" },
  { expansion: "ferries", file: "ferries", set: "ferries" },
  { expansion: "gold-mines", file: "goldmines", set: "goldmines" },
  { expansion: "mage-witch", file: "mage_and_witch", set: "mage-and-witch:1" },
  { expansion: "crop-circles-2", file: "corn_circles", set: "corn-circles/2" },
];

const edges = (s: string): Edge[] => s.trim().split(/\s+/).filter(Boolean) as Edge[];

export function convertTile(expansion: ExpansionId, t: XNode): TileType {
  const features: Feature[] = [];
  const symbols: string[] = [];
  const cityIdByEdge = new Map<string, string>();
  const n = { city: 0, road: 0, river: 0, field: 0 };
  // Städer först, så att fältens adjacentCities kan slås upp.
  for (const c of t.children.filter((c) => c.name === "city")) {
    const id = `city${n.city++}`;
    const es = edges(c.text);
    es.forEach((e) => cityIdByEdge.set(e, id));
    const props: Record<string, string | number | boolean> = {};
    if (c.attrs.cathedral === "true") props.cathedral = true;
    if (c.attrs.princess === "true") props.princess = true;
    if (c.attrs.resource) props.goods = c.attrs.resource;
    const pennants = Number(c.attrs.pennants ?? 0);
    features.push({
      id, kind: "city", edges: es,
      ...(pennants > 0 ? { pennants } : {}),
      ...(Object.keys(props).length ? { props } : {}),
    });
  }
  for (const c of t.children) {
    switch (c.name) {
      case "road": {
        const props: Record<string, string | number | boolean> = {};
        if (c.attrs.inn === "true") props.inn = true;
        if (c.attrs.tunnel === "true") props.tunnel = true;
        features.push({
          id: `road${n.road++}`, kind: "road", edges: edges(c.text),
          ...(Object.keys(props).length ? { props } : {}),
        });
        break;
      }
      case "river":
        features.push({ id: `river${n.river++}`, kind: "river", edges: edges(c.text) });
        break;
      case "field": {
        const adj = (c.attrs.city ?? "").split(/\s+/).filter(Boolean).map((e) => {
          const id = cityIdByEdge.get(e);
          if (!id) throw new Error(`${t.attrs.id}: fält pekar på stadskant ${e} utan stad`);
          return id;
        });
        features.push({
          id: `field${n.field++}`, kind: "field",
          halfEdges: c.text.trim().split(/\s+/) as HalfEdge[],
          adjacentCities: [...new Set(adj)],
        });
        break;
      }
      case "monastery": features.push({ id: "cloister", kind: "cloister" }); break;
      case "garden": features.push({ id: "garden", kind: "garden" }); break;
      case "volcano": case "dragon": case "portal": case "mage": case "ferry":
        symbols.push(c.name); break;
      case "goldmine": symbols.push("gold"); break;
      case "flying-machine": symbols.push(`flier:${c.attrs.direction}`); break;
      case "corn-circle": symbols.push(`crop-circle:${(c.attrs.type ?? "").toLowerCase()}`); break;
      case "city": break;
      default: throw new Error(`${t.attrs.id}: okänt element <${c.name}>`);
    }
  }
  return {
    id: `${expansion}/${t.attrs.id!.replace(/^[^/]*\//, "")}`,
    expansion, features,
    ...(symbols.length ? { symbols } : {}),
  };
}

export function convertSource(src: Source, xml: string): { tiles: TileType[]; set: TileSet } {
  const doc = parseXml(xml);
  const defs = new Map<string, XNode>();
  for (const t of findAll(doc, "tile")) defs.set(t.attrs.id!, t);
  const set = findAll(doc, "tile-set").find((s) => s.attrs.id === src.set);
  if (!set) throw new Error(`Mängden ${src.set} saknas`);
  let refs = set.children.filter((c) => c.name === "ref").map((r) => ({ jcz: r.attrs.tile!, count: Number(r.attrs.count) }));
  if (src.set === "basic:2") {
    // Avvikelse från JCZ: i nya utgåvan (New Carcassonne, regel-PDF:en s. 196) har en av de genomgående
    // städerna med sköld (CFCF) fått skölden borttagen: 1 med sköld och 2 utan, inte 2 + 1 som JCZ har.
    const fix: Record<string, number> = { "BA/CFc+": 1, "BA/CFc.1": 2 };
    refs = refs.map((r) => (r.jcz in fix ? { ...r, count: fix[r.jcz]! } : r));
  }
  if (src.expansion === "river") {
    // Källa utan start/sjö-ordning: källan först, sjön sist.
    const lake = refs.filter((r) => defs.get(r.jcz)?.attrs.group === "river-lake");
    refs = [...refs.filter((r) => !lake.includes(r)), ...lake];
    const spring = refs.findIndex((r) => r.jcz === "RI/s");
    refs.unshift(...refs.splice(spring, 1));
  }
  const tiles = refs.map((r) => {
    const d = defs.get(r.jcz);
    if (!d) throw new Error(`Bricka ${r.jcz} saknas`);
    return convertTile(src.expansion, d);
  });
  const toId = (jcz: string) => `${src.expansion}/${jcz.replace(/^[^/]*\//, "")}`;
  return {
    tiles,
    set: {
      expansion: src.expansion,
      source: `jcz@${PINNED_COMMIT.slice(0, 10)}:${src.set}`,
      tiles: refs.map((r) => ({ type: toId(r.jcz), count: r.count })),
      ...(src.start ? { start: toId(src.start) } : {}),
    },
  };
}

if (import.meta.main) {
  await fetchAll();
  const out = join(dirname(fileURLToPath(import.meta.url)), "../../src/tiles");
  await mkdir(out, { recursive: true });
  for (const s of SOURCES) {
    const xml = await readFile(join(CACHE_DIR, `${s.file}.xml`), "utf8");
    const { tiles, set } = convertSource(s, xml);
    await writeFile(join(out, `${s.expansion}.json`), JSON.stringify({ set, tiles }, null, 1) + "\n");
    console.log(s.expansion, tiles.length, "typer", set.tiles.reduce((a, t) => a + t.count, 0), "brickor");
  }
}
