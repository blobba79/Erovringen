// Startar dev-sidan: `bun src/phone/dev/serve.ts`.
import dev from "./index.html";

const server = Bun.serve({ port: 3100, routes: { "/": dev }, development: true });
console.log(`Telefonvyn (dev): ${server.url}`);
