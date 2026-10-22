import { describe, expect, test } from "bun:test";
import {
  cacheSize, featureShapes, figureSpots, fitCamera, inspectMarks, phaseKey, pxPerTile, screenToWorld,
  spotLabels, standings, stepCamera, worldToScreen, type Camera,
} from "../../src/screen/logic";
import { initialModel, reduce, seatsToShow } from "../../src/screen/store";
import { allTileTypes } from "../../src/tiles/index";
import { backoff } from "../../src/screen/connection";
import { devEngine, devSetup, previewSpots, randomStep, toPublic } from "../../src/screen/dev/game";
import { makeRng } from "../players/random-player";
import type { LobbySeat } from "../../src/shared/messages";

const view = { width: 1600, height: 900 };
const cam = (o: Partial<Camera> = {}): Camera => ({ x: 0, y: 0, zoom: 16, rotation: 0, ...o });
const close = (a: number, b: number) => expect(Math.abs(a - b)).toBeLessThan(1e-6);

describe("kamera", () => {
  test("kamerans mittpunkt hamnar mitt på skärmen och en ruta är bredd/zoom pixlar", () => {
    const c = cam({ x: 3, y: -2 });
    const p = worldToScreen(c, view, { x: 3, y: -2 });
    close(p.x, 800); close(p.y, 450);
    expect(pxPerTile(c, view)).toBe(100);
    const q = worldToScreen(c, view, { x: 4, y: -2 });
    close(q.x, 900); close(q.y, 450);
    const d = worldToScreen(c, view, { x: 3, y: -1 });
    close(d.y, 550); // y växer söderut = nedåt
  });

  test("rotation 90 grader medurs: norr hamnar till höger", () => {
    const north = worldToScreen(cam({ rotation: 90 }), view, { x: 0, y: -1 });
    close(north.x, 900); close(north.y, 450);
  });

  test("screenToWorld är inversen", () => {
    const c = cam({ x: 1.5, y: 4, zoom: 11, rotation: 137 });
    const p = { x: -3.25, y: 7.5 };
    const back = screenToWorld(c, view, worldToScreen(c, view, p));
    close(back.x, p.x); close(back.y, p.y);
  });

  test("mjuk följning närmar sig målet, tar kortaste vägen i vinkel och landar exakt", () => {
    const target = cam({ x: 10, rotation: 10 });
    let c = cam({ rotation: 350 });
    const step = stepCamera(c, target, 0.05);
    expect(step.x).toBeGreaterThan(0);
    expect(step.x).toBeLessThan(10);
    expect(step.rotation).toBeGreaterThan(350); // 350 -> 10 går över noll, inte baklänges
    for (let i = 0; i < 200; i++) c = stepCamera(c, target, 0.05);
    expect(c).toEqual(target);
  });

  test("fitCamera visar hela kartan", () => {
    const board = { "0,0": { type: "a", pos: { x: 0, y: 0 }, rotation: 0 as const }, "10,4": { type: "a", pos: { x: 10, y: 4 }, rotation: 0 as const } };
    const c = fitCamera(board, view);
    expect(c.x).toBe(5); expect(c.y).toBe(2);
    expect(c.zoom).toBeGreaterThanOrEqual(13);
  });
});

describe("siffror på platserna", () => {
  const spots = [{ x: 2, y: 0 }, { x: 0, y: 1 }, { x: 5, y: 5 }];
  test("numreras från 1 i given ordning och sitter på platsens skärmläge", () => {
    const l = spotLabels(spots, cam(), view);
    expect(l.map((x) => x.n)).toEqual([1, 2, 3]);
    close(l[0]!.x, 1000); close(l[0]!.y, 450);
  });

  test("siffrornas storlek och läge påverkas inte av en rotation som lägger tillbaka platsen", () => {
    const a = spotLabels(spots, cam({ rotation: 0 }), view);
    const b = spotLabels(spots, cam({ rotation: 360 }), view);
    for (let i = 0; i < a.length; i++) { close(a[i]!.x, b[i]!.x); close(a[i]!.size, b[i]!.size); }
    // rotation ändrar var siffran står men aldrig hur den ritas
    expect(spotLabels(spots, cam({ rotation: 90 }), view)[0]).not.toHaveProperty("angle");
  });

  test("platser utanför skärmen markeras osynliga och teckenstorleken har ett golv", () => {
    const l = spotLabels([{ x: 500, y: 0 }, { x: 0, y: 0 }], cam({ zoom: 200 }), view);
    expect(l[0]!.visible).toBe(false);
    expect(l[1]!.visible).toBe(true);
    expect(l[1]!.size).toBe(18);
  });
});

