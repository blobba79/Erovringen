// Spelets tillstånd, delsteg och händelser. Tillståndet är ren JSON så att det kan sparas,
// skickas och spelas upp igen. Motorn ändrar det bara via `Engine.apply`.

import type { ExpansionId, Rotation } from "./tiles";

export type PlayerId = string;
export type FigureId = string;

/** Rutans läge på kartan; nyckeln i `board` är `"x,y"`. */
export interface Pos {
  x: number;
  y: number;
}
export type PosKey = `${number},${number}`;

export interface PlacedTile {
  type: string;
  pos: Pos;
  rotation: Rotation;
}

/** Pjässorter. Grundspelet har "meeple"; expansionerna lägger till sina, t.ex. "abbot", "large-meeple", "builder", "pig", "dragon", "fairy", "mage", "witch". */
export type FigureKind = string;

export type FigureLocation =
  | { at: "supply" }
  | { at: "feature"; pos: Pos; feature: string }
  /** Pjäser som står på en bricka utan att höra till ett område (t.ex. draken). */
  | { at: "tile"; pos: Pos }
  /** Pjäser som står intill en annan pjäs (t.ex. fen). */
  | { at: "figure"; figure: FigureId };

export interface Figure {
  id: FigureId;
  kind: FigureKind;
  /** null = neutral pjäs. */
  owner: PlayerId | null;
  location: FigureLocation;
}

export interface PlayerState {
  id: PlayerId;
  name: string;
  color: string;
  score: number;
  /** Brickor på hand (typ-id). Syns bara för spelaren själv. */
  hand: string[];
  /** Räknare från expansionerna, t.ex. { wine: 2, gold: 3 }. */
  counters: Record<string, number>;
}

/** Regelvarianter, nyckel = "<expansion>.<variant>", värde = valt alternativ. */
export type RuleVariants = Record<string, string>;

export interface GameSetup {
  expansions: ExpansionId[];
  variants: RuleVariants;
  /** 1 = vanliga regler. */
  handSize: number;
  showClosingTiles: boolean;
  players: { id: PlayerId; name: string; color: string }[];
  seed: number;
}

/** Ett delsteg i turen. Delsteg är preliminära tills "confirm". */
export type Step =
  | { type: "chooseTile"; handIndex: number }
  | { type: "exchangeTile"; handIndex: number }
  | { type: "placeTile"; pos: Pos; rotation: Rotation }
  | { type: "placeFigure"; kind: FigureKind; pos: Pos; feature: string }
  | { type: "noFigure" }
  | { type: "returnFigure"; figure: FigureId }
  /** Expansionernas egna handlingar, t.ex. flytta draken eller lägga en guldtacka. */
  | { type: "expansion"; expansion: ExpansionId; action: string; data: unknown }
  | { type: "undo" }
  | { type: "confirm" };

export interface TurnState {
  player: PlayerId;
  /** Turens fas, t.ex. "chooseTile", "placeTile", "placeFigure", "confirm" eller en expansions egen fas. */
  phase: string;
  /** Delsteg som gjorts men inte bekräftats; "undo" tar bort det sista. */
  pending: Step[];
}

export interface GameState {
  /** Formatets version, för att kunna läsa äldre sparade spel. */
  version: number;
  setup: GameSetup;
  rng: number;
  board: Record<PosKey, PlacedTile>;
  /** Högen, typ-id, nästa bricka först. */
  drawPile: string[];
  players: PlayerState[];
  figures: Figure[];
  turn: TurnState;
  /** Expansionernas egna data, ägs av respektive modul. */
  ext: Partial<Record<ExpansionId, unknown>>;
  finished: boolean;
}

/** Händelser driver repris, poängtickande, statistik och loggen. */
export type GameEvent =
  | { type: "turnStarted"; player: PlayerId }
  | { type: "tileDrawn"; player: PlayerId }
  | { type: "tilePlaced"; tile: PlacedTile; player: PlayerId }
  | { type: "figurePlaced"; figure: FigureId; location: FigureLocation }
  | { type: "figureReturned"; figure: FigureId }
  | { type: "featureCompleted"; pos: Pos; feature: string }
  | { type: "scored"; player: PlayerId; points: number; reason: string; pos?: Pos; feature?: string }
  | { type: "expansion"; expansion: ExpansionId; event: string; data: unknown }
  | { type: "gameEnded" };

export type ApplyResult =
  | { ok: true; state: GameState; events: GameEvent[] }
  /** `error` är en nyckel i språkfilen. */
  | { ok: false; error: string; params?: Record<string, string | number> };

/** Spelmotorns gränssnitt, används av servern och testspelarna. */
export interface Engine {
  newGame(setup: GameSetup): GameState;
  /** Alla tillåtna delsteg just nu för den spelare vars tur det är. */
  legalSteps(state: GameState): Step[];
  apply(state: GameState, player: PlayerId, step: Step): ApplyResult;
}
