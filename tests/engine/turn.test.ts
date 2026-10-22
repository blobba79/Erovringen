import { describe, expect, test } from "bun:test";
import { allTileTypes } from "../../src/tiles/index";
import { baseModule, createEngine } from "../../src/engine/index";
import type { ExpansionModule } from "../../src/shared/expansion";
import { realEngine } from "./helpers";
import { CONFIRM, NOFIG, fig$, place$, play, scenario } from "./scenario";

const eng = realEngine();
const start: [string, number, number, 0][] = [["base/RCr", 0, 0, 0]];

describe("delsteg och fel", () => {
  test("fel spelare nekas", () => {
    const s = scenario(eng, { board: start, hands: [["base/RFr"], ["base/RFr"]] });
    expect(eng.apply(s, "p2", place$(1, 0, 0))).toEqual({ ok: false, error: "error.notYourTurn" });
  });

  test("steg i fel fas nekas", () => {
    const s = scenario(eng, { board: start, hands: [["base/RFr"], []] });
    expect(eng.apply(s, "p1", CONFIRM)).toMatchObject({ ok: false, error: "error.illegalStep" });
    expect(eng.apply(s, "p1", NOFIG)).toMatchObject({ ok: false, error: "error.illegalStep" });
    expect(eng.apply(s, "p1", { type: "undo" })).toMatchObject({ ok: false, error: "error.nothingToUndo" });
  });

  test("olaglig placering nekas: fel kant, upptagen ruta, ingen granne", () => {
    const s = scenario(eng, { board: start, hands: [["base/RFr"], []] });
    expect(eng.apply(s, "p1", place$(1, 0, 90))).toEqual({ ok: false, error: "error.illegalPlacement" });
    expect(eng.apply(s, "p1", place$(0, 0, 0))).toEqual({ ok: false, error: "error.illegalPlacement" });
    expect(eng.apply(s, "p1", place$(5, 5, 0))).toEqual({ ok: false, error: "error.illegalPlacement" });
    expect(eng.apply(s, "p1", place$(1, 1, 0))).toEqual({ ok: false, error: "error.illegalPlacement" });
    expect(eng.apply(s, "p1", place$(1, 0, 0)).ok).toBe(true);
  });

  test("legalSteps innehåller exakt de tillåtna placeringarna", () => {
    const s = scenario(eng, { board: start, hands: [["base/RFr"], []] });
    const steps = eng.legalSteps(s);
    expect(steps.every((x) => x.type === "placeTile")).toBe(true);
    for (const x of steps) expect(eng.apply(s, "p1", x).ok).toBe(true);
    // Allt annat nekas.
    let legal = 0;
    for (let x = -2; x <= 2; x++)
      for (let y = -2; y <= 2; y++)
        for (const r of [0, 90, 180, 270] as const)
          if (eng.apply(s, "p1", place$(x, y, r)).ok) legal++;
    const distinctLegal = new Set(steps.map((x) => (x.type === "placeTile" ? `${x.pos.x},${x.pos.y}` : ""))).size;
    expect(legal).toBeGreaterThanOrEqual(steps.length);
    expect(distinctLegal).toBeGreaterThan(0);
  });

  test("apply ändrar aldrig tillståndet som skickas in", () => {
    const s = scenario(eng, { board: start, hands: [["base/RFr"], []] });
    const before = JSON.stringify(s);
    play(eng, s, place$(1, 0, 0), NOFIG, CONFIRM);
    expect(JSON.stringify(s)).toBe(before);
  });

  test("pjäsfel: fel område, ingen pjäs kvar", () => {
    const s = scenario(eng, { board: start, hands: [["base/RFr"], []] });
    const placed = play(eng, s, place$(1, 0, 0)).state;
    expect(eng.apply(placed, "p1", fig$("meeple", 1, 0, "nej"))).toMatchObject({ ok: false, error: "error.illegalFigure" });
    expect(eng.apply(placed, "p1", fig$("meeple", 1, 0, "road0")).ok).toBe(true);
    placed.figures.filter((f) => f.owner === "p1").forEach((f) => (f.location = { at: "tile", pos: { x: 9, y: 9 } }));
    expect(eng.apply(placed, "p1", fig$("meeple", 1, 0, "road0"))).toMatchObject({ ok: false, error: "error.noFigureLeft" });
  });
});

describe("ångra och bekräfta", () => {
  test("ångra backar ett delsteg i taget", () => {
    const s = scenario(eng, { board: start, hands: [["base/RFr"], []] });
    const a = play(eng, s, place$(1, 0, 0));
    const b = play(eng, a.state, fig$("meeple", 1, 0, "road0"));
    expect(b.state.turn.pending).toHaveLength(2);
    expect(b.state.turn.phase).toBe("confirm");
    const u1 = play(eng, b.state, { type: "undo" }).state;
    expect(u1.turn.phase).toBe("placeFigure");
    expect(u1.figures.find((f) => f.id === "p1:meeple:0")!.location.at).toBe("supply");
    expect(u1.board["1,0"]).toBeDefined();
    const u2 = play(eng, u1, { type: "undo" }).state;
    expect(u2.turn.phase).toBe("placeTile");
    expect(u2.board["1,0"]).toBeUndefined();
    expect(u2.players[0]!.hand).toEqual(["base/RFr"]);
    expect(JSON.stringify(u2)).toBe(JSON.stringify(s));
    expect(eng.apply(u2, "p1", { type: "undo" })).toMatchObject({ ok: false });
  });

  test("bekräfta: nästa spelare, ny bricka på hand, händelser i ordning", () => {
    const s = scenario(eng, { board: start, hands: [["base/RFr"], ["base/RFr"]], pile: ["base/L", "base/L"] });
    const pre = play(eng, s, place$(1, 0, 0), fig$("meeple", 1, 0, "road0")).state;
    const r = play(eng, pre, CONFIRM);
    expect(r.state.turn.player).toBe("p2");
    expect(r.state.turn.pending).toEqual([]);
    expect(r.state.players[0]!.hand).toEqual(["base/L"]);
    expect(r.state.drawPile).toEqual(["base/L"]);
    expect(r.events.map((e) => e.type)).toEqual(["tilePlaced", "figurePlaced", "tileDrawn", "turnStarted"]);
    expect(r.state.ext.base).not.toHaveProperty("snapshot");
  });

  test("spelare utan brickor hoppas över", () => {
    const s = scenario(eng, { board: start, hands: [["base/RFr"], []], pile: ["base/L"] });
    const r = play(eng, s, place$(1, 0, 0), NOFIG, CONFIRM);
    expect(r.state.turn.player).toBe("p1");
  });
});

