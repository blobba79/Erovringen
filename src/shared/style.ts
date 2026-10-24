// Gränssnitt för grafikstilar. En stil bestämmer HUR saker ritas; alla färger och mått
// finns i stilen. Formerna på brickans delar räknas ut från brickdatan av brickgeometrin
// (samma för alla stilar), så att markeringar och pjäsplatser hamnar rätt även med foton.

import type { Feature, Rotation, TileType } from "./tiles";

/** Punkt i brickans enhetskvadrat: (0,0) uppe till vänster, (1,1) nere till höger. */
export type Point = readonly [number, number];

/** Sluten form, en eller flera polygoner (hål ritas med motsatt varvriktning). */
export type Shape = readonly (readonly Point[])[];

export interface FeatureGeometry {
  feature: string;
  kind: Feature["kind"];
  /** Ytan som området täcker (för stad, fält, kloster, markering). */
  area: Shape;
  /** Mittlinje för vägar och floder. */
  centerline?: readonly Point[];
  /** Där en pjäs ställs. */
  anchor: Point;
}

export interface TileGeometry {
  tile: string;
  features: FeatureGeometry[];
}

/** Räknar ut brickans geometri, oroterad. Rotation görs vid ritning. */
export type GeometryFn = (tile: TileType) => TileGeometry;

export interface DrawTileArgs {
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  tile: TileType;
  geometry: TileGeometry;
  rotation: Rotation;
  /** Sidans längd i pixlar. */
  size: number;
}

export interface DrawFigureArgs {
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  kind: string;
  /** Spelarens färg; null för neutrala pjäser. */
  color: string | null;
  /** Mitt och storlek i pixlar. */
  x: number;
  y: number;
  size: number;
}

export interface DrawHighlightArgs {
  ctx: CanvasRenderingContext2D;
  /** Former i kartans pixlar. */
  shapes: Shape[];
  kind: "area" | "open" | "blocked" | "preview";
}

export interface GraphicStyle {
  id: string;
  /** Nyckel i språkfilen för stilens namn bland startvalen. */
  nameKey: string;
  /** Ritar en hel bricka. Resultatet cachas per brickstyp, rotation och storlek. */
  drawTile(args: DrawTileArgs): void;
  drawFigure(args: DrawFigureArgs): void;
  drawHighlight(args: DrawHighlightArgs): void;
  /**
   * Ikon för en räknare hos spelaren (`goods.wine`, `gold` …) med mittpunkt (x, y).
   * Returnerar false om stilen saknar ikon för räknaren.
   */
  drawCounterIcon?(ctx: CanvasRenderingContext2D, id: string, x: number, y: number, size: number): boolean;
  /** Färger som gränssnittet runt kartan använder (bakgrund, kontur …). */
  colors: Readonly<Record<string, string>>;
}
