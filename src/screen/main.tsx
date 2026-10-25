// Storskärmens startpunkt: anslut till /ws, skicka helloScreen, återanslut automatiskt.

import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import type { Connection } from "./connection";
import { App } from "./App";
import { connect } from "./connection";
import { applyStyleColors } from "./data";
import { type Model, initialModel, reduce } from "./store";

applyStyleColors(document.documentElement);

function Root() {
  const [model, setModel] = useState<Model>(initialModel);
  const connRef = useRef<Connection | undefined>(undefined);
  useEffect(() => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const conn = connRef.current = connect(
      `${proto}://${location.host}/ws`,
      (msg) => setModel((m) => reduce(m, msg)),
      (connected) => setModel((m) => ({ ...m, connected })),
    );
    return () => conn.close();
  }, []);
  return <App model={model} send={(m) => connRef.current?.send(m)} />;
}

render(<Root />, document.getElementById("app")!);
