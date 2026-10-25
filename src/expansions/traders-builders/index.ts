// Traders & Builders (s. 35-40, 203-215).
//
// - Brickorna (24) finns i src/tiles/traders-builders.json; varorna är props.goods ("wine", "grain",
//   "cloth") på städer.
// - Varor: den som lägger brickan som gör en stad färdig får en vara per symbol i staden, oavsett
//   vem som har följare där. De ligger i players[].counters som "goods.<vara>". Vid slutet ger flest
//   av varje sort 10 poäng, delad förstaplats ger alla 10. Har ingen någon av en sort delas inga
//   poäng ut (OKLART i reglerna; JCloisterZone-beteende).
// - Byggmästaren ("builder") ställs i stället för en följare på en väg eller stad på brickan som
//   just lagts, där spelaren redan har en följare (liten eller stor). Läggs en bricka som bygger
//   vidare på området får spelaren en extra tur, en gång per tur (ingen kedja: den extra turen ger
//   ingen ny). Även en bricka som bygger vidare och samtidigt gör området färdigt ger extra tur.
//   Den extra turen är frivillig (s. 36 och not 58): när spelaren bekräftat och alla andra faser efter
//   poängräkningen är klara (motorkroken `beforeNextTurn`) går turen in i fasen "tb-extra" med
//     expansion "traders-builders" action "extraTurn" data { choice: "take" | "skip" }
//   (bara om spelaren har en bricka kvar att lägga). Väljs "take" börjar den extra turen när spelaren
//   bekräftat igen. Värden som hoppar över en frånvarande spelare ger ingen extra tur.
//   Äter draken byggmästaren (Princess & Dragon) samma tur som brickan byggde vidare på hans område
//   gäller den extra turen ändå: den följer av att brickan byggde vidare där byggmästaren stod (steg 9a,
//   "had a builder"), på samma sätt som när området blev färdigt och byggmästaren gick hem (s. 37).
//   Pjäsen går hem när området räknas (motorn lämnar tillbaka alla pjäser på ett färdigt område)
//   eller när spelaren inte längre har någon följare där (städas i afterTilePlaced).
// - Grisen ("pig") ställs på ett fält där spelaren redan har en bonde. Den räknas inte vid
//   majoritet; är ägaren bland dem som vinner fältet ger den 4 i stället för 3 per färdig stad
//   (påslaget 1 per stad delas ut i finalScoring, per ägare).
// - Byggmästaren och grisen är vanliga placeFigure-steg (joinsOwn: motorn erbjuder dem bara på
//   områden där spelaren redan har en egen följare). De räknas inte vid majoritet (STRENGTH 0).

import type { ExpansionModule, HookContext } from "../../shared/expansion";
import type { ExpansionStepData, Figure, PlayerId, Pos, Step } from "../../shared/state";
import type { TileSet } from "../../shared/tiles";
import type { EngineHookContext } from "../../engine/context";
import { playerOf } from "../../engine/context";
import { analyze } from "../../engine/features";
import { rotatedAt } from "../../engine/board";
import { completedCitiesAround, returnToSupply, strength } from "../../engine/scoring";
import { TILE_DATA } from "../../tiles/index";

export const BUILDER_KIND = "builder";
export const PIG_KIND = "pig";
export const GOODS = ["wine", "grain", "cloth"] as const;
export type Good = (typeof GOODS)[number];
export const goodsCounter = (g: string) => `goods.${g}`;

const ID = "traders-builders";
export const EXTRA_PHASE = "tb-extra";
export const EXTRA_ACTION = "extraTurn";

interface TbExt {
  /** Spelaren har lagt en bricka som byggde vidare på sin byggmästares område denna tur. */
  extra: boolean;
  /** Spelaren som just fått en extra tur (turens andra del), eller null. */
  second: PlayerId | null;
  /** Spelaren vars bricka byggde vidare (gäller när `extra` är sant). */
  extraFor?: PlayerId;
  /** Valet att ta den extra turen har erbjudits. */
  offered?: boolean;
  /** Spelaren har valt att ta den extra turen. */
  take?: boolean;
}

