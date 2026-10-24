import { describe, expect, test } from "bun:test";
import { RULE_IDS, ruleParts, ruleText } from "../../locales/rules/index";
import { parseInline, parseMarkdown } from "../../src/phone/logic/markdown";
import { renderRules } from "../../src/phone/ui/rules";
import en from "../../locales/en.json";
import sv from "../../locales/sv.json";

describe("markdown", () => {
  test("rubriker, stycken, listor och fetstil", () => {
    const b = parseMarkdown("# Titel\n\nEn **fet** rad\nsom fortsätter.\n\n## Del\n\n- ett\n- två **b**\n  mer\n\nSlut");
    expect(b.map((x) => x.type)).toEqual(["h1", "p", "h2", "ul", "p"]);
    expect(b[1]).toEqual({
      type: "p",
      inline: [
        { text: "En ", bold: false },
        { text: "fet", bold: true },
        { text: " rad som fortsätter.", bold: false },
      ],
    });
    const ul = b[3];
    expect(ul?.type === "ul" && ul.items.length).toBe(2);
  });

  test("obalanserad fetstil blir vanlig text", () => {
    expect(parseInline("a ** b")).toEqual([{ text: "a ** b", bold: false }]);
  });

  test("HTML blir text, inte element", () => {
    const out = renderRules("<script>x</script> **a**");
    expect(JSON.stringify(out)).toContain("<script>");
    expect(out.length).toBe(1);
  });
});

describe("regeltexter", () => {
  test("alla 11 delar finns på båda språken", () => {
    expect(RULE_IDS.length).toBe(11);
    for (const lang of ["sv", "en"]) {
      for (const id of RULE_IDS) {
        const text = ruleText(lang, id);
        expect(text.length).toBeGreaterThan(100);
        expect(text.startsWith("#")).toBe(true);
        expect(parseMarkdown(text).length).toBeGreaterThan(3);
      }
    }
  });

  test("engelska är reserv för okänt språk", () => {
    expect(ruleText("xx", "base")).toBe(ruleText("en", "base"));
    expect(ruleText("sv", "base")).not.toBe(ruleText("en", "base"));
    expect(ruleText("en", "nej")).toBe("");
  });

  test("delar: grundspelet först, bara valda expansioner", () => {
    expect(ruleParts([])).toEqual(["base"]);
    expect(ruleParts(["abbot", "base", "river"])).toEqual(["base", "river", "abbot"]);
  });

  test("språknycklarna finns", () => {
    for (const f of [en, sv] as Record<string, unknown>[]) {
      for (const k of ["phone.rules", "rules.title", "rules.back", "rules.close"]) expect(typeof f[k]).toBe("string");
    }
  });
});
