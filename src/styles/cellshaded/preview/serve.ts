// Liten server för förhandsvisningen: npx bun src/styles/cellshaded/preview/serve.ts [port]
// Öppna sedan http://localhost:5174/ (valfria parametrar: ?exp=base&rot=90&size=200&anchors=1).
// Koden byggs om vid varje sidladdning, så ändringar syns direkt.
import { join } from "node:path";

const dir = import.meta.dir;
const port = Number(process.argv[2] ?? 5174);

async function bundle(): Promise<Response> {
  const built = await Bun.build({ entrypoints: [join(dir, "main.ts")], target: "browser" });
  if (!built.success) return new Response(built.logs.join("\n"), { status: 500 });
  return new Response(await built.outputs[0]!.text(), { headers: { "content-type": "text/javascript" } });
}

Bun.serve({
  port,
  fetch(req) {
    const path = new URL(req.url).pathname;
    if (path === "/main.js") return bundle();
    if (path === "/" || path === "/index.html") return new Response(Bun.file(join(dir, "index.html")));
    return new Response("not found", { status: 404 });
  },
});
console.log(`Förhandsvisning: http://localhost:${port}/`);
