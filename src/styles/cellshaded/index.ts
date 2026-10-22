// Grafikstilen "Cellshadad": tecknad stil med hårda skuggor i två toner (se SPEC.md, Grafik).
import type { GraphicStyle } from "../../shared/style";
import { THEME } from "./theme";
import { drawFigure, drawHighlight } from "./figures";
import { drawTile } from "./tile";

export const cellshadedStyle: GraphicStyle = {
  id: THEME.id,
  nameKey: "style.cellshaded",
  drawTile,
  drawFigure,
  drawHighlight,
  colors: {
    outline: THEME.ui.outline,
    background: THEME.ui.background,
    backgroundDark: THEME.ui.backgroundDark,
    text: THEME.ui.text,
    panel: THEME.ui.panel,
    panelDark: THEME.ui.panelDark,
    accent: THEME.ui.accent,
    grass: THEME.grass.base,
    road: THEME.road.light,
    city: THEME.city.light,
    water: THEME.river.light,
  },
};

export default cellshadedStyle;
export { THEME } from "./theme";
