// Format för språkfilerna i `locales/` (en.json, sv.json …).
// Ingen text skrivs i koden; allt hämtas med en nyckel.
//
// - Insatta värden skrivs `{namn}`: "{player} fick {points} poäng".
// - Ental och flertal anges som objekt med kategorierna från `Intl.PluralRules`
//   (one, other …) och styrs av värdet `count`.
// - Saknas en nyckel i ett språk används engelskan; saknas den även där visas nyckeln.
// - I sv.json listar `_untranslated` nycklar där det engelska ordet används tills vidare.

export type PluralText = Partial<Record<Intl.LDMLPluralRule, string>> & { other: string };
export type LocaleText = string | PluralText;

export interface LocaleFile {
  /** Språkets eget namn, t.ex. "Svenska". */
  _name: string;
  _untranslated?: string[];
  [key: string]: LocaleText | string[] | undefined;
}

export type TextParams = Record<string, string | number>;

export type Translate = (key: string, params?: TextParams) => string;
