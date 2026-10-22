// Telefonens rot: väljer vy efter anslutningsläget och sköter tur-signal och felmeddelanden.

import { useEffect, useMemo, useState } from "preact/hooks";
import { createTranslator } from "../i18n/index";
import type { Client } from "./client";
import { ClientCtx, TCtx, useClientState } from "./ui/common";
import { JoinView, LobbyView, ScanView } from "./ui/connect";
import { GameView } from "./ui/game";
import { savedColors } from "./logic/options";
import type { JoinColors } from "../shared/messages";

export function App({ client }: { client: Client }) {
  const s = useClientState(client);
  const t = useMemo(() => createTranslator(s.lang), [s.lang]);
  const [flash, setFlash] = useState(false);
  const [errorShown, setErrorShown] = useState<number | null>(null);

  // Vibrera när turen börjar; går det inte, blinka skärmen.
  useEffect(() => {
    if (s.turnNonce === 0) return;
    let ok = false;
    try {
      ok = typeof navigator.vibrate === "function" && navigator.vibrate([250, 120, 250]);
    } catch {
      ok = false;
    }
    if (ok) return;
    setFlash(true);
    const id = setTimeout(() => setFlash(false), 1500);
    return () => clearTimeout(id);
  }, [s.turnNonce]);

  useEffect(() => {
    if (!s.error) return;
    setErrorShown(s.error.n);
    const id = setTimeout(() => setErrorShown(null), 4000);
    return () => clearTimeout(id);
  }, [s.error?.n]);

  const colors = useJoinColors(!s.joined && s.plan.kind === "join" ? s.plan.gameCode : null);

  let body;
  if (s.state && s.joined) body = <GameView s={s} />;
  else if (s.joined) body = <LobbyView />;
  else if (s.plan.kind === "join") {
    const taken = colors?.taken ?? s.lobby?.seats.map((x) => x.color) ?? [];
    const saved = colors?.saved ?? savedColors(s.lobby?.options, s.lobby?.saves);
    body = <JoinView takenColors={new Set(taken)} savedColors={saved} />;
  }
  else if (s.plan.kind === "rejoin" || s.seatToken) body = <p class="view hint">{t("reconnect.connecting")}</p>;
  else body = <ScanView />;

  return (
    <ClientCtx.Provider value={client}>
      <TCtx.Provider value={t}>
        {body}
        {s.joined && s.conn !== "open" && <div class="toast lost">{t("reconnect.lost")}</div>}
        {s.error && errorShown === s.error.n && (
          <button type="button" class="toast error" onClick={() => client.dismissError()}>
            {t(s.error.key, s.error.params)}
          </button>
        )}
        {flash && <div class="flash" />}
      </TCtx.Provider>
    </ClientCtx.Provider>
  );
}

/** Upptagna och sparade färger innan telefonen gått med; hämtas om medan andra ansluter. */
function useJoinColors(gameCode: string | null): JoinColors | null {
  const [colors, setColors] = useState<JoinColors | null>(null);
  useEffect(() => {
    if (!gameCode) return;
    let alive = true;
    const load = async () => {
      try {
        const res = await fetch(`/join-colors?g=${encodeURIComponent(gameCode)}`, { cache: "no-store" });
        if (alive && res.ok) setColors((await res.json()) as JoinColors);
      } catch {
        // Utan svar visas alla färger; servern säger till om en är upptagen.
      }
    };
    void load();
    const id = setInterval(load, 2000);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [gameCode]);
  return colors;
}
