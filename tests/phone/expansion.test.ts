import { describe, expect, test } from "bun:test";
import type { ExpansionId } from "../../src/shared/tiles";
import type { Preview } from "../../src/shared/messages";
import type { GameState, Step } from "../../src/shared/state";
import type { EngineApi } from "../../src/engine/index";
import { Client } from "../../src/phone/client";
import { fakeExpansionServer, FAKE_EXPANSION } from "../../src/phone/dev/fake-expansion";
import { expansionView, previewTargets, targetsKey } from "../../src/phone/logic/expansion";
import { helpKeys } from "../../src/phone/logic/help";
import { chooseBotStep } from "../../src/server/bot";

const ex = (expansion: ExpansionId, action: string, data: unknown): Step => ({ type: "expansion", expansion, action, data });

describe("expansionsstegen grupperas och numreras", () => {
  const steps: Step[] = [
    { type: "undo" },
    ex("mage-witch", "move", { pos: { x: 2, y: 1 }, feature: "c", figure: "m" }),
    ex("mage-witch", "move", { pos: { x: 0, y: 1 }, figure: "m" }),
    ex("mage-witch", "move", { pos: { x: 0, y: 1 }, figure: "w" }),
    ex("mage-witch", "skip", { choice: "now" }),
    ex("gold-mines", "place", { pos: { x: 5, y: 0 } }),
    ex("gold-mines", "pass", {}),
    ex("gold-mines", "odd", "inte ett objekt"),
  ];
  const v = expansionView(steps);

  test("en grupp per expansion och handling med rubrik step.<expansion>.<action>", () => {
    expect(v.groups.map((g) => g.titleKey)).toEqual([
      "step.mage-witch.move", "step.mage-witch.skip", "step.gold-mines.place", "step.gold-mines.pass", "step.gold-mines.odd",
    ]);
  });

  test("målen sorteras på y, x och område och numreras från 1; flera steg på samma mål delar siffra", () => {
    expect(v.targets.map((t) => [t.n, t.pos.x, t.pos.y, t.feature ?? null, t.steps.length])).toEqual([
      [1, 5, 0, null, 1],
      [2, 0, 1, null, 2],
      [3, 2, 1, "c", 1],
    ]);
    expect(v.groups[0]!.targetNs).toEqual([2, 3]);
    expect(v.groups[2]!.targetNs).toEqual([1]);
  });

  test("steg utan mål blir knappar med text step.<expansion>.<action>.<choice>, annars gruppens rubrik", () => {
    expect(v.groups[1]!.buttons.map((b) => b.textKey)).toEqual(["step.mage-witch.skip.now"]);
    expect(v.groups[3]!.buttons.map((b) => b.textKey)).toEqual(["step.gold-mines.pass"]);
    expect(v.groups[4]!.buttons).toHaveLength(1);
  });

  test("Preview.targets ger målen i nummerordning, med område bara när steget har ett", () => {
    expect(previewTargets(v)).toEqual([{ pos: { x: 5, y: 0 } }, { pos: { x: 0, y: 1 } }, { pos: { x: 2, y: 1 }, feature: "c" }]);
    expect(targetsKey(expansionView([{ type: "undo" }]))).toBe("");
  });

  test("ordningen beror inte på i vilken ordning stegen kommer", () => {
    const a = expansionView([...steps].reverse());
    expect(previewTargets(a)).toEqual(previewTargets(v));
  });

  test("hjälptexten för en okänd fas blir den allmänna", () => {
    expect(helpKeys("moveMage", ["base"], () => false).phase).toBe("help.phase.other");
  });
});

async function until(cond: () => boolean, what: string, ms = 2000): Promise<void> {
  const t0 = Date.now();
  while (!cond()) {
    if (Date.now() - t0 > ms) throw new Error(`timeout: ${what}`);
    await new Promise((r) => setTimeout(r, 1));
  }
}

