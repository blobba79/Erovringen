// Vad telefonen kommer ihåg: platskod och språk. Och vad adressen säger.

export interface StorageLike {
  getItem(k: string): string | null;
  setItem(k: string, v: string): void;
  removeItem(k: string): void;
}

export interface SavedSeat {
  token: string;
  /** Spelkoden platsen hör till, om den var känd. */
  gameCode?: string;
}

const SEAT_KEY = "erovringen.seat";
const LANG_KEY = "erovringen.lang";
const NAME_KEY = "erovringen.name";

export function parseSearch(search: string): { gameCode?: string; seatToken?: string } {
  const q = new URLSearchParams(search);
  const out: { gameCode?: string; seatToken?: string } = {};
  const g = q.get("g");
  const s = q.get("s");
  if (g) out.gameCode = g;
  if (s) out.seatToken = s;
  return out;
}

function safe<T>(f: () => T, dflt: T): T {
  try {
    return f();
  } catch {
    return dflt;
  }
}

export function loadSeat(st: StorageLike | null): SavedSeat | null {
  return safe(() => {
    const raw = st?.getItem(SEAT_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as SavedSeat;
    return typeof v.token === "string" && v.token ? v : null;
  }, null);
}

export function saveSeat(st: StorageLike | null, seat: SavedSeat): void {
  safe(() => st?.setItem(SEAT_KEY, JSON.stringify(seat)), undefined);
}

export function clearSeat(st: StorageLike | null): void {
  safe(() => st?.removeItem(SEAT_KEY), undefined);
}

export function loadLang(st: StorageLike | null): string | null {
  return safe(() => st?.getItem(LANG_KEY) ?? null, null);
}

export function saveLang(st: StorageLike | null, lang: string): void {
  safe(() => st?.setItem(LANG_KEY, lang), undefined);
}

export function loadName(st: StorageLike | null): string {
  return safe(() => st?.getItem(NAME_KEY) ?? "", "");
}

export function saveName(st: StorageLike | null, name: string): void {
  safe(() => st?.setItem(NAME_KEY, name), undefined);
}

/** Valt språk: sparat, annars telefonens, annars engelska. */
export function pickLang(saved: string | null, browser: string | undefined, available: readonly string[]): string {
  if (saved && available.includes(saved)) return saved;
  const b = (browser ?? "").toLowerCase().split("-")[0] ?? "";
  return available.includes(b) ? b : "en";
}

/** Vad som ska göras vid start: återansluta med en platskod, gå med som ny, eller be om QR-kod. */
export type StartPlan =
  | { kind: "rejoin"; seatToken: string }
  | { kind: "join"; gameCode: string }
  | { kind: "scan" };

export function planStart(search: string, saved: SavedSeat | null): StartPlan {
  const { gameCode, seatToken } = parseSearch(search);
  if (seatToken) return { kind: "rejoin", seatToken };
  if (gameCode) {
    if (saved && saved.gameCode === gameCode) return { kind: "rejoin", seatToken: saved.token };
    return { kind: "join", gameCode };
  }
  if (saved) return { kind: "rejoin", seatToken: saved.token };
  return { kind: "scan" };
}
