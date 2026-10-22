// Meddelanden över WebSocket mellan server, storskärm och telefoner.
// All text skickas som nycklar i språkfilen, aldrig som färdig text.

import type { Feature, ExpansionId } from "./tiles";
import type { RuleVariantDefinition } from "./expansion";
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

/**
 * Kartstyrning från den aktiva spelarens telefon. Värdena är förändringar.
 * `pan`: förflyttning i andelar av storskärmens bredd, i skärmens riktningar (servern tar hänsyn
 * till rotationen). `zoom`: faktor (>1 = närmare). `rotate`: grader medurs.
 * Storskärmen är alltid 16:9.
 */
export type MapControl =
  | { type: "pan"; dx: number; dy: number }
  | { type: "zoom"; factor: number }
  | { type: "rotate"; degrees: number }
  | { type: "fitAll" };

/**
 * Kanten på den oroterade brickan som spelaren valt (0 = N, 1 = E, 2 = S, 3 = W), eller "all".
 * En plats visas för kanten k om brickan i någon tillåten rotation r har en grannbricka
 * på sidan (k + r) % 4.
 *
 * Platserna numreras från 1 i fast ordning: uppifrån och ner (stigande y), och inom en rad
 * från vänster till höger (stigande x), alltid i kartans oroterade läge.
 */
export type EdgeChoice = 0 | 1 | 2 | 3 | "all";

/**
 * Telefonens val innan ett delsteg görs, så att storskärmen kan visa siffror och markeringar.
 * Bara den aktiva spelarens förhandsvisning skickas vidare; ett nytt delsteg nollställer den.
 */
export interface Preview {
  /** Valt kant i steget "Placera brickan"; storskärmen visar siffror på platserna. */
  edge?: EdgeChoice;
  /** Platserna för den valda kanten, i nummerordning (plats 1 först). Räknas ut av telefonen. */
  spots?: Pos[];
  /** Området som spelaren håller på att välja i steget "Välj pjäs" (innan delsteget görs). */
  feature?: { pos: Pos; feature: string };
}

/** Det som går att välja bland startvalen; servern vet vilka moduler som finns. */
export interface AvailableOptions {
  /** Valbara expansioner (grundspelet, river och abbot räknas med; "base" är alltid på). */
  expansions: ExpansionId[];
  /** Regelvarianter per expansion. */
  variants: Partial<Record<ExpansionId, RuleVariantDefinition[]>>;
  /** Språk som storskärmen kan visas på. */
  languages: Lang[];
  maxHandSize: number;
}

/** Ett sparat spel som går att fortsätta. */
export interface SavedGameInfo {
  /** Filnamnet utan ändelse; skickas i `StartOptions.savedGame`. */
  id: string;
  savedAt: string;
  players: { name: string; color: string; score: number }[];
  expansions: ExpansionId[];
  /** Antal lagda brickor. */
  tilesPlaced: number;
  /** false om filen inte går att läsa (t.ex. från en för ny version); visas men kan inte väljas. */
  readable: boolean;
}

/** En varning för nybörjare om ett väntande delsteg. Texten är en nyckel i språkfilen. */
export interface Warning {
  key: string;
  params?: Record<string, string | number>;
  /** Var på kartan varningen gäller (markeras på storskärmen om spelaren visar den). */
  pos?: Pos;
}

/** Statistik efter spelet, räknad av servern ur partiets händelser. */
export interface GameStats {
  /** Poäng för varje spelare efter varje tur (index 0 = före första turen). */
  scoreTimeline: Record<PlayerId, number>[];
  /** Poäng per spelare och orsak (samma `reason` som i händelsen "scored"). */
  pointsByReason: Record<PlayerId, Record<string, number>>;
  /**
   * Rekord, t.ex. största staden eller mest poäng från fält. `key` är en nyckel i språkfilen
   * (`stats.<id>`), `value` talet, `player` vem (null om ingen).
   */
  records: { key: string; player: PlayerId | null; value: number; pos?: Pos }[];
  turns: number;
  durationSeconds: number;
}

