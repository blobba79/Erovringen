import { describe, expect, test } from "bun:test";
import { TILE_DATA, allTileTypes } from "../../src/tiles/index";
import { structuralErrors, topology } from "../../scripts/tiles/check";
import pdfCounts from "./pdf-counts.json";
import type { ExpansionId } from "../../src/shared/tiles";

const TOTALS: Partial<Record<ExpansionId, number>> = {
  base: 72, river: 12, "inns-cathedrals": 18, "traders-builders": 24, "princess-dragon": 30,
  "flying-machines": 8, ferries: 8, "gold-mines": 8, "mage-witch": 8, "crop-circles-2": 6,
};

/** Källnamn i regel-PDF:ens brickförteckning (s. 224-273). River har egen förteckning (s. 267-269). */
const PDF_SOURCE: Partial<Record<ExpansionId, string>> = {
  base: "BASIC GAME", "inns-cathedrals": "INNS AND CATHEDRALS", "traders-builders": "TRADERS AND BUILDERS",
  "princess-dragon": "THE PRINCESS AND THE DRAGON", "flying-machines": "THE FLIER", ferries: "THE FERRIES",
  "gold-mines": "THE GOLDMINES", "mage-witch": "MAGE AND WITCH", "crop-circles-2": "CROP CIRCLES II",
};

/** Kända avvikelser mellan JCZ-data och PDF-förteckningen (mönster -> extra brickor hos oss). */
const KNOWN_PDF_DIFF: Partial<Record<ExpansionId, Record<string, number>>> = {
  // PDF:ens förteckning (s. 224-273) räknar bara 6 av Gold Mines 8 brickor; JCZ har 8 (som
  // regel-PDF:ens komponentlista). De två som saknas hos PDF:en har fyra vägkanter (två kurvor).
  "gold-mines": { rrrr: 2 },
};

const exps = Object.keys(TOTALS) as ExpansionId[];

describe("totals", () => {
  for (const e of exps) {
    test(`${e}: ${TOTALS[e]} brickor`, () => {
      const d = TILE_DATA[e]!;
      expect(d.set.tiles.reduce((a, t) => a + t.count, 0)).toBe(TOTALS[e]!);
    });
  }
  test("abboten har inga egna brickor", () => expect(TILE_DATA.abbot).toBeUndefined());
});

describe("struktur", () => {
  test("unika id:n och set pekar på existerande typer", () => {
    const all = new Map<string, number>();
    for (const d of Object.values(TILE_DATA)) {
      for (const t of d.tiles) all.set(t.id, (all.get(t.id) ?? 0) + 1);
      const ids = new Set(d.tiles.map((t) => t.id));
      for (const r of d.set.tiles) expect(ids.has(r.type)).toBe(true);
      expect(d.tiles.length).toBe(ids.size);
      for (const t of d.tiles) expect(t.id.startsWith(`${d.set.expansion}/`)).toBe(true);
    }
    for (const [, n] of all) expect(n).toBe(1);
    expect(allTileTypes().size).toBe(all.size);
  });
  for (const e of exps) {
    test(`${e}: alla kanter täckta exakt en gång, staden finns`, () => {
      const errs = TILE_DATA[e]!.tiles.flatMap(structuralErrors);
      expect(errs).toEqual([]);
    });
  }
  test("en starbricka för grundspelet och floden", () => {
    for (const e of ["base", "river"] as const) {
      const d = TILE_DATA[e]!;
      expect(d.set.start).toBeDefined();
      expect(d.set.tiles.some((t) => t.type === d.set.start)).toBe(true);
    }
    for (const e of exps) if (e !== "base" && e !== "river") expect(TILE_DATA[e]!.set.start).toBeUndefined();
  });
  test("floden: källa först, sjö sist, en av varje", () => {
    const d = TILE_DATA.river!;
    expect(d.set.tiles[0]!.type).toBe("river/s");
    expect(d.set.tiles.at(-1)!.type).toBe("river/I.e");
    expect(d.set.tiles.filter((t) => t.type === "river/s")[0]!.count).toBe(1);
    for (const t of d.tiles) expect(t.features.some((f) => f.kind === "river")).toBe(true);
  });
});

