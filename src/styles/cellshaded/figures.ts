// Pjäser och markeringar. Pjäsen ritas runt (x, y) med höjden `size` i pixlar.
import type { DrawFigureArgs, DrawHighlightArgs } from "../../shared/style";
import { THEME } from "./theme";
import { drawBuilder, drawDragon, drawFairy, drawMage, drawPig, drawWitch } from "./figures-extra";
import { drawGoldBar } from "./symbols";
import { type Ctx, ellipse, pathPoly, shade } from "./util";

type P = [number, number];

const MEEPLE: P[] = [[-0.14, -0.1], [-0.48, 0.0], [-0.42, 0.13], [-0.22, 0.07], [-0.34, 0.46], [-0.06, 0.46], [0, 0.3], [0.06, 0.46], [0.34, 0.46], [0.22, 0.07], [0.42, 0.13], [0.48, 0.0], [0.14, -0.1]];
const ABBOT: P[] = [[-0.12, -0.12], [-0.4, 0.46], [0.4, 0.46], [0.12, -0.12]];
const PAWN: P[] = [[-0.12, -0.1], [-0.38, 0.46], [0.38, 0.46], [0.12, -0.1]];

/** Kropp med två toner: fylld med ljus färg, höger halva mörkare, med kontur. */
function body(ctx: Ctx, pts: P[], light: string, dark: string, ow: number): void {
  pathPoly(ctx, pts);
  ctx.fillStyle = light;
  ctx.fill();
  ctx.save();
  pathPoly(ctx, pts);
  ctx.clip();
  ctx.fillStyle = dark;
  ctx.fillRect(0.02, -1, 1, 2);
  ctx.restore();
  pathPoly(ctx, pts);
  ctx.lineWidth = ow;
  ctx.lineJoin = "round";
  ctx.strokeStyle = THEME.outline;
  ctx.stroke();
}

function head(ctx: Ctx, cx: number, cy: number, r: number, light: string, dark: string, ow: number): void {
  ellipse(ctx, cx, cy, r, r);
  ctx.fillStyle = dark;
  ctx.fill();
  ellipse(ctx, cx - r * 0.15, cy - r * 0.15, r * 0.82, r * 0.82);
  ctx.fillStyle = light;
  ctx.fill();
  ellipse(ctx, cx, cy, r, r);
  ctx.lineWidth = ow;
  ctx.strokeStyle = THEME.outline;
  ctx.stroke();
  ellipse(ctx, cx - r * 0.4, cy - r * 0.42, r * 0.17, r * 0.17);
  ctx.fillStyle = THEME.figure.glint;
  ctx.fill();
}

export function drawFigure({ ctx, kind, color, x, y, size }: DrawFigureArgs): void {
  const f = THEME.figure;
  const light = color ?? f.neutral, dark = shade(light, f.shadeMix);
  const large = kind === "large-meeple" || kind === "big-meeple";
  const S = size * (large ? f.largeScale : kind === "dragon" ? f.dragonScale : 1), ow = f.outlineW;
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(S, S);
  // kastskugga snett nedåt åt höger
  ctx.save();
  ctx.translate(THEME.shadowDir[0] * 0.12, 0.46 + THEME.shadowDir[1] * 0.04);
  ellipse(ctx, 0.12, 0, f.shadowScale[0], f.shadowScale[1]);
  ctx.fillStyle = `rgba(0,0,0,${THEME.shadowAlpha})`;
  ctx.fill();
  ctx.restore();
  if (kind === "builder") drawBuilder(ctx, light, dark, ow);
  else if (kind === "pig") drawPig(ctx, light, dark, ow);
  else if (kind === "mage") drawMage(ctx, ow);
  else if (kind === "witch") drawWitch(ctx, ow);
  else if (kind === "dragon") drawDragon(ctx, ow);
  else if (kind === "fairy") drawFairy(ctx, ow);
  else if (kind === "gold-bar") drawGoldBar(ctx, 0, 0.05, 0.85);
  else if (kind === "abbot") {
    body(ctx, ABBOT, light, dark, ow);
    head(ctx, 0, -0.28, 0.2, light, dark, ow);
    ctx.fillStyle = f.glint;
    ctx.fillRect(-0.025, 0.05, 0.05, 0.26);
    ctx.fillRect(-0.09, 0.12, 0.18, 0.05);
  } else if (kind === "meeple" || large) {
    body(ctx, MEEPLE, light, dark, ow);
    head(ctx, 0, -0.28, 0.2, light, dark, ow);
    if (large) { // ring på bröstet skiljer den stora pjäsen
      ellipse(ctx, 0, 0.2, 0.09, 0.09);
      ctx.lineWidth = ow * 0.8;
      ctx.strokeStyle = f.glint;
      ctx.stroke();
    }
  } else {
    body(ctx, PAWN, light, dark, ow); // övriga pjäser: enkel bondfigur
    head(ctx, 0, -0.26, 0.19, light, dark, ow);
  }
  ctx.restore();
}

export function drawHighlight({ ctx, shapes, kind }: DrawHighlightArgs): void {
  const h = THEME.highlight, c = h[kind];
  ctx.save();
  ctx.beginPath();
  for (const shape of shapes) for (const poly of shape) {
    poly.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1])));
    ctx.closePath();
  }
  ctx.fillStyle = c.fill;
  ctx.fill("nonzero");
  ctx.lineWidth = h.strokeW;
  ctx.strokeStyle = c.stroke;
  ctx.lineJoin = "round";
  if (kind === "preview") ctx.setLineDash([...h.dash]);
  ctx.stroke();
  ctx.restore();
}
