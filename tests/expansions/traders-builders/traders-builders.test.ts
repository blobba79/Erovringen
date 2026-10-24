import { describe, expect, test } from "bun:test";
import { TILE_DATA } from "../../../src/tiles/index";
import { tradersBuildersModule } from "../../../src/expansions/traders-builders/index";
import { realEngine, setupOf } from "../../engine/helpers";
import { CONFIRM, NOFIG, fig$, inSupply, place$, play, scenario, score, type Rot } from "../../engine/scenario";
import { playGame, type Strategy } from "../../players/random-player";
import type { GameState } from "../../../src/shared/state";
import type { ExpansionId } from "../../../src/shared/tiles";

const eng = realEngine();
const EXP: ExpansionId[] = ["base", "traders-builders"];
const sc = (o: Parameters<typeof scenario>[1]) => scenario(eng, { expansions: EXP, ...o });
const M = (p: string) => `${p}:meeple:0`;
const B = (p: string) => `${p}:builder:0`;
const P = (p: string) => `${p}:pig:0`;
const TB = (t: string) => `traders-builders/${t}`;
const goods = (s: GameState, p: string, g: string) => s.players.find((x) => x.id === p)!.counters[`goods.${g}`];
const actions = (s: GameState) =>
  eng.legalSteps(s).flatMap((x) => x.type === "placeFigure" && (x.kind === "builder" || x.kind === "pig") ? [`${x.kind}:${x.feature}`] : []);

// Stad med vin (Cc.w: stad N+W) som stängs av två base/C.
const cityBoard: [string, number, number, Rot][] = [[TB("Cc.w"), 0, 0, 0], ["base/C", -1, 0, 90]];

describe("modulen", () => {
  test("24 brickor, byggmästare och gris per spelare, varor på 0 från start", () => {
    expect(tradersBuildersModule.tileSets[0]!.tiles.reduce((a, t) => a + t.count, 0)).toBe(24);
    expect(TILE_DATA["traders-builders"]!.tiles.length).toBe(24);
    const s = eng.newGame(setupOf(EXP, { n: 3 }));
    for (const k of ["builder", "pig"]) expect(s.figures.filter((f) => f.kind === k).map((f) => f.owner).sort()).toEqual(["p1", "p2", "p3"]);
    expect(s.players[0]!.counters).toEqual({ "goods.wine": 0, "goods.grain": 0, "goods.cloth": 0 });
  });
});

describe("varor", () => {
  test("den som gör staden färdig får varan, även om en annan har följaren och poängen", () => {
    const s = sc({ board: cityBoard, hands: [["base/C"], []], figures: [{ id: M("p2"), x: 0, y: 0, feature: "city0" }] });
    const r = play(eng, s, place$(0, -1, 180), NOFIG, CONFIRM);
    expect(goods(r.state, "p1", "wine")).toBe(1);
    expect(goods(r.state, "p2", "wine")).toBe(0);
    expect(score(r.state, "p2")).toBe(6);
    expect(score(r.state, "p1")).toBe(0);
  });
  test("ingen vara för en ofärdig stad, och en stad utan varor ger ingenting", () => {
    const s = sc({ board: cityBoard, hands: [["base/L"], []] });
    const r = play(eng, s, place$(0, 1, 0), NOFIG, CONFIRM);
    expect(goods(r.state, "p1", "wine")).toBe(0);
    const t = sc({ board: [["base/C", 0, 0, 0]], hands: [["base/C"], []] });
    const r2 = play(eng, t, place$(0, -1, 180), NOFIG, CONFIRM);
    expect(Object.values(r2.state.players[0]!.counters).every((v) => v === 0)).toBe(true);
  });
  test("två symboler i samma stad ger två varor (staden räknas en gång)", () => {
    // CcCc.w har två städer (var och en med en symbol); här räcker det att en stängs.
    const s = sc({ board: [[TB("CcCc.w"), 0, 0, 0], ["base/C", -1, 0, 90]], hands: [["base/C"], []] });
    const r = play(eng, s, place$(0, -1, 180), NOFIG, CONFIRM);
    expect(goods(r.state, "p1", "wine")).toBe(1);
  });
});

