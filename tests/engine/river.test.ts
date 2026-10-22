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
    const n = g.players.length;
    const startIdx = g.players.findIndex((p) => p.id === g.turn.player);
    const stack = [...Array(n).keys()].map((k) => g.players[(startIdx + k) % n]!.hand[0]!).concat(g.drawPile);
    expect(stack.slice(0, 11).filter((t) => t === "base/RCr")).toHaveLength(1);
    expect(stack.slice(0, 11).every((t) => t.startsWith("river/") || t === "base/RCr")).toBe(true);
    expect(stack[11]).toBe("river/I.e");
    expect(stack.slice(12).some((t) => t.startsWith("river/"))).toBe(false);
    expect((g.ext.river as { done: boolean }).done).toBe(false);
  });

  test("variant afterRiver: startbrickan väntar och hamnar överst i högen när sjön är lagd", () => {
    const g = eng.newGame(setupOf([...RIVER], { seed: 3, variants: { "river.startTile": "afterRiver" } }));
    const all = [...g.players.flatMap((p) => p.hand), ...g.drawPile];
    expect(all.filter((t) => t === "base/RCr")).toHaveLength(3);
    expect((g.ext.river as { waitingStart?: string }).waitingStart).toBe("base/RCr");
    expect(all.slice(0, 11).every((t) => t.startsWith("river/"))).toBe(true);
    const s = scenario(eng, { board: [["river/s", 0, 0, 0], ["river/IFI", 1, 0, 0]], expansions: [...RIVER], hands: [["river/I.e"], []], pile: ["base/L"] });
    (s.ext.river as { waitingStart?: string }).waitingStart = "base/RCr";
    const r = play(eng, s, place$(2, 0, 0), NOFIG, CONFIRM);
    expect((r.state.ext.river as { done: boolean }).done).toBe(true);
    expect((r.state.ext.river as { waitingStart?: string }).waitingStart).toBeUndefined();
    expect(r.state.players[0]!.hand).toEqual(["base/RCr"]); // överst i högen, dras av den som la sjön
  });

  test("pjäser får stå på flodbrickornas städer, vägar och fält men inte på floden", () => {
    const s = scenario(eng, { board: spring, expansions: [...RIVER], hands: [["river/CIRI"], []] });
    const placed = play(eng, s, place$(1, 0, 0)).state;
    const feats = eng.legalSteps(placed).filter((x) => x.type === "placeFigure").map((x) => (x.type === "placeFigure" ? x.feature : ""));
    expect(feats).not.toContain("river0");
    expect(feats.some((f) => f.startsWith("city") || f.startsWith("road") || f.startsWith("field"))).toBe(true);
  });
});
