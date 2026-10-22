import { describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FakeConn, join as joinRoom, makeRoom, playTurn, screen, startedRoom } from "./helpers";

describe("lobby", () => {
  test("första spelaren är värd, färger är unika, fel spelkod avvisas", () => {
    const room = makeRoom();
    const bad = new FakeConn();
    room.handle(bad, { type: "join", gameCode: "fel", name: "X", color: "red", lang: "en" });
    expect(bad.last("error")?.key).toBe("error.badGameCode");

    const a = joinRoom(room, "Anna", "red");
    const b = joinRoom(room, "Bo", "Red");
    expect(a.last("welcome")?.isHost).toBe(true);
    expect(b.last("error")?.key).toBe("error.colorTaken");
    const c = joinRoom(room, "Cia", "blue");
    expect(c.last("welcome")?.isHost).toBe(false);
    expect(c.token).not.toBe(a.token);
    const lobby = a.last("lobby")!;
    expect(lobby.seats.map((s) => s.name)).toEqual(["Anna", "Cia"]);
    expect(lobby.gameCode).toBe("testkod");
  });

  test("storskärmen godtas bara från localhost och får adresser med hemliga koder", () => {
    const room = makeRoom({ baseUrl: "http://10.0.0.5:8765" });
    const remote = new FakeConn(false);
    room.handle(remote, { type: "helloScreen" });
    expect(remote.last("error")?.key).toBe("error.screenLocalOnly");
    const scr = screen(room);
    const a = joinRoom(room, "Anna", "red");
    const info = scr.last("screenInfo")!;
    expect(info.joinUrl).toBe("http://10.0.0.5:8765/p?g=testkod");
    expect(info.seatUrls[a.player]).toBe(`http://10.0.0.5:8765/p?s=${a.token}`);
    // telefoner får aldrig adresserna
    expect(a.last("screenInfo")).toBeUndefined();
  });

  test("bara värden sätter startval, och de rensas och sparas", () => {
    const dir = mkdtempSync(join(tmpdir(), "sparade-"));
    const room = makeRoom({ savedDir: dir });
    const a = joinRoom(room, "Anna", "red");
    const b = joinRoom(room, "Bo", "blue");
    const opts = { expansions: ["river", "finnsinte"], variants: { "river.deadEnds": "forbid", "river.x": "y" }, screenLang: "sv", handSize: 99, showClosingTiles: true } as never;
    room.handle(b, { type: "setOptions", options: opts });
    expect(b.last("error")?.key).toBe("error.hostOnly");
    room.handle(a, { type: "setOptions", options: opts });
    const o = a.last("lobby")!.options;
    expect(o.expansions).toEqual(["base", "river"]);
    expect(o.variants).toEqual({ "river.deadEnds": "forbid" });
    expect(o.handSize).toBe(8);
    expect(JSON.parse(readFileSync(join(dir, "startval.json"), "utf8")).screenLang).toBe("sv");
    // nästa rum minns
    expect(makeRoom({ savedDir: dir }).options.showClosingTiles).toBe(true);
  });

  test("värdrollen går vidare när värden tappar anslutningen", () => {
    const room = makeRoom();
    const a = joinRoom(room, "Anna", "red");
    const b = joinRoom(room, "Bo", "blue");
    room.disconnect(a);
    expect(b.last("welcome")?.isHost).toBe(true);
    expect(b.last("lobby")!.seats.find((s) => s.player === a.player)?.connected).toBe(false);
    // Anna kommer tillbaka men är inte längre värd
    const a2 = new FakeConn();
    room.handle(a2, { type: "rejoin", seatToken: a.token });
    expect(a2.last("welcome")?.isHost).toBe(false);
  });

  test("start kräver värd och minst två spelare", () => {
    const room = makeRoom();
    const a = joinRoom(room, "Anna", "red");
    room.handle(a, { type: "startGame" });
    expect(a.last("error")?.key).toBe("error.tooFewPlayers");
    const b = joinRoom(room, "Bo", "blue");
    room.handle(b, { type: "startGame" });
    expect(b.last("error")?.key).toBe("error.hostOnly");
    room.handle(a, { type: "startGame" });
    expect(room.phase).toBe("playing");
    const late = new FakeConn();
    room.handle(late, { type: "join", gameCode: "testkod", name: "Sen", color: "green", lang: "en" });
    expect(late.last("error")?.key).toBe("error.gameStarted");
  });
});