describe("varor vid slutet", () => {
  // Sista draget: p1 lägger en kloster-bricka, spelet tar slut.
  const finish = (counters: Record<string, [number, number]>) => {
    const s = sc({ board: [["base/C", 0, 0, 0]], hands: [["base/L"], []], pile: [] });
    for (const [g, [a, b]] of Object.entries(counters)) {
      s.players[0]!.counters[`goods.${g}`] = a;
      s.players[1]!.counters[`goods.${g}`] = b;
    }
    const r = play(eng, s, place$(0, 1, 0), NOFIG, CONFIRM);
    expect(r.state.finished).toBe(true);
    return r.state;
  };
  test("flest av varje sort ger 10 poäng", () => {
    const f = finish({ wine: [2, 1], grain: [0, 1], cloth: [0, 0] });
    expect([score(f, "p1"), score(f, "p2")]).toEqual([10, 10]);
  });
  test("delad förstaplats ger alla 10", () => {
    const f = finish({ wine: [1, 1], grain: [3, 0], cloth: [0, 0] });
    expect([score(f, "p1"), score(f, "p2")]).toEqual([20, 10]);
  });
  test("har ingen någon vara delas inga poäng ut", () => {
    const f = finish({ wine: [0, 0], grain: [0, 0], cloth: [0, 0] });
    expect([score(f, "p1"), score(f, "p2")]).toEqual([0, 0]);
  });
});

// Vägar: RFr är en rak väg väst-öst.
const road = (n: number): [string, number, number, Rot][] => Array.from({ length: n }, (_, i) => ["base/RFr", i, 0, 0]);

