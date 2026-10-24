// Datorstyrda spelare i rummet: lobbyn, spel till slut och fortsatt spel från en sparfil.

import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { StartOptions } from "../../src/shared/messages";
import { realEngine } from "../engine/helpers";
import { chooseBotStep } from "../../src/server/bot";
import type { Room } from "../../src/server/room";
import { FakeConn, join as joinRoom, makeRoom, screen } from "./helpers";

const opts = (o: Partial<StartOptions> = {}): StartOptions => ({
  expansions: ["base"], variants: {}, screenLang: "en", handSize: 1, showClosingTiles: false, ...o,
});
const tmp = () => mkdtempSync(join(tmpdir(), "bottar-"));
const eng = realEngine();
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/** Värden spelas av testet (med botens strategi); övriga platser är bottar som rummet spelar. */
async function playToEnd(room: Room, host: FakeConn, maxMs = 120_000): Promise<void> {
  const t0 = Date.now();
  while (!room.state!.finished) {
    if (Date.now() - t0 > maxMs) throw new Error("spelet blev inte färdigt i tid");
    if (room.state!.turn.player === host.player) {
      room.handle(host, { type: "step", step: chooseBotStep(eng, room.state!) });
    } else {
      await sleep(0);
    }
  }
}

describe("lobbyn", () => {
  test("bara värden kan lägga till och ta bort datorspelare, och bara i lobbyn", () => {
    const room = makeRoom();
    const scr = screen(room);
    const host = joinRoom(room, "Anna", "#d62828");
    const guest = joinRoom(room, "Bo", "#2a6fdb");
    room.handle(guest, { type: "addBot" });
    expect(guest.last("error")?.key).toBe("error.hostOnly");
    room.handle(host, { type: "addBot" });
    room.handle(host, { type: "addBot" });
    const seats = host.last("lobby")!.seats;
    expect(seats).toHaveLength(4);
    const bots = seats.filter((s) => s.bot);
    expect(bots.map((b) => b.name)).toEqual(["Dator 1", "Dator 2"]);
    expect(bots.every((b) => b.connected && !b.isHost)).toBe(true);
    expect(new Set(seats.map((s) => s.color)).size).toBe(4); // lediga, olika färger
    // ingen QR-kod för datorspelare, och skärmen väntar inte på dem
    expect(Object.keys(scr.last("screenInfo")!.seatUrls).sort()).toEqual([host.player, guest.player].sort());
    expect(seats.filter((s) => s.isHost)).toHaveLength(1);

    room.handle(guest, { type: "removeBot", player: bots[0]!.player });
    expect(guest.last("error")?.key).toBe("error.hostOnly");
    room.handle(host, { type: "removeBot", player: guest.player });
    expect(host.last("error")?.key).toBe("error.notABot");
    room.handle(host, { type: "removeBot", player: "finns-inte" });
    expect(host.last("error")?.key).toBe("error.unknownPlayer");
    room.handle(host, { type: "removeBot", player: bots[0]!.player });
    expect(host.last("lobby")!.seats.map((s) => s.name)).toEqual(["Anna", "Bo", "Dator 2"]);
    // namnen återanvänds inte i onödan
    room.handle(host, { type: "addBot" });
    expect(host.last("lobby")!.seats.map((s) => s.name)).toEqual(["Anna", "Bo", "Dator 2", "Dator 1"]);

    room.handle(host, { type: "startGame" });
    expect(room.state!.setup.players.filter((p) => p.bot)).toHaveLength(2);
    room.handle(host, { type: "addBot" });
    expect(host.last("error")?.key).toBe("error.gameStarted");
    room.handle(host, { type: "removeBot", player: bots[1]!.player });
    expect(host.last("error")?.key).toBe("error.gameStarted");
    room.dispose();
  });

  test("antalet platser begränsas av samma maxgräns som för människor", () => {
    const room = makeRoom({ maxPlayers: 3 });
    const host = joinRoom(room, "Anna", "#d62828");
    room.handle(host, { type: "addBot" });
    room.handle(host, { type: "addBot" });
    expect(host.last("lobby")!.seats).toHaveLength(3);
    room.handle(host, { type: "addBot" });
    expect(host.last("error")?.key).toBe("error.roomFull");
    expect(joinRoom(room, "Bo", "#abcdef").last("error")?.key).toBe("error.roomFull");
  });

  test("datorspelaren får språkets namn, och ingen kan återansluta som den", () => {
    const room = makeRoom();
    const host = new FakeConn();
    room.handle(host, { type: "join", gameCode: room.gameCode, name: "Anna", color: "red", lang: "sv" });
    room.handle(host, { type: "addBot" });
    expect(host.last("lobby")!.seats[1]!.name).toBe("Dator 1");
    const stranger = new FakeConn();
    room.handle(stranger, { type: "rejoin", seatToken: "" });
    expect(stranger.last("error")?.key).toBe("error.badSeatToken");
  });
});

