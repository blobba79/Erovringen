// Floden (River I, ingår i grundspelet; s. 27-30).
//
// - Källan är startbrickan. Flodbrickorna blandas och läggs först i högen, sjön sist av dem.
// - En flodbricka måste fortsätta floden (läggas vid den öppna änden) och får inte göra en
//   omedelbar U-sväng (två kurvor åt samma håll efter varandra).
// - Sjön får läggas först när inga andra flodbrickor finns i högen eller på den egna handen.
// - Så länge floden inte är klar håller ingen brickor mellan turerna: den som har tur drar en
//   bricka ur flodhögen och måste lägga den (oavsett handstorlek). De vanliga händerna delas ut
//   först när sjön är lagd, i turordning med start hos nästa spelare.
// - Variant "river.startTile": "shuffle" (standard) blandar in den vanliga startbrickan bland
//   flodbrickorna; "afterRiver" gör den till nästa bricka efter sjön (nästa spelare drar den).
// - Variant "river.deadEnds": "allow" (standard, originalregeln) förbjuder bara en omedelbar
//   U-sväng; "forbid" förbjuder även flodbrickor som kan köra fast floden (som JCloisterZone).

import type { ExpansionModule, RuleVariantDefinition } from "../../shared/expansion";
import type { Edge, TileSet, TileType } from "../../shared/tiles";
import type { GameState, Pos } from "../../shared/state";
import type { EngineHookContext, EngineHooks } from "../../engine/context";
import { EDGES, edgeIndex, neighbour, opposite, parseKey, posKey, samePos } from "../../engine/geometry";
import { rotatedAt } from "../../engine/board";
import { rotateTile } from "../../engine/tileinfo";
import { shuffle } from "../../engine/rng";
import { TILE_DATA } from "../../tiles/index";

export interface RiverExt {
  /** Sjön är lagd. */
  done: boolean;
  /** Variant "afterRiver": startbrickan som väntar på att floden ska bli klar. */
  waitingStart?: string;
  /** De vanliga händerna är utdelade (flodfasen är över). */
  dealt?: boolean;
}

const variants: RuleVariantDefinition[] = [
  { id: "startTile", options: ["shuffle", "afterRiver"], default: "shuffle" },
  { id: "deadEnds", options: ["allow", "forbid"], default: "allow" },
];

const riverEdgesOf = (rt: ReturnType<typeof rotateTile>): Edge[] => EDGES.filter((e) => rt.edgeKind[e] === "river");

/** Flodens öppna ände: en flodkant som vetter mot en tom ruta. */
export function openRiverEnd(ctx: EngineHookContext, state: GameState = ctx.state): { pos: Pos; edge: Edge } | null {
  for (const k of Object.keys(state.board)) {
    const pos = parseKey(k);
    const rt = rotatedAt(state.board, ctx.types, pos)!;
    for (const edge of riverEdgesOf(rt)) if (!state.board[posKey(neighbour(pos, edge))]) return { pos, edge };
  }
  return null;
}

/** Sväng: 1 = höger, 3 = vänster, 0 = rakt. `from` = sidan floden kommer in på, `to` = sidan den lämnar. */
const turnOf = (from: Edge, to: Edge): number => (((edgeIndex(to) - (edgeIndex(from) + 2)) % 4) + 4) % 4;