describe("spelet", () => {
  test("starten skickar rätt saker till rätt mottagare utan hemligheter", () => {
    const { room, scr, a, b, active } = startedRoom();
    for (const c of [scr, a, b]) {
      const st = c.last("state")!;
      const json = JSON.stringify(st);
      expect(json).not.toContain("drawPile\"");
      expect(json).not.toContain("\"rng\"");
      expect(json).not.toContain("snapshot");
      expect(st.state.players.every((p) => p.handCount === 1 && !("hand" in p))).toBe(true);
      const total = Object.values(st.state.remaining).reduce((x, y) => x + y, 0);
      expect(total).toBe(st.state.drawPileCount + 2);
    }
    expect(a.last("hand")!.tiles).toHaveLength(1);
    expect(a.last("hand")!.tiles[0]).toBe(room.state!.players.find((p) => p.id === a.player)!.hand[0]!);
    const act = active();
    const other = act === a ? b : a;
    expect(act.last("legalSteps")!.steps.length).toBeGreaterThan(0);
    expect(other.last("legalSteps")!.steps).toEqual([]);
    expect(scr.last("camera")).toBeDefined();
    expect(scr.last("legalSteps")).toBeUndefined();
    expect(scr.last("hand")).toBeUndefined();
  });

  test("bara den aktiva spelaren får göra delsteg; ogiltiga steg avvisas med språknyckel", () => {
    const { room, a, b, active } = startedRoom();
    const act = active();
    const other = act === a ? b : a;
    room.handle(other, { type: "step", step: { type: "noFigure" } });
    expect(other.last("error")?.key).toBe("error.notYourTurn");
    room.handle(act, { type: "step", step: { type: "confirm" } });
    expect(act.last("error")?.key).toBe("error.illegalStep");
    room.handle(act, { type: "step", step: { type: "placeTile", pos: { x: 99, y: 99 }, rotation: 0 } });
    expect(act.last("error")).toBeDefined();
    room.handle(act, { type: "step", step: { type: "placeTile", pos: { x: 1, y: 0 }, rotation: 45 as never } });
    expect(act.last("error")?.key).toBe("error.illegalPlacement");
  });

  test("en hel tur: state till alla, events vid bekräftelse, turen går vidare", () => {
    const { room, scr, a, b, byPlayer, active } = startedRoom();
    const first = room.state!.turn.player;
    const act = active();
    // delsteg före bekräftelse ger inga events
    const step = act.last("legalSteps")!.steps.find((s) => s.type === "placeTile")!;
    room.handle(act, { type: "step", step });
    expect(act.all("events")).toHaveLength(0);
    expect(Object.keys(scr.last("state")!.state.board)).toHaveLength(2);
    playTurn(room, byPlayer);
    expect(room.state!.turn.player).not.toBe(first);
    const ev = scr.last("events")!.events;
    expect(ev.some((e) => e.type === "tilePlaced")).toBe(true);
    expect(ev.some((e) => e.type === "turnStarted")).toBe(true);
    expect(b.last("events")).toBeDefined();
    // ny aktiv spelare får legalSteps, gamla får tom lista
    expect(byPlayer(room.state!.turn.player).last("legalSteps")!.steps.length).toBeGreaterThan(0);
    expect(byPlayer(first).last("legalSteps")!.steps).toEqual([]);
    // handen skickas om efter påfyllning
    expect(byPlayer(first).last("hand")!.tiles).toHaveLength(1);
    expect(a.last("state")!.state.turn.player).toBe(room.state!.turn.player);
  });

  test("förhandsvisning från aktiv spelare går till storskärmen och nollställs av nästa steg", () => {
    const { room, scr, a, b, active } = startedRoom();
    const act = active();
    const other = act === a ? b : a;
    room.handle(other, { type: "preview", preview: { edge: 1 } });
    expect(other.last("error")?.key).toBe("error.notYourTurn");
    room.handle(act, { type: "preview", preview: { edge: 1, spots: [{ x: 1, y: 0 }] } });
    expect(scr.last("preview")).toEqual({ type: "preview", player: act.player, preview: { edge: 1, spots: [{ x: 1, y: 0 }] } });
    const step = act.last("legalSteps")!.steps.find((s) => s.type === "placeTile")!;
    room.handle(act, { type: "step", step });
    expect(scr.last("preview")!.preview).toEqual({});
  });

  test("react och showToAll vidarebefordras", () => {
    const { room, scr, a, b, active } = startedRoom();
    const act = active();
    const other = act === a ? b : a;
    room.handle(other, { type: "react", emoji: "👍" });
    expect(scr.last("reaction")).toEqual({ type: "reaction", player: other.player, emoji: "👍" });
    expect(act.last("reaction")).toBeDefined();
    room.handle(act, { type: "showToAll", handIndex: 0 });
    expect(scr.last("shownTile")!.tile).toBe(act.last("hand")!.tiles[0]!);
    room.handle(other, { type: "showToAll", handIndex: 0 });
    expect(other.last("error")?.key).toBe("error.notYourTurn");
  });

  test("hela spelet kan spelas till slut med enkla drag", () => {
    const { room, scr, byPlayer } = startedRoom();
    let guard = 0;
    while (!room.state!.finished && guard++ < 300) playTurn(room, byPlayer);
    expect(room.state!.finished).toBe(true);
    expect(scr.last("events")!.events.some((e) => e.type === "gameEnded")).toBe(true);
  });
});

