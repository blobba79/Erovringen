// Mage & Witch (s. 154-156, 205-211).
//
// - Brickorna (8) finns i src/tiles/mage-witch.json; magisymbolen är symbolen "mage" på brickan.
// - Magikern och häxan är neutrala pjäser (id "mage:0" och "witch:0", ingen ägare). De står på en
//   ofärdig väg eller stad och räknas aldrig vid majoritet (motorns strength() ger 0 för owner null).
// - Läggs en bricka med magisymbol (eller binder en bricka ihop områdena med magikern och häxan) går
//   turen in i fasen "mage-witch" direkt efter brickan, före pjäsen. Spelaren väljer då ett av:
//     expansion "mage-witch" action "move"   data { figure, pos, feature }  (flytta eller ta in)
//     expansion "mage-witch" action "remove" data { figure, choice }         (bara om inget mål finns)
//   Målet är ett ofärdigt väg- eller stadsområde, inte det pjäsen står på och inte det den andra
//   pjäsen står på. Finns inget mål måste en pjäs som ligger på kartan tas bort (valfri av dem);
//   ligger ingen på kartan händer ingenting (fasen hoppas över).
// - Poäng (i scoreFeature, efter I&C): magikern +1 per bricka, häxan halverar (uppåt). Vid
//   slutpoäng gäller samma sak för ofärdiga områden (OKLART för häxan; JCloisterZone-beteende).
// - Pjäserna går hem när området räknas (städas i extraTurn, som anropas efter poängräkningen).
// - Modulen måste registreras efter Inns & Cathedrals (ordningen avgör poängordningen).

import type { ExpansionModule, FeatureRef } from "../../shared/expansion";
import type { ExpansionStepData, Figure, Pos, Step } from "../../shared/state";
import type { TileSet } from "../../shared/tiles";
import type { EngineHookContext } from "../../engine/context";
import { analyze, type Area } from "../../engine/features";
import { returnToSupply } from "../../engine/scoring";
import { TILE_DATA } from "../../tiles/index";

export const MAGE_KIND = "mage";
export const WITCH_KIND = "witch";
export const MAGE_PHASE = "mage-witch";
const ID = "mage-witch";

const set: TileSet = (TILE_DATA[ID] as { set: TileSet }).set;

const isMageKind = (k: string) => k === MAGE_KIND || k === WITCH_KIND;
const marked = (a: Area) => a.kind === "road" || a.kind === "city";

interface Option {
  action: "move" | "remove";
  data: ExpansionStepData;
}

function figs(ctx: EngineHookContext): Figure[] {
  return ctx.state.figures.filter((f) => isMageKind(f.kind));
}

/** Alla tillåtna val i fasen. */
function options(ctx: EngineHookContext): Option[] {
  const s = ctx.state;
  const an = analyze(s.board, s.figures, ctx.types);
  const fs = figs(ctx);
  const areaOf = (f: Figure) => (f.location.at === "feature" ? an.areaAt(f.location.pos, f.location.feature) : undefined);
  const out: Option[] = [];
  for (const f of fs) {
    const other = fs.find((x) => x !== f);
    const cur = areaOf(f);
    const otherArea = other ? areaOf(other) : undefined;
    for (const a of an.areas) {
      if (!marked(a) || a.complete || a.id === cur?.id || a.id === otherArea?.id) continue;
      const ref = a.nodes[0] as FeatureRef;
      out.push({ action: "move", data: { figure: f.id, pos: { ...ref.pos }, feature: ref.feature } });
    }
  }
  if (out.length === 0)
    for (const f of fs)
      if (f.location.at === "feature") out.push({ action: "remove", data: { figure: f.id, choice: f.kind } });
  return out;
}

const samePos = (a?: Pos, b?: Pos) => (!a && !b) || (!!a && !!b && a.x === b.x && a.y === b.y);

export const mageWitchModule: ExpansionModule = {
  id: ID,
  requires: ["base"],
  tileSets: [set],
  figures: [
    { kind: MAGE_KIND, count: 1, neutral: true, placeableOn: ["road", "city"] },
    { kind: WITCH_KIND, count: 1, neutral: true, placeableOn: ["road", "city"] },
  ],
  variants: [],
  hooks: {
    afterTilePlaced(c, pos) {
      const ctx = c as EngineHookContext;
      const s = ctx.state;
      const placed = s.board[`${pos.x},${pos.y}`];
      const symbol = !!placed && !!ctx.types.get(placed.type)?.symbols?.includes("mage");
      const an = analyze(s.board, s.figures, ctx.types);
      const [a, b] = figs(ctx).map((f) => (f.location.at === "feature" ? an.areaAt(f.location.pos, f.location.feature) : undefined));
      const together = !!a && !!b && a.id === b.id;
      if (!symbol && !together) return;
      if (options(ctx).length === 0) return;
      s.turn.phase = MAGE_PHASE;
    },

    extraSteps(c, phase): Step[] {
      if (phase !== MAGE_PHASE) return [];
      return options(c as EngineHookContext).map((o) => ({ type: "expansion", expansion: ID, action: o.action, data: o.data }));
    },

    applyStep(c, step) {
      const ctx = c as EngineHookContext;
      if (ctx.state.turn.phase !== MAGE_PHASE) return "error.illegalStep";
      const d = (step.data ?? {}) as ExpansionStepData;
      const ok = options(ctx).find(
        (o) => o.action === step.action && o.data.figure === d.figure && o.data.feature === d.feature && samePos(o.data.pos, d.pos),
      );
      if (!ok) return "error.illegalStep";
      const f = ctx.state.figures.find((x) => x.id === d.figure)!;
      if (step.action === "move") {
        f.location = { at: "feature", pos: { ...d.pos! }, feature: d.feature! };
        ctx.emit({ type: "figurePlaced", figure: f.id, location: f.location });
      } else returnToSupply(ctx, f);
      ctx.state.turn.phase = "placeFigure";
      return null;
    },

    scoreFeature(c, ref, points) {
      const ctx = c as EngineHookContext;
      const s = ctx.state;
      const area = analyze(s.board, s.figures, ctx.types).areaAt(ref.pos, ref.feature);
      if (!area || !marked(area)) return points;
      // Ordning: grundpoäng, värdshus, katedral (andra moduler före oss), magiker, häxa.
      if (area.figures.some((f) => f.kind === MAGE_KIND)) points += area.tiles.length;
      if (area.figures.some((f) => f.kind === WITCH_KIND)) points = Math.ceil(points / 2);
      return points;
    },

    // Anropas efter poängräkningen i slutet av turen: pjäser på färdiga områden går hem.
    extraTurn(c) {
      const ctx = c as EngineHookContext;
      const s = ctx.state;
      const an = analyze(s.board, s.figures, ctx.types);
      for (const f of figs(ctx)) {
        if (f.location.at !== "feature") continue;
        const area = an.areaAt(f.location.pos, f.location.feature);
        if (!area || area.complete) returnToSupply(ctx, f);
      }
      return false;
    },
  },
};
