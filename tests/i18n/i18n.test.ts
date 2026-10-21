import { describe, expect, test } from "bun:test";
import { availableLanguages, createTranslator, LOCALES } from "../../src/i18n";
import { checkLocales } from "../../scripts/i18n/check";
import type { LocaleFile } from "../../src/shared/i18n";

describe("translator", () => {
  test("substitution", () => {
    expect(createTranslator("sv")("turn.waiting", { player: "Anna" })).toBe("Väntar på Anna");
    expect(createTranslator("en")("turn.waiting", { player: "Bo" })).toBe("Waiting for Bo");
  });
  test("plural en and sv", () => {
    const en = createTranslator("en");
    expect(en("score.points", { count: 1 })).toBe("1 point");
    expect(en("score.points", { count: 5 })).toBe("5 points");
    const sv = createTranslator("sv");
    expect(sv("turn.tilesLeft", { count: 1 })).toBe("1 bricka kvar");
    expect(sv("turn.tilesLeft", { count: 3 })).toBe("3 brickor kvar");
  });
  test("fallback to English for unknown language", () => {
    expect(createTranslator("xx")("turn.confirm")).toBe("Confirm move");
  });
  test("fallback to key", () => {
    expect(createTranslator("sv")("no.such.key")).toBe("no.such.key");
    expect(createTranslator("en")("_name")).toBe("_name");
  });
  test("languages listed", () => {
    expect(availableLanguages()).toContainEqual({ code: "sv", name: "Svenska" });
  });
});

describe("check", () => {
  test("real locales have no errors", () => {
    expect(checkLocales(LOCALES).errors).toEqual([]);
  });
  test("finds planted errors", () => {
    const en: LocaleFile = { _name: "English", a: "A", p: { one: "x", other: "y" } };
    const sv = {
      _name: "Svenska",
      a: "A",
      extra: "?",
      p: { one: "x" },
    } as unknown as LocaleFile;
    const r = checkLocales({ en, sv });
    expect(r.errors.some((e) => e.includes('"extra"'))).toBe(true);
    expect(r.errors.some((e) => e.includes("missing \"other\""))).toBe(true);
    expect(r.warnings.some((w) => w.includes('"a" identical'))).toBe(true);
  });
});
