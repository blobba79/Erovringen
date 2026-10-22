// drawTile: sätter ihop gräs, floder, vägar, städer, kloster, hus, träd och ikoner till en bricka.
import type { CityFeature, Feature } from "../../shared/tiles";
import type { DrawTileArgs, FeatureGeometry, Point } from "../../shared/style";
import { EDGE_MID, lerp, pointInShape, rotatePoint, rotateShape } from "../../geometry/math";
import { THEME } from "./theme";
import { cloisterBuilding, garden, house, shield, tree } from "./buildings";
import { housesFor, symbolSpots, treesFor } from "./decor";
import { drawBands, drawCityBody, drawGrass } from "./layers";
import { drawSymbol } from "./symbols";
import { pathPoly } from "./util";

interface Icon { name: string; p: Point; s: number }

/** Ikoner som hör till en stad: sköldar, varor, prinsessa, katedral (oroterade koordinater). */
function cityIcons(c: CityFeature, g: FeatureGeometry): Icon[] {
  const mids = c.edges.map((e) => EDGE_MID[e]);
  const avg: Point = mids.length ? [mids.reduce((a, m) => a + m[0], 0) / mids.length, mids.reduce((a, m) => a + m[1], 0) / mids.length] : g.anchor;
  const base = lerp(g.anchor, avg, 0.3);
  const items: { name: string; s: number }[] = [];
  for (let i = 0; i < (c.pennants ?? 0); i++) items.push({ name: "shield", s: THEME.shield.size });
  if (typeof c.props?.goods === "string") items.push({ name: "goods:" + c.props.goods, s: 0.13 });
  if (c.props?.princess) items.push({ name: "princess", s: 0.13 });
  const icons: Icon[] = items.map((it, i) => ({ ...it, p: [base[0] + (i - (items.length - 1) / 2) * 0.16, base[1]] as Point }));
  if (c.props?.cathedral) icons.push({ name: "cathedral", p: lerp(g.anchor, [0.5, 0.5], 0.2), s: 0.3 });
  return icons;
}

export function drawTile({ ctx, tile, geometry, rotation, size }: DrawTileArgs): void {
  const R = (p: Point) => rotatePoint(p, rotation);
  const byId = new Map<string, Feature>(tile.features.map((f) => [f.id, f]));
  const feats = geometry.features;
  ctx.save();
  ctx.scale(size, size);
  pathPoly(ctx, [[0, 0], [1, 0], [1, 1], [0, 1]]);
  ctx.clip();
  drawGrass(ctx, tile.id);

  for (const kind of ["river", "road"] as const) {
    drawBands(ctx, kind, feats.filter((g) => g.kind === kind && g.centerline).map((g) => ({ line: g.centerline!.map(R), area: rotateShape(g.area, rotation) })));
  }

  const icons: Icon[] = [];
  const avoid: Point[] = [];
  for (const g of feats) {
    const f = byId.get(g.feature);
    if (g.kind === "city" && f) icons.push(...cityIcons(f as CityFeature, g));
    if (g.kind === "road" && f?.props?.inn) {
      const spot = ([[0.13, -0.13], [-0.13, -0.13], [0.13, 0.13], [-0.13, 0.13]] as const)
        .map(([dx, dy]) => [g.anchor[0] + dx, g.anchor[1] + dy] as Point)
        .find((p) => feats.some((q) => q.kind === "field" && pointInShape(p, q.area)));
      if (spot) icons.push({ name: "inn", p: spot, s: 0.17 });
    }
  }
  for (const i of icons) avoid.push(i.p);

  for (const g of feats) {
    if (g.kind !== "city") continue;
    drawCityBody(ctx, (rotateShape(g.area, rotation)[0] ?? []) as Point[]);
    const mine = icons.filter((i) => pointInShape(i.p, g.area));
    for (const p of housesFor(tile.id, g, [...mine.map((i) => i.p), g.anchor])) house(ctx, ...R(p), THEME.house.size);
  }

  for (const g of feats) {
    const [x, y] = R(g.kind === "cloister" ? [0.5, 0.52] : g.anchor);
    if (g.kind === "cloister") cloisterBuilding(ctx, x, y);
    else if (g.kind === "garden") garden(ctx, x, y, 0.17);
    else if (!["city", "road", "river", "field"].includes(g.kind)) drawSymbol(ctx, g.kind, x, y, THEME.symbol.size, rotation);
  }

  const fields = feats.filter((g) => g.kind === "field");
  const hard = feats.filter((g) => g.kind !== "field");
  const symbols = tile.symbols ?? [];
  const spots = symbolSpots(symbols.length, feats, [...avoid, ...feats.map((g) => g.anchor)]);
  for (const t of treesFor(tile.id, fields, hard, [...avoid, ...spots, ...feats.map((g) => g.anchor)])) tree(ctx, ...R(t.p), t.r);

  for (const i of icons) {
    const [x, y] = R(i.p);
    if (i.name === "shield") shield(ctx, x, y, i.s);
    else drawSymbol(ctx, i.name, x, y, i.s, rotation);
  }
  symbols.forEach((name, k) => {
    const [x, y] = R(spots[k] as Point);
    drawSymbol(ctx, name, x, y, THEME.symbol.size * (name === "dragon" || name === "volcano" ? 1.15 : 1), rotation);
  });
  ctx.restore();
}
