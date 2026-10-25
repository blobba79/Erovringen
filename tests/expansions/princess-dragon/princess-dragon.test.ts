import { describe, expect, test } from "bun:test";
import type { GameEvent, GameState, Step } from "../../../src/shared/state";
import type { ExpansionId } from "../../../src/shared/tiles";
import { princessDragonModule } from "../../../src/expansions/princess-dragon/index";
import { actorOf } from "../../../src/engine/index";
import { engineHook, makeCtx } from "../../../src/engine/context";
import { realEngine, setupOf } from "../../engine/helpers";
import { CONFIRM, NOFIG, fig$, inSupply, place$, play, scenario, score, type Rot } from "../../engine/scenario";
import { makeRng, playGame, type Strategy } from "../../players/random-player";
import { chooseBotStep } from "../../../src/server/bot";

const eng = realEngine();
const PD = (t: string) => `princess-dragon/${t}`;
const EXP: ExpansionId[] = ["base", "princess-dragon"];
const sc = (o: Parameters<typeof scenario>[1]) => scenario(eng, { expansions: EXP, ...o });

type ExStep = Extract<Step, { type: "expansion" }>;
const ex = (action: string, data: unknown): ExStep => ({ type: "expansion", expansion: "princess-dragon", action, data });
const mv = (x: number, y: number) => ex("move", { pos: { x, y } });
const portal = (choice: string) => ex("portal", { choice });
const portalAt = (x: number, y: number, feature: string, choice: string) => ex("portalPlace", { pos: { x, y }, feature, choice });
const fairyTo = (figure: string, x: number, y: number, feature: string) => ex("fairy", { pos: { x, y }, feature, figure });
const seduce = (figure: string, x: number, y: number, feature: string) => ex("seduce", { pos: { x, y }, feature, figure });

const M = (p: string, i = 0) => `${p}:meeple:${i}`;
const phase = (s: GameState) => s.turn.phase;

const pd = (s: GameState): ExStep[] => eng.legalSteps(s).filter((x): x is ExStep => x.type === "expansion" && x.expansion === "princess-dragon");
const moves = (s: GameState) => pd(s).filter((x) => x.action === "move").map((x) => (x.data as { pos: { x: number; y: number } }).pos).map((p) => `${p.x},${p.y}`).sort();
const loc = (s: GameState, id: string) => s.figures.find((f) => f.id === id)!.location;
const dragonAt = (s: GameState, x: number, y: number) => {
  s.figures.find((f) => f.id === "dragon:0")!.location = { at: "tile", pos: { x, y } };
};
const fairyAt = (s: GameState, host: string) => {
  s.figures.find((f) => f.id === "fairy:0")!.location = { at: "figure", figure: host };
};
const fairyOnTile = (s: GameState, x: number, y: number) => {
  s.figures.find((f) => f.id === "fairy:0")!.location = { at: "tile", pos: { x, y } };
};

/** Utför steg där varje steg görs av den som ska välja (actor, annars den som har tur). */
function act(s: GameState, ...steps: Step[]): { state: GameState; events: GameEvent[] } {
  let state = s;
  const events: GameEvent[] = [];
  for (const step of steps) {
    const r = eng.apply(state, actorOf(state), step);
    if (!r.ok) throw new Error(`${JSON.stringify(step)} nekades: ${r.error}`);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}

/** Flytta draken tills fasen är slut; väljer alltid det första tillåtna steget. */
function finishDragon(s: GameState): { state: GameState; events: GameEvent[] } {
  let state = s;
  const events: GameEvent[] = [];
  for (let i = 0; i < 10 && phase(state) === "dragon"; i++) {
    const r = act(state, pd(state)[0]!);
    state = r.state;
    events.push(...r.events);
  }
  return { state, events };
}

const reasons = (events: GameEvent[]) =>
  events.flatMap((e) => (e.type === "scored" ? [`${e.player}:${e.reason}:${e.points}`] : []));

// Ett 3 x 3 fält av raka vägar (RFr) med rutor 0..2; den nya brickan läggs vid (3,0).
const GRID: [string, number, number, Rot][] = [];
for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) GRID.push(["base/RFr", x, y, 0]);

describe("modulen", () => {
  test("30 brickor: 6 vulkaner, 12 drakbrickor, 6 magiska portar, 6 prinsessor", () => {
    const tiles = princessDragonModule.tileSets[0]!.tiles;
    expect(tiles.reduce((a, t) => a + t.count, 0)).toBe(30);
    const count = (pred: (id: string) => boolean) => tiles.filter((t) => pred(t.type)).reduce((a, t) => a + t.count, 0);
    const sym = (id: string, s: string) => eng.types.get(id)!.symbols?.includes(s) ?? false;
    expect(count((id) => sym(id, "volcano"))).toBe(6);
    expect(count((id) => sym(id, "dragon"))).toBe(12);
    expect(count((id) => sym(id, "portal"))).toBe(6);
    expect(count((id) => eng.types.get(id)!.features.some((f) => f.kind === "city" && (f.props as { princess?: boolean } | undefined)?.princess))).toBe(6);
  });

  test("draken och fen är neutrala pjäser i förrådet; varianten för drakens tidpunkt finns, standard före", () => {
    const s = eng.newGame(setupOf(EXP, { n: 3 }));
    for (const id of ["dragon:0", "fairy:0"]) {
      const f = s.figures.find((x) => x.id === id)!;
      expect(f.owner).toBeNull();
      expect(f.location.at).toBe("supply");
    }
    expect(princessDragonModule.variants).toEqual([{ id: "dragonTiming", options: ["before", "after"], default: "before" }]);
  });
});

