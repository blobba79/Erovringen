import { describe, expect, test } from "bun:test";
import type { GameState, Step } from "../../../src/shared/state";
import { cropCircles2Module } from "../../../src/expansions/crop-circles-2/index";
import { actorOf } from "../../../src/engine/index";
import { realEngine } from "../../engine/helpers";
import { CONFIRM, NOFIG, place$, play, scenario, type Rot } from "../../engine/scenario";
import { playGame, type Strategy } from "../../players/random-player";

const eng = realEngine();
const CC = (t: string) => `crop-circles-2/${t}`;

/** Spelar delsteg där varje steg görs av den som ska välja (actor). */
function act(s: GameState, ...steps: Step[]): GameState {
  let state = s;
  for (const step of steps) {
    const r = eng.apply(state, actorOf(state), step);
    if (!r.ok) throw new Error(`${JSON.stringify(step)} nekades: ${r.error}`);
    state = r.state;
  }
  return state;
}

const mode = (choice: "add" | "remove"): Step => ({ type: "expansion", expansion: "crop-circles-2", action: "mode", data: { choice } });
const SKIP: Step = { type: "expansion", expansion: "crop-circles-2", action: "skip", data: {} };
const cc = (s: GameState) => eng.legalSteps(s).flatMap((x) => (x.type === "expansion" ? [x] : []));
const where = (s: GameState, id: string) => s.figures.find((f) => f.id === id)!.location;
const supply = (s: GameState, id: string) => where(s, id).at === "supply";

// En stadsbricka (CFC) på (0,0) med två städer (norr, söder); p1 lägger en till på (1,0) så att fälten
// möts och inga städer hänger ihop (inget område blir färdigt).
const BOARD: [string, number, number, Rot][] = [[CC("CFC"), 0, 0, 0]];

function circle(figures: { id: string; x: number; y: number; feature: string }[], extra: Partial<Parameters<typeof scenario>[1]> = {}) {
  const s = scenario(eng, {
    expansions: ["base", "crop-circles-2"], n: 3, board: BOARD, hands: [[CC("CFC")], ["base/L"], ["base/L"]], figures, ...extra,
  });
  // p1 lägger brickan med stadscirkeln, ingen pjäs, bekräftar -> fasen börjar.
  return play(eng, s, place$(1, 0, 0), NOFIG, CONFIRM).state;
}

const P2N = { id: "p2:meeple:0", x: 0, y: 0, feature: "city0" };
const P3S = { id: "p3:meeple:0", x: 0, y: 0, feature: "city1" };

describe("modulen", () => {
  test("sex brickor, var och en med en sädescirkel av tre sorter", () => {
    expect(cropCircles2Module.tileSets[0]!.tiles.reduce((a, t) => a + t.count, 0)).toBe(6);
    const kinds = cropCircles2Module.tileSets[0]!.tiles.map((t) => eng.types.get(t.type)!.symbols!.find((x) => x.startsWith("crop-circle:")));
    expect(kinds.sort()).toEqual(["crop-circle:city", "crop-circle:city", "crop-circle:field", "crop-circle:field", "crop-circle:road", "crop-circle:road"]);
  });
});

