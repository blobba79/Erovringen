import { describe, expect, test } from "bun:test";
import { analyze } from "../../src/engine/index";
import { tileTypes } from "../../src/screen/data";
import { actorOf, figureSpots } from "../../src/screen/logic";
import { DICE_MS, diceAlpha, ferryLines, nextDice } from "../../src/screen/marks";
import { initialModel, reduce, type Model } from "../../src/screen/store";
import { registerClientModules } from "../../src/screen/modules";
import { drawMap } from "../../src/screen/render";
import { cellshadedStyle } from "../../src/styles/cellshaded/index";
import { devEngine, devSetup, toPublic } from "../../src/screen/dev/game";
import type { Figure, GameEvent, PlacedTile } from "../../src/shared/state";

const CAP = "base/LR"; // kloster med en väg åt S (rot 0), W (90), N (180), E (270)
const LAKE = "ferries/RRR"; // vägar vid E, S och W
const tile = (type: string, x: number, y: number, rotation: 0 | 90 | 180 | 270): PlacedTile => ({ type, pos: { x, y }, rotation });
const ferry = (feature: string, x = 1, y = 0): Figure => ({ id: "ferry:0", kind: "ferry", owner: null, location: { at: "feature", pos: { x, y }, feature } });
const board = (): Record<string, PlacedTile> => ({
  "0,0": tile(CAP, 0, 0, 270), "1,0": tile(LAKE, 1, 0, 0), "2,0": tile(CAP, 2, 0, 90),
});

describe("områdesanalys på klienten", () => {
  test("klientens analyze slår ihop vägar över en färja", () => {
    registerClientModules(); // gör data.ts redan, men är ofarlig att upprepa
    const b = board();
    const without = analyze(b, [], tileTypes).areaAt({ x: 0, y: 0 }, "road0")!;
    expect(without.tiles.length).toBe(2); // klostret och sjöbrickan, inte kloster nr 2
    const linked = analyze(b, [ferry("E-W")], tileTypes).areaAt({ x: 0, y: 0 }, "road0")!;
    expect(linked.tiles.length).toBe(3);
  });
});

describe("färjan på kartan", () => {
  test("ferryLines ger kanternas mittpunkter och hoppar över trasiga nycklar och andra pjäser", () => {
    const meeple: Figure = { id: "m", kind: "meeple", owner: "p1", location: { at: "feature", pos: { x: 0, y: 0 }, feature: "road0" } };
    const lines = ferryLines([ferry("E-S", 3, 2), ferry("X-Y"), ferry("N-N"), meeple]);
    expect(lines).toEqual([{ id: "ferry:0", a: { x: 3.5, y: 2 }, b: { x: 3, y: 2.5 } }]);
  });

  test("storskärmen ritar färjan över sjön och ritar ingen vanlig pjäs för den", () => {
    const eng = devEngine();
    const state = toPublic(eng.newGame(devSetup(2, 1)));
    const m = { ...state, board: board(), figures: [ferry("E-W")] };
    const calls: string[] = [];
    const ctx = new Proxy({}, { get: (_t, k) => (k === "canvas" ? undefined : (..._a: unknown[]) => { calls.push(String(k)); }), set: () => true }) as unknown as CanvasRenderingContext2D;
    (globalThis as { document?: unknown }).document ??= { createElement: () => ({ width: 0, height: 0, getContext: () => ctx }) };
    let figureCalls = 0;
    const style = { ...cellshadedStyle, drawFigure: () => { figureCalls++; } };
    drawMap(ctx, { width: 800, height: 600 }, 1, { x: 1, y: 0, zoom: 8, rotation: 0 }, style, tileTypes, { state: m, areaShapes: [], previewSpots: [] });
    expect(calls.filter((c) => c === "quadraticCurveTo").length).toBeGreaterThan(0); // båtens för
    expect(figureCalls).toBe(0);
  });

  test("figureSpots-listan för vanliga pjäser innehåller inte färjan efter filtrering", () => {
    const spots = figureSpots([ferry("E-W")].filter((f) => f.kind !== "ferry"), tileTypes, board());
    expect(spots).toEqual([]);
  });
});

const diceEvent = (roll = 2, options = 1): GameEvent => ({
  type: "expansion", expansion: "flying-machines", event: "dice",
  data: { player: "p1", roll, from: { x: 0, y: 0 }, to: { x: 2, y: -2 }, direction: "NE", kind: "meeple", options },
});

describe("flygmaskinens tärning", () => {
  test("visas en gång per tur även om händelsen skickas igen vid bekräftelse", () => {
    let m: Model = initialModel;
    m = reduce(m, { type: "events", events: [diceEvent()] });
    expect(m.dice?.seq).toBe(1);
    expect(m.dice?.data.roll).toBe(2);
    expect(m.dice?.data.direction).toBe("NE");
    // samma händelse igen tillsammans med turbytet: ingen ny visning
    m = reduce(m, { type: "events", events: [diceEvent(), { type: "turnStarted", player: "p2" } as GameEvent] });
    expect(m.dice?.seq).toBe(1);
    // nästa tur med ny tärning visas
    m = reduce(m, { type: "events", events: [diceEvent(3)] });
    expect(m.dice?.seq).toBe(2);
    expect(m.dice?.data.roll).toBe(3);
  });

  test("en tur utan tärning nollställer, så att en identisk tärning senare visas igen", () => {
    expect(nextDice([diceEvent()], undefined, 0).dice?.seq).toBe(1);
    const a = nextDice([diceEvent()], undefined, 0);
    expect(nextDice([diceEvent()], a.last, 1).dice).toBeUndefined();
    const reset = nextDice([{ type: "turnStarted", player: "p2" } as GameEvent], a.last, 1);
    expect(reset.last).toBeUndefined();
    expect(nextDice([diceEvent()], reset.last, 1).dice?.seq).toBe(2);
  });

  test("options 0 ger texten 'går hem' via data, och synligheten tonar in och ut", () => {
    const m = reduce(initialModel, { type: "events", events: [diceEvent(1, 0)] });
    expect(m.dice?.data.options).toBe(0);
    expect(diceAlpha(0)).toBe(0);
    expect(diceAlpha(1000)).toBe(1);
    expect(diceAlpha(DICE_MS - 100)).toBeGreaterThan(0);
    expect(diceAlpha(DICE_MS - 100)).toBeLessThan(1);
    expect(diceAlpha(DICE_MS)).toBe(0);
  });
});

describe("storskärmen vid turn.actor", () => {
  test("actorOf ger spelaren som väljer, annars inget", () => {
    const s = toPublic(devEngine().newGame(devSetup(3, 2)));
    expect(actorOf(s)).toBeUndefined();
    const p2 = s.players.find((p) => p.id !== s.turn.player)!;
    expect(actorOf({ ...s, turn: { ...s.turn, actor: p2.id } })?.name).toBe(p2.name);
    expect(actorOf({ ...s, turn: { ...s.turn, actor: s.turn.player } })).toBeUndefined();
  });
});
