// Läser av turen ur det publika tillståndet och spelarens egen hand.

import type { PublicState } from "../../shared/messages";
import type { PlacedTile, PlayerId, Step } from "../../shared/state";

type PlaceStep = Extract<Step, { type: "placeTile" }>;
type FigureStep = Extract<Step, { type: "placeFigure" }>;

export interface TurnView {
  mine: boolean;
  phase: string;
  /** Index i handen för brickan som ska läggas, eller null om den ännu inte valts. */
  chosenIndex: number | null;
  /** Brickan som ska läggas (före placeringen). */
  tileId: string | null;
  placed: PlaceStep | null;
  placedTile: PlacedTile | null;
  /** Pjäsen som delstegen redan placerat denna tur. */
  figure: FigureStep | null;
}

export function deriveTurn(state: PublicState | null, me: PlayerId | null, hand: readonly string[]): TurnView {
  if (!state) return { mine: false, phase: "", chosenIndex: null, tileId: null, placed: null, placedTile: null, figure: null };
  const { turn } = state;
  const mine = me !== null && turn.player === me && !state.finished;
  const choose = turn.pending.find((s) => s.type === "chooseTile");
  const chosenIndex = choose && choose.type === "chooseTile" ? choose.handIndex : hand.length === 1 ? 0 : null;
  const placed = turn.pending.find((s): s is PlaceStep => s.type === "placeTile") ?? null;
  const figure = turn.pending.find((s): s is FigureStep => s.type === "placeFigure") ?? null;
  return {
    mine,
    phase: turn.phase,
    chosenIndex,
    tileId: chosenIndex === null ? null : (hand[chosenIndex] ?? null),
    placed,
    placedTile: placed ? (state.board[`${placed.pos.x},${placed.pos.y}`] ?? null) : null,
    figure,
  };
}

/** Spelarens pjäser: kvar i förrådet och totalt, per sort. */
export function figureSupply(state: PublicState, me: PlayerId): { kind: string; left: number; total: number }[] {
  const out = new Map<string, { kind: string; left: number; total: number }>();
  for (const f of state.figures) {
    if (f.owner !== me) continue;
    const e = out.get(f.kind) ?? { kind: f.kind, left: 0, total: 0 };
    e.total++;
    if (f.location.at === "supply") e.left++;
    out.set(f.kind, e);
  }
  return [...out.values()];
}