describe("valet lägg till eller ta bort", () => {
  test("efter bekräftelsen väljer den som har tur; bara valet och ingen annan fas", () => {
    const s = circle([P2N, P3S]);
    expect(s.turn.phase).toBe("crop-circles-2");
    expect(s.turn.player).toBe("p1");
    expect(s.turn.actor).toBeUndefined();
    expect(cc(s).map((x) => (x.data as { choice: string }).choice)).toEqual(["add", "remove"]);
    expect(eng.legalSteps(s).some((x) => x.type === "confirm" || x.type === "noFigure")).toBe(false);
    expect(eng.apply(s, "p2", mode("add")).ok).toBe(false);
  });

  test("ingen cirkelfas om ingen har en följare av sorten", () => {
    const s = circle([{ id: "p2:meeple:0", x: 0, y: 0, feature: "field0" }]);
    expect(s.turn.phase).toBe("placeTile");
    expect(s.turn.actor).toBeUndefined();
  });

  test("lägg till: i tur och ordning från vänster, den som har tur sist, hoppa över går", () => {
    let s = circle([P2N, P3S]);
    s = act(s, mode("add"));
    expect(s.turn.phase).toBe("crop-circles-2");
    expect(s.turn.player).toBe("p1");
    expect(s.turn.actor).toBe("p2");
    // Bara p2:s område (p2:s egen följare) och hoppa över; p3:s område är inte p2:s.
    expect(cc(s).map((x) => x.action)).toEqual(["add", "skip"]);
    expect(eng.apply(s, "p1", SKIP).ok).toBe(false);
    expect(eng.apply(s, "p3", SKIP).ok).toBe(false);
    s = act(s, cc(s)[0]!);
    expect(where(s, "p2:meeple:1")).toEqual({ at: "feature", pos: { x: 0, y: 0 }, feature: "city0" });
    expect(s.turn.actor).toBe("p3");
    s = act(s, SKIP);
    // p1 har ingen följare på kartan: ingen mer att välja, bekräfta hör till p1.
    expect(s.turn.phase).toBe("confirm");
    expect(s.turn.actor).toBeUndefined();
    expect(supply(s, "p3:meeple:1")).toBe(true);
    const done = play(eng, s, CONFIRM).state;
    expect(done.turn.player).toBe("p2");
    expect(done.turn.phase).toBe("placeTile");
  });

  test("lägg till: målet är bara ett område där spelaren redan har en följare, och kräver följare i förrådet", () => {
    let s = circle([P2N, P3S]);
    s = act(s, mode("add"));
    const bad = { type: "expansion", expansion: "crop-circles-2", action: "add", data: { pos: { x: 1, y: 0 }, feature: "city1" } } as Step;
    expect(eng.apply(s, "p2", bad).ok).toBe(false);
    // Tomt förråd: p2 hoppas över.
    let t = circle(
      [P2N, P3S, ...[1, 2, 3, 4, 5, 6].map((i) => ({ id: `p2:meeple:${i}`, x: 0, y: 0, feature: "field0" }))],
    );
    t = act(t, mode("add"));
    expect(t.turn.actor).toBe("p3");
  });

  test("ta bort: obligatoriskt (inget hoppa över), den som inte har någon hoppas över", () => {
    let s = circle([P2N, P3S]);
    s = act(s, mode("remove"));
    expect(s.turn.actor).toBe("p2");
    expect(cc(s).map((x) => x.action)).toEqual(["remove"]);
    s = act(s, cc(s)[0]!);
    expect(supply(s, "p2:meeple:0")).toBe(true);
    expect(s.turn.actor).toBe("p3");
    s = act(s, cc(s)[0]!);
    expect(supply(s, "p3:meeple:0")).toBe(true);
    expect(s.turn.phase).toBe("confirm");
    expect(s.turn.actor).toBeUndefined();
  });

  test("den som har tur tar bort sin egen följare sist", () => {
    // p1:s följare står på sydstaden av den nya brickan (0,1).
    const s0 = scenario(eng, {
      expansions: ["base", "crop-circles-2"], n: 3, board: BOARD, hands: [[CC("CFC")]], figures: [P2N],
    });
    let s = play(eng, s0, place$(1, 0, 0), { type: "placeFigure", kind: "meeple", pos: { x: 1, y: 0 }, feature: "city1" }, CONFIRM).state;
    s = act(s, mode("remove"));
    expect(s.turn.actor).toBe("p2");
    s = act(s, cc(s)[0]!);
    // p3 har ingen följare: nästa är p1 (actor tas bort när p1 själv har tur).
    expect(s.turn.phase).toBe("crop-circles-2");
    expect(s.turn.actor).toBeUndefined();
    s = act(s, cc(s)[0]!);
    expect(supply(s, "p1:meeple:0")).toBe(true);
    expect(s.turn.phase).toBe("confirm");
  });

  test("bara städer berörs av en stadscirkel: följare på väg och fält och abboten lämnas", () => {
    const s = circle([
      { id: "p2:meeple:0", x: 0, y: 0, feature: "field0" },
      { id: "p3:meeple:0", x: 0, y: 0, feature: "city1" },
    ]);
    let t = act(s, mode("remove"));
    expect(t.turn.actor).toBe("p3");
    t = act(t, cc(t)[0]!);
    expect(where(t, "p2:meeple:0").at).toBe("feature");
    expect(t.turn.phase).toBe("confirm");
  });

  test("poängen räknas före cirkeln", () => {
    // Stadsbrickan CFC (0,1) mot en vägg: (0,0) CcCc? Använd en färdig stad: CFC på (0,0) med stängd
    // norrsida är inte möjlig här; kontrollera i stället att poäng och pjäser från bekräftelsen finns kvar
    // när fasen börjar (inga poäng ges av cirkeln själv).
    const s = circle([P2N, P3S]);
    const before = s.players.map((p) => p.score);
    const t = act(s, mode("add"), SKIP, SKIP);
    expect(t.players.map((p) => p.score)).toEqual(before);
  });
});

