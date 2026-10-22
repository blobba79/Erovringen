// Fas 3 i servern: spara och fortsätta, varningar, statistik, emojis, "Visa för alla" och hand med flera brickor.

import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Step } from "../../src/shared/state";
import type { SavedGame, StartOptions } from "../../src/shared/messages";
import { ALLOWED_EMOJIS, type Room } from "../../src/server/room";
import { FakeConn, join as joinRoom, makeRoom, screen, startedRoom } from "./helpers";

const tmp = () => mkdtempSync(join(tmpdir(), "sparade-"));
const saveFiles = (dir: string) => readdirSync(dir).filter((f) => f.endsWith(".json") && f !== "startval.json");
const readSaved = (dir: string, f: string): SavedGame & Record<string, unknown> => JSON.parse(readFileSync(join(dir, f), "utf8"));

/** Enkel, deterministisk spelare: bricka, plats, pjäs om det går, bekräfta. */
function pick(steps: Step[]): Step | undefined {
  for (const t of ["chooseTile", "placeTile"]) {
    const s = steps.find((x) => x.type === t);
    if (s) return s;
  }
  const fig = steps.find((x) => x.type === "placeFigure");
  if (fig) return fig;
  for (const t of ["noFigure", "confirm"]) {
    const s = steps.find((x) => x.type === t);
    if (s) return s;
  }
  return steps[0];
}

function turn(room: Room, by: (id: string) => FakeConn): void {
  const before = room.state!.turn.player;
  for (let i = 0; i < 12 && room.state!.turn.player === before && !room.state!.finished; i++) {
    const c = by(room.state!.turn.player);
    room.handle(c, { type: "step", step: pick(c.last("legalSteps")!.steps)! });
  }
}

function playTurns(room: Room, by: (id: string) => FakeConn, n: number): number {
  let k = 0;
  while (k < n && !room.state!.finished) {
    turn(room, by);
    k++;
  }
  return k;
}

const opts = (o: Partial<StartOptions> = {}): StartOptions => ({
  expansions: ["base"], variants: {}, screenLang: "en", handSize: 1, showClosingTiles: false, ...o,
});

