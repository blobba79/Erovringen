// The Ferries (s. 147-150, 205-206, 218).
//
// - Brickorna (8 sjöbrickor) finns i src/tiles/ferries.json; de har symbolen "ferry". På en sjöbricka
//   slutar varje väg vid sjön (en vägkant per väg). Sädescirkelbrickan som följer med i förpackningen
//   hör till Crop Circles II (PLAN.md).
// - 8 färjor ("ferry") är neutrala pjäser (id "ferry:0" ...). En färja på kartan har
//   location { at: "feature", pos, feature: "<kant>-<kant>" } där kanterna är två av sjöbrickans
//   vägkanter i ordningen N, E, S, W (t.ex. "N-E"). Färjan förbinder vägarna vid de två kanterna till
//   ett enda område (motorkroken `edgeLinks`). Vägar vid sjön utan färja är slut.
// - Turordning (s. 148, 206): bricka, pjäs, färja (sjöbricka), flytta färjor, poäng.
//   Efter pjässteget (motorkroken `afterFigureStep`) går turen in i:
//     fasen "ferries-place" (bara efter en sjöbricka): spelaren måste lägga en färja på brickan:
//       expansion "ferries" action "place"  data { choice: "N-E" }  (en knapp per kantpar; ingen pos,
//       eftersom brickan är den som just lagts)
//     fasen "ferries-move" (om brickan byggt vidare på en väg med färja): spelaren får flytta färjor:
//       expansion "ferries" action "move"   data { figure, pos, choice: "E-S" }  (pos = sjön, numreras
//       på storskärmen; choice = nya kantparet)
//       expansion "ferries" action "skip"   data {}  (klar, flytta inga fler)
//   Flyttbara färjor är den första färjan på varje väg som går ut från den lagda brickan (högst en
//   per riktning; en andra färja bakom den första får inte flyttas). Varje färja flyttas högst en gång
//   per tur (båda delarna av byggmästarens dubbeltur är samma tur); en färja som lagts ut den här turen
//   flyttas inte. En färja flyttas till något annat par
//   vägkanter på samma sjö (den behöver inte längre röra den förlängda vägen).
// - Poäng: inga egna; vägar räknas som vanligt över färjorna. Vägar som blir färdiga av en lagd eller
//   flyttad färja räknas i turens slut (motorkroken `scoreAround`).
// - T&B: byggmästaren går hem om flyttandet gör att ägaren inte längre har någon följare på vägen.
//   Att bara flytta en färja ger ingen extra tur (T&B ger den bara när brickan bygger vidare).
// - Mage & Witch: slår en lagd eller flyttad färja ihop magikerns och häxans vägar flyttas en av dem, som när
//   en bricka slår ihop dem (s. 154-155). Mage & Witch tar fasen när färjestegen är klara (motorkroken
//   `afterExpansionStep` i Mage & Witch).
// - Färjan är neutral: inget värde vid majoritet, kan inte fångas och räknas inte som mat åt draken.

import type { ExpansionModule } from "../../shared/expansion";
import type { Edge, TileSet } from "../../shared/tiles";
import type { Figure, Pos, Step } from "../../shared/state";
import type { EngineHookContext, EngineHooks } from "../../engine/context";
import { analyze } from "../../engine/features";
import { EDGES, neighbour, opposite, samePos } from "../../engine/geometry";
import { rotatedAt } from "../../engine/board";
import { returnToSupply, strength } from "../../engine/scoring";
import { placedStep } from "../../engine/turnstate";
import { TILE_DATA } from "../../tiles/index";

export const FERRY_KIND = "ferry";
export const PLACE_PHASE = "ferries-place";
export const MOVE_PHASE = "ferries-move";
const ID = "ferries";

const set: TileSet = (TILE_DATA[ID] as { set: TileSet }).set;

interface FerryExt {
  /** Färjor som flyttats den här turen (båda delarna av en dubbeltur); de flyttas inte igen. */
  moved: string[];
  /** Färjor som lagts ut eller flyttats i den här delen av turen: runt dem räknas färdiga vägar. */
  touched: string[];
  /** Färjor som får flyttas just nu. */
  movable: string[];
}

function ext(ctx: EngineHookContext): FerryExt {
  const s = ctx.state.ext as Record<string, unknown>;
  if (!s[ID]) s[ID] = { moved: [], touched: [], movable: [] } satisfies FerryExt;
  (s[ID] as FerryExt).touched ??= [];
  return s[ID] as FerryExt;
}

/** "N-E" för två kanter, i ordningen N, E, S, W. */
export function ferryKey(a: Edge, b: Edge): string {
  return EDGES.indexOf(a) < EDGES.indexOf(b) ? `${a}-${b}` : `${b}-${a}`;
}

