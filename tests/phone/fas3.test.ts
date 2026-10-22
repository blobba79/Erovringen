import { describe, expect, test } from "bun:test";
import type { AvailableOptions, ClientMessage, GameStats, SavedGameInfo, ServerMessage, StartOptions } from "../../src/shared/messages";
import type { Step } from "../../src/shared/state";
import { localServer } from "../../src/phone/dev/local-server";
import { Client, type Transport, type TransportFactory } from "../../src/phone/client";
import { handTiles, mustExchange, tileToShow } from "../../src/phone/logic/hand";
import { helpKeys } from "../../src/phone/logic/help";
import { changeHandSize, chooseSave, savedColors, setVariant, startChoices, toggleExpansion } from "../../src/phone/logic/options";
import { standings, topRecords } from "../../src/phone/logic/after";
import { loadWarnings, saveWarnings, type StorageLike } from "../../src/phone/logic/session";

const mem = (): StorageLike & { m: Map<string, string> } => {
  const m = new Map<string, string>();
  return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => void m.set(k, v), removeItem: (k) => void m.delete(k) };
};

describe("hand med flera brickor", () => {
  const legalChoose: Step[] = [{ type: "chooseTile", handIndex: 0 }, { type: "chooseTile", handIndex: 2 }];
  test("vilka som går att välja", () => {
    const t = handTiles(["a", "b", "c"], legalChoose, null);
    expect(t.map((x) => x.canChoose)).toEqual([true, false, true]);
    expect(mustExchange(t)).toBe(false);
  });
  test("byte erbjuds när ingen går att lägga", () => {
    const t = handTiles(["a", "b"], [{ type: "exchangeTile", handIndex: 0 }, { type: "exchangeTile", handIndex: 1 }], null);
    expect(mustExchange(t)).toBe(true);
    expect(t.every((x) => x.canExchange && !x.canChoose)).toBe(true);
  });
  test("visa för alla gäller spelad bricka, annars markerad", () => {
    expect(tileToShow(1, 0, 3)).toBe(1);
    expect(tileToShow(null, 2, 3)).toBe(2);
    expect(tileToShow(null, null, 3)).toBeNull();
    expect(tileToShow(null, 5, 3)).toBeNull();
  });
});

describe("vad kan jag göra", () => {
  test("fas och aktiva expansioner", () => {
    expect(helpKeys("placeTile", ["base", "river", "abbot"])).toEqual({ phase: "help.phase.placeTile", expansions: ["help.expansion.river"] });
    expect(helpKeys("placeFigure", ["base", "river", "abbot"]).expansions).toEqual(["help.expansion.abbot"]);
    expect(helpKeys("placeFigure", ["base"]).expansions).toEqual([]);
  });
  test("okänd fas får den allmänna texten; expansion utan text hoppas över", () => {
    const exists = (k: string) => k !== "help.expansion.ferries" && k !== "help.phase.ferryMove";
    expect(helpKeys("ferryMove", ["ferries"], exists)).toEqual({ phase: "help.phase.other", expansions: [] });
    expect(helpKeys("ferryMove", ["ferries"], () => true).expansions).toEqual(["help.expansion.ferries"]);
    expect(helpKeys("ferryMove", [], (k) => k === "help.phase.ferryMove").phase).toBe("help.phase.ferryMove");
  });
});

describe("startval ur lobby.available", () => {
  const available: AvailableOptions = {
    expansions: ["base", "river", "abbot"],
    variants: {
      base: [],
      river: [{ id: "deadEnds", options: ["allow", "forbid"], default: "allow" }],
    } as AvailableOptions["variants"],
    languages: ["en", "sv"],
    maxHandSize: 4,
  };
  const base: StartOptions = { expansions: ["base"], variants: {}, screenLang: "en", handSize: 1, showClosingTiles: false };
  test("varianter syns bara för påslagna expansioner", () => {
    expect(startChoices(available, base).variants).toEqual([]);
    const on = toggleExpansion(base, "river");
    const v = startChoices(available, on).variants;
    expect(v).toEqual([{ key: "river.deadEnds", expansion: "river", options: ["allow", "forbid"], default: "allow", value: "allow" }]);
    const picked = setVariant(on, "river.deadEnds", "forbid");
    expect(startChoices(available, picked).variants[0]!.value).toBe("forbid");
    expect(toggleExpansion(picked, "river").variants).toEqual({});
  });
  test("grundspelet ingår inte i listan och handen begränsas", () => {
    expect(startChoices(available, base).expansions.map((e) => e.id)).toEqual(["river", "abbot"]);
    expect(changeHandSize(base, 9, 4).handSize).toBe(4);
    expect(changeHandSize(base, -3, 4).handSize).toBe(1);
  });
  test("sparade spel: oläsbara går inte att välja", () => {
    const saves: SavedGameInfo[] = [
      { id: "a", savedAt: "", players: [{ name: "Ada", color: "#111", score: 3 }], expansions: ["base"], tilesPlaced: 3, readable: true },
      { id: "b", savedAt: "", players: [], expansions: ["base"], tilesPlaced: 0, readable: false },
    ];
    expect(chooseSave(base, saves, "a").savedGame).toBe("a");
    expect(chooseSave(base, saves, "b").savedGame).toBeUndefined();
    expect(chooseSave({ ...base, savedGame: "a" }, saves, null).savedGame).toBeUndefined();
    expect(savedColors({ ...base, savedGame: "a" }, saves)).toEqual(["#111"]);
    expect(savedColors(base, saves)).toEqual([]);
  });
});

