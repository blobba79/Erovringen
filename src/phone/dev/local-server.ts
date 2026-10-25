// Lokal "server" för att prova telefonvyn utan riktig server: kör motorn i webbläsaren
// (eller i ett test), har en spelare (värden) och en dator som spelar slumpmässigt.

import type { AvailableOptions, ClientMessage, LobbySeat, PublicState, SavedGameInfo, ServerMessage, StartOptions, Warning } from "../../shared/messages";
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

const AVAILABLE: AvailableOptions = {
  expansions: ["base", "river", "abbot"],
  variants: { river: riverModule.variants, abbot: abbotModule.variants },
  languages: ["en", "sv"],
  maxHandSize: 5,
};
const SAVES: SavedGameInfo[] = [
  {
    id: "dev-1", savedAt: "2026-10-01T18:30:00Z", expansions: ["base"], tilesPlaced: 31, readable: true,
    players: [{ name: "Ada", color: "#2a6fdb", score: 42 }, { name: "Bot", color: "#d62828", score: 37 }],
  },
  { id: "dev-2", savedAt: "2026-09-01T10:00:00Z", expansions: ["base"], tilesPlaced: 5, readable: false, players: [] },
];

export function toPublic(state: GameState): PublicState {
  const { rng: _rng, drawPile, players, ...rest } = state;
  const remaining: Record<string, number> = {};
  for (const t of drawPile) remaining[t] = (remaining[t] ?? 0) + 1;
  return {
    ...rest,
    players: players.map(({ hand, ...p }) => ({
      ...p,
      // ?counters i adressen: provräknare för att mäta var de får plats.
      counters: typeof location !== "undefined" && location.search.includes("counters")
        ? { "goods.wine": 2, "goods.grain": 1, "goods.cloth": 3, gold: 4 }
        : p.counters,
      handCount: hand.length,
    })),
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

    const lobby = () => to({ type: "lobby", seats, options, gameCode: "DEV", available: AVAILABLE, saves: SAVES });
    const pushState = () => {
      if (!game) return;
      to({ type: "state", state: toPublic(game) });
      to({ type: "hand", tiles: game.players.find((p) => p.id === ME)?.hand ?? [] });
      if (game.turn.player === ME && !game.finished) to({ type: "legalSteps", steps: engine.legalSteps(game) });
      sendWarnings();
      if (game.finished) {
        to({
          type: "stats",
          stats: {
            scoreTimeline: [], pointsByReason: {}, turns: 0, durationSeconds: 0,
            records: [{ key: "stats.biggestCity", player: ME, value: 6 }],
          },
        });
      }
    };
    // Provvarning för dev-sidan: varje gång det är min tur i placeringssteget.
    let warningsOn = false;
    const sendWarnings = () => {
      const list: Warning[] =
        warningsOn && game && !game.finished && game.turn.player === ME && game.turn.phase === "placeTile"
          ? [{ key: "warning.cityBlocked" }]
          : [];
      to({ type: "warnings", warnings: list });
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
        case "setWarnings":
          warningsOn = m.on;
          sendWarnings();
          break;
        case "showRemaining":
          to({ type: "remainingShown", on: m.on });
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
