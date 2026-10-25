// The Princess & the Dragon (s. 52-62, 204-207, 213), gamla utgåvan med prinsessa och vulkan.
//
// - Brickorna (30) finns i src/tiles/princess-dragon.json. Symboler: "volcano", "dragon" och "portal"
//   (magisk port). Prinsessan är egenskapen { princess: true } på stadsområdet.
// - Draken ("dragon:0") och fen ("fairy:0") är neutrala pjäser. Draken ligger i förrådet (utanför
//   kartan) tills en vulkanbricka lagts; sedan har den location { at: "tile", pos }. Fen står intill
//   en följare: { at: "figure", figure }. Går följaren hem (poäng, uppäten, hemtagen) blir fen kvar på
//   rutan som { at: "tile", pos } (motorn gör det i returnToSupply); den spärrar fortfarande draken
//   men ger inga poäng förrän ägaren flyttat den intill en ny följare.
// - Dragbricka före vulkan: dragbrickorna läggs åt sidan redan vid spelstart (ext.aside) och blandas
//   in i högen på slumpmässiga platser när draken kommer i spel. Det ger samma dragningar som att
//   dra dem, lägga dem åt sidan och dra en ny.
//
// Tur (s. 204-207):
//  1. Turens början (motorkroken `turnStarted`): fen intill en egen följare ger 1 poäng, bara första
//     delen av byggmästarens dubbeltur.
//  2. Vulkan: draken flyttas till brickan (ingen rörelse, äter inget). Ingen pjäs får ställas ut på
//     brickan (motorkroken `figureBlocked`, som också gäller magiska porten och står i motorn).
//  3. Pjässteget (fasen "placeFigure") får tre nya alternativ till att ställa ut en följare:
//       expansion "princess-dragon" action "fairy"   data { pos, feature, figure }  (fen flyttas intill
//         en egen följare på en annan bricka än fen; en följare per område)
//       expansion "princess-dragon" action "portal"  data { choice: <pjässort> }  (bara på en bricka
//         med port; går vidare till fasen "portal")
//       expansion "princess-dragon" action "seduce"  data { pos, feature, figure }  (prinsessa: bara om
//         brickans prinsessestad hänger ihop med en stad som har en följare; vilken följare som helst,
//         även egen; byggmästare/gris hos ägaren går hem om följaren var ägarens sista i staden)
//     Fasen "portal": expansion "princess-dragon" action "portalPlace" data { pos, feature, choice: <områdets sort> } ställer en
//     följare av vald sort på ett ofärdigt, ledigt område var som helst (ett mål per område; inte på
//     rutan där draken står, inte på färdiga områden). Efter prinsessan, porten och fen är pjässteget
//     klart (ingen pjäs får ställas ut eller flyttas mer den turen).
//  4. Dragbricka: draken flyttar 6 steg, en ruta var, i tur och ordning med start hos spelaren som har
//     tur (fasen "dragon", `turn.actor` är den som flyttar):
//       expansion "princess-dragon" action "move"  data { pos }
//     Draken går till en grannruta med bricka, aldrig en ruta den redan varit på under flytten
//     (startrutan räknas), aldrig fens ruta. Den äter alla följare och byggmästare/grisar på rutan som
//     den går in på (inte neutrala pjäser, inte fen), och en byggmästare/gris hos en spelare som inte har
//     någon följare kvar på området går också hem. Värden kan hoppa över eller ta bort den som flyttar
//     (motorkroken `skipActor`): nästa spelare i tur och ordning tar över hens steg, så att draken ändå
//     flyttar sex rutor (s. 56). Kan den inte gå vidare slutar flytten. Variant
//     "princess-dragon.dragonTiming": "before" (HiG, standard) = efter pjässteget, före poängräkningen
//     (fasen kommer före "confirm"); "after" (RGG) = efter poängräkningen (när spelaren bekräftat).
//     Ångra hör till spelaren som har tur, men bara efter det sista som någon annan flyttat (motorns undoLock).
//  5. Poäng: fens 3 poäng till ägaren av följaren den står intill när området räknas (färdigt under
//     spelet, eller vid slutet), oavsett majoritet (motorkroken `areaScored`).
//
// - Modulen måste komma före Ferries i modullistan: när draken flyttat vidare frågas modulerna efter
//   den om sin fas efter pjässteget (färjorna).
// - Tar draken byggmästaren samma tur som brickan byggt vidare på hans område gäller den extra turen
//   ändå (Traders & Builders avgör den vid placeringen; steg 9a säger "had a builder", och även en
//   byggmästare som gått hem när området blev färdigt ger den, s. 37). Spelaren får välja att ta den.

