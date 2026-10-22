// Startpunkt: `npm run dev` (bun src/server/main.ts). Klienterna byggs in via Buns HTML-import.

import { join } from "node:path";
import screenPage from "../screen/index.html";
import phonePage from "../phone/index.html";
import { createFileLogger } from "./log";
import { baseDir } from "./options";
import { createServer } from "./server";

const DEFAULT_PORT = 8765;

const dir = baseDir();
const logger = createFileLogger({ dir: join(dir, "logg"), console: false });
const port = Number(process.env.PORT) || DEFAULT_PORT;

const running = createServer({
  port,
  routes: { "/": screenPage, "/p": phonePage },
  room: { savedDir: join(dir, "sparade") },
  logger,
});

console.log("Erövringen är igång.");
console.log(`Öppna storskärmen: ${running.screenUrl}`);
console.log(`Spelarna ansluter via ${running.baseUrl}/p (QR-koden visas på storskärmen)`);
logger.info(`storskärm ${running.screenUrl}, spelare ${running.baseUrl}`);
