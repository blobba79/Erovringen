// Sökvägar för programmet på datorn. Används bara av main.ts (inte av spelrummet i webbläsaren).

import { dirname, resolve } from "node:path";

/** Mappen bredvid programmet: den körbara filen, eller projektroten under utveckling. */
export function baseDir(): string {
  return isCompiled() ? dirname(process.execPath) : resolve(import.meta.dir, "..", "..");
}

/** Sant när programmet körs som färdig programfil, falskt under `bun` (utveckling och tester). */
export function isCompiled(exe: string = process.execPath): boolean {
  return !/(^|[\\/])bun(\.exe)?$/i.test(exe);
}