describe("dragbrickor före vulkanen", () => {
  test("läggs åt sidan vid starten: varken högen eller händerna har någon", () => {
    for (let seed = 1; seed <= 20; seed++) {
      const s = eng.newGame(setupOf(EXP, { n: 3, seed, handSize: 3 }));
      const all = [...s.drawPile, ...s.players.flatMap((p) => p.hand)];
      expect(all.some((t) => eng.types.get(t)!.symbols?.includes("dragon"))).toBe(false);
      expect((s.ext["princess-dragon"] as { aside: string[] }).aside.length).toBe(12);
      expect(all.length + 1 + 12).toBe(72 + 30);
    }
  });

  test("när den första vulkanen läggs blandas de in i högen", () => {
    const s = sc({ board: [["base/RFr", 0, 0, 0]], hands: [[PD("RFr.v")], []], pile: ["base/L"] });
    const r = play(eng, s, place$(1, 0, 0));
    const ext = r.state.ext["princess-dragon"] as { aside: string[] };
    expect(ext.aside).toEqual([]);
    expect(r.state.drawPile.length).toBe(1 + 12);
    expect(r.state.drawPile.filter((t) => eng.types.get(t)!.symbols?.includes("dragon")).length).toBe(12);
  });

  test("en andra vulkan blandar inte in något mer", () => {
    const s = sc({ board: [["base/RFr", 0, 0, 0], [PD("RFr.v"), 1, 0, 0]], hands: [[PD("RFr.v")], []], pile: ["base/L"] });
    dragonAt(s, 1, 0);
    const r = play(eng, s, place$(2, 0, 0));
    expect(r.state.drawPile.length).toBe(1);
  });
});

describe("vulkan", () => {
  const start = () => sc({ board: [["base/RFr", 0, 0, 0]], hands: [[PD("RFr.v")], []] });

  test("draken flyttas till brickan och ingen pjäs får ställas där", () => {
    const r = play(eng, start(), place$(1, 0, 0));
    expect(loc(r.state, "dragon:0")).toEqual({ at: "tile", pos: { x: 1, y: 0 } });
    expect(phase(r.state)).toBe("placeFigure");
    expect(eng.legalSteps(r.state).some((x) => x.type === "placeFigure")).toBe(false);
    expect(eng.legalSteps(r.state).some((x) => x.type === "noFigure")).toBe(true);
    expect(eng.apply(r.state, "p1", fig$("meeple", 1, 0, "road0")).ok).toBe(false);
    const done = play(eng, r.state, NOFIG);
    expect(phase(done.state)).toBe("confirm");
  });

  test("en vulkan flyttar draken från dess gamla plats utan att äta något", () => {
    const s = sc({
      board: [["base/RFr", 0, 0, 0], ["base/RFr", 1, 0, 0]], hands: [[PD("RFr.v")], []],
      figures: [{ id: M("p2"), x: 1, y: 0, feature: "road0" }],
    });
    dragonAt(s, 0, 0);
    const r = play(eng, s, place$(2, 0, 0), NOFIG);
    expect(loc(r.state, "dragon:0")).toEqual({ at: "tile", pos: { x: 2, y: 0 } });
    expect(inSupply(r.state, M("p2"))).toBe(false);
  });

  test("på en vulkanbricka får fen flyttas men ingen annan pjäs ställas ut", () => {
    const s = sc({
      board: [["base/RFr", 0, 0, 0]], hands: [[PD("RFr.v")], []],
      figures: [{ id: M("p1"), x: 0, y: 0, feature: "road0" }],
    });
    const r = play(eng, s, place$(1, 0, 0));
    expect(pd(r.state).map((x) => x.action)).toEqual(["fairy"]);
    const f = play(eng, r.state, fairyTo(M("p1"), 0, 0, "road0"));
    expect(loc(f.state, "fairy:0")).toEqual({ at: "figure", figure: M("p1") });
    expect(phase(f.state)).toBe("confirm");
  });
});