import type { ExpansionModule, HookContext, RuleVariantDefinition } from "../../shared/expansion";
import type { ExpansionStepData, Figure, PlayerId, Pos, Step } from "../../shared/state";
import type { TileSet } from "../../shared/tiles";
import { activeModules, engineHook, playerOf, type EngineHookContext, type EngineHooks } from "../../engine/context";
import { analyze } from "../../engine/features";
import { rotatedAt } from "../../engine/board";
import { EDGES, neighbour, posKey, samePos } from "../../engine/geometry";
import { randomInt } from "../../engine/rng";
import { returnToSupply, strength } from "../../engine/scoring";
import { placedStep } from "../../engine/turnstate";
import { phaseAfterFigure } from "../../engine/steps";
import { TILE_DATA } from "../../tiles/index";

const ID = "princess-dragon";
export const DRAGON_KIND = "dragon";
export const FAIRY_KIND = "fairy";
export const DRAGON_PHASE = "dragon";
export const PORTAL_PHASE = "portal";
/** Antal steg draken flyttar. */
export const DRAGON_MOVES = 6;
export const FAIRY_TURN_POINTS = 1;
export const FAIRY_SCORE_POINTS = 3;

const set: TileSet = (TILE_DATA[ID] as { set: TileSet }).set;

const variants: RuleVariantDefinition[] = [{ id: "dragonTiming", options: ["before", "after"], default: "before" }];

interface DragonMove {
  /** Rutor draken varit på under flytten (startrutan först). */
  visited: Pos[];
  /** Antal steg som gjorts. */
  count: number;
  /** Vem som flyttar varje steg, i ordning (sex platser; en plats faller bort om värden hoppar över spelaren). */
  order: PlayerId[];
}

interface Ext {
  /** Dragbrickor som ligger åt sidan tills draken kommer i spel. */
  aside: string[];
  /** En dragbricka lades den här turen och draken ska flytta. */
  dragonTile?: boolean;
  move?: DragonMove;
  /** Pjässorten som valts i fasen "portal". */
  portal?: string;
}

function ext(ctx: { state: { ext: Record<string, unknown> } }): Ext {
  const s = ctx.state.ext as Record<string, unknown>;
  if (!s[ID]) s[ID] = { aside: [] } satisfies Ext;
  return s[ID] as Ext;
}

const timing = (ctx: EngineHookContext) => (ctx.state.setup.variants[`${ID}.dragonTiming`] === "after" ? "after" : "before");

const dragonFig = (ctx: EngineHookContext) => ctx.state.figures.find((f) => f.kind === DRAGON_KIND);
const fairyFig = (ctx: EngineHookContext) => ctx.state.figures.find((f) => f.kind === FAIRY_KIND);

/** Rutan draken står på, eller undefined om den inte är i spel. */
function dragonPos(ctx: EngineHookContext): Pos | undefined {
  const l = dragonFig(ctx)?.location;
  return l?.at === "tile" ? l.pos : undefined;
}

/** Rutan fen står på (intill en följare eller kvar efter att följaren gått hem). */
function fairyTile(ctx: EngineHookContext): Pos | undefined {
  const l = fairyFig(ctx)?.location;
  if (!l) return undefined;
  if (l.at === "tile") return l.pos;
  if (l.at === "figure") {
    const host = ctx.state.figures.find((f) => f.id === l.figure);
    return host?.location.at === "feature" ? host.location.pos : undefined;
  }
  return undefined;
}

/** Följaren fen står intill, om den står på kartan. */
function fairyHost(ctx: EngineHookContext): Figure | undefined {
  const l = fairyFig(ctx)?.location;
  if (l?.at !== "figure") return undefined;
  const host = ctx.state.figures.find((f) => f.id === l.figure);
  return host?.location.at === "feature" ? host : undefined;
}

function symbolsOfPlaced(ctx: EngineHookContext): readonly string[] {
  const p = placedStep(ctx.state);
  const t = p && ctx.state.board[posKey(p.pos)];
  return (t && ctx.types.get(t.type)?.symbols) || [];
}

