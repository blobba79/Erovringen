// Storskärmens startpunkt: anslut till /ws, skicka helloScreen, återanslut automatiskt.

import { render } from "preact";
import { useEffect, useState } from "preact/hooks";
import { App } from "./App";
import { connect } from "./connection";
import { applyStyleColors } from "./data";
import { type Model, initialModel, reduce } from "./store";

applyStyleColors(document.documentElement);

function Root() {
  const [model, setModel] = useState<Model>(initialModel);
  useEffect(() => {
    const proto = location.protocol === "https:" ? "wss" : "ws";
    const conn = connect(
      `${proto}://${location.host}/ws`,
      (msg) => setModel((m) => reduce(m, msg)),
      (connected) => setModel((m) => ({ ...m, connected })),
    );
    return () => conn.close();
  }, []);
  return <App model={model} />;
}

render(<Root />, document.getElementById("app")!);
