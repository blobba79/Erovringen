import { describe, expect, test } from "bun:test";
import type { GameState, Step } from "../../../src/shared/state";
import type { ExpansionId } from "../../../src/shared/tiles";
import { DIE, flyingMachinesModule, type DiceEventData } from "../../../src/expansions/flying-machines/index";
import { randomInt } from "../../../src/engine/rng";
import { realEngine, setupOf } from "../../engine/helpers";
import { CONFIRM, NOFIG, place$, play, scenario, type Rot } from "../../engine/scenario";
import { playGame } from "../../players/random-player";

const eng = realEngine();
const EXP = ["base", "flying-machines"] as const;
const FM = (t: string) => `flying-machines/${t}`;
type Ex = Extract<Step, { type: "expansion" }>;

const sc = (board: [string, number, number, Rot][], hand: string, extra: Partial<Parameters<typeof scenario>[1]> = {}) =>
  scenario(eng, { expansions: [...EXP], board, hands: [[hand], []], ...extra });

/** Sätt slumpfröet så att nästa tärningsslag blir `roll`. */
function withRoll(s: GameState, roll: number): GameState {
  for (let seed = 0; seed < 1000; seed++) {
    if (DIE[randomInt({ rng: seed }, DIE.length)] === roll) {
      s.rng = seed;
      return s;
    }
  }
  throw new Error("hittade inget frö");
}

const fly = (choice = "meeple"): Step => ({ type: "expansion", expansion: "flying-machines", action: "fly", data: { choice } });
const land = (x: number, y: number, feature: string): Step => ({
  type: "expansion", expansion: "flying-machines", action: "land", data: { pos: { x, y }, feature },
});
const exSteps = (s: GameState) => eng.legalSteps(s).filter((x): x is Ex => x.type === "expansion");
const dice = (events: { type: string }[]) =>
  events.flatMap((e) => (e as { type: string; event?: string; data?: unknown }).event === "dice" ? [(e as unknown as { data: DiceEventData }).data] : []);

describe("modulen", () => {
  test("8 brickor och inga egna pjäser", () => {
    expect(flyingMachinesModule.tileSets[0]!.tiles.reduce((a, t) => a + t.count, 0)).toBe(8);
    expect(flyingMachinesModule.figures).toEqual([]);
  });

  test("tärningen har sidorna 1, 1, 2, 2, 3, 3", () => {
    expect([...DIE]).toEqual([1, 1, 2, 2, 3, 3]);
  });
});

