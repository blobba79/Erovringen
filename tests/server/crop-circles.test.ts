// Crop Circles II i servern: den som ska välja (turn.actor) får tillåtna steg och kan göra dem,
// den som har tur kan ångra, och datorspelaren väljer när det är hens tur.

import { describe, expect, test } from "bun:test";
import type { StartOptions } from "../../src/shared/messages";
import type { GameState, Step } from "../../src/shared/state";
import { actorOf } from "../../src/engine/index";
import { chooseBotStep } from "../../src/server/bot";
import type { Room } from "../../src/server/room";
import { realEngine } from "../engine/helpers";
import { FakeConn, join, makeRoom, screen } from "./helpers";

const eng = realEngine();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const opts = (o: Partial<StartOptions> = {}): StartOptions => ({
  expansions: ["base", "crop-circles-2"], variants: {}, screenLang: "en", handSize: 1, showClosingTiles: false, ...o,
});
const expansion = (action: string, data: unknown): Step => ({ type: "expansion", expansion: "crop-circles-2", action, data });

/** Anna (p1), Bo (p2) och en dator (p3); läget är satt så att Anna just lagt en stadsbricka med sädescirkel. */
async function setup() {
  const room = makeRoom({ botPauseMs: 0 });
  const scr = screen(room);
  const anna = join(room, "Anna", "#d62828");
  const bo = join(room, "Bo", "#2a6fdb");
  room.handle(anna, { type: "addBot" });
  room.handle(anna, { type: "setOptions", options: opts() });
  room.handle(anna, { type: "startGame" });
  await sleep(0);
  const s: GameState = structuredClone(room.state!);
  const [p1, p2, p3] = s.players.map((p) => p.id) as [string, string, string];
  expect([p1, p2]).toEqual([anna.player, bo.player].sort((a, b) => (s.players.findIndex((p) => p.id === a) - s.players.findIndex((p) => p.id === b))));
  // Kartan: en stadsbricka med två städer; Bo och datorn har en följare var i varsin stad.
  s.board = { "0,0": { type: "crop-circles-2/CFC", pos: { x: 0, y: 0 }, rotation: 0 } };
  const put = (id: string, feature: string) => {
    s.figures.find((f) => f.id === id)!.location = { at: "feature", pos: { x: 0, y: 0 }, feature };
  };
  put(`${p2}:meeple:0`, "city0");
  put(`${p3}:meeple:0`, "city1");
  s.players.forEach((p) => (p.hand = []));
  s.players[0]!.hand = ["crop-circles-2/CFC"];
  s.players[1]!.hand = ["base/L"];
  s.players[2]!.hand = ["base/L"];
  s.drawPile = ["base/L", "base/L", "base/L", "base/L"];
  s.turn = { player: p1, phase: "placeTile", pending: [] };
  room.state = s;
  (room as unknown as { broadcastGame(w: boolean): void }).broadcastGame(true);
  const byPlayer = (id: string): FakeConn | undefined => [anna, bo].find((c) => c.player === id);
  return { room, scr, anna, bo, p1, p2, p3, byPlayer };
}

const legal = (c: FakeConn) => c.last("legalSteps")!.steps;
const send = (room: Room, c: FakeConn, step: Step) => room.handle(c, { type: "step", step });

async function startCircle(g: Awaited<ReturnType<typeof setup>>) {
  const { room, anna } = g;
  const place = legal(anna).find((x) => x.type === "placeTile" && x.pos.x === 1 && x.pos.y === 0 && x.rotation === 0)!;
  send(room, anna, place);
  send(room, anna, { type: "noFigure" });
  send(room, anna, { type: "confirm" });
}