describe("spara och fortsätta", () => {
  test("filen skrivs efter varje bekräftat drag, inte efter delsteg", () => {
    const dir = tmp();
    const g = startedRoom({ savedDir: dir });
    expect(saveFiles(dir)).toEqual([]);
    const c = g.active();
    room_step(g.room, c, "placeTile");
    expect(saveFiles(dir)).toEqual([]); // ett delsteg är inte bekräftat
    turn(g.room, g.byPlayer);
    const files = saveFiles(dir);
    expect(files.length).toBe(1);
    const f = readSaved(dir, files[0]!);
    expect(f.version).toBe(1);
    expect(f.steps.at(-1)!.step.type).toBe("confirm");
    expect(f.steps.length).toBeGreaterThanOrEqual(2);
    expect(Object.keys(f.snapshot.board).length).toBe(Object.keys(g.room.state!.board).length);
    const n = f.steps.length;
    turn(g.room, g.byPlayer);
    expect(saveFiles(dir).length).toBe(1);
    expect(readSaved(dir, files[0]!).steps.length).toBeGreaterThan(n);
  });

  test("lobbyn visar sparade spel nyast först och oläsliga som readable: false", () => {
    const dir = tmp();
    const g = startedRoom({ savedDir: dir });
    playTurns(g.room, g.byPlayer, 2);
    const good = saveFiles(dir)[0]!;
    const old = readSaved(dir, good);
    writeFileSync(join(dir, "aaa-gammal.json"), JSON.stringify({ ...old, savedAt: "2001-01-01T00:00:00.000Z" }));
    writeFileSync(join(dir, "trasig.json"), "{ detta är inte json");
    writeFileSync(join(dir, "ny-version.json"), JSON.stringify({ ...old, version: 99 }));
    writeFileSync(join(dir, "okand-expansion.json"), JSON.stringify({ ...old, setup: { ...old.setup, expansions: ["base", "finnsinte"] } }));
    writeFileSync(join(dir, "tom.json"), "");
    writeFileSync(join(dir, "anteckning.txt"), "ignoreras");

    const room = makeRoom({ savedDir: dir });
    const host = joinRoom(room, "Anna", "red");
    const saves = host.last("lobby")!.saves;
    const byId = Object.fromEntries(saves.map((s) => [s.id, s]));
    expect(Object.keys(byId).sort()).toEqual(["aaa-gammal", good.slice(0, -5), "ny-version", "okand-expansion", "tom", "trasig"].sort());
    expect(byId["trasig"]!.readable).toBe(false);
    expect(byId["ny-version"]!.readable).toBe(false);
    expect(byId["okand-expansion"]!.readable).toBe(false);
    expect(byId["tom"]!.readable).toBe(false);
    const ok = byId[good.slice(0, -5)]!;
    expect(ok.readable).toBe(true);
    expect(ok.players.map((p) => p.name)).toEqual(["Anna", "Bo"]);
    expect(ok.tilesPlaced).toBe(Object.keys(g.room.state!.board).length);
    expect(ok.expansions).toEqual(["base"]);
    // äldst sist bland de läsbara
    const readable = saves.filter((s) => s.readable).map((s) => s.id);
    expect(readable.at(-1)).toBe("aaa-gammal");

    // en oläslig fil går inte att välja och krashar inte servern
    room.handle(host, { type: "setOptions", options: opts({ savedGame: "trasig" }) });
    expect(host.last("error")?.key).toBe("error.savedGameUnreadable");
    expect(host.last("lobby")!.options.savedGame).toBeUndefined();
    room.handle(host, { type: "setOptions", options: opts({ savedGame: "../../etc/passwd" }) });
    expect(host.last("lobby")!.options.savedGame).toBeUndefined();
  });

  test("fortsätt: platserna visas frånkopplade, tas av färgen, och spelet är som förut", () => {
    const dir = tmp();
    const g = startedRoom({ savedDir: dir, seed: () => 777 });
    playTurns(g.room, g.byPlayer, 7);
    const expectedState = JSON.stringify(g.room.state);
    const id = saveFiles(dir)[0]!.slice(0, -5);

    const warns: string[] = [];
    const room = makeRoom({ savedDir: dir, logger: { info() {}, error() {}, warn: (m) => void warns.push(m) } });
    const scr = screen(room);
    const bo = joinRoom(room, "Bosse", "BLUE"); // blir värd, färgen matchar Bo (versaler spelar ingen roll)
    room.handle(bo, { type: "setOptions", options: opts({ savedGame: id }) });
    const lobby = bo.last("lobby")!;
    expect(lobby.options.savedGame).toBe(id);
    expect(lobby.seats.map((s) => [s.name, s.connected])).toEqual([["Anna", false], ["Bo", true]]);
    expect(bo.last("welcome")!.player).toBe(g.b.player);
    expect(lobby.seats.find((s) => s.name === "Bo")!.isHost).toBe(true);
    // den frånkopplade platsen får en QR-kod för återanslutning
    expect(Object.keys(scr.last("screenInfo")!.seatUrls).sort()).toEqual([g.a.player, g.b.player].sort());

    // fel färg avvisas, rätt färg tar platsen
    const stranger = joinRoom(room, "Okänd", "green");
    expect(stranger.last("error")?.key).toBe("error.colorNotInSavedGame");
    const anna = joinRoom(room, "Annika", "red");
    expect(anna.last("welcome")!.player).toBe(g.a.player);
    expect(anna.last("welcome")!.isHost).toBe(false);

    room.handle(bo, { type: "startGame" });
    expect(JSON.stringify(room.state)).toBe(expectedState);
    expect(warns).toEqual([]); // spelet byggdes upp från delstegen, inte från ögonblicksbilden
    const by = (p: string) => (p === anna.player ? anna : bo);
    expect(by(room.state!.turn.player).last("legalSteps")!.steps.length).toBeGreaterThan(0);
    expect(anna.last("hand")!.tiles).toEqual(room.state!.players.find((p) => p.id === anna.player)!.hand);
    // spelet kan spelas vidare och skriver till samma fil
    playTurns(room, by, 2);
    expect(saveFiles(dir)).toEqual([`${id}.json`]);
  });

  test("värden kan ångra valet av sparat spel: platserna försvinner", () => {
    const dir = tmp();
    const g = startedRoom({ savedDir: dir });
    playTurns(g.room, g.byPlayer, 1);
    const id = saveFiles(dir)[0]!.slice(0, -5);
    const room = makeRoom({ savedDir: dir });
    const bo = joinRoom(room, "Bo", "blue");
    room.handle(bo, { type: "setOptions", options: opts({ savedGame: id }) });
    expect(bo.last("lobby")!.seats.length).toBe(2);
    room.handle(bo, { type: "setOptions", options: opts() });
    expect(bo.last("lobby")!.seats.length).toBe(1);
    expect(bo.last("lobby")!.options.savedGame).toBeUndefined();
  });

  test("om omspelningen inte stämmer används ögonblicksbilden", () => {
    const dir = tmp();
    const g = startedRoom({ savedDir: dir });
    playTurns(g.room, g.byPlayer, 5);
    const file = saveFiles(dir)[0]!;
    const id = file.slice(0, -5);
    const f = readSaved(dir, file);
    f.steps = f.steps.slice(2); // trasig stegföljd
    writeFileSync(join(dir, file), JSON.stringify(f));
    const room = makeRoom({ savedDir: dir });
    const anna = joinRoom(room, "Anna", "red");
    room.handle(anna, { type: "setOptions", options: opts({ savedGame: id }) });
    const bo = joinRoom(room, "Bo", "blue");
    room.handle(anna, { type: "startGame" });
    expect(JSON.stringify(room.state)).toBe(JSON.stringify(g.room.state));
    const by = (p: string) => (p === anna.player ? anna : bo);
    playTurns(room, by, 2);
    expect(room.state!.turn.player).toBeDefined();
    // efter en ögonblicksbild sparas inga steg som inte går att spela om
    expect(readSaved(dir, file).steps).toEqual([]);
  });

  test("startvalen kommer ihåg och lobbyn skickar vad som går att välja", () => {
    const dir = tmp();
    const room = makeRoom({ savedDir: dir });
    const a = joinRoom(room, "Anna", "red");
    const av = a.last("lobby")!.available;
    expect(av.expansions).toContain("base");
    expect(av.expansions).toContain("river");
    expect(av.languages).toContain("sv");
    expect(av.maxHandSize).toBeGreaterThan(1);
    room.handle(a, { type: "setOptions", options: opts({ expansions: ["base", "abbot"], handSize: 3, screenLang: "sv" }) });
    const again = makeRoom({ savedDir: dir });
    expect(again.options.expansions).toEqual(["base", "abbot"]);
    expect(again.options.handSize).toBe(3);
    // ett valt sparat spel hör inte till de ihågkomna valen
    expect(JSON.parse(readFileSync(join(dir, "startval.json"), "utf8")).savedGame).toBeUndefined();
  });

  test("hoppa över en spelare gör att spelet sparas som ögonblicksbild men fortsätter", () => {
    const dir = tmp();
    const g = startedRoom({ savedDir: dir });
    playTurns(g.room, g.byPlayer, 2);
    const absent = g.room.state!.turn.player;
    g.room.disconnect(g.byPlayer(absent));
    const host = g.byPlayer(absent) === g.a ? g.b : g.a;
    if (host.last("welcome")!.isHost === false) g.room.handle(host, { type: "rejoin", seatToken: host.token });
    g.room.handle(host, { type: "hostAction", player: absent, action: "skip" });
    const f = readSaved(dir, saveFiles(dir)[0]!);
    expect(f.steps).toEqual([]);
    expect(f.snapshot.turn.player).toBe(g.room.state!.turn.player);
  });
});

