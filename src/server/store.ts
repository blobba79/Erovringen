// Filer för sparade spel och startval, bakom ett gränssnitt så att samma Room går att köra på
// datorn (Node/Bun, riktiga filer) och i Android-appens WebView (via bryggan). Den här filen
// får inte importera något från Node: `nodeFileStore` hämtar `node:fs` först när den anropas.

import type { AndroidHost } from "../shared/android";

/** Platt mapp med textfiler. Inget här får kasta fel utåt. */
export interface FileStore {
  /** Filnamnen i mappen (tom lista om mappen saknas). */
  list(): string[];
  /** Filens innehåll, eller null om den inte finns eller inte går att läsa. */
  read(name: string): string | null;
  /** Skriv filen atomiskt. Falskt om det misslyckades. */
  write(name: string, text: string): boolean;
  /** När filen ändrades senast (ms), om det går att veta. */
  modified?(name: string): number;
}

/** Filer i en vanlig mapp. Skriver först en tillfällig fil och byter sedan namn. */
export function nodeFileStore(dir: string): FileStore {
  // Hämtas först vid anrop (inte med import), så att filen går att paketera för webbläsaren.
  const fs = () => process.getBuiltinModule("node:fs");
  const path = () => process.getBuiltinModule("node:path");
  return {
    list() {
      try {
        return fs().readdirSync(dir);
      } catch {
        return [];
      }
    },
    read(name) {
      try {
        return fs().readFileSync(path().join(dir, name), "utf8");
      } catch {
        return null;
      }
    },
    write(name, text) {
      try {
        const { mkdirSync, writeFileSync, renameSync } = fs();
        mkdirSync(dir, { recursive: true });
        const target = path().join(dir, name);
        const tmp = `${target}.tmp`;
        writeFileSync(tmp, text);
        renameSync(tmp, target);
        return true;
      } catch {
        return false;
      }
    },
    modified(name) {
      try {
        return fs().statSync(path().join(dir, name)).mtimeMs;
      } catch {
        return 0;
      }
    },
  };
}

/** Filer i appens mapp, via bryggan. Appen skriver själv atomiskt. */
export function hostFileStore(host: Pick<AndroidHost, "listFiles" | "readFile" | "writeFile">): FileStore {
  return {
    list() {
      try {
        const l = JSON.parse(host.listFiles());
        return Array.isArray(l) ? l.filter((x): x is string => typeof x === "string") : [];
      } catch {
        return [];
      }
    },
    read(name) {
      try {
        return host.readFile(name) ?? null;
      } catch {
        return null;
      }
    },
    write(name, text) {
      try {
        host.writeFile(name, text);
        return true;
      } catch {
        return false;
      }
    },
  };
}

/** Minnesbaserad version, för tester. */
export function memoryFileStore(files: Record<string, string> = {}): FileStore & { files: Record<string, string> } {
  return {
    files,
    list: () => Object.keys(files),
    read: (n) => files[n] ?? null,
    write(n, t) {
      files[n] = t;
      return true;
    },
  };
}
