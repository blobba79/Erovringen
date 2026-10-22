import { describe, expect, test } from "bun:test";
import type { ClientMessage, ServerMessage } from "../../src/shared/messages";
import { Client, type Transport, type TransportFactory } from "../../src/phone/client";
import { DEV_TOKEN, localServer } from "../../src/phone/dev/local-server";
import { loadSeat, type StorageLike } from "../../src/phone/logic/session";
import { spotsFor } from "../../src/phone/logic/spots";

const mem = (): StorageLike & { m: Map<string, string> } => {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
};

async function until(cond: () => boolean, what: string, ms = 2000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`timeout: ${what}`);
    await new Promise((r) => setTimeout(r, 1));
  }
}

function makeClient(search: string, storage: StorageLike | null, factory?: TransportFactory) {
  const urls: string[] = [];
  const client = new Client(factory ?? localServer({ seed: 7 }), {
    storage,
    search,
    browserLang: "sv-SE",
    languages: ["en", "sv"],
    replaceSearch: (s) => urls.push(s),
  });
  return { client, urls };
}

describe("klienten mot lokal server", () => {
  test("anslut, starta och spela en hel tur", async () => {
    const st = mem();
    const { client, urls } = makeClient("?g=DEV", st);
    expect(client.getState().lang).toBe("sv");
    await until(() => client.getState().conn === "open", "ansluten");
    client.join("Ada", "#2a6fdb");
    await until(() => client.getState().joined, "welcome");
    expect(client.getState().isHost).toBe(true);
    expect(loadSeat(st)).toEqual({ token: DEV_TOKEN, gameCode: "DEV" });
    expect(urls).toEqual([`?s=${DEV_TOKEN}`]);
    await until(() => client.getState().lobby !== null, "väntrum");

    client.setOptions({ ...client.getState().lobby!.options, expansions: ["base", "river", "abbot"], variants: { "river.deadEnds": "forbid" } });
    await until(() => client.getState().lobby!.options.variants["river.deadEnds"] === "forbid", "val sparade");

    client.startGame();
    const mine = () => client.getState().state?.turn.player === "p1" && client.getState().legal.length > 0;
    await until(mine, "min tur");
    expect(client.getState().turnNonce).toBe(1);
    const state = client.getState().state!;
    expect(state.turn.phase).toBe("placeTile");

    // Kant och siffra
    const sent: ClientMessage[] = [];
    const orig = client.send.bind(client);
    client.send = (m) => (sent.push(m), orig(m));
    client.selectEdge("all");
    const preview = sent.find((m) => m.type === "preview");
    expect(preview).toBeDefined();
    const spots = spotsFor(client.getState().placements, client.getState().state!.board, "all");
    expect(spots.length).toBeGreaterThan(0);
    expect(preview && preview.type === "preview" && preview.preview.spots).toEqual(spots);
    client.placeAt(spots[0]!);
    await until(() => client.getState().state?.turn.phase === "placeFigure", "bricka lagd");
    expect(client.getState().state!.turn.pending[0]).toMatchObject({ type: "placeTile", pos: spots[0] });

    // Rotera: ångra + ny placering, bara en tillåten rotation åt gången
    const before = client.getState().state!.turn.pending[0] as { rotation: number };
    const allowed = client.getState().placements.filter((p) => p.pos.x === spots[0]!.x && p.pos.y === spots[0]!.y);
    client.rotate();
    if (allowed.length > 1) {
      await until(() => {
        const p = client.getState().state?.turn.pending[0] as { rotation: number } | undefined;
        return client.getState().state?.turn.phase === "placeFigure" && p !== undefined && p.rotation !== before.rotation;
      }, "roterad");
      expect(allowed.map((p) => p.rotation)).toContain((client.getState().state!.turn.pending[0] as { rotation: number }).rotation);
    } else {
      await until(() => client.getState().state?.turn.phase === "placeFigure", "samma rotation igen");
    }

    // Ingen pjäs, bekräfta
    await until(() => client.getState().legal.some((s) => s.type === "noFigure"), "pjässteg");
    client.step({ type: "noFigure" });
    await until(() => client.getState().state?.turn.phase === "confirm", "bekräfta-fas");
    client.step({ type: "confirm" });
    await until(() => client.getState().state?.turn.player === "p2" || client.getState().state?.turn.pending.length === 0, "turen gick vidare");
    // Datorn spelar klart och turen kommer tillbaka
    await until(() => client.getState().turnNonce === 2, "min tur igen", 5000);
    client.close();
  });

  test("fel från servern visas som nyckel", async () => {
    const { client } = makeClient("?g=DEV", null);
    await until(() => client.getState().conn === "open", "ansluten");
    client.join("Ada", "#2a6fdb");
    await until(() => client.getState().lobby !== null, "väntrum");
    client.startGame();
    await until(() => client.getState().legal.length > 0, "min tur");
    client.step({ type: "confirm" });
    await until(() => client.getState().error !== null, "fel");
    expect(client.getState().error!.key).toBe("error.illegalStep");
    client.close();
  });
});

