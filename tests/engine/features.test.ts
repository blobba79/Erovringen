import { describe, expect, test } from "bun:test";
import { areaValue, describeFeature, majorityOwners } from "../../src/engine/index";
import { realEngine } from "./helpers";
import { scenario } from "./scenario";

const eng = realEngine();

describe("områden över brickor", () => {
  test("städer, vägar och fält slås ihop; öppna kanter och värde just nu", () => {
    const s = scenario(eng, {
      board: [["base/RCr", 0, 0, 0], ["base/C", 0, -1, 180], ["base/Rr", 1, 0, 0]],
      figures: [{ id: "p1:meeple:0", x: 0, y: 0, feature: "road0" }],
    });
    const an = eng.analyze(s);
    const city = an.areaAt({ x: 0, y: 0 }, "city0")!;
    expect(city.kind).toBe("city");
    expect(city.complete).toBe(true);
    expect(city.tiles).toHaveLength(2);
    expect(areaValue(an, city)).toBe(4);
    expect(an.areaAt({ x: 0, y: -1 }, "city0")).toBe(city);
    // Vägen (0,0)-(1,0): Rr vid (1,0) har väg W+S, så en öppen ände söderut och en västerut (mot (0,0)).
    const road = an.areaAt({ x: 0, y: 0 }, "road0")!;
    expect(road.tiles).toHaveLength(2);
    expect(road.complete).toBe(false);
    expect(road.openEdges.map((o) => `${o.pos.x},${o.pos.y}${o.edge}`).sort()).toEqual(["0,0W", "1,0S"]);
    expect(areaValue(an, road)).toBe(2);
    expect(majorityOwners(road)).toEqual(["p1"]);
  });

  test("fält: gränsande färdiga städer räknas, och vägen delar fälten", () => {
    const s = scenario(eng, { board: [["base/RCr", 0, 0, 0], ["base/C", 0, -1, 180]] });
    const an = eng.analyze(s);
    const north = an.areaAt({ x: 0, y: 0 }, "field0")!;
    const south = an.areaAt({ x: 0, y: 0 }, "field1")!;
    expect(north).not.toBe(south);
    expect(north.adjacentCities).toHaveLength(1);
    expect(south.adjacentCities).toHaveLength(0);
    expect(areaValue(an, north)).toBe(3);
    expect(areaValue(an, south)).toBe(0);
  });

  test("kloster: tomma grannrutor och värde", () => {
    const s = scenario(eng, { board: [["base/L", 0, 0, 0], ["base/L", 1, 0, 0], ["base/L", 0, 1, 0]] });
    const c = eng.analyze(s).areaAt({ x: 0, y: 0 }, "cloister")!;
    expect(c.openSquares).toHaveLength(6);
    expect(c.complete).toBe(false);
    expect(areaValue(eng.analyze(s), c)).toBe(3);
  });

  test("trädgård räknas som kloster", () => {
    const s = scenario(eng, { board: [["base/CG", 0, 0, 0]] });
    const g = eng.analyze(s).areaAt({ x: 0, y: 0 }, "garden")!;
    expect(g.kind).toBe("garden");
    expect(areaValue(eng.analyze(s), g)).toBe(1);
  });

  test("flodsegment bildar områden men ger inga poäng", () => {
    const s = scenario(eng, { board: [["river/s", 0, 0, 0], ["river/II", 1, 0, 0]] });
    const an = eng.analyze(s);
    const river = an.areaAt({ x: 0, y: 0 }, "river0")!;
    expect(river.kind).toBe("river");
    expect(river.tiles).toHaveLength(2);
    expect(areaValue(an, river)).toBe(0);
  });

  test("källans fält går runt floden och är ett fält", () => {
    const s = scenario(eng, { board: [["river/s", 0, 0, 0]] });
    const an = eng.analyze(s);
    expect(an.areas.filter((a) => a.kind === "field")).toHaveLength(1);
  });

  test("floden delar fält åt två håll", () => {
    // Två raka flodbrickor (W-E): ett fält norr och ett söder, var och ett över båda brickorna.
    const s = scenario(eng, { board: [["river/IFI", 0, 0, 0], ["river/IFI", 1, 0, 0]] });
    const fields = eng.analyze(s).areas.filter((a) => a.kind === "field");
    expect(fields).toHaveLength(2);
    expect(fields.every((f) => f.tiles.length === 2)).toBe(true);
  });

  test("describeFeature: utbredning, majoritet, värde och det som återstår", () => {
    const s = scenario(eng, {
      board: [["base/L", 0, 0, 0], ["base/L", 1, 0, 0]],
      figures: [{ id: "p2:meeple:0", x: 0, y: 0, feature: "cloister" }],
    });
    const d = describeFeature(s, eng.types, { x: 0, y: 0 }, "cloister")!;
    expect(d).toMatchObject({ kind: "cloister", complete: false, owners: ["p2"], value: 2, filledSquares: 1 });
    expect(d.openSquares).toHaveLength(7);
    expect(describeFeature(s, eng.types, { x: 0, y: 0 }, "nej")).toBeUndefined();
  });
});
