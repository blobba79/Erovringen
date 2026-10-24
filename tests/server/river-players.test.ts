// Floden i spelrummet: ta bort och hoppa över spelare mitt i flodfasen.

import { describe, expect, test } from "bun:test";
import type { StartOptions } from "../../src/shared/messages";
import type { GameState } from "../../src/shared/state";
import type { Room } from "../../src/server/room";
import { TILE_DATA } from "../../src/tiles/index";
import { FakeConn, join, makeRoom, playTurn, screen } from "./helpers";

const RIVER = new Set((TILE_DATA.river as { tiles: { id: string }[] }).tiles.map((t) => t.id));
const isRiver = (t: string) => RIVER.has(t);
const dealtOf = (s: GameState) => (s.ext.river as { dealt?: boolean }).dealt === true;

function riverRoom(n: number, handSize: number) {
  const room = makeRoom();
  screen(room);
  const specs = [["A", "red"], ["B", "blue"], ["C", "green"]] as const;
  const conns = specs.slice(0, n).map(([name, color]) => join(room, name, color));
  const options: StartOptions = { expansions: ["base", "river"], variants: {}, screenLang: "en", handSize, showClosingTiles: false };
  room.handle(conns[0]!, { type: "setOptions", options });
  room.handle(conns[0]!, { type: "startGame" });
  const byPlayer = (id: string) => conns.find((c) => c.player === id)!;
  return { room, conns, host: conns[0]!, byPlayer };
}

const count = (s: GameState) => s.drawPile.length + s.players.reduce((n, p) => n + p.hand.length, 0);
const lakeOf = (s: GameState) => [...s.drawPile].reverse().find(isRiver)!;

/** Under flodfasen: inga vanliga brickor på hand eller före sjön i högen. */
function expectRiverOrder(s: GameState): void {
  if (dealtOf(s)) return;
  for (const p of s.players) for (const t of p.hand) expect(isRiver(t)).toBe(true);
  const lakeAt = s.drawPile.indexOf(lakeOf(s));
  if (lakeAt >= 0) for (const t of s.drawPile.slice(0, lakeAt)) expect(isRiver(t)).toBe(true);
}

function playOn(room: Room, byPlayer: (id: string) => FakeConn, maxTurns = 400): void {
  for (let i = 0; i < maxTurns && !room.state!.finished; i++) {
    expectRiverOrder(room.state!);
    expect(room.state!.players.some((p) => p.id === room.state!.turn.player)).toBe(true);
    playTurn(room, byPlayer);
  }
}

describe("ta bort en spelare mitt i floden", () => {
  for (const handSize of [1, 3]) {
    for (const who of [1, 2, 0]) {
      test(`3 spelare, handSize ${handSize}, ta bort plats ${who}: flodordningen består och spelet tar slut`, () => {
        const { room, conns, host, byPlayer } = riverRoom(3, handSize);
        // spela ett par turer så att floden har börjat
        const lake = lakeOf(room.state!);
        for (let i = 0; i < 2; i++) playTurn(room, byPlayer);
        expect(dealtOf(room.state!)).toBe(false);
        // värden kan inte ta bort sig själv med den här vägen; ta en annan om värden är vald
        const target = who === 0 ? conns[2]! : conns[who]!;
        room.disconnect(target);
        const before = count(room.state!);
        room.handle(host, { type: "hostAction", player: target.player, action: "remove" });
        const s = room.state!;
        expect(s.players.map((p) => p.id)).not.toContain(target.player);
        expect(s.players).toHaveLength(2);
        expect(s.players.some((p) => p.id === s.turn.player)).toBe(true);
        expect(count(s)).toBe(before);
        expectRiverOrder(s);
        playOn(room, byPlayer);
        expect(room.state!.finished).toBe(true);
        // alla flodbrickor lades före de vanliga: sjön ligger på kartan
        expect(Object.values(room.state!.board).some((t) => t.type === lake)).toBe(true);
      });
    }
  }

  test("tur till en spelare som tas bort: två spelare, handSize 3, tom flodstapel", () => {
    const { room, conns, host } = riverRoom(2, 3);
    const s = room.state!;
    const a = s.players.find((p) => p.id === conns[1]!.player)!; // B är inte värd
    const b = s.players.find((p) => p.id === host.player)!;
    const all = [...s.drawPile, ...s.players.flatMap((p) => p.hand)];
    const lake = lakeOf(s);
    const stack = all.filter((t) => isRiver(t) && t !== lake);
    const rest = all.filter((t) => !isRiver(t));
    a.hand = [stack[0]!, stack[1]!];
    b.hand = [];
    s.drawPile = [lake, ...rest];
    s.turn = { player: a.id, phase: "placing", pending: [] } as never;
    delete (s.ext.base as { snapshot?: unknown }).snapshot;
    room.disconnect(conns[1]!);
    room.handle(host, { type: "hostAction", player: a.id, action: "remove" });
    const t = room.state!;
    expect(t.players.map((p) => p.id)).toEqual([host.player]);
    expect(t.turn.player).toBe(host.player);
    expect(t.players[0]!.hand.sort()).toEqual([stack[0]!, stack[1]!].sort());
    expect(t.drawPile[0]).toBe(lake);
  });
});

