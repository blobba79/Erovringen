// Startvalen: standardvärden, rensning av inkommande val och sparning av senaste valen i `sparade/`.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import type { StartOptions } from "../shared/messages";
import type { ExpansionModule } from "../shared/expansion";

export const MAX_HAND_SIZE = 8;

export function defaultOptions(): StartOptions {
  return { expansions: ["base"], variants: {}, screenLang: "en", handSize: 1, showClosingTiles: false };
}

/** Mappen bredvid programmet: den körbara filen, eller projektroten under utveckling. */
export function baseDir(): string {
  return isCompiled() ? dirname(process.execPath) : resolve(import.meta.dir, "..", "..");
}

/** Sant när programmet körs som färdig programfil, falskt under `bun` (utveckling och tester). */
export function isCompiled(exe: string = process.execPath): boolean {
  return !/(^|[\\/])bun(\.exe)?$/i.test(exe);
}

/**
 * Gör om vad som helst till giltiga startval. Okända expansioner och varianter tas bort,
 * grundspelet är alltid med.
 */
export function sanitizeOptions(raw: unknown, modules: ExpansionModule[], fallback: StartOptions): StartOptions {
  const o = (raw && typeof raw === "object" ? raw : {}) as Partial<StartOptions>;
  const ids = new Set(modules.map((m) => m.id));
  const asked = Array.isArray(o.expansions) ? o.expansions.filter((e) => ids.has(e)) : fallback.expansions;
  const expansions = [...new Set(["base" as const, ...asked])];
  const variants: Record<string, string> = {};
  for (const m of modules)
    for (const v of m.variants) {
      if (!expansions.includes(m.id)) continue;
      const key = `${m.id}.${v.id}`;
      const val = o.variants && typeof o.variants === "object" ? (o.variants as Record<string, unknown>)[key] : undefined;
      if (typeof val === "string" && v.options.includes(val)) variants[key] = val;
    }
  const hand = typeof o.handSize === "number" && Number.isFinite(o.handSize) ? Math.round(o.handSize) : fallback.handSize;
  const out: StartOptions = {
    expansions,
    variants,
    screenLang: typeof o.screenLang === "string" && /^[a-z]{2,8}(-[A-Za-z0-9]{2,8})?$/.test(o.screenLang) ? o.screenLang : fallback.screenLang,
    handSize: Math.min(MAX_HAND_SIZE, Math.max(1, hand)),
    showClosingTiles: typeof o.showClosingTiles === "boolean" ? o.showClosingTiles : fallback.showClosingTiles,
  };
  if (typeof o.savedGame === "string" && o.savedGame.length > 0 && o.savedGame.length < 200) out.savedGame = o.savedGame;
  return out;
}

const FILE = "startval.json";

export function loadOptions(dir: string | undefined, modules: ExpansionModule[]): StartOptions {
  const def = defaultOptions();
  if (!dir) return def;
  try {
    const file = join(dir, FILE);
    if (!existsSync(file)) return def;
    const o = sanitizeOptions(JSON.parse(readFileSync(file, "utf8")), modules, def);
    delete o.savedGame; // ett sparat spel väljs på nytt varje gång
    return o;
  } catch {
    return def;
  }
}

export function saveOptions(dir: string | undefined, options: StartOptions): void {
  if (!dir) return;
  try {
    mkdirSync(dir, { recursive: true });
    const { savedGame: _s, ...rest } = options;
    writeFileSync(join(dir, FILE), JSON.stringify(rest, null, 2));
  } catch {
    // Att inte kunna spara startvalen får inte stoppa spelet.
  }
}
