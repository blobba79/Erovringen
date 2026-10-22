// Dev-sida: telefonvyn mot en lokal "server" (motorn i webbläsaren, en dator som motspelare).
// Starta: `bun src/phone/dev/serve.ts` och öppna http://localhost:3100/ (lägg på ?g=DEV vid behov).

import { render } from "preact";
import { availableLanguages, LOCALES } from "../../i18n/index";
import { App } from "../app";
import { Client } from "../client";
import texts from "../texts.en.json";
import { localServer } from "./local-server";

// De nya texterna ligger inte i locales/ än; här läggs de på engelskan.
LOCALES.en = { ...LOCALES.en!, ...texts };

const search = location.search.includes("g=") ? location.search : "?g=DEV";
const client = new Client(localServer({ botDelayMs: 600 }), {
  storage: null,
  search,
  browserLang: navigator.language,
  languages: availableLanguages().map((l) => l.code),
});

render(<App client={client} />, document.getElementById("app")!);

// ?auto: gå med och starta direkt (för skärmdumpar och snabb provning).
if (new URLSearchParams(location.search).has("auto")) {
  const wait = setInterval(() => {
    if (client.getState().conn !== "open") return;
    clearInterval(wait);
    client.join("Ada", "#2a6fdb");
    const go = setInterval(() => {
      const lobby = client.getState().lobby;
      if (!lobby) return;
      clearInterval(go);
      client.setOptions({ ...lobby.options, expansions: ["base", "river", "abbot"] });
      client.startGame();
    }, 50);
  }, 50);
}
