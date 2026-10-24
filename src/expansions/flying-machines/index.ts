// The Flying Machines (s. 139-142, 206).
//
// - Brickorna (8) finns i src/tiles/flying-machines.json; flygmaskinen är symbolen "flier:<riktning>"
//   (N, NE, E, SE, S, SW, W, NW) på brickan, och riktningen vrids med brickans rotation.
// - När en bricka med flygmaskin lagts får spelaren i fasen "placeFigure", i stället för att ställa en
//   följare, låta en följare flyga:
//     expansion "flying-machines" action "fly"  data { choice: <pjässort> }
//   Pjässorter: följare som står på väg, stad eller kloster (meeple, large-meeple), inte abboten,
//   byggmästaren eller grisen (OKLART i reglerna om abboten; vi tillåter den inte).
// - Steget slår tärningen (1, 1, 2, 2, 3, 3) med motorns slump (state.rng) och skickar händelsen
//     { type: "expansion", expansion: "flying-machines", event: "dice", data: DiceEventData }
//   Följaren flyger i maskinens riktning så många rutor som tärningen visar. Landningsrutan måste ha
//   en bricka. Där får följaren stå på en ofärdig väg, stad eller kloster, även om området är upptaget
//   (egna eller andras följare), aldrig på fält eller trädgård. Ett område som brickan som just lagts
//   gjorde färdigt är färdigt. Finns inget tillåtet område (eller ingen bricka) går följaren hem och
//   inga fler följare får ställas denna tur: turen går till "confirm".
// - Finns minst ett område går turen in i fasen "flying-machines", där spelaren väljer:
//     expansion "flying-machines" action "land"  data { pos, feature }
//   Området numreras på storskärmen som alla mål på kartan.
// - Följaren som landat är en vanlig följare och poängsätts av motorn.

import type { ExpansionModule } from "../../shared/expansion";
import type { ExpansionStepData, Pos, Step } from "../../shared/state";
import type { TileSet } from "../../shared/tiles";
import type { EngineHookContext } from "../../engine/context";
import { activeModules } from "../../engine/context";
import { analyze } from "../../engine/features";
import { rotatedAt } from "../../engine/board";
import { posKey } from "../../engine/geometry";
import { randomInt } from "../../engine/rng";
import { placedStep } from "../../engine/turnstate";
import { phaseAfterFigure } from "../../engine/steps";
import { TILE_DATA } from "../../tiles/index";

const ID = "flying-machines";
export const FLY_PHASE = "flying-machines";
/** Tärningens sidor. */
export const DIE = [1, 1, 2, 2, 3, 3] as const;
/** Områdestyper där en flygare får landa. */
const LANDABLE = ["road", "city", "cloister"];
/** Pjäser som inte får flyga. */
const NO_FLIGHT = new Set(["abbot", "builder", "pig"]);

const set: TileSet = (TILE_DATA[ID] as { set: TileSet }).set;

/** Data i händelsen "dice". */
export interface DiceEventData {
  player: string;
  /** Tärningens värde, 1-3. */
  roll: number;
  /** Rutan flygmaskinen står på. */
  from: Pos;
  /** Rutan följaren landar på (finns även om den är tom). */
  to: Pos;
  /** Flygriktningen efter brickans rotation, t.ex. "NE". */
  direction: string;
  /** Pjäsen som flyger. */
  kind: string;
  /** Antal områden följaren får välja mellan; 0 = den går hem. */
  options: number;
}

interface FlyExt {
  kind: string;
  to: Pos;
}

const VEC: Record<string, [number, number]> = {
  N: [0, -1], NE: [1, -1], E: [1, 0], SE: [1, 1], S: [0, 1], SW: [-1, 1], W: [-1, 0], NW: [-1, -1],
};
const DIRS = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];

/** Vrid en riktning medurs (brickans rotation i grader). */
function rotateDir(dir: string, rotation: number): string {
  return DIRS[(DIRS.indexOf(dir) + rotation / 45) % 8] as string;
}

/** Flygmaskinens riktning på den just lagda brickan, eller null. */
function flightOf(ctx: EngineHookContext): { from: Pos; dir: string } | null {
  const placed = placedStep(ctx.state);
  if (!placed) return null;
  const t = ctx.state.board[posKey(placed.pos)];
  const sym = t && ctx.types.get(t.type)?.symbols?.find((x) => x.startsWith("flier:"));
  if (!t || !sym) return null;
  const dir = sym.slice("flier:".length);
  if (!(dir in VEC)) return null;
  return { from: { ...placed.pos }, dir: rotateDir(dir, t.rotation) };
}

