import { describe, expect, test } from "bun:test";
import { realEngine } from "./helpers";
import { CONFIRM, NOFIG, fig$, inSupply, place$, play, reasons, scenario, score, type Rot } from "./scenario";

const eng = realEngine();
const M = (p: string, n = 0) => `${p}:meeple:${n}`;

/** Väg mellan två kloster: (0,0) LR, (0,1) lagd sist, (0,2) LR vänd. */
const roadBoard: [string, number, number, Rot][] = [["base/LR", 0, 0, 0], ["base/LR", 0, 2, 180]];

describe("vägar", () => {
  test("färdig väg: 1 poäng per bricka, tjuven går hem", () => {
    const s = scenario(eng, { board: roadBoard, hands: [["base/RFr"], []], figures: [{ id: M("p2"), x: 0, y: 0, feature: "road0" }] });
    const r = play(eng, s, place$(0, 1, 90), NOFIG, CONFIRM);
    expect(score(r.state, "p2")).toBe(3);
    expect(score(r.state, "p1")).toBe(0);
    expect(inSupply(r.state, M("p2"))).toBe(true);
    expect(reasons(r.events)).toEqual(["p2:road:3"]);
  });

  test("pjäs placeras på brickan som avslutar vägen: poäng och retur direkt", () => {
    const s = scenario(eng, { board: roadBoard, hands: [["base/RFr"], []] });
    const r = play(eng, s, place$(0, 1, 90), fig$("meeple", 0, 1, "road0"), CONFIRM);
    expect(score(r.state, "p1")).toBe(3);
    expect(inSupply(r.state, M("p1"))).toBe(true);
  });

  test("två pjäser från samma spelare ger inte dubbla poäng; flest pjäser vinner", () => {
    const s = scenario(eng, {
      board: roadBoard, hands: [["base/RFr"], []],
      figures: [{ id: M("p1"), x: 0, y: 0, feature: "road0" }, { id: M("p1", 1), x: 0, y: 0, feature: "road0" }, { id: M("p2"), x: 0, y: 2, feature: "road0" }],
    });
    const r = play(eng, s, place$(0, 1, 90), NOFIG, CONFIRM);
    expect(reasons(r.events)).toEqual(["p1:road:3"]);
    expect(score(r.state, "p2")).toBe(0);
    expect([M("p1"), M("p1", 1), M("p2")].every((id) => inSupply(r.state, id))).toBe(true);
  });

  test("lika många pjäser: alla får full poäng", () => {
    const s = scenario(eng, {
      board: roadBoard, hands: [["base/RFr"], []],
      figures: [{ id: M("p1"), x: 0, y: 0, feature: "road0" }, { id: M("p2"), x: 0, y: 2, feature: "road0" }],
    });
    const r = play(eng, s, place$(0, 1, 90), NOFIG, CONFIRM);
    expect(score(r.state, "p1")).toBe(3);
    expect(score(r.state, "p2")).toBe(3);
  });

  test("öppen väg räknas inte; pjäsen blir kvar", () => {
    const s = scenario(eng, { board: [["base/LR", 0, 0, 0]], hands: [["base/RFr"], []], figures: [{ id: M("p2"), x: 0, y: 0, feature: "road0" }] });
    const r = play(eng, s, place$(0, 1, 90), NOFIG, CONFIRM);
    expect(score(r.state, "p2")).toBe(0);
    expect(inSupply(r.state, M("p2"))).toBe(false);
  });

  test("sluten väg (slinga) är färdig", () => {
    // Rr har väg W+S; 270 grader ger E+S, 180 ger N+E, 90 ger N+W.
    const loop: [string, number, number, Rot][] = [["base/Rr", 1, 0, 0], ["base/Rr", 0, 1, 180], ["base/Rr", 1, 1, 90]];
    const s = scenario(eng, { board: loop, hands: [["base/Rr"], []] });
    const r = play(eng, s, place$(0, 0, 270), fig$("meeple", 0, 0, "road0"), CONFIRM);
    expect(score(r.state, "p1")).toBe(4);
  });
});

describe("städer", () => {
  const cityBoard: [string, number, number, Rot][] = [["base/Cc+", 0, 0, 0], ["base/C", 0, -1, 180]];

  test("färdig stad: 2 per bricka och 2 per sköld", () => {
    const s = scenario(eng, { board: cityBoard, hands: [["base/C"], []] });
    const r = play(eng, s, place$(-1, 0, 90), fig$("meeple", -1, 0, "city0"), CONFIRM);
    expect(score(r.state, "p1")).toBe(8); // 3 brickor + 1 sköld = 4 * 2
    expect(inSupply(r.state, M("p1"))).toBe(true);
  });

  test("pjäs på en del av staden hindrar ny pjäs i samma stad, hur långt bort den än står", () => {
    const s = scenario(eng, {
      board: cityBoard, hands: [["base/C"], []],
      figures: [{ id: M("p2"), x: 0, y: -1, feature: "city0" }],
    });
    const placed = play(eng, s, place$(-1, 0, 90)).state;
    const r = eng.apply(placed, "p1", fig$("meeple", -1, 0, "city0"));
    expect(r).toEqual({ ok: false, error: "error.featureOccupied" });
    expect(eng.legalSteps(placed).some((x) => x.type === "placeFigure" && x.feature === "city0")).toBe(false);
    // Fälten på brickan går fortfarande bra.
    expect(eng.legalSteps(placed).some((x) => x.type === "placeFigure" && x.feature === "field0")).toBe(true);
    const done = play(eng, placed, NOFIG, CONFIRM);
    expect(score(done.state, "p2")).toBe(8);
  });

  test("ofärdig stad ger ingenting under spelet", () => {
    const s = scenario(eng, { board: cityBoard, hands: [["base/L"], []], figures: [{ id: M("p2"), x: 0, y: 0, feature: "city0" }] });
    const r = play(eng, s, place$(0, 1, 0), NOFIG, CONFIRM);
    expect(score(r.state, "p2")).toBe(0);
  });

  test("stad där samma bricka har två delar av staden räknar brickan en gång", () => {
    // 3x3-ring av stad med CFC.2 (stad norr och söder) i mitten: 9 brickor = 18 poäng.
    const ring: [string, number, number, Rot][] = [
      ["base/Cc.1", 0, 0, 180], ["base/Ccc", 1, 0, 180], ["base/Cc.1", 2, 0, 270],
      ["base/CFc.1", 0, 1, 90], ["base/CFc.1", 2, 1, 90],
      ["base/Cc.1", 0, 2, 90], ["base/Ccc", 1, 2, 0], ["base/Cc.1", 2, 2, 0],
    ];
    const s = scenario(eng, { board: ring, hands: [["base/CFC.2"], []] });
    const placed = play(eng, s, place$(1, 1, 0));
    const r = play(eng, placed.state, fig$("meeple", 1, 1, "city0"), CONFIRM);
    expect(score(r.state, "p1")).toBe(18);
  });
});

