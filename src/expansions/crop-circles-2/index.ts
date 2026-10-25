// Crop Circles II (s. 164-166, 208).
//
// - Brickorna (6) finns i src/tiles/crop-circles-2.json; sädescirkeln är symbolen "crop-circle:<sort>"
//   på brickan, där sorten är "city" (sköld, riddare), "road" (klubba, tjuvar) eller "field" (högaffel, bönder).
// - Efter turens poängräkning (steg 8e, dvs. när spelaren bekräftat) går turen in i fasen
//   "crop-circles-2". Spelaren som har tur väljer först för alla:
//     expansion "crop-circles-2" action "mode" data { choice: "add" | "remove" }
// - Därefter väljer varje spelare i tur och ordning, med start hos spelaren till vänster om den som
//   har tur och den som har tur sist (`turn.actor` är den som väljer):
//     add:    action "add" data { pos, feature, choice: "meeple" | "large-meeple" }          (lägg en egen följare, vanlig eller stor, från förrådet på ett
//                                                           område av sorten där spelaren har en följare;
//                                                           valfritt, action "skip" hoppar över)
//     remove: action "remove" data { pos, feature, figure } (ta hem en egen följare från ett område av sorten)
//   Den som inte kan hoppas över utan att ett steg krävs. Följare = vanlig och stor följare; abboten,
//   byggmästaren, grisen och neutrala pjäser berörs inte (OKLART för stor följare, byggmästare och gris;
//   JCloisterZone räknar bara följare). Vid "ta bort" väljer spelaren vilken av sina följare i ett område som tas hem (ett steg per pjäs). Vid "lägg till" väljer hen sort ur förrådet (s. 164: ett steg per område och sort som finns kvar).
//   Värden kan hoppa över eller ta bort den som väljer (kroken skipActor): bara hens val faller bort.
// - När alla valt går turen till "confirm" hos den som har tur. Den som har tur kan ångra så länge ingen
//   annan har valt. Sädescirkeln ger inga poäng.
// - Byggmästarens extra tur: cirkeln avgörs efter varje bricka (varje tur har sitt eget steg 8e).

import type { ExpansionModule, HookContext } from "../../shared/expansion";
import type { ExpansionStepData, Figure, PlayerId, Pos, Step } from "../../shared/state";
import type { TileSet } from "../../shared/tiles";
import type { EngineHookContext } from "../../engine/context";
import { analyze } from "../../engine/features";
import { returnToSupply } from "../../engine/scoring";
import { TILE_DATA } from "../../tiles/index";

const ID = "crop-circles-2";
export const CIRCLE_PHASE = "crop-circles-2";
const SYMBOL = "crop-circle:";
export type CircleKind = "city" | "road" | "field";
type Mode = "add" | "remove";

/** Följare som cirkeln berör: de tas hem, och en av dem (vanlig eller stor) läggs till ur förrådet. */
const FOLLOWERS = ["meeple", "large-meeple"];
const REMOVABLE = new Set(FOLLOWERS);

const set: TileSet = (TILE_DATA[ID] as { set: TileSet }).set;

interface Circle {
  kind: CircleKind;
  mode?: Mode;
  /** Spelarna som väljer, i ordning. */
  order: PlayerId[];
  /** Index i `order` för den som väljer nu. */
  idx: number;
  /** Någon annan än spelaren som har tur har redan valt: ingen ångra. */
  others: boolean;
}

interface Ext {
  /** Sorten på sädescirkeln på brickan som lagts den här turen. */
  symbol?: CircleKind;
  circle?: Circle;
}

function ext(ctx: EngineHookContext): Ext {
  return ((ctx.state.ext[ID] as Ext | undefined) ?? (ctx.state.ext[ID] = {})) as Ext;
}

