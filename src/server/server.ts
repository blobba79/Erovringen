// HTTP och WebSocket. Routes för klienterna (storskärm, telefon) skickas in utifrån, så att servern
// går att starta i tester utan dem; main.ts anger de riktiga.

import { networkInterfaces } from "node:os";
import { createFileLogger, nullLogger, type Logger } from "./log";
import { MAX_QR_TEXT, qrSvg } from "./qr";
import { Room, type Conn, type RoomOptions } from "./room";

export interface ServerOptions {
  /** Önskad port; är den upptagen väljs en ledig. 0 = valfri ledig. */
  port?: number;
  hostname?: string;
  /** Bun.serve-routes, t.ex. { "/": screenHtml, "/p": phoneHtml }. */
  routes?: Record<string, unknown>;
  room?: RoomOptions;
  logger?: Logger;
  /** Adressen telefonerna ska använda (standard: datorns adress på det lokala nätet). */
  publicHost?: string;
}

export interface RunningServer {
  room: Room;
  port: number;
  /** Storskärmens adress (localhost). */
  screenUrl: string;
  /** Adressen telefonerna når servern på. */
  baseUrl: string;
  stop(): void;
}

interface WsData {
  local: boolean;
  conn?: Conn;
}

const LOCAL = new Set(["127.0.0.1", "::1", "::ffff:127.0.0.1"]);

/** Datorns adress på det lokala nätet; helst en privat adress (192.168…, 10…, 172.16–31…). */
export function lanAddress(): string {
  const all: string[] = [];
  // Virtuella nätverkskort (WSL, Hyper-V, Docker, VPN …) nås inte från telefonerna.
  const isVirtual = /vEthernet|WSL|Hyper-V|VirtualBox|VMware|docker|br-|veth|virbr|tun|tap|Bluetooth|Loopback/i;
  for (const [name, list] of Object.entries(networkInterfaces()))
    for (const i of list ?? [])
      if (i.family === "IPv4" && !i.internal && !isVirtual.test(name)) all.push(i.address);
  const ranked = [/^192\.168\./, /^10\./, /^172\.(1[6-9]|2\d|3[01])\./];
  for (const r of ranked) {
    const a = all.find((x) => r.test(x));
    if (a) return a;
  }
  return all[0] ?? "localhost";
}

export function createServer(opts: ServerOptions = {}): RunningServer {
  const logger = opts.logger ?? nullLogger;
  const room = new Room({ ...opts.room, logger });

  const config = {
    hostname: opts.hostname ?? "0.0.0.0",
    ...(opts.routes ? { routes: opts.routes } : {}),
    fetch(req: Request, server: Bun.Server) {
      const url = new URL(req.url);
      if (url.pathname === "/ws") {
        const ip = server.requestIP(req)?.address ?? "";
        const data: WsData = { local: LOCAL.has(ip) };
        if (server.upgrade(req, { data })) return undefined;
        return new Response("WebSocket krävs", { status: 426 });
      }
      if (url.pathname === "/qr.svg") {
        const text = url.searchParams.get("text") ?? "";
        if (!text || text.length > MAX_QR_TEXT) return new Response("Ogiltig text", { status: 400 });
        return new Response(qrSvg(text), {
          headers: { "content-type": "image/svg+xml", "cache-control": "no-store" },
        });
      }
      if (url.pathname === "/join-colors") {
        const colors = room.joinColors(url.searchParams.get("g") ?? "");
        if (!colors) return new Response("Hittades inte", { status: 404 });
        return Response.json(colors, { headers: { "cache-control": "no-store" } });
      }
      return new Response("Hittades inte", { status: 404 });
    },
    websocket: {
      maxPayloadLength: 64 * 1024,
      open(ws: Bun.ServerWebSocket<WsData>) {
        ws.data.conn = {
          local: ws.data.local,
          send: (m) => void ws.send(JSON.stringify(m)),
          close: () => ws.close(),
        };
      },
      message(ws: Bun.ServerWebSocket<WsData>, message: string | Buffer) {
        let parsed: unknown;
        try {
          parsed = JSON.parse(typeof message === "string" ? message : message.toString("utf8"));
        } catch {
          parsed = undefined;
        }
        room.handle(ws.data.conn!, parsed);
      },
      close(ws: Bun.ServerWebSocket<WsData>) {
        if (ws.data.conn) room.disconnect(ws.data.conn);
      },
    },
  };

  const serve = (port: number) => Bun.serve({ ...config, port } as never) as Bun.Server;
  let server: Bun.Server;
  const want = opts.port ?? 0;
  try {
    server = serve(want);
  } catch (e) {
    if (want === 0) throw e;
    logger.warn(`porten ${want} är upptagen, väljer en ledig`);
    server = serve(0);
  }
  const port = server.port as number;
  const host = opts.publicHost ?? lanAddress();
  const baseUrl = `http://${host}:${port}`;
  room.setBaseUrl(baseUrl);
  const screenUrl = `http://localhost:${port}/`;
  logger.info(`servern lyssnar på port ${port}`);
  return {
    room, port, screenUrl, baseUrl,
    stop() {
      room.dispose();
      void server.stop(true);
    },
  };
}

export { createFileLogger };
