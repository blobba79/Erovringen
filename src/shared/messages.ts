// Meddelanden över WebSocket mellan server, storskärm och telefoner.
// All text skickas som nycklar i språkfilen, aldrig som färdig text.

import type { ExpansionId } from "./tiles";
import type { FigureId, GameEvent, GameSetup, GameState, PlayerId, Pos, RuleVariants, Step } from "./state";

export type Lang = string;

export interface StartOptions {
  expansions: ExpansionId[];
  variants: RuleVariants;
  screenLang: Lang;
  handSize: number;
  showClosingTiles: boolean;
  /** Fortsätt ett sparat spel i stället för att starta ett nytt. */
  savedGame?: string;
}

export interface LobbySeat {
  player: PlayerId;
  name: string;
  color: string;
  connected: boolean;
  isHost: boolean;
}

export type HostAction = "wait" | "skip" | "remove";

/** Kartstyrning från den aktiva spelarens telefon. Värdena är förändringar. */
export type MapControl =
  | { type: "pan"; dx: number; dy: number }
  | { type: "zoom"; factor: number }
  | { type: "rotate"; degrees: number }
  | { type: "fitAll" };

export type ClientMessage =
  | { type: "helloScreen" }
  /** Ny spelare; `gameCode` kommer från QR-koden. */
  | { type: "join"; gameCode: string; name: string; color: string; lang: Lang }
  /** Återanslut till sin plats med platsens hemliga kod. */
  | { type: "rejoin"; seatToken: string }
  | { type: "setOptions"; options: StartOptions }
  | { type: "startGame" }
  | { type: "step"; step: Step }
  | { type: "showToAll"; handIndex: number }
  | { type: "map"; control: MapControl }
  /** Markera området under siktet. */
  | { type: "inspect" }
  | { type: "react"; emoji: string }
  | { type: "hostAction"; player: PlayerId; action: HostAction };

/** Det som visas för alla. Händer och dolda val är borttagna. */
export type PublicState = Omit<GameState, "players" | "rng" | "drawPile"> & {
  players: (Omit<GameState["players"][number], "hand"> & { handCount: number })[];
  drawPileCount: number;
  /** Brickräknaren: hur många av varje typ som finns kvar. */
  remaining: Record<string, number>;
};

export interface InspectResult {
  tiles: Pos[];
  figures: FigureId[];
  majority: PlayerId[];
  points: number;
  complete: boolean;
  /** Rutor som måste fyllas för att området ska bli klart. */
  openSpots: Pos[];
  /** Öppningar som inte längre går att stänga. */
  blockedSpots: Pos[];
  /** Antal brickor i högen som kan stänga varje öppning (om valt vid start). */
  closingTiles?: Record<string, number>;
  /** För fält: färdiga städer som fältet gränsar till. */
  completedCities?: Pos[];
}

export type ServerMessage =
  | { type: "welcome"; player: PlayerId; seatToken: string; isHost: boolean }
  | { type: "lobby"; seats: LobbySeat[]; options: StartOptions; gameCode: string }
  | { type: "state"; state: PublicState }
  /** Bara till spelaren själv. */
  | { type: "hand"; tiles: string[] }
  /** Tillåtna delsteg, bara till den aktiva spelaren. */
  | { type: "legalSteps"; steps: Step[] }
  | { type: "events"; events: GameEvent[] }
  | { type: "camera"; x: number; y: number; zoom: number; rotation: number }
  | { type: "inspect"; result: InspectResult }
  | { type: "reaction"; player: PlayerId; emoji: string }
  | { type: "shownTile"; player: PlayerId; tile: string }
  /** Spelare som saknas; storskärmen visar deras QR-koder. */
  | { type: "waitingFor"; seats: LobbySeat[] }
  | { type: "error"; key: string; params?: Record<string, string | number> };

export interface SavedGame {
  version: number;
  savedAt: string;
  setup: GameSetup;
  /** Alla bekräftade delsteg i ordning; spelet kan byggas upp igen från setup + steps. */
  steps: { player: PlayerId; step: Step }[];
  snapshot: GameState;
}