function ext(ctx: EngineHookContext): TbExt {
  const s = ctx.state.ext as Record<string, unknown>;
  if (!s[ID]) s[ID] = { extra: false, second: null } satisfies TbExt;
  return s[ID] as TbExt;
}

const set: TileSet = (TILE_DATA[ID] as { set: TileSet }).set;

const props = (ctx: EngineHookContext, pos: Pos, feature: string): Record<string, unknown> =>
  (rotatedAt(ctx.state.board, ctx.types, pos)?.features.find((f) => f.id === feature)?.props ?? {}) as Record<string, unknown>;

/** Följare (motorns styrka > 0) bär upp byggmästaren och grisen. */
const isFollowerOf = (f: Figure, owner: PlayerId) => f.owner === owner && strength(f) > 0;

/** Samma poängpost som motorn skriver, men utan område (varor och grisens påslag). */
function award(ctx: EngineHookContext, player: PlayerId, points: number, reason: string, pos?: Pos, feature?: string) {
  if (points <= 0) return;
  playerOf(ctx.state, player).score += points;
  ctx.emit({ type: "scored", player, points, reason, ...(pos ? { pos, feature } : {}) });
}

export const tradersBuildersModule: ExpansionModule = {
  id: ID,
  requires: ["base"],
  tileSets: [set],
  figures: [
    { kind: BUILDER_KIND, count: 1, placeableOn: ["road", "city"], joinsOwn: true },
    { kind: PIG_KIND, count: 1, placeableOn: ["field"], joinsOwn: true },
  ],
  variants: [],
  hooks: {
    setup(c) {
      const ctx = c as EngineHookContext;
      ext(ctx);
      for (const p of ctx.state.players) for (const g of GOODS) p.counters[goodsCounter(g)] ??= 0;
    },

    afterTilePlaced(c, pos) {
      const ctx = c as EngineHookContext;
      const s = ctx.state;
      const e = ext(ctx);
      // Den extra turen gäller bara spelaren själv, en gång.
      if (e.second !== null && e.second !== ctx.player) e.second = null;
      const an = analyze(s.board, s.figures, ctx.types);
      const rt = rotatedAt(s.board, ctx.types, pos);
      if (!rt) return;

      // Städa: byggmästare och grisar utan följare från samma ägare på området går hem.
      for (const f of s.figures) {
        if ((f.kind !== BUILDER_KIND && f.kind !== PIG_KIND) || f.location.at !== "feature" || f.owner === null) continue;
        const area = an.areaAt(f.location.pos, f.location.feature);
        if (!area || !area.figures.some((x) => isFollowerOf(x, f.owner as PlayerId))) returnToSupply(ctx, f);
      }

      // Varor: den som lägger brickan som gör en stad färdig får stadens varor.
      const seen = new Set<number>();
      for (const feature of rt.features) {
        if (feature.kind !== "city") continue;
        const area = an.areaAt(pos, feature.id);
        if (!area || !area.complete || seen.has(area.id)) continue;
        seen.add(area.id);
        const me = playerOf(s, ctx.player);
        for (const n of area.nodes) {
          const g = props(ctx, n.pos, n.feature).goods;
          if (typeof g !== "string") continue;
          me.counters[goodsCounter(g)] = (me.counters[goodsCounter(g)] ?? 0) + 1;
          ctx.emit({ type: "expansion", expansion: ID, event: "goods", data: { player: ctx.player, goods: g } });
        }
      }

      // Byggmästaren: brickan bygger vidare på ett område där spelaren har sin byggmästare.
      if (e.second === ctx.player) return; // ingen kedja
      for (const f of s.figures) {
        if (f.kind !== BUILDER_KIND || f.owner !== ctx.player || f.location.at !== "feature") continue;
        const area = an.areaAt(f.location.pos, f.location.feature);
        if (area && area.tiles.some((t) => t.x === pos.x && t.y === pos.y)) {
          e.extra = true;
          e.extraFor = ctx.player;
          delete e.offered;
          delete e.take;
        }
      }
    },

    extraSteps(c, phase): Step[] {
      if (phase !== EXTRA_PHASE) return [];
      return (["take", "skip"] as const).map((choice) => ({
        type: "expansion", expansion: ID, action: EXTRA_ACTION, data: { choice } satisfies ExpansionStepData,
      }));
    },

    applyStep(c, step) {
      const ctx = c as EngineHookContext;
      const e = ext(ctx);
      const choice = (step.data as ExpansionStepData | null)?.choice;
      if (ctx.state.turn.phase !== EXTRA_PHASE || step.action !== EXTRA_ACTION || (choice !== "take" && choice !== "skip"))
        return "error.illegalStep";
      if (choice === "take") e.take = true;
      else {
        e.extra = false;
        delete e.extraFor;
        delete e.offered;
      }
      ctx.state.turn.phase = "confirm";
      return null;
    },

    // Frågas när turen bekräftas. Den extra turen tas bara om spelaren valt den (fasen "tb-extra").
    extraTurn(c) {
      const ctx = c as EngineHookContext;
      const e = ext(ctx);
      const again = e.take === true && e.extraFor === ctx.player;
      delete e.take;
      if (!again) return false;
      e.extra = false;
      delete e.extraFor;
      delete e.offered;
      // Spärren mot kedjor får inte nollställas av en andra förfrågan i samma tur (fas efter poängräkningen).
      e.second = ctx.player;
      return true;
    },

    // Erbjud den extra turen när alla andra faser efter poängräkningen är klara.
    beforeNextTurn(c: HookContext) {
      const ctx = c as EngineHookContext;
      const e = ext(ctx);
      if (!e.extra) return undefined;
      const hasTile = playerOf(ctx.state, ctx.player).hand.length > 0 || ctx.state.drawPile.length > 0;
      // Redan erbjuden (värden hoppar över en frånvarande spelare), någon annans eller utan bricka: ingen extra tur.
      if (e.offered || e.extraFor !== ctx.player || !hasTile) {
        e.extra = false;
        delete e.extraFor;
        delete e.offered;
        return undefined;
      }
      e.offered = true;
      return EXTRA_PHASE;
    },

    finalScoring(c) {
      const ctx = c as EngineHookContext;
      const s = ctx.state;
      // Varor: flest av varje sort ger 10; delad förstaplats ger alla 10; ingen vara = inga poäng.
      for (const g of GOODS) {
        const key = goodsCounter(g);
        const best = Math.max(0, ...s.players.map((p) => p.counters[key] ?? 0));
        if (best === 0) continue;
        for (const p of s.players) if ((p.counters[key] ?? 0) === best) award(ctx, p.id, 10, `final.goods.${g}`);
      }
      // Grisen: 4 i stället för 3 per färdig stad, om ägaren vinner (eller delar) fältet.
      const an = analyze(s.board, s.figures, ctx.types);
      for (const area of an.areas) {
        if (area.kind !== "field") continue;
        const pigs = area.figures.filter((f) => f.kind === PIG_KIND && f.owner !== null);
        if (pigs.length === 0) continue;
        const sums = new Map<PlayerId, number>();
        for (const f of area.figures)
          if (f.owner !== null && strength(f) > 0) sums.set(f.owner, (sums.get(f.owner) ?? 0) + strength(f));
        const best = Math.max(0, ...sums.values());
        const cities = completedCitiesAround(an, area);
        const ref = area.nodes[0]!;
        for (const pig of pigs) {
          const owner = pig.owner as PlayerId;
          if (best > 0 && sums.get(owner) === best) award(ctx, owner, cities, "final.farm", ref.pos, ref.feature);
        }
      }
    },
  } as ExpansionModule["hooks"],
};
