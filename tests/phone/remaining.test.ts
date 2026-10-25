import { expect, test } from "bun:test";
import type { ClientMessage, ServerMessage } from "../../src/shared/messages";
import { Client, type TransportFactory } from "../../src/phone/client";

test("telefonen skickar showRemaining och följer remainingShown från servern", () => {
  const sent: ClientMessage[] = [];
  let deliver: (m: ServerMessage) => void = () => {};
  const factory: TransportFactory = (h) => {
    deliver = h.message;
    return { send: (m) => void sent.push(m), close() {} };
  };
  const client = new Client(factory, {
    storage: null, search: "?g=DEV", browserLang: "sv", languages: ["en", "sv"], replaceSearch: () => {},
  });
  expect(client.getState().remainingShown).toBe(false);
  client.showRemaining(true);
  expect(sent.at(-1)).toEqual({ type: "showRemaining", on: true });
  // Läget ändras först när servern bekräftar, så att alla telefoner visar samma sak.
  expect(client.getState().remainingShown).toBe(false);
  deliver({ type: "remainingShown", on: true });
  expect(client.getState().remainingShown).toBe(true);
  deliver({ type: "remainingShown", on: false });
  expect(client.getState().remainingShown).toBe(false);
});
