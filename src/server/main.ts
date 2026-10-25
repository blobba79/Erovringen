// Startpunkt: `npm run dev` (bun src/server/main.ts). Klienterna byggs in via Buns HTML-import.

import { join } from "node:path";
import screenPage from "../screen/index.html";
import phonePage from "../phone/index.html";
import { createFileLogger } from "./log";
import { VERSION } from "../shared/version";
import { openBrowser, shouldOpenBrowser } from "./browser";
import { baseDir, isCompiled } from "./paths";
import { createServer } from "./server";

const DEFAULT_PORT = 8765;

const dir = baseDir();
const logger = createFileLogger({ dir: join(dir, "logg"), console: false });
const port = Number(process.env.PORT) || DEFAULT_PORT;

let stopServer = () => {};
const running = createServer({
  port,
  routes: { "/": screenPage, "/p": phonePage },
  room: {
    savedDir: join(dir, "sparade"),
    onQuit: () => {
      logger.info("avslutar");
      stopServer();
      setTimeout(() => process.exit(0), 200);
    },
  },
  logger,
});
stopServer = () => running.stop();

console.log(`Erövringen ${VERSION} är igång.`);
console.log("Stäng det här fönstret för att avsluta programmet.");
logger.info(`version ${VERSION}`);
console.log(`Öppna storskärmen: ${running.screenUrl}`);
console.log(`Spelarna ansluter via ${running.baseUrl}/p (QR-koden visas på storskärmen)`);
logger.info(`storskärm ${running.screenUrl}, spelare ${running.baseUrl}`);

if (shouldOpenBrowser(process.argv, isCompiled())) openBrowser(running.screenUrl, logger);
