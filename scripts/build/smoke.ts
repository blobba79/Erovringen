// Provkör en byggd programfil: `bun scripts/build/smoke.ts dist/erovringen-linux-x64`.
import { mkdtempSync, copyFileSync, existsSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";

const src = process.argv[2];
if (!src) {
  console.error("Ange sökväg till programfilen.");
  process.exit(2);
}

const dir = mkdtempSync(join(tmpdir(), "erovringen-smoke-"));
const exe = join(dir, basename(src));
copyFileSync(resolve(src), exe);
chmodSync(exe, 0o755);

const probe = Bun.serve({ port: 0, fetch: () => new Response("") });
const port = probe.port;
probe.stop(true);

const proc = Bun.spawn([exe, "--no-browser"], {
  cwd: dir,
  env: { ...process.env, PORT: String(port) },
  stdout: "ignore",
  stderr: "inherit",
});
const base = `http://127.0.0.1:${port}`;
let failed = 0;
const fail = (m: string) => {
  console.error("FEL: " + m);
  failed++;
};

async function get(path: string): Promise<Response | null> {
  try {
    return await fetch(base + path);
  } catch {
    return null;
  }
}

try {
  let up = false;
  for (let i = 0; i < 100 && !up; i++) {
    up = (await get("/")) !== null;
    if (!up) await Bun.sleep(100);
  }
  if (!up) {
    fail("servern svarade inte");
  } else {
    for (const page of ["/", "/p"]) {
      const r = await get(page);
      const html = r ? await r.text() : "";
      if (!r || !r.ok || !html.includes("<")) {
        fail(`${page} svarar inte med HTML`);
        continue;
      }
      console.log(`ok ${page}`);
      const assets = [...html.matchAll(/(?:src|href)="([^"]+\.(?:js|css))"/g)].map((m) => m[1]!);
      if (assets.length === 0) fail(`${page} länkar inga JS/CSS-filer`);
      for (const a of assets) {
        const ar = await get(new URL(a, base + page).pathname);
        if (!ar || !ar.ok || (await ar.text()).length === 0) fail(`${a} svarar inte`);
        else console.log(`ok ${a}`);
      }
    }
    await Bun.sleep(300);
    // sparade/ skapas först vid första sparningen, så bara logg/ krävs här.
    if (!existsSync(join(dir, "logg"))) fail("mappen logg/ skapades inte bredvid filen");
    else console.log("ok logg/");
    if (!existsSync(join(dir, "sparade"))) console.log("obs: sparade/ finns inte än (skapas vid första sparningen)");
  }
} finally {
  proc.kill();
  await proc.exited;
  await Bun.sleep(200);
  try {
    rmSync(dir, { recursive: true, force: true });
  } catch {}
}
if (failed) {
  console.error(`${failed} fel`);
  process.exit(1);
}
console.log("Provkörningen lyckades.");