function room_step(room: Room, c: FakeConn, ...types: string[]): void {
  for (const t of types) {
    const s = c.last("legalSteps")!.steps.find((x) => x.type === t);
    if (!s) throw new Error(`inget delsteg ${t}`);
    room.handle(c, { type: "step", step: s });
  }
}

describe("statistik", () => {
  function finishGame(room: Room, by: (id: string) => FakeConn): number {
    let guard = 0;
    while (!room.state!.finished && guard++ < 400) turn(room, by);
    return guard;
  }

  test("skickas till alla när spelet är slut och stämmer med poängen", () => {
    const g = startedRoom({ seed: () => 4242 });
    expect(g.a.last("stats")).toBeUndefined();
    finishGame(g.room, g.byPlayer);
    expect(g.room.state!.finished).toBe(true);
    for (const c of [g.a, g.b, g.scr]) expect(c.all("stats").length).toBe(1);
    const st = g.a.last("stats")!.stats;
    expect(st.turns).toBeGreaterThan(10);
    expect(st.scoreTimeline.length).toBe(st.turns + 1);
    expect(st.scoreTimeline[0]).toEqual({ [g.a.player]: 0, [g.b.player]: 0 });
    for (const p of g.room.state!.players) {
      expect(st.scoreTimeline.at(-1)![p.id]).toBe(p.score);
      const sum = Object.values(st.pointsByReason[p.id] ?? {}).reduce((x, y) => x + y, 0);
      expect(sum).toBe(p.score);
    }
    const timeline = st.scoreTimeline.map((t) => t[g.a.player]!);
    expect([...timeline].sort((x, y) => x - y)).toEqual(timeline); // poängen sjunker aldrig
    for (const r of st.records) {
      expect(r.key.startsWith("stats.")).toBe(true);
      expect(r.value).toBeGreaterThan(0);
      expect([g.a.player, g.b.player]).toContain(r.player!);
    }
    expect(st.records.map((r) => r.key)).toContain("stats.biggestCity");
    // en ansluten som kommer senare får också statistiken
    const late = new FakeConn();
    g.room.handle(late, { type: "rejoin", seatToken: g.a.token });
    expect(late.last("stats")).toBeDefined();
  });

  test("ett fortsatt spel ger samma statistik som ett som aldrig avbrutits", () => {
    let clock = 0;
    const base = { seed: () => 31337, now: () => clock };
    const whole = startedRoom({ ...base, savedDir: tmp() });
    finishGame(whole.room, whole.byPlayer);
    clock = 90_000;
    const wholeStats = whole.a.last("stats")!.stats;

    clock = 0;
    const dir = tmp();
    const first = startedRoom({ ...base, savedDir: dir });
    playTurns(first.room, first.byPlayer, 25);
    clock = 40_000; // 40 s hade gått innan avbrottet
    playTurns(first.room, first.byPlayer, 1);
    const id = saveFiles(dir)[0]!.slice(0, -5);

    // nytt program, ny klocka
    clock = 1_000_000;
    const room = makeRoom({ ...base, savedDir: dir });
    const anna = joinRoom(room, "Anna", "red");
    room.handle(anna, { type: "setOptions", options: opts({ savedGame: id }) });
    const bo = joinRoom(room, "Bo", "blue");
    room.handle(anna, { type: "startGame" });
    const by = (p: string) => (p === anna.player ? anna : bo);
    finishGame(room, by);
    const stats = anna.last("stats")!.stats;
    expect(stats.durationSeconds).toBe(40); // klockan stod stilla efter återstarten
    expect({ ...stats, durationSeconds: 0 }).toEqual({ ...wholeStats, durationSeconds: 0 });
  });
});

