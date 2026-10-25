// Magisk port: spelaren väljer rutan (s. 59: "to a tile already in play"), inte bara området.

import { describe, expect, test } from "bun:test";
import type { Step } from "../../../src/shared/state";
import type { ExpansionId } from "../../../src/shared/tiles";
import { realEngine } from "../../engine/helpers";
import { place$, play, scenario, type Rot } from "../../engine/scenario";

const eng = realEngine();
const EXP: ExpansionId[] = ["base", "princess-dragon"];
type PortalData = { pos: { x: number; y: number }; feature: string; choice: string };

describe("magisk port: ett mål per ruta och område", () => {
  const board: [string, number, number, Rot][] = [
    ["base/RFr", 0, 0, 0], ["base/RFr", 1, 0, 0], ["base/RFr", 2, 0, 0],
    ["base/C", 0, 5, 0], ["base/L", 0, 7, 0],
  ];
  const start = () => {
    const s = scenario(eng, { expansions: EXP, board, hands: [["princess-dragon/RRR.g"], []], figures: [{ id: "p2:meeple:0", x: 1, y: 0, feature: "road0" }] });
    return play(eng, s, place$(3, 0, 0), { type: "expansion", expansion: "princess-dragon", action: "portal", data: { choice: "meeple" } }).state;
  };
  const targets = (s: ReturnType<typeof start>) =>
    eng.legalSteps(s).flatMap((x): PortalData[] => (x.type === "expansion" && x.action === "portalPlace" ? [x.data as PortalData] : []));

  test("ett område som sträcker sig över flera rutor erbjuds på varje ruta", () => {
    const s = start();
    const t = targets(s);
    const an = eng.analyze(s);
    const byArea = new Map<number, PortalData[]>();
    for (const d of t) byArea.set(an.areaAt(d.pos, d.feature)!.id, [...(byArea.get(an.areaAt(d.pos, d.feature)!.id) ?? []), d]);
    const multi = [...byArea.values()].find((v) => v.length >= 2);
    expect(multi).toBeDefined();
    // Varje (ruta, område) är ett eget mål, utan dubbletter.
    const keys = t.map((d) => `${d.pos.x},${d.pos.y},${d.feature}`);
    expect(new Set(keys).size).toBe(keys.length);
    // Alla rutor i ett fritt område är med (utom upptagna områden).
    for (const area of an.areas) {
      if (area.complete || area.figures.some((f) => f.owner !== null) || area.kind === "road" || area.kind === "river") continue;
      if (area.kind !== "field" && area.kind !== "city" && area.kind !== "cloister" && area.kind !== "garden") continue;
      if (area.nodes.some((n) => t.some((d) => d.pos.x === n.pos.x && d.pos.y === n.pos.y && d.feature === n.feature)))
        for (const n of area.nodes)
          expect(t.some((d) => d.pos.x === n.pos.x && d.pos.y === n.pos.y && d.feature === n.feature)).toBe(true);
    }
  });

  test("följaren hamnar på den ruta spelaren väljer", () => {
    const s = start();
    const an = eng.analyze(s);
    const t = targets(s);
    const byArea = new Map<number, PortalData[]>();
    for (const d of t) byArea.set(an.areaAt(d.pos, d.feature)!.id, [...(byArea.get(an.areaAt(d.pos, d.feature)!.id) ?? []), d]);
    const pick = [...byArea.values()].find((v) => v.length >= 2)!.at(-1)!;
    const step: Step = { type: "expansion", expansion: "princess-dragon", action: "portalPlace", data: pick };
    const r = play(eng, s, step).state;
    expect(r.figures.find((f) => f.id === "p1:meeple:0")!.location).toEqual({ at: "feature", pos: pick.pos, feature: pick.feature });
  });
});
