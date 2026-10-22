// WebSocket mot servern med automatisk återanslutning.

import type { ClientMessage, ServerMessage } from "../shared/messages";

export interface Connection {
  send(msg: ClientMessage): void;
  close(): void;
}

/** Väntetid före nästa försök (ms): växer långsamt upp till 5 s. */
export function backoff(attempt: number): number {
  return Math.min(5000, 500 * 2 ** Math.min(attempt, 4));
}

export function connect(
  url: string,
  onMessage: (m: ServerMessage) => void,
  onStatus: (connected: boolean) => void,
): Connection {
  let ws: WebSocket | undefined;
  let attempt = 0;
  let closed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;

  const open = () => {
    ws = new WebSocket(url);
    ws.onopen = () => {
      attempt = 0;
      onStatus(true);
      ws?.send(JSON.stringify({ type: "helloScreen" } satisfies ClientMessage));
    };
    ws.onmessage = (e) => {
      try {
        onMessage(JSON.parse(String(e.data)) as ServerMessage);
      } catch {
        /* ogiltigt meddelande ignoreras */
      }
    };
    ws.onclose = () => {
      onStatus(false);
      if (!closed) timer = setTimeout(open, backoff(attempt++));
    };
    ws.onerror = () => ws?.close();
  };
  open();

  return {
    send: (msg) => {
      if (ws?.readyState === WebSocket.OPEN) ws.send(JSON.stringify(msg));
    },
    close: () => {
      closed = true;
      if (timer) clearTimeout(timer);
      ws?.close();
    },
  };
}
