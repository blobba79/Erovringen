// Strategin för datorstyrda spelare. Ren logik utan nätverk: `chooseBotStep` väljer nästa delsteg
// åt spelaren vars tur det är. Servern anropar den en gång per delsteg.
//
// Idén: ett läge värderas som egna poäng plus en andel av värdet i de egna ofärdiga områdena,
// minus en andel av motståndarnas motsvarande värde och en liten avgift för pjäser som är utställda
// (så att inte alla går åt tidigt). Delsteg provspelas på en klon till och med bekräftelsen, så
// poängen brickan ger direkt räknas med.

import type { GameState, PlayerId, Step } from "../shared/state";
import type { EngineApi } from "../engine/index";
import { actorOf, areaValue, majorityOwners, strength } from "../engine/index";

/** Hur mycket ett ofärdigt område är värt per poäng det är värt nu, efter sort. */
const POTENTIAL: Record<string, number> = { city: 0.55, road: 0.5, cloister: 0.65, garden: 0.65, field: 0.45 };
/** Vikt för motståndarnas läge. */
const OPPONENT_WEIGHT = 0.6;
/** Så många placeringar provas fullt ut (med pjäsval). */
const TOP_PLACEMENTS = 3;
/** Så många placeringar provspelas över huvud taget; resten sorteras bort på hur många grannar de rör. */
const MAX_QUICK = 16;

type Rnd = () => number;

function scarcity(state: GameState, me: PlayerId): number {
  const left = state.figures.filter((f) => f.owner === me && f.location.at === "supply" && f.kind !== "abbot" && strength(f) > 0).length;
  const raw = 0.25 * (7 - left) + 0.6 * Math.max(0, 3 - left);
  // Mot slutet spelar det ingen roll att spara pjäser.
  return raw * Math.min(1, state.drawPile.length / 15);
}

/** Värdet av läget sett från `me`. */
export function evaluate(eng: EngineApi, state: GameState, me: PlayerId): number {
  const an = eng.analyze(state);
  const pot = new Map<PlayerId, number>();
  for (const area of an.areas) {
    if (area.figures.length === 0 || area.complete) continue;
    const owners = majorityOwners(area);
    if (owners.length === 0) continue;
    const share = ((POTENTIAL[area.kind] ?? 0.3) * areaValue(an, area)) / owners.length;
    for (const o of owners) pot.set(o, (pot.get(o) ?? 0) + share);
  }
  const total = (p: { id: PlayerId; score: number }) => p.score + (pot.get(p.id) ?? 0);
  const others = state.players.filter((p) => p.id !== me);
  const mine = state.players.find((p) => p.id === me);
  const opp = others.length ? others.reduce((n, p) => n + total(p), 0) / others.length : 0;
  return (mine ? total(mine) : 0) - OPPONENT_WEIGHT * opp - scarcity(state, me);
}

/** Så många val i en expansions egen fas (porten, draken) provspelas när ett steg följs av ett val. */
const MAX_FOLLOW_UPS = 8;

/**
 * Räknebudget för ett drag. Med många expansioner och en stor karta kan antalet alternativ bli stort,
 * och varje provspelning kostar några millisekunder. Budgeten delas ut i ordning efter hur lovande
 * alternativen är, så att datorn alltid svarar inom ungefär en sekund. `sims` räknar provspelade steg
 * (deterministiskt); `deadline` är en säkerhetsgräns i tid för de sällsynta fall där ett enskilt
 * steg är ovanligt dyrt.
 */
const MAX_SIMS = 220;
const MAX_MS = 900;

interface Budget {
  sims: number;
  deadline: number;
}

const newBudget = (): Budget => ({ sims: MAX_SIMS, deadline: performance.now() + MAX_MS });
const exhausted = (b: Budget) => b.sims <= 0 || performance.now() > b.deadline;
/** En del av budgeten åt ett alternativ; det som blir över går tillbaka till `parent` via `give`. */
const share = (parent: Budget, parts: number): Budget => ({ sims: Math.floor(parent.sims / Math.max(1, parts)), deadline: parent.deadline });
const settle = (parent: Budget, child: Budget, given: number) => {
  parent.sims -= given - child.sims;
};

function sim(eng: EngineApi, b: Budget, state: GameState, me: PlayerId, step: Step) {
  b.sims--;
  return eng.simulate(state, me, step);
}

