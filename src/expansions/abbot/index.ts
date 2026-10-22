// Abboten (grundspelet): en pjäs per spelare som bara står på kloster och trädgårdar (s. 196-198).
//
// - Placeringen följer de vanliga pjäsreglerna i motorn: abboten står bara på kloster/trädgård på
//   brickan som just lagts (figure.placeableOn). Bara abboten får stå på en trädgård, eftersom
//   den vanliga pjäsens lista saknar "garden".
// - Poäng: motorn räknar kloster och trädgård likadant (1 per bricka, 9 när färdig), under
//   spelet, vid slutet och när abboten tas tillbaka.
// - Den här modulen erbjuder "ta tillbaka abboten" i stället för att placera en pjäs.

import type { ExpansionModule } from "../../shared/expansion";
import type { Step } from "../../shared/state";

export const ABBOT_KIND = "abbot";

export const abbotModule: ExpansionModule = {
  id: "abbot",
  requires: ["base"],
  tileSets: [],
  figures: [{ kind: ABBOT_KIND, count: 1, placeableOn: ["cloister", "garden"] }],
  variants: [],
  hooks: {
    extraSteps(ctx, phase) {
      if (phase !== "placeFigure") return [];
      const out: Step[] = [];
      for (const f of ctx.state.figures)
        if (f.kind === ABBOT_KIND && f.owner === ctx.player && f.location.at === "feature")
          out.push({ type: "returnFigure", figure: f.id });
      return out;
    },
  },
};