describe("spel med datorspelare", () => {
  const cases: { n: number; hand: number }[] = [
    { n: 2, hand: 1 }, { n: 3, hand: 3 }, { n: 4, hand: 1 }, { n: 2, hand: 3 },
  ];
  for (const { n, hand } of cases) {
    test(`${n} spelare, ${hand} brickor på hand, med floden och abboten, spelas till slutet`, async () => {
      const dir = tmp();
      const room = makeRoom({ savedDir: dir, botPauseMs: 0, seed: () => 100 + n * 10 + hand });
      const host = joinRoom(room, "Anna", "#d62828");
      room.handle(host, { type: "setOptions", options: opts({ expansions: ["base", "river", "abbot"], handSize: hand }) });
      for (let i = 1; i < n; i++) room.handle(host, { type: "addBot" });
      room.handle(host, { type: "startGame" });
      expect(room.state!.setup.players.filter((p) => p.bot)).toHaveLength(n - 1);
      await playToEnd(room, host);
      expect(room.state!.finished).toBe(true);
      expect(room.state!.players.some((p) => p.score > 0)).toBe(true);
      expect(room.state!.players.every((p) => p.hand.length === 0)).toBe(true);
      room.dispose();
    }, 180_000);
  }

  test("rummet stängs: inga fler botdrag och inga timers kvar", async () => {
    const room = makeRoom({ botPauseMs: 5 });
    const host = joinRoom(room, "Anna", "#d62828");
    room.handle(host, { type: "addBot" });
    room.handle(host, { type: "startGame" });
    // värdens tur först eller sist: se till att boten är på tur
    while (!room.state!.setup.players.find((p) => p.id === room.state!.turn.player)!.bot) {
      room.handle(host, { type: "step", step: chooseBotStep(eng, room.state!) });
    }
    room.dispose();
    const snapshot = JSON.stringify(room.state);
    await sleep(60);
    expect(JSON.stringify(room.state)).toBe(snapshot);
  });

  test("botten gör ett delsteg i taget med paus emellan", async () => {
    const room = makeRoom({ botPauseMs: 40 });
    const host = joinRoom(room, "Anna", "#d62828");
    room.handle(host, { type: "addBot" });
    room.handle(host, { type: "startGame" });
    while (!room.state!.setup.players.find((p) => p.id === room.state!.turn.player)!.bot) {
      room.handle(host, { type: "step", step: chooseBotStep(eng, room.state!) });
    }
    const botId = room.state!.turn.player;
    expect(room.state!.turn.pending).toHaveLength(0);
    await sleep(15);
    expect(room.state!.turn.pending).toHaveLength(0); // ännu ingen paus har gått
    await sleep(60);
    expect(room.state!.turn.pending.length > 0 || room.state!.turn.player !== botId).toBe(true);
    room.dispose();
  });

  test("värdens hoppa över och ta bort fungerar på datorspelare", async () => {
    const room = makeRoom({ botPauseMs: 100_000 });
    const host = joinRoom(room, "Anna", "#d62828");
    room.handle(host, { type: "addBot" });
    room.handle(host, { type: "addBot" });
    room.handle(host, { type: "startGame" });
    while (!room.state!.setup.players.find((p) => p.id === room.state!.turn.player)!.bot) {
      room.handle(host, { type: "step", step: chooseBotStep(eng, room.state!) });
    }
    const botId = room.state!.turn.player;
    room.handle(host, { type: "hostAction", player: botId, action: "skip" });
    expect(room.state!.turn.player).not.toBe(botId);
    room.handle(host, { type: "hostAction", player: botId, action: "remove" });
    expect(room.state!.players.map((p) => p.id)).not.toContain(botId);
    expect(room.state!.setup.players.map((p) => p.id)).not.toContain(botId);
    room.dispose();
  });
});