describe("flygning", () => {
  // F.o har flygmaskin mot väster. Klosterbrickor (L) på (0,0) och (-1,0).
  const row: [string, number, number, Rot][] = [["base/L", -1, 0, 0], ["base/L", 0, 0, 0]];

  test("flygalternativ erbjuds bara på en bricka med flygmaskin", () => {
    const a = play(eng, sc(row, "base/L", {}), place$(1, 0, 0));
    expect(exSteps(a.state)).toEqual([]);
    const b = play(eng, sc(row, FM("F.o")), place$(1, 0, 0));
    expect(exSteps(b.state).map((x) => x.action)).toEqual(["fly"]);
    expect((exSteps(b.state)[0]!.data as { choice: string }).choice).toBe("meeple");
    // Man kan fortfarande välja att inte flyga.
    expect(eng.legalSteps(b.state).some((x) => x.type === "noFigure")).toBe(true);
  });

  test("tärning 1: en ruta i maskinens riktning, landar på klostret", () => {
    const r = play(eng, withRoll(sc(row, FM("F.o")), 1), place$(1, 0, 0), fly());
    expect(r.state.turn.phase).toBe("flying-machines");
    expect(dice(r.events)).toEqual([
      { player: "p1", roll: 1, from: { x: 1, y: 0 }, to: { x: 0, y: 0 }, direction: "W", kind: "meeple", options: 1 },
    ]);
    // Bara själva landningssteget (och ångra) erbjuds.
    expect(new Set(eng.legalSteps(r.state).map((x) => x.type))).toEqual(new Set(["expansion", "undo"]));
    expect(exSteps(r.state).map((x) => x.action)).toEqual(["land"]);
    const r2 = play(eng, r.state, land(0, 0, "cloister"));
    const m = r2.state.figures.find((f) => f.id === "p1:meeple:0")!;
    expect(m.location).toEqual({ at: "feature", pos: { x: 0, y: 0 }, feature: "cloister" });
    expect(r2.state.turn.phase).toBe("confirm");
    expect(r2.events.some((e) => e.type === "figurePlaced" && e.figure === "p1:meeple:0")).toBe(true);
    expect(play(eng, r2.state, CONFIRM).state.turn.phase).toBe("placeTile");
  });

  test("tärning 2: två rutor", () => {
    const r = play(eng, withRoll(sc(row, FM("F.o")), 2), place$(1, 0, 0), fly());
    expect(dice(r.events)[0]).toMatchObject({ roll: 2, to: { x: -1, y: 0 } });
    expect(exSteps(r.state).map((x) => x.data)).toEqual([{ pos: { x: -1, y: 0 }, feature: "cloister" }]);
  });

  test("tärning 3 på en tom ruta: följaren går hem och inga fler följare den turen", () => {
    const r = play(eng, withRoll(sc(row, FM("F.o")), 3), place$(1, 0, 0), fly());
    expect(dice(r.events)[0]).toMatchObject({ roll: 3, to: { x: -2, y: 0 }, options: 0 });
    expect(r.state.turn.phase).toBe("confirm");
    expect(eng.legalSteps(r.state).map((x) => x.type).sort()).toEqual(["confirm", "undo"]);
    expect(r.state.figures.filter((f) => f.owner === "p1").every((f) => f.location.at === "supply")).toBe(true);
    expect(play(eng, r.state, CONFIRM).state.turn.phase).toBe("placeTile");
  });

  test("flygriktningen vrids med brickan", () => {
    // F.o vänd 90 grader flyger norrut: från (0,1) till (0,0).
    const r1 = play(eng, withRoll(sc(row, FM("F.o")), 1), place$(0, 1, 90), fly());
    expect(dice(r1.events)[0]).toMatchObject({ direction: "N", to: { x: 0, y: 0 } });
    // 180 grader: österut, från (0,... ) till höger om klostret.
    const r2 = play(eng, withRoll(sc([["base/L", 0, 0, 0], ["base/L", 1, 0, 0]], FM("F.o")), 2), place$(-1, 0, 180), fly());
    expect(dice(r2.events)[0]).toMatchObject({ direction: "E", to: { x: 1, y: 0 } });
    // 270 grader: söderut.
    const r3 = play(eng, withRoll(sc([["base/L", 0, 1, 0]], FM("F.o")), 1), place$(0, 0, 270), fly());
    expect(dice(r3.events)[0]).toMatchObject({ direction: "S", to: { x: 0, y: 1 } });
  });

  test("diagonal flygning (F.d, nordväst)", () => {
    // F.d på (1,1) flyger mot nordväst: tärning 1 landar på (0,0) (klostret, diagonalt grannen).
    const s = sc([["base/L", 1, 0, 0], ["base/L", 0, 0, 0]], FM("F.d"));
    const r = play(eng, withRoll(s, 1), place$(1, 1, 0), fly());
    expect(dice(r.events)[0]).toMatchObject({ direction: "NW", to: { x: 0, y: 0 } });
    expect(exSteps(r.state).length).toBe(1);
    // Vänd 90 grader pekar den mot nordost: (1,1) -> (2,0).
    const r2 = play(eng, withRoll(sc([["base/L", 1, 0, 0], ["base/L", 2, 0, 0]], FM("F.d")), 1), place$(1, 1, 90), fly());
    expect(dice(r2.events)[0]).toMatchObject({ direction: "NE", to: { x: 2, y: 0 } });
  });
});