describe("Crop Circles II i rummet", () => {
  test("stegen går till den som ska välja; den som har tur kan bara ångra under tiden", async () => {
    const g = await setup();
    const { room, anna, bo } = g;
    await startCircle(g);
    expect(room.state!.turn.phase).toBe("crop-circles-2");
    expect(room.state!.turn.actor).toBeUndefined();
    // Anna väljer läget.
    expect(legal(anna).map((x) => (x.type === "expansion" ? (x.data as { choice: string }).choice : x.type))).toEqual(["add", "remove"]);
    expect(legal(bo)).toEqual([]);
    send(room, anna, expansion("mode", { choice: "add" }));
    // Nu väljer Bo.
    expect(room.state!.turn.actor).toBe(g.p2);
    expect(legal(bo).some((x) => x.type === "expansion" && x.action === "add")).toBe(true);
    expect(legal(bo).some((x) => x.type === "undo")).toBe(false);
    expect(legal(anna)).toEqual([{ type: "undo" }]);
    // Annas steg nekas men hennes ångra går; Bos ångra nekas.
    anna.clear();
    send(room, anna, expansion("skip", {}));
    expect(anna.last("error")?.key).toBe("error.notYourTurn");
    bo.clear();
    send(room, bo, { type: "undo" });
    expect(bo.last("error")?.key).toBe("error.notYourTurn");
    send(room, anna, { type: "undo" });
    expect(room.state!.turn.actor).toBeUndefined();
    expect(legal(anna).length).toBe(2);
    expect(legal(bo)).toEqual([]);
    // Samma val igen, nu skickar Bo sitt, och efter det kan Anna inte längre ångra.
    send(room, anna, expansion("mode", { choice: "add" }));
    const add = legal(bo).find((x) => x.type === "expansion" && x.action === "add")!;
    send(room, bo, add);
    expect(room.state!.figures.find((f) => f.id === `${g.p2}:meeple:1`)!.location.at).toBe("feature");
    anna.clear();
    send(room, anna, { type: "undo" });
    expect(anna.last("error")).toBeDefined();
    room.dispose();
  });

  test("datorspelaren väljer när det är hens tur (actor), sedan bekräftar den som har tur", async () => {
    const g = await setup();
    const { room, anna, bo } = g;
    await startCircle(g);
    send(room, anna, expansion("mode", { choice: "remove" }));
    expect(room.state!.turn.actor).toBe(g.p2);
    send(room, bo, legal(bo).find((x) => x.type === "expansion")!);
    // Datorn (p3) är nästa; rummet spelar hens steg.
    expect(room.state!.turn.actor).toBe(g.p3);
    for (let i = 0; i < 100 && room.state!.turn.actor === g.p3; i++) await sleep(5);
    expect(room.state!.turn.phase).toBe("confirm");
    expect(room.state!.turn.actor).toBeUndefined();
    expect(room.state!.figures.find((f) => f.id === `${g.p3}:meeple:0`)!.location.at).toBe("supply");
    expect(legal(anna).map((x) => x.type)).toEqual(["confirm"]);
    send(room, anna, { type: "confirm" });
    expect(room.state!.turn.player).toBe(g.p2);
    room.dispose();
  });

  test("värden hoppar över den som ska välja: bara hens val faller bort, de andra får välja", async () => {
    const g = await setup();
    const { room, anna, bo } = g;
    await startCircle(g);
    send(room, anna, expansion("mode", { choice: "remove" }));
    expect(room.state!.turn.actor).toBe(g.p2);
    room.disconnect(bo);
    room.handle(anna, { type: "hostAction", player: g.p2, action: "skip" });
    // Cirkeln lever kvar: p2:s följare ligger kvar och datorn (p3) väljer nu.
    expect(room.state!.turn.phase === "crop-circles-2" || room.state!.turn.phase === "confirm").toBe(true);
    expect(room.state!.turn.player).toBe(g.p1);
    expect(room.state!.figures.find((f) => f.id === `${g.p2}:meeple:0`)!.location.at).toBe("feature");
    for (let i = 0; i < 100 && room.state!.turn.phase === "crop-circles-2"; i++) await sleep(5);
    expect(room.state!.turn.phase).toBe("confirm");
    expect(room.state!.figures.find((f) => f.id === `${g.p3}:meeple:0`)!.location.at).toBe("supply");
    room.dispose();
  });

  test("värden tar bort den som ska välja: pjäserna försvinner, de kvarvarande får välja", async () => {
    const g = await setup();
    const { room, anna, bo } = g;
    await startCircle(g);
    send(room, anna, expansion("mode", { choice: "remove" }));
    expect(room.state!.turn.actor).toBe(g.p2);
    room.disconnect(bo);
    room.handle(anna, { type: "hostAction", player: g.p2, action: "remove" });
    const s = room.state!;
    expect(s.players.map((p) => p.id)).toEqual([g.p1, g.p3]);
    expect(s.figures.some((f) => f.owner === g.p2)).toBe(false);
    expect(s.turn.player).toBe(g.p1);
    expect(s.turn.actor).not.toBe(g.p2);
    for (let i = 0; i < 100 && room.state!.turn.phase === "crop-circles-2"; i++) await sleep(5);
    expect(room.state!.turn.phase).toBe("confirm");
    expect(room.state!.figures.find((f) => f.id === `${g.p3}:meeple:0`)!.location.at).toBe("supply");
    send(room, anna, { type: "confirm" });
    expect(room.state!.turn.phase).not.toBe("crop-circles-2");
    expect(room.state!.turn.player).not.toBe(g.p2);
    room.dispose();
  });
});

