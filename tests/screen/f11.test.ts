import { describe, expect, test } from "bun:test";
import { isFullscreenNow, wantsF11, withoutF11 } from "../../src/screen/logic";

describe("F11-rutan", () => {
  test("känner igen och tar bort parametern", () => {
    expect(wantsF11("?f11=1")).toBe(true);
    expect(wantsF11("")).toBe(false);
    expect(withoutF11("?f11=1")).toBe("");
    expect(withoutF11("?a=2&f11=1")).toBe("?a=2");
  });
  test("helskärm: element eller fönster som fyller skärmen", () => {
    const win = (w: number, h: number) => ({ innerWidth: w, innerHeight: h, screen: { width: 1920, height: 1080 } });
    expect(isFullscreenNow({ fullscreenElement: {} }, win(800, 600))).toBe(true);
    expect(isFullscreenNow({ fullscreenElement: null }, win(1920, 1080))).toBe(true);
    expect(isFullscreenNow({ fullscreenElement: null }, win(1900, 960))).toBe(false);
  });
});
