// Skärmens modell och hur serverns meddelanden ändrar den. Ren funktion, lätt att testa.

import type { GameStats, InspectResult, LobbySeat, Preview, PublicState, SavedGameInfo, ServerMessage, StartOptions } from "../shared/messages";
import type { Figure, GameEvent, PlayerId } from "../shared/state";
import type { Camera } from "./logic";
import { type DiceShown, nextDice } from "./marks";

export interface Model {
  connected: boolean;
  /** Språk för storskärmen (från startvalen). */
  lang: string;
  lobby?: { seats: LobbySeat[]; options: StartOptions; gameCode: string; saves: SavedGameInfo[] };
  screenInfo?: { joinUrl: string; seatUrls: Record<string, string> };
  state?: PublicState;
  /** Målkameran från servern. */
  camera?: Camera;
  preview?: { player: string; preview: Preview };
  inspect?: InspectResult;
  /** Pjäserna i förra tillståndet, för att kunna visa pjäser som tas tillbaka i repris. */
  prevFigures: Figure[];
  /** Senaste händelserna; `seq` räknas upp så att vyn startar en ny repris. */
  events?: { seq: number; events: GameEvent[] };
  /** Senaste snabbreaktionen (vyn håller själv reda på hur länge den visas). */
  reaction?: { seq: number; player: PlayerId; emoji: string };
  /** Brickan som spelaren visat för alla, tills turen tar slut. */
  shownTile?: { player: PlayerId; tile: string };
  stats?: GameStats;
  /** Flygmaskinens tärning som visas en stund; en gång per tur. */
  dice?: DiceShown;
  /** Nyckel för senast visade tärningen (så att samma händelse inte visas två gånger). */
  lastDice?: string;
  remainingShown: boolean;
  waiting: LobbySeat[];
  /** Alla platser saknas (omstart): visa en QR-kod i taget. */
  restart: boolean;
  /** Antal state-meddelanden, så att vyn märker att något ändrats. */
  stateVersion: number;
  errorKey?: string;
}

export const initialModel: Model = { connected: false, lang: "en", remainingShown: false, waiting: [], restart: false, stateVersion: 0, prevFigures: [] };

export function reduce(m: Model, msg: ServerMessage): Model {
  switch (msg.type) {
    case "lobby":
      return { ...m, lobby: { seats: msg.seats, options: msg.options, gameCode: msg.gameCode, saves: msg.saves ?? [] }, lang: msg.options.screenLang || m.lang };
    case "screenInfo":
      return { ...m, screenInfo: { joinUrl: msg.joinUrl, seatUrls: msg.seatUrls } };
    case "state":
      // Ett nytt tillstånd nollställer förhandsvisning och markering.
      return {
        ...m, state: msg.state, preview: undefined, inspect: undefined, stateVersion: m.stateVersion + 1, errorKey: undefined,
        prevFigures: m.state?.figures ?? [],
        shownTile: keepShownTile(m.shownTile, msg.state),
      };
    case "events": {
      // Ett bekräftat drag: den visade brickan hör till turen som just tagit slut.
      const turnOver = msg.events.some((e) => e.type === "tilePlaced" || e.type === "turnStarted");
      const nd = nextDice(msg.events, m.lastDice, m.dice?.seq ?? 0);
      return { ...m, events: { seq: (m.events?.seq ?? 0) + 1, events: msg.events }, shownTile: turnOver ? undefined : m.shownTile, ...(nd.dice ? { dice: nd.dice } : {}), lastDice: nd.last };
    }
    case "reaction":
      return { ...m, reaction: { seq: (m.reaction?.seq ?? 0) + 1, player: msg.player, emoji: msg.emoji } };
    case "shownTile":
      return { ...m, shownTile: { player: msg.player, tile: msg.tile } };
    case "remainingShown":
      return { ...m, remainingShown: msg.on };
    case "stats":
      return { ...m, stats: msg.stats };
    case "camera":
      return { ...m, camera: { x: msg.x, y: msg.y, zoom: msg.zoom, rotation: msg.rotation } };
    case "preview":
      return { ...m, preview: { player: msg.player, preview: msg.preview } };
    case "inspect":
      return { ...m, inspect: msg.result };
    case "waitingFor": {
      if (msg.seats.length === 0) return { ...m, waiting: [], restart: false };
      // Datorspelare har ingen telefon och räknas inte med.
      const total = m.state?.setup.players.filter((p) => !p.bot).length ?? m.lobby?.seats.filter((x) => !x.bot).length ?? 0;
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

/** Den visade brickan ligger kvar så länge samma spelare har turen. */
export function keepShownTile(shown: Model["shownTile"], state: PublicState): Model["shownTile"] {
  if (!shown || state.finished || state.turn.player !== shown.player) return undefined;
  return shown;
}
