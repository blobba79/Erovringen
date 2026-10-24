// Dev-sida: telefonvyn mot en lokal "server" (motorn i webbläsaren, en dator som motspelare).
// Starta: `bun src/phone/dev/serve.ts` och öppna http://localhost:3100/ (lägg på ?g=DEV vid behov).

import { render } from "preact";
import { availableLanguages, LOCALES } from "../../i18n/index";
import { App } from "../app";
import { Client } from "../client";
import texts from "../texts.en.json";
import { fakeExpansionServer } from "./fake-expansion";
import { localServer } from "./local-server";

// De nya texterna ligger inte i locales/ än; här läggs de på engelskan.
LOCALES.en = {
  ...LOCALES.en!,
  ...texts,
  "warning.cityBlocked": "(dev example) This placement makes your city impossible to finish.",
  "stats.biggestCity": "Biggest city",
  // ?fake: påhittad expansion med egen fas (texterna saknas medvetet för "skip.never", för att prova reservtexten).
  "phase.moveMage": "Move the mage",
  "step.mage-witch.move": "Move the mage or the witch",
  "step.mage-witch.skip": "Or do nothing",
  "step.mage-witch.skip.now": "Skip now",
};

const fake = location.search.includes("fake");
const search = location.search.includes("g=") ? location.search : "?g=DEV";
const client = new Client(fake ? fakeExpansionServer().factory : localServer({ botDelayMs: 600 }), {
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
      client.setOptions({ ...lobby.options, expansions: fake ? ["base"] : ["base", "river", "abbot"], handSize: Number(new URLSearchParams(location.search).get("hand") ?? 1) });
      client.startGame();
    }, 50);
  }, 50);
}
