import { describe, expect, test } from "bun:test";
import type { PublicState, ServerMessage } from "../../src/shared/messages";
import type { Step } from "../../src/shared/state";
import { Client, type TransportHandlers } from "../../src/phone/client";
import { chooserOf, deriveTurn } from "../../src/phone/logic/turnview";
import { devEngine, devSetup } from "../../src/screen/dev/game";
import { toPublic } from "../../src/screen/dev/game";

const base = (): PublicState => toPublic(devEngine().newGame(devSetup(3, 5)));
const withTurn = (player: string, actor?: string, phase = "placeFigure"): PublicState => {
  const s = base();
  return { ...s, turn: { ...s.turn, player, phase, pending: [], ...(actor ? { actor } : {}) } };
};

describe("turn.actor i telefonens logik", () => {
  test("chooserOf: actor om den är satt, annars den som har tur", () => {
    expect(chooserOf({ player: "p1" })).toBe("p1");
    expect(chooserOf({ player: "p1", actor: "p2" })).toBe("p2");
  });

  test("actor ser valen (mine + isActor), den som har tur gör det inte", () => {
    const s = withTurn("p1", "p2");
    const actor = deriveTurn(s, "p2", []);
    expect(actor.mine).toBe(true);
    expect(actor.isActor).toBe(true);
    const holder = deriveTurn(s, "p1", []);
    expect(holder.mine).toBe(false);
    expect(holder.isActor).toBe(false);
    const other = deriveTurn(s, "p3", []);
    expect(other.mine).toBe(false);
  });

  test("utan actor är det som vanligt, och actor lika med spelaren ger inget 'Ditt val'", () => {
    expect(deriveTurn(withTurn("p1"), "p1", [])).toMatchObject({ mine: true, isActor: false });
    expect(deriveTurn(withTurn("p1", "p1"), "p1", [])).toMatchObject({ mine: true, isActor: false });
    expect(deriveTurn(withTurn("p1"), "p2", [])).toMatchObject({ mine: false, isActor: false });
  });
});

describe("klienten hos actor", () => {
  function connect(me: string) {
    let h!: TransportHandlers;
    const client = new Client((handlers) => {
      h = handlers;
      return { send: () => {}, close: () => {} };
    }, { storage: null, search: "", languages: ["en", "sv"] });
    const feed = (m: ServerMessage) => h.message(m);
    feed({ type: "welcome", player: me, seatToken: "t", isHost: false });
    return { client, feed };
  }

  test("tur och valsteg: nonce räknas upp hos actor, legalSteps behålls, ångra bara om servern skickar det", () => {
    const { client, feed } = connect("p2");
    expect(client.getState().turnNonce).toBe(0);
    feed({ type: "state", state: withTurn("p1", "p2") });
    expect(client.getState().turnNonce).toBe(1);
    const choice: Step = { type: "expansion", expansion: "crop-circles-2", action: "choose", data: { choice: "grass" } };
    feed({ type: "legalSteps", steps: [choice] });
    expect(client.getState().legal).toEqual([choice]);
    const view = deriveTurn(client.getState().state, "p2", []);
    expect(view.mine).toBe(true);
    // ångra och bekräfta visas bara när de finns i legalSteps
    const has = (t: Step["type"]) => client.getState().legal.some((x) => x.type === t);
    expect(has("undo")).toBe(false);
    expect(has("confirm")).toBe(false);
    feed({ type: "legalSteps", steps: [choice, { type: "undo" }] });
    expect(has("undo")).toBe(true);
    expect(has("confirm")).toBe(false);
  });

  test("den som har tur får inga val medan actor väljer, och legalSteps rensas när valet går till någon annan", () => {
    const { client, feed } = connect("p1");
    feed({ type: "state", state: withTurn("p1") });
    feed({ type: "legalSteps", steps: [{ type: "confirm" }] });
    expect(client.getState().legal.length).toBe(1);
    feed({ type: "state", state: withTurn("p1", "p2") });
    expect(client.getState().legal).toEqual([]);
    expect(deriveTurn(client.getState().state, "p1", []).mine).toBe(false);
    // tillbaka till egen tur
    feed({ type: "state", state: withTurn("p1") });
    expect(client.getState().turnNonce).toBe(2);
  });
});
