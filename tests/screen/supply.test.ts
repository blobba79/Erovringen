import { describe, expect, test } from "bun:test";
import { CURSOR_HIDE_MS, neutralSupply, playerSupply } from "../../src/screen/supply";
import { initialModel, reduce } from "../../src/screen/store";
import en from "../../locales/en.json";
import sv from "../../locales/sv.json";

const fig = (id: string, kind: string, owner: string | null, at: "supply" | "tile" = "supply") =>
  ({ id, kind, owner, location: at === "supply" ? { at } : { at, pos: { x: 0, y: 0 } } }) as never;

describe("pjäser kvar", () => {
  const figures = [
    fig("a1", "meeple", "p1"), fig("a2", "meeple", "p1"), fig("a3", "meeple", "p1", "tile"),
    fig("a4", "large-meeple", "p1"), fig("a5", "abbot", "p1"),
    fig("b1", "meeple", "p2"),
    fig("d", "dragon", null), fig("f", "fairy", null, "tile"),
  ];

  test("per spelare räknas bara förrådet, följare först", () => {
    expect(playerSupply({ figures }, "p1")).toEqual([
      { kind: "meeple", count: 2 }, { kind: "large-meeple", count: 1 }, { kind: "abbot", count: 1 },
    ]);
    expect(playerSupply({ figures }, "p2")).toEqual([{ kind: "meeple", count: 1 }]);
  });

  test("neutrala pjäser i förrådet visas, de på kartan inte", () => {
    expect(neutralSupply({ figures, ext: {} })).toEqual([{ kind: "dragon", count: 1 }]);
  });

  test("utdelade guldtackor räknas inte; alla kvar ger en ikon med antal", () => {
    const bars = Array.from({ length: 16 }, (_, i) => fig(`g${i}`, "gold-bar", null));
    expect(neutralSupply({ figures: bars, ext: {} })).toEqual([{ kind: "gold-bar", count: 16 }]);
    const ext = { "gold-mines": { taken: ["g0", "g1", "g2"] } };
    expect(neutralSupply({ figures: bars, ext })).toEqual([{ kind: "gold-bar", count: 13 }]);
    const all = { "gold-mines": { taken: bars.map((b: { id: string }) => b.id) } };
    expect(neutralSupply({ figures: bars, ext: all })).toEqual([]);
  });
});

test("modellen följer remainingShown och pekaren döljs efter tio sekunder", () => {
  expect(initialModel.remainingShown).toBe(false);
  const on = reduce(initialModel, { type: "remainingShown", on: true });
  expect(on.remainingShown).toBe(true);
  expect(reduce(on, { type: "remainingShown", on: false }).remainingShown).toBe(false);
  expect(CURSOR_HIDE_MS).toBe(10_000);
});

test("språknycklar för knapparna finns på båda språken", () => {
  for (const k of ["screen.fullscreen", "screen.exitFullscreen", "screen.quit", "screen.quit.confirm", "phone.showRemaining", "phone.hideRemaining"]) {
    expect(k in en).toBe(true);
    expect(k in sv).toBe(true);
  }
  expect((sv as unknown as Record<string, string>)["screen.quit.confirm"]).toBe("Avsluta Erövringen? Spelet är sparat.");
});
