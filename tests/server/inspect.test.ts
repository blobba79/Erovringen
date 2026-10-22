import { describe, expect, test } from "bun:test";
import type { GameState } from "../../src/shared/state";
import type { Rotation } from "../../src/shared/tiles";
import { createGameEngine } from "../../src/server/modules";
import { featureAt, inspectAt } from "../../src/server/inspect";
import { allTileTypes } from "../../src/tiles/index";

const engine = createGameEngine();
const setup = {
  expansions: ["base" as const], variants: {}, handSize: 1, showClosingTiles: true,
  players: [{ id: "p1", name: "A", color: "red" }, { id: "p2", name: "B", color: "blue" }], seed: 7,
};

/** En bricka med en enda stad som bara går ut åt norr. */
const cityTile = [...allTileTypes().values()].find(
  (t) => t.expansion === "base" && t.features.filter((f) => f.kind === "city").length === 1 &&
    (t.features.find((f) => f.kind === "city") as { edges: string[] }).edges.join() === "N" &&
    !t.features.some((f) => f.kind === "road"),
)!;

function stateWith(rotation: Rotation): GameState {
  const s = engine.newGame(setup);
  s.board["1,0"] = { type: cityTile.id, pos: { x: 1, y: 0 }, rotation };
  return s;
}

describe("området under siktet", () => {
  test("hittar staden med hänsyn till brickans rotation", () => {
    expect(cityTile).toBeDefined();
    const cityId = cityTile.features.find((f) => f.kind === "city")!.id;
    const at = (rot: Rotation, dx: number, dy: number) => featureAt(engine, stateWith(rot), 1 + dx, dy);
    expect(at(0, 0, -0.45)?.feature).toBe(cityId); // norr
    expect(at(90, 0.45, 0)?.feature).toBe(cityId); // öster
    expect(at(180, 0, 0.45)?.feature).toBe(cityId); // söder
    expect(at(270, -0.45, 0)?.feature).toBe(cityId); // väster
    expect(at(90, -0.45, 0)?.feature).not.toBe(cityId);
    expect(at(0, 0, 0.45)?.feature).not.toBe(cityId);
  });

  test("tom ruta ger ingen träff", () => {
    expect(featureAt(engine, stateWith(0), 10, 10)).toBeUndefined();
  });

  test("markeringen beskriver utbredning, poäng och öppningar", () => {
    const s = stateWith(90);
    const r = inspectAt(engine, s, 1.45, 0, true);
    expect(r.tiles).toEqual([{ x: 1, y: 0 }]);
    expect(r.complete).toBe(false);
    expect(r.points).toBeGreaterThan(0);
    expect(r.openSpots).toEqual([{ x: 2, y: 0 }]);
    expect(r.majority).toEqual([]);
    // antal brickor i högen som kan fylla öppningen räknas bara om det är valt
    expect(r.closingTiles?.["2,0"]).toBeGreaterThan(0);
    expect(r.closingTiles?.["2,0"]).toBeLessThanOrEqual(s.drawPile.length);
    expect(inspectAt(engine, s, 1.45, 0, false).closingTiles).toBeUndefined();
  });

  test("en öppning som ingen bricka kan stänga markeras som blockerad", () => {
    const s = stateWith(90);
    s.drawPile = [];
    for (const p of s.players) p.hand = [];
    const r = inspectAt(engine, s, 1.45, 0, true);
    expect(r.blockedSpots).toEqual([{ x: 2, y: 0 }]);
    expect(r.closingTiles?.["2,0"]).toBe(0);
  });

  test("fält: berättar vilka färdiga städer det gränsar till (inga här)", () => {
    const s = stateWith(90);
    const r = inspectAt(engine, s, 1.0, 0.4, true);
    expect(r.completedCities).toEqual([]);
    expect(r.tiles).toContainEqual({ x: 1, y: 0 });
    expect(r.complete).toBe(false);
  });
});
