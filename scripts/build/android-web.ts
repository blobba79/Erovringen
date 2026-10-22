// Bygger klientfilerna till Android-appen: `npm run build:android-web`.
// Resultat: android/app/src/main/assets/web/{screen,phone,room}/ (ignoreras av git).
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(import.meta.dir, "..", "..");
const version: string = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;
const outRoot = join(root, "android", "app", "src", "main", "assets", "web");

const parts = [
  { name: "screen", entry: "src/screen/index.html" },
  { name: "phone", entry: "src/phone/index.html" },
  { name: "room", entry: "src/server/embedded/index.html" },
];

const missing = parts.filter((p) => !existsSync(join(root, p.entry)));
if (missing.length > 0) {
  for (const p of missing) {
    console.error(
      `Saknas: ${p.entry}.` +
        (p.name === "room" ? " Spelrummets sida för Android (src/server/embedded/) finns inte än." : ""),
    );
  }
  console.error("Avbryter: appen kan inte byggas utan alla tre delarna.");
  process.exit(1);
}

rmSync(outRoot, { recursive: true, force: true });
mkdirSync(outRoot, { recursive: true });

for (const p of parts) {
  const outdir = join(outRoot, p.name);
  console.log(`Bygger ${p.name} (version ${version}) ...`);
  const result = await Bun.build({
    entrypoints: [join(root, p.entry)],
    outdir,
    target: "browser",
    minify: true,
    // Relativa sökvägar, så att filerna fungerar under /, /p och /room.
    publicPath: "./",
    define: { EROVRINGEN_VERSION: JSON.stringify(version) },
  });
  if (!result.success) {
    for (const log of result.logs) console.error(String(log));
    console.error(`Bygget av ${p.name} misslyckades.`);
    process.exit(1);
  }
  if (!existsSync(join(outdir, "index.html"))) {
    console.error(`Bygget av ${p.name} gav ingen index.html i ${outdir}.`);
    process.exit(1);
  }
}

function size(dir: string): number {
  let n = 0;
  for (const f of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, f.name);
    n += f.isDirectory() ? size(path) : statSync(path).size;
  }
  return n;
}
for (const p of parts) console.log(`${p.name}: ${(size(join(outRoot, p.name)) / 1024).toFixed(0)} kB`);
