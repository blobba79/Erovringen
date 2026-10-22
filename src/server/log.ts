// Enkel loggfil i `logg/` med rotation: server.log byts ut mot server.log.1 … när den blir för stor.

import { appendFileSync, existsSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

export interface Logger {
  info(msg: string): void;
  warn(msg: string): void;
  error(msg: string): void;
}

export const nullLogger: Logger = { info() {}, warn() {}, error() {} };

export interface FileLoggerOptions {
  dir: string;
  /** Största storlek i byte innan filen roteras. */
  maxBytes?: number;
  /** Antal gamla filer som sparas. */
  keep?: number;
  /** Skriv också till konsolen. */
  console?: boolean;
}

export function createFileLogger(opts: FileLoggerOptions): Logger {
  const maxBytes = opts.maxBytes ?? 1_000_000;
  const keep = opts.keep ?? 3;
  const file = join(opts.dir, "server.log");
  let ready = false;

  function rotate() {
    try {
      if (!existsSync(file) || statSync(file).size < maxBytes) return;
      rmSync(`${file}.${keep}`, { force: true });
      for (let i = keep - 1; i >= 1; i--) if (existsSync(`${file}.${i}`)) renameSync(`${file}.${i}`, `${file}.${i + 1}`);
      renameSync(file, `${file}.1`);
    } catch {
      // loggen får aldrig stoppa spelet
    }
  }

  function write(level: string, msg: string) {
    const line = `${new Date().toISOString()} ${level} ${msg}\n`;
    if (opts.console) (level === "ERROR" ? console.error : console.log)(line.trimEnd());
    try {
      if (!ready) {
        mkdirSync(opts.dir, { recursive: true });
        ready = true;
      }
      rotate();
      appendFileSync(file, line);
    } catch {
      // se ovan
    }
  }

  return {
    info: (m) => write("INFO", m),
    warn: (m) => write("WARN", m),
    error: (m) => write("ERROR", m),
  };
}
