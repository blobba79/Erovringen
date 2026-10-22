import { describe, expect, test } from "bun:test";
import { existsSync, mkdtempSync, readFileSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createFileLogger } from "../../src/server/log";
import { fitAll, applyControl } from "../../src/server/camera";
import { qrSvg } from "../../src/server/qr";

describe("loggen", () => {
  test("roteras när den blir för stor och sparar högst `keep` gamla filer", () => {
    const dir = mkdtempSync(join(tmpdir(), "logg-"));
    const log = createFileLogger({ dir, maxBytes: 200, keep: 2 });
    for (let i = 0; i < 40; i++) log.info(`rad ${i} ${"x".repeat(30)}`);
    expect(existsSync(join(dir, "server.log"))).toBe(true);
    expect(existsSync(join(dir, "server.log.1"))).toBe(true);
    expect(existsSync(join(dir, "server.log.2"))).toBe(true);
    expect(existsSync(join(dir, "server.log.3"))).toBe(false);
    expect(statSync(join(dir, "server.log")).size).toBeLessThan(400);
    expect(readFileSync(join(dir, "server.log"), "utf8")).toContain("rad 39");
  });
});

describe("kamerans räkningar", () => {
  test("fitAll rymmer alla rutor och platser med marginal", () => {
    const c = fitAll([{ x: 0, y: 0 }, { x: 10, y: 2 }], [{ x: -3, y: 1 }]);
    expect(c.x).toBeCloseTo(3.5);
    expect(c.y).toBeCloseTo(1);
    expect(c.zoom).toBeGreaterThan(14); // bredd 14
    expect(c.rotation).toBe(0);
  });

  test("zoom begränsas och orimliga värden ignoreras", () => {
    const cam = { x: 0, y: 0, zoom: 10, rotation: 0 };
    const none = () => [];
    expect(applyControl(cam, { type: "zoom", factor: 1e9 }, none, none).zoom).toBe(3);
    expect(applyControl(cam, { type: "zoom", factor: -1 }, none, none)).toEqual(cam);
    expect(applyControl(cam, { type: "pan", dx: NaN, dy: Infinity }, none, none)).toEqual(cam);
  });
});

describe("QR", () => {
  test("ger en SVG", () => {
    expect(qrSvg("http://192.168.1.5:8765/p?g=abc")).toContain("<svg");
  });
});
