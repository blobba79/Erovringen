import { describe, expect, test } from "bun:test";
import { FakeConn, join, makeRoom, screen, startedRoom } from "./helpers";

describe("brickor kvar", () => {
  test("läget är av från början och slås på av vilken telefon som helst, till alla", () => {
    const { room, scr, a, b } = startedRoom();
    expect(scr.last("remainingShown")?.on).toBe(false);
    scr.clear(); a.clear(); b.clear();
    room.handle(b, { type: "showRemaining", on: true });
    for (const c of [scr, a, b]) expect(c.last("remainingShown")?.on).toBe(true);
    room.handle(a, { type: "showRemaining", on: false });
    for (const c of [scr, a, b]) expect(c.last("remainingShown")?.on).toBe(false);
  });

  test("de som ansluter senare får läget", () => {
    const { room, a } = startedRoom();
    room.handle(a, { type: "showRemaining", on: true });
    const late = screen(room);
    expect(late.last("remainingShown")?.on).toBe(true);
    const b2 = new FakeConn();
    room.handle(b2, { type: "rejoin", seatToken: a.token });
    expect(b2.last("remainingShown")?.on).toBe(true);
  });

  test("ogiltigt värde räknas som av; storskärmen kan inte skicka det", () => {
    const { room, scr, a } = startedRoom();
    room.handle(a, { type: "showRemaining", on: true });
    room.handle(a, { type: "showRemaining", on: "ja" as unknown as boolean });
    expect(scr.last("remainingShown")?.on).toBe(false);
    scr.clear();
    room.handle(scr, { type: "showRemaining", on: true });
    expect(scr.last("error")?.key).toBe("error.screenCannotSend");
  });
});

describe("avsluta", () => {
  test("godtas från storskärmen på egna datorn och sparar först", () => {
    let quits = 0;
    const { room, scr } = startedRoom({ onQuit: () => quits++ });
    room.handle(scr, { type: "quit" });
    expect(quits).toBe(1);
  });

  test("nekas från en skärm på ett annat nät och från telefoner", () => {
    let quits = 0;
    const room = makeRoom({ onQuit: () => quits++ });
    const remote = new FakeConn(false);
    room.handle(remote, { type: "helloScreen" });
    room.handle(remote, { type: "quit" });
    const p = join(room, "Anna", "red");
    room.handle(p, { type: "quit" });
    expect(quits).toBe(0);
  });
});