describe("återanslutning och spelare som lämnar", () => {
  test("frånkopplad plats syns på storskärmen och rejoin ger fullt tillstånd", () => {
    const { room, scr, a, b } = startedRoom();
    room.disconnect(b);
    expect(scr.last("waitingFor")!.seats.map((s) => s.player)).toEqual([b.player]);
    const b2 = new FakeConn();
    room.handle(b2, { type: "rejoin", seatToken: b.token });
    expect(b2.last("welcome")!.player).toBe(b.player);
    expect(b2.last("state")).toBeDefined();
    expect(b2.last("hand")!.tiles).toHaveLength(1);
    expect(scr.last("waitingFor")!.seats).toEqual([]);
    // gamla anslutningen har inget inflytande längre
    room.disconnect(b);
    expect(scr.last("waitingFor")!.seats).toEqual([]);
    expect(a.last("error")).toBeUndefined();
    room.handle(new FakeConn(), { type: "rejoin", seatToken: "fel" });
  });

  test("ny storskärm får allt efter omladdning", () => {
    const { room } = startedRoom();
    const s2 = screen(room);
    expect(s2.last("state")).toBeDefined();
    expect(s2.last("camera")).toBeDefined();
    expect(s2.last("screenInfo")).toBeDefined();
  });

  test("värden kan hoppa över den aktiva spelaren när hen är borta", () => {
    const { room, a, b, byPlayer } = startedRoom();
    const missing = room.state!.turn.player;
    const other = missing === a.player ? b : a;
    const host = a; // a är värd
    // värden kan inte hoppa över någon som är ansluten
    room.handle(host, { type: "hostAction", player: missing, action: "skip" });
    if (missing === host.player) {
      room.disconnect(byPlayer(missing)); // värdrollen går till den andra
      room.handle(other, { type: "hostAction", player: missing, action: "skip" });
    } else {
      expect(host.last("error")?.key).toBe("error.playerConnected");
      room.disconnect(byPlayer(missing));
      room.handle(host, { type: "hostAction", player: missing, action: "skip" });
    }
    expect(room.state!.turn.player).toBe(other.player);
    expect(room.state!.finished).toBe(false);
  });

  test("ta bort: pjäser och brickor försvinner, spelet går vidare", () => {
    const { room, scr, a, b } = startedRoom();
    // se till att b är den frånkopplade och inte den aktiva om möjligt
    const target = b;
    room.disconnect(target);
    const tilesBefore = room.state!.drawPile.length + room.state!.players.reduce((n, p) => n + p.hand.length, 0);
    room.handle(a, { type: "hostAction", player: target.player, action: "remove" });
    expect(room.state!.players.map((p) => p.id)).toEqual([a.player]);
    expect(room.state!.figures.every((f) => f.owner === a.player)).toBe(true);
    const tilesAfter = room.state!.drawPile.length + room.state!.players.reduce((n, p) => n + p.hand.length, 0);
    expect(tilesAfter).toBeGreaterThanOrEqual(tilesBefore - 1);
    expect(room.state!.turn.player).toBe(a.player);
    expect(room.seats.map((s) => s.player)).toEqual([a.player]);
    expect(scr.last("state")!.state.players).toHaveLength(1);
  });

  test("avbrutna delsteg backas när en frånvarande aktiv spelare hoppas över", () => {
    const { room, a, b, byPlayer, active } = startedRoom();
    const act = active();
    const step = act.last("legalSteps")!.steps.find((s) => s.type === "placeTile")!;
    room.handle(act, { type: "step", step });
    expect(Object.keys(room.state!.board)).toHaveLength(2);
    const actId = act.player;
    room.disconnect(byPlayer(actId));
    const helper = actId === a.player ? b : a;
    room.handle(helper, { type: "hostAction", player: actId, action: "skip" });
    expect(Object.keys(room.state!.board)).toHaveLength(1);
    expect(room.state!.turn.player).toBe(helper.player);
  });
});