export function parseFerryKey(key: string): [Edge, Edge] | undefined {
  const [a, b] = key.split("-");
  if (!EDGES.includes(a as Edge) || !EDGES.includes(b as Edge) || a === b) return undefined;
  return [a as Edge, b as Edge];
}

const isFerry = (f: Figure) => f.kind === FERRY_KIND;
const onMap = (f: Figure) => isFerry(f) && f.location.at === "feature";

/** Alla par av vägkanter på en bricka (nycklar), i fast ordning. */
function pairsOf(ctx: EngineHookContext, pos: Pos): string[] {
  const rt = rotatedAt(ctx.state.board, ctx.types, pos);
  if (!rt) return [];
  const ends = EDGES.filter((e) => rt.edgeKind[e] === "road");
  const out: string[] = [];
  for (let i = 0; i < ends.length; i++) for (let j = i + 1; j < ends.length; j++) out.push(ferryKey(ends[i]!, ends[j]!));
  return out;
}

function isLake(ctx: EngineHookContext, pos: Pos): boolean {
  const t = ctx.state.board[`${pos.x},${pos.y}`];
  return !!t && !!ctx.types.get(t.type)?.symbols?.includes("ferry");
}

/** Första färjan på varje väg som går ut från den lagda brickan (spärrar också vägen bakom sig). */
function firstFerries(ctx: EngineHookContext): Figure[] {
  const s = ctx.state;
  const placed = placedStep(s);
  if (!placed) return [];
  const prt = rotatedAt(s.board, ctx.types, placed.pos);
  if (!prt) return [];
  const ferries = s.figures.filter(onMap);
  const found: Figure[] = [];
  const visited = new Set<string>();
  const stack: { pos: Pos; feature: string }[] = [];
  for (const e of EDGES) {
    if (prt.edgeKind[e] !== "road") continue;
    const npos = neighbour(placed.pos, e);
    const nrt = rotatedAt(s.board, ctx.types, npos);
    const f = nrt?.edgeFeature[opposite(e)];
    if (nrt && f !== undefined && nrt.edgeKind[opposite(e)] === "road") stack.push({ pos: npos, feature: f });
    while (stack.length > 0) {
      const node = stack.pop()!;
      const key = `${node.pos.x},${node.pos.y}|${node.feature}`;
      if (visited.has(key)) continue;
      visited.add(key);
      const rt = rotatedAt(s.board, ctx.types, node.pos)!;
      const ferry = ferries.find((fe) => {
        const loc = fe.location as { pos: Pos; feature: string };
        const ends = parseFerryKey(loc.feature);
        return samePos(loc.pos, node.pos) && !!ends && ends.some((x) => rt.edgeFeature[x] === node.feature);
      });
      if (ferry) {
        if (!found.includes(ferry)) found.push(ferry);
        continue;
      }
      const feature = rt.features.find((x) => x.id === node.feature);
      for (const e2 of (feature as { edges?: Edge[] } | undefined)?.edges ?? []) {
        const p2 = neighbour(node.pos, e2);
        if (samePos(p2, placed.pos)) continue;
        const rt2 = rotatedAt(s.board, ctx.types, p2);
        const f2 = rt2?.edgeFeature[opposite(e2)];
        if (rt2 && f2 !== undefined && rt2.edgeKind[opposite(e2)] === "road") stack.push({ pos: p2, feature: f2 });
      }
    }
  }
  return found;
}

interface Option {
  action: "place" | "move" | "skip";
  data: { pos?: Pos; figure?: string; choice?: string };
}

function options(ctx: EngineHookContext, phase: string): Option[] {
  const s = ctx.state;
  const e = ext(ctx);
  if (phase === PLACE_PHASE) {
    const placed = placedStep(s);
    if (!placed || !s.figures.some((f) => isFerry(f) && f.location.at === "supply")) return [];
    return pairsOf(ctx, placed.pos).map((choice) => ({ action: "place", data: { choice } }));
  }
  if (phase === MOVE_PHASE) {
    const out: Option[] = [];
    for (const f of s.figures) {
      if (!e.movable.includes(f.id) || f.location.at !== "feature") continue;
      const loc = f.location;
      for (const choice of pairsOf(ctx, loc.pos))
        if (choice !== loc.feature) out.push({ action: "move", data: { figure: f.id, pos: { ...loc.pos }, choice } });
    }
    return out.length > 0 ? [...out, { action: "skip", data: {} }] : [];
  }
  return [];
}

/** Fasen efter att färjor lagts eller flyttats: flytta fler om något går, annars bekräfta. */
function nextPhase(ctx: EngineHookContext): string {
  const e = ext(ctx);
  const opts = options(ctx, MOVE_PHASE);
  e.movable = e.movable.filter((id) => opts.some((o) => o.data.figure === id));
  return e.movable.length > 0 ? MOVE_PHASE : "confirm";
}