export function makeRiverModule(
  set: TileSet = (TILE_DATA.river as { set: TileSet }).set,
  tiles: TileType[] = (TILE_DATA.river as { tiles: TileType[] }).tiles,
): ExpansionModule {
  const ids = new Set(tiles.map((t) => t.id));
  const riverCount = (t: TileType) => t.features.filter((f) => f.kind === "river").reduce((n, f) => n + (f as { edges: Edge[] }).edges.length, 0);
  const lake = tiles.find((t) => t.id !== set.start && riverCount(t) === 1)?.id;
  const ext = (s: GameState) => s.ext.river as RiverExt;

  /** Flodbrickor som finns kvar i högen eller på någon hand. */
  const riverTiles = (s: GameState) => [...s.drawPile, ...s.players.flatMap((p) => p.hand)].filter((t) => ids.has(t));

  const nextSeat = (s: GameState, from: string): number => {
    const i = s.players.findIndex((p) => p.id === from);
    return (i + 1) % s.players.length;
  };

  /**
   * Variant "forbid". Rutorna som JCloisterZones isContinuationFree håller tomma framför en öppen
   * flodände: båda sidorna om fortsättningsrutan, rutan två steg fram och dess båda grannar.
   */
  const reserved = (pos: Pos, side: Edge): Pos[] => {
    const adj = neighbour(pos, side);
    const adj2 = neighbour(adj, side);
    const i = edgeIndex(side);
    const flanks = (q: Pos) => [neighbour(q, EDGES[(i + 1) % 4]!), neighbour(q, EDGES[(i + 3) % 4]!)];
    return [...flanks(adj), adj2, ...flanks(adj2)];
  };
  const forbidDeadEnds = (s: GameState) => (s.setup.variants["river.deadEnds"] ?? "allow") === "forbid";

  /**
   * Variant "forbid": kan floden alltid fortsätta, vilka av de återstående flodbrickorna (rakt eller
   * kurva) som än dras härnäst? Förenklad modell av kartan: bara vilka rutor som är upptagna, flodens
   * ände (ruta + riktning) och åt vilket håll den senaste brickan svängde (0 rakt, 1 höger, 3 vänster).
   * Varje steg följer samma regler som den riktiga placeringen: fri ruta, ingen omedelbar U-sväng
   * och fria skyddsrutor framför den nya änden. Efter sista flodbrickan måste sjöns ruta vara fri.
   */
  function safe(occ: Set<string>, end: Pos, dir: Edge, last: number, straight: number, curves: number): boolean {
    const q = neighbour(end, dir);
    if (occ.has(posKey(q))) return false;
    if (straight + curves === 0) return true;
    const tryTurn = (turn: number): boolean => {
      if (turn !== 0 && turn === last) return false;
      const exit = EDGES[(edgeIndex(dir) + turn) % 4]!;
      if (reserved(q, exit).some((r) => occ.has(posKey(r)))) return false;
      const next = new Set(occ).add(posKey(q));
      return safe(next, q, exit, turn, straight - (turn === 0 ? 1 : 0), curves - (turn === 0 ? 0 : 1));
    };
    return (straight === 0 || tryTurn(0)) && (curves === 0 || tryTurn(1) || tryTurn(3));
  }

  const isStraight = (e: Edge[]) => e.length === 2 && opposite(e[0]!) === e[1];
  /** Antal rakta och kurviga flodbrickor kvar (utom sjön), ev. utan en bricka som just läggs. */
  function remaining(s: GameState, types: EngineHookContext["types"], placing?: string): [number, number] {
    const left = riverTiles(s).filter((t) => t !== lake);
    if (placing !== undefined) left.splice(left.indexOf(placing), 1);
    let straight = 0;
    for (const t of left) if (isStraight(riverEdgesOf(rotateTile(types.get(t)!, 0)))) straight++;
    return [straight, left.length - straight];
  }
  const occupied = (s: GameState, extra: Pos): Set<string> => new Set([...Object.keys(s.board), posKey(extra)]);
  const endTurn = (end: { pos: Pos; edge: Edge }, p: Edge[]): number =>
    p.length === 2 && !isStraight(p) ? turnOf(p.find((e) => e !== end.edge)!, end.edge) : 0;

  const engineHooks: Partial<EngineHooks> = {
    // Första spelaren drar en flodbricka; ingen annan får något än.
    dealAtStart(c, first) {
      const s = c.state;
      ext(s).dealt = false;
      const t = s.drawPile.shift();
      if (t !== undefined) s.players.find((p) => p.id === first)!.hand.push(t);
      return true;
    },
    dealAfterTurn(c) {
      const s = c.state;
      const r = ext(s);
      if (r.dealt) return undefined;
      const start = nextSeat(s, c.player);
      const over = r.done || riverTiles(s).length === 0;
      if (over && r.waitingStart !== undefined) {
        // "afterRiver": startbrickan är nästa bricka, dragen av nästa spelare.
        s.drawPile.unshift(r.waitingStart);
        delete r.waitingStart;
      } else if (over) {
        // Vanliga händer, upp till handstorleken, i turordning från nästa spelare.
        r.dealt = true;
        for (let round = 0; round < s.setup.handSize; round++)
          for (let k = 0; k < s.players.length; k++) {
            const t = s.drawPile.shift();
            if (t !== undefined) s.players[(start + k) % s.players.length]!.hand.push(t);
          }
        return s.players[start]!.hand.length > 0 ? s.players[start]!.id : null;
      }
      const t = s.drawPile.shift();
      if (t === undefined) return null;
      s.players[start]!.hand.push(t);
      return s.players[start]!.id;
    },
  };

  return {
    id: "river",
    requires: ["base"],
    tileSets: [set],
    figures: [],
    variants,
    hooks: {
      ...engineHooks,
      setup(c) {
        const ctx = c as EngineHookContext;
        const s = ctx.state;
        s.ext.river = { done: false } satisfies RiverExt;
        const plain = ctx.env.modules.find((m) => m.id === "base")?.tileSets[0]?.start;
        const river = s.drawPile.filter((t) => ids.has(t) && t !== lake);
        const rest = s.drawPile.filter((t) => !ids.has(t));
        const at = plain === undefined ? -1 : rest.indexOf(plain);
        if (at >= 0) {
          rest.splice(at, 1);
          if ((s.setup.variants["river.startTile"] ?? "shuffle") === "afterRiver") ext(s).waitingStart = plain;
          else river.push(plain as string);
        }
        shuffle(s, river);
        s.drawPile = [...river, ...(lake !== undefined && s.drawPile.includes(lake) ? [lake] : []), ...rest];
      },
      canPlaceTile(c, pos, step) {
        const ctx = c as EngineHookContext;
        const tile = ctx.tile;
        if (tile === undefined) return true;
        const s = ctx.state;
        if (!ids.has(tile)) {
          // "forbid": en vanlig bricka (den inblandade startbrickan) får inte spärra flodens väg.
          if (!forbidDeadEnds(s) || ext(s).done) return true;
          const open = openRiverEnd(ctx);
          if (!open) return true;
          const [st, cu] = remaining(s, ctx.types);
          const last = endTurn(open, riverEdgesOf(rotatedAt(s.board, ctx.types, open.pos)!));
          if (reserved(open.pos, open.edge).some((q) => samePos(q, pos))) return false;
          return safe(occupied(s, pos), open.pos, open.edge, last, st, cu);
        }
        const end = openRiverEnd(ctx);
        if (!end || !samePos(pos, neighbour(end.pos, end.edge))) return false;
        if (tile === lake && riverTiles(s).some((t) => t !== lake)) return false;
        // Ingen omedelbar U-sväng: bricka P (öppna änden) och nya brickan får inte svänga åt samma håll.
        const p = riverEdgesOf(rotatedAt(s.board, ctx.types, end.pos)!);
        const n = riverEdgesOf(rotateTile(ctx.types.get(tile)!, step.rotation));
        const isCurve = (e: Edge[]) => e.length === 2 && opposite(e[0]!) !== e[1];
        if (isCurve(p) && isCurve(n)) {
          const turn1 = turnOf(p.find((e) => e !== end.edge)!, end.edge);
          const turn2 = turnOf(opposite(end.edge), n.find((e) => e !== opposite(end.edge))!);
          if (turn1 === turn2) return false;
        }
        if (forbidDeadEnds(s) && tile !== lake) {
          const exit = n.find((e) => e !== opposite(end.edge))!;
          if (reserved(pos, exit).some((r) => s.board[posKey(r)])) return false;
          const [st, cu] = remaining(s, ctx.types, tile);
          const last = n.length === 2 && !isStraight(n) ? turnOf(opposite(end.edge), exit) : 0;
          if (!safe(occupied(s, pos), pos, exit, last, st, cu)) return false;
        }
        return true;
      },
      afterTilePlaced(ctx, pos) {
        const placed = ctx.state.board[posKey(pos)];
        if (placed && placed.type === lake) ext(ctx.state).done = true;
      },
    },
  };
}

export const riverModule: ExpansionModule = makeRiverModule();
