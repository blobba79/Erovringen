// Vägslut mitt på brickan: vägarna stannar en bit från mitten med rundade ändar, och en liten by står i mitten.
import type { Point } from "../../shared/style";
import { THEME } from "./theme";
import { house } from "./buildings";
import type { Ctx } from "./util";

const J = THEME.junction;
const C: Point = [0.5, 0.5];

/** Väg med en enda kant vars linje slutar mitt på brickan. */
export const endsAtCenter = (line: readonly Point[] | undefined): boolean => !!line && line.length === 2 && line[1]![0] === 0.5 && line[1]![1] === 0.5;

/** Korta vägen så att den slutar J.stub från mitten. */
export function shortenLine(line: readonly Point[]): Point[] {
  const a = line[0]!, dx = C[0] - a[0], dy = C[1] - a[1], l = Math.hypot(dx, dy) || 1;
  const k = (l - J.stub) / l;
  return [a, [a[0] + dx * k, a[1] + dy * k]];
}

/** Rita byn i mitten (n = antal vägar som slutar där). */
export function drawJunction(ctx: Ctx, n: number): void {
  const spots: [number, number, number][] = n > 1
    ? [[-0.05, -0.02, 1], [0.05, -0.03, 1], [0, 0.05, 1]]
    : [[0, 0, 1.25]];
  for (const [dx, dy, k] of spots.sort((a, b) => a[1] - b[1])) house(ctx, C[0] + dx, C[1] + dy - 0.03, J.houseSize * k);
}
