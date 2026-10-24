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
//   Pjäsen går hem när området räknas (motorn lämnar tillbaka alla pjäser på ett färdigt område)
//   eller när spelaren inte längre har någon följare där (städas i afterTilePlaced).
// - Grisen ("pig") ställs på ett fält där spelaren redan har en bonde. Den räknas inte vid
//   majoritet; är ägaren bland dem som vinner fältet ger den 4 i stället för 3 per färdig stad
//   (påslaget 1 per stad delas ut i finalScoring, per ägare).
// - Byggmästaren och grisen ställs med ett eget delsteg ({ type: "expansion", action:
//   "placeBuilder" | "placePig", data: { pos, feature } }), eftersom motorns vanliga pjässteg inte
//   tillåter pjäser på upptagna områden. Steget avslutar pjäsfasen (som en vanlig placering).
// - Pjäsernas placeableOn är tom: motorn erbjuder dem aldrig som vanliga pjäser.

import type { ExpansionModule } from "../../shared/expansion";
import type { Figure, PlayerId, Pos, Step } from "../../shared/state";
import type { TileSet } from "../../shared/tiles";
import type { EngineHookContext } from "../../engine/context";
import { playerOf } from "../../engine/context";
import { analyze } from "../../engine/features";
import { rotatedAt } from "../../engine/board";
import { completedCitiesAround, returnToSupply } from "../../engine/scoring";
import { placedStep } from "../../engine/turnstate";
import { TILE_DATA } from "../../tiles/index";

export const BUILDER_KIND = "builder";
export const PIG_KIND = "pig";
export const GOODS = ["wine", "grain", "cloth"] as const;
export type Good = (typeof GOODS)[number];
export const goodsCounter = (g: string) => `goods.${g}`;

const ID = "traders-builders";
/** Följare som bär upp byggmästaren och grisen (och vars vikt vid majoritet är 1 respektive 2). */
const FOLLOWER_WEIGHT: Record<string, number> = { meeple: 1, "large-meeple": 2 };

interface TbExt {
  /** Spelaren har lagt en bricka som byggde vidare på sin byggmästares område denna tur. */
  extra: boolean;
  /** Spelaren som just fått en extra tur (turens andra del), eller null. */
  second: PlayerId | null;
}

function ext(ctx: EngineHookContext): TbExt {
  const s = ctx.state.ext as Record<string, unknown>;
  if (!s[ID]) s[ID] = { extra: false, second: null } satisfies TbExt;
  return s[ID] as TbExt;
}

const set: TileSet = (TILE_DATA[ID] as { set: TileSet }).set;

const props = (ctx: EngineHookContext, pos: Pos, feature: string): Record<string, unknown> =>
  (rotatedAt(ctx.state.board, ctx.types, pos)?.features.find((f) => f.id === feature)?.props ?? {}) as Record<string, unknown>;

const isFollowerOf = (f: Figure, owner: PlayerId) => f.owner === owner && f.kind in FOLLOWER_WEIGHT;

/** Placeringar som byggmästaren och grisen kan få på brickan som just lagts. */
function placements(ctx: EngineHookContext): Step[] {
  const s = ctx.state;
  const placed = placedStep(s);
  if (!placed) return [];
  const rt = rotatedAt(s.board, ctx.types, placed.pos);
  if (!rt) return [];
  const supply = (kind: string) =>
    s.figures.some((f) => f.kind === kind && f.owner === ctx.player && f.location.at === "supply");
  const canBuilder = supply(BUILDER_KIND);
  const canPig = supply(PIG_KIND);
  if (!canBuilder && !canPig) return [];
  const an = analyze(s.board, s.figures, ctx.types);
  const out: Step[] = [];
  for (const feature of rt.features) {
    const area = an.areaAt(placed.pos, feature.id);
    if (!area || !area.figures.some((f) => isFollowerOf(f, ctx.player))) continue;
    const action =
      (area.kind === "road" || area.kind === "city") && canBuilder ? "placeBuilder"
      : area.kind === "field" && canPig ? "placePig"
      : null;
    if (action) out.push({ type: "expansion", expansion: ID, action, data: { pos: placed.pos, feature: feature.id } });
  }
  return out;
}

const sameStep = (a: Step, b: Step) => JSON.stringify(a) === JSON.stringify(b);

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
    { kind: BUILDER_KIND, count: 1, placeableOn: [] },
    { kind: PIG_KIND, count: 1, placeableOn: [] },
  ],
  variants: [],
  hooks: {
    setup(c) {
      const ctx = c as EngineHookContext;
      ext(ctx);
      for (const p of ctx.state.players) for (const g of GOODS) p.counters[goodsCounter(g)] ??= 0;
    },

    extraSteps(c, phase) {
      if (phase !== "placeFigure") return [];
      return placements(c as EngineHookContext);
    },

    applyStep(c, step) {
      if (step.expansion !== ID) return "error.illegalStep";
      const ctx = c as EngineHookContext;
      if (ctx.state.turn.phase !== "placeFigure") return "error.illegalStep";
      if (!placements(ctx).some((s) => sameStep(s, step))) return "error.illegalFigure";
      const { pos, feature } = step.data as { pos: Pos; feature: string };
      const kind = step.action === "placeBuilder" ? BUILDER_KIND : PIG_KIND;
      const fig = ctx.state.figures.find((f) => f.kind === kind && f.owner === ctx.player && f.location.at === "supply");
      if (!fig) return "error.noFigureLeft";
      fig.location = { at: "feature", pos: { ...pos }, feature };
      ctx.emit({ type: "figurePlaced", figure: fig.id, location: fig.location });
      // Byggmästaren och grisen ersätter turens följare.
      ctx.state.turn.phase = "confirm";
      return null;
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
        if (area && area.tiles.some((t) => t.x === pos.x && t.y === pos.y)) e.extra = true;
      }
    },

    extraTurn(c) {
      const ctx = c as EngineHookContext;
      const e = ext(ctx);
      const again = e.extra;
      e.extra = false;
      e.second = again ? ctx.player : null;
      return again;
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
          if (f.owner !== null && f.kind in FOLLOWER_WEIGHT)
            sums.set(f.owner, (sums.get(f.owner) ?? 0) + (FOLLOWER_WEIGHT[f.kind] as number));
        const best = Math.max(0, ...sums.values());
        const cities = completedCitiesAround(an, area);
        const ref = area.nodes[0]!;
        for (const pig of pigs) {
          const owner = pig.owner as PlayerId;
          if (best > 0 && sums.get(owner) === best) award(ctx, owner, cities, "final.farm", ref.pos, ref.feature);
        }
      }
    },
  },
};
