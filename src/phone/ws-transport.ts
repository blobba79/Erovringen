// WebSocket-transport med automatisk återanslutning (skärmlås, tappat wifi, omladdning).

import type { ClientMessage, ServerMessage } from "../shared/messages";
import type { Transport, TransportFactory, TransportHandlers } from "./client";

export function webSocketTransport(url: string): TransportFactory {
  return (h: TransportHandlers): Transport => {
    let ws: WebSocket | null = null;
    let closed = false;
    let retry = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (closed) return;
      clearTimeout(timer);
      const sock = new WebSocket(url);
      ws = sock;
      sock.onopen = () => {
        retry = 0;
        h.open();
      };
      sock.onmessage = (e) => {
        try {
          h.message(JSON.parse(String(e.data)) as ServerMessage);
        } catch {
          /* ignorera trasiga meddelanden */
        }
      };
      sock.onclose = () => {
        if (ws !== sock) return;
        ws = null;
        h.close();
        if (!closed) timer = setTimeout(connect, Math.min(3000, 400 * 2 ** retry++));
      };
      sock.onerror = () => sock.close();
    };

    // När telefonen vaknar eller nätet kommer tillbaka: försök direkt.
    const wake = () => {
      if (closed || (ws && ws.readyState <= WebSocket.OPEN)) return;
      retry = 0;
      connect();
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") wake();
    };
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("online", wake);
    window.addEventListener("pageshow", wake);
    connect();

    return {
      send(m) {
        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(m satisfies ClientMessage));
      },
      close() {
        closed = true;
        clearTimeout(timer);
        document.removeEventListener("visibilitychange", onVisible);
        window.removeEventListener("online", wake);
        window.removeEventListener("pageshow", wake);
        ws?.close();
      },
    };
  };
}
