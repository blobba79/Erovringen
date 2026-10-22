// Telefonens ingång: /p?g=<spelkod> (ny spelare) eller /p?s=<platskod> (återanslutning).

import { render } from "preact";
import { availableLanguages } from "../i18n/index";
import { App } from "./app";
import { Client } from "./client";
import { webSocketTransport } from "./ws-transport";

function storage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

const proto = location.protocol === "https:" ? "wss" : "ws";
const client = new Client(webSocketTransport(`${proto}://${location.host}/ws`), {
  storage: storage(),
  search: location.search,
  browserLang: navigator.language,
  languages: availableLanguages().map((l) => l.code),
  replaceSearch: (search) => history.replaceState(null, "", `${location.pathname}${search}`),
});

render(<App client={client} />, document.getElementById("app")!);
