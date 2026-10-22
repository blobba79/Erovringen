import { describe, expect, test } from "bun:test";
import type { PublicState } from "../../src/shared/messages";
import type { Rotation } from "../../src/shared/tiles";
import { allTileTypes } from "../../src/tiles/index";
import { computeGeometry } from "../../src/geometry/index";
import {
  initialRotation, nextRotation, placementsOf, rotationsAt, rotationsForEdge, sideOf, spotsFor, type Placement,
} from "../../src/phone/logic/spots";
import { GestureTracker } from "../../src/phone/logic/gestures";
import { featureAtPoint } from "../../src/phone/logic/hit";
import { deriveTurn, figureSupply } from "../../src/phone/logic/turnview";
import { loadSeat, pickLang, planStart, saveSeat, type StorageLike } from "../../src/phone/logic/session";

type Board = PublicState["board"];
const tile = (x: number, y: number) => ({ type: "base/RCr", pos: { x, y }, rotation: 0 as Rotation });
const boardOf = (...ps: [number, number][]): Board =>
  Object.fromEntries(ps.map(([x, y]) => [`${x},${y}`, tile(x, y)])) as Board;
const pl = (x: number, y: number, rotation: Rotation): Placement => ({ pos: { x, y }, rotation });

describe("platser och numrering", () => {
  // En bricka på (0,0). Fria rutor runtom.
  const board = boardOf([0, 0]);
  const placements: Placement[] = [
    pl(0, -1, 0), pl(0, -1, 180), // norr om: bara rotation 180 har kanten mot söder
    pl(1, 0, 90), pl(1, 0, 270),  // öster om: sidan 3 (väst) mot brickan
    pl(0, 1, 0), pl(0, 1, 90),    // söder om: sidan 0 (norr) mot brickan
    pl(-1, 0, 90), pl(-1, 0, 270),
  ];

  test("sidan en kant hamnar på", () => {
    expect(sideOf(0, 0)).toBe(0);
    expect(sideOf(0, 90)).toBe(1);
    expect(sideOf(3, 180)).toBe(1);
    expect(sideOf(2, 270)).toBe(1);
  });

  test("alla platser: fast ordning uppifrån och ner, vänster till höger", () => {
    const spots = spotsFor(placements, board, "all");
    expect(spots).toEqual([{ x: 0, y: -1 }, { x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]);
  });

  test("en kant: bara platser där kanten kan ligga mot en bricka", () => {
    // Kant N (0) hamnar på sida (0 + r/90): alla fyra rutorna har en rotation som vänder N mot brickan.
    expect(spotsFor(placements, board, 0)).toEqual([{ x: 0, y: -1 }, { x: -1, y: 0 }, { x: 1, y: 0 }, { x: 0, y: 1 }]);
    // Kant E (1): ingen av de tillåtna rotationerna vänder E mot brickan.
    expect(spotsFor(placements, board, 1)).toEqual([]);
    // Kant S (2): (0,1) saknar en rotation som vänder S uppåt.
    expect(spotsFor(placements, board, 2)).toEqual([{ x: 0, y: -1 }, { x: -1, y: 0 }, { x: 1, y: 0 }]);
  });

  test("kant E: rotation 90 lägger kanten mot söder", () => {
    const p = [pl(0, -1, 90), pl(0, -1, 0)];
    expect(spotsFor(p, board, 1)).toEqual([{ x: 0, y: -1 }]);
    expect(rotationsForEdge(p, board, { x: 0, y: -1 }, 1)).toEqual([90]);
    expect(initialRotation(p, board, { x: 0, y: -1 }, 1)).toBe(90);
    expect(initialRotation(p, board, { x: 0, y: -1 }, "all")).toBe(0);
  });

  test("numreringen ändras inte av vilken ordning stegen kommer i", () => {
    const shuffled = [...placements].reverse();
    expect(spotsFor(shuffled, board, "all")).toEqual(spotsFor(placements, board, "all"));
  });

  test("flera rutor på samma rad: vänster till höger", () => {
    const b = boardOf([0, 0], [1, 0]);
    const p = [pl(2, 0, 270), pl(-1, 0, 90), pl(0, -1, 180), pl(1, -1, 180)];
    expect(spotsFor(p, b, "all")).toEqual([{ x: 0, y: -1 }, { x: 1, y: -1 }, { x: -1, y: 0 }, { x: 2, y: 0 }]);
  });

  test("rotera växlar bara mellan tillåtna rotationer", () => {
    const p = [pl(0, 1, 270), pl(0, 1, 0), pl(0, 1, 180), pl(2, 2, 90)];
    const r = rotationsAt(p, { x: 0, y: 1 });
    expect(r).toEqual([0, 180, 270]);
    expect(nextRotation(r, 0)).toBe(180);
    expect(nextRotation(r, 180)).toBe(270);
    expect(nextRotation(r, 270)).toBe(0);
    expect(nextRotation([], 0)).toBeNull();
    expect(nextRotation([90], 90)).toBe(90);
  });

  test("placementsOf plockar bara placeTile", () => {
    expect(placementsOf([{ type: "noFigure" }, { type: "placeTile", pos: { x: 1, y: 2 }, rotation: 90 }, { type: "undo" }])).toEqual([pl(1, 2, 90)]);
  });
});

describe("gester blir kartstyrning", () => {
  const W = 400;

  test("ett finger panorerar som andel av plattans bredd", () => {
    const g = new GestureTracker(W, 0);
    g.down(1, 100, 100, 0);
    const out = g.move(1, 140, 120, 10);
    expect(out).toEqual([{ type: "pan", dx: 0.1, dy: 0.05 }]);
  });

  test("takten begränsas och rörelsen samlas", () => {
    const g = new GestureTracker(W, 50);
    g.down(1, 0, 0, 0);
    expect(g.move(1, 20, 0, 60)).toEqual([{ type: "pan", dx: 0.05, dy: 0 }]);
    expect(g.move(1, 40, 0, 70)).toEqual([]);
    expect(g.move(1, 60, 0, 80)).toEqual([]);
    const rest = g.up(1, 90);
    expect(rest).toEqual([{ type: "pan", dx: 0.1, dy: 0 }]);
  });

  test("nyp isär zoomar in, nyp ihop zoomar ut", () => {
    const g = new GestureTracker(W, 0);
    g.down(1, 150, 100, 0);
    g.down(2, 250, 100, 0);
    const out = g.move(2, 350, 100, 10);
    const zoom = out.find((o) => o.type === "zoom");
    expect(zoom && zoom.type === "zoom" && zoom.factor).toBeCloseTo(2, 5);
    const inn = g.move(2, 250, 100, 20).find((o) => o.type === "zoom");
    expect(inn && inn.type === "zoom" && inn.factor).toBeCloseTo(0.5, 5);
  });

  test("vridning medurs ger positiva grader", () => {
    const g = new GestureTracker(W, 0);
    g.down(1, 100, 100, 0);
    g.down(2, 200, 100, 0);
    // Det högra fingret flyttas nedåt: linjen vrids medurs på skärmen (y nedåt).
    const out = g.move(2, 200, 200, 10);
    const rot = out.find((o) => o.type === "rotate");
    expect(rot && rot.type === "rotate" && rot.degrees).toBeGreaterThan(0);
    const back = g.move(2, 200, 100, 20).find((o) => o.type === "rotate");
    expect(back && back.type === "rotate" && back.degrees).toBeLessThan(0);
  });

  test("tryck blir tap, men inte efter drag eller länge", () => {
    const g = new GestureTracker(W, 0);
    g.down(1, 10, 10, 0);
    expect(g.up(1, 100)).toEqual([{ type: "tap" }]);
    g.down(1, 10, 10, 0);
    g.move(1, 60, 10, 20);
    expect(g.up(1, 40).some((o) => o.type === "tap")).toBe(false);
    g.down(1, 10, 10, 0);
    expect(g.up(1, 800).some((o) => o.type === "tap")).toBe(false);
    g.down(1, 10, 10, 0);
    g.down(2, 50, 10, 5);
    g.up(2, 20);
    expect(g.up(1, 30).some((o) => o.type === "tap")).toBe(false);
  });
});

describe("träff på del av brickan", () => {
  const type = allTileTypes().get("base/RCr")!;
  const geo = computeGeometry(type);
  const all = new Set(type.features.map((f) => f.id));

  test("oroterad: stad uppe, väg i mitten, fält nere", () => {
    expect(featureAtPoint(geo, 0, [0.5, 0.06], all)).toBe("city0");
    expect(featureAtPoint(geo, 0, [0.5, 0.5], all)).toBe("road0");
    expect(featureAtPoint(geo, 0, [0.5, 0.85], all)).toBe("field1");
  });

  test("roterad 90 grader: staden ligger åt öster och vägen går upp-ner", () => {
    expect(featureAtPoint(geo, 90, [0.94, 0.5], all)).toBe("city0");
    expect(featureAtPoint(geo, 90, [0.5, 0.2], all)).toBe("road0");
    expect(featureAtPoint(geo, 90, [0.5, 0.06], all)).not.toBe("city0");
  });

  test("bara tillåtna delar går att träffa", () => {
    expect(featureAtPoint(geo, 0, [0.5, 0.06], new Set(["field1"]))).not.toBe("city0");
  });

  test("tryck strax vid en tunn väg träffar vägen", () => {
    const road = geo.features.find((f) => f.feature === "road0")!;
    const y = road.centerline![0]![1] + 0.12;
    expect(featureAtPoint(geo, 0, [0.15, y], new Set(["road0"]))).toBe("road0");
    expect(featureAtPoint(geo, 0, [0.15, y + 0.3], new Set(["road0"]))).toBeNull();
  });
});

describe("tur och förråd", () => {
  const base = {
    version: 1, setup: {} as never, board: { "0,0": tile(0, 0) }, figures: [
      { id: "f1", kind: "meeple", owner: "p1", location: { at: "supply" } },
      { id: "f2", kind: "meeple", owner: "p1", location: { at: "feature", pos: { x: 0, y: 0 }, feature: "city0" } },
      { id: "f3", kind: "abbot", owner: "p1", location: { at: "supply" } },
      { id: "f4", kind: "meeple", owner: "p2", location: { at: "supply" } },
    ], players: [], drawPileCount: 3, remaining: {}, ext: {}, finished: false,
  };
  const state = (phase: string, pending: PublicState["turn"]["pending"], player = "p1"): PublicState =>
    ({ ...base, turn: { player, phase, pending } }) as unknown as PublicState;

  test("vald bricka och placerad bricka", () => {
    const v = deriveTurn(state("placeTile", [{ type: "chooseTile", handIndex: 1 }]), "p1", ["a", "b", "c"]);
    expect(v).toMatchObject({ mine: true, chosenIndex: 1, tileId: "b", placed: null });
    const one = deriveTurn(state("placeTile", []), "p1", ["a"]);
    expect(one.tileId).toBe("a");
    const placed = deriveTurn(state("placeFigure", [{ type: "placeTile", pos: { x: 0, y: 0 }, rotation: 90 }]), "p1", []);
    expect(placed.placedTile?.type).toBe("base/RCr");
    expect(deriveTurn(state("chooseTile", []), "p2", ["a", "b"]).mine).toBe(false);
  });

  test("pjäser kvar per sort", () => {
    expect(figureSupply(state("confirm", []), "p1")).toEqual([
      { kind: "meeple", left: 1, total: 2 },
      { kind: "abbot", left: 1, total: 1 },
    ]);
  });
});

describe("adress och minne", () => {
  const mem = (): StorageLike & { m: Map<string, string> } => {
    const m = new Map<string, string>();
    return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
  };

  test("platskod i adressen återansluter; spelkod ger ny spelare", () => {
    expect(planStart("?s=abc", null)).toEqual({ kind: "rejoin", seatToken: "abc" });
    expect(planStart("?g=G1", null)).toEqual({ kind: "join", gameCode: "G1" });
    expect(planStart("", null)).toEqual({ kind: "scan" });
  });

  test("sparad plats återansluter vid omladdning, men inte i ett annat spel", () => {
    const st = mem();
    saveSeat(st, { token: "T", gameCode: "G1" });
    expect(loadSeat(st)).toEqual({ token: "T", gameCode: "G1" });
    expect(planStart("?g=G1", loadSeat(st))).toEqual({ kind: "rejoin", seatToken: "T" });
    expect(planStart("?g=G2", loadSeat(st))).toEqual({ kind: "join", gameCode: "G2" });
    expect(planStart("", loadSeat(st))).toEqual({ kind: "rejoin", seatToken: "T" });
  });

  test("lagring som kastar fel stör inte", () => {
    const bad: StorageLike = { getItem() { throw new Error("x"); }, setItem() { throw new Error("x"); }, removeItem() { throw new Error("x"); } };
    expect(loadSeat(bad)).toBeNull();
    expect(() => saveSeat(bad, { token: "T" })).not.toThrow();
  });

  test("språkval", () => {
    expect(pickLang("sv", "en-US", ["en", "sv"])).toBe("sv");
    expect(pickLang(null, "sv-SE", ["en", "sv"])).toBe("sv");
    expect(pickLang("de", "fr", ["en", "sv"])).toBe("en");
  });
});