describe("varningar", () => {
  test("bara den aktiva spelaren, bara om påslaget, efter varje delsteg och vid turens start", () => {
    const calls: string[] = [];
    const g = startedRoom({
      stepWarnings: (_s, player) => {
        calls.push(player);
        return [{ key: "warning.test", params: { n: calls.length } }];
      },
    });
    const first = g.active();
    const other = first === g.a ? g.b : g.a;
    expect(calls).toEqual([]); // ingen har slagit på varningar
    g.room.handle(other, { type: "setWarnings", on: true });
    expect(other.last("warnings")).toBeUndefined(); // inte aktiv: inga varningar
    g.room.handle(first, { type: "setWarnings", on: true });
    expect(first.last("warnings")!.warnings[0]!.key).toBe("warning.test");
    expect(calls).toEqual([first.player]);

    const w0 = first.all("warnings").length;
    room_step(g.room, first, "placeTile");
    expect(first.all("warnings").length).toBe(w0 + 1);
    expect(calls.length).toBe(2);
    // klar tur: nästa spelare har varningar påslagna och får dem vid turens start
    room_step(g.room, first, "noFigure", "confirm");
    expect(g.room.state!.turn.player).toBe(other.player);
    expect(other.last("warnings")).toBeDefined();
    expect(calls.at(-1)).toBe(other.player);
    expect(first.all("warnings").some((w) => w.warnings.length === 0)).toBe(false);

    // avslaget: en tom lista som rensar, sedan inga fler anrop
    g.room.handle(other, { type: "setWarnings", on: false });
    expect(other.last("warnings")!.warnings).toEqual([]);
    const n = calls.length;
    const w1 = other.all("warnings").length;
    room_step(g.room, other, "placeTile");
    expect(calls.length).toBe(n);
    expect(other.all("warnings").length).toBe(w1);
  });

  test("motorns stepWarnings anropas som standard utan att något går sönder", () => {
    const g = startedRoom();
    g.room.handle(g.active(), { type: "setWarnings", on: true });
    expect(g.active().last("warnings")?.warnings).toEqual([]);
  });

  test("ett fel i varningarna stoppar inte spelet", () => {
    const g = startedRoom({ stepWarnings: () => { throw new Error("bang"); } });
    g.room.handle(g.active(), { type: "setWarnings", on: true });
    room_step(g.room, g.active(), "placeTile");
    expect(g.active().last("warnings")?.warnings).toEqual([]);
  });
});