describe("botstrategi med actor", () => {
  test("chooseBotStep väljer åt den som ska välja", () => {
    const s = eng.newGame({
      expansions: ["base", "crop-circles-2"], variants: {}, handSize: 1, showClosingTiles: false, seed: 5,
      players: [{ id: "p1", name: "A", color: "red" }, { id: "p2", name: "B", color: "blue", bot: true }, { id: "p3", name: "C", color: "green", bot: true }],
    });
    s.board = { "0,0": { type: "crop-circles-2/CFC", pos: { x: 0, y: 0 }, rotation: 0 } };
    s.figures.find((f) => f.id === "p2:meeple:0")!.location = { at: "feature", pos: { x: 0, y: 0 }, feature: "city0" };
    s.turn = { player: "p1", phase: "crop-circles-2", pending: [], actor: undefined };
    const ext = { circle: { kind: "city", order: ["p2", "p3", "p1"], idx: 0, others: false } };
    (s.ext as Record<string, unknown>)["crop-circles-2"] = ext;
    // Läget väljs av p1 (en bott får välja både att lägga till och ta bort).
    const step = chooseBotStep(eng, s, () => 0.1);
    expect(step).toMatchObject({ type: "expansion", action: "mode" });
    const r = eng.apply(s, "p1", step);
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(actorOf(r.state)).toBe("p2");
    const mine = chooseBotStep(eng, r.state, () => 0.1);
    expect(eng.apply(r.state, "p2", mine).ok).toBe(true);
    expect(eng.apply(r.state, "p1", mine).ok).toBe(false);
  });
});

describe("ett helt rum med datorspelare", () => {
  test("värden och två datorer spelar färdigt med Crop Circles II", async () => {
    const room = makeRoom({ botPauseMs: 0, seed: () => 77 });
    screen(room);
    const host = join(room, "Anna", "#d62828");
    room.handle(host, { type: "addBot" });
    room.handle(host, { type: "addBot" });
    room.handle(host, { type: "setOptions", options: opts() });
    room.handle(host, { type: "startGame" });
    const t0 = Date.now();
    while (!room.state!.finished) {
      if (Date.now() - t0 > 120_000) throw new Error("spelet blev inte färdigt i tid");
      const s = room.state!;
      if (actorOf(s) === host.player) room.handle(host, { type: "step", step: chooseBotStep(eng, s) });
      else await sleep(0);
    }
    expect(room.state!.finished).toBe(true);
    room.dispose();
  }, 130_000);
});