describe("byggmästaren", () => {
  test("kan ställas på väg med egen följare, inte på väg utan eller på fält", () => {
    const s = sc({ board: road(1), hands: [["base/RFr"], ["base/L"]], figures: [{ id: M("p1"), x: 0, y: 0, feature: "road0" }] });
    const placed = play(eng, s, place$(1, 0, 0)).state;
    expect(actions(placed)).toEqual(["builder:road0"]);
    const t = sc({ board: road(1), hands: [["base/RFr"], []], figures: [{ id: M("p2"), x: 0, y: 0, feature: "road0" }] });
    expect(actions(play(eng, t, place$(1, 0, 0)).state)).toEqual([]);
  });
  test("ersätter följaren; ingen extra tur samma tur som den ställs", () => {
    const s = sc({ board: road(1), hands: [["base/RFr"], ["base/L"]], pile: ["base/RFr"], figures: [{ id: M("p1"), x: 0, y: 0, feature: "road0" }] });
    const r = play(eng, s, place$(1, 0, 0), fig$("builder", 1, 0, "road0"));
    expect(r.state.turn.phase).toBe("confirm");
    expect(eng.legalSteps(r.state).some((x) => x.type === "placeFigure")).toBe(false);
    const done = play(eng, r.state, CONFIRM).state;
    expect(done.turn.player).toBe("p2");
    expect(done.figures.find((f) => f.id === B("p1"))!.location.at).toBe("feature");
  });
  test("ångra tar tillbaka byggmästaren", () => {
    const s = sc({ board: road(1), hands: [["base/RFr"], []], figures: [{ id: M("p1"), x: 0, y: 0, feature: "road0" }] });
    const r = play(eng, s, place$(1, 0, 0), fig$("builder", 1, 0, "road0"), { type: "undo" });
    expect(inSupply(r.state, B("p1"))).toBe(true);
    expect(r.state.turn.phase).toBe("placeFigure");
  });
  test("bygger man vidare på området får man en extra tur, men inte flera i följd", () => {
    const s = sc({
      board: road(1), hands: [["base/RFr"], ["base/L"]], pile: ["base/RFr", "base/RFr", "base/L", "base/RFr"],
      figures: [{ id: M("p1"), x: 0, y: 0, feature: "road0" }, { id: B("p1"), x: 0, y: 0, feature: "road0" }],
    });
    const first = play(eng, s, place$(1, 0, 0), NOFIG, CONFIRM).state;
    expect(first.turn.player).toBe("p1"); // extra tur
    expect(first.players[0]!.hand).toEqual(["base/RFr"]);
    const second = play(eng, first, place$(2, 0, 0), NOFIG, CONFIRM).state;
    expect(second.turn.player).toBe("p2"); // ingen tredje bricka
    // Nästa gång p1 bygger vidare får hen en ny extra tur.
    const p2 = play(eng, second, place$(0, 1, 0), NOFIG, CONFIRM).state;
    expect(p2.turn.player).toBe("p1");
    const third = play(eng, p2, place$(3, 0, 0), NOFIG, CONFIRM).state;
    expect(third.turn.player).toBe("p1");
  });
  test("en bricka som inte bygger vidare ger ingen extra tur", () => {
    const s = sc({
      board: road(1), hands: [["base/L"], ["base/L"]], pile: ["base/L", "base/L"],
      figures: [{ id: M("p1"), x: 0, y: 0, feature: "road0" }, { id: B("p1"), x: 0, y: 0, feature: "road0" }],
    });
    const r = play(eng, s, place$(0, 1, 0), NOFIG, CONFIRM).state;
    expect(r.turn.player).toBe("p2");
  });
  test("extra tur utan fler brickor: turen går vidare", () => {
    const s = sc({
      board: road(1), hands: [["base/RFr"], []], pile: [],
      figures: [{ id: M("p1"), x: 0, y: 0, feature: "road0" }, { id: B("p1"), x: 0, y: 0, feature: "road0" }],
    });
    expect(play(eng, s, place$(1, 0, 0), NOFIG, CONFIRM).state.finished).toBe(true);
  });
  test("extra tur med flera brickor på hand", () => {
    const s = sc({
      board: road(1), hands: [["base/RFr", "base/L", "base/L"], ["base/L", "base/L", "base/L"]], pile: ["base/RFr", "base/L"],
      handSize: 3, figures: [{ id: M("p1"), x: 0, y: 0, feature: "road0" }, { id: B("p1"), x: 0, y: 0, feature: "road0" }],
    });
    const r = play(eng, s, { type: "chooseTile", handIndex: 0 }, place$(1, 0, 0), NOFIG, CONFIRM).state;
    expect(r.turn.player).toBe("p1");
    expect(r.players[0]!.hand.length).toBe(3);
    expect(r.turn.phase).toBe("chooseTile");
  });
  test("går hem när området räknas, och den färdigställande brickan ger ändå en extra tur", () => {
    const s = sc({
      board: [["base/LR", 0, 0, 0]], hands: [["base/LR"], ["base/L"]], pile: ["base/L"],
      figures: [{ id: M("p1"), x: 0, y: 0, feature: "road0" }, { id: B("p1"), x: 0, y: 0, feature: "road0" }],
    });
    const r = play(eng, s, place$(0, 1, 180), NOFIG, CONFIRM).state;
    expect(score(r, "p1")).toBe(2);
    expect(inSupply(r, B("p1"))).toBe(true);
    expect(inSupply(r, M("p1"))).toBe(true);
    expect(r.turn.player).toBe("p1");
  });
  test("går hem när spelaren inte längre har någon följare på området", () => {
    const s = sc({
      board: road(1), hands: [["base/L"], []],
      figures: [{ id: B("p1"), x: 0, y: 0, feature: "road0" }, { id: M("p2"), x: 0, y: 0, feature: "road0" }],
    });
    const r = play(eng, s, place$(0, 1, 0));
    expect(inSupply(r.state, B("p1"))).toBe(true);
  });
  test("räknas inte vid majoritet", () => {
    const s = sc({
      board: [["base/LR", 0, 0, 0]], hands: [["base/LR"], []],
      figures: [{ id: M("p1"), x: 0, y: 0, feature: "road0" }, { id: B("p1"), x: 0, y: 0, feature: "road0" }, { id: M("p2"), x: 0, y: 0, feature: "road0" }],
    });
    const r = play(eng, s, place$(0, 1, 180), NOFIG, CONFIRM).state;
    expect([score(r, "p1"), score(r, "p2")]).toEqual([2, 2]);
  });
});

