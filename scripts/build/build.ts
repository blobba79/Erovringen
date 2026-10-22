// Bygger programfilerna: `npm run build` (båda) eller `npm run build -- --target windows|linux`.
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join } from "node:path";

const root = join(import.meta.dir, "..", "..");
const version: string = JSON.parse(readFileSync(join(root, "package.json"), "utf8")).version;

const targets = {
  windows: { target: "bun-windows-x64", outfile: "dist/erovringen-windows-x64.exe" },
  linux: { target: "bun-linux-x64", outfile: "dist/erovringen-linux-x64" },
} as const;

const args = process.argv.slice(2);
const i = args.indexOf("--target");
const wanted = i >= 0 ? args[i + 1] : undefined;
if (wanted && !(wanted in targets)) {
  console.error(`Okänt mål "${wanted}". Använd windows eller linux.`);
  process.exit(1);
}
const names = (wanted ? [wanted] : Object.keys(targets)) as (keyof typeof targets)[];

mkdirSync(join(root, "dist"), { recursive: true });

// Bun 1.2.17 på Windows kan inte kopiera sig själv om sökvägen till bun.exe har tecken som å, ä, ö
// ("failed to copy bun executable"). Då körs en kopia från den temporära mappen.
let bun = process.execPath;
if (/[^\x00-\x7f]/.test(bun)) {
  const tmp = mkdtempSync(join(tmpdir(), "erovringen-bun-"));
  bun = join(tmp, basename(bun));
  copyFileSync(process.execPath, bun);
  process.on("exit", () => rmSync(tmp, { recursive: true, force: true }));
}
for (const name of names) {
  const t = targets[name];
  console.log(`Bygger ${t.outfile} (version ${version}) ...`);
  const proc = Bun.spawnSync(
    [
      bun, "build", "--compile", "--minify",
      `--target=${t.target}`,
      "--define", `EROVRINGEN_VERSION=${JSON.stringify(version)}`,
      "src/server/main.ts",
      "--outfile", t.outfile,
    ],
    { cwd: root, stdout: "inherit", stderr: "inherit" },
  );
  if (proc.exitCode !== 0) {
    console.error(`Bygget av ${name} misslyckades.`);
    process.exit(1);
  }
}
for (const name of names) {
  const file = join(root, targets[name].outfile);
  console.log(`${targets[name].outfile}: ${(statSync(file).size / 1024 / 1024).toFixed(1)} MB`);
}
