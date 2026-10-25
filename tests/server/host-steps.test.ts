// Värdens ingrepp mitt i en tur (hoppa över eller ta bort den som väljer) via servern: de blir delsteg i
// turen och sparas i stegloggen, så att den som har tur kan bekräfta efteråt. Gäller Crop Circles II
// och draken; den som har tur kan själv hoppas över medan hen väljer utan att de andras val görs ogjorda.

import { describe, expect, test } from "bun:test";
import type { StartOptions } from "../../src/shared/messages";
import type { GameState, Step } from "../../src/shared/state";
import { actorOf } from "../../src/engine/index";
import type { Room } from "../../src/server/room";
import { realEngine } from "../engine/helpers";
import { FakeConn, join, makeRoom } from "./helpers";

const eng = realEngine();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const opts = (expansions: StartOptions["expansions"]): StartOptions => ({
  expansions, variants: {}, screenLang: "en", handSize: 1, showClosingTiles: false,
});
const cc = (action: string, data: unknown): Step => ({ type: "expansion", expansion: "crop-circles-2", action, data });
const legal = (c: FakeConn) => c.last("legalSteps")!.steps;
const send = (room: Room, c: FakeConn, step: Step) => room.handle(c, { type: "step", step });
const priv = (room: Room) => room as unknown as { stepLog: { player: string; step: Step }[]; stepLogOk: boolean; broadcastGame(w: boolean): void };
const at = (s: GameState, id: string) => s.figures.find((f) => f.id === id)!.location.at;

/**
 * Anna (host, p1), Bo (p2) och en dator (p3). Anna lägger en stadsbricka med sädescirkel (eller Bo, om `turn`
 * är 1). Alla tre har en följare i en egen stad. Returnerar rummet och ett sätt att skicka som en viss spelare.
 */
async function setup(turn = 0) {
  const room = makeRoom({ botPauseMs: 0 });
  const anna = join(room, "Anna", "#d62828");
  const bo = join(room, "Bo", "#2a6fdb");
  room.handle(anna, { type: "addBot" });
  room.handle(anna, { type: "setOptions", options: opts(["base", "crop-circles-2"]) });
  room.handle(anna, { type: "startGame" });
  await sleep(0);
  const s: GameState = structuredClone(room.state!);
  const [p1, p2, p3] = s.players.map((p) => p.id) as [string, string, string];
  const tile = (x: number) => ({ type: "crop-circles-2/CFC", pos: { x, y: 0 }, rotation: 0 as const });
  s.board = { "0,0": tile(0), "10,0": tile(10), "20,0": tile(20) };
  const put = (id: string, x: number, feature: string) => {
    s.figures.find((f) => f.id === id)!.location = { at: "feature", pos: { x, y: 0 }, feature };
  };
  put(`${p3}:meeple:0`, 0, "city1");
  put(`${p1}:meeple:0`, 10, "city0");
  put(`${p2}:meeple:0`, 20, "city0");
  s.players.forEach((p) => (p.hand = ["base/L"]));
  s.players[turn]!.hand = ["crop-circles-2/CFC"];
  s.drawPile = ["base/L", "base/L", "base/L", "base/L"];
  s.turn = { player: [p1, p2, p3][turn]!, phase: "placeTile", pending: [] };
  room.state = s;
  priv(room).broadcastGame(true);
  const start = structuredClone(s);
  const byId = (id: string): FakeConn | undefined => [anna, bo].find((c) => c.player === id);
  /** Den som har tur lägger brickan vid (1,0), ingen pjäs, bekräftar: cirkeln börjar. */
  const startCircle = () => {
    const c = byId(actorOf(room.state!))!;
    const place = legal(c).find((x) => x.type === "placeTile" && x.pos.x === 1 && x.pos.y === 0 && x.rotation === 0)!;
    send(room, c, place);
    send(room, c, { type: "noFigure" });
    send(room, c, { type: "confirm" });
  };
  const settle = async () => {
    for (let i = 0; i < 100 && room.state!.turn.phase === "crop-circles-2" && actorOf(room.state!) === p3; i++) await sleep(5);
  };
  return { room, anna, bo, p1, p2, p3, start, byId, startCircle, settle };
}