function award(ctx: EngineHookContext, player: PlayerId, points: number, reason: string, pos?: Pos, feature?: string): void {
  if (points <= 0) return;
  playerOf(ctx.state, player).score += points;
  ctx.emit({ type: "scored", player, points, reason, ...(pos ? { pos, feature } : {}) });
}

const step = (action: string, data: ExpansionStepData): Step => ({ type: "expansion", expansion: ID, action, data });

/** Följarsorter (inte byggmästare, gris eller neutrala pjäser). */
function followerDefs(ctx: EngineHookContext) {
  return activeModules(ctx.env, ctx.state.setup).flatMap((m) => m.figures).filter((d) => !d.neutral && !d.joinsOwn);
}

/** Byggmästare och grisar (pjäser som bara står där ägaren har en följare) går hem när den sista följaren är borta. */
function sendOrphansHome(ctx: EngineHookContext): void {
  const s = ctx.state;
  const joiners = new Set(activeModules(ctx.env, s.setup).flatMap((m) => m.figures).filter((d) => d.joinsOwn).map((d) => d.kind));
  if (joiners.size === 0) return;
  const an = analyze(s.board, s.figures, ctx.types);
  for (const f of s.figures) {
    if (!joiners.has(f.kind) || f.owner === null || f.location.at !== "feature") continue;
    const area = an.areaAt(f.location.pos, f.location.feature);
    if (!area || !area.figures.some((x) => x.owner === f.owner && strength(x) > 0)) returnToSupply(ctx, f);
  }
}

// --- Draken ---------------------------------------------------------------------------------------

/** Rutor draken får gå till härnäst. */
function dragonTargets(ctx: EngineHookContext): Pos[] {
  const m = ext(ctx).move;
  const from = dragonPos(ctx);
  if (!m || !from) return [];
  const fairy = fairyTile(ctx);
  return EDGES.map((e) => neighbour(from, e)).filter(
    (p) => ctx.state.board[posKey(p)] && !m.visited.some((v) => samePos(v, p)) && !(fairy && samePos(fairy, p)),
  );
}

/** Spelaren som flyttar draken härnäst: start hos den som har tur, sedan i sittordning. */
function mover(ctx: EngineHookContext): PlayerId {
  const m = ext(ctx).move as DragonMove;
  fixOrder(ctx, m);
  return m.order[m.count] ?? ctx.state.turn.player;
}

/** Nästa spelare i ordningen efter plats `k` (inte spelaren på `k` själv, om någon annan finns kvar) som är kvar i spelet. */
function heir(m: DragonMove, k: number, here: Set<PlayerId>): PlayerId {
  const n = m.order.length;
  const me = m.order[k] as PlayerId;
  for (let j = 1; j <= n; j++) {
    const p = m.order[(k + j) % n] as PlayerId;
    if (p !== me && here.has(p)) return p;
  }
  return me;
}

/** Platser som tillhör en spelare som värden tagit bort tas över av nästa spelare, så att draken alltid flyttar sex steg. */
function fixOrder(ctx: EngineHookContext, m: DragonMove): void {
  const here = new Set(ctx.state.players.map((p) => p.id));
  for (let i = m.count; i < m.order.length; i++) if (!here.has(m.order[i] as PlayerId)) m.order[i] = heir(m, i, here);
}

/** Flytten är slut (sex steg, återvändsgränd eller inga flyttare kvar): vidare till nästa fas. */
function endMove(ctx: EngineHookContext): void {
  delete ext(ctx).move;
  delete ctx.state.turn.actor;
  ctx.state.turn.phase = timing(ctx) === "after" ? "confirm" : phaseAfterDragon(ctx);
}

/** Nästa flyttare, eller slut om draken inte kan gå vidare eller alla steg är gjorda. */
function advanceMove(ctx: EngineHookContext): void {
  const m = ext(ctx).move as DragonMove;
  fixOrder(ctx, m);
  if (m.count >= m.order.length || dragonTargets(ctx).length === 0) endMove(ctx);
  else setActor(ctx);
}

function setActor(ctx: EngineHookContext): void {
  const who = mover(ctx);
  if (who === ctx.state.turn.player) delete ctx.state.turn.actor;
  else ctx.state.turn.actor = who;
}

