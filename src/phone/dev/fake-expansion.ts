// Påhittad "server" för en expansion med egen fas ("moveMage") och steg med mål, utan att någon riktig
// expansionsmodul behövs. Spelaren (p1) väljer mål (siffror på storskärmen), pjäs eller "hoppa över",
// sedan kommer fasen "confirm" med ångra och bekräfta, och därefter börjar fasen om.
// Dev-sidan: lägg `?fake` på adressen. Används också i testerna.

import type { ClientMessage, PublicState, ServerMessage } from "../../shared/messages";
import type { Step } from "../../shared/state";
import { allTileTypes } from "../../tiles/index";
import { baseModule, createEngine } from "../../engine/index";
import type { Transport, TransportFactory } from "../client";
import { DEV_TOKEN, toPublic } from "./local-server";

export const FAKE_EXPANSION = "mage-witch" as const;

export interface FakeServer {
  factory: TransportFactory;
  /** Meddelanden som telefonen skickat. */
  received: ClientMessage[];
}

export function fakeExpansionServer(): FakeServer {
  const received: ClientMessage[] = [];
  const factory: TransportFactory = (h): Transport => {
    const engine = createEngine([baseModule], allTileTypes().values());
    const game = engine.newGame({
      expansions: ["base"], variants: {}, handSize: 1, showClosingTiles: false, seed: 3,
      players: [{ id: "p1", name: "Ada", color: "#2a6fdb" }, { id: "p2", name: "Bot", color: "#d62828" }],
    });
    const start = game.board["0,0"]!;
    const features = allTileTypes().get(start.type)!.features.map((f) => f.id);
    const f1 = features[0]!;
    const f2 = features[1] ?? f1;
    const at = { x: 0, y: 0 };
    const act = (action: string, data: unknown): Step => ({ type: "expansion", expansion: FAKE_EXPANSION, action, data });
    const moves: Step[] = [
      act("move", { pos: at, feature: f1, figure: "mage1" }),
      act("move", { pos: at, feature: f1, figure: "witch1" }),
      act("move", { pos: at, feature: f2, figure: "mage1" }),
      act("move", { pos: { x: 1, y: 0 }, figure: "mage1" }),
      act("skip", { choice: "now" }),
      act("skip", { choice: "never" }),
    ];

    let pending: Step[] = [];
    let closed = false;
    const to = (m: ServerMessage) => {
      if (!closed) h.message(m);
    };
    const pub = (): PublicState => ({
      ...toPublic(game),
      figures: [
        { id: "mage1", kind: "mage", owner: null, location: { at: "tile", pos: at } },
        { id: "witch1", kind: "witch", owner: null, location: { at: "tile", pos: { x: 0, y: 1 } } },
      ],
      turn: { ...game.turn, player: "p1", phase: pending.length ? "confirm" : "moveMage", pending },
    });
    const push = () => {
      to({ type: "state", state: pub() });
      to({ type: "hand", tiles: [] });
      to({ type: "legalSteps", steps: pending.length ? [{ type: "undo" }, { type: "confirm" }] : moves });
    };
    const seat = { player: "p1", name: "Ada", color: "#2a6fdb", connected: true, isHost: true };
    const handle = (m: ClientMessage) => {
      received.push(m);
      switch (m.type) {
        case "join":
          to({ type: "welcome", player: "p1", seatToken: DEV_TOKEN, isHost: true });
          to({
            type: "lobby", seats: [seat], gameCode: "DEV", saves: [],
            options: { expansions: ["base"], variants: {}, screenLang: "en", handSize: 1, showClosingTiles: false },
            available: { expansions: ["base"], variants: {}, languages: ["en"], maxHandSize: 1 },
          });
          break;
        case "startGame":
          push();
          break;
        case "step":
          if (m.step.type === "undo") pending = [];
          else if (m.step.type === "confirm") pending = [];
          else pending = [m.step];
          push();
          break;
        default:
          break;
      }
    };
    queueMicrotask(() => h.open());
    return { send: (m) => queueMicrotask(() => handle(m)), close: () => void (closed = true) };
  };
  return { factory, received };
}
