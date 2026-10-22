// Handen: vilka brickor som kan väljas, bytas eller visas, utifrån tillåtna delsteg.

import type { Step } from "../../shared/state";

export interface HandTile {
  index: number;
  id: string;
  canChoose: boolean;
  canExchange: boolean;
  /** Brickan som turen spelar just nu. */
  chosen: boolean;
}

export function handTiles(hand: readonly string[], legal: readonly Step[], chosenIndex: number | null): HandTile[] {
  const idx = (type: string) =>
    new Set(legal.filter((s) => s.type === type).map((s) => (s as { handIndex: number }).handIndex));
  const choose = idx("chooseTile");
  const swap = idx("exchangeTile");
  return hand.map((id, index) => ({
    index,
    id,
    canChoose: choose.has(index),
    canExchange: swap.has(index),
    chosen: chosenIndex === index,
  }));
}

/** Ingen bricka går att lägga: bara byte är möjligt. */
export function mustExchange(tiles: readonly HandTile[]): boolean {
  return tiles.some((t) => t.canExchange) && !tiles.some((t) => t.canChoose);
}

/** Vilken bricka "Visa för alla" gäller: den spelade, annars den markerade. */
export function tileToShow(chosenIndex: number | null, selected: number | null, handLength: number): number | null {
  const i = chosenIndex ?? selected;
  return i !== null && i >= 0 && i < handLength ? i : null;
}
