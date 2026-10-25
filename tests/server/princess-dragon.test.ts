// Värden tar bort en spelare under Princess & Dragon: drakens flytt hoppar över hen, och fen blir kvar
// på rutan när spelarens pjäser försvinner.

import { describe, expect, test } from "bun:test";
import type { StartOptions } from "../../src/shared/messages";
import type { GameState, Step } from "../../src/shared/state";
import { actorOf } from "../../src/engine/index";
import type { Room } from "../../src/server/room";
import { realEngine } from "../engine/helpers";
import { FakeConn, join, makeRoom } from "./helpers";

const eng = realEngine();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const opts = (): StartOptions => ({
  expansions: ["base", "princess-dragon"], variants: {}, screenLang: "en", handSize: 1, showClosingTiles: false,
});

/** Tre människor; Anna (p1) har en dragbricka, draken står på (1,1) i ett 3 x 3 fält av vägar. */
async function setup() {
  const room = makeRoom({ botPauseMs: 0 });
  const anna = join(room, "Anna", "#d62828");
  const bo = join(room, "Bo", "#2a6fdb");
  const cy = join(room, "Cy", "#2aa84a");
  room.handle(anna, { type: "setOptions", options: opts() });
  room.handle(anna, { type: "startGame" });
  await sleep(0);
  const s: GameState = structuredClone(room.state!);
  const ids = s.players.map((p) => p.id) as [string, string, string];
  s.board = {};
  for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) s.board[`${x},${y}`] = { type: "base/RFr", pos: { x, y }, rotation: 0 };
  s.players.forEach((p) => (p.hand = ["base/L"]));
  s.players[0]!.hand = ["princess-dragon/RFr.d"];
  s.drawPile = ["base/L", "base/L", "base/L", "base/L"];
  s.figures.find((f) => f.id === "dragon:0")!.location = { at: "tile", pos: { x: 1, y: 1 } };
  s.turn = { player: ids[0], phase: "placeTile", pending: [] };
  room.state = s;
  (room as unknown as { broadcastGame(w: boolean): void }).broadcastGame(true);
  const conn = (id: string): FakeConn => [anna, bo, cy].find((c) => c.player === id)!;
  return { room, anna, bo, cy, ids, conn };
}

const send = (room: Room, c: FakeConn, step: Step) => room.handle(c, { type: "step", step });
const moves = (s: GameState) => eng.legalSteps(s).filter((x) => x.type === "expansion" && x.action === "move");

describe("värden tar bort någon under drakens flytt", () => {
  test("en borttagen spelare som inte är flyttare får aldrig flytta eller bli actor", async () => {
    const g = await setup();
    const { room, anna, conn, ids } = g;
    const [p1, p2, p3] = ids;
    send(room, anna, { type: "placeTile", pos: { x: 3, y: 0 }, rotation: 0 });
    send(room, anna, { type: "noFigure" });
    expect(room.state!.turn.phase).toBe("dragon");
    send(room, anna, moves(room.state!)[0]!);
    expect(room.state!.turn.actor).toBe(p2);
    // Värden tar bort p3 som varken har turen eller flyttar just nu.
    room.disconnect(g.cy);
    room.handle(anna, { type: "hostAction", player: p3, action: "remove" });
    expect(room.state!.players.map((p) => p.id)).toEqual([p1, p2]);
    const seen: string[] = [];
    for (let i = 0; i < 10 && room.state!.turn.phase === "dragon"; i++) {
      const who = actorOf(room.state!);
      seen.push(who);
      expect(room.state!.players.some((p) => p.id === who)).toBe(true);
      send(room, conn(who), moves(room.state!)[0]!);
    }
    expect(seen).not.toContain(p3);
    expect(seen.length).toBeGreaterThan(0);
    expect(room.state!.turn.phase).not.toBe("dragon");
    room.dispose();
  });

  test("fen blir kvar på rutan när ägaren av pjäsen den stod intill tas bort", async () => {
    const g = await setup();
    const { room, anna, ids } = g;
    const p3 = ids[2];
    const s = structuredClone(room.state!);
    s.figures.find((f) => f.id === `${p3}:meeple:0`)!.location = { at: "feature", pos: { x: 2, y: 2 }, feature: "road0" };
    s.figures.find((f) => f.id === "fairy:0")!.location = { at: "figure", figure: `${p3}:meeple:0` };
    room.state = s;
    room.disconnect(g.cy);
    room.handle(anna, { type: "hostAction", player: p3, action: "remove" });
    const t = room.state!;
    expect(t.figures.some((f) => f.owner === p3)).toBe(false);
    expect(t.figures.find((f) => f.id === "fairy:0")!.location).toEqual({ at: "tile", pos: { x: 2, y: 2 } });
    room.dispose();
  });
});