describe("landning", () => {
  test("väg och kloster på samma ruta: spelaren väljer; fält är aldrig tillåtet", () => {
    // LR: kloster och väg mot söder (ofärdig). Fältet finns men erbjuds inte.
    const r = play(eng, withRoll(sc([["base/LR", 0, 0, 0]], FM("F.o")), 1), place$(1, 0, 0), fly());
    expect(exSteps(r.state).map((x) => (x.data as { feature: string }).feature).sort()).toEqual(["cloister", "road0"]);
    expect(dice(r.events)[0]!.options).toBe(2);
    // Ett fält nekas.
    expect(eng.apply(r.state, "p1", land(0, 0, "field0")).ok).toBe(false);
    // Fel ruta nekas.
    expect(eng.apply(r.state, "p1", land(5, 5, "cloister")).ok).toBe(false);
    const r2 = play(eng, r.state, land(0, 0, "road0"));
    expect(r2.state.figures.find((f) => f.id === "p1:meeple:0")!.location).toEqual({ at: "feature", pos: { x: 0, y: 0 }, feature: "road0" });
  });

  test("färdigt område är förbjudet, ofärdigt på samma ruta tillåtet", () => {
    // Två klosterbrickor med väg mot varandra: vägen (0,0)-(0,1) är färdig, klostren inte.
    const board: [string, number, number, Rot][] = [["base/LR", 0, 0, 0], ["base/LR", 0, 1, 180]];
    const r = play(eng, withRoll(sc(board, FM("F.o")), 1), place$(1, 0, 0), fly());
    expect(exSteps(r.state).map((x) => (x.data as { feature: string }).feature)).toEqual(["cloister"]);
    expect(eng.apply(r.state, "p1", land(0, 0, "road0")).ok).toBe(false);
  });

  test("ett område som brickan just gjorde färdigt är färdigt", () => {
    // Vägen går mellan två klosterbrickor; RFr.WE.o sluter den och flyger västerut över den.
    const board: [string, number, number, Rot][] = [["base/LR", -1, 1, 270], ["base/LR", 1, 1, 90]];
    const r = play(eng, withRoll(sc(board, FM("RFr.WE.o")), 1), place$(0, 1, 0), fly());
    expect(dice(r.events)[0]).toMatchObject({ direction: "W", to: { x: -1, y: 1 }, options: 1 });
    expect(exSteps(r.state).map((x) => (x.data as { feature: string }).feature)).toEqual(["cloister"]);
    expect(eng.apply(r.state, "p1", land(-1, 1, "road0")).ok).toBe(false);
  });

  test("bara fält på landningsrutan: följaren går hem", () => {
    const r = play(eng, withRoll(sc([[FM("F.d"), 0, 0, 0]], FM("F.o")), 1), place$(1, 0, 0), fly());
    expect(dice(r.events)[0]).toMatchObject({ to: { x: 0, y: 0 }, options: 0 });
    expect(r.state.turn.phase).toBe("confirm");
    expect(r.state.figures.find((f) => f.id === "p1:meeple:0")!.location.at).toBe("supply");
  });

  test("upptaget område är tillåtet, även med andra spelares följare", () => {
    const board: [string, number, number, Rot][] = [["base/L", 0, 0, 0]];
    const s = withRoll(sc(board, FM("F.o"), { figures: [{ id: "p2:meeple:0", x: 0, y: 0, feature: "cloister" }] }), 1);
    const r = play(eng, s, place$(1, 0, 0), fly());
    expect(exSteps(r.state).length).toBe(1);
    const r2 = play(eng, r.state, land(0, 0, "cloister"));
    const here = r2.state.figures.filter((f) => f.location.at === "feature" && f.location.pos.x === 0);
    expect(here.map((f) => f.owner).sort()).toEqual(["p1", "p2"]);
    // Egen följare på samma kloster är också tillåten.
    const s2 = withRoll(sc(board, FM("F.o"), { figures: [{ id: "p1:meeple:1", x: 0, y: 0, feature: "cloister" }] }), 1);
    const r3 = play(eng, s2, place$(1, 0, 0), fly(), land(0, 0, "cloister"));
    expect(r3.state.figures.filter((f) => f.owner === "p1" && f.location.at === "feature").length).toBe(2);
  });

  test("stor följare kan flyga (I&C)", () => {
    const s = withRoll(sc([["base/L", 0, 0, 0]], FM("F.o"), { expansions: ["base", "inns-cathedrals", "flying-machines"] }), 1);
    const r = play(eng, s, place$(1, 0, 0));
    const choices = exSteps(r.state).map((x) => (x.data as { choice: string }).choice).sort();
    expect(choices).toEqual(["large-meeple", "meeple"]);
    const r2 = play(eng, r.state, fly("large-meeple"), land(0, 0, "cloister"));
    expect(r2.state.figures.find((f) => f.id === "p1:large-meeple:0")!.location.at).toBe("feature");
  });

  test("abboten flyger inte, och slut på följare ger inget flygsteg", () => {
    const s = sc([["base/L", 0, 0, 0]], FM("F.o"), { expansions: ["base", "abbot", "flying-machines"] });
    const r = play(eng, s, place$(1, 0, 0));
    expect(exSteps(r.state).map((x) => (x.data as { choice: string }).choice)).toEqual(["meeple"]);
    const empty = sc([["base/L", 0, 0, 0]], FM("F.o"));
    for (const f of empty.figures) if (f.owner === "p1") f.location = { at: "feature", pos: { x: 0, y: 0 }, feature: "cloister" };
    expect(exSteps(play(eng, empty, place$(1, 0, 0)).state)).toEqual([]);
  });

  test("otillåtna steg nekas", () => {
    const s = sc([["base/L", 0, 0, 0]], "base/L");
    const r = play(eng, s, place$(1, 0, 0));
    expect(eng.apply(r.state, "p1", fly()).ok).toBe(false);
    const f = play(eng, sc([["base/L", 0, 0, 0]], FM("F.o")), place$(1, 0, 0));
    expect(eng.apply(f.state, "p1", fly("abbot")).ok).toBe(false);
    expect(eng.apply(f.state, "p1", land(0, 0, "cloister")).ok).toBe(false);
  });
});