describe("tre spelare, den i mitten hoppas över i sädescirkeln (punkt 1)", () => {
  for (const action of ["skip", "remove"] as const) {
    test(`${action}: den som har tur kan bekräfta efteråt`, async () => {
      const g = await setup();
      const { room, anna, bo } = g;
      g.startCircle();
      send(room, anna, cc("mode", { choice: "remove" }));
      expect(room.state!.turn.actor).toBe(g.p2);
      room.disconnect(bo);
      room.handle(anna, { type: "hostAction", player: g.p2, action });
      await g.settle();
      send(room, anna, legal(anna).find((x) => x.type === "expansion")!); // Anna väljer sist, som den som har tur
      expect(room.state!.turn.phase).toBe("confirm");
      expect(at(room.state!, `${g.p3}:meeple:0`)).toBe("supply");
      anna.clear();
      send(room, anna, { type: "confirm" });
      expect(anna.last("error")).toBeUndefined();
      const s = room.state!;
      expect(s.turn.phase).not.toBe("crop-circles-2");
      if (action === "skip") {
        expect(at(s, `${g.p2}:meeple:0`)).toBe("feature");
        expect(s.players.map((p) => p.id)).toEqual([g.p1, g.p2, g.p3]);
      } else {
        // Omspelningen vid bekräfta tar bort p2 igen: hen och hens pjäser kommer inte tillbaka.
        expect(s.players.map((p) => p.id)).toEqual([g.p1, g.p3]);
        expect(s.figures.some((f) => f.owner === g.p2)).toBe(false);
      }
      room.dispose();
    });
  }

  test("överhoppet ligger i stegloggen och turen går att spela om från början", async () => {
    const g = await setup();
    const { room, anna, bo } = g;
    g.startCircle();
    send(room, anna, cc("mode", { choice: "remove" }));
    room.disconnect(bo);
    room.handle(anna, { type: "hostAction", player: g.p2, action: "skip" });
    await g.settle();
    send(room, anna, legal(anna).find((x) => x.type === "expansion")!); // Anna väljer sist, som den som har tur
    send(room, anna, { type: "confirm" });
    const { stepLog, stepLogOk } = priv(room);
    expect(stepLogOk).toBe(true);
    const skip = stepLog.find((x) => x.step.type === "expansion" && x.step.expansion === "base");
    expect(skip).toEqual({ player: g.p2, step: { type: "expansion", expansion: "base", action: "skipActor", data: {} } });
    // Spela om hela loggen från början av turen: samma tillstånd som rummets.
    let s = structuredClone(g.start);
    for (const { player, step } of stepLog) {
      const r = eng.apply(s, player, step);
      if (!r.ok) throw new Error(`${player} ${JSON.stringify(step)}: ${r.error}`);
      s = r.state;
    }
    expect(JSON.stringify(s)).toBe(JSON.stringify(room.state));
    room.dispose();
  });

  test("en borttagning gör att loggen inte längre används, men spelet fortsätter", async () => {
    const g = await setup();
    const { room, anna, bo } = g;
    g.startCircle();
    send(room, anna, cc("mode", { choice: "remove" }));
    room.disconnect(bo);
    room.handle(anna, { type: "hostAction", player: g.p2, action: "remove" });
    expect(priv(room).stepLogOk).toBe(false);
    room.dispose();
  });

  test("en telefon kan inte skicka värdstegen", async () => {
    const g = await setup();
    const { room, anna } = g;
    g.startCircle();
    send(room, anna, cc("mode", { choice: "remove" }));
    anna.clear();
    send(room, anna, { type: "expansion", expansion: "base", action: "skipActor", data: {} });
    expect(anna.last("error")?.key).toBe("error.illegalStep");
    expect(room.state!.turn.actor).toBe(g.p2);
    room.dispose();
  });
});

describe("den som har tur väljer sist och hoppas över (punkt 2)", () => {
  test("de andras val ligger kvar och turen går vidare till bekräfta", async () => {
    const g = await setup(1); // Bo har turen; ordningen är p3 (datorn), p1 (Anna), p2 (Bo)
    const { room, anna, bo } = g;
    g.startCircle();
    send(room, bo, cc("mode", { choice: "remove" }));
    await g.settle();
    expect(room.state!.turn.actor).toBe(g.p1);
    send(room, anna, legal(anna).find((x) => x.type === "expansion")!);
    // Nu väljer Bo, som har tur. Hen är borta och värden hoppar över hens val.
    expect(room.state!.turn.actor).toBeUndefined();
    expect(room.state!.turn.phase).toBe("crop-circles-2");
    room.disconnect(bo);
    room.handle(anna, { type: "hostAction", player: g.p2, action: "skip" });
    const s = room.state!;
    expect(s.turn.phase).toBe("confirm");
    expect(s.turn.player).toBe(g.p2);
    // Förut gick tillståndet tillbaka till cirkelns början och de andras val gjordes ogjorda.
    expect(at(s, `${g.p3}:meeple:0`)).toBe("supply");
    expect(at(s, `${g.p1}:meeple:0`)).toBe("supply");
    expect(at(s, `${g.p2}:meeple:0`)).toBe("feature");
    room.dispose();
  });
});