describe("återanslutning", () => {
  function fakeTransport() {
    const sent: ClientMessage[] = [];
    let h!: Parameters<TransportFactory>[0];
    const factory: TransportFactory = (handlers): Transport => {
      h = handlers;
      return { send: (m) => void sent.push(m), close() {} };
    };
    return { sent, factory, h: () => h };
  }

  test("sparad plats skickas som rejoin vid varje (åter)anslutning", () => {
    const st = mem();
    st.setItem("erovringen.seat", JSON.stringify({ token: "SEAT", gameCode: "G" }));
    const f = fakeTransport();
    const { client } = makeClient("", st, f.factory);
    f.h().open();
    expect(f.sent).toEqual([{ type: "rejoin", seatToken: "SEAT" }]);
    f.h().message({ type: "welcome", player: "p1", seatToken: "SEAT", isHost: false });
    expect(client.getState().joined).toBe(true);
    f.h().close();
    expect(client.getState().conn).toBe("lost");
    f.h().open();
    expect(f.sent.at(-1)).toEqual({ type: "rejoin", seatToken: "SEAT" });
    expect(client.getState().conn).toBe("open");
  });

  test("platskod i adressen går före sparad, och glöms om servern avvisar den", () => {
    const st = mem();
    st.setItem("erovringen.seat", JSON.stringify({ token: "OLD" }));
    const f = fakeTransport();
    const { client } = makeClient("?s=NEW", st, f.factory);
    f.h().open();
    expect(f.sent[0]).toEqual({ type: "rejoin", seatToken: "NEW" });
    f.h().message({ type: "error", key: "error.unknownSeat" } satisfies ServerMessage);
    expect(loadSeat(st)).toBeNull();
    expect(client.getState().plan.kind).toBe("scan");
    expect(client.getState().error?.key).toBe("error.unknownSeat");
  });

  test("ny spelare skickar join efter återanslutning om welcome inte kom", () => {
    const f = fakeTransport();
    const { client } = makeClient("?g=G1", null, f.factory);
    f.h().open();
    client.join("Bo", "#d62828");
    expect(f.sent.at(-1)).toEqual({ type: "join", gameCode: "G1", name: "Bo", color: "#d62828", lang: "sv" });
    f.h().close();
    f.h().open();
    expect(f.sent.at(-1)).toMatchObject({ type: "join", gameCode: "G1" });
  });

  test("turen börjar: signal bara när den går över till spelaren", () => {
    const f = fakeTransport();
    const { client } = makeClient("?s=T", null, f.factory);
    f.h().open();
    f.h().message({ type: "welcome", player: "p1", seatToken: "T", isHost: false });
    const st = (player: string, phase = "placeTile") =>
      ({ type: "state", state: { version: 1, setup: {}, board: {}, figures: [], players: [], ext: {}, finished: false, drawPileCount: 0, remaining: {}, turn: { player, phase, pending: [] } } }) as unknown as ServerMessage;
    f.h().message(st("p2"));
    expect(client.getState().turnNonce).toBe(0);
    f.h().message(st("p1"));
    expect(client.getState().turnNonce).toBe(1);
    f.h().message(st("p1", "placeFigure"));
    expect(client.getState().turnNonce).toBe(1);
  });
});
