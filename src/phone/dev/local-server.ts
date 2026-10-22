// Lokal "server" för att prova telefonvyn utan riktig server: kör motorn i webbläsaren
// (eller i ett test), har en spelare (värden) och en dator som spelar slumpmässigt.

import type { ClientMessage, LobbySeat, PublicState, ServerMessage, StartOptions } from "../../shared/messages";
import type { GameState, Step } from "../../shared/state";
import { allTileTypes } from "../../tiles/index";
import { baseModule, createEngine, type EngineApi } from "../../engine/index";
import { riverModule } from "../../expansions/river/index";
import { abbotModule } from "../../expansions/abbot/index";
import type { Transport, TransportFactory } from "../client";

export const DEV_TOKEN = "dev-seat-token";
const ME = "p1";
const BOT = "p2";

export interface LocalServerOptions {
  /** Väntetid mellan datorspelarens delsteg (ms). */
  botDelayMs?: number;
  seed?: number;
  options?: Partial<StartOptions>;
}

export function toPublic(state: GameState): PublicState {
  const { rng: _rng, drawPile, players, ...rest } = state;
  const remaining: Record<string, number> = {};
  for (const t of drawPile) remaining[t] = (remaining[t] ?? 0) + 1;
  return {
    ...rest,
    players: players.map(({ hand, ...p }) => ({ ...p, handCount: hand.length })),
    drawPileCount: drawPile.length,
    remaining,
  };
}

export function localServer(opts: LocalServerOptions = {}): TransportFactory {
  return (h): Transport => {
    const engine: EngineApi = createEngine([baseModule, riverModule, abbotModule], allTileTypes().values());
    let options: StartOptions = {
      expansions: ["base"],
      variants: {},
      screenLang: "en",
      handSize: 1,
      showClosingTiles: false,
      ...opts.options,
    };
    let seats: LobbySeat[] = [];
    let game: GameState | null = null;
    let closed = false;
    const to = (m: ServerMessage) => {
      if (!closed) h.message(m);
    };

    const lobby = () => to({ type: "lobby", seats, options, gameCode: "DEV" });
    const pushState = () => {
      if (!game) return;
      to({ type: "state", state: toPublic(game) });
      to({ type: "hand", tiles: game.players.find((p) => p.id === ME)?.hand ?? [] });
      if (game.turn.player === ME && !game.finished) to({ type: "legalSteps", steps: engine.legalSteps(game) });
    };

    const botPlay = () => {
      if (closed || !game || game.finished || game.turn.player !== BOT) return;
      const steps = engine.legalSteps(game).filter((s) => s.type !== "undo");
      const confirm = steps.find((s) => s.type === "confirm");
      const pick: Step | undefined = confirm ?? steps[Math.floor(Math.random() * steps.length)];
      if (!pick) return;
      const r = engine.apply(game, BOT, pick);
      if (!r.ok) return;
      game = r.state;
      if (game.turn.player !== BOT) pushState();
      else to({ type: "state", state: toPublic(game) });
      setTimeout(botPlay, opts.botDelayMs ?? 0);
    };

    const apply = (step: Step) => {
      if (!game) return;
      const r = engine.apply(game, ME, step);
      if (!r.ok) {
        to({ type: "error", key: r.error, ...(r.params ? { params: r.params } : {}) });
        return;
      }
      game = r.state;
      pushState();
      if (game.turn.player === BOT) setTimeout(botPlay, opts.botDelayMs ?? 0);
    };

    const handle = (m: ClientMessage) => {
      switch (m.type) {
        case "join":
          seats = [
            { player: ME, name: m.name, color: m.color, connected: true, isHost: true },
            { player: BOT, name: "Bot", color: m.color === "#2a6fdb" ? "#d62828" : "#2a6fdb", connected: true, isHost: false },
          ];
          to({ type: "welcome", player: ME, seatToken: DEV_TOKEN, isHost: true });
          lobby();
          break;
        case "rejoin":
          if (m.seatToken !== DEV_TOKEN || seats.length === 0) {
            to({ type: "error", key: "error.unknownSeat" });
            break;
          }
          to({ type: "welcome", player: ME, seatToken: DEV_TOKEN, isHost: true });
          lobby();
          pushState();
          break;
        case "setOptions":
          options = m.options;
          lobby();
          break;
        case "startGame": {
          const setup = {
            expansions: options.expansions,
            variants: options.variants,
            handSize: options.handSize,
            showClosingTiles: options.showClosingTiles,
            players: seats.map((s) => ({ id: s.player, name: s.name, color: s.color })),
            seed: opts.seed ?? Math.floor(Math.random() * 2 ** 31),
          };
          game = engine.newGame(setup);
          pushState();
          if (game.turn.player === BOT) setTimeout(botPlay, opts.botDelayMs ?? 0);
          break;
        }
        case "step":
          apply(m.step);
          break;
        default:
          break; // preview, map, inspect, showToAll, hostAction: ingen storskärm här
      }
    };

    queueMicrotask(() => h.open());
    return {
      send: (m) => queueMicrotask(() => handle(m)),
      close: () => {
        closed = true;
      },
    };
  };
}
