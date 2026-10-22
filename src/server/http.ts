// HTTP-svaren som spelrummet själv ger (QR-koden och spelarfärgerna), gemensamma för servern på
// datorn och spelrummet i Android-appen. Inga beroenden på Node eller Bun.

import { MAX_QR_TEXT, qrSvg } from "./qr";
import type { Room } from "./room";

export interface RoomReply {
  status: number;
  contentType: string;
  body: string;
}

/** Svar på `/qr.svg` och `/join-colors`; null för allt annat. */
export function roomHttp(room: Room, path: string, params: URLSearchParams): RoomReply | null {
  if (path === "/qr.svg") {
    const text = params.get("text") ?? "";
    if (!text || text.length > MAX_QR_TEXT) return { status: 400, contentType: "text/plain", body: "Ogiltig text" };
    return { status: 200, contentType: "image/svg+xml", body: qrSvg(text) };
  }
  if (path === "/join-colors") {
    const colors = room.joinColors(params.get("g") ?? "");
    if (!colors) return { status: 404, contentType: "text/plain", body: "Hittades inte" };
    return { status: 200, contentType: "application/json", body: JSON.stringify(colors) };
  }
  return null;
}
