import { expect, test } from "bun:test";
import { Client, type TransportFactory } from "../../src/phone/client";
import { Room } from "../../src/server/room";

async function until(cond: () => boolean, what: string, ms = 2000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`timeout: ${what}`);
    await new Promise((r) => setTimeout(r, 1));
  }
}

/** Telefonens klient direkt mot ett riktigt rum. */
function roomTransport(room: Room): TransportFactory {
  return (h) => {
    const conn = { local: false, send: (m: Parameters<typeof h.message>[0]) => queueMicrotask(() => h.message(JSON.parse(JSON.stringify(m)))) };
    queueMicrotask(() => h.open());
    return { send: (m) => room.handle(conn, m), close: () => room.disconnect(conn) };
  };
}

test("värdens telefon lägger till och tar bort datorspelare", async () => {
  const room = new Room({ gameCode: "DEV" });
  const client = new Client(roomTransport(room), {
    storage: null, search: "?g=DEV", browserLang: "sv-SE", languages: ["en", "sv"], replaceSearch: () => {},
  });
  await until(() => client.getState().conn === "open", "ansluten");
  client.join("Ada", "#2a6fdb");
  await until(() => client.getState().joined, "welcome");
  const bots = () => client.getState().lobby?.seats.filter((s) => s.bot) ?? [];
  client.addBot();
  await until(() => bots().length === 1, "datorspelare tillagd");
  expect(bots()[0]!.connected).toBe(true);
  expect(bots()[0]!.isHost).toBe(false);
  client.removeBot(bots()[0]!.player);
  await until(() => bots().length === 0, "datorspelare borttagen");
  room.dispose();
});