/** Provspelar ett delsteg och resten av turen (utan pjäs, sedan bekräfta). Null om steget inte går. */
function finishValue(eng: EngineApi, b: Budget, state: GameState, me: PlayerId, step: Step, depth = 0): number | null {
  let r = sim(eng, b, state, me, step);
  for (let guard = 0; guard < 6 && r.ok; guard++) {
    const s = r.state;
    if (s.finished || actorOf(s) !== me) return evaluate(eng, s, me);
    const legal = eng.legalSteps(s);
    // I en expansions egen fas finns varken "confirm" eller "noFigure": ta bekräfta, annars ett eget steg.
    const next =
      legal.find((x) => x.type === (s.turn.phase === "confirm" ? "confirm" : "noFigure")) ??
      legal.find((x) => x.type === "confirm");
    if (next) {
      r = sim(eng, b, s, me, next);
      continue;
    }
    const own = legal.filter((x) => x.type === "expansion");
    if (own.length === 0) return null;
    // Ett val av flera (var porten ska stå, vart draken går): ta det bästa, ett steg djupt. När budgeten är
    // slut tas bara det första valet, så att alternativet ändå räknas färdigt och går att jämföra.
    if (own.length > 1 && depth < 1 && !exhausted(b)) {
      let best: number | null = null;
      for (const o of own.slice(0, MAX_FOLLOW_UPS)) {
        if (best !== null && exhausted(b)) break;
        const v = finishValue(eng, b, s, me, o, depth + 1);
        if (v !== null && (best === null || v > best)) best = v;
      }
      return best;
    }
    r = sim(eng, b, s, me, own[0] as Step);
  }
  return r.ok ? evaluate(eng, r.state, me) : null;
}

const isFigureStep = (s: Step) => s.type !== "undo" && s.type !== "confirm" && s.type !== "noFigure";

/** Andel av en brickas budget som högst går åt till att pröva placeringar utan pjäs; resten går till pjäsvalen. */
const QUICK_SHARE = 0.5;

/**
 * Placering och pjäs räknas ut tillsammans, så pjäsvalet sparas till nästa anrop i samma tur i stället
 * för att räknas om. Nyckeln beskriver läget (spelare, fas, turens steg, kartans och högens storlek).
 */
const plans = new Map<string, Step>();
const keyOf = (s: GameState) => `${actorOf(s)}|${s.turn.phase}|${JSON.stringify(s.turn.pending)}|${Object.keys(s.board).length}|${s.drawPile.length}`;

/** Spara `steps` som plan från läget `from`; de första `skip` stegen gör anroparen själv och sparas inte. */
function rememberPlan(eng: EngineApi, from: GameState, me: PlayerId, steps: Step[], skip = 0): void {
  if (plans.size > 20) plans.clear();
  let s = from;
  for (const [i, st] of steps.entries()) {
    if (i >= skip) plans.set(keyOf(s), st);
    const r = eng.simulate(s, me, st);
    if (!r.ok) return;
    s = r.state;
  }
}

interface Plan {
  step: Step;
  value: number;
  /** Pjäsvalet som hör till placeringen (noFigure om ingen pjäs är bäst). */
  figure: Step;
}

function bestPlacement(eng: EngineApi, b: Budget, state: GameState, me: PlayerId, rnd: Rnd): Plan | null {
  let placements = eng.legalSteps(state).filter((s) => s.type === "placeTile");
  if (placements.length === 0) return null;
  // Platser som rör flest grannbrickor är oftast de som avslutar något; resten får slumpen avgöra.
  if (placements.length > MAX_QUICK) {
    const touch = (s: Step) => {
      if (s.type !== "placeTile") return 0;
      let n = 0;
      for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) if (state.board[`${s.pos.x + dx},${s.pos.y + dy}`]) n++;
      return n + rnd() * 0.9;
    };
    placements = placements.map((s) => ({ s, k: touch(s) })).sort((a, b) => b.k - a.k).slice(0, MAX_QUICK).map((x) => x.s);
  }
  const quickStart = b.sims;
  const quick: Plan[] = [];
  for (const step of placements) {
    if (quick.length > 0 && (exhausted(b) || quickStart - b.sims >= QUICK_SHARE * quickStart)) break;
    const v = finishValue(eng, b, state, me, step);
    if (v !== null) quick.push({ step, value: v + rnd() * 0.02, figure: { type: "noFigure" } });
  }
  quick.sort((a, b) => b.value - a.value);
  let best = quick[0] ?? null;
  const top = quick.slice(0, TOP_PLACEMENTS);
  for (const [i, cand] of top.entries()) {
    if (exhausted(b)) break;
    const placed = sim(eng, b, state, me, cand.step);
    if (!placed.ok) continue;
    // Pjäsvalen: själva pjäserna (placeFigure) först, sedan expansionernas egna alternativ.
    const figs = eng
      .legalSteps(placed.state)
      .filter(isFigureStep)
      .sort((x, y) => Number(y.type === "placeFigure") - Number(x.type === "placeFigure"));
    const given = Math.floor(b.sims / (top.length - i));
    const child: Budget = { sims: given, deadline: b.deadline };
    for (const fig of figs) {
      if (exhausted(child)) break;
      const v = finishValue(eng, child, placed.state, me, fig);
      if (v !== null && (!best || v + rnd() * 0.02 > best.value)) best = { step: cand.step, value: v + rnd() * 0.02, figure: fig };
    }
    settle(b, child, given);
  }
  return best;
}