describe("drakens flytt", () => {
  // p1 lägger drakbrickan (3,0). Draken står på (1,1). p2:s följare på (1,0), p1:s på (2,1), p3:s på (0,1).
  const start = (o: Partial<Parameters<typeof scenario>[1]> = {}) => {
    const s = sc({
      n: 3, board: GRID, hands: [[PD("RFr.d")], ["base/L"], ["base/L"]],
      figures: [
        { id: M("p2"), x: 1, y: 0, feature: "road0" },
        { id: M("p1"), x: 2, y: 1, feature: "road0" },
        { id: M("p3"), x: 0, y: 1, feature: "road0" },
      ],
      ...o,
    });
    dragonAt(s, 1, 1);
    return s;
  };

  test("sex steg i tur och ordning med start hos den som har tur; ingen rutan två gånger; följare äts", () => {
    let s = play(eng, start(), place$(3, 0, 0), NOFIG).state;
    expect(phase(s)).toBe("dragon");
    expect(s.turn.player).toBe("p1");
    expect(s.turn.actor).toBeUndefined();
    expect(eng.legalSteps(s).some((x) => x.type === "confirm" || x.type === "noFigure")).toBe(false);
    expect(moves(s)).toEqual(["0,1", "1,0", "1,2", "2,1"]);
    // 1. p1 uppåt: p2:s följare äts.
    s = act(s, mv(1, 0)).state;
    expect(inSupply(s, M("p2"))).toBe(true);
    expect(s.turn.actor).toBe("p2");
    expect(eng.apply(s, "p1", mv(2, 0)).ok).toBe(false);
    // Tillbaka till (1,1) går inte; bara öster och väster.
    expect(moves(s)).toEqual(["0,0", "2,0"]);
    // 2. p2 österut.
    s = act(s, mv(2, 0)).state;
    expect(s.turn.actor).toBe("p3");
    expect(moves(s)).toEqual(["2,1", "3,0"]);
    // 3. p3 söderut: p1:s följare äts.
    s = act(s, mv(2, 1)).state;
    expect(inSupply(s, M("p1"))).toBe(true);
    expect(inSupply(s, M("p3"))).toBe(false);
    // 4. p1 (som har tur) igen.
    expect(s.turn.actor).toBeUndefined();
    expect(moves(s)).toEqual(["2,2"]);
    s = act(s, mv(2, 2)).state;
    expect(s.turn.actor).toBe("p2");
    expect(moves(s)).toEqual(["1,2"]);
    s = act(s, mv(1, 2)).state;
    // 6. p3 sist: västerut till (0,2); (1,1) är besökt.
    expect(s.turn.actor).toBe("p3");
    expect(moves(s)).toEqual(["0,2"]);
    s = act(s, mv(0, 2)).state;
    expect(phase(s)).toBe("confirm");
    expect(s.turn.actor).toBeUndefined();
    expect(loc(s, "dragon:0")).toEqual({ at: "tile", pos: { x: 0, y: 2 } });
    // Draken ätit två gånger; p3:s följare på (0,1) levde (draken passerade inte den rutan).
    expect(inSupply(s, M("p3"))).toBe(false);
    s = play(eng, s, CONFIRM).state;
    expect(s.turn.player).toBe("p2");
  });

  test("alltid sex steg, även med två spelare (flera varv)", () => {
    // Två spelare på ett bredare fält: p1, p2, p1, p2, p1, p2.
    const board: [string, number, number, Rot][] = [];
    for (let x = 0; x < 9; x++) board.push(["base/RFr", x, 0, 0]);
    const s = sc({ n: 2, board, hands: [[PD("RFr.d")], []] });
    dragonAt(s, 0, 0);
    let st = play(eng, s, place$(9, 0, 0), NOFIG).state;
    const actors: string[] = [];
    let n = 0;
    while (phase(st) === "dragon") {
      actors.push(actorOf(st));
      st = act(st, pd(st)[0]!).state;
      n++;
    }
    expect(n).toBe(6);
    expect(actors).toEqual(["p1", "p2", "p1", "p2", "p1", "p2"]);
    expect(loc(st, "dragon:0")).toEqual({ at: "tile", pos: { x: 6, y: 0 } });
  });

  test("fens ruta är förbjuden för draken, och följare där är trygga", () => {
    const s = start();
    fairyAt(s, M("p2")); // fen intill p2:s följare på (1,0)
    let st = play(eng, s, place$(3, 0, 0), NOFIG).state;
    expect(moves(st)).toEqual(["0,1", "1,2", "2,1"]);
    expect(eng.apply(st, "p1", mv(1, 0)).ok).toBe(false);
    st = act(st, mv(2, 1)).state; // p1 äter sin egen följare
    expect(inSupply(st, M("p1"))).toBe(true);
    expect(inSupply(st, M("p2"))).toBe(false);
  });

  test("fen som blivit kvar på en ruta (följaren hemma) spärrar också", () => {
    const s = start();
    fairyOnTile(s, 1, 0);
    const st = play(eng, s, place$(3, 0, 0), NOFIG).state;
    expect(moves(st)).toEqual(["0,1", "1,2", "2,1"]);
  });

  test("fastnar draken slutar flytten (återvändsgränd)", () => {
    const s = sc({ n: 3, board: [["base/RFr", 0, 0, 0], ["base/RFr", 1, 0, 0]], hands: [[PD("RFr.d")], [], []] });
    dragonAt(s, 0, 0);
    let st = play(eng, s, place$(2, 0, 0), NOFIG).state;
    st = act(st, mv(1, 0)).state;
    st = act(st, mv(2, 0)).state; // fastnar: grannen (1,0) är besökt
    expect(phase(st)).toBe("confirm");
    expect(st.turn.actor).toBeUndefined();
    expect(loc(st, "dragon:0")).toEqual({ at: "tile", pos: { x: 2, y: 0 } });
  });

  test("ingen flytt om draken inte kan gå någonstans", () => {
    const s = sc({ board: [["base/RFr", 0, 0, 0]], hands: [[PD("RFr.d")], []] });
    dragonAt(s, 0, 0);
    fairyOnTile(s, 1, 0); // den enda grannen ligger där den nya brickan hamnar, och är fens ruta
    const st = play(eng, s, place$(1, 0, 0), NOFIG).state;
    expect(phase(st)).toBe("confirm");
  });

  test("dragbricka med draken utanför spelet ger ingen flytt", () => {
    const s = sc({ board: [["base/RFr", 0, 0, 0]], hands: [[PD("RFr.d")], []] });
    const st = play(eng, s, place$(1, 0, 0), NOFIG).state;
    expect(phase(st)).toBe("confirm");
    expect(loc(st, "dragon:0").at).toBe("supply");
  });

  test("en vanlig bricka ger ingen drakfas", () => {
    const s = start({ hands: [["base/RFr"], [], []] });
    const st = play(eng, s, place$(3, 0, 0), NOFIG).state;
    expect(phase(st)).toBe("confirm");
  });
});

describe("drakens tidpunkt", () => {
  // Staden: T1 (0,0) stad åt öster med p2:s följare, dragbricka C.d (stad) läggs vid (1,0) och gör staden färdig.
  // Draken står på (0,1) och kan bara gå norrut till stadsbrickan, där p2:s följare äts.
  const start = (timing: string) => {
    const s = sc({
      n: 3, board: [["base/C", 0, 0, 90], ["base/RFr", 0, 1, 0]], hands: [[PD("C.d")], ["base/L"], ["base/L"]],
      figures: [{ id: M("p2"), x: 0, y: 0, feature: "city0" }],
      variants: { "princess-dragon.dragonTiming": timing },
    });
    dragonAt(s, 0, 1);
    return s;
  };

  test("före poängräkningen (standard): draken äter följaren först, staden ger inga poäng", () => {
    let st = play(eng, start("before"), place$(1, 0, 270), NOFIG).state;
    expect(phase(st)).toBe("dragon");
    st = act(st, mv(0, 0)).state;
    expect(inSupply(st, M("p2"))).toBe(true);
    st = act(st, mv(1, 0)).state; // p2 går vidare till den nya brickan; sedan fastnar den
    expect(phase(st)).toBe("confirm");
    const done = play(eng, st, CONFIRM);
    expect(score(done.state, "p2")).toBe(0);
    expect(reasons(done.events)).toEqual([]);
  });

  test("efter poängräkningen (RGG): staden räknas först, sedan flyttar draken", () => {
    let st = play(eng, start("after"), place$(1, 0, 270), NOFIG).state;
    expect(phase(st)).toBe("confirm");
    const scored = play(eng, st, CONFIRM);
    expect(score(scored.state, "p2")).toBe(4);
    expect(reasons(scored.events)).toEqual(["p2:city:4"]);
    st = scored.state;
    expect(phase(st)).toBe("dragon");
    expect(st.turn.player).toBe("p1");
    expect(inSupply(st, M("p2"))).toBe(true);
    st = act(st, mv(0, 0)).state;
    st = act(st, mv(1, 0)).state;
    expect(phase(st)).toBe("confirm");
    const next = play(eng, st, CONFIRM).state;
    expect(next.turn.player).toBe("p2");
    expect(next.turn.phase).toBe("placeTile");
    // Poängen räknades inte en gång till.
    expect(score(next, "p2")).toBe(4);
  });

  test("efter poängräkningen: ångra i drakfasen och bara av den som har tur", () => {
    const scored = play(eng, start("after"), place$(1, 0, 270), NOFIG, CONFIRM).state;
    const a = act(scored, mv(0, 0)).state;
    const u = eng.apply(a, "p1", { type: "undo" });
    expect(u.ok && JSON.stringify(u.state)).toBe(JSON.stringify(scored));
    const b = act(a, mv(1, 0)).state;
    expect(phase(b)).toBe("confirm");
    expect(eng.apply(b, "p1", { type: "undo" }).ok).toBe(false);
  });
});