/** Börja flytta draken. Falskt om den inte är i spel eller inte kan gå någonstans. */
function startMove(ctx: EngineHookContext): boolean {
  const from = dragonPos(ctx);
  if (!from) return false;
  const e = ext(ctx);
  const ps = ctx.state.players.map((p) => p.id);
  const first = ps.indexOf(ctx.state.turn.player);
  e.move = {
    visited: [{ ...from }],
    count: 0,
    order: Array.from({ length: DRAGON_MOVES }, (_, k) => ps[(first + k) % ps.length] as PlayerId),
  };
  if (dragonTargets(ctx).length === 0) {
    delete e.move;
    return false;
  }
  setActor(ctx);
  return true;
}

/** Fasen efter flytten (före poängräkningen): modulerna efter den här frågas om sin fas, annars bekräfta. */
function phaseAfterDragon(ctx: EngineHookContext): string {
  const mods = activeModules(ctx.env, ctx.state.setup);
  const i = mods.findIndex((m) => m.id === ID);
  for (const m of mods.slice(i + 1)) {
    const phase = engineHook(m, "afterFigureStep")?.(ctx);
    if (phase !== undefined) return phase;
  }
  return "confirm";
}

/** Draken äter alla pjäser med ägare på rutan (följare, byggmästare, gris, stor följare, abbot). */
function eat(ctx: EngineHookContext, pos: Pos): void {
  const victims = ctx.state.figures.filter((f) => f.owner !== null && f.location.at === "feature" && samePos(f.location.pos, pos));
  if (victims.length === 0) return;
  for (const v of victims) returnToSupply(ctx, v);
  sendOrphansHome(ctx);
  ctx.emit({ type: "expansion", expansion: ID, event: "eat", data: { pos, figures: victims.map((v) => v.id) } });
}

function dragonOptions(ctx: EngineHookContext): Step[] {
  return dragonTargets(ctx).map((pos) => step("move", { pos }));
}

// --- Pjässteget -----------------------------------------------------------------------------------