/** Spelarens följare på områden av sorten. `all`: varje följare; annars ett mål (pjäsens egen plats) per område. */
function ownTargets(ctx: EngineHookContext, player: PlayerId, kind: CircleKind, all = false): { fig: Figure; pos: Pos; feature: string }[] {
  const s = ctx.state;
  const an = analyze(s.board, s.figures, ctx.types);
  const seen = new Set<number>();
  const out: { fig: Figure; pos: Pos; feature: string }[] = [];
  for (const fig of s.figures) {
    if (fig.owner !== player || !REMOVABLE.has(fig.kind) || fig.location.at !== "feature") continue;
    const area = an.areaAt(fig.location.pos, fig.location.feature);
    if (!area || area.kind !== kind || (!all && seen.has(area.id))) continue;
    seen.add(area.id);
    out.push({ fig, pos: { ...fig.location.pos }, feature: fig.location.feature });
  }
  return out;
}

/** Sorterna följare spelaren har kvar i förrådet (vanlig först). */
const supplyKinds = (ctx: EngineHookContext, player: PlayerId): string[] =>
  FOLLOWERS.filter((k) => ctx.state.figures.some((f) => f.owner === player && f.kind === k && f.location.at === "supply"));

interface Target { pos: Pos; feature: string; fig?: Figure; kind?: string }

/** Vad en spelare kan göra i läget `mode`: att ta bort väljer varje egen följare, att lägga till väljer område och sort. */
function targetsFor(ctx: EngineHookContext, player: PlayerId, c: Circle, mode: Mode): Target[] {
  if (mode === "remove") return ownTargets(ctx, player, c.kind, true);
  const kinds = supplyKinds(ctx, player);
  return ownTargets(ctx, player, c.kind).flatMap((t) => kinds.map((kind) => ({ pos: t.pos, feature: t.feature, kind })));
}

function stepsFor(ctx: EngineHookContext, player: PlayerId, c: Circle): Step[] {
  const mode = c.mode;
  if (!mode) return [];
  const out: Step[] = targetsFor(ctx, player, c, mode).map((t) => ({
    type: "expansion",
    expansion: ID,
    action: mode,
    data: (mode === "remove" ? { pos: t.pos, feature: t.feature, figure: t.fig!.id } : { pos: t.pos, feature: t.feature, choice: t.kind }) as ExpansionStepData,
  }));
  if (mode === "add") out.push({ type: "expansion", expansion: ID, action: "skip", data: {} });
  return out;
}

/** Spelarna i den ordning de väljer: från den till vänster om den som har tur, den som har tur sist. */
function orderFrom(ctx: EngineHookContext, active: PlayerId): PlayerId[] {
  const ps = ctx.state.players.map((p) => p.id);
  const i = ps.indexOf(active);
  return [...ps.slice(i + 1), ...ps.slice(0, i + 1)];
}

/** Gå till nästa spelare (från och med `from`) som kan göra något; när ingen finns kvar är cirkeln klar. */
function seek(ctx: EngineHookContext, c: Circle, from: number): void {
  const turn = ctx.state.turn;
  for (let i = from; i < c.order.length; i++) {
    const p = c.order[i] as PlayerId;
    if (targetsFor(ctx, p, c, c.mode as Mode).length === 0) continue;
    c.idx = i;
    if (p === turn.player) delete turn.actor;
    else turn.actor = p;
    return;
  }
  c.idx = c.order.length;
  delete turn.actor;
  turn.phase = "confirm";
}

