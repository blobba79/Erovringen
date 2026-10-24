import { describe, expect, test } from "bun:test";
import type { GameState, Step } from "../../../src/shared/state";
import { mageWitchModule } from "../../../src/expansions/mage-witch/index";
import { strength } from "../../../src/engine/scoring";
import { realEngine, setupOf } from "../../engine/helpers";
import { CONFIRM, NOFIG, inSupply, place$, play, reasons, scenario, score, type Rot } from "../../engine/scenario";
import { playGame, type Strategy } from "../../players/random-player";

const eng = realEngine();
const EXP = ["base", "inns-cathedrals", "mage-witch"] as const;
const sc = (o: Parameters<typeof scenario>[1]) => scenario(eng, { expansions: [...EXP], ...o });
const MW = (t: string) => `mage-witch/${t}`;
const IC = (t: string) => `inns-cathedrals/${t}`;
const M1 = "p1:meeple:0";

const mv = (figure: string, x: number, y: number, feature: string): Step => ({
  type: "expansion", expansion: "mage-witch", action: "move", data: { figure, pos: { x, y }, feature },
});
const rm = (figure: string): Step => ({
  type: "expansion", expansion: "mage-witch", action: "remove", data: { figure, choice: figure.split(":")[0] },
});
const mwSteps = (s: GameState) =>
  eng.legalSteps(s).flatMap((x) => (x.type === "expansion" ? [x as Extract<Step, { type: "expansion" }>] : []));
const data = (x: Step) => (x as Extract<Step, { type: "expansion" }>).data as { figure: string; pos: { x: number; y: number }; feature: string };
const fig = (s: GameState, id: string) => s.figures.find((f) => f.id === id)!;

describe("modulen", () => {
  test("8 brickor, två neutrala pjäser, neutrala pjäser räknas inte vid majoritet", () => {
    expect(mageWitchModule.tileSets[0]!.tiles.reduce((a, t) => a + t.count, 0)).toBe(8);
    const s = eng.newGame(setupOf([...EXP], { n: 3 }));
    const neutral = s.figures.filter((f) => f.kind === "mage" || f.kind === "witch");
    expect(neutral.map((f) => f.id).sort()).toEqual(["mage:0", "witch:0"]);
    for (const f of neutral) {
      expect(f.owner).toBeNull();
      expect(strength(f)).toBe(0);
    }
  });
});

