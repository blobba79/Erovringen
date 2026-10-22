// Skärmens modell och hur serverns meddelanden ändrar den. Ren funktion, lätt att testa.

import type { InspectResult, LobbySeat, Preview, PublicState, ServerMessage, StartOptions } from "../shared/messages";
import type { Camera } from "./logic";

export interface Model {
  connected: boolean;
  /** Språk för storskärmen (från startvalen). */
  lang: string;
  lobby?: { seats: LobbySeat[]; options: StartOptions; gameCode: string };
  screenInfo?: { joinUrl: string; seatUrls: Record<string, string> };
  state?: PublicState;
  /** Målkameran från servern. */
  camera?: Camera;
  preview?: { player: string; preview: Preview };
  inspect?: InspectResult;
  waiting: LobbySeat[];
  /** Alla platser saknas (omstart): visa en QR-kod i taget. */
  restart: boolean;
  /** Antal state-meddelanden, så att vyn märker att något ändrats. */
  stateVersion: number;
  errorKey?: string;
}

export const initialModel: Model = { connected: false, lang: "en", waiting: [], restart: false, stateVersion: 0 };

export function reduce(m: Model, msg: ServerMessage): Model {
  switch (msg.type) {
    case "lobby":
      return { ...m, lobby: { seats: msg.seats, options: msg.options, gameCode: msg.gameCode }, lang: msg.options.screenLang || m.lang };
    case "screenInfo":
      return { ...m, screenInfo: { joinUrl: msg.joinUrl, seatUrls: msg.seatUrls } };
    case "state":
      // Ett nytt tillstånd nollställer förhandsvisning och markering.
      return { ...m, state: msg.state, preview: undefined, inspect: undefined, stateVersion: m.stateVersion + 1, errorKey: undefined };
    case "camera":
      return { ...m, camera: { x: msg.x, y: msg.y, zoom: msg.zoom, rotation: msg.rotation } };
    case "preview":
      return { ...m, preview: { player: msg.player, preview: msg.preview } };
    case "inspect":
      return { ...m, inspect: msg.result };
    case "waitingFor": {
      if (msg.seats.length === 0) return { ...m, waiting: [], restart: false };
      const total = m.state?.players.length ?? m.lobby?.seats.length ?? 0;
      const restart = m.restart || (total > 0 && msg.seats.length >= total && msg.seats.every((s) => !s.connected));
      return { ...m, waiting: msg.seats, restart };
    }
    case "error":
      return { ...m, errorKey: msg.key };
    default:
      return m;
  }
}

/** Platserna som ska visas som QR-koder: en i taget efter omstart, annars alla som saknas. */
export function seatsToShow(m: Pick<Model, "waiting" | "restart">): LobbySeat[] {
  const missing = m.waiting.filter((s) => !s.connected);
  return m.restart ? missing.slice(0, 1) : missing;
}
