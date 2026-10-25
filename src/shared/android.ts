// Gränssnittet mellan Android-appen (Kotlin) och spelrummet, som körs på en dold sida i appens
// WebView. Appen sköter bara nätverket: den serverar klienternas filer, tar emot WebSocket-
// anslutningarna och skickar meddelandena vidare till spelrummet. Allt annat är samma kod som på
// datorn. Över bryggan går bara strängar, tal och booleaner (`addJavascriptInterface`).

/**
 * Appens sida av bryggan, som `window.ErovringenHost` på spelrummets sida.
 * Filerna ligger platt i appens mapp för sparade spel: `<id>.json` och `startval.json`.
 */
export interface AndroidHost {
  /** Skicka ett meddelande (JSON-text) till en anslutning. */
  send(connId: string, json: string): void;
  /** Stäng en anslutning. */
  close(connId: string): void;
  /** Svar på `EmbeddedRoom.http`. */
  httpReply(requestId: string, status: number, contentType: string, body: string): void;
  /** Filnamnen i mappen, som en JSON-lista. */
  listFiles(): string;
  /** Filens innehåll, eller null om den inte finns. */
  readFile(name: string): string | null;
  /** Skriv filen. Appen skriver atomiskt (först en tillfällig fil, sedan byte av namn). */
  writeFile(name: string, text: string): void;
  /** En rad i appens loggfil. Appen ser till att loggen inte växer obegränsat. */
  log(level: "info" | "warn" | "error", line: string): void;
  /** Spelrummet är redo att ta emot anslutningar och anrop. */
  ready(): void;
  /** Stäng appen (storskärmens avsluta-knapp). Saknas i äldre versioner av appen. */
  quit?(): void;
}

/** Spelrummets sida av bryggan, som `window.erovringenRoom`. Appen anropar med `evaluateJavascript`. */
export interface EmbeddedRoom {
  /** En ny WebSocket-anslutning. `local` är sant om den kommer från enheten själv (storskärmen). */
  open(connId: string, local: boolean): void;
  message(connId: string, json: string): void;
  close(connId: string): void;
  /**
   * HTTP-anrop som spelrummet svarar på: `/qr.svg` och `/join-colors`. `query` är utan `?`.
   * Svaret kommer med `AndroidHost.httpReply` och samma `requestId`.
   */
  http(requestId: string, path: string, query: string): void;
  /**
   * Adressen telefonerna når appen på, t.ex. "http://192.168.43.1:8765". Appen anropar den när
   * spelrummet är redo och varje gång nätverket ändras (t.ex. när hotspot slås på).
   */
  setBaseUrl(url: string): void;
}
