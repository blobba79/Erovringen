import { describe, expect, test } from "bun:test";
import { MAX_REPLAY_MS, ReplayPlayer, buildReplay, landingLook, replayView, shownScore } from "../../src/screen/replay";
import { ReactionBoard, REACTION_MS } from "../../src/screen/reactions";
import { axisTicks, reasonRows, recordMarks, scoreChart } from "../../src/screen/stats";
import { initialModel, keepShownTile, reduce } from "../../src/screen/store";
import { devEngine, devSetup, fakeStats, randomStep, toPublic } from "../../src/screen/dev/game";
import { makeRng } from "../players/random-player";
import type { GameEvent } from "../../src/shared/state";
import type { GameStats } from "../../src/shared/messages";

const tile = { type: "T", pos: { x: 1, y: 2 }, rotation: 0 as const };
const move: GameEvent[] = [
  { type: "turnStarted", player: "p1" },
  { type: "tilePlaced", tile, player: "p1" },
  { type: "figurePlaced", figure: "f1", location: { at: "feature", pos: tile.pos, feature: "city" } },
  { type: "featureCompleted", pos: tile.pos, feature: "city" },
  { type: "scored", player: "p2", points: 8, reason: "city", pos: tile.pos },
  { type: "figureReturned", figure: "f9" },
];

describe("repris", () => {
  test("bygger en tidslinje i händelsernas ordning och hoppar över det som inte syns", () => {
    const r = buildReplay(move)!;
    expect(r.steps.map((s) => s.kind)).toEqual(["tile", "figurePlaced", "score", "figureReturned"]);
    for (let i = 1; i < r.steps.length; i++) expect(r.steps[i]!.start).toBeCloseTo(r.steps[i - 1]!.end);
    expect(buildReplay([{ type: "turnStarted", player: "p1" }, { type: "tileDrawn", player: "p1" }])).toBeUndefined();
  });

  test("är kort: längre repriser pressas ihop till högst gränsen", () => {
    const many: GameEvent[] = Array.from({ length: 30 }, (_, i) => ({ type: "scored", player: "p1", points: 1, reason: "city" }) as GameEvent);
    const r = buildReplay(many)!;
    expect(r.duration).toBeLessThanOrEqual(MAX_REPLAY_MS + 1e-6);
    expect(buildReplay(move)!.duration).toBeLessThanOrEqual(MAX_REPLAY_MS);
  });

  test("brickan landar först, poängen tickar upp och slutar på slutvärdet", () => {
    const r = buildReplay(move)!;
    const at0 = replayView(r, 1);
    expect(at0.landing?.tile).toEqual(tile);
    expect(at0.pending.p2).toBe(8);
    expect(shownScore(20, at0, "p2")).toBe(12);
    const scoreStep = r.steps.find((s) => s.kind === "score")!;
    const mid = replayView(r, (scoreStep.start + scoreStep.end) / 2);
    expect(mid.gaining.p2).toBe(8);
    expect(mid.pops).toHaveLength(1);
    expect(mid.pending.p2).toBe(4);
    const end = replayView(r, r.duration + 1);
    expect(end.pending.p2).toBeUndefined();
    expect(shownScore(20, end, "p2")).toBe(20);
    expect(shownScore(20, undefined, "p2")).toBe(20);
    expect(shownScore(3, at0, "p2")).toBe(0);
  });

  test("pjäser ställs ut och tas tillbaka under sina steg", () => {
    const r = buildReplay(move)!;
    const placed = r.steps[1]!;
    expect(replayView(r, placed.start + 1).figures).toEqual([{ figure: "f1", mode: "placed", progress: expect.any(Number) }]);
    const back = r.steps[3]!;
    expect(replayView(r, back.start + 1).figures[0]?.mode).toBe("returned");
  });

  test("en ny händelse mitt i reprisen hoppar den gamla till slutläget och startar den nya", () => {
    const p = new ReplayPlayer();
    p.push(move, 1000);
    expect(p.view(1100)?.landing).toBeDefined();
    p.push([{ type: "scored", player: "p1", points: 3, reason: "road", pos: tile.pos }], 1200);
    const v = p.view(1210)!;
    expect(v.landing).toBeUndefined();
    expect(v.pending.p2).toBeUndefined();
    expect(v.pending.p1).toBe(3);
    expect(p.view(1200 + 10000)).toBeUndefined();
    expect(p.active).toBe(false);
  });

  test("ett drag utan något att visa avslutar pågående repris", () => {
    const p = new ReplayPlayer();
    p.push(move, 0);
    expect(p.push([{ type: "turnStarted", player: "p2" }], 100)).toBe(false);
    expect(p.view(110)).toBeUndefined();
  });

  test("landningen börjar stor och genomskinlig och slutar på plats", () => {
    expect(landingLook(0).scale).toBeGreaterThan(1.5);
    expect(landingLook(0).alpha).toBeLessThan(0.5);
    expect(landingLook(1)).toEqual({ scale: 1, alpha: 1 });
  });

  test("reprisen av ett riktigt drag från motorn har en bricka och går ihop", () => {
    const eng = devEngine();
    let s = eng.newGame(devSetup());
    const rnd = makeRng(5);
    for (let n = 0; n < 40; n++) {
      const mv = randomStep(eng, s, rnd)!;
      const r = eng.apply(s, mv.player, mv.step);
      if (!r.ok) break;
      s = r.state;
      if (mv.step.type === "confirm") {
        const rep = buildReplay(r.events)!;
        expect(rep.steps.filter((x) => x.kind === "tile")).toHaveLength(1);
        expect(rep.duration).toBeLessThanOrEqual(MAX_REPLAY_MS);
      }
    }
  });
});