describe("sparade spel", () => {
  test("datorspelarna sparas och spelar vidare när spelet fortsätter", async () => {
    const dir = tmp();
    const room = makeRoom({ savedDir: dir, botPauseMs: 0, seed: () => 4242 });
    const host = joinRoom(room, "Anna", "#d62828");
    room.handle(host, { type: "setOptions", options: opts({ expansions: ["base", "river", "abbot"] }) });
    room.handle(host, { type: "addBot" });
    room.handle(host, { type: "addBot" });
    room.handle(host, { type: "startGame" });
    // spela tills ett antal brickor ligger
    const t0 = Date.now();
    // ... och stanna när värden står inför en ny tur, så att inget drag är halvfärdigt
    while (Object.keys(room.state!.board).length < 14 || room.state!.turn.player !== host.player || room.state!.turn.pending.length > 0) {
      if (Date.now() - t0 > 60_000) throw new Error("för långsamt");
      if (room.state!.turn.player === host.player) room.handle(host, { type: "step", step: chooseBotStep(eng, room.state!) });
      else await sleep(0);
    }
    room.dispose();
    const files = readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "startval.json");
    expect(files).toHaveLength(1);
    const id = files[0]!.slice(0, -5);
    const saved = JSON.parse(readFileSync(join(dir, files[0]!), "utf8"));
    expect(saved.setup.players.map((p: { bot?: boolean }) => !!p.bot)).toEqual([false, true, true]);
    const placed = Object.keys(room.state!.board).length;

    const room2 = makeRoom({ savedDir: dir, botPauseMs: 0 });
    const scr = screen(room2);
    const host2 = joinRoom(room2, "Annika", "#d62828");
    room2.handle(host2, { type: "setOptions", options: opts({ savedGame: id }) });
    const lobby = host2.last("lobby")!;
    expect(lobby.seats.map((s) => [s.bot ?? false, s.connected])).toEqual([[false, true], [true, true], [true, true]]);
    // ingen QR-kod för datorspelarna, och inga fler får läggas till eller tas bort
    expect(Object.keys(scr.last("screenInfo")!.seatUrls)).toEqual([host2.player]);
    room2.handle(host2, { type: "addBot" });
    expect(host2.last("error")?.key).toBe("error.savedGameNoBots");
    room2.handle(host2, { type: "removeBot", player: lobby.seats[1]!.player });
    expect(host2.last("error")?.key).toBe("error.savedGameNoBots");
    // en människa kan inte ta en datorspelares plats
    expect(joinRoom(room2, "Inkräktare", lobby.seats[1]!.color).last("error")?.key).toBe("error.colorNotInSavedGame");
    expect(host2.last("lobby")!.seats).toHaveLength(3);

    room2.handle(host2, { type: "startGame" });
    expect(room2.state!.setup.players.filter((p) => p.bot)).toHaveLength(2);
    expect(scr.last("waitingFor")?.seats ?? []).toEqual([]);
    // botarna spelar vidare efter värdens tur
    const t1 = Date.now();
    while (Object.keys(room2.state!.board).length < placed + 6) {
      if (Date.now() - t1 > 60_000) throw new Error("för långsamt");
      if (room2.state!.turn.player === host2.player) room2.handle(host2, { type: "step", step: chooseBotStep(eng, room2.state!) });
      else await sleep(0);
    }
    expect(Object.keys(room2.state!.board).length).toBeGreaterThanOrEqual(placed + 6);
    room2.dispose();
  }, 180_000);
});
