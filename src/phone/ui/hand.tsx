// Handen: alla brickor hela tiden. I valsteget väljer spelaren vilken som ska spelas.

import type { PhoneState } from "../client";
import { handTiles, mustExchange, tileToShow } from "../logic/hand";
import type { TurnView } from "../logic/turnview";
import { TileCanvas, useClient, useT } from "./common";

export function HandStrip({ s, view }: { s: PhoneState; view: TurnView }) {
  const t = useT();
  const c = useClient();
  if (s.hand.length === 0) return null;
  const tiles = handTiles(s.hand, view.mine ? s.legal : [], view.chosenIndex);
  const choosing = view.mine && view.phase === "chooseTile";
  const exchange = mustExchange(tiles);
  const sel = s.selectedTile !== null && s.selectedTile < s.hand.length ? s.selectedTile : null;
  const selected = sel === null ? null : tiles[sel];
  const showIndex = view.mine ? tileToShow(choosing ? null : view.chosenIndex, sel, s.hand.length) : null;
  const tappable = choosing && s.hand.length > 0;
  return (
    <section class="hand">
      <h2>{t("phone.hand")}</h2>
      {choosing && exchange && <p class="hint">{t("phone.exchangeHint")}</p>}
      {choosing && !exchange && s.hand.length > 1 && <p class="hint">{t("phone.pickTile")}</p>}
      <div class="tiles">
        {tiles.map((h) => (
          <button
            type="button"
            class={`tile-btn${h.canChoose || h.canExchange ? " enabled" : ""}${h.chosen && !choosing ? " chosen" : ""}${sel === h.index ? " selected" : ""}`}
            disabled={!tappable}
            onClick={() => c.selectTile(sel === h.index ? null : h.index)}
          >
            <TileCanvas tileId={h.id} size={s.hand.length > 3 ? 64 : 80} />
          </button>
        ))}
      </div>
      {choosing && selected && (
        <div class="row wrap">
          {selected.canChoose && (
            <button type="button" class="big primary" onClick={() => c.step({ type: "chooseTile", handIndex: selected.index })}>
              {t("phone.playTile")}
            </button>
          )}
          {selected.canExchange && (
            <button type="button" class="big" onClick={() => c.step({ type: "exchangeTile", handIndex: selected.index })}>
              {t("turn.swapTile")}
            </button>
          )}
        </div>
      )}
      {view.mine && (
        <button type="button" disabled={showIndex === null} onClick={() => showIndex !== null && c.showToAll(showIndex)}>
          {t("turn.showToEveryone")}
        </button>
      )}
    </section>
  );
}