describe("ångra", () => {
  const start = () => {
    const s = sc({ n: 3, board: GRID, hands: [[PD("RFr.d")], ["base/L"], ["base/L"]] });
    dragonAt(s, 1, 1);
    return play(eng, s, place$(3, 0, 0), NOFIG).state;
  };

  test("spelaren som har tur kan ångra sitt eget drakdrag", () => {
    const s = start();
    const a = act(s, mv(1, 0)).state;
    expect(eng.canUndo(a)).toBe(true);
    const u = eng.apply(a, "p1", { type: "undo" });
    expect(u.ok && JSON.stringify(u.state)).toBe(JSON.stringify(s));
  });

  test("inte när någon annan har flyttat draken, och aldrig av den andra", () => {
    const s = start();
    const a = act(s, mv(1, 0), mv(2, 0)).state;
    expect(eng.canUndo(a)).toBe(false);
    expect(eng.apply(a, "p1", { type: "undo" }).ok).toBe(false);
    expect(eng.apply(a, "p3", { type: "undo" }).ok).toBe(false);
    expect(eng.legalSteps(a).some((x) => x.type === "undo")).toBe(false);
    // Samma efter att flytten är slut: draget är redan gjort av andra.
    const done = finishDragon(a).state;
    expect(phase(done)).toBe("confirm");
    expect(eng.canUndo(done)).toBe(false);
  });

  test("ångra en bricka före drakfasen går som vanligt", () => {
    const s = sc({ n: 3, board: GRID, hands: [[PD("RFr.d")], ["base/L"], ["base/L"]] });
    dragonAt(s, 1, 1);
    const a = play(eng, s, place$(3, 0, 0)).state;
    const u = eng.apply(a, "p1", { type: "undo" });
    expect(u.ok && JSON.stringify(u.state)).toBe(JSON.stringify(s));
  });
});

describe("värden hoppar över den som flyttar draken", () => {
  const start = () => {
    const s = sc({ n: 3, board: GRID, hands: [[PD("RFr.d")], ["base/L"], ["base/L"]] });
    dragonAt(s, 1, 1);
    return play(eng, s, place$(3, 0, 0), NOFIG).state;
  };
  const skip = (s: GameState, remove?: string): GameState => {
    const t = structuredClone(s);
    if (remove) t.players = t.players.filter((p) => p.id !== remove);
    engineHook(princessDragonModule, "skipActor")?.(makeCtx(eng.env, t, t.turn.player, []));
    return t;
  };

  test("hoppas p2 över flyttar p3 i stället, och sedan p1 igen", () => {
    let s = act(start(), mv(1, 0)).state;
    expect(s.turn.actor).toBe("p2");
    s = skip(s);
    expect(s.turn.actor).toBe("p3");
    expect(phase(s)).toBe("dragon");
    s = act(s, pd(s)[0]!).state;
    expect(s.turn.actor).toBeUndefined(); // p1
  });

  test("tas p2 bort faller hens senare platser också bort, och flytten slutar när ingen är kvar", () => {
    let s = act(start(), mv(1, 0)).state;
    s = skip(s, "p2");
    expect(s.turn.actor).toBe("p3");
    const actors: string[] = ["p1"];
    while (phase(s) === "dragon") {
      actors.push(actorOf(s));
      s = act(s, pd(s)[0]!).state;
    }
    // p2:s båda platser är borta; flytten har fyra steg (p1 har redan gjort ett).
    expect(actors.slice(0, 3)).toEqual(["p1", "p3", "p1"]);
    expect(actors).not.toContain("p2");
    expect(s.turn.actor).toBeUndefined();
  });
});

describe("vad draken äter", () => {
  const ALL: ExpansionId[] = ["base", "abbot", "inns-cathedrals", "traders-builders", "mage-witch", "gold-mines", "princess-dragon"];
  // Två spelare; p1 lägger drakbrickan (3,0) och flyttar först: draken på (1,1) går norrut till (1,0).
  const start = (figs: { id: string; x: number; y: number; feature: string }[]) => {
    const s = sc({ expansions: ALL, n: 2, board: GRID, hands: [[PD("RFr.d")], []], figures: figs });
    dragonAt(s, 1, 1);
    return play(eng, s, place$(3, 0, 0), NOFIG).state;
  };

  test("stor följare, abbot och alla spelares pjäser äts på samma ruta", () => {
    const s = start([
      { id: "p2:large-meeple:0", x: 1, y: 0, feature: "road0" },
      { id: M("p1"), x: 1, y: 0, feature: "field0" },
    ]);
    const r = act(s, mv(1, 0));
    expect(inSupply(r.state, "p2:large-meeple:0")).toBe(true);
    expect(inSupply(r.state, M("p1"))).toBe(true);
    const returned = r.events.filter((e) => e.type === "figureReturned").length;
    expect(returned).toBe(2);
  });

  test("abboten på ett kloster äts", () => {
    const board: [string, number, number, Rot][] = [...GRID, ["base/L", 1, -1, 0]];
    const s = sc({ expansions: ALL, n: 2, board, hands: [[PD("RFr.d")], []], figures: [{ id: "p2:abbot:0", x: 1, y: -1, feature: "cloister" }] });
    dragonAt(s, 1, 0);
    const st = play(eng, s, place$(3, 0, 0), NOFIG).state;
    expect(moves(st)).toContain("1,-1");
    const r = act(st, mv(1, -1));
    expect(inSupply(r.state, "p2:abbot:0")).toBe(true);
  });

  test("magikern, häxan och guldtackor äts inte; draken får stå på samma ruta som magikern", () => {
    const s = start([{ id: "mage:0", x: 1, y: 0, feature: "road0" }, { id: M("p2"), x: 1, y: 0, feature: "field0" }]);
    s.figures.find((f) => f.id === "gold-bar:0")!.location = { at: "tile", pos: { x: 1, y: 0 } };
    s.figures.find((f) => f.id === "witch:0")!.location = { at: "feature", pos: { x: 1, y: 0 }, feature: "road0" };
    const r = act(s, mv(1, 0));
    expect(loc(r.state, "mage:0").at).toBe("feature");
    expect(loc(r.state, "witch:0").at).toBe("feature");
    expect(loc(r.state, "gold-bar:0").at).toBe("tile");
    expect(inSupply(r.state, M("p2"))).toBe(true);
  });

  test("byggmästare och gris äts, och de hos en spelare som mist sin sista följare på området går hem", () => {
    // p2: följare på (1,0) (äts), byggmästare på samma väg på (2,0), gris på fältet (2,0)-fältet med en annan följare? Nej:
    // gris på samma fält som följaren; fältet delas av alla rutorna i raden.
    const s = start([
      { id: M("p2"), x: 1, y: 0, feature: "road0" },
      { id: "p2:builder:0", x: 2, y: 0, feature: "road0" },
      { id: "p2:pig:0", x: 2, y: 1, feature: "field0" },
      { id: M("p2", 1), x: 1, y: 1, feature: "field0" },
    ]);
    // (1,1) är rutan där draken står; flytta p2:s fältföljare dit är fel. Lägg den på (0,1) i stället.
    s.figures.find((f) => f.id === M("p2", 1))!.location = { at: "feature", pos: { x: 0, y: 1 }, feature: "field0" };
    const r = act(s, mv(1, 0));
    expect(inSupply(r.state, M("p2"))).toBe(true);
    expect(inSupply(r.state, "p2:builder:0")).toBe(true); // vägens sista följare borta
    expect(inSupply(r.state, "p2:pig:0")).toBe(false); // fältet har kvar följare
    expect(inSupply(r.state, M("p2", 1))).toBe(false);
  });

  test("en gris går hem när den sista bonden på fältet äts", () => {
    const s = start([
      { id: M("p2"), x: 1, y: 0, feature: "field0" },
      { id: "p2:pig:0", x: 2, y: 2, feature: "field0" },
    ]);
    // field0 på RFr är fältet N och field1 S; ruta (1,0) field0 hör till raden y=0 norrut. Flytta grisen till samma fält.
    s.figures.find((f) => f.id === "p2:pig:0")!.location = { at: "feature", pos: { x: 2, y: 0 }, feature: "field0" };
    const r = act(s, mv(1, 0));
    expect(inSupply(r.state, M("p2"))).toBe(true);
    expect(inSupply(r.state, "p2:pig:0")).toBe(true);
  });
});

