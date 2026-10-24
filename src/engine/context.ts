// Gemensamma typer för motorns delar: miljön (moduler och brickor) och krokarnas utvidgade sammanhang.

import type { ExpansionModule, HookContext } from "../shared/expansion";
import type { GameEvent, GameSetup, GameState, PlayerId } from "../shared/state";
import type { TileTypes } from "./board";

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
}

export function baseExt(state: GameState): BaseExt {
  return state.ext.base as BaseExt;
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
