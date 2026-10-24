// The Gold Mines (s. 151-153, 205-207, 212, 218).
//
// - Brickorna (8) finns i src/tiles/gold-mines.json; guldsymbolen är symbolen "gold". Sädescirkelbrickan
//   som följer med i förpackningen hör till Crop Circles II (PLAN.md).
// - 16 guldtackor ("gold-bar") är neutrala pjäser. Lediga tackor ligger i förrådet; en tacka på en bricka
//   har location { at: "tile" }. När en tacka delats ut till en spelare går den tillbaka till förrådet
//   men får ett märke i ext (`taken`) så att den inte läggs ut igen; spelarens tackor räknas i
//   players[].counters.gold.
// - Turordning (s. 152): bricka, guld, pjäs, poäng, utdelning. När en guldbricka lagts läggs en tacka
//   på den (utan val) och en på en granne, diagonalt räknas (s. 151, 205). Grannen väljs i ett eget
//   delsteg { expansion, action "placeGold", data { pos } } i fasen "gold" (storskärmen numrerar rutorna).
//   Finns bara en granne läggs tackan dit direkt. Finns bara en tacka kvar läggs den på brickan.
//   Därefter fortsätter turen med fasen "placeFigure".
// - Utdelning (s. 151-152): när ett område räknas (spelare har majoritet) delas tackorna på dess
//   brickor ut: väg och stad har sina brickor, kloster och trädgård brickan och de åtta grannarna.
//   Bönder får ingen guld (fält räknas bara vid slutet). Gäller bara områden som räknas under spelet,
//   inte abbotens "ta tillbaka". Tackor på en bricka med flera färdiga områden kan hämtas av båda.
//   Variant "gold-mines.distribution":
//     "one-at-a-time" (standard, HiG): medsols från den aktiva spelaren tar var och en en tacka åt
//       gången bland dem hen har rätt till, tills ingen kan ta fler (not 450). Valet av tacka görs
//       automatiskt: den som färre andra har rätt till tas först.
//     "per-feature" (RGG, not 451): varje spelare som räknar ett område med guld tar en tacka från det.
// - Slutpoäng (s. 153): 1-3 tackor 1 poäng styck, 4-6 2, 7-9 3, 10+ 4. Tackor kvar på brickor ger inget.
// - OKLART i reglerna (JCloisterZone-beteende): abbotens trädgård räknas som kloster (de nio rutorna).
//   Slottets sextal (s. 151) hör till en annan expansion och finns inte här.

import type { ExpansionModule, RuleVariantDefinition } from "../../shared/expansion";
import type { PlayerId, Pos } from "../../shared/state";
import type { TileSet } from "../../shared/tiles";
import type { EngineHookContext } from "../../engine/context";
import { playerOf } from "../../engine/context";
import { analyze } from "../../engine/features";
import { neighbours8, posKey } from "../../engine/geometry";
import { majorityOwners } from "../../engine/scoring";
import { placedStep } from "../../engine/turnstate";
import { enterPhase, leavePhase } from "../../engine/phases";
import { TILE_DATA } from "../../tiles/index";

export const GOLD_KIND = "gold-bar";
export const GOLD_COUNTER = "gold";
export const GOLD_PHASE = "gold";
export const GOLD_ACTION = "placeGold";
const ID = "gold-mines";

interface GoldExt {
  /** Tackor som delats ut till spelare. */
  taken: string[];
}

interface Claim {
  bars: string[];
  owners: PlayerId[];
}

/** Anspråk som samlats under poängräkningen, per kontext (lever bara under en bekräftad tur). */
const claims = new WeakMap<object, Claim[]>();

const set: TileSet = (TILE_DATA[ID] as { set: TileSet }).set;

const variants: RuleVariantDefinition[] = [
  { id: "distribution", options: ["one-at-a-time", "per-feature"], default: "one-at-a-time" },
];

function ext(ctx: EngineHookContext): GoldExt {
  const s = ctx.state.ext as Record<string, unknown>;
  if (!s[ID]) s[ID] = { taken: [] } satisfies GoldExt;
  return s[ID] as GoldExt;
}

/** Lediga tackor (i förrådet, inte utdelade), i id-ordning. */
function freeBars(ctx: EngineHookContext) {
  const taken = new Set(ext(ctx).taken);
  return ctx.state.figures.filter((f) => f.kind === GOLD_KIND && f.location.at === "supply" && !taken.has(f.id));
}

/** Rutor med bricka bland de åtta grannarna. */
const neighbourTiles = (ctx: EngineHookContext, pos: Pos): Pos[] =>
  neighbours8(pos).filter((p) => ctx.state.board[posKey(p)]);

function candidates(ctx: EngineHookContext): Pos[] {
  const placed = placedStep(ctx.state);
  return placed ? neighbourTiles(ctx, placed.pos) : [];
}

function putBar(ctx: EngineHookContext, pos: Pos): void {
  const bar = freeBars(ctx)[0];
  if (!bar) return;
  bar.location = { at: "tile", pos: { ...pos } };
  ctx.emit({ type: "figurePlaced", figure: bar.id, location: bar.location });
}

/** Rutorna vars tackor hör till området. */
function areaSquares(area: { kind: string; tiles: Pos[]; nodes: { pos: Pos }[] }, ctx: EngineHookContext): Pos[] {
  if (area.kind === "cloister" || area.kind === "garden") {
    const c = area.nodes[0]!.pos;
    return [c, ...neighbourTiles(ctx, c)];
  }
  return area.tiles;
}