describe("kamera", () => {
  test("bara aktiv spelare styr; pan, zoom och rotation räknas om på servern", () => {
    const { room, scr, a, b, active } = startedRoom({ cameraIntervalMs: 0 });
    const act = active();
    const other = act === a ? b : a;
    room.handle(other, { type: "map", control: { type: "zoom", factor: 2 } });
    expect(other.last("error")?.key).toBe("error.notYourTurn");

    room.camera = { x: 0, y: 0, zoom: 10, rotation: 0 };
    room.handle(act, { type: "map", control: { type: "pan", dx: 0.1, dy: 0 } });
    // kartan följer fingret åt höger: kameran flyttas 1 ruta åt väster
    expect(scr.last("camera")).toEqual({ type: "camera", x: -1, y: 0, zoom: 10, rotation: 0 });
    room.handle(act, { type: "map", control: { type: "zoom", factor: 2 } });
    expect(scr.last("camera")!.zoom).toBe(5);
    room.handle(act, { type: "map", control: { type: "rotate", degrees: 90 } });
    expect(scr.last("camera")!.rotation).toBe(90);
    // med kartan vriden 90 grader medurs ligger skärmens höger åt kartans norr
    room.camera = { x: 0, y: 0, zoom: 10, rotation: 90 };
    room.handle(act, { type: "map", control: { type: "pan", dx: 0.1, dy: 0 } });
    const c = scr.last("camera")!;
    expect(c.x).toBeCloseTo(0);
    expect(c.y).toBeCloseTo(1);
    room.handle(act, { type: "map", control: { type: "rotate", degrees: -180 } });
    expect(scr.last("camera")!.rotation).toBe(270);
  });

  test("fitAll visar hela kartan och alla giltiga platser, norr uppåt", () => {
    const { room, scr, active } = startedRoom({ cameraIntervalMs: 0 });
    const act = active();
    room.camera = { x: 50, y: 50, zoom: 3, rotation: 123 };
    room.handle(act, { type: "map", control: { type: "fitAll" } });
    const c = scr.last("camera")!;
    expect(c.rotation).toBe(0);
    // startbrickan ligger i (0,0); platserna ligger intill den, så mitten är nära (0,0)
    expect(Math.abs(c.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(c.y)).toBeLessThanOrEqual(1);
    expect(c.zoom).toBeGreaterThanOrEqual(5);
    // alla giltiga platser ryms: halva bredden räcker till rutorna runt startbrickan
    const spots = act.last("legalSteps")!.steps.filter((s) => s.type === "placeTile") as { pos: { x: number; y: number } }[];
    for (const s of spots) {
      expect(Math.abs(s.pos.x - c.x)).toBeLessThanOrEqual(c.zoom / 2);
      expect(Math.abs(s.pos.y - c.y)).toBeLessThanOrEqual((c.zoom * 9) / 16 / 2 + 0.01);
    }
  });

  test("kamerameddelanden begränsas i takt men sista värdet kommer fram", async () => {
    const { room, scr, active } = startedRoom({ cameraIntervalMs: 40 });
    const act = active();
    // tömma ev. köat efter start
    await Bun.sleep(60);
    scr.clear();
    room.camera = { x: 0, y: 0, zoom: 10, rotation: 0 };
    for (let i = 0; i < 20; i++) room.handle(act, { type: "map", control: { type: "pan", dx: 0.01, dy: 0 } });
    expect(scr.all("camera").length).toBe(1);
    await Bun.sleep(80);
    const cams = scr.all("camera");
    expect(cams.length).toBe(2);
    expect(cams[1]!.x).toBeCloseTo(-2);
  });
});

describe("markera område", () => {
  test("svarar till storskärmen och den som frågade", () => {
    const { room, scr, a, b, active } = startedRoom();
    const act = active();
    const other = act === a ? b : a;
    room.camera = { x: 0, y: 0, zoom: 8, rotation: 0 };
    room.handle(other, { type: "inspect" });
    expect(other.last("error")?.key).toBe("error.notYourTurn");
    room.handle(act, { type: "inspect" });
    const r = scr.last("inspect")!.result;
    expect(act.last("inspect")!.result).toEqual(r);
    expect(r.tiles.length).toBeGreaterThan(0);
    expect(r.tiles).toContainEqual({ x: 0, y: 0 });
    expect(r.closingTiles).toBeUndefined();
    // tom ruta: tomt resultat
    room.camera = { x: 30, y: 30, zoom: 8, rotation: 0 };
    room.handle(act, { type: "inspect" });
    expect(scr.last("inspect")!.result.tiles).toEqual([]);
  });
});