/** Pjässorter som spelaren kan låta flyga just nu. */
function flierKinds(ctx: EngineHookContext): string[] {
  const s = ctx.state;
  const kinds: string[] = [];
  for (const m of activeModules(ctx.env, s.setup)) {
    for (const def of m.figures) {
      if (def.neutral || def.joinsOwn || NO_FLIGHT.has(def.kind) || kinds.includes(def.kind)) continue;
      if (!def.placeableOn.some((k) => LANDABLE.includes(k))) continue;
      if (s.figures.some((f) => f.kind === def.kind && f.owner === ctx.player && f.location.at === "supply")) kinds.push(def.kind);
    }
  }
  return kinds;
}

/** Områden på landningsrutan där en pjäs av sorten får stå. */
function landings(ctx: EngineHookContext, to: Pos, kind: string): { pos: Pos; feature: string }[] {
  const s = ctx.state;
  const rt = rotatedAt(s.board, ctx.types, to);
  if (!rt) return [];
  const def = activeModules(ctx.env, s.setup).flatMap((m) => m.figures).find((d) => d.kind === kind);
  const an = analyze(s.board, s.figures, ctx.types);
  const out: { pos: Pos; feature: string }[] = [];
  for (const f of rt.features) {
    if (!LANDABLE.includes(f.kind) || !def?.placeableOn.includes(f.kind)) continue;
    const area = an.areaAt(to, f.id);
    if (area && !area.complete) out.push({ pos: { ...to }, feature: f.id });
  }
  return out;
}

function ext(ctx: EngineHookContext): FlyExt | undefined {
  return (ctx.state.ext as Record<string, FlyExt | undefined>)[ID];
}

export const flyingMachinesModule: ExpansionModule = {
  id: ID,
  requires: ["base"],
  tileSets: [set],
  figures: [],
  variants: [],
  hooks: {
    extraSteps(c, phase): Step[] {
      const ctx = c as EngineHookContext;
      if (phase === "placeFigure") {
        if (!flightOf(ctx)) return [];
        return flierKinds(ctx).map((kind) => ({
          type: "expansion", expansion: ID, action: "fly", data: { choice: kind } satisfies ExpansionStepData,
        }));
      }
      if (phase !== FLY_PHASE) return [];
      const e = ext(ctx);
      if (!e) return [];
      return landings(ctx, e.to, e.kind).map((l) => ({
        type: "expansion", expansion: ID, action: "land", data: { pos: l.pos, feature: l.feature } satisfies ExpansionStepData,
      }));
    },

    applyStep(c, step) {
      const ctx = c as EngineHookContext;
      const s = ctx.state;
      const d = (step.data ?? {}) as ExpansionStepData;
      if (step.action === "fly") {
        if (s.turn.phase !== "placeFigure") return "error.illegalStep";
        const flight = flightOf(ctx);
        if (!flight || !d.choice || !flierKinds(ctx).includes(d.choice)) return "error.illegalStep";
        const roll = DIE[randomInt(s, DIE.length)] as number;
        const [dx, dy] = VEC[flight.dir] as [number, number];
        const to = { x: flight.from.x + dx * roll, y: flight.from.y + dy * roll };
        const options = landings(ctx, to, d.choice);
        ctx.emit({
          type: "expansion", expansion: ID, event: "dice",
          data: { player: ctx.player, roll, from: flight.from, to, direction: flight.dir, kind: d.choice, options: options.length } satisfies DiceEventData,
        });
        if (options.length === 0) {
          // Som efter ett vanligt pjässteg: t.ex. färjorna kan vilja ha sin fas.
          s.turn.phase = phaseAfterFigure(ctx, activeModules(ctx.env, s.setup));
        } else {
          (s.ext as Record<string, FlyExt>)[ID] = { kind: d.choice, to };
          s.turn.phase = FLY_PHASE;
        }
        return null;
      }
      if (step.action === "land") {
        const e = ext(ctx);
        if (s.turn.phase !== FLY_PHASE || !e || !d.pos || !d.feature) return "error.illegalStep";
        const ok = landings(ctx, e.to, e.kind).some((l) => l.pos.x === d.pos!.x && l.pos.y === d.pos!.y && l.feature === d.feature);
        if (!ok) return "error.illegalStep";
        const fig = s.figures.find((f) => f.kind === e.kind && f.owner === ctx.player && f.location.at === "supply");
        if (!fig) return "error.noFigureLeft";
        fig.location = { at: "feature", pos: { ...d.pos }, feature: d.feature };
        ctx.emit({ type: "figurePlaced", figure: fig.id, location: fig.location });
        delete (s.ext as Record<string, unknown>)[ID];
        s.turn.phase = phaseAfterFigure(ctx, activeModules(ctx.env, s.setup));
        return null;
      }
      return "error.illegalStep";
    },
  },
};