describe("efter spelet", () => {
  test("placering med delad plats", () => {
    const st = { players: [{ id: "p1", name: "A", color: "x", score: 10 }, { id: "p2", name: "B", color: "y", score: 30 }, { id: "p3", name: "C", color: "z", score: 10 }] };
    expect(standings(st as never).map((x) => [x.id, x.rank])).toEqual([["p2", 1], ["p1", 2], ["p3", 2]]);
  });
  test("rekord: ett per nyckel, störst först", () => {
    const stats = { records: [{ key: "stats.a", player: "p1", value: 3 }, { key: "stats.a", player: "p2", value: 5 }, { key: "stats.b", player: null, value: 4 }] } as unknown as GameStats;
    expect(topRecords(stats).map((r) => [r.key, r.value])).toEqual([["stats.a", 5], ["stats.b", 4]]);
  });
});

describe("varningar och anslutning", () => {
  test("av/på sparas med try/catch", () => {
    const st = mem();
    expect(loadWarnings(st)).toBe(false);
    saveWarnings(st, true);
    expect(loadWarnings(st)).toBe(true);
    const broken: StorageLike = { getItem: () => { throw new Error("x"); }, setItem: () => { throw new Error("x"); }, removeItem: () => {} };
    expect(loadWarnings(broken)).toBe(false);
    expect(() => saveWarnings(broken, true)).not.toThrow();
  });

  function fake(storage: StorageLike | null) {
    const sent: ClientMessage[] = [];
    let h!: Parameters<TransportFactory>[0];
    const factory: TransportFactory = (handlers): Transport => {
      h = handlers;
      return { send: (m) => void sent.push(m), close() {} };
    };
    const client = new Client(factory, { storage, search: "?g=G", browserLang: "en", languages: ["en", "sv"] });
    return { sent, client, h: () => h };
  }

  test("setWarnings skickas vid varje anslutning och visas bara när de är på", () => {
    const st = mem();
    saveWarnings(st, true);
    const f = fake(st);
    f.h().open();
    f.client.join("Ada", "#111");
    f.h().message({ type: "welcome", player: "p1", seatToken: "T", isHost: true });
    expect(f.sent.at(-1)).toEqual({ type: "setWarnings", on: true });
    f.h().message({ type: "warnings", warnings: [{ key: "warning.x" }] });
    expect(f.client.getState().warnings).toHaveLength(1);
    f.client.setWarningsOn(false);
    expect(f.sent.at(-1)).toEqual({ type: "setWarnings", on: false });
    expect(f.client.getState().warnings).toEqual([]);
    expect(loadWarnings(st)).toBe(false);
  });

  test("reaktion, visa för alla och lobbyns val sparas", () => {
    const f = fake(null);
    f.h().open();
    f.client.react("👍");
    f.client.showToAll(1);
    expect(f.sent.slice(-2)).toEqual([{ type: "react", emoji: "👍" }, { type: "showToAll", handIndex: 1 }]);
    const available: AvailableOptions = { expansions: ["base"], variants: {}, languages: ["en"], maxHandSize: 3 };
    f.h().message({
      type: "lobby", seats: [], gameCode: "G", available, saves: [],
      options: { expansions: ["base"], variants: {}, screenLang: "en", handSize: 1, showClosingTiles: false },
    } satisfies ServerMessage);
    expect(f.client.getState().lobby?.available.maxHandSize).toBe(3);
  });
});

describe("hand med tre brickor mot lokal server", () => {
  test("alla brickor syns och valet görs med chooseTile", async () => {
    const client = new Client(localServer({ seed: 3, options: { handSize: 3 } }), { storage: null, search: "?g=DEV", browserLang: "en", languages: ["en"] });
    const until = async (c: () => boolean) => { for (let i = 0; i < 2000 && !c(); i++) await new Promise((r) => setTimeout(r, 1)); expect(c()).toBe(true); };
    await until(() => client.getState().conn === "open");
    client.join("Ada", "#2a6fdb");
    await until(() => client.getState().lobby !== null);
    client.startGame();
    await until(() => client.getState().legal.length > 0);
    const s = client.getState();
    expect(s.hand).toHaveLength(3);
    expect(s.state!.turn.phase).toBe("chooseTile");
    const tiles = handTiles(s.hand, s.legal, null);
    expect(tiles.some((t) => t.canChoose || t.canExchange)).toBe(true);
    const pick = tiles.find((t) => t.canChoose);
    if (pick) {
      client.step({ type: "chooseTile", handIndex: pick.index });
      await until(() => client.getState().state!.turn.phase === "placeTile");
    }
    client.close();
  });
});