describe("kloster", () => {
  const ring: [string, number, number, Rot][] = [
    ["base/L", 0, 0, 0], ["base/L", -1, -1, 0], ["base/L", 0, -1, 0], ["base/L", 1, -1, 0],
    ["base/L", -1, 0, 0], ["base/L", 1, 0, 0], ["base/L", -1, 1, 0], ["base/L", 0, 1, 0],
  ];

  test("kloster med åtta grannar: 9 poäng, munken går hem", () => {
    const s = scenario(eng, { board: ring, hands: [["base/L"], []], figures: [{ id: M("p2"), x: 0, y: 0, feature: "cloister" }] });
    const r = play(eng, s, place$(1, 1, 0), NOFIG, CONFIRM);
    expect(score(r.state, "p2")).toBe(9);
    expect(inSupply(r.state, M("p2"))).toBe(true);
  });

  test("kloster som saknar en granne är ofärdigt", () => {
    const s = scenario(eng, { board: ring.slice(1), hands: [["base/L"], []] });
    const r = play(eng, s, place$(0, 0, 0), fig$("meeple", 0, 0, "cloister"), CONFIRM);
    expect(score(r.state, "p1")).toBe(0);
    expect(inSupply(r.state, M("p1"))).toBe(false);
  });
});

describe("spelets slut", () => {
  test("slutpoäng: ofärdig stad (sköld = 1), ofärdigt kloster och tomma fält ger ingenting", () => {
    const s = scenario(eng, {
      board: [["base/Cc+", 0, 0, 0]], hands: [["base/L"], []], pile: [],
      figures: [{ id: M("p2"), x: 0, y: 0, feature: "city0" }],
    });
    const r = play(eng, s, place$(0, 1, 0), fig$("meeple", 0, 1, "cloister"), CONFIRM);
    expect(r.state.finished).toBe(true);
    expect(r.events.some((e) => e.type === "gameEnded")).toBe(true);
    expect(score(r.state, "p2")).toBe(2); // 1 bricka + 1 sköld
    expect(score(r.state, "p1")).toBe(2); // kloster: sig själv + 1 granne
    expect(reasons(r.events).sort()).toEqual(["p1:final.cloister:2", "p2:final.city:2"]);
  });

  test("fält: 3 poäng per färdig stad; en stad kan ge poäng åt flera fält", () => {
    const s = scenario(eng, {
      board: [["base/RCr", 0, 0, 0]], hands: [["base/C"], []], pile: [],
      figures: [{ id: M("p2"), x: 0, y: 0, feature: "field0" }],
    });
    const r = play(eng, s, place$(0, -1, 180), fig$("meeple", 0, -1, "field0"), CONFIRM);
    expect(r.state.finished).toBe(true);
    expect(score(r.state, "p1")).toBe(3);
    expect(score(r.state, "p2")).toBe(3);
    expect(reasons(r.events).sort()).toEqual(["p1:final.farm:3", "p2:final.farm:3"]);
  });

  test("fält som bara gränsar till ofärdig stad ger 0", () => {
    const s = scenario(eng, { board: [["base/RCr", 0, 0, 0]], hands: [["base/RFr"], []], pile: [], figures: [{ id: M("p2"), x: 0, y: 0, feature: "field0" }] });
    const r = play(eng, s, place$(1, 0, 0), NOFIG, CONFIRM);
    expect(r.state.finished).toBe(true);
    expect(score(r.state, "p2")).toBe(0);
  });

  test("färdig stad i sista draget räknas som vanligt innan slutpoängen", () => {
    const s = scenario(eng, { board: [["base/RCr", 0, 0, 0]], hands: [["base/C"], []], pile: [], figures: [{ id: M("p2"), x: 0, y: 0, feature: "city0" }] });
    const r = play(eng, s, place$(0, -1, 180), NOFIG, CONFIRM);
    expect(reasons(r.events)[0]).toBe("p2:city:4");
    expect(r.state.finished).toBe(true);
  });

  test("spelet slutar först när hög och alla händer är tomma", () => {
    const s = scenario(eng, { board: [["base/RCr", 0, 0, 0]], hands: [["base/RFr"], ["base/RFr"]], pile: [] });
    const a = play(eng, s, place$(1, 0, 0), NOFIG, CONFIRM);
    expect(a.state.finished).toBe(false);
    expect(a.state.turn.player).toBe("p2");
    const b = play(eng, a.state, place$(-1, 0, 0), NOFIG, CONFIRM);
    expect(b.state.finished).toBe(true);
  });
});
