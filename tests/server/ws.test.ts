// Startar den riktiga servern och spelar några drag via WebSocket med två klienter.

import { afterAll, describe, expect, test } from "bun:test";
import { mkdtempSync, readFileSync, readdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { ClientMessage, ServerMessage } from "../../src/shared/messages";
import { createFileLogger } from "../../src/server/log";
import { createServer } from "../../src/server/server";
import { pickStep } from "./helpers";

class Client {
  readonly msgs: ServerMessage[] = [];
  private ws: WebSocket;
  private waiters: (() => void)[] = [];
  ready: Promise<void>;
  constructor(url: string) {
    this.ws = new WebSocket(url);
    this.ws.onmessage = (e) => {
      this.msgs.push(JSON.parse(String(e.data)));
      this.waiters.splice(0).forEach((w) => w());
    };
    this.ready = new Promise((res, rej) => {
      this.ws.onopen = () => res();
      this.ws.onerror = () => rej(new Error("ws error"));
    });
  }
  send(m: ClientMessage) {
    this.ws.send(JSON.stringify(m));
  }
  last<T extends ServerMessage["type"]>(type: T) {
    return this.msgs.filter((m) => m.type === type).at(-1) as Extract<ServerMessage, { type: T }> | undefined;
  }
  async until<T>(f: () => T | undefined | false, ms = 3000): Promise<T> {
    const end = Date.now() + ms;
    for (;;) {
      const v = f();
      if (v) return v;
      if (Date.now() > end) {
        const where = new Error().stack?.split("\n")[2] ?? "";
        throw new Error(`tidsgräns ${where} ${JSON.stringify(this.msgs.map((m) => m.type))}`);
      }
      await new Promise<void>((res) => {
        this.waiters.push(res);
        setTimeout(res, 50);
      });
    }
  }
  close() {
    this.ws.close();
  }
}

const logDir = mkdtempSync(join(tmpdir(), "logg-"));
const run = createServer({
  port: 0,
  publicHost: "127.0.0.1",
  logger: createFileLogger({ dir: logDir }),
  room: { seed: () => 99 },
});
const wsUrl = `ws://127.0.0.1:${run.port}/ws`;
afterAll(() => run.stop());

describe("servern över WebSocket", () => {
  test("QR-kod som SVG och okända adresser", async () => {
    const r = await fetch(`http://127.0.0.1:${run.port}/qr.svg?text=${encodeURIComponent(run.baseUrl)}`);
    expect(r.status).toBe(200);
    expect(r.headers.get("content-type")).toBe("image/svg+xml");
    expect(await r.text()).toContain("<svg");
    expect((await fetch(`http://127.0.0.1:${run.port}/qr.svg`)).status).toBe(400);
    expect((await fetch(`http://127.0.0.1:${run.port}/finns-inte`)).status).toBe(404);
  });

  test("två spelare ansluter via QR-adressen och spelar några drag", async () => {
    const screen = new Client(wsUrl);
    await screen.ready;
    screen.send({ type: "helloScreen" });
    const info = await screen.until(() => screen.last("screenInfo"));
    const gameCode = new URL(info.joinUrl).searchParams.get("g")!;
    expect(info.joinUrl.startsWith(run.baseUrl)).toBe(true);

    const a = new Client(wsUrl);
    const b = new Client(wsUrl);
    await Promise.all([a.ready, b.ready]);
    a.send({ type: "join", gameCode, name: "Anna", color: "red", lang: "sv" });
    await a.until(() => a.last("welcome"));
    b.send({ type: "join", gameCode, name: "Bo", color: "blue", lang: "en" });
    await b.until(() => b.last("welcome"));
    expect(a.last("welcome")!.isHost).toBe(true);
    expect(b.last("welcome")!.isHost).toBe(false);
    await screen.until(() => screen.last("lobby")?.seats.length === 2);

    // bara värden startar
    b.send({ type: "startGame" });
    await b.until(() => b.last("error"));
    expect(b.last("error")!.key).toBe("error.hostOnly");
    a.send({ type: "setOptions", options: { expansions: ["base"], variants: {}, screenLang: "sv", handSize: 1, showClosingTiles: false } });
    a.send({ type: "startGame" });
    const st = await screen.until(() => screen.last("state"));
    expect(st.state.players).toHaveLength(2);
    await a.until(() => a.last("hand"));
    await b.until(() => b.last("hand"));
    await screen.until(() => screen.last("camera"));

    const byId = new Map([[a.last("welcome")!.player, a], [b.last("welcome")!.player, b]]);
    for (let turn = 0; turn < 3; turn++) {
      const cur = screen.last("state")!.state.turn.player;
      const client = byId.get(cur)!;
      const turnsBefore = turn;
      for (let i = 0; i < 6; i++) {
        const steps = await client.until(() => {
          const m = client.last("legalSteps");
          return m && m.steps.length > 0 ? m.steps : undefined;
        });
        const step = pickStep(steps)!;
        const sizeBefore = client.msgs.length;
        client.send({ type: "step", step });
        // legalSteps kommer sist av svaren: vänta på en ny
        await client.until(() => client.msgs.slice(sizeBefore).some((m) => m.type === "legalSteps"));
        if (step.type === "confirm") break;
      }
      await screen.until(() => screen.last("state")!.state.turn.player !== cur);
      expect(screen.last("events")!.events.some((e) => e.type === "tilePlaced")).toBe(true);
      expect(Object.keys(screen.last("state")!.state.board).length).toBe(2 + turnsBefore);
    }

    // kartstyrning och markering över riktiga sockets
    const cur = byId.get(screen.last("state")!.state.turn.player)!;
    cur.send({ type: "map", control: { type: "fitAll" } });
    cur.send({ type: "inspect" });
    const ins = await screen.until(() => screen.last("inspect"));
    expect(ins.result).toBeDefined();
    await cur.until(() => cur.last("inspect"));

    // en spelare tappar anslutningen och kommer tillbaka med sin platskod
    const aid = a.last("welcome")!.player;
    const token = new URL(info.seatUrls[aid] ?? screen.last("screenInfo")!.seatUrls[aid]!).searchParams.get("s")!;
    expect(token).toBe(a.last("welcome")!.seatToken);
    a.close();
    await screen.until(() => screen.last("waitingFor")?.seats.some((s) => s.player === aid));
    const a2 = new Client(wsUrl);
    await a2.ready;
    a2.send({ type: "rejoin", seatToken: token });
    await a2.until(() => a2.last("state") && a2.last("hand"));
    await screen.until(() => screen.last("waitingFor")?.seats.length === 0);

    // storskärm från fel plats godtas inte; här är allt localhost, så kontrollera i stället loggen
    for (const c of [screen, a2, b]) c.close();
    const files = readdirSync(logDir);
    expect(files).toContain("server.log");
    const log = readFileSync(join(logDir, "server.log"), "utf8");
    expect(log).toContain("spelet startade");
    expect(log).not.toContain(token);
  });
});
