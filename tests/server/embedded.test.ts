import { describe, expect, test } from "bun:test";
import { join as pjoin } from "node:path";
import type { AndroidHost } from "../../src/shared/android";
import type { ClientMessage, ServerMessage } from "../../src/shared/messages";
import { createEmbeddedRoom } from "../../src/server/embedded/room";
import type { Room } from "../../src/server/room";
import { pickStep } from "./helpers";
import { hostFileStore, memoryFileStore, nodeFileStore } from "../../src/server/store";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";

class FakeHost implements AndroidHost {
  files: Record<string, string> = {};
  sent: Record<string, ServerMessage[]> = {};
  closed: string[] = [];
  replies: { id: string; status: number; type: string; body: string }[] = [];
  logs: string[] = [];
  readyCalls = 0;
  send(id: string, json: string) {
    (this.sent[id] ??= []).push(JSON.parse(json));
  }
  close(id: string) {
    this.closed.push(id);
  }
  httpReply(id: string, status: number, type: string, body: string) {
    this.replies.push({ id, status, type, body });
  }
  listFiles() {
    return JSON.stringify(Object.keys(this.files));
  }
  readFile(n: string) {
    return this.files[n] ?? null;
  }
  writeFile(n: string, t: string) {
    this.files[n] = t;
  }
  log(level: string, line: string) {
    this.logs.push(`${level} ${line}`);
  }
  ready() {
    this.readyCalls++;
  }
}

/** Spelar en hel tur för den aktiva spelaren via bryggan. */
function playTurn(host: FakeHost, room: Room, ids: Record<string, string>) {
  const before = room.state!.turn.player;
  for (let i = 0; i < 10 && room.state!.turn.player === before; i++) {
    const player = room.state!.turn.player;
    const steps = (host.sent[ids[player]!]!.filter((m) => m.type === "legalSteps").at(-1) as Extract<ServerMessage, { type: "legalSteps" }>).steps;
    room.handle(room.seats.find((x) => x.player === player)!.conn!, { type: "step", step: pickStep(steps)! });
  }
}

function setup() {
  const host = new FakeHost();
  const { room, api } = createEmbeddedRoom(host, { seed: () => 12345 });
  const msg = (id: string, m: ClientMessage) => api.message(id, JSON.stringify(m));
  const last = <T extends ServerMessage["type"]>(id: string, t: T) => (host.sent[id] ?? []).filter((m) => m.type === t).at(-1) as Extract<ServerMessage, { type: T }> | undefined;
  return { host, room, api, msg, last };
}

