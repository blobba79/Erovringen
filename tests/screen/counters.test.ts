import { describe, expect, test } from "bun:test";
import { visibleCounters } from "../../src/screen/logic";
import { visibleCounters as phoneCounters } from "../../src/phone/logic/counters";
import en from "../../locales/en.json";
import sv from "../../locales/sv.json";

describe.each([["storskärm", visibleCounters], ["telefon", phoneCounters]] as const)("räknare, %s", (_n, fn) => {
  test("noll döljs, resten visas i stabil ordning", () => {
    const r = fn({ gold: 0, "goods.wine": 2, "goods.cloth": 1, "goods.grain": 0 });
    expect(r.map((c) => [c.id, c.count])).toEqual([["goods.cloth", 1], ["goods.wine", 2]]);
  });
  test("alla noll eller saknas ger tomt", () => {
    expect(fn({ gold: 0 })).toEqual([]);
    expect(fn({})).toEqual([]);
    expect(fn(undefined)).toEqual([]);
  });
  test("okänd räknare visas med grå färg", () => {
    expect(fn({ mystery: 5 })).toEqual([{ id: "mystery", count: 5, color: "#999999" }]);
  });
  test("kända räknare har egen färg", () => {
    expect(fn({ gold: 1 })[0]!.color).not.toBe("#999999");
  });
});

test("språknycklar för räknare finns på engelska och svenska", () => {
  for (const k of ["counter.goods.wine", "counter.goods.grain", "counter.goods.cloth", "counter.gold"]) {
    expect((en as unknown as Record<string, string>)[k]).toBeTruthy();
    expect((sv as unknown as Record<string, string>)[k]).toBeTruthy();
  }
});
