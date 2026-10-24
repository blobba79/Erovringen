// Strategin för datorstyrda spelare. Ren logik utan nätverk: `chooseBotStep` väljer nästa delsteg
// åt spelaren vars tur det är. Servern anropar den en gång per delsteg.
//
// Idén: ett läge värderas som egna poäng plus en andel av värdet i de egna ofärdiga områdena,
// minus en andel av motståndarnas motsvarande värde och en liten avgift för pjäser som är utställda
// (så att inte alla går åt tidigt). Delsteg provspelas på en klon till och med bekräftelsen, så
// poängen brickan ger direkt räknas med.

import type { GameState, PlayerId, Step } from "../shared/state";
import type { EngineApi } from "../engine/index";
import { areaValue, majorityOwners, strength } from "../engine/index";

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

/** Provspelar ett delsteg och resten av turen (utan pjäs, sedan bekräfta). Null om steget inte går. */
function finishValue(eng: EngineApi, state: GameState, me: PlayerId, step: Step): number | null {
  let r = eng.apply(state, me, step);
  for (let guard = 0; guard < 6 && r.ok; guard++) {
    const s = r.state;
    if (s.finished || s.turn.player !== me) return evaluate(eng, s, me);
    const next = eng.legalSteps(s).find((x) => x.type === (s.turn.phase === "confirm" ? "confirm" : "noFigure"));
    if (!next) return null;
    r = eng.apply(s, me, next);
  }
  return r.ok ? evaluate(eng, r.state, me) : null;
}

const isFigureStep = (s: Step) => s.type !== "undo" && s.type !== "confirm" && s.type !== "noFigure";

function bestPlacement(eng: EngineApi, state: GameState, me: PlayerId, rnd: Rnd): { step: Step; value: number } | null {
  let placements = eng.legalSteps(state).filter((s) => s.type === "placeTile");
  if (placements.length === 0) return null;
  if (placements.length > MAX_QUICK) {
    // Platser som rör flest grannbrickor är oftast de som avslutar något; resten får slumpen avgöra.
    const touch = (s: Step) => {
      if (s.type !== "placeTile") return 0;
      let n = 0;
      for (const [dx, dy] of [[0, 1], [1, 0], [0, -1], [-1, 0]] as const) if (state.board[`${s.pos.x + dx},${s.pos.y + dy}`]) n++;
      return n + rnd() * 0.9;
    };
    placements = placements.map((s) => ({ s, k: touch(s) })).sort((a, b) => b.k - a.k).slice(0, MAX_QUICK).map((x) => x.s);
  }
  const quick: { step: Step; value: number }[] = [];
  for (const step of placements) {
    const v = finishValue(eng, state, me, step);
    if (v !== null) quick.push({ step, value: v + rnd() * 0.02 });
  }
  quick.sort((a, b) => b.value - a.value);
  let best = quick[0] ?? null;
  for (const cand of quick.slice(0, TOP_PLACEMENTS)) {
    const placed = eng.apply(state, me, cand.step);
    if (!placed.ok) continue;
    for (const fig of eng.legalSteps(placed.state).filter(isFigureStep)) {
      const v = finishValue(eng, placed.state, me, fig);
      if (v !== null && (!best || v + rnd() * 0.02 > best.value)) best = { step: cand.step, value: v + rnd() * 0.02 };
    }
  }
  return best;
}

/** Nästa delsteg för den aktiva spelaren. Kastar om det inte finns några tillåtna steg. */
export function chooseBotStep(eng: EngineApi, state: GameState, rnd: Rnd = Math.random): Step {
  const me = state.turn.player;
  const steps = eng.legalSteps(state);
  const confirm = steps.find((s) => s.type === "confirm");
  if (confirm) return confirm;
  if (steps.length === 0) throw new Error("inga tillåtna steg");

  const exchange = steps.filter((s) => s.type === "exchangeTile");
  if (exchange.length > 0) return exchange[Math.floor(rnd() * exchange.length)] as Step;

  const choose = steps.filter((s) => s.type === "chooseTile");
  if (choose.length > 0) {
    let best: { step: Step; value: number } | null = null;
    const seen = new Set<string>();
    for (const step of choose) {
      if (step.type !== "chooseTile") continue;
      const tile = state.players.find((p) => p.id === me)?.hand[step.handIndex];
      if (tile === undefined || seen.has(tile)) continue;
      seen.add(tile);
      const r = eng.apply(state, me, step);
      if (!r.ok) continue;
      const b = bestPlacement(eng, r.state, me, rnd);
      if (b && (!best || b.value > best.value)) best = { step, value: b.value };
    }
    return best?.step ?? (choose[0] as Step);
  }

  const placement = steps.some((s) => s.type === "placeTile") ? bestPlacement(eng, state, me, rnd) : null;
  if (placement) return placement.step;

  // Pjäsfasen (och expansionernas egna steg): provspela varje val.
  const options = steps.filter((s) => s.type !== "undo");
  let best: { step: Step; value: number } | null = null;
  for (const step of options) {
    const v = finishValue(eng, state, me, step);
    if (v !== null && (!best || v + rnd() * 0.02 > best.value)) best = { step, value: v + rnd() * 0.02 };
  }
  return best?.step ?? (options.find((s) => s.type === "noFigure") ?? (options[0] as Step));
}