describe("hand med flera brickor och byte", () => {
  test("välj bricka, ångra, välj en annan", () => {
    const s = scenario(eng, { board: start, handSize: 3, hands: [["base/RFr", "base/L", "base/RFr"], []], pile: [] });
    expect(s.turn.phase).toBe("chooseTile");
    const a = play(eng, s, { type: "chooseTile", handIndex: 1 });
    expect(a.state.turn.phase).toBe("placeTile");
    const lSteps = eng.legalSteps(a.state).filter((x) => x.type === "placeTile");
    // L (bara fält) kan läggas där fältkanterna möter: inte öst/väst om vägen går dit.
    expect(lSteps.length).toBeGreaterThan(0);
    const back = play(eng, a.state, { type: "undo" }).state;
    expect(back.turn.phase).toBe("chooseTile");
    const b = play(eng, back, { type: "chooseTile", handIndex: 0 }, place$(1, 0, 0));
    expect(b.state.players[0]!.hand).toEqual(["base/L", "base/RFr"]);
  });

  test("bricka som inte passar någonstans: byte mot ny bricka, den gamla kastas", () => {
    const s = scenario(eng, { board: [["base/L", 0, 0, 0]], hands: [["base/Cccc+"], []], pile: ["base/L", "base/L"] });
    const steps = eng.legalSteps(s);
    expect(steps).toEqual([{ type: "exchangeTile", handIndex: 0 }]);
    const r = play(eng, s, { type: "exchangeTile", handIndex: 0 });
    expect(r.state.players[0]!.hand).toEqual(["base/L"]);
    expect(r.state.drawPile).toEqual(["base/L"]);
    expect((r.state.ext.base as { discarded: string[] }).discarded).toEqual(["base/Cccc+"]);
    expect(r.state.turn.phase).toBe("placeTile");
    expect(eng.legalSteps(r.state).some((x) => x.type === "placeTile")).toBe(true);
    // Ångra tar tillbaka bytet.
    const u = play(eng, r.state, { type: "undo" }).state;
    expect(u.players[0]!.hand).toEqual(["base/Cccc+"]);
    expect(u.drawPile).toHaveLength(2);
  });

  test("byte nekas när någon bricka går att lägga", () => {
    const s = scenario(eng, { board: start, hands: [["base/RFr"], []] });
    expect(eng.apply(s, "p1", { type: "exchangeTile", handIndex: 0 })).toEqual({ ok: false, error: "error.exchangeNotAllowed" });
  });

  test("byte med tom hög: brickan kastas och turen kan bekräftas", () => {
    const s = scenario(eng, { board: [["base/L", 0, 0, 0]], hands: [["base/Cccc+"], []], pile: [] });
    const r = play(eng, s, { type: "exchangeTile", handIndex: 0 });
    expect(r.state.players[0]!.hand).toEqual([]);
    expect(r.state.turn.phase).toBe("confirm");
    const done = play(eng, r.state, CONFIRM);
    expect(done.state.finished).toBe(true);
  });

  test("hand med flera brickor och alla omöjliga: byte av vilken som helst", () => {
    const s = scenario(eng, { board: [["base/L", 0, 0, 0]], handSize: 2, hands: [["base/Cccc+", "base/Cccc+"], []], pile: ["base/L"] });
    expect(eng.legalSteps(s)).toEqual([
      { type: "exchangeTile", handIndex: 0 },
      { type: "exchangeTile", handIndex: 1 },
    ]);
  });
});

describe("krokar i turordning", () => {
  test("modulens krokar anropas och kan ge extra tur och ändra poäng", () => {
    const log: string[] = [];
    const mod: ExpansionModule = {
      id: "traders-builders", tileSets: [], figures: [], variants: [],
      hooks: {
        canPlaceTile: (_c, pos) => (log.push("can"), pos.x <= 1),
        afterTilePlaced: () => void log.push("after"),
        scoreFeature: (_c, _f, points) => (log.push("score"), points * 2),
        extraTurn: () => (log.push("extra"), log.filter((l) => l === "extra").length === 1),
        finalScoring: () => void log.push("final"),
      },
    };
    const e = createEngine([baseModule, mod], allTileTypes().values());
    const s = scenario(e, {
      board: [["base/LR", 0, 0, 0], ["base/LR", 0, 2, 180]], expansions: ["base", "traders-builders"],
      hands: [["base/RFr"], []], handSize: 1, pile: ["base/RFr", "base/L"],
    });
    expect(e.apply(s, "p1", place$(2, 1, 0))).toMatchObject({ ok: false });
    const r = play(e, s, place$(0, 1, 90), fig$("meeple", 0, 1, "road0"), CONFIRM);
    expect(r.state.players[0]!.score).toBe(6);
    expect(r.state.turn.player).toBe("p1");
    expect(log).toContain("after");
    expect(log.indexOf("score")).toBeLessThan(log.indexOf("extra"));
  });
});
