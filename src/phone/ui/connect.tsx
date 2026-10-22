// Anslut, väntrum och värdens startval.

import { useState } from "preact/hooks";
import type { LobbySeat, StartOptions } from "../../shared/messages";
import type { ExpansionId } from "../../shared/tiles";
import type { RuleVariantDefinition } from "../../shared/expansion";
import { riverModule } from "../../expansions/river/index";
import { abbotModule } from "../../expansions/abbot/index";
import { availableLanguages } from "../../i18n/index";
import { loadName, saveName } from "../logic/session";
import { LangSelect, PALETTE, useClient, useClientState, useT } from "./common";

/** Expansionerna som går att välja i den här fasen (grundspelet är alltid med). */
const SELECTABLE: { id: ExpansionId; variants: RuleVariantDefinition[] }[] = [
  { id: "river", variants: riverModule.variants },
  { id: "abbot", variants: abbotModule.variants },
];

export function JoinView({ takenColors }: { takenColors: ReadonlySet<string> }) {
  const c = useClient();
  const t = useT();
  const s = useClientState(c);
  const storage = safeStorage();
  const [name, setName] = useState(() => loadName(storage));
  const [color, setColor] = useState(() => PALETTE.find((p) => !takenColors.has(p)) ?? PALETTE[0]!);
  const chosen = takenColors.has(color) ? (PALETTE.find((p) => !takenColors.has(p)) ?? color) : color;
  const waiting = s.conn !== "open";
  return (
    <main class="view join">
      <h1>{t("game.title")}</h1>
      <label class="field">
        <span>{t("lobby.yourName")}</span>
        <input
          type="text"
          value={name}
          maxLength={20}
          autocomplete="nickname"
          onInput={(e) => setName((e.currentTarget as HTMLInputElement).value)}
        />
      </label>
      <div class="swatches">
        {PALETTE.map((p) => (
          <button
            type="button"
            class={`swatch${p === chosen ? " on" : ""}`}
            style={{ background: p }}
            disabled={takenColors.has(p)}
            onClick={() => setColor(p)}
          />
        ))}
      </div>
      <LangSelect />
      <button
        type="button"
        class="big primary"
        disabled={waiting || name.trim() === ""}
        onClick={() => {
          saveName(storage, name.trim());
          c.join(name.trim(), chosen);
        }}
      >
        {waiting ? t("reconnect.connecting") : t("lobby.join")}
      </button>
    </main>
  );
}

function safeStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function ScanView() {
  const t = useT();
  return (
    <main class="view">
      <h1>{t("game.title")}</h1>
      <p class="hint">{t("phone.scanQr")}</p>
      <LangSelect />
    </main>
  );
}

/** Frånkopplade spelare med värdens val: vänta, hoppa över, ta bort. */
export function SeatActions({ seats, host }: { seats: LobbySeat[]; host: boolean }) {
  const c = useClient();
  const t = useT();
  const missing = seats.filter((x) => !x.connected);
  if (missing.length === 0) return null;
  return (
    <section class="card missing">
      {missing.map((seat) => (
        <div class="missing-row">
          <p>
            <span class="dot" style={{ background: seat.color }} /> {t("phone.notConnected", { player: seat.name })}
          </p>
          {host && (
            <div class="row">
              <button type="button" onClick={() => c.hostAction(seat.player, "wait")}>{t("phone.hostWait")}</button>
              <button type="button" onClick={() => c.hostAction(seat.player, "skip")}>{t("phone.hostSkip")}</button>
              <button type="button" class="danger" onClick={() => c.hostAction(seat.player, "remove")}>{t("phone.hostRemove")}</button>
            </div>
          )}
        </div>
      ))}
    </section>
  );
}

export function LobbyView() {
  const c = useClient();
  const s = useClientState(c);
  const t = useT();
  const lobby = s.lobby;
  if (!lobby) {
    return (
      <main class="view">
        <p class="hint">{t("reconnect.connecting")}</p>
      </main>
    );
  }
  return (
    <main class="view lobby">
      <h1>{t("lobby.title")}</h1>
      <p class="hint">{t("lobby.players", { count: lobby.seats.length })}</p>
      <ul class="seats">
        {lobby.seats.map((seat) => (
          <li class={seat.connected ? "" : "off"}>
            <span class="dot" style={{ background: seat.color }} /> {seat.name}
            {seat.player === s.player ? ` ${t("phone.you")}` : ""}
            {seat.isHost ? ` (${t("lobby.host")})` : ""}
          </li>
        ))}
      </ul>
      <SeatActions seats={lobby.seats} host={s.isHost} />
      {s.isHost ? <HostOptions options={lobby.options} /> : <p class="hint">{t("lobby.waitingForHost")}</p>}
      <LangSelect />
    </main>
  );
}

function HostOptions({ options }: { options: StartOptions }) {
  const c = useClient();
  const t = useT();
  const set = (patch: Partial<StartOptions>) => c.setOptions({ ...options, ...patch });
  const has = (id: ExpansionId) => options.expansions.includes(id);
  const toggle = (id: ExpansionId) =>
    set({ expansions: has(id) ? options.expansions.filter((e) => e !== id) : [...options.expansions, id] });
  const variants = SELECTABLE.filter((x) => has(x.id)).flatMap((x) => x.variants.map((v) => ({ exp: x.id, v })));
  return (
    <section class="options">
      <h2>{t("start.title")}</h2>
      <h3>{t("start.expansions")}</h3>
      <label class="check locked">
        <input type="checkbox" checked disabled /> <span>{t("expansion.base")}</span>
      </label>
      {SELECTABLE.map((x) => (
        <label class="check">
          <input type="checkbox" checked={has(x.id)} onChange={() => toggle(x.id)} /> <span>{t(`expansion.${x.id}`)}</span>
        </label>
      ))}
      {variants.length > 0 && <h3>{t("start.variants")}</h3>}
      {variants.map(({ exp, v }) => {
        const k = `${exp}.${v.id}`;
        return (
          <label class="field">
            <span>{t(`variant.${k}`)}</span>
            <select
              value={options.variants[k] ?? v.default}
              onChange={(e) => set({ variants: { ...options.variants, [k]: (e.currentTarget as HTMLSelectElement).value } })}
            >
              {v.options.map((o) => (
                <option value={o}>{t(`variant.${k}.${o}`)}</option>
              ))}
            </select>
          </label>
        );
      })}
      <label class="field">
        <span>{t("start.screenLanguage")}</span>
        <select value={options.screenLang} onChange={(e) => set({ screenLang: (e.currentTarget as HTMLSelectElement).value })}>
          {availableLanguages().map((l) => (
            <option value={l.code}>{l.name}</option>
          ))}
        </select>
      </label>
      <div class="field">
        <span>{t("start.handSize")}</span>
        <div class="stepper">
          <button type="button" disabled={options.handSize <= 1} onClick={() => set({ handSize: options.handSize - 1 })}>−</button>
          <output>{options.handSize}</output>
          <button type="button" disabled={options.handSize >= 5} onClick={() => set({ handSize: options.handSize + 1 })}>+</button>
        </div>
      </div>
      <label class="check">
        <input type="checkbox" checked={options.showClosingTiles} onChange={() => set({ showClosingTiles: !options.showClosingTiles })} />{" "}
        <span>{t("start.showClosingTiles")}</span>
      </label>
      <button type="button" class="big primary" onClick={() => c.startGame()}>{t("start.begin")}</button>
    </section>
  );
}
