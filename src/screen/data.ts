// Gemensam data för storskärmen: brickdata och grafikstil.

import { allTileTypes } from "../tiles/index";
import { toTileTypes } from "../engine/index";
import { registerClientModules } from "./modules";
import { cellshadedStyle } from "../styles/cellshaded/index";
import type { GraphicStyle } from "../shared/style";

registerClientModules();

export const tileTypes = toTileTypes(allTileTypes());
export const style: GraphicStyle = cellshadedStyle;

/** Stilens färger som CSS-variabler (--c-<namn>), så att inga färger skrivs i stilarken. */
export function applyStyleColors(root: HTMLElement, s: GraphicStyle = style): void {
  for (const [k, v] of Object.entries(s.colors)) root.style.setProperty(`--c-${k}`, v);
}