describe("emojis", () => {
  test("bara tillåtna emojis skickas vidare till alla", () => {
    const g = startedRoom();
    g.room.handle(g.a, { type: "react", emoji: ALLOWED_EMOJIS[0]! });
    for (const c of [g.a, g.b, g.scr]) expect(c.last("reaction")).toEqual({ type: "reaction", player: g.a.player, emoji: ALLOWED_EMOJIS[0]! });
    g.room.handle(g.b, { type: "react", emoji: "💩💩💩" });
    expect(g.b.last("error")?.key).toBe("error.badMessage");
    g.room.handle(g.b, { type: "react", emoji: "<script>" });
    expect(g.scr.all("reaction").length).toBe(1);
  });

  test("några per sekund per spelare", () => {
    let clock = 1000;
    const g = startedRoom({ now: () => clock });
    for (let i = 0; i < 10; i++) g.room.handle(g.a, { type: "react", emoji: "👍" });
    expect(g.scr.all("reaction").length).toBe(3);
    g.room.handle(g.b, { type: "react", emoji: "👍" }); // någon annan har egen kvot
    expect(g.scr.all("reaction").length).toBe(4);
    clock += 1001;
    g.room.handle(g.a, { type: "react", emoji: "👍" });
    expect(g.scr.all("reaction").length).toBe(5);
  });
});

describe("visa för alla", () => {
  test("den aktiva spelaren visar en bricka på hand för storskärmen", () => {
    const g = startedRoom();
    const act = g.active();
    const other = act === g.a ? g.b : g.a;
    const hand = act.last("hand")!.tiles;
    g.room.handle(act, { type: "showToAll", handIndex: 0 });
    expect(g.scr.last("shownTile")).toEqual({ type: "shownTile", player: act.player, tile: hand[0]! });
    expect(other.last("shownTile")?.tile).toBe(hand[0]!);
    g.room.handle(act, { type: "showToAll", handIndex: 5 });
    expect(act.last("error")?.key).toBe("error.invalidTile");
    g.room.handle(act, { type: "showToAll", handIndex: 0.5 });
    expect(act.last("error")?.key).toBe("error.invalidTile");
    g.room.handle(other, { type: "showToAll", handIndex: 0 });
    expect(other.last("error")?.key).toBe("error.notYourTurn");
  });

  test("gäller bara den aktuella turen, även för en storskärm som ansluter senare", () => {
    const g = startedRoom();
    const act = g.active();
    g.room.handle(act, { type: "showToAll", handIndex: 0 });
    const lateScreen = screen(g.room);
    expect(lateScreen.last("shownTile")).toBeDefined();
    turn(g.room, g.byPlayer);
    const lateScreen2 = screen(g.room);
    expect(lateScreen2.last("shownTile")).toBeUndefined();
  });
});