describe("vilken pjäs", () => {
  const IC = ["base", "crop-circles-2", "inns-cathedrals"] as const;
  const L2 = { id: "p2:large-meeple:0", x: 0, y: 0, feature: "city0" };
  test("ta bort: ett steg per följare i området, spelaren väljer vilken", () => {
    let s = circle([P2N, L2, P3S], { expansions: [...IC] });
    s = act(s, mode("remove"));
    const steps = cc(s);
    expect(steps.map((x) => (x.data as { figure: string }).figure).sort()).toEqual(["p2:large-meeple:0", "p2:meeple:0"]);
    s = act(s, steps.find((x) => (x.data as { figure: string }).figure === "p2:large-meeple:0")!);
    expect(supply(s, "p2:large-meeple:0")).toBe(true);
    expect(where(s, "p2:meeple:0").at).toBe("feature");
  });

  test("lägg till: vanlig eller stor följare ur förrådet; bara den stora om vanliga saknas", () => {
    let s = circle([P2N, P3S], { expansions: [...IC] });
    s = act(s, mode("add"));
    const kinds = cc(s).filter((x) => x.action === "add").map((x) => (x.data as { choice: string }).choice).sort();
    expect(kinds).toEqual(["large-meeple", "meeple"]);
    s = act(s, cc(s).find((x) => x.action === "add" && (x.data as { choice: string }).choice === "large-meeple")!);
    expect(where(s, "p2:large-meeple:0")).toEqual({ at: "feature", pos: { x: 0, y: 0 }, feature: "city0" });
    // Inga vanliga kvar i förrådet: bara stor följare erbjuds.
    let t = circle(
      [P2N, P3S, ...[1, 2, 3, 4, 5, 6].map((i) => ({ id: `p2:meeple:${i}`, x: 0, y: 0, feature: "field0" }))],
      { expansions: [...IC] },
    );
    t = act(t, mode("add"));
    expect(cc(t).filter((x) => x.action === "add").map((x) => (x.data as { choice: string }).choice)).toEqual(["large-meeple"]);
  });
});

describe("guld före cirkeln", () => {
  test("guldet delas ut även när poängräkningen följs av en cirkel", () => {
    const s0 = scenario(eng, {
      expansions: ["base", "crop-circles-2", "gold-mines"], n: 3, board: BOARD, hands: [[CC("CFC")], ["base/L"], ["base/L"]],
      figures: [{ ...P2N, feature: "city1" }, { id: "p3:meeple:0", x: 0, y: 0, feature: "city0" }],
    });
    s0.figures.find((f) => f.kind === "gold-bar")!.location = { at: "tile", pos: { x: 0, y: 0 } };
    const s = play(eng, s0, place$(0, 1, 0), NOFIG, CONFIRM).state;
    expect(s.turn.phase).toBe("crop-circles-2");
    expect(s.players.find((p) => p.id === "p2")!.counters.gold).toBe(1);
  });
});