describe("flytt vid magisymbol", () => {
  // LR (0,0) har en väg mot söder. Magibrickan CRRR.3 vänd 180 grader har vägar V, N, Ö och stad S.
  const board: [string, number, number, Rot][] = [["base/LR", 0, 0, 0]];
  const placeMage = (extra: Partial<Parameters<typeof sc>[0]> = {}) =>
    play(eng, sc({ board, hands: [[MW("CRRR.3")], []], ...extra }), place$(0, 1, 180));

  test("fasen kommer direkt efter brickan; bara magisteg och ångra erbjuds", () => {
    const r = placeMage();
    expect(r.state.turn.phase).toBe("mage-witch");
    const types = new Set(eng.legalSteps(r.state).map((x) => x.type));
    expect([...types].sort()).toEqual(["expansion", "undo"]);
    // Tre ofärdiga områden (stad, väg Ö, väg V; vägen uppåt är färdig) för vardera pjäsen.
    const steps = mwSteps(r.state);
    expect(steps.length).toBe(6);
    expect(steps.every((x) => x.action === "move")).toBe(true);
    expect(eng.apply(r.state, "p1", CONFIRM).ok).toBe(false);
    expect(eng.apply(r.state, "p1", { type: "noFigure" }).ok).toBe(false);
  });

  test("magikern flyttas till en stad; sedan kan en följare läggas som vanligt", () => {
    const r = placeMage();
    const r2 = play(eng, r.state, mv("mage:0", 0, 1, "city0"));
    expect(r2.state.turn.phase).toBe("placeFigure");
    expect(fig(r2.state, "mage:0").location).toEqual({ at: "feature", pos: { x: 0, y: 1 }, feature: "city0" });
    expect(r2.events.some((e) => e.type === "figurePlaced" && e.figure === "mage:0")).toBe(true);
    const r3 = play(eng, r2.state, NOFIG, CONFIRM);
    expect(r3.state.turn.phase).toBe("placeTile");
  });

  test("ångra tar tillbaka flytten", () => {
    const r = play(eng, placeMage().state, mv("mage:0", 0, 1, "city0"), { type: "undo" });
    expect(r.state.turn.phase).toBe("mage-witch");
    expect(fig(r.state, "mage:0").location.at).toBe("supply");
  });

  test("otillåtna mål nekas: färdigt område, samma som den andra, samma som pjäsen själv", () => {
    // Magikern står på stadsdelen på (0,1), häxan på vägen mot väster på (0,1).
    const s0 = sc({
      board, hands: [[MW("CRRR.3")], []],
      figures: [{ id: "mage:0", x: 0, y: 0, feature: "road0" }],
    });
    const r = play(eng, s0, place$(0, 1, 180));
    // Magikern står på vägen (0,0)+(0,1)N; den får inte stanna där, och häxan får inte gå dit.
    const steps = mwSteps(r.state);
    const targets = (f: string) => steps.filter((x) => data(x).figure === f).map((x) => `${data(x).pos.x},${data(x).pos.y}:${data(x).feature}`);
    expect(targets("mage:0").length).toBe(3);
    expect(targets("witch:0").length).toBe(3);
    const roadRef = steps.find((x) => data(x).figure === "mage:0")!;
    expect(roadRef).toBeDefined();
    // Det gemensamma vägområdet är inte ett mål för någon av dem.
    const bad = mv("witch:0", 0, 0, "road0");
    expect(eng.apply(r.state, "p1", bad).ok).toBe(false);
    expect(eng.apply(r.state, "p1", mv("mage:0", 0, 0, "road0")).ok).toBe(false);
    // Häxan till stadsdelen går bra; sedan får magikern inte följa efter dit (fasen är slut).
    const r2 = play(eng, r.state, mv("witch:0", 0, 1, "city0"));
    expect(fig(r2.state, "witch:0").location.at).toBe("feature");
    expect(eng.apply(r2.state, "p1", mv("mage:0", 0, 1, "city0")).ok).toBe(false);
  });

  test("häxan får inte flyttas till magikerns område", () => {
    const s0 = sc({
      board, hands: [[MW("CRRR.3")], []],
      figures: [{ id: "mage:0", x: 0, y: 0, feature: "road0" }, { id: "witch:0", x: 5, y: 5, feature: "road0" }],
    });
    s0.board["5,5"] = { type: "base/RFr", pos: { x: 5, y: 5 }, rotation: 90 };
    const r = play(eng, s0, place$(0, 1, 180));
    for (const x of mwSteps(r.state)) {
      const d = data(x);
      // Varken magikerns väg eller häxans väg är ett mål för den som redan står där / den andras.
      expect(!(d.pos.x === 5 && d.pos.y === 5 && d.figure === "witch:0")).toBe(true);
      expect(!(d.pos.y === 0 && d.pos.x === 0)).toBe(true);
    }
    // Häxan kan lämna (5,5) för vilket annat mål som helst, magikern kan gå till (5,5)? Nej: häxan står där.
    expect(mwSteps(r.state).some((x) => data(x).figure === "mage:0" && data(x).pos.x === 5)).toBe(false);
  });

  test("ingen pjäs på kartan och inget mål: ingen fas", () => {
    // CFC mellan två stadsändar stänger båda sina städer; inga ofärdiga områden finns.
    const s = sc({
      board: [["base/C", 0, -1, 180], ["base/C", 0, 1, 0]],
      hands: [[MW("CFC")], []],
    });
    const r = play(eng, s, place$(0, 0, 0));
    expect(r.state.turn.phase).toBe("placeFigure");
  });

  test("ingen mål men en pjäs på kartan: den måste tas bort (valfri av dem)", () => {
    const s = sc({
      board: [["base/C", 0, -1, 180], ["base/C", 0, 1, 0], ["base/RFr", 10, 10, 90]],
      hands: [[MW("CFC")], []],
      figures: [{ id: "mage:0", x: 10, y: 10, feature: "road0" }],
    });
    const r = play(eng, s, place$(0, 0, 0));
    expect(r.state.turn.phase).toBe("mage-witch");
    const steps = mwSteps(r.state);
    expect(steps.map((x) => x.action)).toEqual(["remove"]);
    expect(data(steps[0]!).figure).toBe("mage:0");
    const r2 = play(eng, r.state, rm("mage:0"));
    expect(inSupply(r2.state, "mage:0")).toBe(true);
    expect(r2.state.turn.phase).toBe("placeFigure");
  });
});