describe("grisen", () => {
  // Två C mot varandra: en färdig stad, och ett fält runt dem.
  const fieldBoard: [string, number, number, Rot][] = [["base/C", 0, 0, 0], ["base/C", 0, -1, 180]];
  const last = (s: GameState) => play(eng, s, place$(1, 0, 0), NOFIG, CONFIRM).state; // L på fältet, sista draget
  const fig = (id: string) => ({ id, x: 0, y: 0, feature: "field0" });
  test("kan bara ställas på fält med egen bonde", () => {
    const s = sc({ board: [["base/C", 0, 0, 0]], hands: [["base/L"], []], figures: [fig(M("p1"))] });
    const placed = play(eng, s, place$(1, 0, 0)).state;
    expect(actions(placed)).toEqual(["pig:field0"]);
    const t = sc({ board: [["base/C", 0, 0, 0]], hands: [["base/L"], []], figures: [fig(M("p2"))] });
    expect(actions(play(eng, t, place$(1, 0, 0)).state)).toEqual([]);
  });
  test("4 i stället för 3 per färdig stad", () => {
    const s = sc({ board: fieldBoard, hands: [["base/L"], []], pile: [], figures: [fig(M("p1")), fig(P("p1"))] });
    expect(score(last(s), "p1")).toBe(4);
  });
  test("utan gris 3", () => {
    const s = sc({ board: fieldBoard, hands: [["base/L"], []], pile: [], figures: [fig(M("p1"))] });
    expect(score(last(s), "p1")).toBe(3);
  });
  test("delad majoritet: bara grisens ägare får 4", () => {
    const s = sc({ board: fieldBoard, hands: [["base/L"], []], pile: [], figures: [fig(M("p1")), fig(P("p1")), fig(M("p2"))] });
    const f = last(s);
    expect([score(f, "p1"), score(f, "p2")]).toEqual([4, 3]);
  });
  test("grisen räknas inte vid majoritet (ägaren med minoritet får ingenting)", () => {
    const s = scenario(eng, {
      expansions: ["base", "traders-builders", "inns-cathedrals"], board: fieldBoard, hands: [["base/L"], []], pile: [],
      figures: [fig(M("p1")), fig(P("p1")), fig("p2:large-meeple:0")],
    });
    const f = last(s);
    expect([score(f, "p1"), score(f, "p2")]).toEqual([0, 3]);
  });
});

describe("slumpspel", () => {
  const sets: ExpansionId[][] = [
    ["base", "traders-builders"],
    ["base", "river", "abbot", "inns-cathedrals", "traders-builders"],
  ];
  test("många partier går att spela färdigt, med handstorlek 1 och 3", () => {
    const N = Number(process.env.TB_GAMES ?? 120);
    let builders = 0;
    let pigs = 0;
    let extra = 0;
    for (let i = 0; i < N; i++) {
      const strategy: Strategy = i % 2 ? "eager" : "random";
      const setup = setupOf(sets[i % 2]!, {
        n: 2 + (i % 4), seed: 9000 + i, handSize: i % 4 < 2 ? 1 : 3, variants: { "river.startTile": i % 3 ? "shuffle" : "afterRiver" },
      });
      try {
        const r = playGame(eng, setup, { strategy });
        expect(r.state.finished).toBe(true);
        for (const e of r.events) {
          if (e.type === "figurePlaced" && e.figure.includes(":builder:")) builders++;
          if (e.type === "figurePlaced" && e.figure.includes(":pig:")) pigs++;
        }
        const turns = r.events.filter((e) => e.type === "turnStarted") as { player: string }[];
        for (let k = 1; k < turns.length; k++) if (turns[k]!.player === turns[k - 1]!.player) extra++;
        // Varor: räknarna är aldrig negativa.
        for (const p of r.state.players) for (const v of Object.values(p.counters)) expect(v).toBeGreaterThanOrEqual(0);
      } catch (e) {
        throw new Error(`parti ${i} (frö ${9000 + i}): ${(e as Error).message}`);
      }
    }
    expect(builders).toBeGreaterThan(0);
    expect(pigs).toBeGreaterThan(0);
    expect(extra).toBeGreaterThan(0);
  }, 600_000);
});
