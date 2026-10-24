// Expansionernas val: grupper med rubrik, sifferknappar för mål på kartan och knappar för val utan mål.

import type { PhoneState } from "../client";
import { expansionView, dataOf, type ExpStep } from "../logic/expansion";
import { useClient, useT } from "./common";

export function ExpansionStage({ s }: { s: PhoneState }) {
  const t = useT();
  const c = useClient();
  const view = expansionView(s.legal);
  if (view.groups.length === 0) return null;
  // Text för en nyckel; saknas den används reservtexten (handlingens eller valets id).
  const label = (key: string, fallback: string) => (t(key) !== key ? t(key) : fallback);
  const figureName = (step: ExpStep): string | null => {
    const id = dataOf(step).figure;
    if (id === undefined) return null;
    const kind = s.state?.figures.find((f) => f.id === id)?.kind ?? id;
    return label(`figure.${kind}`, kind);
  };
  const manyGroups = view.groups.length > 1;
  const picked = s.target === null ? null : view.targets.find((x) => x.n === s.target) ?? null;
  const optionText = (step: ExpStep): string => {
    const d = dataOf(step);
    const g = view.groups.find((x) => x.expansion === step.expansion && x.action === step.action)!;
    const what = figureName(step) ?? (d.choice !== undefined ? label(`${g.titleKey}.${d.choice}`, d.choice) : null);
    const title = label(g.titleKey, step.action);
    return what === null ? title : manyGroups ? `${title}: ${what}` : what;
  };
  return (
    <section class="stage expansion">
      {view.groups.map((g) => (
        <div class="expgroup" data-group={`${g.expansion}.${g.action}`}>
          <p class="hint exptitle">{label(g.titleKey, g.action)}</p>
          {g.targetNs.length > 0 && (
            <div class="digits">
              {g.targetNs.map((n) => (
                <button type="button" class={`digit${s.target === n ? " on" : ""}`} onClick={() => c.pickTarget(n)}>{n}</button>
              ))}
            </div>
          )}
          {g.buttons.length > 0 && (
            <div class="row wrap">
              {g.buttons.map((b) => (
                <button type="button" class="big" onClick={() => c.step(b.step)}>
                  {label(b.textKey, b.choice ?? g.action)}
                </button>
              ))}
            </div>
          )}
        </div>
      ))}
      {picked && picked.steps.length > 1 && (
        <div class="row wrap expoptions">
          {picked.steps.map((step) => (
            <button type="button" class="big primary" onClick={() => c.step(step)}>{optionText(step)}</button>
          ))}
        </div>
      )}
    </section>
  );
}
