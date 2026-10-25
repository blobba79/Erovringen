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
//       gången bland dem hen har rätt till, tills ingen kan ta fler (not 450). Spelaren väljer själv
//       tacka (s. 152, not 450): efter poängräkningen går turen in i fasen "gold-pick" (motorkroken
//       `afterScoring`, före drakens och sädescirkelns faser som hör till steg 8) och den som väljer
//       (`turn.actor`) får ett steg per ruta med en tacka hen har rätt till:
//         expansion "gold-mines" action "takeGold"  data { pos }
//       Ligger allt hen kan ta på samma ruta (eller finns bara en tacka) tas den automatiskt utan steg
//       (tackor på samma ruta är likvärdiga). Ångra är spärrat när någon annan än spelaren som har tur
//       valt. Värden som hoppar över den som väljer (`skipActor`) ger hen automatiska val: tacka med
//       färre rivaler först.
//     "per-feature" (RGG, not 451): varje spelare som räknar ett område med guld tar en tacka från det.
// - Slutpoäng (s. 153): 1-3 tackor 1 poäng styck, 4-6 2, 7-9 3, 10+ 4. Tackor kvar på brickor ger inget.
// - OKLART i reglerna (JCloisterZone-beteende): abbotens trädgård räknas som kloster (de nio rutorna).
//   Slottets sextal (s. 151) hör till en annan expansion och finns inte här.

import type { ExpansionModule, HookContext, RuleVariantDefinition } from "../../shared/expansion";
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
/** Fasen efter poängräkningen där spelarna väljer tacka (utdelning "en i taget"). */
export const GOLD_PICK_PHASE = "gold-pick";
export const GOLD_TAKE = "takeGold";
const ID = "gold-mines";

interface GoldExt {
  /** Tackor som delats ut till spelare. */
  taken: string[];
  /** Pågående utdelning "en i taget" (se `Dist`); finns bara medan den väntar på val. */
  dist?: Dist;
  /** Någon annan än spelaren som har tur har redan valt tacka: ingen ångra. */
  locked?: boolean;
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

/** Variant "per-feature": varje berättigad spelare tar en tacka per område, utan val. */
function distributePerFeature(ctx: EngineHookContext, list: Claim[]): void {
  const order = clockwise(ctx);
  const gone = new Set<string>();
  for (const c of list)
    for (const pid of order) {
      if (!c.owners.includes(pid)) continue;
      const bar = c.bars.find((b) => !gone.has(b));
      if (!bar) break;
      gone.add(bar);
      give(ctx, pid, bar);
    }
}

/**
 * Utdelning "en i taget" (not 450), pågående över flera delsteg. Spelarna tar var sin tacka i tur och
 * ordning, medsols från den aktiva, tills ingen kan ta fler. Spelaren väljer själv vilken tacka (i form
 * av rutan den ligger på). Ligger allt hen har rätt till på samma ruta görs valet automatiskt.
 */
interface Dist {
  claims: Claim[];
  /** Spelarna medsols med början hos den aktiva. */
  order: PlayerId[];
  /** Tackor som redan delats ut. */
  gone: string[];
  /** Index i `order` för den som tar nästa tacka. */
  idx: number;
  /** Spelare vars val görs automatiskt (värden har hoppat över hen). */
  auto: PlayerId[];
  /** Fasen "gold-pick" har börjat. */
  started: boolean;
}

const present = (ctx: EngineHookContext, pid: PlayerId) => ctx.state.players.some((p) => p.id === pid);
const entitled = (d: Dist, pid: PlayerId, bar: string) => d.claims.some((c) => c.owners.includes(pid) && c.bars.includes(bar));

/** Tackorna spelaren kan ta, en post per ruta; de med färre rivaler först (det är också det automatiska valet). */
function choices(ctx: EngineHookContext, d: Dist, pid: PlayerId): { pos: Pos; bars: string[]; rivals: number }[] {
  const all = [...new Set(d.claims.flatMap((c) => c.bars))].sort();
  const groups = new Map<string, { pos: Pos; bars: string[]; rivals: number }>();
  for (const bar of all) {
    if (d.gone.includes(bar) || !entitled(d, pid, bar)) continue;
    const loc = ctx.state.figures.find((f) => f.id === bar)?.location;
    if (loc?.at !== "tile") continue;
    const key = posKey(loc.pos);
    const g = groups.get(key) ?? {
      pos: { ...loc.pos }, bars: [],
      rivals: d.order.filter((o) => o !== pid && present(ctx, o) && entitled(d, o, bar)).length,
    };
    g.bars.push(bar);
    groups.set(key, g);
  }
  return [...groups.values()].sort((a, b) => a.rivals - b.rivals);
}

function setActor(ctx: EngineHookContext, pid: PlayerId): void {
  if (pid === ctx.state.turn.player) delete ctx.state.turn.actor;
  else ctx.state.turn.actor = pid;
}

/**
 * Dela ut automatiskt tills en spelare ska välja mellan tackor på olika rutor. Returnerar sant om utdelningen
 * väntar på ett val (`turn.actor` är satt till den som väljer), falskt om den är klar (`ext.dist` borta).
 */
function advanceDist(ctx: EngineHookContext): boolean {
  const e = ext(ctx);
  const d = e.dist as Dist;
  const n = d.order.length;
  for (let acted = true; acted; ) {
    acted = false;
    for (let k = 0; k < n; k++) {
      const i = (d.idx + k) % n;
      const pid = d.order[i] as PlayerId;
      if (!present(ctx, pid)) continue;
      const opts = choices(ctx, d, pid);
      if (opts.length === 0) continue;
      if (opts.length > 1 && !d.auto.includes(pid)) {
        d.idx = i;
        setActor(ctx, pid);
        return true;
      }
      const bar = (opts[0] as { bars: string[] }).bars[0] as string;
      d.gone.push(bar);
      give(ctx, pid, bar);
      d.idx = (i + 1) % n;
      acted = true;
      break;
    }
  }
  delete e.dist;
  delete ctx.state.turn.actor;
  return false;
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
      const ctx = c as EngineHookContext;
      if (phase === GOLD_PICK_PHASE) {
        const d = ext(ctx).dist;
        const pid = d?.order[d.idx];
        if (!d || pid === undefined) return [];
        return choices(ctx, d, pid).map((g) => ({
          type: "expansion" as const, expansion: ID, action: GOLD_TAKE, data: { pos: g.pos },
        }));
      }
      if (phase !== GOLD_PHASE) return [];
      return candidates(ctx).map((pos) => ({
        type: "expansion" as const, expansion: ID, action: GOLD_ACTION, data: { pos },
      }));
    },

