import { describe, expect, test } from "bun:test";
import type { Step } from "../../src/shared/state";
import { realEngine, setupOf } from "./helpers";
import { NOFIG, CONFIRM, place$, play, scenario } from "./scenario";

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
    const g = eng.newGame(setupOf([...RIVER], { seed: 3 }));
    // Bara den som har turen håller en bricka under flodfasen.
    expect(g.players.map((p) => p.hand.length).sort()).toEqual([0, 1]);
    const stack = [...g.players.flatMap((p) => p.hand), ...g.drawPile];
    expect(stack.slice(0, 11).filter((t) => t === "base/RCr")).toHaveLength(1);
    expect(stack.slice(0, 11).every((t) => t.startsWith("river/") || t === "base/RCr")).toBe(true);
    expect(stack[11]).toBe("river/I.e");
    expect(stack.slice(12).some((t) => t.startsWith("river/"))).toBe(false);
    expect((g.ext.river as { done: boolean }).done).toBe(false);
  });

  test("handstorlek 3: ingen håller brickor under floden; vanliga händer delas ut efter sjön, från nästa spelare", () => {
    const board: [string, number, number, 0][] = [...spring, ["river/IFI", 1, 0, 0]];
    const s = scenario(eng, { board, expansions: [...RIVER], n: 3, handSize: 3, hands: [["river/I.e"], [], []], pile: ["base/A", "base/B", "base/C", "base/D", "base/E", "base/F", "base/G", "base/H", "base/I", "base/J"] });
    (s.ext.river as { dealt?: boolean }).dealt = false;
    const r = play(eng, s, place$(2, 0, 0), NOFIG, CONFIRM).state;
    expect(r.players.map((p) => p.hand)).toEqual([
      ["base/C", "base/F", "base/I"],
      ["base/A", "base/D", "base/G"],
      ["base/B", "base/E", "base/H"],
    ]);
    expect(r.turn.player).toBe("p2");
  });

  test("handstorlek 3: mitt i floden dras en bricka per tur och ingen lägger vanliga brickor", () => {
    const board: [string, number, number, 0][] = [...spring];
    const s = scenario(eng, { board, expansions: [...RIVER], n: 3, handSize: 3, hands: [["river/IFI"], [], []], pile: ["river/IFI", "river/I.e", "base/L", "base/L"] });
    const a = play(eng, s, place$(1, 0, 0), NOFIG, CONFIRM).state;
    expect(a.turn.player).toBe("p2");
    expect(a.players.map((p) => p.hand.length)).toEqual([0, 1, 0]);
    expect(a.players[1]!.hand).toEqual(["river/IFI"]);
  });

  test("variant afterRiver: startbrickan väntar; nästa spelare drar den efter sjön, sedan delas händerna", () => {
    const g = eng.newGame(setupOf([...RIVER], { seed: 3, variants: { "river.startTile": "afterRiver" } }));
    const all = [...g.players.flatMap((p) => p.hand), ...g.drawPile];
    expect(all.filter((t) => t === "base/RCr")).toHaveLength(3);
    expect((g.ext.river as { waitingStart?: string }).waitingStart).toBe("base/RCr");
    expect(all.slice(0, 11).every((t) => t.startsWith("river/"))).toBe(true);
    const s = scenario(eng, { board: [["river/s", 0, 0, 0], ["river/IFI", 1, 0, 0]], expansions: [...RIVER], handSize: 3, hands: [["river/I.e"], []], pile: ["base/L", "base/L", "base/L", "base/L", "base/L", "base/L", "base/L"] });
    (s.ext.river as { waitingStart?: string }).waitingStart = "base/RCr";
    const r = play(eng, s, place$(2, 0, 0), NOFIG, CONFIRM);
    expect((r.state.ext.river as { done: boolean }).done).toBe(true);
    expect((r.state.ext.river as { waitingStart?: string }).waitingStart).toBeUndefined();
    expect(r.state.turn.player).toBe("p2");
    expect(r.state.players[1]!.hand).toEqual(["base/RCr"]); // nästa bricka efter sjön, dragen av nästa spelare
    expect(r.state.players[0]!.hand).toEqual([]);
    // Efter att den lagts delas vanliga händer ut, från nästa spelare (p1).
    const ok = eng.legalSteps(r.state).find((x) => x.type === "placeTile")!;
    const b =play(eng, r.state, ok, NOFIG, CONFIRM).state;
    expect(b.players.map((p) => p.hand.length)).toEqual([3, 3]);
    expect(b.turn.player).toBe("p1");
  });

  test("pjäser får stå på flodbrickornas städer, vägar och fält men inte på floden", () => {
    const s = scenario(eng, { board: spring, expansions: [...RIVER], hands: [["river/CIRI"], []] });
    const placed = play(eng, s, place$(1, 0, 0)).state;
    const feats = eng.legalSteps(placed).filter((x) => x.type === "placeFigure").map((x) => (x.type === "placeFigure" ? x.feature : ""));
    expect(feats).not.toContain("river0");
    expect(feats.some((f) => f.startsWith("city") || f.startsWith("road") || f.startsWith("field"))).toBe(true);
  });
});
