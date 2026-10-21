import type { LocaleFile, LocaleText, TextParams, Translate } from "../shared/i18n";
import en from "../../locales/en.json";
import sv from "../../locales/sv.json";

/** Språkregister: ett nytt språk = en JSON-fil plus en rad här. */
export const LOCALES: Record<string, LocaleFile> = {
  en: en as LocaleFile,
  sv: sv as LocaleFile,
};

export const DEFAULT_LANG = "en";

export interface LanguageInfo {
  code: string;
  name: string;
}

export function availableLanguages(): LanguageInfo[] {
  return Object.entries(LOCALES).map(([code, f]) => ({ code, name: f._name }));
}

function lookup(file: LocaleFile | undefined, key: string): LocaleText | undefined {
  if (!file || key.startsWith("_")) return undefined;
  const v = file[key];
  if (typeof v === "string" || (v && !Array.isArray(v) && typeof v === "object")) return v;
  return undefined;
}

function substitute(text: string, params?: TextParams): string {
  if (!params) return text;
  return text.replace(/\{(\w+)\}/g, (m, name: string) =>
    name in params ? String(params[name]) : m,
  );
}

function pick(text: LocaleText, lang: string, params?: TextParams): string {
  if (typeof text === "string") return text;
  const count = Number(params?.count);
  let cat: Intl.LDMLPluralRule = "other";
  if (Number.isFinite(count)) {
    try {
      cat = new Intl.PluralRules(lang).select(count);
    } catch {
      cat = "other";
    }
  }
  return text[cat] ?? text.other;
}

export function createTranslator(lang: string): Translate {
  const primary = LOCALES[lang];
  const fallback = LOCALES[DEFAULT_LANG];
  return (key, params) => {
    try {
      const inLang = lookup(primary, key);
      const found = inLang ?? lookup(fallback, key);
      if (found === undefined) return key;
      const text = pick(found, inLang !== undefined ? lang : DEFAULT_LANG, params);
      return substitute(text, params) || key;
    } catch {
      return key;
    }
  };
}
