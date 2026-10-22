// Hjälp, snabbreaktioner, varningar för nybörjare och slutvyn.

import { useState } from "preact/hooks";
import type { PhoneState } from "../client";
import { LOCALES } from "../../i18n/index";
import { helpKeys } from "../logic/help";
import { standings, topRecords } from "../logic/after";
import { useClient, useT } from "./common";

export const EMOJIS = ["👍", "👏", "😂", "😮", "😢", "🔥"] as const;

export function Warnings({ s }: { s: PhoneState }) {
  const t = useT();
  if (!s.warningsOn || s.warnings.length === 0) return null;
  return (
    <section class="warnings" role="alert">
      {s.warnings.map((w) => (
        <p>⚠ {t(w.key, w.params)}</p>
      ))}
    </section>
  );
}

export function Tools({ s, phase, mine }: { s: PhoneState; phase: string; mine: boolean }) {
  const t = useT();
  const c = useClient();
  const [panel, setPanel] = useState<"help" | "react" | null>(null);
  const toggle = (p: "help" | "react") => setPanel(panel === p ? null : p);
  const has = (k: string) => k in (LOCALES[s.lang] ?? {}) || k in (LOCALES.en ?? {});
  const keys = helpKeys(phase, s.state?.setup.expansions ?? [], has);
  return (
    <section class="tools">
      <div class="row">
        {mine && (
          <button type="button" class={panel === "help" ? "on" : ""} onClick={() => toggle("help")}>
            {t("turn.whatCanIDo")}
          </button>
        )}
        <button type="button" class={panel === "react" ? "on" : ""} onClick={() => toggle("react")}>
          {t("phone.react")}
        </button>
      </div>
      {panel === "react" && (
        <div class="row emojis">
          {EMOJIS.map((e) => (
            <button type="button" class="emoji" onClick={() => c.react(e)}>{e}</button>
          ))}
        </div>
      )}
      {panel === "help" && mine && (
        <div class="card help">
          <p>{t(keys.phase)}</p>
          {keys.expansions.map((k) => (
            <p class="exp">{t(k)}</p>
          ))}
        </div>
      )}
      <label class="check">
        <input type="checkbox" checked={s.warningsOn} onChange={() => c.setWarningsOn(!s.warningsOn)} />{" "}
        <span>{t("phone.warningsOn")}</span>
      </label>
    </section>
  );
}

export function AfterView({ s }: { s: PhoneState }) {
  const t = useT();
  const state = s.state!;
  const list = standings(state);
  const mine = list.find((x) => x.id === s.player);
  const records = s.stats ? topRecords(s.stats) : [];
  return (
    <section class="after card">
      {mine && (
        <p class="result">
          {t("phone.yourPlace", { place: mine.rank })} {t("score.points", { count: mine.score })}
        </p>
      )}
      <ol class="standings">
        {list.map((x) => (
          <li class={x.id === s.player ? "me" : ""}>
            <span>{x.rank}.</span>
            <span class="dot" style={{ background: x.color }} />
            <b>{x.name}</b>
            <span>{t("score.points", { count: x.score })}</span>
          </li>
        ))}
      </ol>
      {records.length > 0 && (
        <ul class="records">
          {records.map((r) => {
            const who = state.players.find((p) => p.id === r.player)?.name ?? "";
            return <li>{t(r.key)}: {r.value}{who ? ` (${who})` : ""}</li>;
          })}
        </ul>
      )}
      <p class="hint">{t("phone.statsOnScreen")}</p>
    </section>
  );
}
