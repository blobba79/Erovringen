// Hjälpmedel för servertesterna: falska anslutningar och en spelare som gör enkla drag.

import type { ClientMessage, ServerMessage } from "../../src/shared/messages";
import type { Step } from "../../src/shared/state";
import { Room, type Conn, type RoomOptions } from "../../src/server/room";

export class FakeConn implements Conn {
  readonly msgs: ServerMessage[] = [];
  closed = false;
  constructor(readonly local = false) {}
  send(msg: ServerMessage): void {
    this.msgs.push(JSON.parse(JSON.stringify(msg)));
  }
  close(): void {
    this.closed = true;
  }
  all<T extends ServerMessage["type"]>(type: T): Extract<ServerMessage, { type: T }>[] {
    return this.msgs.filter((m) => m.type === type) as Extract<ServerMessage, { type: T }>[];
  }
  last<T extends ServerMessage["type"]>(type: T): Extract<ServerMessage, { type: T }> | undefined {
    return this.all(type).at(-1);
  }
  clear(): void {
    this.msgs.length = 0;
  }
  get token(): string {
    return this.last("welcome")!.seatToken;
  }
  get player(): string {
    return this.last("welcome")!.player;
  }
}

export function makeRoom(opts: RoomOptions = {}): Room {
  return new Room({ gameCode: "testkod", seed: () => 12345, ...opts });
}

export function join(room: Room, name: string, color: string): FakeConn {
  const c = new FakeConn();
  const msg: ClientMessage = { type: "join", gameCode: room.gameCode, name, color, lang: "sv" };
  room.handle(c, msg);
  return c;
}

export function screen(room: Room): FakeConn {
  const c = new FakeConn(true);
  room.handle(c, { type: "helloScreen" });
  return c;
}

/** Rum med två spelare och en storskärm, redan startat med grundspelet. */
export function startedRoom(opts: RoomOptions = {}) {
  const room = makeRoom(opts);
  const scr = screen(room);
  const a = join(room, "Anna", "red");
  const b = join(room, "Bo", "blue");
  room.handle(a, { type: "startGame" });
  const byPlayer = (id: string) => (a.player === id ? a : b);
  return { room, scr, a, b, byPlayer, active: () => byPlayer(room.state!.turn.player) };
}

/** Väljer första tillåtna delsteg i ordningen bricka, plats, ingen pjäs, bekräfta. */
export function pickStep(steps: Step[]): Step | undefined {
  for (const t of ["chooseTile", "placeTile", "noFigure", "confirm"]) {
    const s = steps.find((x) => x.type === t);
    if (s) return s;
  }
  return undefined;
}

/** Spelar en hel tur för den aktiva spelaren. */
export function playTurn(room: Room, byPlayer: (id: string) => FakeConn): void {
  const before = room.state!.turn.player;
  for (let i = 0; i < 10 && room.state!.turn.player === before && !room.state!.finished; i++) {
    const conn = byPlayer(room.state!.turn.player);
    const steps = conn.last("legalSteps")!.steps;
    const step = pickStep(steps);
    if (!step) throw new Error("inga delsteg");
    room.handle(conn, { type: "step", step });
  }
}
