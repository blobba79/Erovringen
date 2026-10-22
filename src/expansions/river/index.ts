// Floden (River I, ingår i grundspelet; s. 27-30).
//
// - Källan är startbrickan. Flodbrickorna blandas och läggs först i högen, sjön sist av dem.
// - En flodbricka måste fortsätta floden (läggas vid den öppna änden) och får inte göra en
//   omedelbar U-sväng (två kurvor åt samma håll efter varandra).
// - Sjön får läggas först när inga andra flodbrickor finns i högen eller på den egna handen.
// - Variant "river.startTile": "shuffle" (standard) blandar in den vanliga startbrickan bland
//   flodbrickorna; "afterRiver" lägger den överst i högen när sjön har lagts.

import type { ExpansionModule, RuleVariantDefinition } from "../../shared/expansion";
import type { Edge, TileSet, TileType } from "../../shared/tiles";
import type { GameState, Pos } from "../../shared/state";
import type { EngineHookContext } from "../../engine/context";
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
}

const variants: RuleVariantDefinition[] = [{ id: "startTile", options: ["shuffle", "afterRiver"], default: "shuffle" }];

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

  /** Variant "afterRiver": lägg den vanliga startbrickan överst i högen. */
  function releaseStart(s: GameState): void {
    const r = ext(s);
    if (r.waitingStart === undefined) return;
    s.drawPile.unshift(r.waitingStart);
    delete r.waitingStart;
  }

  return {
    id: "river",
    requires: ["base"],
    tileSets: [set],
    figures: [],
    variants,
    hooks: {
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
        if (tile === undefined || !ids.has(tile)) return true;
        const s = ctx.state;
        const end = openRiverEnd(ctx);
        if (!end || !samePos(pos, neighbour(end.pos, end.edge))) return false;
        if (tile === lake) {
          const hand = s.players.find((p) => p.id === ctx.player)?.hand ?? [];
          if ([...s.drawPile, ...hand].some((t) => ids.has(t) && t !== lake)) return false;
        }
        // Ingen omedelbar U-sväng: bricka P (öppna änden) och nya brickan får inte svänga åt samma håll.
        const p = riverEdgesOf(rotatedAt(s.board, ctx.types, end.pos)!);
        const n = riverEdgesOf(rotateTile(ctx.types.get(tile)!, step.rotation));
        const isCurve = (e: Edge[]) => e.length === 2 && opposite(e[0]!) !== e[1];
        if (isCurve(p) && isCurve(n)) {
          const turn1 = turnOf(p.find((e) => e !== end.edge)!, end.edge);
          const turn2 = turnOf(opposite(end.edge), n.find((e) => e !== opposite(end.edge))!);
          if (turn1 === turn2) return false;
        }
        return true;
      },
      afterTilePlaced(ctx, pos) {
        const placed = ctx.state.board[posKey(pos)];
        if (!placed || placed.type !== lake) return;
        ext(ctx.state).done = true;
        releaseStart(ctx.state);
      },
      // Anropas när en tur avslutas, före påfyllningen av handen. Går floden aldrig att avsluta
      // (sjön kastad, inga flodbrickor kvar) släpps den väntande startbrickan ändå.
      extraTurn(ctx) {
        const s = ctx.state;
        if (ext(s).waitingStart === undefined) return false;
        const hands = s.players.flatMap((p) => p.hand);
        if (![...s.drawPile, ...hands].some((t) => ids.has(t))) releaseStart(s);
        return false;
      },
    },
  };
}

export const riverModule: ExpansionModule = makeRiverModule();
