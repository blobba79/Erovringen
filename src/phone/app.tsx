// Telefonens rot: väljer vy efter anslutningsläget och sköter tur-signal och felmeddelanden.

import { useEffect, useMemo, useState } from "preact/hooks";
import { createTranslator } from "../i18n/index";
import type { Client } from "./client";
import { ClientCtx, TCtx, useClientState } from "./ui/common";
import { JoinView, LobbyView, ScanView } from "./ui/connect";
import { GameView } from "./ui/game";

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

  let body;
  if (s.state && s.joined) body = <GameView s={s} />;
  else if (s.joined) body = <LobbyView />;
  else if (s.plan.kind === "join") body = <JoinView takenColors={new Set(s.lobby?.seats.map((x) => x.color) ?? [])} />;
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
