// Hittar en installerad webbläsare och startar storskärmen i helskärm.
// Sökningen tar in filsystem och PATH som parametrar så att den går att testa utan riktiga program.

import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { posix, win32 } from "node:path";
import type { Logger } from "./log";

export type BrowserKind = "chromium" | "firefox";
export interface FoundBrowser {
  name: string;
  kind: BrowserKind;
  path: string;
}

export interface FindDeps {
  platform: string;
  env: Record<string, string | undefined>;
  exists: (path: string) => boolean;
  /** Läser sökvägen ur registrets App Paths (bara Windows); undefined om den saknas. */
  registryPath?: (exe: string) => string | undefined;
}

export const defaultFindDeps = (): FindDeps => ({
  platform: process.platform,
  env: process.env,
  exists: existsSync,
  registryPath: process.platform === "win32" ? readRegistryAppPath : undefined,
});

const WINDOWS: { name: string; kind: BrowserKind; exe: string; rel: string }[] = [
  { name: "Chrome", kind: "chromium", exe: "chrome.exe", rel: "Google\\Chrome\\Application\\chrome.exe" },
  { name: "Edge", kind: "chromium", exe: "msedge.exe", rel: "Microsoft\\Edge\\Application\\msedge.exe" },
  { name: "Chromium", kind: "chromium", exe: "chromium.exe", rel: "Chromium\\Application\\chrome.exe" },
  { name: "Firefox", kind: "firefox", exe: "firefox.exe", rel: "Mozilla Firefox\\firefox.exe" },
];

const LINUX: { name: string; kind: BrowserKind; bin: string }[] = [
  { name: "Chrome", kind: "chromium", bin: "google-chrome" },
  { name: "Chrome", kind: "chromium", bin: "google-chrome-stable" },
  { name: "Chromium", kind: "chromium", bin: "chromium" },
  { name: "Chromium", kind: "chromium", bin: "chromium-browser" },
  { name: "Edge", kind: "chromium", bin: "microsoft-edge" },
  { name: "Firefox", kind: "firefox", bin: "firefox" },
];

/** Första installerade webbläsaren, eller undefined. */
export function findBrowser(deps: FindDeps = defaultFindDeps()): FoundBrowser | undefined {
  if (deps.platform === "win32") {
    const roots = [deps.env["ProgramFiles"], deps.env["ProgramFiles(x86)"], deps.env["LocalAppData"]].filter(
      (r): r is string => !!r,
    );
    for (const b of WINDOWS) {
      for (const root of roots) {
        const p = `${root.replace(/[\\/]+$/, "")}\\${b.rel}`;
        if (deps.exists(p)) return { name: b.name, kind: b.kind, path: p };
      }
      const reg = deps.registryPath?.(b.exe);
      if (reg && deps.exists(reg)) return { name: b.name, kind: b.kind, path: reg };
    }
    return undefined;
  }
  const dirs = (deps.env["PATH"] ?? "").split(":").filter(Boolean);
  for (const b of LINUX)
    for (const d of dirs) {
      const p = posix.join(d, b.bin);
      if (deps.exists(p)) return { name: b.name, kind: b.kind, path: p };
    }
  return undefined;
}

function readRegistryAppPath(exe: string): string | undefined {
  try {
    for (const hive of ["HKLM", "HKCU"]) {
      const r = Bun.spawnSync(["reg", "query", `${hive}\\SOFTWARE\\Microsoft\\Windows\\CurrentVersion\\App Paths\\${exe}`, "/ve"]);
      const m = /REG_SZ\s+(.+?)\s*$/m.exec(r.stdout.toString());
      if (m) return m[1]!.replace(/^"|"$/g, "");
    }
  } catch {
    // registret är bara en extra källa
  }
  return undefined;
}

export interface LaunchPlan {
  description: string;
  command: string;
  args: string[];
}

/** Bestäm vad som ska startas för adressen `url`. */
export function planLaunch(url: string, deps: FindDeps = defaultFindDeps(), profileRoot = tmpdir()): LaunchPlan {
  const b = findBrowser(deps);
  if (b?.kind === "chromium") {
    // Samma profil varje gång, så att det inte blir en ny mapp i temp vid varje start.
    const profile = (deps.platform === "win32" ? win32 : posix).join(profileRoot, "erovringen-profil");
    return { description: b.name, command: b.path, args: ["--kiosk", `--user-data-dir=${profile}`, "--no-first-run", url] };
  }
  if (b?.kind === "firefox") return { description: b.name, command: b.path, args: ["--kiosk", url] };
  const fallback = `${url}${url.includes("?") ? "&" : "?"}f11=1`;
  if (deps.platform === "win32")
    return { description: "standardwebbläsaren", command: "cmd", args: ["/c", "start", '""', fallback] };
  return { description: "standardwebbläsaren", command: "xdg-open", args: [fallback] };
}

/** Webbläsaren öppnas bara från programfilen, och inte med `--no-browser`. */
export function shouldOpenBrowser(argv: string[], compiled: boolean): boolean {
  return compiled && !argv.includes("--no-browser");
}

export type Spawner = (command: string, args: string[]) => void;

const realSpawn: Spawner = (command, args) => {
  const child = spawn(command, args, { stdio: "ignore", detached: true });
  child.on("error", () => {});
  child.unref();
};

/** Starta webbläsaren. Kastar aldrig; resultatet loggas. Returnerar true om något startades. */
export function openBrowser(
  url: string,
  logger: Logger,
  deps: FindDeps = defaultFindDeps(),
  start: Spawner = realSpawn,
  profileRoot?: string,
): boolean {
  try {
    const plan = planLaunch(url, deps, profileRoot);
    start(plan.command, plan.args);
    logger.info(`webbläsare startad: ${plan.description}`);
    return true;
  } catch (e) {
    logger.error(`kunde inte starta webbläsaren: ${e instanceof Error ? e.message : String(e)}`);
    return false;
  }
}
