// Sparade spel: `sparade/<id>.json` i formatet SavedGame (plus några extra fält som äldre läsare
// ignorerar). Inget här får kasta fel utåt: en trasig fil är bara "inte läsbar".

import type { FileStore } from "./store";
import type { SavedGame, SavedGameInfo } from "../shared/messages";
import type { TrackerData } from "./stats";

export const SAVE_VERSION = 1;
const RESERVED = new Set(["startval"]);

export interface SaveFile extends SavedGame {
  /** Speltid hittills, så att statistiken blir densamma efter ett avbrott. */
  elapsedSeconds?: number;
  /** Statistikräknaren, används när spelet inte går att spela om från `steps`. */
  stats?: TrackerData;
}

export const isSafeId = (id: unknown): id is string => typeof id === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(id) && !RESERVED.has(id);

export function newSaveId(d = new Date()): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

const isObj = (x: unknown): x is Record<string, unknown> => !!x && typeof x === "object" && !Array.isArray(x);

/** Är det ett sparat spel vi kan använda? `maxStateVersion` och `known` stänger ute nya versioner och okända expansioner. */
export function validateSave(x: unknown, maxStateVersion: number, known: Set<string>): x is SaveFile {
  if (!isObj(x) || typeof x.version !== "number" || x.version < 1 || x.version > SAVE_VERSION) return false;
  const setup = x.setup, snap = x.snapshot;
  if (!isObj(setup) || !Array.isArray(setup.players) || setup.players.length === 0) return false;
  if (!setup.players.every((p) => isObj(p) && typeof p.id === "string" && typeof p.name === "string" && typeof p.color === "string")) return false;
  if (!Array.isArray(setup.expansions) || !setup.expansions.every((e) => typeof e === "string" && known.has(e))) return false;
  if (!Array.isArray(x.steps)) return false;
  if (!isObj(snap) || typeof snap.version !== "number" || snap.version > maxStateVersion) return false;
  if (!Array.isArray(snap.players) || !isObj(snap.board) || !isObj(snap.turn)) return false;
  return snap.players.every((p) => isObj(p) && typeof p.id === "string" && typeof p.score === "number");
}

export function readSave(store: FileStore | undefined, id: string, maxStateVersion: number, known: Set<string>): SaveFile | null {
  if (!store || !isSafeId(id)) return null;
  try {
    const text = store.read(`${id}.json`);
    if (text === null) return null;
    const raw = JSON.parse(text);
    return validateSave(raw, maxStateVersion, known) ? raw : null;
  } catch {
    return null;
  }
}

export function writeSave(store: FileStore | undefined, id: string, file: SaveFile): boolean {
  if (!store || !isSafeId(id)) return false;
  try {
    return store.write(`${id}.json`, JSON.stringify(file));
  } catch {
    return false;
  }
}

/** Alla sparade spel, nyast först. Oläsliga filer ingår med `readable: false`. */
export function listSaves(store: FileStore | undefined, maxStateVersion: number, known: Set<string>): SavedGameInfo[] {
  if (!store) return [];
  const out: (SavedGameInfo & { t: number })[] = [];
  let names: string[] = [];
  try {
    names = store.list().filter((n) => n.endsWith(".json"));
  } catch {
    return [];
  }
  for (const n of names) {
    const id = n.slice(0, -5);
    if (!isSafeId(id)) continue;
    let mtime = 0;
    try {
      mtime = store.modified?.(n) ?? 0;
    } catch {
      /* ignoreras */
    }
    const save = readSave(store, id, maxStateVersion, known);
    if (!save) {
      out.push({ id, savedAt: new Date(mtime).toISOString(), players: [], expansions: [], tilesPlaced: 0, readable: false, t: mtime });
      continue;
    }
    const t = Date.parse(save.savedAt);
    out.push({
      id,
      savedAt: typeof save.savedAt === "string" ? save.savedAt : new Date(mtime).toISOString(),
      players: save.snapshot.players.map((p) => ({ name: p.name, color: p.color, score: p.score })),
      expansions: [...save.setup.expansions],
      tilesPlaced: Object.keys(save.snapshot.board).length,
      readable: true,
      t: Number.isFinite(t) ? t : mtime,
    });
  }
  out.sort((a, b) => b.t - a.t);
  return out.map(({ t: _t, ...rest }) => rest);
}