describe("markeringar ur InspectResult", () => {
  test("öppna rutor som också är blockerade visas bara som blockerade", () => {
    const m = inspectMarks({
      kind: "city", tiles: [{ x: 0, y: 0 }], figures: [], majority: [], points: 2, complete: false,
      openSpots: [{ x: 1, y: 0 }, { x: -1, y: 0 }], blockedSpots: [{ x: -1, y: 0 }],
      closingTiles: { "1,0": 3, "bad": 1 }, completedCities: [{ x: 4, y: 4 }],
    });
    expect(m.area).toEqual([{ x: 0, y: 0 }]);
    expect(m.open).toEqual([{ x: 1, y: 0 }]);
    expect(m.blocked).toEqual([{ x: -1, y: 0 }]);
    expect(m.closing).toEqual([{ pos: { x: 1, y: 0 }, count: 3 }]);
    expect(m.cities).toEqual([{ x: 4, y: 4 }]);
  });

  test("utan valfria fält blir listorna tomma", () => {
    const m = inspectMarks({ kind: "city", tiles: [], figures: [], majority: [], points: 0, complete: true, openSpots: [], blockedSpots: [] });
    expect(m.closing).toEqual([]);
    expect(m.cities).toEqual([]);
  });
});

describe("former och pjäser från motorns tillstånd", () => {
  const eng = devEngine();
  const types = allTileTypes();
  function play(turns: number) {
    let s = eng.newGame(devSetup(3, 11));
    const rnd = makeRng(5);
    let confirms = 0;
    while (confirms < turns && !s.finished) {
      const mv = randomStep(eng, s, rnd);
      if (!mv) break;
      const r = eng.apply(s, mv.player, mv.step);
      if (!r.ok) throw new Error(r.error);
      s = r.state;
      if (mv.step.type === "confirm") confirms++;
    }
    return s;
  }

  test("områdets former ligger inom sina rutor och pjäserna får en plats var", () => {
    const s = play(40);
    const an = eng.analyze(s);
    const area = an.areas.find((a) => a.kind === "city" && a.tiles.length > 1) ?? an.areas[0]!;
    const shapes = featureShapes(types, s.board, area.nodes);
    expect(shapes.length).toBe(area.nodes.length);
    for (const [i, shape] of shapes.entries()) {
      const n = area.nodes[i]!;
      for (const [x, y] of shape.flat()) {
        expect(x).toBeGreaterThanOrEqual(n.pos.x - 0.5 - 1e-9);
        expect(x).toBeLessThanOrEqual(n.pos.x + 0.5 + 1e-9);
        expect(y).toBeGreaterThanOrEqual(n.pos.y - 0.5 - 1e-9);
        expect(y).toBeLessThanOrEqual(n.pos.y + 0.5 + 1e-9);
      }
    }
    const spots = figureSpots(s.figures, types, s.board);
    const placed = s.figures.filter((f) => f.location.at === "feature");
    expect(spots.length).toBe(placed.length);
  });

  test("förhandsvisning och publikt tillstånd från dev-spelet", () => {
    const s = eng.newGame(devSetup());
    const pv = previewSpots(eng, s);
    expect(pv.spots?.length).toBeGreaterThan(0);
    const pub = toPublic(play(5));
    expect(pub.drawPileCount).toBe(Object.values(pub.remaining).reduce((a, b) => a + b, 0));
    expect(pub.players[0]).not.toHaveProperty("hand");
  });
});

