import { expect, test } from "bun:test";
import { drawDiceArrow, drawDie, drawFerry } from "../../src/styles/cellshaded";

/** Låtsas-canvas som bara räknar anrop och aldrig kastar. */
function fakeCtx() {
  const calls = { n: 0 };
  const ctx: unknown = new Proxy({}, {
    get: (_t, k) => (k === "calls" ? calls : () => { calls.n++; }),
    set: () => true,
  });
  return { ctx: ctx as CanvasRenderingContext2D, calls };
}

test("färjan, tärningen och pilen ritas på mock-canvas utan fel och är deterministiska", () => {
  const a = fakeCtx(), b = fakeCtx();
  drawFerry(a.ctx, 10, 50, 90, 50, 100);
  drawFerry(b.ctx, 10, 50, 90, 50, 100);
  expect(a.calls.n).toBeGreaterThan(30);
  expect(a.calls.n).toBe(b.calls.n);
  for (const roll of [1, 2, 3, 6]) {
    const d = fakeCtx();
    drawDie(d.ctx, 50, 50, 40, roll);
    expect(d.calls.n, `tärning ${roll}`).toBeGreaterThan(10);
  }
  const arrow = fakeCtx();
  drawDiceArrow(arrow.ctx, 0, 0, 100, 100, 8);
  expect(arrow.calls.n).toBeGreaterThan(10);
  const none = fakeCtx();
  drawDiceArrow(none.ctx, 5, 5, 5, 5, 8);
  expect(none.calls.n).toBe(0);
});

test("fler prickar ger fler anrop", () => {
  const one = fakeCtx(), six = fakeCtx();
  drawDie(one.ctx, 0, 0, 40, 1);
  drawDie(six.ctx, 0, 0, 40, 6);
  expect(six.calls.n).toBeGreaterThan(one.calls.n);
});