describe("magisk port", () => {
  // Fält av raka vägar (0,0)-(2,0) med p2:s följare på vägen. En ensam stad på (0,5) ligger för sig,
  // och en färdig stad (två lock) på (5,5)-(6,5).
  const board: [string, number, number, Rot][] = [
    ["base/RFr", 0, 0, 0], ["base/RFr", 1, 0, 0], ["base/RFr", 2, 0, 0],
    ["base/C", 0, 5, 0],
    ["base/C", 5, 5, 90], ["base/C", 6, 5, 270],
  ];
  const start = () => {
    const s = sc({ board, hands: [[PD("RRR.g")], []], figures: [{ id: M("p2"), x: 1, y: 0, feature: "road0" }] });
    return s;
  };

  test("på en portbricka kan spelaren välja porten i stället för att ställa ut en följare", () => {
    const s = play(eng, start(), place$(3, 0, 0)).state;
    expect(pd(s).map((x) => `${x.action}:${(x.data as { choice?: string }).choice}`)).toEqual(["portal:meeple"]);
    const p = play(eng, s, portal("meeple")).state;
    expect(phase(p)).toBe("portal");
    expect(eng.legalSteps(p).some((x) => x.type === "noFigure" || x.type === "placeFigure" || x.type === "confirm")).toBe(false);
  });

  test("målen: ofärdiga lediga områden var som helst, inte upptagna eller färdiga", () => {
    const s = play(eng, start(), place$(3, 0, 0), portal("meeple")).state;
    const targets = pd(s).map((x) => x.data as { pos: { x: number; y: number }; feature: string });
    expect(pd(s).every((x) => x.action === "portalPlace")).toBe(true);
    const at = (x: number, y: number, f: string) => targets.some((t) => t.pos.x === x && t.pos.y === y && t.feature === f);
    // Staden på (0,5) och dess fält är lediga; den färdiga staden (5,5)-(6,5) och p2:s väg är det inte.
    expect(at(0, 5, "city0")).toBe(true);
    expect(targets.some((t) => (t.pos.x === 5 || t.pos.x === 6) && t.pos.y === 5 && t.feature === "city0")).toBe(false);
    expect(targets.some((t) => t.pos.y === 0 && t.feature === "road0" && t.pos.x < 3)).toBe(false);
    // Ett mål per område.
    const an = eng.analyze(s);
    const ids = targets.map((t) => an.areaAt(t.pos, t.feature)!.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test("ställ en följare på det valda området; pjässteget är då klart", () => {
    const s = play(eng, start(), place$(3, 0, 0), portal("meeple"), portalAt(0, 5, "city0", "city")).state;
    expect(loc(s, M("p1"))).toEqual({ at: "feature", pos: { x: 0, y: 5 }, feature: "city0" });
    expect(phase(s)).toBe("confirm");
  });

  test("ångra går tillbaka till pjässteget", () => {
    const a = play(eng, start(), place$(3, 0, 0)).state;
    const b = play(eng, a, portal("meeple")).state;
    const u = eng.apply(b, "p1", { type: "undo" });
    expect(u.ok && JSON.stringify(u.state)).toBe(JSON.stringify(a));
  });

  test("området där draken står kan inte väljas", () => {
    const s = start();
    dragonAt(s, 0, 5);
    const p = play(eng, s, place$(3, 0, 0), portal("meeple")).state;
    expect(pd(p).some((x) => (x.data as { pos: { x: number; y: number } }).pos.y === 5 && (x.data as { pos: { x: number } }).pos.x === 0)).toBe(false);
  });

  test("ingen port på en vanlig bricka, och ingen port utan mål", () => {
    const s = sc({ board, hands: [[PD("RRR.d")], []] });
    expect(pd(play(eng, s, place$(3, 0, 0)).state).filter((x) => x.action === "portal")).toEqual([]);
    // Utan följare i förrådet erbjuds ingen port.
    const t = start();
    for (let i = 0; i < 7; i++) t.figures.find((f) => f.id === M("p1", i))!.location = { at: "feature", pos: { x: 0, y: 5 }, feature: "field0" };
    expect(pd(play(eng, t, place$(3, 0, 0)).state).filter((x) => x.action === "portal")).toEqual([]);
  });

  test("stor följare och abbot kan också skickas genom porten", () => {
    const ALL: ExpansionId[] = ["base", "abbot", "inns-cathedrals", "princess-dragon"];
    const b: [string, number, number, Rot][] = [...board, ["base/L", 8, 8, 0]];
    const s = sc({ expansions: ALL, board: b, hands: [[PD("RRR.g")], []] });
    const p = play(eng, s, place$(3, 0, 0)).state;
    expect(pd(p).map((x) => (x.data as { choice?: string }).choice).sort()).toEqual(["abbot", "large-meeple", "meeple"]);
    const q = play(eng, p, portal("abbot")).state;
    expect(pd(q).map((x) => x.data)).toEqual([{ pos: { x: 8, y: 8 }, feature: "cloister", choice: "cloister" }]);
  });
});

describe("prinsessa", () => {
  // Stadsbrickan (0,0) har stad åt öster med p2:s följare; prinsessbrickan Cc.p läggs vid (1,0).
  const start = (extra: { id: string; x: number; y: number; feature: string }[] = [], exp: ExpansionId[] = EXP) =>
    sc({
      expansions: exp, board: [["base/C", 0, 0, 90]], hands: [[PD("Cc.p")], []],
      figures: [{ id: M("p2"), x: 0, y: 0, feature: "city0" }, ...extra],
    });

  test("erbjuder att ta bort en följare i staden, i stället för att ställa ut en", () => {
    const s = play(eng, start(), place$(1, 0, 0)).state;
    expect(pd(s)).toEqual([seduce(M("p2"), 0, 0, "city0")]);
    const r = play(eng, s, seduce(M("p2"), 0, 0, "city0"));
    expect(inSupply(r.state, M("p2"))).toBe(true);
    expect(score(r.state, "p2")).toBe(0);
    expect(phase(r.state)).toBe("confirm");
    // Ingen pjäs får ställas ut efteråt.
    expect(eng.legalSteps(r.state).map((x) => x.type)).toEqual(["confirm", "undo"]);
  });

  test("valfritt: man får ställa ut en följare i stället", () => {
    const s = play(eng, start(), place$(1, 0, 0)).state;
    const r = play(eng, s, fig$("meeple", 1, 0, "field0"));
    expect(loc(r.state, M("p1"))).toEqual({ at: "feature", pos: { x: 1, y: 0 }, feature: "field0" });
    expect(inSupply(r.state, M("p2"))).toBe(false);
  });

  test("egna följare kan tas bort, och även i en stad som just blir färdig", () => {
    const s = sc({ board: [["base/C", 0, 0, 90]], hands: [[PD("Cc.p")], []], figures: [{ id: M("p1"), x: 0, y: 0, feature: "city0" }] });
    const r = play(eng, s, place$(1, 0, 0));
    // Cc.p har stad åt N och W; (0,0) stad åt öster: staden mot (0,0) är en öppen stad med två brickor.
    expect(pd(r.state).filter((x) => x.action === "seduce").length).toBe(1);
    const done = play(eng, r.state, seduce(M("p1"), 0, 0, "city0"), CONFIRM);
    expect(inSupply(done.state, M("p1"))).toBe(true);
  });

  test("ingen möjlighet om staden saknar följare eller brickan startar en ny stad", () => {
    const s1 = sc({ board: [["base/C", 0, 0, 90]], hands: [[PD("Cc.p")], []] });
    expect(pd(play(eng, s1, place$(1, 0, 0)).state).filter((x) => x.action === "seduce")).toEqual([]);
    const s2 = sc({ board: [["base/L", 0, 0, 0]], hands: [[PD("Cc.p")], []], figures: [{ id: M("p2"), x: 0, y: 0, feature: "cloister" }] });
    expect(pd(play(eng, s2, place$(1, 0, 90)).state).filter((x) => x.action === "seduce")).toEqual([]);
  });

  test("en stadsbricka utan prinsessa ger inget val", () => {
    const s = sc({ board: [["base/C", 0, 0, 90]], hands: [[PD("Cc.d")], []], figures: [{ id: M("p2"), x: 0, y: 0, feature: "city0" }] });
    expect(pd(play(eng, s, place$(1, 0, 0)).state).filter((x) => x.action === "seduce")).toEqual([]);
  });

  test("byggmästaren går hem när hens sista riddare i staden tas bort", () => {
    const exp: ExpansionId[] = ["base", "traders-builders", "princess-dragon"];
    const s = start([{ id: "p2:builder:0", x: 0, y: 0, feature: "city0" }], exp);
    const r = play(eng, s, place$(1, 0, 0), seduce(M("p2"), 0, 0, "city0"));
    expect(inSupply(r.state, M("p2"))).toBe(true);
    expect(inSupply(r.state, "p2:builder:0")).toBe(true);
  });

  test("byggmästaren stannar om hen har en annan följare kvar i staden", () => {
    const exp: ExpansionId[] = ["base", "traders-builders", "inns-cathedrals", "princess-dragon"];
    const s = start([{ id: "p2:builder:0", x: 0, y: 0, feature: "city0" }, { id: "p2:large-meeple:0", x: 0, y: 0, feature: "city0" }], exp);
    const r = play(eng, s, place$(1, 0, 0), seduce(M("p2"), 0, 0, "city0"));
    expect(inSupply(r.state, "p2:builder:0")).toBe(false);
  });

  test("ingen fe-flytt efter att en riddare tagits bort", () => {
    const s = start([{ id: M("p1"), x: 0, y: 0, feature: "field0" }]);
    const r = play(eng, s, place$(1, 0, 0), seduce(M("p2"), 0, 0, "city0"));
    expect(pd(r.state)).toEqual([]);
  });
});

describe("fen", () => {
  const start = (o: Partial<Parameters<typeof scenario>[1]> = {}) =>
    sc({
      n: 3, board: [["base/RFr", 0, 0, 0], ["base/RFr", 1, 0, 0]], hands: [["base/RFr"], ["base/RFr"], ["base/RFr"]],
      figures: [{ id: M("p1"), x: 0, y: 0, feature: "road0" }, { id: M("p2"), x: 1, y: 0, feature: "field0" }],
      ...o,
    });

  test("kan flyttas intill en egen följare i stället för att ställa ut en; bara egna följare", () => {
    const s = play(eng, start(), place$(2, 0, 0)).state;
    expect(pd(s)).toEqual([fairyTo(M("p1"), 0, 0, "road0")]);
    const r = play(eng, s, fairyTo(M("p1"), 0, 0, "road0"));
    expect(loc(r.state, "fairy:0")).toEqual({ at: "figure", figure: M("p1") });
    expect(phase(r.state)).toBe("confirm");
    expect(eng.legalSteps(r.state).some((x) => x.type === "placeFigure" || x.type === "noFigure")).toBe(false);
  });

  test("redan på en bricka kan fen bara flyttas till en annan bricka", () => {
    const s = start({ figures: [{ id: M("p1"), x: 0, y: 0, feature: "road0" }, { id: M("p1", 1), x: 1, y: 0, feature: "field0" }] });
    fairyAt(s, M("p1"));
    const r = play(eng, s, place$(2, 0, 0));
    expect(pd(r.state)).toEqual([fairyTo(M("p1", 1), 1, 0, "field0")]);
  });

  test("ingen fe-flytt utan egen följare på kartan", () => {
    const s = start({ figures: [{ id: M("p2"), x: 1, y: 0, feature: "field0" }] });
    expect(pd(play(eng, s, place$(2, 0, 0)).state)).toEqual([]);
  });

  test("1 poäng i början av ägarens tur", () => {
    const s = start();
    fairyAt(s, M("p2"));
    const r = play(eng, s, place$(2, 0, 0), NOFIG, CONFIRM);
    expect(r.state.turn.player).toBe("p2");
    expect(score(r.state, "p2")).toBe(1);
    expect(reasons(r.events)).toEqual(["p2:fairy.turn:1"]);
  });

  test("ingen poäng om fen står intill någon annans följare, eller om följaren gått hem", () => {
    const s = start();
    fairyAt(s, M("p1"));
    const r = play(eng, s, place$(2, 0, 0), NOFIG, CONFIRM);
    expect(reasons(r.events)).toEqual([]);
    const t = start();
    fairyOnTile(t, 1, 0);
    expect(reasons(play(eng, t, place$(2, 0, 0), NOFIG, CONFIRM).events)).toEqual([]);
  });

  test("byggmästarens extra tur: fen ger bara poäng i början av första turen", () => {
    const exp: ExpansionId[] = ["base", "traders-builders", "princess-dragon"];
    const s = start({
      expansions: exp,
      figures: [{ id: M("p1"), x: 0, y: 0, feature: "road0" }, { id: "p1:builder:0", x: 0, y: 0, feature: "road0" }],
      hands: [["base/RFr"], ["base/RFr"], ["base/RFr"]], pile: ["base/RFr", "base/RFr", "base/RFr", "base/RFr"],
    });
    fairyAt(s, M("p1"));
    s.players[0]!.hand = ["base/RFr"];
    // p1:s tur: tegelbyggnad på vägen med byggmästaren (vägen är (0,0)-(1,0); lägg vid (-1,0)).
    const r = play(eng, s, place$(-1, 0, 0), NOFIG, CONFIRM);
    expect(r.state.turn.player).toBe("p1");
    expect(reasons(r.events)).toEqual([]);
    expect(score(r.state, "p1")).toBe(0);
  });

  test("3 poäng när området räknas, oavsett majoritet; följaren går hem och fen blir kvar", () => {
    // Stad: (0,0) stad åt öster [p3], den nya brickan (1,0) igenom, (2,0) igenom [p2], (3,0) lock [p2] -> p2 har majoritet.
    const s = sc({
      n: 3,
      board: [["base/C", 0, 0, 90], ["base/CFc.1", 2, 0, 0], ["base/C", 3, 0, 270]],
      hands: [["base/CFc.1"], [], []],
      figures: [
        { id: M("p3"), x: 0, y: 0, feature: "city0" },
        { id: M("p2"), x: 2, y: 0, feature: "city0" },
        { id: M("p2", 1), x: 3, y: 0, feature: "city0" },
      ],
    });
    fairyAt(s, M("p3"));
    const r = play(eng, s, place$(1, 0, 0), NOFIG, CONFIRM);
    // 4 brickor x 2 = 8 till p2; p3 får fens 3.
    expect(reasons(r.events).sort()).toEqual(["p2:city:8", "p3:fairy.feature:3"]);
    expect(score(r.state, "p3")).toBe(3);
    expect(inSupply(r.state, M("p3"))).toBe(true);
    expect(loc(r.state, "fairy:0")).toEqual({ at: "tile", pos: { x: 0, y: 0 } });
  });

  test("3 poäng också för ett område utan poäng i övrigt, och bara om fen står intill en följare i området", () => {
    const s = sc({
      n: 3,
      board: [["base/C", 0, 0, 90], ["base/C", 2, 0, 270]],
      hands: [["base/CFc.1"], [], []],
      figures: [{ id: M("p2"), x: 0, y: 0, feature: "city0" }],
    });
    fairyOnTile(s, 2, 0); // inte intill en följare
    const r = play(eng, s, place$(1, 0, 0), NOFIG, CONFIRM);
    expect(reasons(r.events)).toEqual(["p2:city:6"]);
  });

  test("3 poäng vid slutpoängen för ett ofärdigt område", () => {
    const s = sc({ n: 2, board: [["base/C", 0, 0, 90]], hands: [["base/RFr"], []], pile: [], figures: [{ id: M("p2"), x: 0, y: 0, feature: "city0" }] });
    fairyAt(s, M("p2"));
    const r = play(eng, s, place$(0, 1, 0), NOFIG, CONFIRM);
    expect(r.state.finished).toBe(true);
    expect(reasons(r.events).sort()).toEqual(["p2:fairy.feature:3", "p2:final.city:1"]);
    expect(score(r.state, "p2")).toBe(4);
  });
});

describe("byggmästarens dubbeltur med dragbrickor", () => {
  test("draken flyttar i båda turerna; fen ger bara poäng i början av första turen", () => {
    const exp: ExpansionId[] = ["base", "traders-builders", "princess-dragon"];
    const board: [string, number, number, Rot][] = [["base/RFr", 0, 0, 0], ["base/RFr", 1, 0, 0]];
    for (let x = 0; x < 12; x++) board.push(["base/RFr", x, 5, 0]);
    const s = sc({
      expansions: exp, n: 2, board, hands: [[PD("RFr.d")], ["base/RFr"]],
      pile: [PD("RFr.d"), "base/RFr", "base/RFr", "base/RFr"],
      figures: [{ id: M("p1"), x: 1, y: 0, feature: "road0" }, { id: "p1:builder:0", x: 1, y: 0, feature: "road0" }],
    });
    dragonAt(s, 0, 5);
    fairyAt(s, M("p1"));
    // Första turen: bygger vidare på byggmästarens väg med en dragbricka.
    let r = play(eng, s, place$(2, 0, 0), NOFIG);
    expect(phase(r.state)).toBe("dragon");
    r = finishDragon(r.state);
    expect(loc(r.state, "dragon:0")).toEqual({ at: "tile", pos: { x: 6, y: 5 } });
    r = play(eng, r.state, CONFIRM);
    // Extra tur för p1: ingen fepoäng, och ny dragbricka ger en ny flytt.
    expect(r.state.turn.player).toBe("p1");
    expect(reasons(r.events)).toEqual([]);
    expect(r.state.players[0]!.hand).toEqual([PD("RFr.d")]);
    r = play(eng, r.state, place$(3, 0, 0), NOFIG);
    expect(phase(r.state)).toBe("dragon");
    r = finishDragon(r.state);
    expect(loc(r.state, "dragon:0")).toEqual({ at: "tile", pos: { x: 11, y: 5 } });
    r = play(eng, r.state, CONFIRM);
    // Ingen kedja: p2 har turen, p1 får inte heller fepoäng nu.
    expect(r.state.turn.player).toBe("p2");
    expect(reasons(r.events)).toEqual([]);
    // När p2 är klar börjar p1 om: 1 poäng.
    const next = play(eng, r.state, place$(0, 1, 0), NOFIG, CONFIRM);
    expect(next.state.turn.player).toBe("p1");
    expect(reasons(next.events)).toEqual(["p1:fairy.turn:1"]);
  });
});

describe("samspel med färjorna", () => {
  test("efter drakens flytt kommer färjefasen innan bekräfta", () => {
    const LAKE = "ferries/RRR";
    const CAP = "base/LR";
    const s = sc({
      expansions: ["base", "ferries", "princess-dragon"],
      board: [[CAP, 0, 0, 270], [LAKE, 1, 0, 0], [CAP, 1, 1, 180], ["base/RFr", 2, 0, 0], ["base/RFr", 2, 1, 0], ["base/RFr", 2, -1, 0]],
      hands: [[PD("RFr.d")], []],
    });
    s.figures.find((f) => f.id === "ferry:0")!.location = { at: "feature", pos: { x: 1, y: 0 }, feature: "E-S" };
    dragonAt(s, 2, 1);
    let st = play(eng, s, place$(3, 0, 0), NOFIG).state;
    expect(phase(st)).toBe("dragon");
    st = finishDragon(st).state;
    expect(phase(st)).toBe("ferries-move");
  });
});

describe("slumpade partier", () => {
  const GAMES = Number(process.env.PD_GAMES ?? 40);
  const ALL: ExpansionId[] = [
    "base", "river", "abbot", "inns-cathedrals", "traders-builders", "gold-mines", "mage-witch", "princess-dragon", "ferries", "flying-machines", "crop-circles-2",
  ];

  function run(expansions: ExpansionId[], label: string, handSizes = [1, 3]) {
    let dragonMoves = 0;
    let eaten = 0;
    let fairyScores = 0;
    let seduced = 0;
    let fairyMoves = 0;
    for (let i = 0; i < GAMES; i++) {
      const setup = setupOf(expansions, {
        n: 1 + (i % 6), seed: 9100 + i, handSize: handSizes[i % handSizes.length]!,
        variants: { "princess-dragon.dragonTiming": i % 2 ? "after" : "before", "river.startTile": "shuffle" },
      });
      const strategy: Strategy = i % 3 === 0 ? "random" : "eager";
      try {
        const r = playGame(eng, setup, { strategy });
        expect(r.state.finished).toBe(true);
        for (const e of r.events) {
          if (e.type === "expansion" && e.expansion === "princess-dragon") {
            if (e.event === "move") dragonMoves++;
            if (e.event === "eat") eaten++;
            if (e.event === "seduce") seduced++;
          }
          if (e.type === "scored" && e.reason.startsWith("fairy")) fairyScores++;
          if (e.type === "figurePlaced" && e.figure.startsWith("fairy")) fairyMoves++;
        }
      } catch (err) {
        throw new Error(`${label}: parti ${i} (frö ${9100 + i}): ${(err as Error).message}`);
      }
    }
    return { dragonMoves, eaten, fairyScores, seduced, fairyMoves };
  }

  test("grundspelet med bara The Princess & the Dragon (handstorlek 1 och 3, båda tidpunkterna)", () => {
    const r = run(["base", "princess-dragon"], "ensam");
    expect(r.dragonMoves).toBeGreaterThan(0);
    expect(r.eaten).toBeGreaterThan(0);
  }, 900_000);

  test("med alla färdiga expansioner", () => {
    const r = run(ALL, "alla");
    expect(r.dragonMoves).toBeGreaterThan(0);
  }, 1_800_000);
});

describe("datorspelaren", () => {
  test("datorstyrda spelare flyttar draken, använder porten och spelar färdigt; varje drag går snabbt", () => {
    let slowest = 0;
    let moves = 0;
    for (let i = 0; i < 4; i++) {
      const setup = setupOf(["base", "princess-dragon"], {
        n: 2 + (i % 3), seed: 4400 + i, handSize: i === 3 ? 3 : 1,
        variants: { "princess-dragon.dragonTiming": i % 2 ? "after" : "before" },
      });
      const rnd = makeRng(i + 5);
      let s = eng.newGame(setup);
      for (let guard = 0; !s.finished; guard++) {
        if (guard > 20000) throw new Error("spelet tar aldrig slut");
        const t0 = performance.now();
        const step = chooseBotStep(eng, s, rnd);
        slowest = Math.max(slowest, performance.now() - t0);
        const r = eng.apply(s, actorOf(s), step);
        if (!r.ok) throw new Error(`nekat steg ${JSON.stringify(step)}: ${r.error}`);
        moves += r.events.filter((e) => e.type === "expansion" && e.event === "move").length;
        s = r.state;
      }
    }
    console.log(`botdrag med draken: ${moves}, längsta betänketid ${slowest.toFixed(0)} ms`);
    expect(moves).toBeGreaterThan(0);
    expect(slowest).toBeLessThan(2000);
  }, 600_000);
});
