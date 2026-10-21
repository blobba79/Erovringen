// Hämtar JCloisterZone-Client-XML till scripts/tiles/cache/ (ska ignoreras av git).
import { mkdir, writeFile, access } from "node:fs/promises";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export const PINNED_COMMIT = "0f66860787918482131939390ea05de7e96c45a6";
export const BASE_URL = `https://raw.githubusercontent.com/farin/JCloisterZone-Client/${PINNED_COMMIT}/src/extraResources/expansions/`;
export const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), "cache");

export const FILES = [
  "basic", "river", "inns_and_cathedrals", "traders_and_builders", "princess_and_dragon",
  "flier", "ferries", "goldmines", "mage_and_witch", "corn_circles",
];

export async function fetchAll(): Promise<void> {
  await mkdir(CACHE_DIR, { recursive: true });
  for (const f of FILES) {
    const p = join(CACHE_DIR, `${f}.xml`);
    try { await access(p); continue; } catch { /* hämta */ }
    const res = await fetch(`${BASE_URL}${f}.xml`);
    if (!res.ok) throw new Error(`Kunde inte hämta ${f}.xml: ${res.status}`);
    await writeFile(p, await res.text());
  }
}

if (import.meta.main) await fetchAll();