describe("sammanslagning", () => {
  // Två öppna vägar med var sin pjäs binds ihop av en vanlig bricka.
  const rfr = (x: number, y: number): [string, number, number, Rot] => ["base/RFr", x, y, 90];
  const base: [string, number, number, Rot][] = [rfr(0, 0), rfr(0, 2)];
  const figures = [{ id: "mage:0", x: 0, y: 0, feature: "road0" }, { id: "witch:0", x: 0, y: 2, feature: "road0" }];

  test("magiker och häxa i samma område efter en vanlig bricka: en av dem måste flyttas", () => {
    const s = sc({ board: [...base, rfr(10, 10)], figures, hands: [["base/RFr"], []] });
    const r = play(eng, s, place$(0, 1, 90));
    expect(r.state.turn.phase).toBe("mage-witch");
    const steps = mwSteps(r.state);
    // Bara den andra vägen (10,10) är ett mål, för vardera pjäsen.
    expect(steps.map((x) => `${data(x).figure}>${data(x).pos.x},${data(x).pos.y}`).sort()).toEqual(["mage:0>10,10", "witch:0>10,10"]);
    const r2 = play(eng, r.state, mv("witch:0", 10, 10, "road0"));
    expect(fig(r2.state, "mage:0").location).toMatchObject({ at: "feature", pos: { x: 0, y: 0 } });
    expect(r2.state.turn.phase).toBe("placeFigure");
  });

  test("inget mål: en av dem tas bort", () => {
    const s = sc({ board: base, figures, hands: [["base/RFr"], []] });
    const r = play(eng, s, place$(0, 1, 90));
    expect(r.state.turn.phase).toBe("mage-witch");
    expect(mwSteps(r.state).map((x) => data(x).figure).sort()).toEqual(["mage:0", "witch:0"]);
    const r2 = play(eng, r.state, rm("witch:0"));
    expect(inSupply(r2.state, "witch:0")).toBe(true);
    expect(inSupply(r2.state, "mage:0")).toBe(false);
  });

  test("områden som slås ihop utan att få båda pjäserna ger ingen fas", () => {
    const s = sc({ board: base, figures: [figures[0]!], hands: [["base/RFr"], []] });
    const r = play(eng, s, place$(0, 1, 90));
    expect(r.state.turn.phase).toBe("placeFigure");
  });
});

describe("poäng", () => {
  // Väg med tre brickor: LR (0,0), mitt (0,1), LR (0,2). Sista brickan läggs av p1, som har en följare där.
  const road = (mid: string): [string, number, number, Rot][] => [["base/LR", 0, 0, 0], [mid, 0, 1, 90]];
  const roadFigs = (extra: string[]) => [
    { id: M1, x: 0, y: 0, feature: "road0" },
    ...extra.map((id) => ({ id, x: 0, y: 1, feature: "road0" })),
  ];
  const close = (mid: string, extra: string[]) =>
    play(eng, sc({ board: road(mid), hands: [["base/LR"], []], figures: roadFigs(extra) }), place$(0, 2, 180), NOFIG, CONFIRM);

  test("utan magiker eller häxa: 3 för en väg med 3 brickor", () => {
    expect(reasons(close("base/RFr", []).events)).toEqual(["p1:road:3"]);
  });
  test("magikern ger +1 per bricka, och går hem efteråt", () => {
    const r = close("base/RFr", ["mage:0"]);
    expect(reasons(r.events)).toEqual(["p1:road:6"]);
    expect(inSupply(r.state, "mage:0")).toBe(true);
    expect(r.events.some((e) => e.type === "figureReturned" && e.figure === "mage:0")).toBe(true);
  });
  test("häxan halverar uppåt: 3 blir 2, och går hem", () => {
    const r = close("base/RFr", ["witch:0"]);
    expect(reasons(r.events)).toEqual(["p1:road:2"]);
    expect(inSupply(r.state, "witch:0")).toBe(true);
  });
  test("värdshus + magiker: 6 + 3 = 9", () => {
    expect(reasons(close(IC("RFr.i"), ["mage:0"]).events)).toEqual(["p1:road:9"]);
  });
  test("värdshus + häxa: 6 halveras till 3", () => {
    expect(reasons(close(IC("RFr.i"), ["witch:0"]).events)).toEqual(["p1:road:3"]);
  });

  const ring: [string, number, number, Rot][] = [
    [IC("Cccc.c"), 0, 0, 0], ["base/C", 0, -1, 180], ["base/C", 1, 0, 270], ["base/C", -1, 0, 90],
  ];
  const city = (extra: string) =>
    play(
      eng,
      sc({ board: ring, hands: [["base/C"], []], figures: [{ id: M1, x: 0, y: 0, feature: "city0" }, { id: extra, x: 0, y: 0, feature: "city0" }] }),
      place$(0, 1, 0), NOFIG, CONFIRM,
    );
  test("katedral + magiker: 15 + 5 = 20", () => {
    expect(reasons(city("mage:0").events)).toEqual(["p1:city:20"]);
  });
  test("katedral + häxa: 15 halveras till 8", () => {
    expect(reasons(city("witch:0").events)).toEqual(["p1:city:8"]);
  });
  test("magikern ger poäng till majoriteten, inte till sig själv: ensam magiker ger inget", () => {
    const s = sc({ board: road("base/RFr"), hands: [["base/LR"], []], figures: [{ id: "mage:0", x: 0, y: 1, feature: "road0" }] });
    const r = play(eng, s, place$(0, 2, 180), NOFIG, CONFIRM);
    expect(reasons(r.events)).toEqual([]);
    expect(inSupply(r.state, "mage:0")).toBe(true);
  });
  test("magikern hindrar inte annan majoritet: p2 ensam med en följare får bonusen", () => {
    const s = sc({
      board: road("base/RFr"), hands: [["base/LR"], []],
      figures: [{ id: "p2:meeple:0", x: 0, y: 0, feature: "road0" }, { id: "mage:0", x: 0, y: 1, feature: "road0" }],
    });
    const r = play(eng, s, place$(0, 2, 180), NOFIG, CONFIRM);
    expect(reasons(r.events)).toEqual(["p2:road:6"]);
  });
});