export type ClientMessage =
  /** Storskärmen. Servern godtar bara storskärmar från den egna datorn (localhost). */
  | { type: "helloScreen" }
  /** Ny spelare; `gameCode` kommer från QR-koden. */
  | { type: "join"; gameCode: string; name: string; color: string; lang: Lang }
  /** Återanslut till sin plats med platsens hemliga kod. */
  | { type: "rejoin"; seatToken: string }
  | { type: "setOptions"; options: StartOptions }
  | { type: "startGame" }
  | { type: "step"; step: Step }
  | { type: "showToAll"; handIndex: number }
  | { type: "preview"; preview: Preview }
  | { type: "map"; control: MapControl }
  /** Markera området under siktet. */
  | { type: "inspect" }
  | { type: "react"; emoji: string }
  /** Slå på eller av varningar för nybörjare (sparas på telefonen och skickas vid anslutning). */
  | { type: "setWarnings"; on: boolean }
  | { type: "hostAction"; player: PlayerId; action: HostAction };

/** Det som visas för alla. Händer och dolda val är borttagna. */
export type PublicState = Omit<GameState, "players" | "rng" | "drawPile"> & {
  players: (Omit<GameState["players"][number], "hand"> & { handCount: number })[];
  drawPileCount: number;
  /** Brickräknaren: hur många av varje typ som finns kvar. */
  remaining: Record<string, number>;
};

export interface InspectResult {
  /** Områdets sort (stad, väg, fält, kloster …), för rubriken. */
  kind: Feature["kind"];
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
  | {
      type: "lobby";
      seats: LobbySeat[];
      options: StartOptions;
      gameCode: string;
      available: AvailableOptions;
      /** Sparade spel, nyast först. */
      saves: SavedGameInfo[];
    }
  /**
   * Bara till storskärmen: adresserna i QR-koderna. `joinUrl` för nya spelare,
   * `seatUrls` per plats för återanslutning. Bilden hämtas från `/qr.svg?text=<adress>`.
   */
  | { type: "screenInfo"; joinUrl: string; seatUrls: Record<PlayerId, string> }
  /** Den aktiva spelarens förhandsvisning, till storskärmen. */
  | { type: "preview"; player: PlayerId; preview: Preview }
  | { type: "state"; state: PublicState }
  /** Bara till spelaren själv. */
  | { type: "hand"; tiles: string[] }
  /** Tillåtna delsteg, bara till den aktiva spelaren. */
  | { type: "legalSteps"; steps: Step[] }
  | { type: "events"; events: GameEvent[] }
  /**
   * Kameran, till storskärmen. `x`, `y`: kartpunkten mitt på skärmen (= siktet), i rutor;
   * ruta (0,0) har sin mittpunkt i (0,0), y växer söderut. `zoom`: hur många rutor som syns
   * över skärmens bredd. `rotation`: grader medurs, 0 = norr uppåt.
   */
  | { type: "camera"; x: number; y: number; zoom: number; rotation: number }
  | { type: "inspect"; result: InspectResult }
  | { type: "reaction"; player: PlayerId; emoji: string }
  | { type: "shownTile"; player: PlayerId; tile: string }
  /** Spelare som saknas; storskärmen visar deras QR-koder. */
  | { type: "waitingFor"; seats: LobbySeat[] }
  /** Bara till den aktiva spelaren, om varningar är påslagna: gäller de väntande delstegen. */
  | { type: "warnings"; warnings: Warning[] }
  /** Till alla när spelet är slut. */
  | { type: "stats"; stats: GameStats }
  | { type: "error"; key: string; params?: Record<string, string | number> };

export interface SavedGame {
  version: number;
  savedAt: string;
  setup: GameSetup;
  /** Alla bekräftade delsteg i ordning; spelet kan byggas upp igen från setup + steps. */
  steps: { player: PlayerId; step: Step }[];
  snapshot: GameState;
}
