// Testspelare: många seedade partier med slumpmässiga tillåtna drag.
// Antalet kan ökas: GAMES=3000 npx bun test tests/players

import { describe, expect, test } from "bun:test";
import { realEngine, setupOf } from "../engine/helpers";
import { playGame, type Strategy } from "./random-player";
import type { ExpansionId } from "../../src/shared/tiles";

const eng = realEngine();
const GAMES = Number(process.env.GAMES ?? 300);

function setupFor(i: number) {
  const n = 2 + (i % 5); // 2-6 spelare
  const variant = i % 7 === 3 ? "afterRiver" : "shuffle";
  // Varannan omgång med alla färdiga expansioner.
  const expansions: ExpansionId[] = i % 2 ? ["base", "river", "abbot", "inns-cathedrals", "traders-builders", "gold-mines", "mage-witch", "flying-machines"] : ["base", "river", "abbot", "traders-builders", "gold-mines", "mage-witch", "flying-machines"];
  return setupOf(expansions, {
    n, seed: 1000 + i, handSize: i % 11 === 5 ? 3 : 1, variants: { "river.startTile": variant },
  });
}

describe("slumpspelare", () => {
  test(`${GAMES} partier med grundspel, flod, abbot och I&C går att spela färdigt`, () => {
    let totalTurns = 0;
    let withScore = 0;
    for (let i = 0; i < GAMES; i++) {
      const strategy: Strategy = i % 2 ? "eager" : "random";
      try {
        const r = playGame(eng, setupFor(i), { strategy });
        totalTurns += r.turns;
        if (r.state.players.some((p) => p.score > 0)) withScore++;
        expect(r.state.finished).toBe(true);
      } catch (e) {
        throw new Error(`parti ${i} (frö ${1000 + i}): ${(e as Error).message}`);
      }
    }
    expect(totalTurns).toBeGreaterThan(GAMES * 30);
    expect(withScore).toBe(GAMES);
  }, 3_600_000);

  test("grundspelet utan expansioner och med bara flod", () => {
    for (let i = 0; i < 20; i++) {
      playGame(eng, setupOf(["base"], { n: 3, seed: 50 + i }));
      playGame(eng, setupOf(["base", "river"], { n: 2, seed: 70 + i }));
    }
  }, 600_000);

  test("samma frö ger samma parti", () => {
    const a = playGame(eng, setupFor(4), { strategy: "random" });
    const b = playGame(eng, setupFor(4), { strategy: "random" });
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
    expect(a.events).toEqual(b.events);
  });

  test("flodbrickor ligger i en sammanhängande flod från källan", () => {
    for (let i = 0; i < 30; i++) {
      const r = playGame(eng, setupOf(["base", "river"], { n: 2, seed: 300 + i }), { checkUndo: false });
      const an = eng.analyze(r.state);
      const rivers = an.areas.filter((a) => a.kind === "river");
      // Allt vatten hänger ihop så länge floden inte kastats sönder.
      expect(rivers.length).toBeLessThanOrEqual(2);
    }
  }, 600_000);
});

describe("flodfasen", () => {
  test("deadEnds=forbid, handstorlek 3: ingen flodbricka kastas och inga vanliga brickor läggs före sjön", () => {
    for (let i = 0; i < 120; i++) {
      const s = setupOf(["base", "river"], {
        n: 2 + (i % 5), seed: 5000 + i, handSize: 3,
        variants: { "river.deadEnds": "forbid", "river.startTile": i % 3 === 0 ? "afterRiver" : "shuffle" },
      });
      try {
        const r = playGame(eng, s, { strategy: i % 2 ? "eager" : "random", checkUndo: false });
        const discarded = (r.state.ext.base as { discarded: string[] }).discarded;
        expect(discarded.filter((t) => t.startsWith("river/"))).toEqual([]);
        expect((r.state.ext.river as { done: boolean }).done).toBe(true);
      } catch (e) {
        throw new Error(`parti ${i} (frö ${5000 + i}): ${(e as Error).message}`);
      }
    }
  }, 600_000);

  test("deadEnds=allow, handstorlek 3: partierna går att spela färdigt", () => {
    for (let i = 0; i < 40; i++)
      playGame(eng, setupOf(["base", "river"], { n: 3, seed: 7000 + i, handSize: 3 }), { checkUndo: false });
  }, 600_000);
});