// Dev: riktigt speltillstånd från motorn med slumpade lagliga drag, för att prova storskärmen utan servern.

import { allTileTypes } from "../../tiles/index";
import { baseModule, createEngine, type EngineApi } from "../../engine/index";
import { riverModule } from "../../expansions/river/index";
import { abbotModule } from "../../expansions/abbot/index";
import type { GameSetup, GameState, PlayerId, Pos, Step } from "../../shared/state";
import type { GameStats, Preview, PublicState } from "../../shared/messages";

export function devEngine(): EngineApi {
  return createEngine([baseModule, riverModule, abbotModule], allTileTypes().values());
}

export function devSetup(players = 3, seed = 7): GameSetup {
  const colors = ["#E4572E", "#2E86DE", "#3DAA4E", "#F2C14E", "#7D4F9E"];
  return {
    expansions: ["base", "river", "abbot"],
    variants: {},
    handSize: 1,
    showClosingTiles: true,
    players: Array.from({ length: players }, (_, i) => ({ id: `p${i + 1}`, name: ["Anna", "Bo", "Cia", "Dan", "Eva"][i]!, color: colors[i]! })),
    seed,
  };
}

/** Det spelarna får se: händer och slumpfrö borttagna, brickräknare tillagd. */
export function toPublic(s: GameState): PublicState {
  const { rng: _rng, drawPile, players, ...rest } = s;
  const remaining: Record<string, number> = {};
  for (const t of drawPile) remaining[t] = (remaining[t] ?? 0) + 1;
  return {
    ...rest,
    players: players.map(({ hand, ...p }) => ({ ...p, handCount: hand.length })),
    drawPileCount: drawPile.length,
    remaining,
  };
}

/** Ett slumpat lagligt delsteg (föredrar att sätta ut pjäser ibland). */
export function randomStep(eng: EngineApi, s: GameState, rnd: () => number): { player: PlayerId; step: Step } | undefined {
  const steps = eng.legalSteps(s);
  if (steps.length === 0) return undefined;
  const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)]!;
  const confirm = steps.find((x) => x.type === "confirm");
  if (confirm) return { player: s.turn.player, step: confirm };
  const figs = steps.filter((x) => x.type === "placeFigure");
  if (figs.length && rnd() < 0.5) return { player: s.turn.player, step: pick(figs) };
  const rest = steps.filter((x) => x.type !== "undo" && x.type !== "placeFigure" && x.type !== "returnFigure");
  return { player: s.turn.player, step: pick(rest.length ? rest : steps) };
}

/** Förhandsvisning med siffror på de lagliga platserna för brickan som ska läggas. */
export function previewSpots(eng: EngineApi, s: GameState): Preview {
  const hand = s.players.find((p) => p.id === s.turn.player)?.hand ?? [];
  const tile = hand[0];
  if (!tile) return {};
  const seen = new Set<string>();
  const spots: Pos[] = [];
  for (const p of eng.placementsFor(s, tile)) {
    const k = `${p.pos.x},${p.pos.y}`;
    if (!seen.has(k)) { seen.add(k); spots.push(p.pos); }
  }
  spots.sort((a, b) => a.y - b.y || a.x - b.x);
  return { edge: "all", spots };
}

/** Påhittad statistik för dev-sidan: poängen växer slumpmässigt över ett antal turer. */
export function fakeStats(s: GameState, rnd: () => number, turns = 24): GameStats {
  const ids = s.players.map((p) => p.id);
  const cur: Record<PlayerId, number> = Object.fromEntries(ids.map((id) => [id, 0]));
  const scoreTimeline: Record<PlayerId, number>[] = [{ ...cur }];
  for (let t = 0; t < turns; t++) {
    const id = ids[t % ids.length]!;
    cur[id] = cur[id]! + Math.floor(rnd() * 9);
    scoreTimeline.push({ ...cur });
  }
  const pointsByReason: Record<PlayerId, Record<string, number>> = {};
  for (const id of ids) {
    const total = cur[id]!;
    const city = Math.floor(total * 0.5), road = Math.floor(total * 0.3);
    pointsByReason[id] = { city, road, "final.farm": total - city - road };
  }
  const first = Object.values(s.board)[0]?.pos;
  return {
    scoreTimeline, pointsByReason, turns, durationSeconds: 1800,
    records: [
      { key: "stats.largestCity", player: ids[0] ?? null, value: 12, pos: first },
      { key: "stats.mostFarmPoints", player: ids[1] ?? null, value: 9 },
    ],
  };
}
