// Anslut, väntrum och värdens startval.

import { useState } from "preact/hooks";
import type { AvailableOptions, LobbySeat, SavedGameInfo, StartOptions } from "../../shared/messages";
import type { ExpansionId } from "../../shared/tiles";
import { availableLanguages } from "../../i18n/index";
import { changeHandSize, chooseSave, setVariant, startChoices, toggleExpansion } from "../logic/options";
import { loadName, saveName } from "../logic/session";
import { LangSelect, PALETTE, useClient, useClientState, useT } from "./common";

export function JoinView({ takenColors, savedColors }: { takenColors: ReadonlySet<string>; savedColors?: readonly string[] }) {
  const c = useClient();
  const t = useT();
  const s = useClientState(c);
  const storage = safeStorage();
  const [name, setName] = useState(() => loadName(storage));
  const palette = savedColors && savedColors.length > 0 ? savedColors : PALETTE;
  const [color, setColor] = useState(() => palette.find((p) => !takenColors.has(p)) ?? palette[0]!);
  // Färgerna kan komma efter första visningen: byt då bort en vald färg som är upptagen eller inte finns.
  const chosen = takenColors.has(color) || !palette.includes(color) ? (palette.find((p) => !takenColors.has(p)) ?? color) : color;
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
        {palette.map((p) => (
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
            {seat.bot ? ` (${t("lobby.bot")})` : ""}
            {seat.bot && s.isHost && !lobby.options.savedGame && (
              <button type="button" class="danger" onClick={() => c.removeBot(seat.player)}>{t("lobby.removeBot")}</button>
            )}
          </li>
        ))}
      </ul>
      {s.isHost && !lobby.options.savedGame && (
        <button type="button" onClick={() => c.addBot()}>{t("lobby.addBot")}</button>
      )}
      <SeatActions seats={lobby.seats} host={s.isHost} />
      {s.isHost ? <HostOptions options={lobby.options} available={lobby.available} saves={lobby.saves} /> : <p class="hint">{t("lobby.waitingForHost")}</p>}
      <LangSelect />
    </main>
  );
}

function HostOptions({ options, available, saves }: { options: StartOptions; available: AvailableOptions; saves: SavedGameInfo[] }) {
  const c = useClient();
  const t = useT();
  const choices = startChoices(available, options);
  const loading = options.savedGame !== undefined;
  const names = new Map(availableLanguages().map((l) => [l.code, l.name]));
  return (
    <section class="options">
      <h2>{t("start.title")}</h2>
      <div class="saves">
        <button type="button" class={`save${loading ? "" : " on"}`} onClick={() => c.setOptions(chooseSave(options, saves, null))}>
          {t("start.newGame")}
        </button>
        {saves.length > 0 && <h3>{t("start.continueGame")}</h3>}
        {saves.map((sv) => (
          <button
            type="button"
            class={`save${options.savedGame === sv.id ? " on" : ""}`}
            disabled={!sv.readable}
            onClick={() => c.setOptions(chooseSave(options, saves, sv.id))}
          >
            <b>{new Date(sv.savedAt).toLocaleString()}</b>
            <span>{sv.players.map((p) => `${p.name} ${p.score}`).join(", ")}</span>
            <span>{sv.readable ? t("start.savedTiles", { count: sv.tilesPlaced }) : t("start.unreadable")}</span>
          </button>
        ))}
      </div>
      {!loading && (
        <>
          <h3>{t("start.expansions")}</h3>
          <label class="check locked">
            <input type="checkbox" checked disabled /> <span>{t("expansion.base")}</span>
          </label>
          {choices.expansions.map((x) => (
            <label class="check">
              <input type="checkbox" checked={x.on} onChange={() => c.setOptions(toggleExpansion(options, x.id))} />{" "}
              <span>{t(`expansion.${x.id}`)}</span>
            </label>
          ))}
          {choices.variants.length > 0 && <h3>{t("start.variants")}</h3>}
          {choices.variants.map((v) => (
            <label class="field">
              <span>{t(`variant.${v.key}`)}</span>
              <select
                value={v.value}
                onChange={(e) => c.setOptions(setVariant(options, v.key, (e.currentTarget as HTMLSelectElement).value))}
              >
                {v.options.map((o) => (
                  <option value={o}>{t(`variant.${v.key}.${o}`)}</option>
                ))}
              </select>
            </label>
          ))}
          <div class="field">
            <span>{t("start.handSize")}</span>
            <div class="stepper">
              <button type="button" disabled={options.handSize <= 1} onClick={() => c.setOptions(changeHandSize(options, -1, choices.maxHandSize))}>−</button>
              <output>{options.handSize}</output>
              <button type="button" disabled={options.handSize >= choices.maxHandSize} onClick={() => c.setOptions(changeHandSize(options, 1, choices.maxHandSize))}>+</button>
            </div>
          </div>
        </>
      )}
      <label class="field">
        <span>{t("start.screenLanguage")}</span>
        <select value={options.screenLang} onChange={(e) => c.setOptions({ ...options, screenLang: (e.currentTarget as HTMLSelectElement).value })}>
          {choices.languages.map((l) => (
            <option value={l}>{names.get(l) ?? l}</option>
          ))}
        </select>
      </label>
      <label class="check">
        <input type="checkbox" checked={options.showClosingTiles} onChange={() => c.setOptions({ ...options, showClosingTiles: !options.showClosingTiles })} />{" "}
        <span>{t("start.showClosingTiles")}</span>
      </label>
      <button type="button" class="big primary" onClick={() => c.startGame()}>{t("start.begin")}</button>
    </section>
  );
}
