// Gränssnittet som varje expansion (och grundspelets river och abbot) implementerar.
// Motorn anropar krokarna i den ordning som regel-PDF:ens turordning anger (s. 201–218).
// En modul läser och skriver bara sin egen del av `state.ext`.

import type { ExpansionId, TileSet } from "./tiles";
import type { FigureKind, GameEvent, GameState, PlayerId, Pos, Step } from "./state";

export interface FigureDefinition {
  kind: FigureKind;
  /** Antal per spelare, eller totalt om pjäsen är neutral. */
  count: number;
  neutral?: boolean;
  /** Vilka områdestyper pjäsen får stå på, t.ex. ["city", "road", "field", "cloister"]. */
  placeableOn: string[];
}

export interface RuleVariantDefinition {
  /** Nyckeln i `GameSetup.variants` blir "<expansion>.<id>". */
  id: string;
  options: string[];
  /** Hans im Glücks regel. */
  default: string;
}

export interface HookContext {
  state: GameState;
  player: PlayerId;
  emit(event: GameEvent): void;
}

export interface ExpansionHooks {
  /** Vid spelstart: lägg ut egna pjäser, sätt upp `state.ext`. */
  setup(ctx: HookContext): void;
  /** Extra tillåtna delsteg i en viss fas. */
  extraSteps(ctx: HookContext, phase: string): Step[];
  /** Begränsa var brickor får läggas (t.ex. floden). Returnera false för att förbjuda. */
  canPlaceTile(ctx: HookContext, pos: Pos, step: Extract<Step, { type: "placeTile" }>): boolean;
  /** Efter att brickan lagts (t.ex. vulkan, guld, magiker). */
  afterTilePlaced(ctx: HookContext, pos: Pos): void;
  /** Hantera ett eget delsteg ({ type: "expansion" }). */
  applyStep(ctx: HookContext, step: Extract<Step, { type: "expansion" }>): string | null;
  /** Ändra poäng för ett färdigt område (värdshus, katedral, häxa …). */
  scoreFeature(ctx: HookContext, feature: FeatureRef, points: number, final: boolean): number;
  /** Extra poäng vid spelets slut (t.ex. varor). */
  finalScoring(ctx: HookContext): void;
  /** Kan spelet ge en extra tur (byggaren)? */
  extraTurn(ctx: HookContext): boolean;
}

/** Pekar på ett sammanhängande område på kartan via en av dess delar. */
export interface FeatureRef {
  pos: Pos;
  feature: string;
}

export interface ExpansionModule {
  id: ExpansionId;
  /** Expansioner som måste vara påslagna (t.ex. Crop Circles II kräver inget, river kräver base). */
  requires?: ExpansionId[];
  tileSets: TileSet[];
  figures: FigureDefinition[];
  variants: RuleVariantDefinition[];
  hooks: Partial<ExpansionHooks>;
}