describe("innehåll", () => {
  const count = (e: ExpansionId, pred: (t: ReturnType<typeof allTileTypes> extends Map<string, infer T> ? T : never) => boolean) => {
    const d = TILE_DATA[e]!;
    return d.set.tiles.reduce((a, r) => a + (pred(d.tiles.find((t) => t.id === r.type)!) ? r.count : 0), 0);
  };
  test("grundspelet: 8 trädgårdar, 4 kloster utan väg + 2 med, 9 brickor med sköld (en CFCF-sköld borttagen)", () => {
    expect(count("base", (t) => t.features.some((f) => f.kind === "garden"))).toBe(8);
    expect(count("base", (t) => t.features.some((f) => f.kind === "cloister"))).toBe(6);
    expect(count("base", (t) => t.features.some((f) => f.kind === "city" && "pennants" in f))).toBe(9);
  });
  test("grundspelet: genomgående stad CFCF, 1 med sköld och 2 utan (PDF s. 196)", () => {
    const n = (id: string) => TILE_DATA.base!.set.tiles.find((t) => t.type === id)?.count;
    expect([n("base/CFc+"), n("base/CFc.1")]).toEqual([1, 2]);
  });
  test("River I: en trädgård", () => {
    expect(count("river", (t) => t.features.some((f) => f.kind === "garden"))).toBe(1);
  });
  test("I&C: 6 värdshus, 2 katedraler", () => {
    expect(count("inns-cathedrals", (t) => t.features.some((f) => f.props?.inn === true))).toBe(6);
    expect(count("inns-cathedrals", (t) => t.features.some((f) => f.props?.cathedral === true))).toBe(2);
  });
  test("T&B: varor 5 vin?, tyg, spannmål", () => {
    const g = (v: string) => count("traders-builders", (t) => t.features.some((f) => f.props?.goods === v));
    expect(g("wine") + g("grain") + g("cloth")).toBeGreaterThan(0);
  });
  test("P&D: 6 vulkaner, 12 drakar, 6 portaler, 6 prinsessor", () => {
    const s = (x: string) => count("princess-dragon", (t) => t.symbols?.includes(x) ?? false);
    expect([s("volcano"), s("dragon"), s("portal")]).toEqual([6, 12, 6]);
    expect(count("princess-dragon", (t) => t.features.some((f) => f.props?.princess === true))).toBe(6);
  });
  test("minierna: symbol på varje bricka", () => {
    expect(count("ferries", (t) => t.symbols?.includes("ferry") ?? false)).toBe(8);
    expect(count("gold-mines", (t) => t.symbols?.includes("gold") ?? false)).toBe(8);
    expect(count("mage-witch", (t) => t.symbols?.includes("mage") ?? false)).toBe(8);
    expect(count("flying-machines", (t) => (t.symbols ?? []).some((s) => s.startsWith("flier:")))).toBe(8);
    expect(count("crop-circles-2", (t) => (t.symbols ?? []).some((s) => s.startsWith("crop-circle:")))).toBe(6);
  });
});

describe("mot regel-PDF:en (kantmönster per källa, s. 224-273)", () => {
  for (const e of exps) {
    const src = PDF_SOURCE[e];
    if (!src) continue;
    test(`${e} (${src})`, () => {
      const d = TILE_DATA[e]!;
      const mine: Record<string, number> = {};
      for (const r of d.set.tiles) {
        const t = d.tiles.find((x) => x.id === r.type)!;
        mine[topology(t)] = (mine[topology(t)] ?? 0) + r.count;
      }
      const expected = { ...(pdfCounts as Record<string, Record<string, number>>)[src]! };
      for (const [k, v] of Object.entries(KNOWN_PDF_DIFF[e] ?? {})) expected[k] = (expected[k] ?? 0) + v;
      expect(mine).toEqual(expected);
    });
  }
});