describe("ångra och omspelning", () => {
  test("ångra tar tillbaka flygningen och samma tärning slås om", () => {
    const base = withRoll(sc([["base/L", -1, 0, 0], ["base/L", 0, 0, 0]], FM("F.o")), 2);
    const a = play(eng, base, place$(1, 0, 0), fly());
    const u = play(eng, a.state, { type: "undo" });
    expect(u.state.turn.phase).toBe("placeFigure");
    const b = play(eng, u.state, fly());
    expect(dice(b.events)).toEqual(dice(a.events));
    expect(b.state).toEqual(a.state);
    const again = play(eng, base, place$(1, 0, 0), fly());
    expect(dice(again.events)).toEqual(dice(a.events));
  });

  test("bekräftad tur innehåller tärningshändelsen, och samma frö ger samma tärning", () => {
    const run = () => {
      const r = play(eng, withRoll(sc([["base/L", 0, 0, 0]], FM("F.o")), 1), place$(1, 0, 0), fly(), land(0, 0, "cloister"));
      return play(eng, r.state, CONFIRM);
    };
    const a = run();
    const b = run();
    // Bekräftelsen spelar om turen och skickar om händelserna i en följd.
    expect(dice(a.events).length).toBe(1);
    expect(dice(a.events)).toEqual(dice(b.events));
    expect(a.state).toEqual(b.state);
  });
});

describe("slumpspel", () => {
  const gameSetup = (expansions: ExpansionId[], i: number, handSize: number) =>
    setupOf(expansions, { n: 2 + (i % 4), seed: 9000 + i, handSize, variants: { "river.startTile": "shuffle" } });

  const ALL: ExpansionId[] = ["base", "river", "abbot", "inns-cathedrals", "traders-builders", "gold-mines", "mage-witch", "flying-machines"];

  for (const handSize of [1, 3]) {
    test(`Flying Machines ensam, handstorlek ${handSize}`, () => {
      let flights = 0;
      let landings = 0;
      for (let i = 0; i < 40; i++) {
        try {
          const r = playGame(eng, gameSetup(["base", "flying-machines"], i, handSize), { strategy: i % 2 ? "eager" : "random" });
          expect(r.state.finished).toBe(true);
          const d = dice(r.events);
          flights += d.length;
          landings += d.filter((x) => x.options > 0).length;
          for (const x of d) expect([1, 2, 3]).toContain(x.roll);
        } catch (e) {
          throw new Error(`parti ${i}: ${(e as Error).message}`);
        }
      }
      expect(flights).toBeGreaterThan(10);
      expect(landings).toBeGreaterThan(0);
    }, 600_000);

    test(`alla färdiga expansioner, handstorlek ${handSize}`, () => {
      for (let i = 0; i < 20; i++) {
        try {
          const r = playGame(eng, gameSetup(ALL, i, handSize), { strategy: i % 2 ? "eager" : "random" });
          expect(r.state.finished).toBe(true);
        } catch (e) {
          throw new Error(`parti ${i}: ${(e as Error).message}`);
        }
      }
    }, 600_000);
  }

  test("samma frö ger samma parti med samma tärningar", () => {
    const a = playGame(eng, gameSetup(["base", "flying-machines"], 3, 1), { strategy: "random" });
    const b = playGame(eng, gameSetup(["base", "flying-machines"], 3, 1), { strategy: "random" });
    expect(JSON.stringify(a.state)).toBe(JSON.stringify(b.state));
    expect(dice(a.events)).toEqual(dice(b.events));
    expect(dice(a.events).length).toBeGreaterThan(0);
  });
});