/** Egna följare som fen kan flyttas intill (en per område, inte på fens egen ruta). */
function fairyOptions(ctx: EngineHookContext): Step[] {
  const here = fairyTile(ctx);
  const seen = new Set<string>();
  const out: Step[] = [];
  for (const f of ctx.state.figures) {
    if (f.owner !== ctx.player || strength(f) <= 0 || f.location.at !== "feature") continue;
    const { pos, feature } = f.location;
    if (here && samePos(here, pos)) continue;
    const key = `${posKey(pos)}|${feature}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(step("fairy", { pos: { ...pos }, feature, figure: f.id }));
  }
  return out;
}

/** Följare som prinsessan får ta bort: alla följare i en stad som brickans prinsessestad byggt vidare på. */
function seduceOptions(ctx: EngineHookContext): Step[] {
  const placed = placedStep(ctx.state);
  if (!placed) return [];
  const rt = rotatedAt(ctx.state.board, ctx.types, placed.pos);
  if (!rt) return [];
  const an = analyze(ctx.state.board, ctx.state.figures, ctx.types);
  const seen = new Set<string>();
  const out: Step[] = [];
  for (const feature of rt.features) {
    if (feature.kind !== "city" || !(feature.props as Record<string, unknown> | undefined)?.princess) continue;
    const area = an.areaAt(placed.pos, feature.id);
    if (!area || area.tiles.length < 2) continue;
    for (const f of area.figures) {
      if (f.owner === null || strength(f) <= 0 || f.location.at !== "feature" || seen.has(f.id)) continue;
      seen.add(f.id);
      out.push(step("seduce", { pos: { ...f.location.pos }, feature: f.location.feature, figure: f.id }));
    }
  }
  return out;
}

/** Rutor där en följare av sorten får ställas via porten: i ofärdiga områden utan följare, ett mål per ruta och område. */
function portalTargets(ctx: EngineHookContext, kind: string): { pos: Pos; feature: string; choice: string }[] {
  const def = followerDefs(ctx).find((d) => d.kind === kind);
  if (!def) return [];
  const dragon = dragonPos(ctx);
  const an = analyze(ctx.state.board, ctx.state.figures, ctx.types);
  const out: { pos: Pos; feature: string; choice: string }[] = [];
  for (const area of an.areas) {
    if (area.complete || !def.placeableOn.includes(area.kind) || area.figures.some((f) => f.owner !== null)) continue;
    // Ett mål per ruta och område: spelaren väljer rutan (s. 59), vilket spelar roll för draken och fen.
    for (const n of area.nodes) {
      if (dragon && samePos(n.pos, dragon)) continue;
      out.push({ pos: { ...n.pos }, feature: n.feature, choice: area.kind });
    }
  }
  return out;
}

/** Sorter spelaren kan skicka genom porten just nu. */
function portalKinds(ctx: EngineHookContext): string[] {
  if (!symbolsOfPlaced(ctx).includes("portal")) return [];
  const out: string[] = [];
  for (const d of followerDefs(ctx)) {
    if (out.includes(d.kind)) continue;
    if (!ctx.state.figures.some((f) => f.kind === d.kind && f.owner === ctx.player && f.location.at === "supply")) continue;
    if (portalTargets(ctx, d.kind).length > 0) out.push(d.kind);
  }
  return out;
}

function optionsFor(ctx: EngineHookContext, phase: string): Step[] {
  if (phase === "placeFigure")
    return [
      ...portalKinds(ctx).map((choice) => step("portal", { choice })),
      ...seduceOptions(ctx),
      ...fairyOptions(ctx),
    ];
  if (phase === PORTAL_PHASE) {
    const kind = ext(ctx).portal;
    return kind ? portalTargets(ctx, kind).map((t) => step("portalPlace", t)) : [];
  }
  if (phase === DRAGON_PHASE) return dragonOptions(ctx);
  return [];
}

const samePosOpt = (a?: Pos, b?: Pos) => (!a && !b) || (!!a && !!b && samePos(a, b));

function dataMatches(a: ExpansionStepData, b: ExpansionStepData): boolean {
  return samePosOpt(a.pos, b.pos) && a.feature === b.feature && a.figure === b.figure && a.choice === b.choice;
}

/** Pjässteget är gjort: nästa fas (dragen, färjorna) eller bekräfta. */
function afterFigure(ctx: EngineHookContext): void {
  ctx.state.turn.phase = phaseAfterFigure(ctx, activeModules(ctx.env, ctx.state.setup));
}

const engineHooks: Partial<EngineHooks> = {
  // Före poängräkningen (HiG): dragbrickan ger en dragfas efter pjässteget.
  afterFigureStep(c) {
    const e = ext(c);
    if (!e.dragonTile || timing(c) === "after") return undefined;
    delete e.dragonTile;
    return startMove(c) ? DRAGON_PHASE : undefined;
  },

  // Efter poängräkningen (RGG): dragfasen kommer när spelaren bekräftat.
  afterScoring(c) {
    const e = ext(c);
    const wanted = e.dragonTile && timing(c) === "after";
    delete e.dragonTile;
    return wanted && startMove(c) ? DRAGON_PHASE : undefined;
  },

  turnStarted(c, extra) {
    const e = ext(c);
    delete e.dragonTile;
    delete e.move;
    delete e.portal;
    if (extra) return;
    const host = fairyHost(c);
    if (host && host.owner === c.player && host.location.at === "feature")
      award(c, c.player, FAIRY_TURN_POINTS, "fairy.turn", host.location.pos, host.location.feature);
  },

  figureBlocked(c, pos) {
    const d = dragonPos(c);
    return !!d && samePos(d, pos);
  },

  areaScored(c, area) {
    const host = fairyHost(c);
    if (!host || host.owner === null || !area.figures.some((f) => f.id === host.id) || host.location.at !== "feature") return;
    award(c, host.owner, FAIRY_SCORE_POINTS, "fairy.feature", host.location.pos, host.location.feature);
  },
};

export const princessDragonModule: ExpansionModule = {
  id: ID,
  requires: ["base"],
  tileSets: [set],
  figures: [
    { kind: DRAGON_KIND, count: 1, neutral: true, placeableOn: [] },
    { kind: FAIRY_KIND, count: 1, neutral: true, placeableOn: [] },
  ],
  variants,
  hooks: {
    ...(engineHooks as object),

    // Dragbrickorna läggs åt sidan tills draken kommer i spel.
    setup(c) {
      const ctx = c as EngineHookContext;
      const s = ctx.state;
      const e = ext(ctx);
      const isDragon = (t: string) => !!ctx.types.get(t)?.symbols?.includes("dragon");
      e.aside = s.drawPile.filter(isDragon);
      s.drawPile = s.drawPile.filter((t) => !isDragon(t));
    },

    // Värden hoppar över (eller tar bort) den som flyttar draken: nästa spelare i tur och ordning tar över
    // hens steg, så att draken ändå flyttar sex rutor (s. 56). Gäller även den som har tur.
    skipActor(c: HookContext) {
      const ctx = c as EngineHookContext;
      const m = ext(ctx).move;
      if (!m || ctx.state.turn.phase !== DRAGON_PHASE) return false;
      const here = new Set(ctx.state.players.map((p) => p.id));
      if (here.has(m.order[m.count] as PlayerId)) m.order[m.count] = heir(m, m.count, here);
      advanceMove(ctx);
      return true;
    },

    afterTilePlaced(c, pos) {
      const ctx = c as EngineHookContext;
      const s = ctx.state;
      const placed = s.board[posKey(pos)];
      const symbols = (placed && ctx.types.get(placed.type)?.symbols) || [];
      const e = ext(ctx);
      if (symbols.includes("volcano")) {
        const dragon = dragonFig(ctx);
        if (!dragon) return;
        const first = dragon.location.at !== "tile";
        dragon.location = { at: "tile", pos: { ...pos } };
        ctx.emit({ type: "figurePlaced", figure: dragon.id, location: dragon.location });
        if (first) {
          // Draken är i spel: dragbrickorna blandas in i högen.
          for (const t of e.aside) s.drawPile.splice(randomInt(s, s.drawPile.length + 1), 0, t);
          e.aside = [];
        }
      }
      if (symbols.includes("dragon") && dragonPos(ctx)) e.dragonTile = true;
    },

    extraSteps(c, phase): Step[] {
      return optionsFor(c as EngineHookContext, phase);
    },

    applyStep(c, st) {
      const ctx = c as EngineHookContext;
      const s = ctx.state;
      const phase = s.turn.phase;
      const d = (st.data ?? {}) as ExpansionStepData;
      const ok = optionsFor(ctx, phase).find(
        (o) => o.type === "expansion" && o.action === st.action && dataMatches(o.data as ExpansionStepData, d),
      );
      if (!ok) return "error.illegalStep";
      const e = ext(ctx);
      switch (st.action) {
        case "fairy": {
          const fairy = fairyFig(ctx) as Figure;
          fairy.location = { at: "figure", figure: d.figure as string };
          ctx.emit({ type: "figurePlaced", figure: fairy.id, location: fairy.location });
          afterFigure(ctx);
          return null;
        }
        case "seduce": {
          const f = s.figures.find((x) => x.id === d.figure) as Figure;
          returnToSupply(ctx, f);
          sendOrphansHome(ctx);
          ctx.emit({ type: "expansion", expansion: ID, event: "seduce", data: { player: ctx.player, figure: f.id } });
          afterFigure(ctx);
          return null;
        }
        case "portal":
          e.portal = d.choice;
          s.turn.phase = PORTAL_PHASE;
          return null;
        case "portalPlace": {
          const fig = s.figures.find((f) => f.kind === e.portal && f.owner === ctx.player && f.location.at === "supply");
          if (!fig) return "error.noFigureLeft";
          fig.location = { at: "feature", pos: { ...(d.pos as Pos) }, feature: d.feature as string };
          delete e.portal;
          ctx.emit({ type: "figurePlaced", figure: fig.id, location: fig.location });
          afterFigure(ctx);
          return null;
        }
        case "move": {
          const m = e.move as DragonMove;
          const dragon = dragonFig(ctx) as Figure;
          const who = mover(ctx);
          const from = dragonPos(ctx) as Pos;
          const to = d.pos as Pos;
          dragon.location = { at: "tile", pos: { ...to } };
          m.visited.push({ ...to });
          m.count++;
          ctx.emit({ type: "figurePlaced", figure: dragon.id, location: dragon.location });
          ctx.emit({ type: "expansion", expansion: ID, event: "move", data: { player: who, from, to, step: m.count } });
          eat(ctx, to);
          advanceMove(ctx);
          return null;
        }
        default:
          return "error.illegalStep";
      }
    },
  } as ExpansionModule["hooks"],
};