/** Nästa delsteg för den aktiva spelaren. Kastar om det inte finns några tillåtna steg. */
export function chooseBotStep(eng: EngineApi, state: GameState, rnd: Rnd = Math.random): Step {
  // Spelaren som ska välja (turn.actor när en annan än den som har tur väljer).
  const me = actorOf(state);
  const budget = newBudget();
  const steps = eng.legalSteps(state);
  const confirm = steps.find((s) => s.type === "confirm");
  if (confirm) return confirm;
  if (steps.length === 0) throw new Error("inga tillåtna steg");
  // Planen från förra draget i samma tur (placering och pjäs räknades ut tillsammans): använd den om den fortfarande går.
  if (state.turn.pending.length === 0) plans.clear();
  const planned = plans.get(keyOf(state));
  if (planned && steps.some((s) => JSON.stringify(s) === JSON.stringify(planned))) return planned;

  const exchange = steps.filter((s) => s.type === "exchangeTile");
  if (exchange.length > 0) return exchange[Math.floor(rnd() * exchange.length)] as Step;

  const choose = steps.filter((s) => s.type === "chooseTile");
  if (choose.length > 0) {
    let best: { step: Step; value: number; after: GameState; plan: Plan } | null = null;
    // Varje olika bricka på handen får lika stor del av budgeten.
    const hand = state.players.find((p) => p.id === me)?.hand ?? [];
    const tiles = choose.flatMap((s) => (s.type === "chooseTile" && hand[s.handIndex] !== undefined ? [hand[s.handIndex]!] : []));
    const distinct = new Set(tiles).size;
    const seen = new Set<string>();
    for (const step of choose) {
      if (step.type !== "chooseTile") continue;
      const tile = hand[step.handIndex];
      if (tile === undefined || seen.has(tile)) continue;
      seen.add(tile);
      const r = sim(eng, budget, state, me, step);
      if (!r.ok) continue;
      const given = Math.floor(budget.sims / Math.max(1, distinct - seen.size + 1));
      const child: Budget = { sims: given, deadline: budget.deadline };
      const b = bestPlacement(eng, child, r.state, me, rnd);
      settle(budget, child, given);
      if (b && (!best || b.value > best.value)) best = { step, value: b.value, after: r.state, plan: b };
    }
    if (!best) return choose[0] as Step;
    rememberPlan(eng, best.after, me, [best.plan.step, best.plan.figure]);
    return best.step;
  }

  const placement = steps.some((s) => s.type === "placeTile") ? bestPlacement(eng, budget, state, me, rnd) : null;
  if (placement) {
    rememberPlan(eng, state, me, [placement.step, placement.figure], 1);
    return placement.step;
  }

  // Pjäsfasen (och expansionernas egna steg): provspela varje val.
  const options = steps.filter((s) => s.type !== "undo");
  // Val som ändrar för alla (Crop Circles II lägg till eller ta bort): provspelning ger ingen skillnad, så slumpa med lätt övervikt för att lägga till.
  const modes = options.filter((s) => s.type === "expansion" && s.action === "mode");
  if (modes.length > 0) return (rnd() < 0.7 ? modes[0] : modes[modes.length - 1]) as Step;
  let best: { step: Step; value: number } | null = null;
  for (const step of options) {
    if (best && exhausted(budget)) break;
    const v = finishValue(eng, budget, state, me, step);
    if (v !== null && (!best || v + rnd() * 0.02 > best.value)) best = { step, value: v + rnd() * 0.02 };
  }
  return best?.step ?? (options.find((s) => s.type === "noFigure") ?? (options[0] as Step));
}
