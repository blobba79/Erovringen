// Vägslut i korsningar: olika förslag på hur det ritas där vägar möts eller tar slut mitt på brickan.
// Standard ("none") ritar som förut. Förhandsvisningen sätter läget med setJunctionMode().
import type { Point } from "../../shared/style";
import { THEME } from "./theme";
import { house } from "./buildings";
import { type Ctx, dropShadow, ellipse, fillOutline } from "./util";

export type JunctionMode = "none" | "A" | "B" | "C" | "D";
export const JUNCTION_MODES: readonly JunctionMode[] = ["none", "A", "B", "C", "D"];

let mode: JunctionMode = "none";
export const setJunctionMode = (m: JunctionMode): void => { mode = m; };
export const getJunctionMode = (): JunctionMode => mode;

const ow = THEME.outlineW;
const J = THEME.junction;
const C: Point = [0.5, 0.5];

/** Mittpunkt i vägslut: vägar med en enda kant vars linje slutar mitt på brickan. */
export const endsAtCenter = (line: readonly Point[] | undefined): boolean => !!line && line.length === 2 && line[1]![0] === 0.5 && line[1]![1] === 0.5;

/** Förslag C: vägarna stannar en bit från mitten (rundade ändar). */
export function shortenLine(line: readonly Point[], mode_: JunctionMode = mode): Point[] {
  if (mode_ !== "C") return [...line];
  const a = line[0]!, dx = C[0] - a[0], dy = C[1] - a[1], l = Math.hypot(dx, dy) || 1;
  const k = (l - J.stub) / l;
  return [a, [a[0] + dx * k, a[1] + dy * k]];
}

function plaza(ctx: Ctx, r: number): void {
  ellipse(ctx, C[0] + 0.012, C[1] + 0.012, r, r);
  ctx.fillStyle = J.plazaDark;
  ctx.fill();
  ellipse(ctx, C[0] - 0.008, C[1] - 0.008, r * 0.92, r * 0.92);
  fillOutline(ctx, J.plazaLight, ow);
  // skuggad rand: mörk halvmåne nere till höger, sedan ljus skiva ovanpå
  ellipse(ctx, C[0], C[1], r, r);
  ctx.lineWidth = ow;
  ctx.strokeStyle = THEME.outline;
  ctx.stroke();
}

function well(ctx: Ctx, x: number, y: number, s: number): void {
  dropShadow(ctx, () => ellipse(ctx, x, y + s * 0.2, s * 0.9, s * 0.55), s * 0.4);
  ellipse(ctx, x, y + s * 0.2, s * 0.9, s * 0.55); // stenmur
  fillOutline(ctx, J.wellStoneDark, ow * 0.75);
  ellipse(ctx, x - s * 0.08, y + s * 0.1, s * 0.8, s * 0.48);
  ctx.fillStyle = J.wellStone;
  ctx.fill();
  ellipse(ctx, x - s * 0.03, y + s * 0.03, s * 0.55, s * 0.3); // vatten
  fillOutline(ctx, J.wellWaterDark, ow * 0.6);
  ellipse(ctx, x - s * 0.1, y, s * 0.4, s * 0.2);
  ctx.fillStyle = J.wellWater;
  ctx.fill();
}

/** Marknadsstånd sett uppifrån i snett läge: kon med ränder i två toner. */
function stall(ctx: Ctx, x: number, y: number, r: number): void {
  const n = 8;
  dropShadow(ctx, () => ellipse(ctx, x, y, r, r), r * 0.35);
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    // mörkare på höger/nedre halvan (ljuset kommer uppifrån vänster)
    const dark = Math.cos((a0 + a1) / 2) + Math.sin((a0 + a1) / 2) > 0;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.arc(x, y, r, a0, a1);
    ctx.closePath();
    ctx.fillStyle = i % 2 ? (dark ? J.stallBDark : J.stallB) : (dark ? J.stallADark : J.stallA);
    ctx.fill();
  }
  ellipse(ctx, x, y, r, r);
  ctx.lineWidth = ow * 0.9;
  ctx.strokeStyle = THEME.outline;
  ctx.stroke();
  ellipse(ctx, x, y, r * 0.1, r * 0.1);
  ctx.fillStyle = THEME.outline;
  ctx.fill();
}

/** Rita korsningens mitt över vägarna. n = antal vägar som slutar i mitten. */
export function drawJunction(ctx: Ctx, n: number): void {
  const s = THEME.house.size;
  switch (mode) {
    case "A": { // liten by
      const spots: [number, number, number][] = n > 1
        ? [[-0.075, -0.03, 1], [0.08, -0.05, 1], [0.0, 0.07, 1.05]]
        : [[0, 0, 1.15]];
      for (const [dx, dy, k] of spots.sort((a, b) => a[1] - b[1])) house(ctx, C[0] + dx, C[1] + dy - 0.03, s * k);
      break;
    }
    case "B": // torg med brunn
      plaza(ctx, J.plazaR * (n > 1 ? 1 : 0.8));
      well(ctx, C[0], C[1] - 0.01, 0.06);
      break;
    case "C": // vägarna stannar före mitten, ett större hus i mitten
      house(ctx, C[0], C[1] - 0.03, s * 1.35);
      break;
    case "D": // marknadsstånd på liten rund yta
      plaza(ctx, J.plazaR * 0.85);
      stall(ctx, C[0] - 0.005, C[1] - 0.005, J.stallR * (n > 1 ? 1 : 0.85));
      break;
    default:
  }
}
