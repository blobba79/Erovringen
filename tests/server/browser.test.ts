import { describe, expect, test } from "bun:test";
import { findBrowser, openBrowser, planLaunch, shouldOpenBrowser, type FindDeps } from "../../src/server/browser";
import { isCompiled } from "../../src/server/paths";
import { nullLogger, type Logger } from "../../src/server/log";

const win = (files: string[], extra: Partial<FindDeps> = {}): FindDeps => ({
  platform: "win32",
  env: { ProgramFiles: "C:\\Program Files", "ProgramFiles(x86)": "C:\\Program Files (x86)", LocalAppData: "C:\\Users\\x\\AppData\\Local" },
  exists: (p) => files.includes(p),
  ...extra,
});
const linux = (bins: string[]): FindDeps => ({
  platform: "linux",
  env: { PATH: "/usr/local/bin:/usr/bin" },
  exists: (p) => bins.includes(p),
});

describe("sökning av webbläsare", () => {
  test("Windows: Chrome före Edge, Edge i x86, Firefox sist", () => {
    expect(findBrowser(win(["C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe", "C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"]))?.name).toBe("Chrome");
    expect(findBrowser(win(["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe"]))?.name).toBe("Edge");
    expect(findBrowser(win(["C:\\Users\\x\\AppData\\Local\\Google\\Chrome\\Application\\chrome.exe"]))?.name).toBe("Chrome");
    expect(findBrowser(win(["C:\\Program Files\\Mozilla Firefox\\firefox.exe"]))?.kind).toBe("firefox");
  });
  test("Windows: registrets App Paths används när inget finns på vanliga platser", () => {
    const deps = win(["D:\\ff\\firefox.exe"], { registryPath: (exe) => (exe === "firefox.exe" ? "D:\\ff\\firefox.exe" : undefined) });
    expect(findBrowser(deps)?.path).toBe("D:\\ff\\firefox.exe");
  });
  test("Linux: söker i PATH i ordning", () => {
    expect(findBrowser(linux(["/usr/bin/firefox", "/usr/bin/chromium"]))?.name).toBe("Chromium");
    expect(findBrowser(linux(["/usr/local/bin/google-chrome-stable"]))?.name).toBe("Chrome");
    expect(findBrowser(linux(["/usr/bin/firefox"]))?.kind).toBe("firefox");
  });
  test("ingen webbläsare ger undefined", () => {
    expect(findBrowser(win([]))).toBeUndefined();
    expect(findBrowser(linux([]))).toBeUndefined();
  });
});

describe("start", () => {
  const url = "http://192.168.0.5:8765/";
  test("Chromium: kiosk och egen profil i tmp", () => {
    const plan = planLaunch(url, linux(["/usr/bin/chromium"]), "/tmp");
    expect(plan.args).toContain("--kiosk");
    expect(plan.args.some((a) => a.startsWith("--user-data-dir=/tmp"))).toBe(true);
    expect(plan.args.at(-1)).toBe(url);
  });
  test("Firefox: bara --kiosk", () => {
    expect(planLaunch(url, linux(["/usr/bin/firefox"])).args).toEqual(["--kiosk", url]);
  });
  test("ingen webbläsare: standardwebbläsaren med ?f11=1", () => {
    const w = planLaunch(url, win([]));
    expect(w.command).toBe("cmd");
    expect(w.args.at(-1)).toBe(`${url}?f11=1`);
    const l = planLaunch(url, linux([]));
    expect(l.command).toBe("xdg-open");
    expect(l.args).toEqual([`${url}?f11=1`]);
  });
  test("ett fel vid start kastas aldrig utan loggas", () => {
    const errors: string[] = [];
    const log: Logger = { ...nullLogger, error: (m) => errors.push(m) };
    const ok = openBrowser(url, log, linux(["/usr/bin/chromium"]), () => {
      throw new Error("ENOENT");
    });
    expect(ok).toBe(false);
    expect(errors[0]).toContain("ENOENT");
  });
  test("lyckad start loggar vilken webbläsare", () => {
    const infos: string[] = [];
    const calls: string[] = [];
    const ok = openBrowser(url, { ...nullLogger, info: (m) => infos.push(m) }, linux(["/usr/bin/firefox"]), (c) => calls.push(c));
    expect(ok).toBe(true);
    expect(calls).toEqual(["/usr/bin/firefox"]);
    expect(infos[0]).toContain("Firefox");
  });
});

describe("--no-browser", () => {
  test("öppnas bara som programfil och utan --no-browser", () => {
    expect(shouldOpenBrowser([], true)).toBe(true);
    expect(shouldOpenBrowser(["--no-browser"], true)).toBe(false);
    expect(shouldOpenBrowser([], false)).toBe(false);
  });
});

describe("isCompiled", () => {
  test("bun är inte programfil, annat är", () => {
    expect(isCompiled("C:\\x\\bun.exe")).toBe(false);
    expect(isCompiled("/usr/bin/bun")).toBe(false);
    expect(isCompiled("D:\\spel\\erovringen-windows-x64.exe")).toBe(true);
    expect(isCompiled()).toBe(false); // testerna körs under bun
  });
});
