// Läser brickförteckningen (s. 224-273) i regel-PDF:en och skriver tests/tiles/pdf-counts.json:
// { "<KÄLLA>": { "<kantmönster>": antal } }, mönstret är de fyra kanterna N,E,S,W som c/f/r och
// roterat till minsta form (så att mönstret inte beror på brickans rotation).
// Körs: npx bun scripts/tiles/pdfcounts.ts [sökväg till pdf]
import { writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { execFileSync } from "node:child_process";

export function canon(seq: string): string {
  const rots = [0, 1, 2, 3].map((i) => seq.slice(i) + seq.slice(0, i));
  return rots.sort()[0]!;
}

export function parsePdfText(text: string): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {};
  const lines = text.split(/\r?\n/);
  let heading: string | null = null;
  let inTable = false;
  for (const raw of lines) {
    const line = raw.trim();
    const h = /^(City|Field|Road), (city|field|road), (city|field|road), (city|field|road)$/.exec(line);
    if (h) { heading = canon(h.slice(1, 5).map((w) => w![0]!.toLowerCase()).join("")); inTable = false; continue; }
    if (/^Total\s+Source$/.test(line)) { inTable = heading !== null; continue; }
    if (!inTable || !heading) continue;
    const r = /^(\d+)\s+([A-Z][A-Z ,&'.]+)$/.exec(line);
    if (!r) continue;
    if (r[2]!.trim() === "Total" || /^Total$/i.test(r[2]!.trim())) { inTable = false; continue; }
    const src = r[2]!.trim();
    (out[src] ??= {})[heading] = Number(r[1]);
  }
  return out;
}

if (import.meta.main) {
  const here = dirname(fileURLToPath(import.meta.url));
  const candidates = [process.argv[2], join(here, "../../regler/carcassonne-rules.pdf"), "C:/Users/Lars/Erövringen/regler/carcassonne-rules.pdf"];
  const pdf = candidates.find((p): p is string => !!p && existsSync(p));
  if (!pdf) throw new Error("Hittar inte regel-PDF:en");
  const text = execFileSync("pdftotext", ["-layout", "-f", "224", "-l", "273", pdf, "-"], { encoding: "utf8", maxBuffer: 1 << 26 });
  const counts = parsePdfText(text);
  await writeFile(join(here, "../../tests/tiles/pdf-counts.json"), JSON.stringify(counts, null, 1) + "\n");
  for (const [k, v] of Object.entries(counts)) console.log(k, Object.values(v).reduce((a, b) => a + b, 0));
}