describe("snabbreaktioner", () => {
  test("visas kort, ersätter förra och försvinner", () => {
    const b = new ReactionBoard();
    b.push("p1", "A", 0);
    b.push("p2", "B", 1000);
    expect(b.active(10)).toEqual({ p1: "A", p2: "B" });
    b.push("p1", "C", 2000);
    expect(b.active(REACTION_MS + 500)).toEqual({ p1: "C", p2: "B" });
    expect(b.active(REACTION_MS + 1500)).toEqual({ p1: "C" });
    expect(b.active(REACTION_MS + 2500)).toEqual({});
  });
});

describe("visa för alla", () => {
  const pub = (turn: string, finished = false) => ({ ...toPublic(devEngine().newGame(devSetup())), finished, turn: { player: turn, phase: "placeTile", pending: [] } });
  test("ligger kvar under turen och tas bort när turen byter eller spelet slutar", () => {
    const shown = { player: "p1", tile: "T" };
    expect(keepShownTile(shown, pub("p1"))).toEqual(shown);
    expect(keepShownTile(shown, pub("p2"))).toBeUndefined();
    expect(keepShownTile(shown, pub("p1", true))).toBeUndefined();
  });
  test("modellen tar emot, och ett bekräftat drag tar bort den", () => {
    let m = reduce(initialModel, { type: "shownTile", player: "p1", tile: "T" });
    expect(m.shownTile).toEqual({ player: "p1", tile: "T" });
    m = reduce(m, { type: "events", events: [{ type: "scored", player: "p1", points: 1, reason: "x" }] });
    expect(m.shownTile).toBeDefined();
    m = reduce(m, { type: "events", events: move });
    expect(m.shownTile).toBeUndefined();
    expect(m.events?.seq).toBe(2);
  });
  test("reaktion och statistik hamnar i modellen, och förra pjäserna sparas", () => {
    const s0 = toPublic(devEngine().newGame(devSetup()));
    let m = reduce(initialModel, { type: "state", state: s0 });
    m = reduce(m, { type: "state", state: { ...s0, figures: [{ id: "f", kind: "meeple", owner: "p1", location: { at: "supply" } }] } });
    expect(m.prevFigures).toEqual(s0.figures);
    m = reduce(m, { type: "reaction", player: "p1", emoji: "X" });
    expect(m.reaction).toEqual({ seq: 1, player: "p1", emoji: "X" });
    const st = fakeStats(devEngine().newGame(devSetup()), makeRng(1));
    expect(reduce(m, { type: "stats", stats: st }).stats).toBe(st);
  });
});

describe("statistik", () => {
  const stats: GameStats = {
    scoreTimeline: [{ a: 0, b: 0 }, { a: 4, b: 0 }, { a: 4, b: 10 }, { a: 20, b: 10 }],
    pointsByReason: { a: { city: 14, road: 6 }, b: { city: 10, "final.farm": 0 } },
    records: [{ key: "stats.x", player: "a", value: 3, pos: { x: 1, y: 1 } }, { key: "stats.y", player: null, value: 1 }],
    turns: 3,
    durationSeconds: 60,
  };
  test("poängkurvan har en linje per spelare, från vänster till höger och uppåt", () => {
    const c = scoreChart(stats, ["a", "b"], 300, 100);
    expect(c.turns).toBe(3);
    expect(c.maxScore).toBe(20);
    const a = c.lines[0]!;
    expect(a.points.map((p) => p.x)).toEqual([0, 100, 200, 300]);
    expect(a.points.map((p) => p.y)).toEqual([100, 80, 80, 0]);
    expect(a.path.startsWith("M0.0,100.0 L100.0,80.0")).toBe(true);
    expect(c.lines[1]!.points[2]!.y).toBe(50);
  });
  test("tom statistik kraschar inte", () => {
    const c = scoreChart({ scoreTimeline: [] }, ["a"], 100, 50);
    expect(c.lines[0]!.points).toEqual([]);
    expect(scoreChart({ scoreTimeline: [{ a: 0 }] }, ["a"], 100, 50).lines[0]!.points[0]!.x).toBe(0);
  });
  test("skalstreck och poäng per orsak", () => {
    expect(axisTicks(20)).toEqual([0, 5, 10, 15, 20]);
    expect(axisTicks(10)[0]).toBe(0);
    const rows = reasonRows(stats, ["a", "b"]);
    expect(rows.map((r) => r.reason)).toEqual(["city", "road"]);
    expect(rows[0]!.values).toEqual([14, 10]);
  });
  test("rekord med plats markeras på kartan", () => {
    expect(recordMarks(stats)).toEqual([{ x: 1, y: 1 }]);
  });
});

describe("lobbyn", () => {
  test("sparade spel följer med i modellen", () => {
    const save = { id: "g", savedAt: "2026-01-01T00:00:00Z", players: [], expansions: [], tilesPlaced: 5, readable: true };
    const m = reduce(initialModel, {
      type: "lobby", seats: [], gameCode: "x", saves: [save],
      options: { expansions: ["base"], variants: {}, screenLang: "en", handSize: 1, showClosingTiles: false, savedGame: "g" },
      available: { expansions: ["base"], variants: {}, languages: ["en"], maxHandSize: 8 },
    });
    expect(m.lobby?.saves).toEqual([save]);
    expect(m.lobby?.options.savedGame).toBe("g");
  });
});