describe("modell och meddelanden", () => {
  const seat = (player: string, connected = false): LobbySeat => ({ player, name: player, color: "red", connected, isHost: false });
  const state = toPublic(devEngine().newGame(devSetup(3)));

  test("nytt tillstånd nollställer förhandsvisning och markering", () => {
    let m = reduce(initialModel, { type: "preview", player: "p1", preview: { spots: [{ x: 1, y: 1 }] } });
    m = reduce(m, { type: "inspect", result: { kind: "city", tiles: [], figures: [], majority: [], points: 0, complete: false, openSpots: [], blockedSpots: [] } });
    expect(m.preview).toBeDefined(); expect(m.inspect).toBeDefined();
    m = reduce(m, { type: "state", state });
    expect(m.preview).toBeUndefined(); expect(m.inspect).toBeUndefined();
    expect(m.stateVersion).toBe(1);
  });

  test("kameran och språket tas från servern", () => {
    let m = reduce(initialModel, { type: "camera", x: 1, y: 2, zoom: 9, rotation: 45 });
    expect(m.camera).toEqual({ x: 1, y: 2, zoom: 9, rotation: 45 });
    m = reduce(m, { type: "lobby", seats: [], gameCode: "x", options: { expansions: [], variants: {}, screenLang: "sv", handSize: 1, showClosingTiles: false }, available: { expansions: ["base", "river", "abbot"], variants: {}, languages: ["en", "sv"], maxHandSize: 8 }, saves: [] });
    expect(m.lang).toBe("sv");
  });

  test("efter omstart visas en QR-kod i taget, annars alla som saknas", () => {
    let m = reduce(initialModel, { type: "state", state });
    m = reduce(m, { type: "waitingFor", seats: [seat("p1"), seat("p2"), seat("p3")] });
    expect(m.restart).toBe(true);
    expect(seatsToShow(m).map((s) => s.player)).toEqual(["p1"]);
    m = reduce(m, { type: "waitingFor", seats: [seat("p2"), seat("p3")] });
    expect(seatsToShow(m).map((s) => s.player)).toEqual(["p2"]); // fortfarande en i taget
    m = reduce(m, { type: "waitingFor", seats: [] });
    expect(seatsToShow(m)).toEqual([]);
    expect(m.restart).toBe(false);
    m = reduce(m, { type: "waitingFor", seats: [seat("p2")] }); // en tappad anslutning mitt i spelet
    expect(m.restart).toBe(false);
    m = reduce(m, { type: "waitingFor", seats: [seat("p2"), seat("p3")] });
    expect(seatsToShow(m).length).toBe(2);
  });
});

describe("småsaker", () => {
  test("cachestorlekar kvantiseras uppåt", () => {
    expect(cacheSize(10)).toBe(16);
    expect(cacheSize(97)).toBe(128);
    expect(cacheSize(5000)).toBe(512);
  });
  test("fasens textnyckel, med reserv för expansionernas faser", () => {
    const has = (k: string) => k === "phase.dragon";
    expect(phaseKey("placeFigure", has)).toBe("turn.chooseFigure");
    expect(phaseKey("dragon", has)).toBe("phase.dragon");
    expect(phaseKey("okänd", has)).toBe("turn.extraPlacements");
  });
  test("ställning delar placering vid lika poäng", () => {
    const r = standings([{ id: "a", score: 5 }, { id: "b", score: 9 }, { id: "c", score: 5 }]);
    expect(r.map((x) => [x.id, x.rank])).toEqual([["b", 1], ["a", 2], ["c", 2]]);
  });
  test("väntetiden före återanslutning växer men har tak", () => {
    expect(backoff(0)).toBeLessThan(backoff(2));
    expect(backoff(50)).toBe(5000);
  });
});
