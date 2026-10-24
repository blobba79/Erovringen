// Ikoner för spelarens räknare (varor och guld), ritade med stilens symboler.
import { drawGoldBar, drawSymbol } from "./symbols";
import type { Ctx } from "./util";

const SYMBOLS: Record<string, (ctx: Ctx, x: number, y: number, size: number) => void> = {
  "goods.wine": (ctx, x, y, s) => drawSymbol(ctx, "goods:wine", x, y, s),
  "goods.grain": (ctx, x, y, s) => drawSymbol(ctx, "goods:grain", x, y, s),
  "goods.cloth": (ctx, x, y, s) => drawSymbol(ctx, "goods:cloth", x, y, s),
  gold: drawGoldBar,
};

/** Ritar räknarens ikon med mitten i (x, y) och sidan `size`. Returnerar false för okänd räknare (inget ritas). */
export function drawCounterIcon(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, size: number): boolean {
  const f = Object.prototype.hasOwnProperty.call(SYMBOLS, id) ? SYMBOLS[id] : undefined;
  if (!f) return false;
  f(ctx as Ctx, x, y, size * 0.92);
  return true;
}