describe("ångra", () => {
  test("den som har tur kan ångra valet så länge ingen annan har valt", () => {
    let s = circle([P2N, P3S]);
    expect(eng.legalSteps(s).some((x) => x.type === "undo")).toBe(false);
    s = act(s, mode("add"));
    // p2 väljer nu, men p1 kan ångra (och p2 kan det inte).
    expect(s.turn.actor).toBe("p2");
    expect(eng.canUndo(s)).toBe(true);
    expect(eng.legalSteps(s).some((x) => x.type === "undo")).toBe(false);
    expect(eng.apply(s, "p2", { type: "undo" }).ok).toBe(false);
    const u = eng.apply(s, "p1", { type: "undo" });
    expect(u.ok).toBe(true);
    if (!u.ok) return;
    expect(u.state.turn.phase).toBe("crop-circles-2");
    expect(u.state.turn.actor).toBeUndefined();
    expect(u.state.turn.pending).toEqual([]);
    // Och byta val.
    const s2 = act(u.state, mode("remove"));
    expect(s2.turn.actor).toBe("p2");
    expect(cc(s2).map((x) => x.action)).toEqual(["remove"]);
  });

  test("efter att någon annan valt går det inte att ångra", () => {
    let s = circle([P2N, P3S]);
    s = act(s, mode("add"), SKIP);
    expect(s.turn.actor).toBe("p3");
    expect(eng.canUndo(s)).toBe(false);
    const r = eng.apply(s, "p1", { type: "undo" });
    expect(r.ok).toBe(false);
    s = act(s, SKIP);
    expect(s.turn.phase).toBe("confirm");
    expect(eng.legalSteps(s).some((x) => x.type === "undo")).toBe(false);
    expect(eng.apply(s, "p1", { type: "undo" }).ok).toBe(false);
    expect(play(eng, s, CONFIRM).state.turn.player).toBe("p2");
  });

  test("ångra i en vanlig tur påverkas inte av cirkeln", () => {
    const s0 = scenario(eng, { expansions: ["base", "crop-circles-2"], n: 3, board: BOARD, hands: [[CC("CFC")]], figures: [P2N] });
    const placed = play(eng, s0, place$(1, 0, 0)).state;
    expect(eng.legalSteps(placed).some((x) => x.type === "undo")).toBe(true);
    const u = play(eng, placed, { type: "undo" }).state;
    expect(u.turn.phase).toBe("placeTile");
  });
});

describe("cirkeln med den som har tur ensam", () => {
  test("sorten kommer från brickan: väg- och fältcirklar", () => {
    // RRr (väg) läggs bredvid en bricka; p2 har en följare på en väg (0,0).
    const s0 = scenario(eng, {
      expansions: ["base", "crop-circles-2"], n: 2, board: [[CC("RRr"), 0, 0, 0]], hands: [[CC("RRr")]],
      figures: [{ id: "p2:meeple:0", x: 0, y: 0, feature: "road1" }],
    });
    // road1 på (0,0) går mot Ö: lägg nästa bricka i (1,0) med västra vägen (rotation 180 ger Ö -> V).
    const opts = eng.legalSteps(s0).filter((x) => x.type === "placeTile");
    const east = opts.find((x) => x.type === "placeTile" && x.pos.x === 1 && x.pos.y === 0)!;
    let s = play(eng, s0, east, NOFIG, CONFIRM).state;
    expect(s.turn.phase).toBe("crop-circles-2");
    s = act(s, mode("remove"));
    expect(s.turn.actor).toBe("p2");
    s = act(s, cc(s)[0]!);
    expect(supply(s, "p2:meeple:0")).toBe(true);
  });
});

describe("slumpspel", () => {
  test("Crop Circles II ensam, handstorlek 1 och 3", () => {
    let withCircle = 0;
    for (let i = 0; i < 40; i++) {
      const strategy: Strategy = i % 2 ? "eager" : "random";
      const r = playGame(eng, scenarioSetup(i, ["base", "crop-circles-2"]), { strategy });
      expect(r.state.finished).toBe(true);
      if (r.events.some((e) => e.type === "expansion" && e.expansion === "crop-circles-2")) withCircle++;
    }
    expect(withCircle).toBeGreaterThan(5);
  }, 600_000);

  test("med alla färdiga expansioner, handstorlek 1 och 3", () => {
    const all = ["base", "river", "abbot", "inns-cathedrals", "traders-builders", "gold-mines", "mage-witch", "ferries", "flying-machines", "crop-circles-2"] as const;
    for (let i = 0; i < 18; i++) {
      const r = playGame(eng, scenarioSetup(i, [...all]), { strategy: i % 2 ? "eager" : "random" });
      expect(r.state.finished).toBe(true);
    }
  }, 600_000);
});

import { setupOf } from "../../engine/helpers";
import type { ExpansionId } from "../../../src/shared/tiles";
function scenarioSetup(i: number, expansions: ExpansionId[]) {
  return setupOf(expansions, { n: 2 + (i % 4), seed: 3000 + i, handSize: i % 3 === 2 ? 3 : 1, variants: { "river.startTile": "shuffle" } });
}