export const cropCircles2Module: ExpansionModule = {
  id: ID,
  requires: ["base"],
  tileSets: [set],
  figures: [],
  variants: [],
  hooks: {
    afterTilePlaced(c, pos) {
      const ctx = c as EngineHookContext;
      const placed = ctx.state.board[`${pos.x},${pos.y}`];
      const sym = placed && ctx.types.get(placed.type)?.symbols?.find((x) => x.startsWith(SYMBOL));
      if (sym) ext(ctx).symbol = sym.slice(SYMBOL.length) as CircleKind;
    },

    extraSteps(c, phase): Step[] {
      if (phase !== CIRCLE_PHASE) return [];
      const ctx = c as EngineHookContext;
      const e = ext(ctx);
      const circle = e.circle;
      if (!circle) return [];
      if (!circle.mode)
        return (["add", "remove"] as const).map((choice) => ({
          type: "expansion", expansion: ID, action: "mode", data: { choice } as ExpansionStepData,
        }));
      const player = circle.order[circle.idx];
      return player === undefined ? [] : stepsFor(ctx, player, circle);
    },

    applyStep(c, step) {
      const ctx = c as EngineHookContext;
      const s = ctx.state;
      const circle = ext(ctx).circle;
      if (s.turn.phase !== CIRCLE_PHASE || !circle) return "error.illegalStep";
      const d = (step.data ?? {}) as ExpansionStepData;
      if (!circle.mode) {
        if (step.action !== "mode" || (d.choice !== "add" && d.choice !== "remove")) return "error.illegalStep";
        circle.mode = d.choice;
        ctx.emit({ type: "expansion", expansion: ID, event: "mode", data: { player: s.turn.player, kind: circle.kind, choice: d.choice } });
        seek(ctx, circle, 0);
        return null;
      }
      const player = circle.order[circle.idx] as PlayerId;
      const mode = circle.mode;
      if (step.action === "skip") {
        if (mode !== "add") return "error.illegalStep";
      } else if (step.action === mode) {
        const t = targetsFor(ctx, player, circle, mode).find(
          (x) => x.feature === d.feature && d.pos && x.pos.x === d.pos.x && x.pos.y === d.pos.y && (mode === "add" ? x.kind === d.choice : x.fig!.id === d.figure),
        );
        if (!t) return "error.illegalStep";
        if (mode === "add") {
          const fig = s.figures.find((f) => f.owner === player && f.kind === t.kind && f.location.at === "supply") as Figure;
          fig.location = { at: "feature", pos: { ...t.pos }, feature: t.feature };
          ctx.emit({ type: "figurePlaced", figure: fig.id, location: fig.location });
        } else returnToSupply(ctx, t.fig as Figure);
      } else return "error.illegalStep";
      ctx.emit({ type: "expansion", expansion: ID, event: step.action, data: { player } });
      if (player !== s.turn.player) circle.others = true;
      seek(ctx, circle, circle.idx + 1);
      return null;
    },

    // Värden hoppar över (eller tar bort) den som väljer: bara hens val hoppas över, de som är kvar får välja.
    skipActor(c: HookContext) {
      const ctx = c as EngineHookContext;
      const circle = (ctx.state.ext[ID] as Ext | undefined)?.circle;
      if (ctx.state.turn.phase !== CIRCLE_PHASE || !circle?.mode) return;
      seek(ctx, circle, circle.idx + 1);
    },

    canUndo(c: HookContext) {
      const ctx = c as EngineHookContext;
      const circle = (ctx.state.ext[ID] as Ext | undefined)?.circle;
      const inCircle = ctx.state.turn.pending.some((p) => p.type === "expansion" && p.expansion === ID);
      return !(inCircle && circle?.others);
    },

    // Efter poängräkningen: en bricka med sädescirkel ger ett val om någon har en följare av sorten.
    afterScoring(c: HookContext) {
      const ctx = c as EngineHookContext;
      const e = ext(ctx);
      const kind = e.symbol;
      delete e.symbol;
      delete e.circle;
      if (!kind) return undefined;
      const circle: Circle = { kind, order: orderFrom(ctx, ctx.state.turn.player), idx: 0, others: false };
      if (!ctx.state.players.some((p) => ownTargets(ctx, p.id, kind).length > 0)) return undefined;
      e.circle = circle;
      return CIRCLE_PHASE;
    },
  } as ExpansionModule["hooks"],
};
