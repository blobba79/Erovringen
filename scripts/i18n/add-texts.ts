// Slår ihop texterna i texts-*.ts med locales/en.json och locales/sv.json.
// Körs: npx bun scripts/i18n/add-texts.ts
import { readFileSync, writeFileSync } from "node:fs";
import { CORE } from "./texts-core";
import { FIGURES } from "./texts-figures";
import { UI } from "./texts-ui";

const read = (p: string) => JSON.parse(readFileSync(p, "utf8")) as Record<string, unknown>;
const en = read("locales/en.json");
const sv = read("locales/sv.json");
const untranslated = new Set<string>((sv._untranslated as string[]) ?? []);

for (const [key, e, s] of [...CORE, ...FIGURES, ...UI]) {
  en[key] = e;
  if (s === null) {
    sv[key] = e;
    untranslated.add(key);
  } else {
    sv[key] = s;
    untranslated.delete(key);
  }
}

const ordered = (o: Record<string, unknown>) => {
  const { _name, _untranslated, ...rest } = o;
  return { _name, ...(_untranslated ? { _untranslated } : {}), ...rest };
};
sv._untranslated = [...untranslated].sort();
const dump = (o: Record<string, unknown>) =>
  "{\n" +
  Object.entries(ordered(o))
    .map(([k, v]) =>
      k === "_untranslated"
        ? `  "${k}": [\n${(v as string[]).map((x) => `    ${JSON.stringify(x)}`).join(",\n")}\n  ]`
        : `  ${JSON.stringify(k)}: ${JSON.stringify(v)}`,
    )
    .join(",\n") +
  "\n}\n";
writeFileSync("locales/en.json", dump(en));
writeFileSync("locales/sv.json", dump(sv));
console.log(`untranslated sv: ${untranslated.size}`);