/** Byggmästare utan följare från samma ägare på vägen går hem när färjor ändrat vägarna. */
function sendBuildersHome(ctx: EngineHookContext): void {
  const s = ctx.state;
  const an = analyze(s.board, s.figures, ctx.types);
  for (const f of s.figures) {
    if (f.kind !== "builder" || f.location.at !== "feature" || f.owner === null) continue;
    const area = an.areaAt(f.location.pos, f.location.feature);
    if (!area || !area.figures.some((x) => x.owner === f.owner && strength(x) > 0)) returnToSupply(ctx, f);
  }
}

const edgeLinks: EngineHooks["edgeLinks"] = (figures) => {
  const out: { pos: Pos; a: Edge; b: Edge }[] = [];
  for (const f of figures) {
    if (!isFerry(f) || f.location.at !== "feature") continue;
    const ends = parseFerryKey(f.location.feature);
    if (ends) out.push({ pos: f.location.pos, a: ends[0], b: ends[1] });
  }
  return out;
};

const engineHooks: Partial<EngineHooks> = {
  edgeLinks,

  afterFigureStep(c) {
    const placed = placedStep(c.state);
    if (!placed) return undefined;
    const e = ext(c);
    if (isLake(c, placed.pos)) return options(c, PLACE_PHASE).length > 0 ? PLACE_PHASE : undefined;
    // Varje färja flyttas högst en gång per tur, även i andra delen av en dubbeltur.
    e.movable = firstFerries(c).map((f) => f.id).filter((id) => !e.moved.includes(id));
    const phase = nextPhase(c);
    return phase === "confirm" ? undefined : phase;
  },

  // En ny spelares tur: alla färjor får flyttas igen. Andra delen av byggmästarens dubbeltur (`extra`) är
  // samma tur ("högst en gång per tur", s. 148), så då behålls listan.
  turnStarted(c, extra) {
    const e = ext(c);
    e.touched = [];
    e.movable = [];
    if (!extra) e.moved = [];
  },

  scoreAround(c) {
    const touched = ext(c).touched ?? [];
    return c.state.figures.filter((f) => touched.includes(f.id) && f.location.at === "feature").map((f) => (f.location as { pos: Pos }).pos);
  },
};

export const ferriesModule: ExpansionModule = {
  id: ID,
  requires: ["base"],
  tileSets: [set],
  figures: [{ kind: FERRY_KIND, count: 8, neutral: true, placeableOn: [] }],
  variants: [],
  hooks: {
    ...(engineHooks as object),

    setup(c) {
      ext(c as EngineHookContext);
    },

    extraSteps(c, phase): Step[] {
      return options(c as EngineHookContext, phase).map((o) => ({ type: "expansion", expansion: ID, action: o.action, data: o.data }));
    },

    applyStep(c, step) {
      const ctx = c as EngineHookContext;
      const s = ctx.state;
      const phase = s.turn.phase;
      const d = (step.data ?? {}) as { pos?: Pos; figure?: string; choice?: string };
      const ok = options(ctx, phase).find(
        (o) => o.action === step.action && o.data.figure === d.figure && o.data.choice === d.choice &&
          (o.data.pos === undefined ? d.pos === undefined : !!d.pos && samePos(o.data.pos, d.pos)),
      );
      if (!ok) return "error.illegalStep";
      const e = ext(ctx);
      if (step.action === "place") {
        const placed = placedStep(s)!;
        const ferry = s.figures.find((f) => isFerry(f) && f.location.at === "supply")!;
        ferry.location = { at: "feature", pos: { ...placed.pos }, feature: d.choice! };
        e.touched.push(ferry.id);
        ctx.emit({ type: "figurePlaced", figure: ferry.id, location: ferry.location });
        // Inte den nya färjan (en färja som lagts ut den här turen flyttas inte) och inte färjor som flyttats i turen.
        e.movable = firstFerries(ctx).map((f) => f.id).filter((id) => !e.moved.includes(id) && !e.touched.includes(id));
      } else if (step.action === "move") {
        const ferry = s.figures.find((f) => f.id === d.figure)!;
        const pos = (ferry.location as { pos: Pos }).pos;
        ferry.location = { at: "feature", pos: { ...pos }, feature: d.choice! };
        e.moved.push(ferry.id);
        e.touched.push(ferry.id);
        e.movable = e.movable.filter((id) => id !== ferry.id);
        ctx.emit({ type: "figurePlaced", figure: ferry.id, location: ferry.location });
      } else e.movable = [];
      if (step.action !== "skip") sendBuildersHome(ctx);
      s.turn.phase = nextPhase(ctx);
      return null;
    },

    extraTurn(c) {
      const e = ext(c as EngineHookContext);
      // Bara den här delens färjor nollställs; `moved` gäller hela turen, även båda delarna av en
      // dubbeltur (nollställs i `turnStarted`).
      e.touched = [];
      e.movable = [];
      return false;
    },
  },
};
