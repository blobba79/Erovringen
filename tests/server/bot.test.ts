// Botten (src/server/bot.ts) utan nätverk: går att spela färdigt, snabb nog och slår slumpspelaren.

import { describe, expect, test } from "bun:test";
import { realEngine, setupOf } from "../engine/helpers";
import { chooseStep, makeRng } from "../players/random-player";
import { chooseBotStep } from "../../src/server/bot";
import { actorOf } from "../../src/engine/index";
import type { GameState, Step } from "../../src/shared/state";
import type { ExpansionId } from "../../src/shared/tiles";

const eng = realEngine();

/** Spelar ett parti där udda spelare är bottar och resten slumpspelare. Returnerar slutläget och längsta betänketiden. */
function duel(seed: number, handSize: number, n: number, expansions: ExpansionId[] = ["base", "river", "abbot"]) {
  const setup = setupOf(expansions, { n, seed, handSize, variants: { "river.startTile": "shuffle" } });
  const rnd = makeRng(seed * 31 + 7);
  const botRnd = makeRng(seed * 17 + 3);
  let s: GameState = eng.newGame(setup);
  const isBot = (id: string) => Number(id.slice(1)) % 2 === 1;
  let slowest = 0;
  let guard = 0;
  while (!s.finished) {
    if (++guard > 20000) throw new Error("spelet tar aldrig slut");
    const me = actorOf(s);
    let step: Step;
    if (isBot(me)) {
      const t0 = performance.now();
      step = chooseBotStep(eng, s, botRnd);
      slowest = Math.max(slowest, performance.now() - t0);
    } else {
      step = chooseStep(eng.legalSteps(s), rnd, "random");
    }
    const r = eng.apply(s, me, step);
    if (!r.ok) throw new Error(`nekat steg ${JSON.stringify(step)}: ${r.error}`);
    s = r.state;
  }
  return { s, slowest };
}

describe("botstrategi", () => {
  test("slår slumpspelaren i de flesta av 20 partier (2 spelare) och är snabb", () => {
    let wins = 0;
    let slowest = 0;
    for (let i = 0; i < 20; i++) {
      const { s, slowest: sl } = duel(500 + i, i % 4 === 3 ? 3 : 1, 2);
      slowest = Math.max(slowest, sl);
      const [a, b] = s.players;
      if (a!.score > b!.score) wins++;
    }
    console.log(`bott vann ${wins}/20, längsta drag ${slowest.toFixed(0)} ms`);
    expect(wins).toBeGreaterThanOrEqual(14);
    expect(slowest).toBeLessThan(600);
  }, 600_000);

  test("med alla expansioner samtidigt: slår slumpspelaren och varje drag tar under ca en sekund", () => {
    const ALL: ExpansionId[] = [
      "base", "river", "abbot", "inns-cathedrals", "traders-builders", "gold-mines", "mage-witch",
      "princess-dragon", "ferries", "flying-machines", "crop-circles-2",
    ];
    let wins = 0;
    let slowest = 0;
    const GAMES = 4;
    for (let i = 0; i < GAMES; i++) {
      const { s, slowest: sl } = duel(700 + i, 1, 2, ALL);
      slowest = Math.max(slowest, sl);
      const [a, b] = s.players;
      if (a!.score > b!.score) wins++;
    }
    console.log(`alla expansioner: bott vann ${wins}/${GAMES}, längsta drag ${slowest.toFixed(0)} ms`);
    expect(wins).toBeGreaterThanOrEqual(GAMES - 1);
    // Förut kunde ett drag ta över 10 s med alla expansioner; nu begränsar budgeten det till runt en sekund.
    expect(slowest).toBeLessThan(2000);
  }, 1_800_000);
});