function give(ctx: EngineHookContext, player: PlayerId, barId: string): void {
  const bar = ctx.state.figures.find((f) => f.id === barId)!;
  const pos = bar.location.at === "tile" ? bar.location.pos : undefined;
  bar.location = { at: "supply" };
  ext(ctx).taken.push(barId);
  const p = playerOf(ctx.state, player);
  p.counters[GOLD_COUNTER] = (p.counters[GOLD_COUNTER] ?? 0) + 1;
  ctx.emit({ type: "figureReturned", figure: barId });
  ctx.emit({ type: "expansion", expansion: ID, event: "gold", data: { player, figure: barId, ...(pos ? { pos } : {}) } });
}

/** Spelarna medsols med början hos den aktiva. */
function clockwise(ctx: EngineHookContext): PlayerId[] {
  const ps = ctx.state.players.map((p) => p.id);
  const i = ps.indexOf(ctx.player);
  return [...ps.slice(i), ...ps.slice(0, i)];
}

function distribute(ctx: EngineHookContext, list: Claim[]): void {
  const order = clockwise(ctx);
  const variant = ctx.state.setup.variants[`${ID}.distribution`] ?? "one-at-a-time";
  const gone = new Set<string>();
  if (variant === "per-feature") {
    for (const c of list)
      for (const pid of order) {
        if (!c.owners.includes(pid)) continue;
        const bar = c.bars.find((b) => !gone.has(b));
        if (!bar) break;
        gone.add(bar);
        give(ctx, pid, bar);
      }
    return;
  }
  const entitled = (pid: PlayerId, bar: string) => list.some((c) => c.owners.includes(pid) && c.bars.includes(bar));
  const all = [...new Set(list.flatMap((c) => c.bars))].sort();
  for (let progress = true; progress; ) {
    progress = false;
    for (const pid of order) {
      const mine = all.filter((b) => !gone.has(b) && entitled(pid, b));
      if (mine.length === 0) continue;
      const rivals = (b: string) => order.filter((o) => o !== pid && entitled(o, b)).length;
      const bar = mine.reduce((best, b) => (rivals(b) < rivals(best) ? b : best));
      gone.add(bar);
      give(ctx, pid, bar);
      progress = true;
    }
  }
}

export const goldRate = (n: number) => (n >= 10 ? 4 : n >= 7 ? 3 : n >= 4 ? 2 : 1);

export const goldMinesModule: ExpansionModule = {
  id: ID,
  requires: ["base"],
  tileSets: [set],
  figures: [{ kind: GOLD_KIND, count: 16, neutral: true, placeableOn: [] }],
  variants,
  hooks: {
    setup(c) {
      const ctx = c as EngineHookContext;
      ext(ctx);
      for (const p of ctx.state.players) p.counters[GOLD_COUNTER] ??= 0;
    },

    afterTilePlaced(c, pos) {
      const ctx = c as EngineHookContext;
      const placed = ctx.state.board[posKey(pos)];
      if (!placed || !ctx.types.get(placed.type)?.symbols?.includes("gold")) return;
      const free = freeBars(ctx).length;
      if (free === 0) return;
      putBar(ctx, pos);
      const near = neighbourTiles(ctx, pos);
      if (free < 2 || near.length === 0) return;
      if (near.length === 1) putBar(ctx, near[0]!);
      else enterPhase(ctx.state, GOLD_PHASE);
    },

    extraSteps(c, phase) {
      if (phase !== GOLD_PHASE) return [];
      return candidates(c as EngineHookContext).map((pos) => ({
        type: "expansion" as const, expansion: ID, action: GOLD_ACTION, data: { pos },
      }));
    },

    applyStep(c, step) {
      const ctx = c as EngineHookContext;
      if (step.action !== GOLD_ACTION || ctx.state.turn.phase !== GOLD_PHASE) return "error.illegalStep";
      const pos = (step.data as { pos?: Pos } | null)?.pos;
      if (!pos || !candidates(ctx).some((p) => p.x === pos.x && p.y === pos.y)) return "error.illegalStep";
      putBar(ctx, pos);
      leavePhase(ctx.state);
      return null;
    },

    // Samlar anspråken när områden räknas under spelet; själva utdelningen sker i extraTurn, som
    // motorn anropar efter poängräkningen med samma kontext.
    scoreFeature(c, ref, points, final) {
      const ctx = c as EngineHookContext;
      if (final) return points;
      const s = ctx.state;
      const area = analyze(s.board, s.figures, ctx.types).areaAt(ref.pos, ref.feature);
      if (!area || !["city", "road", "cloister", "garden"].includes(area.kind)) return points;
      const squares = new Set(areaSquares(area, ctx).map(posKey));
      const bars = s.figures
        .filter((f) => f.kind === GOLD_KIND && f.location.at === "tile" && squares.has(posKey(f.location.pos)))
        .map((f) => f.id);
      const owners = majorityOwners(area);
      if (bars.length && owners.length) {
        const list = claims.get(c) ?? [];
        list.push({ bars, owners });
        claims.set(c, list);
      }
      return points;
    },

    extraTurn(c) {
      const ctx = c as EngineHookContext;
      const list = claims.get(c);
      claims.delete(c);
      if (list?.length) distribute(ctx, list);
      return false;
    },

    finalScoring(c) {
      const ctx = c as EngineHookContext;
      for (const p of ctx.state.players) {
        const n = p.counters[GOLD_COUNTER] ?? 0;
        if (n <= 0) continue;
        const points = n * goldRate(n);
        p.score += points;
        ctx.emit({ type: "scored", player: p.id, points, reason: "final.gold" });
      }
    },
  },
};
