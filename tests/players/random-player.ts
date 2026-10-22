// Testspelare: spelar slumpmässiga tillåtna drag och kontrollerar invarianter efter varje steg.

import type { GameEvent, GameSetup, GameState, Step } from "../../src/shared/state";
import type { EngineApi } from "../../src/engine/index";

/** Litet frö-baserat slumptal, skilt från spelets eget så att spelaren inte påverkar brickdragningen. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type Strategy = "random" | "eager";

export function chooseStep(steps: Step[], rnd: () => number, strategy: Strategy): Step {
  const pick = <T>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)] as T;
  const confirm = steps.find((s) => s.type === "confirm");
  if (confirm) return confirm;
  const figures = steps.filter((s) => s.type === "placeFigure");
  const returns = steps.filter((s) => s.type === "returnFigure");
  const p = strategy === "eager" ? 0.9 : 0.4;
  if (figures.length + returns.length > 0 && rnd() < p) return pick([...figures, ...returns]);
  const rest = steps.filter((s) => s.type !== "undo" && s.type !== "placeFigure" && s.type !== "returnFigure");
  return pick(rest.length ? rest : steps);
}

export interface GameResult {
  state: GameState;
  turns: number;
  stepsTaken: number;
  events: GameEvent[];
}

const json = (x: unknown) => JSON.stringify(x);

/** Kastar vid brott mot en invariant. */
export function checkInvariants(eng: EngineApi, s: GameState, initial: { tiles: number; figures: Map<string, number> }): void {
  // Brickor: karta + hög + händer + kastade är alltid lika många.
  const discarded = (s.ext.base as { discarded: string[] }).discarded.length;
  const river = s.ext.river as { waitingStart?: string } | undefined;
  const tiles =
    Object.keys(s.board).length + s.drawPile.length + s.players.reduce((n, p) => n + p.hand.length, 0) + discarded +
    (river?.waitingStart ? 1 : 0);
  if (tiles !== initial.tiles) throw new Error(`brickor ${tiles} != ${initial.tiles}`);
  // Pjäser: lika många av varje sort och ägare, unika id, rimliga platser.
  const seen = new Set<string>();
  const counts = new Map<string, number>();
  for (const f of s.figures) {
    if (seen.has(f.id)) throw new Error(`dubbelt pjäs-id ${f.id}`);
    seen.add(f.id);
    counts.set(`${f.owner}|${f.kind}`, (counts.get(`${f.owner}|${f.kind}`) ?? 0) + 1);
    if (f.location.at === "feature") {
      const t = s.board[`${f.location.pos.x},${f.location.pos.y}`];
      if (!t) throw new Error(`pjäs ${f.id} på tom ruta`);
    }
  }
  for (const [k, n] of initial.figures) if (counts.get(k) !== n) throw new Error(`pjäser ${k}: ${counts.get(k)} != ${n}`);
  // Högst en pjäs per kloster/trädgård och en per vanligt område (kollas bara ibland, det är dyrt).
  if (Object.keys(s.board).length % 7 === 0) {
    for (const a of eng.analyze(s).areas) {
      if (a.kind === "river") continue;
      if (a.kind !== "field" && a.figures.length > 1 && (a.kind === "cloister" || a.kind === "garden")) throw new Error("två pjäser på ett kloster");
    }
  }
  for (const p of s.players) if (p.score < 0 || !Number.isInteger(p.score)) throw new Error(`poäng ${p.score}`);
}

export function playGame(
  eng: EngineApi,
  setup: GameSetup,
  opts: { strategy?: Strategy; botSeed?: number; maxSteps?: number; checkUndo?: boolean } = {},
): GameResult {
  const rnd = makeRng(opts.botSeed ?? setup.seed * 7919 + 13);
  const maxSteps = opts.maxSteps ?? 20000;
  let s = eng.newGame(setup);
  const all = [...s.players.flatMap((p) => p.hand), ...s.drawPile];
  const initial = {
    tiles: Object.keys(s.board).length + all.length + ((s.ext.river as { waitingStart?: string } | undefined)?.waitingStart ? 1 : 0),
    figures: new Map<string, number>(),
  };
  for (const f of s.figures) initial.figures.set(`${f.owner}|${f.kind}`, (initial.figures.get(`${f.owner}|${f.kind}`) ?? 0) + 1);
  const events: GameEvent[] = [];
  let turns = 0;
  let n = 0;
  let committedScores = s.players.map((p) => p.score);
  while (!s.finished) {
    if (++n > maxSteps) throw new Error("spelet tar aldrig slut");
    const steps = eng.legalSteps(s);
    if (steps.length === 0) throw new Error(`inga tillåtna steg i fas ${s.turn.phase}`);
    const step = chooseStep(steps, rnd, opts.strategy ?? "random");
    const r = eng.apply(s, s.turn.player, step);
    if (!r.ok) throw new Error(`tillåtet steg nekades: ${json(step)} -> ${r.error}`);
    if (opts.checkUndo !== false && step.type !== "confirm" && rnd() < 0.2) {
      // Ångra ska ge exakt det tidigare läget.
      const u = eng.apply(r.state, s.turn.player, { type: "undo" });
      if (!u.ok || json(u.state) !== json(s)) throw new Error(`ångra gav inte tillbaka läget efter ${json(step)}`);
    }
    if (json(JSON.parse(json(r.state))) !== json(r.state)) throw new Error("tillståndet är inte ren JSON");
    if (step.type === "confirm") {
      turns++;
      events.push(...r.events);
      r.state.players.forEach((p, i) => {
        if (p.score < (committedScores[i] as number)) throw new Error("poäng minskade");
      });
      committedScores = r.state.players.map((p) => p.score);
    }
    s = r.state;
    checkInvariants(eng, s, initial);
  }
  if (s.drawPile.length || s.players.some((p) => p.hand.length)) throw new Error("spelet slutade med brickor kvar");
  const used = Object.keys(s.board).length + (s.ext.base as { discarded: string[] }).discarded.length;
  if (used !== initial.tiles) throw new Error(`alla brickor ska vara lagda eller kastade: ${used} != ${initial.tiles}`);
  if (eng.legalSteps(s).length !== 0) throw new Error("steg efter spelets slut");
  return { state: s, turns, stepsTaken: n, events };
}
