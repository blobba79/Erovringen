// Regelvyn: knapp "Regler" och en helskärmsvy med delarna som är med i spelet.

import type { ComponentChild } from "preact";
import { useEffect, useState } from "preact/hooks";
import { ruleParts, ruleText, type RuleId } from "../../../locales/rules/index";
import { parseMarkdown, type Block, type Inline } from "../logic/markdown";
import { useT } from "./common";

const inline = (parts: Inline[]): ComponentChild[] =>
  parts.map((p) => (p.bold ? <strong>{p.text}</strong> : p.text));

/** Renderar regeltexten till Preact-element (ingen innerHTML). */
export function renderRules(src: string): ComponentChild[] {
  return parseMarkdown(src).map((b: Block) => {
    switch (b.type) {
      case "h1":
        return <h2 class="rules-h1">{inline(b.inline)}</h2>;
      case "h2":
        return <h3 class="rules-h2">{inline(b.inline)}</h3>;
      case "ul":
        return <ul>{b.items.map((i) => <li>{inline(i)}</li>)}</ul>;
      default:
        return <p>{inline(b.inline)}</p>;
    }
  });
}

/** Knappen och vyn. Vyn ligger över spelet, så inget i spelet påverkas när den öppnas. */
export function RulesButton({ expansions, lang }: { expansions: readonly string[]; lang: string }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>{t("phone.rules")}</button>
      {open && <RulesView expansions={expansions} lang={lang} onClose={() => setOpen(false)} />}
    </>
  );
}

function RulesView({ expansions, lang, onClose }: { expansions: readonly string[]; lang: string; onClose: () => void }) {
  const t = useT();
  const parts = ruleParts(expansions);
  const [part, setPart] = useState<RuleId | null>(null);
  useEffect(() => {
    const f = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (part) setPart(null);
      else onClose();
    };
    window.addEventListener("keydown", f);
    return () => window.removeEventListener("keydown", f);
  }, [part]);
  return (
    <div class="rules" role="dialog" aria-label={t("rules.title")}>
      <header>
        {part ? (
          <button type="button" class="back" onClick={() => setPart(null)}>{t("rules.back")}</button>
        ) : (
          <h1>{t("rules.title")}</h1>
        )}
        <button type="button" class="close" onClick={onClose}>{t("rules.close")}</button>
      </header>
      <div class="rules-body">
        {part ? (
          <article lang={lang}>{renderRules(ruleText(lang, part))}</article>
        ) : (
          <ul class="rules-list">
            {parts.map((id) => (
              <li>
                <button type="button" class="big" onClick={() => setPart(id)}>{t(`expansion.${id}`)}</button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