describe("gammal ögonblicksbild med tomma händer", () => {
  test("flodens utdelning fyller på alla händer upp till handSize", () => {
    const { room, conns, byPlayer } = riverRoom(3, 3);
    const s = room.state!;
    // som före ändringen: bara den som har tur har brickor
    const cur = s.players.find((p) => p.id === s.turn.player)!;
    for (const p of s.players) if (p !== cur) s.drawPile.unshift(...p.hand.splice(0));
    const before = count(s);
    playTurn(room, byPlayer);
    const t = room.state!;
    expect(count(t)).toBe(before - 1);
    for (const p of t.players) expect(p.hand.length).toBe(3);
    expect(conns.length).toBe(3);
    expectRiverOrder(t);
    // inte samma spelare igen
    expect(t.turn.player).not.toBe(cur.id);
  });
});

describe("hoppa över en spelare under floden", () => {
  test("den frånvarandes flodbrickor går tillbaka och spelet fortsätter hos någon annan", () => {
    const { room, conns, host } = riverRoom(2, 3);
    const s = room.state!;
    const absent = s.players.find((p) => p.id === conns[1]!.player)!;
    const other = s.players.find((p) => p.id === host.player)!;
    const all = [...s.drawPile, ...s.players.flatMap((p) => p.hand)];
    const lake = lakeOf(s);
    const stack = all.filter((t) => isRiver(t) && t !== lake);
    const rest = all.filter((t) => !isRiver(t));
    absent.hand = [stack[0]!, stack[1]!];
    other.hand = [stack[2]!];
    s.drawPile = [lake, ...rest];
    s.turn = { player: absent.id, phase: "placing", pending: [] } as never;
    delete (s.ext.base as { snapshot?: unknown }).snapshot;
    room.disconnect(conns[1]!);
    room.handle(host, { type: "hostAction", player: absent.id, action: "skip" });
    const t = room.state!;
    expect(t.turn.player).toBe(other.id);
    // fylls i tur och ordning från nästa spelare, så den andra får flest
    expect(t.players.find((p) => p.id === other.id)!.hand.length).toBe(2);
    expect(t.players.flatMap((p) => p.hand).sort()).toEqual([stack[0]!, stack[1]!, stack[2]!].sort());
    expect(count(t)).toBe(count(s));
  });

  test("utanför flodfasen behåller den överhoppade sin hand", () => {
    const { room, conns, host } = riverRoom(2, 3);
    const s = room.state!;
    (s.ext.river as { dealt?: boolean }).dealt = true;
    const absentId = conns[1]!.player;
    s.turn = { player: absentId, phase: "placing", pending: [] } as never;
    delete (s.ext.base as { snapshot?: unknown }).snapshot;
    const hand = [...s.players.find((p) => p.id === absentId)!.hand].sort();
    room.disconnect(conns[1]!);
    room.handle(host, { type: "hostAction", player: absentId, action: "skip" });
    expect(room.state!.players.find((p) => p.id === absentId)!.hand.sort()).toEqual(hand);
    expect(room.state!.turn.player).toBe(host.player);
  });
});
