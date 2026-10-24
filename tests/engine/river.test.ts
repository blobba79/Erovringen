import { describe, expect, test } from "bun:test";
import type { Step } from "../../src/shared/state";
import { realEngine, setupOf } from "./helpers";
import { NOFIG, CONFIRM, place$, play, scenario } from "./scenario";
import { playGame } from "../players/random-player";

const eng = realEngine();
const RIVER = ["base", "river"] as const;
const spring: [string, number, number, 0][] = [["river/s", 0, 0, 0]];

const placements = (s: ReturnType<typeof scenario>) =>
  eng.legalSteps(s).filter((x): x is Extract<Step, { type: "placeTile" }> => x.type === "placeTile")
    .map((x) => `${x.pos.x},${x.pos.y}@${x.rotation}`);

describe("floden", () => {
  test("flodbrickor måste fortsätta floden vid den öppna änden", () => {
    const s = scenario(eng, { board: spring, expansions: [...RIVER], hands: [["river/IFI"], []] });
    // Källans flod går österut: en rak bricka ligger bara vid (1,0), med floden öst-väst.
    expect(placements(s)).toEqual(["1,0@0", "1,0@180"].filter((x) => placements(s).includes(x)));
    expect(new Set(placements(s).map((x) => x.split("@")[0]))).toEqual(new Set(["1,0"]));
  });

  test("vanliga brickor kan inte läggas mot flodänden", () => {
    const s = scenario(eng, { board: spring, expansions: [...RIVER], hands: [["base/RFr"], []] });
    expect(eng.apply(s, "p1", place$(1, 0, 0))).toMatchObject({ ok: false });
    // Men väg-fält-brickan går att lägga vid källans fältkanter.
    expect(placements(s).some((x) => x.startsWith("0,-1"))).toBe(true);
  });

  test("ingen omedelbar U-sväng: två kurvor åt samma håll i rad", () => {
    // Källan, sedan kurva W+S (flod från väst, ut söderut = högersväng).
    const board: [string, number, number, 0][] = [...spring, ["river/II", 1, 0, 0]];
    // Nästa kurva måste ta emot floden från norr. RrII (W+S) vänd 90 grader har N+W: ut västerut = ännu en högersväng.
    const s = scenario(eng, { board, expansions: [...RIVER], hands: [["river/RrII"], []] });
    const p = placements(s);
    expect(p.every((x) => x.startsWith("1,1@"))).toBe(true);
    expect(p).not.toContain("1,1@90"); // N+W: U-sväng
    expect(p).toContain("1,1@180"); // N+E: åt andra hållet, tillåtet
  });

  test("rak bricka mellan två kurvor är tillåtet", () => {
    const board: [string, number, number, 0][] = [...spring, ["river/II", 1, 0, 0]];
    const s = scenario(eng, { board, expansions: [...RIVER], hands: [["river/IFI"], []] });
    expect(placements(s)).toEqual(["1,1@90"]);
    const a = play(eng, s, place$(1, 1, 90), NOFIG, CONFIRM).state;
    // Efter den raka brickan får en kurva åt samma håll som första: tillåtet.
    a.players[0]!.hand = ["river/RrII"];
    a.turn = { player: "p1", phase: "placeTile", pending: [] };
    expect(placements(a).length).toBeGreaterThan(1);
  });

  test("sjön får bara läggas sist: inte om flodbrickor finns kvar i högen", () => {
    const board: [string, number, number, 0][] = [...spring, ["river/IFI", 1, 0, 0]];
    const a = scenario(eng, { board, expansions: [...RIVER], hands: [["river/I.e"], []], pile: ["river/IFI"] });
    expect(placements(a)).toEqual([]);
    expect(eng.legalSteps(a).some((x) => x.type === "exchangeTile")).toBe(true);
    const b = scenario(eng, { board, expansions: [...RIVER], hands: [["river/I.e"], []], pile: ["base/L"] });
    expect(placements(b)).toEqual(["2,0@0"]);
  });

  test("flodbricka utan öppen flodände kan inte läggas (floden är klar)", () => {
    const done: [string, number, number, 0][] = [["river/s", 0, 0, 0], ["river/I.e", 1, 0, 0]];
    const s = scenario(eng, { board: done, expansions: [...RIVER], hands: [["river/IFI"], []], pile: ["base/L"] });
    expect(placements(s)).toEqual([]);
  });

  test("sjön avslutar floden; variant shuffle: startbrickan ligger i flodhögen", () => {
    const g = eng.newGame(setupOf([...RIVER], { seed: 3, variants: { "river.startTile": "shuffle", "river.sets": "1" } }));
    expect(g.players.map((p) => p.hand.length)).toEqual([1, 1]);
    const stack = [...g.players.flatMap((p) => p.hand), ...g.drawPile];
    expect(stack.slice(0, 11).filter((t) => t === "base/RCr")).toHaveLength(1);
    expect(stack.slice(0, 11).every((t) => t.startsWith("river/") || t === "base/RCr")).toBe(true);
    expect(stack[11]).toBe("river/I.e");
    expect(stack.slice(12).some((t) => t.startsWith("river/"))).toBe(false);
    expect((g.ext.river as { done: boolean }).done).toBe(false);
  });

  const PLAIN = ["base/A", "base/B", "base/C", "base/D", "base/E", "base/F", "base/G", "base/H", "base/I", "base/J"];

  test("handstorlek 3: sjön lagd; startbrickan överst, sedan vanliga händer från nästa spelare", () => {
    const board: [string, number, number, 0][] = [...spring, ["river/IFI", 1, 0, 0]];
    const s = scenario(eng, { board, expansions: [...RIVER], n: 3, handSize: 3, hands: [["river/I.e"], [], []], pile: PLAIN });
    const r = play(eng, s, place$(2, 0, 0), NOFIG, CONFIRM).state;
    // Pilen: startbrickan, A, B, ... delas ut p2, p3, p1, p2, ...
    expect(r.players.map((p) => p.hand)).toEqual([
      ["base/B", "base/E", "base/H"],
      ["base/RCr", "base/C", "base/F"],
      ["base/A", "base/D", "base/G"],
    ]);
    expect(r.turn.player).toBe("p2");
  });

  test("handstorlek 3: mitt i floden fylls handen bara med flodbrickor och spelare utan bricka hoppas över", () => {
    const board: [string, number, number, 0][] = [...spring];
    const s = scenario(eng, { board, expansions: [...RIVER], n: 3, handSize: 3, hands: [["river/IFI", "river/IFI"], [], []], pile: ["river/IFI", "river/I.e", ...PLAIN] });
    const a = play(eng, s, { type: "chooseTile", handIndex: 0 }, place$(1, 0, 0), NOFIG, CONFIRM).state;
    // p1 fyller på från flodstapeln (1 bricka), p2 och p3 har inget: p1 spelar igen.
    expect(a.players[0]!.hand).toEqual(["river/IFI", "river/IFI"]);
    expect(a.turn.player).toBe("p1");
    expect(a.drawPile[0]).toBe("river/I.e");
  });

  test("sjön ges till nästa spelare när alla andra flodbrickor är lagda, och inte tidigare", () => {
    const board: [string, number, number, 0][] = [...spring];
    const s = scenario(eng, { board, expansions: [...RIVER], n: 3, handSize: 2, hands: [["river/IFI"], ["river/IFI"], []], pile: ["river/I.e", ...PLAIN] });
    const a = play(eng, s, place$(1, 0, 0), NOFIG, CONFIRM).state;
    expect(a.turn.player).toBe("p2"); // p2 har kvar en flodbricka, sjön hålls undan
    expect(a.drawPile[0]).toBe("river/I.e");
    const b = play(eng, a, place$(2, 0, 0), NOFIG, CONFIRM).state;
    expect(b.turn.player).toBe("p3");
    expect(b.players[2]!.hand).toEqual(["river/I.e"]);
  });

  test("byte under flodfasen ger aldrig en vanlig bricka eller sjön i förtid", () => {
    const board: [string, number, number, 0][] = [...spring, ["base/L", 1, 0, 0]];
    // Floden är blockerad: ingen flodbricka går att lägga.
    const s = scenario(eng, { board, expansions: [...RIVER], hands: [["river/IFI"], []], pile: ["river/IFI", "river/I.e", ...PLAIN] });
    const a = play(eng, s, { type: "exchangeTile", handIndex: 0 }).state;
    expect(a.players[0]!.hand).toEqual(["river/IFI"]);
    const t = scenario(eng, { board, expansions: [...RIVER], hands: [["river/IFI"], []], pile: ["river/I.e", ...PLAIN] });
    const b = play(eng, t, { type: "exchangeTile", handIndex: 0 }).state;
    expect(b.players[0]!.hand).toEqual([]);
    expect(b.drawPile[0]).toBe("river/I.e");
  });

  test("variant afterRiver (standard): startbrickan väntar och kommer med i första vanliga utdelningen", () => {
    const g = eng.newGame(setupOf([...RIVER], { seed: 3 }));
    const all = [...g.players.flatMap((p) => p.hand), ...g.drawPile];
    expect(all.filter((t) => t === "base/RCr")).toHaveLength(3);
    expect((g.ext.river as { waitingStart?: string }).waitingStart).toBe("base/RCr");
    expect(all.slice(0, 21).every((t) => t.startsWith("river/"))).toBe(true);
    const s = scenario(eng, { board: [["river/s", 0, 0, 0], ["river/IFI", 1, 0, 0]], expansions: [...RIVER], handSize: 3, hands: [["river/I.e"], []], pile: ["base/L", "base/L", "base/L", "base/L", "base/L", "base/L", "base/L"] });
    (s.ext.river as { waitingStart?: string }).waitingStart = "base/RCr";
    const r = play(eng, s, place$(2, 0, 0), NOFIG, CONFIRM);
    expect((r.state.ext.river as { done: boolean }).done).toBe(true);
    expect((r.state.ext.river as { waitingStart?: string }).waitingStart).toBeUndefined();
    expect(r.state.turn.player).toBe("p2");
    expect(r.state.players.map((p) => p.hand.length)).toEqual([3, 3]);
    expect(r.state.players[1]!.hand[0]).toBe("base/RCr"); // överst i högen: nästa spelare får den först
  });

  test("river.sets: två uppsättningar ger 20 flodbrickor men en källa och en sjö; \"1\" ger 10", () => {
    const count = (v: Record<string, string>) => {
      const g = eng.newGame(setupOf([...RIVER], { variants: v, handSize: 3 }));
      const all = [...g.players.flatMap((p) => p.hand), ...g.drawPile].filter((t) => t.startsWith("river/"));
      return { n: all.length, lakes: all.filter((t) => t === "river/I.e").length, springs: all.filter((t) => t === "river/s").length + (g.board["0,0"]!.type === "river/s" ? 1 : 0) };
    };
    expect(count({})).toEqual({ n: 21, lakes: 1, springs: 1 });
    expect(count({ "river.sets": "2" })).toEqual({ n: 21, lakes: 1, springs: 1 });
    expect(count({ "river.sets": "1" })).toEqual({ n: 11, lakes: 1, springs: 1 });
  });

  test("ingen vanlig bricka på hand eller lagd före sjön (många frön, båda startTile, handSize 1 och 3)", () => {
    for (let seed = 1; seed <= 24; seed++)
      for (const startTile of ["afterRiver", "shuffle"])
        for (const handSize of [1, 3]) {
          const n = 2 + (seed % 4);
          let s = eng.newGame(setupOf([...RIVER], { seed, n, handSize, variants: { "river.startTile": startTile } }));
          const rnd = (() => { let x = seed * 7919; return () => (x = (x * 1103515245 + 12345) % 2147483648) / 2147483648; })();
          for (let guard = 0; guard < 4000 && !(s.ext.river as { dealt?: boolean }).dealt && !s.finished; guard++) {
            const hand = s.players.flatMap((p) => p.hand);
            const ok = (t: string) => t.startsWith("river/") || (startTile === "shuffle" && t === "base/RCr");
            if (!hand.every(ok)) throw new Error(`vanlig bricka på hand: frö ${seed} ${startTile} ${handSize}`);
            if (s.drawPile.length > 0 && !(s.ext.river as { done: boolean }).done) {
              const lakeAt = s.drawPile.indexOf("river/I.e");
              if (lakeAt >= 0 && s.players.some((p) => p.hand.includes("river/I.e"))) throw new Error("sjön delad två gånger");
            }
            const steps = eng.legalSteps(s).filter((x) => x.type !== "undo");
            const confirm = steps.find((x) => x.type === "confirm");
            const step = confirm ?? steps[Math.floor(rnd() * steps.length)]!;
            const r = eng.apply(s, s.turn.player, step);
            if (!r.ok) throw new Error(r.error);
            s = r.state;
          }
          expect((s.ext.river as { dealt?: boolean }).dealt).toBe(true);
        }
  }, 600_000);

  test("floden låser sig inte: många slumpspel med handSize 1 och 3, utan kastade flodbrickor", () => {
    for (let i = 0; i < 40; i++) {
      const handSize = i % 2 ? 3 : 1;
      const r = playGame(eng, setupOf(["base", "river"], { n: 2 + (i % 4), seed: 500 + i, handSize, variants: { "river.startTile": i % 5 === 0 ? "shuffle" : "afterRiver" } }), { strategy: i % 3 ? "eager" : "random", checkUndo: false });
      expect((r.state.ext.base as { discarded: string[] }).discarded.filter((t) => t.startsWith("river/"))).toEqual([]);
      expect(r.state.finished).toBe(true);
    }
  }, 900_000);

  test("pjäser får stå på flodbrickornas städer, vägar och fält men inte på floden", () => {
    const s = scenario(eng, { board: spring, expansions: [...RIVER], hands: [["river/CIRI"], []] });
    const placed = play(eng, s, place$(1, 0, 0)).state;
    const feats = eng.legalSteps(placed).filter((x) => x.type === "placeFigure").map((x) => (x.type === "placeFigure" ? x.feature : ""));
    expect(feats).not.toContain("river0");
    expect(feats.some((f) => f.startsWith("city") || f.startsWith("road") || f.startsWith("field"))).toBe(true);
  });

  test("river.deadEnds: allow tillåter en bricka som kan köra fast floden, forbid (som JCZ) förbjuder den", () => {
    // Källan, och en vanlig bricka två steg fram i sidled mot flodens fortsättning (3,1).
    const board: [string, number, number, 0][] = [...spring, ["base/L", 3, 1, 0]];
    const mk = (v: string) => scenario(eng, { board, expansions: [...RIVER], hands: [["river/IFI"], []], pile: ["river/IFI"], variants: { "river.deadEnds": v } });
    expect(placements(mk("allow"))).toContain("1,0@0");
    expect(placements(mk("forbid"))).toEqual([]);
    // Fritt framför: forbid tillåter.
    const free = scenario(eng, { board: spring, expansions: [...RIVER], hands: [["river/IFI"], []], pile: ["river/IFI"], variants: { "river.deadEnds": "forbid" } });
    expect(placements(free).length).toBeGreaterThan(0);
  });

  test("river.deadEnds=forbid: den inblandade startbrickan får inte spärra flodens väg", () => {
    const mk = (v: string) => scenario(eng, { board: spring, expansions: [...RIVER], hands: [["base/RCr"], []], pile: ["river/IFI"], variants: { "river.deadEnds": v } });
    const blocked = (s: ReturnType<typeof scenario>) => placements(s).some((x) => x.startsWith("2,1@") || x.startsWith("2,-1@"));
    expect(blocked(mk("forbid"))).toBe(false);
  });});
