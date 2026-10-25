// Värdens ingrepp mitt i en tur (hoppa över eller ta bort den som väljer, `turn.actor`) som delsteg i turen.
// Stegen har expansionen "base" och läggs i `turn.pending` som alla andra, så att omspelningen från
// ögonblicksbilden (ångra, bekräfta, sparade spel) ger samma tillstånd. De kommer bara från servern.

import type { GameEvent, GameState, PlayerId, Step } from "../shared/state";
import { actorOf, activeModules, engineHook, makeCtx, type Env } from "./context";
import { returnToSupply } from "./scoring";
import { returnTiles } from "./turn";

/** Hoppa över den som ska välja: modulen som äger fasen går vidare till nästa som väljer, eller till nästa fas. */
export const HOST_SKIP = "skipActor";
/** Ta bort en spelare ur spelet (`data.choice` = spelarens id); är hen den som väljer hoppas valet över. */
export const HOST_REMOVE = "removePlayer";

export const isHostStep = (s: Step): boolean => s.type === "expansion" && s.expansion === "base";

export const skipActorStep = (): Step => ({ type: "expansion", expansion: "base", action: HOST_SKIP, data: {} });
export const removePlayerStep = (player: PlayerId): Step => ({
  type: "expansion", expansion: "base", action: HOST_REMOVE, data: { choice: player },
});

/** Anropar modulernas `skipActor` tills någon har hanterat det. Sant om någon gjorde det. */
function skipActor(env: Env, state: GameState, events: GameEvent[]): boolean {
  const ctx = makeCtx(env, state, state.turn.player, events);
  for (const m of activeModules(env, state.setup)) if (engineHook(m, "skipActor")?.(ctx) === true) return true;
  return false;
}

/** Utför ett värdsteg på ett (redan klonat) tillstånd. Returnerar en feltext-nyckel, eller null. */
export function applyHostStep(
  env: Env, state: GameState, step: Extract<Step, { type: "expansion" }>, events: GameEvent[],
): string | null {
  if (step.action === HOST_SKIP) {
    if (!skipActor(env, state, events)) return "error.illegalStep";
  } else if (step.action === HOST_REMOVE) {
    const id = (step.data as { choice?: unknown } | null)?.choice;
    const idx = state.players.findIndex((p) => p.id === id);
    if (typeof id !== "string" || idx < 0 || id === state.turn.player || state.players.length <= 1) return "error.illegalStep";
    const wasActor = actorOf(state) === id;
    returnTiles(env, state, state.players[idx]!.hand.splice(0));
    state.players.splice(idx, 1);
    state.setup.players = state.setup.players.filter((x) => x.id !== id);
    // Via returnToSupply, så att fen som stod intill en av pjäserna blir kvar på rutan och fortsätter spärra den.
    const ctx = makeCtx(env, state, state.turn.player, events);
    for (const f of state.figures.filter((x) => x.owner === id && x.location.at !== "supply")) returnToSupply(ctx, f);
    state.figures = state.figures.filter((f) => f.owner !== id);
    if (wasActor && !skipActor(env, state, events)) delete state.turn.actor;
  } else return "error.illegalStep";
  state.turn.pending.push(step);
  return null;
}