describe("ofärdiga områden vid slutet", () => {
  const open = (n: number, mid = "base/RFr"): [string, number, number, Rot][] =>
    Array.from({ length: n }, (_, i) => [i === 0 ? mid : "base/RFr", 0, i, 90] as [string, number, number, Rot]);
  const end = (board: [string, number, number, Rot][], extra: string[]) =>
    play(
      eng,
      sc({
        board, hands: [["base/L"], []], pile: [],
        figures: [{ id: M1, x: 0, y: 0, feature: "road0" }, ...extra.map((id) => ({ id, x: 0, y: 0, feature: "road0" }))],
      }),
      place$(1, 0, 0), NOFIG, CONFIRM,
    );
  test("öppen väg med 3 brickor utan pjäs: 3", () => {
    const r = end(open(3), []);
    expect(r.state.finished).toBe(true);
    expect(reasons(r.events)).toEqual(["p1:final.road:3"]);
  });
  test("med magiker: 3 + 3", () => {
    expect(reasons(end(open(3), ["mage:0"]).events)).toEqual(["p1:final.road:6"]);
  });
  test("med häxa: 3 halveras till 2", () => {
    expect(reasons(end(open(3), ["witch:0"]).events)).toEqual(["p1:final.road:2"]);
  });
  test("ofärdig väg med värdshus och magiker: 0 + 1 per bricka", () => {
    expect(reasons(end(open(3, IC("RFr.i")), ["mage:0"]).events)).toEqual(["p1:final.road:3"]);
  });
  test("ofärdig väg med värdshus och häxa: 0", () => {
    expect(reasons(end(open(3, IC("RFr.i")), ["witch:0"]).events)).toEqual([]);
  });
  test("ofärdig stad med katedral och magiker: 1 per bricka, sköldar räknas inte", () => {
    const s = sc({
      board: [[IC("Cccc.c"), 0, 0, 0], ["base/C", 0, -1, 180]], hands: [["base/C"], []], pile: [],
      figures: [{ id: M1, x: 0, y: 0, feature: "city0" }, { id: "mage:0", x: 0, y: 0, feature: "city0" }],
    });
    const r = play(eng, s, place$(1, 0, 270), NOFIG, CONFIRM);
    // 3 brickor: Cccc.c, två lock. Katedralen ger 0 vid slutet, magikern +3.
    expect(reasons(r.events)).toEqual(["p1:final.city:3"]);
    expect(score(r.state, "p1")).toBe(3);
  });
});

describe("slumpspel", () => {
  const GAMES = Number(process.env.MW_GAMES ?? 60);
  const all = ["base", "river", "abbot", "inns-cathedrals", "traders-builders", "mage-witch"] as const;
  for (const exps of [["base", "mage-witch"], all] as const) {
    test(`${GAMES} partier med ${exps.join("+")}, handstorlek 1 och 3`, () => {
      let moves = 0;
      for (let i = 0; i < GAMES; i++) {
        const setup = setupOf([...exps], { n: 2 + (i % 5), seed: 7000 + i, handSize: i % 2 ? 3 : 1 });
        const strategy: Strategy = i % 3 ? "eager" : "random";
        try {
          const r = playGame(eng, setup, { strategy });
          expect(r.state.finished).toBe(true);
          moves += r.events.filter((e) => e.type === "figurePlaced" && (e.figure === "mage:0" || e.figure === "witch:0")).length;
        } catch (e) {
          throw new Error(`parti ${i} (${exps.join("+")}): ${(e as Error).message}`);
        }
      }
      expect(moves).toBeGreaterThan(0);
    }, 600_000);
  }
});