describe("spelrummet via bryggan", () => {
  test("storskärm och spelare ansluter, spelet startar och sparas", () => {
    const { host, room, api, msg, last } = setup();
    api.open("s", true);
    msg("s", { type: "helloScreen" });
    expect(last("s", "lobby")).toBeDefined();
    api.setBaseUrl("http://192.168.43.1:8765/");
    expect(last("s", "screenInfo")!.joinUrl).toStartWith("http://192.168.43.1:8765/");

    api.open("a", false);
    api.open("b", false);
    msg("a", { type: "join", gameCode: room.gameCode, name: "Anna", color: "red", lang: "sv" });
    msg("b", { type: "join", gameCode: room.gameCode, name: "Bo", color: "blue", lang: "sv" });
    expect(last("a", "welcome")!.isHost).toBe(true);
    msg("a", { type: "startGame" });
    expect(room.phase).toBe("playing");
    expect(last("s", "state")).toBeDefined();
    playTurn(host, room, { [last("a", "welcome")!.player]: "a", [last("b", "welcome")!.player]: "b" });

    const files = Object.keys(host.files);
    expect(files).toContain("startval.json");
    const save = files.find((f) => f !== "startval.json" && f.endsWith(".json"));
    expect(save).toBeDefined();
    expect(JSON.parse(host.files[save!]!).snapshot).toBeDefined();
  });

  test("ogiltig JSON och okänd anslutning kraschar inte; stängning kopplar bort", () => {
    const { api, room } = setup();
    api.message("okänd", "{}");
    api.open("a", false);
    api.message("a", "inte json");
    api.message("a", JSON.stringify({ type: "join", gameCode: room.gameCode, name: "A", color: "red", lang: "en" }));
    expect(room.seats[0]!.conn).not.toBeNull();
    api.close("a");
    expect(room.seats[0]!.conn).toBeNull();
  });

  test("sparade filer från förra gången hittas", () => {
    const host = new FakeHost();
    const first = createEmbeddedRoom(host, { seed: () => 12345 });
    first.api.open("a", false);
    first.api.message("a", JSON.stringify({ type: "join", gameCode: first.room.gameCode, name: "A", color: "red", lang: "en" }));
    first.api.open("b", false);
    first.api.message("b", JSON.stringify({ type: "join", gameCode: first.room.gameCode, name: "B", color: "blue", lang: "en" }));
    first.api.message("a", JSON.stringify({ type: "startGame" }));
    const pid = (id: string) => (host.sent[id]!.find((m) => m.type === "welcome") as Extract<ServerMessage, { type: "welcome" }>).player;
    playTurn(host, first.room, { [pid("a")]: "a", [pid("b")]: "b" });
    const again = createEmbeddedRoom(host, { seed: () => 12345 });
    expect(again.room.options.expansions).toContain("base");
    again.api.open("s", true);
    again.api.message("s", JSON.stringify({ type: "helloScreen" }));
    const lobby = (host as unknown as { sent: Record<string, ServerMessage[]> }).sent["s"]!.find((m) => m.type === "lobby") as Extract<ServerMessage, { type: "lobby" }>;
    expect(lobby.saves.length).toBe(1);
  });

  test("/join-colors, /qr.svg och okända adresser", () => {
    const { host, room, api } = setup();
    api.http("1", "/join-colors", `g=${room.gameCode}`);
    expect(host.replies[0]!.status).toBe(200);
    api.http("2", "/join-colors", "g=fel");
    expect(host.replies[1]!.status).toBe(404);
    api.http("3", "/qr.svg", "text=" + encodeURIComponent("http://192.168.43.1:8765/p"));
    expect(host.replies[2]).toMatchObject({ id: "3", status: 200, type: "image/svg+xml" });
    expect(host.replies[2]!.body).toContain("<svg");
    api.http("4", "/qr.svg", "");
    expect(host.replies[3]!.status).toBe(400);
    api.http("5", "/", "");
    expect(host.replies[4]!.status).toBe(404);
  });

  test("setBaseUrl efter start ger nya QR-adresser", () => {
    const { room, api, msg, last } = setup();
    api.open("s", true);
    msg("s", { type: "helloScreen" });
    api.setBaseUrl("http://10.0.0.1:8765");
    const a = last("s", "screenInfo")!.joinUrl;
    api.setBaseUrl("http://192.168.43.1:8765");
    const b = last("s", "screenInfo")!.joinUrl;
    expect(a).toContain("10.0.0.1");
    expect(b).toContain("192.168.43.1");
    expect(room).toBeDefined();
  });
});

describe("FileStore", () => {
  test("nodeFileStore skriver atomiskt och listar", () => {
    const dir = mkdtempSync(pjoin(tmpdir(), "fs-"));
    const s = nodeFileStore(pjoin(dir, "ny"));
    expect(s.list()).toEqual([]);
    expect(s.read("a.json")).toBeNull();
    expect(s.write("a.json", "{}")).toBe(true);
    expect(s.list()).toEqual(["a.json"]);
    expect(s.read("a.json")).toBe("{}");
    expect(readdirSync(pjoin(dir, "ny"))).toEqual(["a.json"]); // ingen kvarglömd .tmp
    expect(readFileSync(pjoin(dir, "ny", "a.json"), "utf8")).toBe("{}");
  });
  test("hostFileStore och memoryFileStore", () => {
    const host = new FakeHost();
    const s = hostFileStore(host);
    expect(s.list()).toEqual([]);
    s.write("x.json", "1");
    expect(s.read("x.json")).toBe("1");
    expect(s.read("y.json")).toBeNull();
    expect(s.list()).toEqual(["x.json"]);
    const m = memoryFileStore();
    m.write("q", "2");
    expect(m.read("q")).toBe("2");
  });
  test("hostFileStore tål att bryggan kastar fel", () => {
    const s = hostFileStore({ listFiles: () => "trasig", readFile: () => { throw new Error("x"); }, writeFile: () => { throw new Error("x"); } });
    expect(s.list()).toEqual([]);
    expect(s.read("a")).toBeNull();
    expect(s.write("a", "b")).toBe(false);
  });
});

describe("bygget för webbläsaren", () => {
  test("sidan går att bygga med Bun.build (target browser)", async () => {
    const out = await Bun.build({ entrypoints: [pjoin(import.meta.dir, "../../src/server/embedded/index.html")], target: "browser", minify: false });
    expect(out.success).toBe(true);
    const js = out.outputs.find((o) => o.path.endsWith(".js"));
    expect(js).toBeDefined();
    const text = await js!.text();
    expect(text).toContain("erovringenRoom");
    expect(text).not.toContain('"node:fs"'.replace(/"/g, "") + "\u0000");
  }, 60000);
});