async function startFake() {
  const fake = fakeExpansionServer();
  const client = new Client(fake.factory, { storage: null, search: "?g=DEV", languages: ["en"] });
  await until(() => client.getState().conn === "open", "ansluten");
  client.join("Ada", "#2a6fdb");
  await until(() => client.getState().joined, "welcome");
  client.startGame();
  await until(() => client.getState().legal.length > 0, "steg");
  return { fake, client };
}

const previews = (m: { received: { type: string }[] }) =>
  m.received.flatMap((x) => (x.type === "preview" ? [(x as unknown as { preview: Preview }).preview] : []));

describe("telefonen mot en påhittad expansion med egen fas", () => {
  test("målen skickas som Preview.targets en gång och knapparna följer stegen", async () => {
    const { fake, client } = await startFake();
    expect(client.getState().state!.turn.phase).toBe("moveMage");
    await until(() => previews(fake).length > 0, "förhandsvisning");
    expect(previews(fake)).toEqual([
      { targets: [{ pos: { x: 0, y: 0 }, feature: expect.any(String) }, { pos: { x: 0, y: 0 }, feature: expect.any(String) }, { pos: { x: 1, y: 0 } }] },
    ]);
  });

  test("ett mål med flera pjäser kräver ett val, ett mål med ett steg görs direkt, och det går att ångra", async () => {
    const { fake, client } = await startFake();
    client.pickTarget(1);
    expect(client.getState().target).toBe(1);
    expect(fake.received.some((m) => m.type === "step")).toBe(false);

    client.pickTarget(3);
    await until(() => client.getState().state!.turn.phase === "confirm", "steg gjort");
    const sent = fake.received.filter((m) => m.type === "step");
    expect(sent).toHaveLength(1);
    expect(sent[0]).toMatchObject({ step: { type: "expansion", expansion: FAKE_EXPANSION, action: "move", data: { pos: { x: 1, y: 0 }, figure: "mage1" } } });
    expect(client.getState().target).toBeNull();
    expect(client.getState().legal.map((s) => s.type)).toEqual(["undo", "confirm"]);

    client.step({ type: "undo" });
    await until(() => client.getState().state!.turn.phase === "moveMage", "ångrat");
    await until(() => expansionView(client.getState().legal).targets.length === 3, "målen tillbaka");
    // förhandsvisningen skickas igen efter ångra, eftersom servern glömt den
    await until(() => previews(fake).length === 2, "ny förhandsvisning");
  });

  test("ett steg utan mål (val) skickas som det är", async () => {
    const { fake, client } = await startFake();
    const skip = expansionView(client.getState().legal).groups.find((g) => g.action === "skip")!;
    client.step(skip.buttons[0]!.step);
    await until(() => client.getState().state!.turn.phase === "confirm", "steg gjort");
    expect(fake.received.filter((m) => m.type === "step")[0]).toMatchObject({ step: { action: "skip", data: { choice: "now" } } });
  });
});

describe("datorspelaren i en okänd fas", () => {
  test("kommer vidare genom en expansions egen fas till bekräftelsen", () => {
    const own = ex("ferries", "go", { pos: { x: 1, y: 1 } });
    let phase = "own";
    const state = (): GameState => ({ turn: { player: "p1", phase, pending: [] }, finished: false, players: [{ id: "p1", score: 0 }], figures: [], drawPile: [] }) as unknown as GameState;
    const eng = {
      legalSteps: () => (phase === "own" ? [{ type: "undo" }, own, ex("ferries", "go", { pos: { x: 2, y: 1 } })] : [{ type: "undo" }, { type: "confirm" }]),
      apply: (_s: unknown, _p: string, step: Step) => {
        const before = phase;
        if (step.type === "expansion") phase = "confirm";
        const r = { ok: true as const, state: state(), events: [] };
        phase = before;
        return r;
      },
      analyze: () => ({ areas: [] }),
    } as unknown as EngineApi;
    const step = chooseBotStep(eng, state(), () => 0.5);
    expect(step.type).toBe("expansion");
    phase = "confirm";
    expect(chooseBotStep(eng, state()).type).toBe("confirm");
  });
});
