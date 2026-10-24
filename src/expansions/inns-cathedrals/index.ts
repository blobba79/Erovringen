// Inns & Cathedrals (s. 31-34, 207-214).
//
// - Brickorna (18) finns i src/tiles/inns-cathedrals.json: värdshus är props.inn på en väg,
//   katedral props.cathedral på en stad.
// - Den stora pjäsen ("large-meeple", en per spelare) står på stad, väg, fält och kloster, inte på
//   trädgård (abboten bor ensam där; OKLART i reglerna, JCloisterZone-beteende). Motorn räknar den
//   som två pjäser vid majoritet (scoring.ts STRENGTH). Den dubblar inte poängen.
// - Värdshus: färdig väg med minst ett värdshus ger 2 poäng per bricka, ofärdig väg 0 vid slutet.
// - Katedral: färdig stad med minst en katedral ger 3 per bricka och sköld, ofärdig stad 0 vid slutet.
// - Fält räknas som vanligt (3 per färdig stad, även en med katedral).
// - Poäng ändras bara av scoreFeature, i regelns ordning (grund, värdshus, katedral, övrigt).

import type { ExpansionModule } from "../../shared/expansion";
import type { TileSet } from "../../shared/tiles";
import type { EngineHookContext } from "../../engine/context";
import { analyze } from "../../engine/features";
import { rotatedAt } from "../../engine/board";
import { TILE_DATA } from "../../tiles/index";

export const LARGE_MEEPLE_KIND = "large-meeple";

const set: TileSet = (TILE_DATA["inns-cathedrals"] as { set: TileSet }).set;

export const innsCathedralsModule: ExpansionModule = {
  id: "inns-cathedrals",
  requires: ["base"],
  tileSets: [set],
  figures: [{ kind: LARGE_MEEPLE_KIND, count: 1, placeableOn: ["city", "road", "field", "cloister"] }],
  variants: [],
  hooks: {
    scoreFeature(c, ref, points, final) {
      const ctx = c as EngineHookContext;
      const s = ctx.state;
      const an = analyze(s.board, s.figures, ctx.types);
      const area = an.areaAt(ref.pos, ref.feature);
      if (!area || (area.kind !== "road" && area.kind !== "city")) return points;
      const prop = area.kind === "road" ? "inn" : "cathedral";
      const marked = area.nodes.some((n) => {
        const rt = rotatedAt(s.board, ctx.types, n.pos);
        const f = rt?.features.find((x) => x.id === n.feature);
        return (f?.props as Record<string, unknown> | undefined)?.[prop] === true;
      });
      if (!marked) return points;
      // Påslag på det som redan räknats, så att andra modulers ändringar (t.ex. magikern) står kvar.
      const road = area.kind === "road";
      const units = road ? area.tiles.length : area.tiles.length + area.pennants;
      const base = road || !area.complete ? units : units * 2;
      const value = !area.complete ? (final ? 0 : base) : units * (road ? 2 : 3);
      return points + value - base;
    },
  },
};