    applyStep(c, step) {
      const ctx = c as EngineHookContext;
      if (step.action === GOLD_TAKE) {
        const e = ext(ctx);
        const d = e.dist;
        const pid = d?.order[d.idx];
        const at = (step.data as { pos?: Pos } | null)?.pos;
        if (ctx.state.turn.phase !== GOLD_PICK_PHASE || !d || pid === undefined || !at) return "error.illegalStep";
        const pick = choices(ctx, d, pid).find((g) => g.pos.x === at.x && g.pos.y === at.y);
        if (!pick) return "error.illegalStep";
        const bar = pick.bars[0] as string;
        d.gone.push(bar);
        give(ctx, pid, bar);
        if (pid !== ctx.state.turn.player) e.locked = true;
        d.idx = (d.idx + 1) % d.order.length;
        if (!advanceDist(ctx)) ctx.state.turn.phase = "confirm";
        return null;
      }
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

    // Frågas efter poängräkningen med samma kontext som `scoreFeature`: dela ut tackorna. Utan val görs det
    // direkt; annars väntar utdelningen på spelarens val i fasen "gold-pick" (se `afterScoring`).
    extraTurn(c) {
      const ctx = c as EngineHookContext;
      const e = ext(ctx);
      delete e.locked;
      const list = claims.get(c);
      claims.delete(c);
      if (!list?.length) return false;
      if ((ctx.state.setup.variants[`${ID}.distribution`] ?? "one-at-a-time") === "per-feature") {
        distributePerFeature(ctx, list);
        return false;
      }
      e.dist = { claims: list, order: clockwise(ctx), gone: [], idx: 0, auto: [], started: false };
      advanceDist(ctx);
      return false;
    },

    // Utdelningen väntar på ett val: turen går in i fasen "gold-pick". Kommer vi hit igen med fasen redan
    // startad har värden hoppat över turen, och det som är kvar delas ut automatiskt.
    afterScoring(c: HookContext) {
      const ctx = c as EngineHookContext;
      const d = ext(ctx).dist;
      if (!d) return undefined;
      if (!d.started) {
        d.started = true;
        return GOLD_PICK_PHASE;
      }
      d.auto = [...d.order];
      advanceDist(ctx);
      return undefined;
    },

    // Värden hoppar över (eller tar bort) den som väljer tacka: det som hen har kvar delas ut automatiskt.
    skipActor(c: HookContext) {
      const ctx = c as EngineHookContext;
      const d = ext(ctx).dist;
      if (!d || ctx.state.turn.phase !== GOLD_PICK_PHASE) return;
      const pid = d.order[d.idx];
      if (pid !== undefined && present(ctx, pid)) d.auto.push(pid);
      // Det som delats ut automatiskt går inte att ångra (omspelningen från ögonblicksbilden skulle tappa det).
      ext(ctx).locked = true;
      if (!advanceDist(ctx)) ctx.state.turn.phase = "confirm";
    },

    canUndo(c: HookContext) {
      return !ext(c as EngineHookContext).locked;
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
  } as ExpansionModule["hooks"],
};