describe("hand med flera brickor", () => {
  function handRoom() {
    const dir = tmp();
    const room = makeRoom({ savedDir: dir });
    const scr = screen(room);
    const a = joinRoom(room, "Anna", "red");
    const b = joinRoom(room, "Bo", "blue");
    room.handle(a, { type: "setOptions", options: opts({ handSize: 3 }) });
    room.handle(a, { type: "startGame" });
    const by = (p: string) => (p === a.player ? a : b);
    return { room, scr, a, b, by, dir };
  }

  test("handen skickas till rätt spelare, med så många brickor som valt", () => {
    const g = handRoom();
    for (const c of [g.a, g.b]) {
      expect(c.last("hand")!.tiles.length).toBe(3);
      expect(c.last("hand")!.tiles).toEqual(g.room.state!.players.find((p) => p.id === c.player)!.hand);
    }
    expect(JSON.stringify(g.scr.msgs)).not.toContain(g.a.last("hand")!.tiles.join('","'));
    expect(g.scr.last("hand")).toBeUndefined();
  });

  test("chooseTile och exchangeTile fungerar hela vägen", () => {
    const g = handRoom();
    const act = g.by(g.room.state!.turn.player);
    const other = act === g.a ? g.b : g.a;
    const steps = act.last("legalSteps")!.steps;
    expect(steps.filter((s) => s.type === "chooseTile").length).toBeGreaterThan(0);
    const choose = steps.find((s): s is Extract<Step, { type: "chooseTile" }> => s.type === "chooseTile" && s.handIndex === 2)!;
    const wanted = act.last("hand")!.tiles[2]!;
    g.room.handle(act, { type: "step", step: choose });
    expect(act.last("legalSteps")!.steps.some((s) => s.type === "placeTile")).toBe(true);
    // ångra tar tillbaka valet
    g.room.handle(act, { type: "step", step: { type: "undo" } });
    expect(act.last("legalSteps")!.steps.some((s) => s.type === "chooseTile")).toBe(true);
    g.room.handle(act, { type: "step", step: choose });
    g.room.handle(act, { type: "step", step: act.last("legalSteps")!.steps.find((s) => s.type === "placeTile")! });
    expect(g.room.state!.board).toBeDefined();
    const placed = Object.values(g.room.state!.board).at(-1)!;
    expect(placed.type).toBe(wanted);
    room_step(g.room, act, "noFigure", "confirm");
    expect(g.room.state!.turn.player).toBe(other.player);
    // den som spelade fick en ny bricka, med handen kvar på tre; den andras hand kom inte till fel telefon
    expect(act.last("hand")!.tiles.length).toBe(3);
    expect(other.last("hand")?.tiles.length ?? 3).toBe(3);
    expect(act.all("hand").every((h) => h.tiles.length === 3 || h.tiles.length === 2)).toBe(true);

    // byte av bricka, om motorn erbjuder det
    const o = other.last("legalSteps")!.steps;
    const ex = o.find((s) => s.type === "exchangeTile");
    if (ex) {
      const before = g.room.state!.players.find((p) => p.id === other.player)!.hand.length;
      g.room.handle(other, { type: "step", step: ex });
      expect(g.room.state!.players.find((p) => p.id === other.player)!.hand.length).toBe(before);
      expect(other.last("hand")!.tiles).toEqual(g.room.state!.players.find((p) => p.id === other.player)!.hand);
      expect(other.last("error")).toBeUndefined();
    }
  });

  test("ett helt spel med tre brickor på hand går att spela och spara", () => {
    const g = handRoom();
    playTurns(g.room, g.by, 12);
    expect(g.a.last("hand")!.tiles.length).toBeGreaterThan(0);
    expect(existsSync(g.dir)).toBe(true);
    expect(saveFiles(g.dir).length).toBe(1);
    const f = readSaved(g.dir, saveFiles(g.dir)[0]!);
    expect(f.setup.handSize).toBe(3);
  });
});
