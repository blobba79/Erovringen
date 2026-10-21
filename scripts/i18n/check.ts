import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { LocaleFile } from "../../src/shared/i18n";

export interface CheckResult {
  errors: string[];
  warnings: string[];
}

const keysOf = (f: LocaleFile) => Object.keys(f).filter((k) => !k.startsWith("_"));

export function checkLocales(files: Record<string, LocaleFile>, base = "en"): CheckResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  const en = files[base];
  if (!en) return { errors: [`missing base language ${base}`], warnings };
  const enKeys = new Set(keysOf(en));
  for (const [lang, f] of Object.entries(files)) {
    for (const k of keysOf(f)) {
      const v = f[k];
      if (v && typeof v === "object" && !Array.isArray(v) && typeof v.other !== "string")
        errors.push(`${lang}: plural "${k}" is missing "other"`);
      if (lang !== base && !enKeys.has(k)) errors.push(`${lang}: unknown key "${k}" (not in ${base})`);
    }
    if (lang === base) continue;
    const un = new Set(f._untranslated ?? []);
    for (const k of enKeys) if (!(k in f)) warnings.push(`${lang}: missing key "${k}"`);
    for (const k of un) {
      warnings.push(`${lang}: untranslated "${k}"`);
      if (!enKeys.has(k)) errors.push(`${lang}: _untranslated lists unknown key "${k}"`);
    }
    for (const k of keysOf(f)) {
      if (un.has(k) || !enKeys.has(k)) continue;
      if (JSON.stringify(f[k]) === JSON.stringify(en[k]))
        warnings.push(`${lang}: "${k}" identical to ${base} but not in _untranslated`);
    }
  }
  return { errors, warnings };
}

export function loadDir(dir: string): Record<string, LocaleFile> {
  const out: Record<string, LocaleFile> = {};
  for (const n of readdirSync(dir).filter((n) => n.endsWith(".json")))
    out[n.slice(0, -5)] = JSON.parse(readFileSync(join(dir, n), "utf8"));
  return out;
}

if (import.meta.main) {
  const r = checkLocales(loadDir(process.argv[2] ?? "locales"));
  for (const w of r.warnings) console.log("warning: " + w);
  for (const e of r.errors) console.log("ERROR: " + e);
  console.log(`${r.errors.length} errors, ${r.warnings.length} warnings`);
  process.exit(r.errors.length ? 1 : 0);
}
