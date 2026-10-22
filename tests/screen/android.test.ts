import { describe, expect, test } from "bun:test";
import { isAndroidApp } from "../../src/screen/logic";

describe("?android=1", () => {
  test("känns igen", () => {
    expect(isAndroidApp("?android=1")).toBe(true);
    expect(isAndroidApp("?f11=1&android=1")).toBe(true);
    expect(isAndroidApp("")).toBe(false);
    expect(isAndroidApp("?android=0")).toBe(false);
  });
});
