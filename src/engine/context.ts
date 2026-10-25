// Gemensamma typer för motorns delar: miljön (moduler och brickor) och krokarnas utvidgade sammanhang.

import type { ExpansionModule, HookContext } from "../shared/expansion";
import type { Edge } from "../shared/tiles";
import type { Figure, GameEvent, GameSetup, GameState, PlayerId, Pos } from "../shared/state";
import type { TileTypes } from "./board";
import type { Area } from "./features";

/** Det som är fast för en motorinstans. */
export interface Env {
  /** Alla registrerade moduler (grundspelet först). */
  modules: ExpansionModule[];
  types: TileTypes;
}

/** Krokarnas sammanhang. Modulerna i det här repot får läsa `types` och `env`. */
export interface EngineHookContext extends HookContext {
  types: TileTypes;
  env: Env;
  /** I `canPlaceTile`: brickstypen som prövas. */
  tile?: string;
}

/**
 * Extra krokar som motorn (men inte det delade gränssnittet) känner till. En modul får sätta dem
 * i `hooks` (de läses via en typkonvertering). Floden använder dem för att dra en bricka per tur.
 */
export interface EngineHooks {
  /** Vid spelstart, efter `setup`: dela ut första handen själv. Returnera true om den är utdelad. */
  dealAtStart(ctx: EngineHookContext, first: PlayerId): boolean;
  /**
   * När en tur avslutats: dela ut brickor och välj nästa spelare. `undefined` = modulen lägger
   * sig inte i (motorn fyller handen som vanligt), `null` = spelet är slut. `again` = spelaren
   * som just spelat har en extra tur (och ska då få turen igen om hen har en bricka).
   */
  dealAfterTurn(ctx: EngineHookContext, again: boolean): PlayerId | null | undefined;
  /**
   * Brickor som lämnat en hand (spelare borttagen eller överhoppad) ska läggas tillbaka i högen.
   * Returnera true om modulen lade tillbaka dem själv; annars gör motorn det (sist, blandat).
   */
  returnTiles(ctx: EngineHookContext, tiles: string[]): boolean;
  /**
   * Vid byte av en bricka som ingen kan lägga: modulen drar själv ersättaren ur högen. Returnera
   * `{ tile }` (tile utelämnad = ingen ersättare, handen krymper) eller `undefined` för vanlig dragning.
   */
  exchangeDraw(ctx: EngineHookContext): { tile?: string } | undefined;
  /**
   * Förbindelser inne på brickor: områdena vid kanterna `a` och `b` på brickan i `pos` räknas som
   * ett enda område (färjorna). Ska vara en ren funktion av pjäserna. Läses av `analyze` (via
   * `registerEdgeLinks`, som `createEngine` anropar för sina moduler).
   */
  edgeLinks(figures: readonly Figure[]): { pos: Pos; a: Edge; b: Edge }[];
  /**
   * Efter att turens pjässteg gjorts (pjäs, ingen pjäs eller pjäs hem): modulen får lägga en egen fas
   * före "confirm". Returnera fasens namn, eller `undefined` för att gå vidare som vanligt.
   */
  afterFigureStep(ctx: EngineHookContext): string | undefined;
  /**
   * Rutor utöver den lagda brickan där färdiga områden ska räknas i slutet av turen (t.ex. en bricka
   * vars färja flyttats).
   */
  scoreAround(ctx: EngineHookContext): Pos[];
  /**
   * Efter poängräkningen när turen bekräftats (Crop Circles II): modulen får lägga en egen fas innan
   * turen avslutas. Returnera fasens namn, eller `undefined` för att avsluta turen som vanligt. Fasen
   * får sätta `turn.actor`. Turen avslutas när fasen lämnar över till "confirm" och spelaren bekräftar.
   */
  afterScoring(ctx: EngineHookContext): string | undefined;
  /**
   * Värden hoppar över (eller tar bort) spelaren som ska göra nästa val (`turn.actor`, eller spelaren
   * som har tur om hen väljer): modulen vars fas det är går vidare till nästa som ska välja, eller till
   * nästa fas, och returnerar true. Andra moduler returnerar false. En borttagen spelares pjäser är redan
   * borta när kroken anropas. Anropas som ett delsteg (se `host.ts`), så att omspelningen blir rätt.
   */
  skipActor(ctx: EngineHookContext): boolean;
  /** Falskt = spelaren som har tur får inte ångra just nu (någon annan har redan valt). */
  canUndo(ctx: EngineHookContext): boolean;
  /**
   * När en tur börjar (`ctx.player` är spelaren som fått turen): t.ex. fens poäng i The Princess & the
   * Dragon. `extra` är sant om turen är byggmästarens extra tur (andra delen av en dubbeltur).
   */
  turnStarted(ctx: EngineHookContext, extra: boolean): void;
  /** Sant = ingen pjäs får ställas ut på rutan (draken står där). Läses av `figureSteps`. */
  figureBlocked(ctx: EngineHookContext, pos: Pos): boolean;
  /**
   * Ett område räknas (färdigt under spelet eller vid slutet), före poängen och före att pjäserna
   * går hem. Modulen får dela ut egna poäng (fen).
   */
  areaScored(ctx: EngineHookContext, area: Area, final: boolean): void;
}

export const engineHook = <K extends keyof EngineHooks>(m: ExpansionModule, k: K): EngineHooks[K] | undefined =>
  (m.hooks as Partial<EngineHooks>)[k];

/** Motorns egna data i `state.ext.base`. */
export interface BaseExt {
  /** Brickor som kastats (ingen passade). */
  discarded: string[];
  /** Ögonblicksbild av tillståndet vid turens början, finns medan delsteg väntar. */
  snapshot?: GameState;
  /** Expansionsfaser som väntar på sin tur den här turen (se `phases.ts`). */
  phaseQueue?: string[];
  /** Extra tur som `extraTurn` gav innan en fas efter poängräkningen (Crop Circles II); gäller vid turens slut. */
  extraTurnPending?: boolean;
  /**
   * Ångra spärras så långt tillbaka som en annan spelares val eller ett värdsteg: det går bara att
   * ångra när `turn.pending` är längre än det här värdet. Finns medan turen pågår.
   */
  undoLock?: number;
}

export function baseExt(state: GameState): BaseExt {
  return state.ext.base as BaseExt;
}

/** Spelaren som ska göra nästa delsteg: `turn.actor` om den är satt, annars spelaren som har tur. */
export function actorOf(state: GameState): PlayerId {
  return state.turn.actor ?? state.turn.player;
}

/** Moduler som är påslagna i spelet; grundspelet alltid, i registreringsordning. */
export function activeModules(env: Env, setup: GameSetup): ExpansionModule[] {
  return env.modules.filter((m) => m.id === "base" || setup.expansions.includes(m.id));
}

export function makeCtx(env: Env, state: GameState, player: PlayerId, events: GameEvent[]): EngineHookContext {
  return { state, player, emit: (e) => events.push(e), types: env.types, env };
}

export function playerOf(state: GameState, id: PlayerId) {
  const p = state.players.find((x) => x.id === id);
  if (!p) throw new Error(`unknown player ${id}`);
  return p;
}