describe("draken i rummet", () => {
  /** Anna (host, p1), Bo (p2) och Cy (p3); spelaren `turn` lägger dragbrickan i änden av en rad av vägbrickor. */
  async function dragon(turn: number) {
    const room = makeRoom({ botPauseMs: 0 });
    const anna = join(room, "Anna", "#d62828");
    const bo = join(room, "Bo", "#2a6fdb");
    const cy = join(room, "Cy", "#2aa84a");
    room.handle(anna, { type: "setOptions", options: opts(["base", "princess-dragon"]) });
    room.handle(anna, { type: "startGame" });
    await sleep(0);
    const s: GameState = structuredClone(room.state!);
    const ids = s.players.map((p) => p.id) as [string, string, string];
    s.board = {};
    for (let x = 0; x < 8; x++) s.board[`${x},0`] = { type: "base/RFr", pos: { x, y: 0 }, rotation: 0 };
    s.players.forEach((p) => (p.hand = ["base/L"]));
    s.players[turn]!.hand = ["princess-dragon/RFr.d"];
    s.drawPile = ["base/L", "base/L", "base/L", "base/L"];
    s.figures.find((f) => f.id === "dragon:0")!.location = { at: "tile", pos: { x: 1, y: 0 } };
    s.turn = { player: ids[turn]!, phase: "placeTile", pending: [] };
    room.state = s;
    priv(room).broadcastGame(true);
    const conn = (id: string): FakeConn => [anna, bo, cy].find((c) => c.player === id)!;
    const right = (): Step => {
      const x = (m: Step) => (m as { data: { pos: { x: number } } }).data.pos.x;
      return eng.legalSteps(room.state!).filter((m) => m.type === "expansion" && m.action === "move").sort((a, b) => x(b) - x(a))[0]!;
    };
    const moves = () => room.state!.turn.pending.filter((p) => p.type === "expansion" && p.action === "move").length;
    const starter = conn(ids[turn]!);
    send(room, starter, { type: "placeTile", pos: { x: 8, y: 0 }, rotation: 0 });
    send(room, starter, { type: "noFigure" });
    expect(room.state!.turn.phase).toBe("dragon");
    return { room, anna, bo, cy, ids, conn, right, moves };
  }

  /** Spelar ut flytten; den frånvarande p2 hoppas över av värden varje gång hen ska flytta. Returnerar vilka som flyttade. */
  function playOut(g: Awaited<ReturnType<typeof dragon>>): string[] {
    const { room, anna, conn, right } = g;
    const p2 = g.ids[1];
    const seen: string[] = [];
    for (let i = 0; i < 12 && room.state!.turn.phase === "dragon"; i++) {
      const who = actorOf(room.state!);
      if (who === p2) room.handle(anna, { type: "hostAction", player: p2, action: "skip" });
      else {
        seen.push(who);
        send(room, conn(who), right());
      }
    }
    return seen;
  }

  test("p2 hoppas över, p3 tar över hens steg: sex flyttar och p1 kan bekräfta (punkt 1 och 3)", async () => {
    const g = await dragon(0);
    const { room, anna, bo, right, moves } = g;
    const [, p2] = g.ids;
    send(room, anna, right());
    expect(room.state!.turn.actor).toBe(p2);
    room.disconnect(bo);
    const [p1, , p3] = g.ids;
    // p1 har flyttat; p2:s båda platser tas över av p3.
    expect(playOut(g)).toEqual([p3, p3, p1, p3, p3]);
    expect(moves()).toBe(6);
    expect(room.state!.turn.phase).toBe("confirm");
    anna.clear();
    send(room, anna, { type: "confirm" });
    expect(anna.last("error")).toBeUndefined();
    expect(room.state!.turn.player).toBe(p2);
    room.dispose();
  });

  test("den som har tur flyttar först och hoppas över: nästa tar över, hens senare plats tas över igen", async () => {
    const g = await dragon(1); // Bo har turen; ordningen p2, p3, p1, p2, p3, p1
    const { room, anna, bo, moves } = g;
    const [p1, p2, p3] = g.ids;
    expect(actorOf(room.state!)).toBe(p2);
    room.disconnect(bo);
    expect(playOut(g)).toEqual([p3, p3, p1, p3, p3, p1]);
    expect(moves()).toBe(6);
    expect(room.state!.turn.phase).toBe("confirm");
    expect(room.state!.turn.player).toBe(p2); // turen ligger kvar hos Bo
    void anna;
    room.dispose();
  });

  test("ångra: spärras bara så långt tillbaka som någon annans flytt (punkt 5)", async () => {
    const g = await dragon(0);
    const { room, anna, conn, right } = g;
    const [p1, p2, p3] = g.ids;
    send(room, anna, right()); // p1
    expect(legal(anna).some((x) => x.type === "undo")).toBe(true);
    send(room, conn(p2), right()); // p2
    expect(legal(anna).some((x) => x.type === "undo")).toBe(false);
    send(room, conn(p3), right()); // p3
    send(room, anna, right()); // p1:s egen flytt, efter de andras
    expect(room.state!.turn.actor).toBe(p2);
    expect(legal(anna).some((x) => x.type === "undo")).toBe(true); // förut spärrat resten av turen
    send(room, anna, { type: "undo" });
    expect(actorOf(room.state!)).toBe(p1);
    expect(legal(anna).some((x) => x.type === "undo")).toBe(false); // p3:s flytt ligger nu sist
    room.dispose();
  });
});
