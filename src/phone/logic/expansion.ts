// Expansionernas val på telefonen: stegen { type: "expansion" } grupperas efter expansion och handling,
// mål på kartan numreras (och visas som siffror på storskärmen), val utan mål blir knappar.
// Formen på `data` står vid ExpansionStepData i src/shared/state.ts.

import type { ExpansionStepData, FigureId, Pos, Step } from "../../shared/state";

export type ExpStep = Extract<Step, { type: "expansion" }>;

export const isExpansionStep = (s: Step): s is ExpStep => s.type === "expansion";

/** `data` som ExpansionStepData; allt annat än ett objekt ger tomma data. */
export function dataOf(step: ExpStep): ExpansionStepData {
  const d = step.data;
  return d && typeof d === "object" ? (d as ExpansionStepData) : {};
}

export interface ExpTarget {
  /** Siffran på storskärmen, från 1. */
  n: number;
  pos: Pos;
  feature?: string;
  /** Stegen som går att göra på målet (flera om t.ex. olika pjäser kan flyttas dit). */
  steps: ExpStep[];
}

export interface ExpGroup {
  expansion: string;
  action: string;
  /** Nyckel för rubriken: step.<expansion>.<action>. */
  titleKey: string;
  /** Siffrorna för gruppens mål. */
  targetNs: number[];
  /** Steg utan mål, med nyckel för knappens text. */
  buttons: { step: ExpStep; textKey: string; choice: string | null }[];
}

export interface ExpView {
  groups: ExpGroup[];
  targets: ExpTarget[];
}

const targetKey = (p: Pos, f: string | undefined) => `${p.x},${p.y},${f ?? ""}`;

export function expansionView(legal: readonly Step[]): ExpView {
  const steps = legal.filter(isExpansionStep);
  const byTarget = new Map<string, ExpTarget>();
  const groups = new Map<string, ExpGroup>();
  const stepTargets = new Map<string, Set<string>>();
  for (const step of steps) {
    const gk = `${step.expansion}.${step.action}`;
    let g = groups.get(gk);
    if (!g) {
      g = { expansion: step.expansion, action: step.action, titleKey: `step.${gk}`, targetNs: [], buttons: [] };
      groups.set(gk, g);
      stepTargets.set(gk, new Set());
    }
    const d = dataOf(step);
    if (d.pos) {
      const k = targetKey(d.pos, d.feature);
      let t = byTarget.get(k);
      if (!t) {
        t = { n: 0, pos: d.pos, ...(d.feature !== undefined ? { feature: d.feature } : {}), steps: [] };
        byTarget.set(k, t);
      }
      t.steps.push(step);
      stepTargets.get(gk)!.add(k);
    } else {
      const choice = d.choice ?? null;
      g.buttons.push({ step, choice, textKey: choice === null ? g.titleKey : `${g.titleKey}.${choice}` });
    }
  }
  // Stabil ordning: stigande y, sedan x, sedan område.
  const targets = [...byTarget.values()].sort(
    (a, b) => a.pos.y - b.pos.y || a.pos.x - b.pos.x || (a.feature ?? "").localeCompare(b.feature ?? ""),
  );
  targets.forEach((t, i) => (t.n = i + 1));
  const numberOf = new Map(targets.map((t) => [targetKey(t.pos, t.feature), t.n]));
  for (const [gk, g] of groups) {
    g.targetNs = [...stepTargets.get(gk)!].map((k) => numberOf.get(k)!).sort((a, b) => a - b);
  }
  return { groups: [...groups.values()], targets };
}

/** Målen som skickas till storskärmen i Preview.targets (mål 1 först). */
export function previewTargets(view: ExpView): { pos: Pos; feature?: string }[] {
  return view.targets.map((t) => ({ pos: t.pos, ...(t.feature !== undefined ? { feature: t.feature } : {}) }));
}

/** Nyckel som ändras när målen ändras (för att inte skicka samma förhandsvisning igen). */
export const targetsKey = (view: ExpView): string => view.targets.map((t) => targetKey(t.pos, t.feature)).join("|");

/** Pjäsen som ett steg gäller, om steget anger en. */
export const stepFigure = (step: ExpStep): FigureId | undefined => dataOf(step).figure;

/** Faser som telefonen har en egen vy för. I andra faser (en expansions egen) visas bara stegen. */
export const KNOWN_PHASES: readonly string[] = ["chooseTile", "placeTile", "placeFigure", "confirm"];
