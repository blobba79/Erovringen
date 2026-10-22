// Spelrummet i Android-appens dolda WebView: samma Room som på datorn, men nätverk, filer och logg
// går genom bryggan (src/shared/android.ts). Sidan ska gå att bygga för webbläsaren.

import type { AndroidHost, EmbeddedRoom } from "../../shared/android";
import { roomHttp } from "../http";
import type { Logger } from "../log";
import { Room, type Conn } from "../room";
import { hostFileStore } from "../store";

export interface EmbeddedHandle {
  room: Room;
  api: EmbeddedRoom;
}

/** Skapar rummet och det som appen anropar. `ready()` anropas inte här. */
export function createEmbeddedRoom(host: AndroidHost, opts: { gameCode?: string; seed?: () => number } = {}): EmbeddedHandle {
  const logger: Logger = {
    info: (m) => safeLog(host, "info", m),
    warn: (m) => safeLog(host, "warn", m),
    error: (m) => safeLog(host, "error", m),
  };
  const room = new Room({ store: hostFileStore(host), logger, ...(opts.gameCode ? { gameCode: opts.gameCode } : {}), ...(opts.seed ? { seed: opts.seed } : {}) });
  const conns = new Map<string, Conn>();

  const api: EmbeddedRoom = {
    open(connId, local) {
      const conn: Conn = {
        local,
        send: (m) => host.send(connId, JSON.stringify(m)),
        close: () => host.close(connId),
      };
      conns.set(connId, conn);
    },
    message(connId, json) {
      const conn = conns.get(connId);
      if (!conn) return;
      let parsed: unknown;
      try {
        parsed = JSON.parse(json);
      } catch {
        parsed = undefined;
      }
      room.handle(conn, parsed);
    },
    close(connId) {
      const conn = conns.get(connId);
      if (!conn) return;
      conns.delete(connId);
      room.disconnect(conn);
    },
    http(requestId, path, query) {
      let reply = null;
      try {
        reply = roomHttp(room, path, new URLSearchParams(query));
      } catch (e) {
        logger.error(`http ${path}: ${e instanceof Error ? e.message : String(e)}`);
      }
      const r = reply ?? { status: 404, contentType: "text/plain", body: "Hittades inte" };
      host.httpReply(requestId, r.status, r.contentType, r.body);
    },
    setBaseUrl(url) {
      room.setBaseUrl(url);
    },
  };
  return { room, api };
}

function safeLog(host: AndroidHost, level: "info" | "warn" | "error", line: string): void {
  try {
    host.log(level, line);
  } catch {
    // loggen får aldrig stoppa spelet
  }
}
