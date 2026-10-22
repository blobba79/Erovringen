// Spelrummet: lobby, platser, startval, spelet (servern är enda sanningen), kameran och
// återanslutning. Rummet känner inte till sockets: det talar med `Conn`, så att allt går att testa
// utan nätverk.

import type {
  ClientMessage, GameStats, HostAction, LobbySeat, MapControl, Preview, SavedGameInfo, ServerMessage, StartOptions, Warning,
} from "../shared/messages";
import type { GameEvent, GameState, PlayerId, Pos, Step } from "../shared/state";
import type { ExpansionModule } from "../shared/expansion";
import { STATE_VERSION, shuffle, stepWarnings as engineStepWarnings } from "../engine/index";
import type { EngineApi } from "../engine/index";
import { baseExt } from "../engine/context";
import { finishTurn } from "../engine/turn";
import { currentTile } from "../engine/turnstate";
import { applyControl, fitAll, initialCamera, type Camera } from "./camera";
import { inspectAt } from "./inspect";
import { nullLogger, type Logger } from "./log";
import { MODULES, availableOptions, createGameEngine } from "./modules";
import { loadOptions, sanitizeOptions, saveOptions } from "./options";
import { toPublicState } from "./publicState";
import { SAVE_VERSION, isSafeId, listSaves, newSaveId, readSave, writeSave, type SaveFile } from "./saves";
import { StatsTracker } from "./stats";

/** Emojis som får skickas som snabbreaktioner. */
export const ALLOWED_EMOJIS = ["👍", "👏", "😂", "😮", "😢", "😡", "🎉", "🤔", "❤️", "🔥", "🙈", "😴"];
/** Högst så många reaktioner per spelare under `REACTION_WINDOW_MS`. */
export const REACTION_LIMIT = 3;
export const REACTION_WINDOW_MS = 1000;

/** En anslutning (socket) sett från rummet. */
export interface Conn {
  send(msg: ServerMessage): void;
  close?(): void;
  /** Kommer anslutningen från den egna datorn? Bara då godtas storskärmen. */
  readonly local: boolean;
}

export interface RoomOptions {
  engine?: EngineApi;
  modules?: ExpansionModule[];
  logger?: Logger;
  /** Mappen `sparade/` för startvalen; utelämnad = ingen sparning. */
  savedDir?: string;
  /** Slumpfrö för ett nytt spel. */
  seed?: () => number;
  gameCode?: string;
  minPlayers?: number;
  maxPlayers?: number;
  /** Minsta tid mellan kamerameddelanden, i ms (standard 33 = ca 30/s). */
  cameraIntervalMs?: number;
  /** Adressen spelarna når servern på, t.ex. "http://192.168.1.5:8765". */
  baseUrl?: string;
  /** Klocka i ms, utbytbar i tester (speltid och reaktionstakt). */
  now?: () => number;
  /** Varningar för nybörjare; standard är motorns `stepWarnings`. Utbytbar i tester. */
  stepWarnings?: (state: GameState, player: PlayerId) => Warning[];
}

interface Seat {
  player: PlayerId;
  name: string;
  color: string;
  lang: string;
  token: string;
  conn: Conn | null;
  isHost: boolean;
  /** Plats från ett valt sparat spel som ingen tagit ännu. */
  reserved?: boolean;
  /** Har spelaren slagit på varningar för nybörjare? */
  warnings?: boolean;
  reactionTimes?: number[];
}

type SavedPlayer = SaveFile["setup"]["players"][number];

type Binding = { kind: "screen" } | { kind: "seat"; seat: Seat };

const ROTATIONS = [0, 90, 180, 270];
const hex = (n: number) => [...crypto.getRandomValues(new Uint8Array(n))].map((b) => b.toString(16).padStart(2, "0")).join("");

export class Room {
  readonly gameCode: string;
  phase: "lobby" | "playing" = "lobby";
  options: StartOptions;
  state: GameState | null = null;
  readonly seats: Seat[] = [];
  camera: Camera = initialCamera();

  private readonly engine: EngineApi;
  private readonly modules: ExpansionModule[];
  private readonly log: Logger;
  private readonly savedDir: string | undefined;
  private readonly opts: RoomOptions;
  private readonly bindings = new Map<Conn, Binding>();
  private baseUrl: string;
  private nextId = 0;
  private preview: { player: PlayerId; preview: Preview } | null = null;
  private lastCameraSent = 0;
  private cameraTimer: ReturnType<typeof setTimeout> | null = null;
  private readonly now: () => number;
  private readonly known: Set<string>;
  private saves: SavedGameInfo[] = [];
  /** Valt sparat spel i lobbyn. */
  private pendingSave: { id: string; file: SaveFile } | null = null;
  private saveId: string | null = null;
  private stepLog: { player: PlayerId; step: Step }[] = [];
  /** false när spelet inte längre går att spela om från `stepLog` (överhopp, bortplockad spelare, återställt från ögonblicksbild). */
  private stepLogOk = true;
  private tracker: StatsTracker | null = null;
  private elapsedBefore = 0;
  private startedAt = 0;
  private endedAt: number | null = null;
  private statsMsg: GameStats | null = null;
  private shown: { player: PlayerId; tile: string } | null = null;

  constructor(opts: RoomOptions = {}) {
    this.opts = opts;
    this.modules = opts.modules ?? MODULES;
    this.engine = opts.engine ?? createGameEngine(this.modules);
    this.log = opts.logger ?? nullLogger;
    this.savedDir = opts.savedDir;
    this.gameCode = opts.gameCode ?? hex(8);
    this.baseUrl = opts.baseUrl ?? "";
    this.options = loadOptions(this.savedDir, this.modules);
    this.now = opts.now ?? Date.now;
    this.known = new Set(this.modules.map((m) => m.id));
    this.refreshSaves();
  }

  private refreshSaves(): void {
    this.saves = listSaves(this.savedDir, STATE_VERSION, this.known);
  }

  private warningsFor(state: GameState, player: PlayerId): Warning[] {
    try {
      if (this.opts.stepWarnings) return this.opts.stepWarnings(state, player);
      return engineStepWarnings(state, player, undefined, this.modules);
    } catch (e) {
      this.log.warn(`varningar misslyckades: ${e instanceof Error ? e.message : String(e)}`);
      return [];
    }
  }

  setBaseUrl(url: string): void {
    this.baseUrl = url.replace(/\/+$/, "");
    this.sendScreenInfo();
  }

  dispose(): void {
    if (this.cameraTimer) clearTimeout(this.cameraTimer);
    this.cameraTimer = null;
  }

  // ---------------------------------------------------------------- inkommande

  handle(conn: Conn, raw: unknown): void {
    try {
      this.dispatch(conn, raw);
    } catch (e) {
      this.log.error(`fel vid meddelande: ${e instanceof Error ? (e.stack ?? e.message) : String(e)}`);
      this.error(conn, "error.internal");
    }
  }

  private dispatch(conn: Conn, raw: unknown): void {
    if (!raw || typeof raw !== "object" || typeof (raw as { type?: unknown }).type !== "string") {
      return this.error(conn, "error.badMessage");
    }
    const msg = raw as ClientMessage;
    const bound = this.bindings.get(conn);
    switch (msg.type) {
      case "helloScreen":
        return this.helloScreen(conn);
      case "join":
        return this.join(conn, msg);
      case "rejoin":
        return this.rejoin(conn, msg.seatToken);
    }
    if (!bound) return this.error(conn, "error.notJoined");
    if (bound.kind === "screen") return this.error(conn, "error.screenCannotSend");
    const seat = bound.seat;
    switch (msg.type) {
      case "setOptions":
        return this.setOptions(conn, seat, msg.options);
      case "startGame":
        return this.startGame(conn, seat);
      case "step":
        return this.step(conn, seat, msg.step);
      case "showToAll":
        return this.showToAll(conn, seat, msg.handIndex);
      case "preview":
        return this.setPreview(conn, seat, msg.preview);
      case "map":
        return this.map(conn, seat, msg.control);
      case "inspect":
        return this.inspect(conn, seat);
      case "react":
        return this.react(conn, seat, msg.emoji);
      case "setWarnings":
        return this.setWarnings(seat, msg.on);
      case "hostAction":
        return this.hostAction(conn, seat, msg.player, msg.action);
      default:
        return this.error(conn, "error.badMessage");
    }
  }

  disconnect(conn: Conn): void {
    const b = this.bindings.get(conn);
    this.bindings.delete(conn);
    if (!b || b.kind === "screen") return;
    const seat = b.seat;
    if (seat.conn !== conn) return; // platsen har redan övertagits av en ny anslutning
    seat.conn = null;
    this.log.info(`${seat.player} (${seat.name}) tappade anslutningen`);
    this.passHostIfNeeded();
    this.rosterChanged();
  }

  // ---------------------------------------------------------------- lobby

  private helloScreen(conn: Conn): void {
    if (!conn.local) return this.error(conn, "error.screenLocalOnly");
    this.bindings.set(conn, { kind: "screen" });
    if (this.phase === "lobby") this.refreshSaves();
    this.send(conn, this.screenInfo());
    if (this.phase === "lobby") this.send(conn, this.lobbyMsg());
    else this.syncGame(conn);
  }

  private join(conn: Conn, msg: Extract<ClientMessage, { type: "join" }>): void {
    if (this.bindings.has(conn)) return this.error(conn, "error.alreadyJoined");
    if (msg.gameCode !== this.gameCode) return this.error(conn, "error.badGameCode");
    if (this.phase !== "lobby") return this.error(conn, "error.gameStarted");
    const name = typeof msg.name === "string" ? msg.name.trim().slice(0, 24) : "";
    if (!name) return this.error(conn, "error.invalidName");
    const color = typeof msg.color === "string" ? msg.color.trim().slice(0, 32) : "";
    if (!color) return this.error(conn, "error.invalidColor");
    const lower = color.toLowerCase();
    // En plats från det valda sparade spelet tas av den som har platsens färg.
    const reserved = this.seats.find((s) => s.reserved && s.color.toLowerCase() === lower);
    if (reserved) {
      reserved.reserved = false;
      reserved.conn = conn;
      reserved.lang = typeof msg.lang === "string" ? msg.lang : "en";
      reserved.isHost = !this.seats.some((s) => s.isHost);
      this.bindings.set(conn, { kind: "seat", seat: reserved });
      this.log.info(`${reserved.player} (${reserved.name}) tog sin plats från det sparade spelet`);
      this.send(conn, { type: "welcome", player: reserved.player, seatToken: reserved.token, isHost: reserved.isHost });
      this.sendScreenInfo();
      return this.broadcastLobby();
    }
    if (this.pendingSave) return this.error(conn, "error.colorNotInSavedGame");
    if (this.seats.some((s) => s.color.toLowerCase() === lower)) return this.error(conn, "error.colorTaken");
    if (this.seats.length >= (this.opts.maxPlayers ?? 6)) return this.error(conn, "error.roomFull");
    const seat: Seat = {
      player: this.newPlayerId(),
      name,
      color,
      lang: typeof msg.lang === "string" ? msg.lang : "en",
      token: hex(12),
      conn,
      isHost: !this.seats.some((s) => s.isHost),
    };
    this.seats.push(seat);
    this.bindings.set(conn, { kind: "seat", seat });
    this.log.info(`${seat.player} (${seat.name}) gick med${seat.isHost ? " som värd" : ""}`);
    this.send(conn, { type: "welcome", player: seat.player, seatToken: seat.token, isHost: seat.isHost });
    this.sendScreenInfo();
    this.broadcastLobby();
  }

  private rejoin(conn: Conn, token: unknown): void {
    const seat = typeof token === "string" ? this.seats.find((s) => s.token === token) : undefined;
    if (!seat) return this.error(conn, "error.badSeatToken");
    if (this.bindings.get(conn)?.kind === "screen") return this.error(conn, "error.alreadyJoined");
    const old = seat.conn;
    if (old && old !== conn) {
      this.bindings.delete(old);
      old.close?.();
    }
    seat.conn = conn;
    seat.reserved = false;
    this.bindings.set(conn, { kind: "seat", seat });
    this.log.info(`${seat.player} (${seat.name}) återanslöt`);
    // Finns ingen ansluten värd (alla var borta) är den som kommer tillbaka först värd igen.
    this.passHostIfNeeded();
    this.send(conn, { type: "welcome", player: seat.player, seatToken: seat.token, isHost: seat.isHost });
    if (this.phase === "lobby") this.send(conn, this.lobbyMsg());
    else this.syncGame(conn);
    this.rosterChanged();
  }

  /** Värdrollen går vidare till nästa anslutna spelare om värden är borta. */
  private passHostIfNeeded(): void {
    const host = this.seats.find((s) => s.isHost);
    if (host?.conn) return;
    const next = this.seats.find((s) => s.conn);
    if (!next || next === host) return;
    if (host) host.isHost = false;
    next.isHost = true;
    this.log.info(`${next.player} (${next.name}) är nu värd`);
    next.conn?.send({ type: "welcome", player: next.player, seatToken: next.token, isHost: true });
  }

  private setOptions(conn: Conn, seat: Seat, options: StartOptions): void {
    if (!seat.isHost) return this.error(conn, "error.hostOnly");
    if (this.phase !== "lobby") return this.error(conn, "error.gameStarted");
    this.options = sanitizeOptions(options, this.modules, this.options);
    this.selectSave(conn, seat);
    if (!this.options.savedGame) saveOptions(this.savedDir, this.options);
    this.sendScreenInfo();
    this.broadcastLobby();
  }

  private newPlayerId(): PlayerId {
    const taken = new Set<string>([...this.seats.map((s) => s.player), ...(this.pendingSave?.file.setup.players.map((p) => p.id) ?? [])]);
    let id: string;
    do id = `p${++this.nextId}`;
    while (taken.has(id));
    return id;
  }

  private clearPendingSave(): void {
    for (const s of [...this.seats]) if (s.reserved) this.removeSeat(s);
    this.pendingSave = null;
  }

  /** Följer `options.savedGame`: läser det sparade spelet och reserverar dess platser. */
  private selectSave(conn: Conn, host: Seat): void {
    const id = this.options.savedGame;
    if (!id) return this.clearPendingSave();
    if (this.pendingSave?.id === id) return;
    this.refreshSaves();
    const file = isSafeId(id) ? readSave(this.savedDir, id, STATE_VERSION, this.known) : null;
    if (!file) {
      delete this.options.savedGame;
      this.error(conn, "error.savedGameUnreadable");
      return this.clearPendingSave();
    }
    const players = file.setup.players;
    const byColor = (color: string) => players.find((p) => p.color.toLowerCase() === color.toLowerCase());
    if (!byColor(host.color)) {
      delete this.options.savedGame;
      return this.error(conn, "error.savedGameColorMismatch");
    }
    this.clearPendingSave();
    const bound = new Map<Seat, SavedPlayer>();
    for (const s of [...this.seats]) {
      const pl = byColor(s.color);
      if (pl) bound.set(s, pl);
      else this.removeSeat(s); // färgen finns inte i det sparade spelet
    }
    for (const [s, pl] of bound) {
      s.player = pl.id;
      s.name = pl.name;
    }
    const taken = new Set([...bound.values()]);
    for (const pl of players) {
      if (taken.has(pl)) continue;
      this.seats.push({ player: pl.id, name: pl.name, color: pl.color, lang: "en", token: hex(12), conn: null, isHost: false, reserved: true });
    }
    this.seats.sort((a, b) => players.findIndex((p) => p.id === a.player) - players.findIndex((p) => p.id === b.player));
    this.pendingSave = { id, file };
    for (const s of this.seats) {
      if (s.conn) this.send(s.conn, { type: "welcome", player: s.player, seatToken: s.token, isHost: s.isHost });
    }
  }

  /** Bygger upp ett sparat spel: spela om `steps` med motorn (ger också alla händelser), annars ögonblicksbilden. */
  private rebuild(file: SaveFile): { state: GameState; tracker: StatsTracker; replayed: boolean } {
    try {
      let s = this.engine.newGame(structuredClone(file.setup));
      const tracker = new StatsTracker(s);
      for (const { player, step } of file.steps) {
        const r = this.engine.apply(s, player, step);
        if (!r.ok) throw new Error(r.error);
        s = r.state;
        if (step.type === "confirm") tracker.addTurn(r.events, s);
      }
      if (JSON.stringify(s) !== JSON.stringify(file.snapshot)) throw new Error("omspelningen stämmer inte med ögonblicksbilden");
      return { state: s, tracker, replayed: true };
    } catch (e) {
      this.log.warn(`sparat spel spelas inte om, ögonblicksbilden används: ${e instanceof Error ? e.message : String(e)}`);
      const state = structuredClone(file.snapshot);
      return { state, tracker: StatsTracker.fromData(state, file.stats), replayed: false };
    }
  }

  private startSaved(): void {
    const { id, file } = this.pendingSave!;
    const { state, tracker, replayed } = this.rebuild(file);
    for (const s of this.seats) s.reserved = false;
    this.pendingSave = null;
    this.state = state;
    this.tracker = tracker;
    this.stepLog = replayed ? file.steps.map((x) => ({ player: x.player, step: x.step })) : [];
    this.stepLogOk = replayed;
    this.saveId = id;
    this.elapsedBefore = typeof file.elapsedSeconds === "number" && file.elapsedSeconds >= 0 ? file.elapsedSeconds : 0;
    this.startedAt = this.now();
    this.endedAt = null;
    this.phase = "playing";
    this.log.info(`fortsatte det sparade spelet ${id} (${replayed ? "uppspelat" : "ögonblicksbild"})`);
    this.camera = this.fitCamera();
    this.broadcastGame(true);
    if (state.finished) this.sendStats();
  }

  private startGame(conn: Conn, seat: Seat): void {
    if (!seat.isHost) return this.error(conn, "error.hostOnly");
    if (this.phase !== "lobby") return this.error(conn, "error.gameStarted");
    const min = this.opts.minPlayers ?? 2;
    if (this.seats.length < min) return this.error(conn, "error.tooFewPlayers", { min });
    if (this.pendingSave) return this.startSaved();
    const o = this.options;
    const seed = this.opts.seed ? this.opts.seed() : crypto.getRandomValues(new Uint32Array(1))[0]!;
    this.state = this.engine.newGame({
      expansions: [...o.expansions],
      variants: { ...o.variants },
      handSize: o.handSize,
      showClosingTiles: o.showClosingTiles,
      players: this.seats.map((s) => ({ id: s.player, name: s.name, color: s.color })),
      seed,
    });
    this.phase = "playing";
    this.tracker = new StatsTracker(this.state);
    this.stepLog = [];
    this.stepLogOk = true;
    this.saveId = null;
    this.elapsedBefore = 0;
    this.startedAt = this.now();
    this.endedAt = null;
    saveOptions(this.savedDir, this.options);
    this.log.info(`spelet startade med ${this.seats.length} spelare, frö ${seed}, expansioner ${o.expansions.join(",")}`);
    this.camera = this.fitCamera();
    this.broadcastGame(true);
  }

  private rosterChanged(): void {
    if (this.phase === "lobby") this.broadcastLobby();
    else this.sendWaitingFor();
  }

  // ---------------------------------------------------------------- spelet

  private activeSeat(): Seat | undefined {
    return this.state ? this.seats.find((s) => s.player === this.state!.turn.player) : undefined;
  }

  private playing(conn: Conn): GameState | null {
    if (this.phase !== "playing" || !this.state) {
      this.error(conn, "error.gameNotStarted");
      return null;
    }
    return this.state;
  }

  private step(conn: Conn, seat: Seat, step: Step): void {
    const state = this.playing(conn);
    if (!state) return;
    if (!step || typeof step !== "object" || typeof step.type !== "string") return this.error(conn, "error.badMessage");
    if (state.turn.player !== seat.player) return this.error(conn, "error.notYourTurn");
    if (step.type === "placeTile" && (!ROTATIONS.includes(step.rotation) || !isPos(step.pos)))
      return this.error(conn, "error.illegalPlacement");
    const res = this.engine.apply(state, seat.player, step);
    if (!res.ok) return this.error(conn, res.error, res.params);
    const before = state.turn.player;
    this.state = res.state;
    if (step.type === "confirm") {
      // Hela turen (delstegen och bekräftelsen) in i loggen, händelserna in i statistiken, sedan sparas spelet.
      if (this.stepLogOk) for (const p of [...state.turn.pending, step]) this.stepLog.push({ player: seat.player, step: p });
      this.tracker?.addTurn(res.events, res.state);
      this.save();
    }
    if (step.type === "confirm" || res.state.finished) this.log.info(`${seat.player} bekräftade, tur: ${res.state.turn.player}`);
    this.preview = null;
    this.sendScreens({ type: "preview", player: seat.player, preview: {} });
    // Händelserna skickas när turen bekräftas: då är de en komplett följd som kan spelas upp.
    if (step.type === "confirm" && res.events.length > 0) this.sendAll({ type: "events", events: res.events });
    const turnChanged = res.state.turn.player !== before || res.state.finished;
    if (turnChanged) {
      this.camera = this.fitCamera();
      this.shown = null;
    }
    this.broadcastGame(turnChanged);
    if (res.state.finished) this.sendStats();
  }

  private showToAll(conn: Conn, seat: Seat, handIndex: number): void {
    const state = this.playing(conn);
    if (!state) return;
    if (state.turn.player !== seat.player) return this.error(conn, "error.notYourTurn");
    const tile = Number.isInteger(handIndex) ? state.players.find((p) => p.id === seat.player)?.hand[handIndex] : undefined;
    if (tile === undefined) return this.error(conn, "error.invalidTile");
    this.shown = { player: seat.player, tile };
    this.sendAll({ type: "shownTile", player: seat.player, tile });
  }

  private setPreview(conn: Conn, seat: Seat, preview: Preview): void {
    const state = this.playing(conn);
    if (!state) return;
    if (state.turn.player !== seat.player) return this.error(conn, "error.notYourTurn");
    if (!preview || typeof preview !== "object") return this.error(conn, "error.badMessage");
    this.preview = { player: seat.player, preview };
    this.sendScreens({ type: "preview", ...this.preview });
  }

  private map(conn: Conn, seat: Seat, control: MapControl): void {
    const state = this.playing(conn);
    if (!state) return;
    if (state.turn.player !== seat.player) return this.error(conn, "error.notYourTurn");
    if (!control || typeof control !== "object") return this.error(conn, "error.badMessage");
    const tiles = () => this.boardPositions();
    if (control.type === "fitAll") {
      this.camera = fitAll(tiles(), this.currentSpots());
      return this.sendCamera();
    }
    this.camera = applyControl(this.camera, control, tiles, () => []);
    this.scheduleCamera();
  }

  private inspect(conn: Conn, seat: Seat): void {
    const state = this.playing(conn);
    if (!state) return;
    if (state.turn.player !== seat.player) return this.error(conn, "error.notYourTurn");
    const result = inspectAt(this.engine, state, this.camera.x, this.camera.y, state.setup.showClosingTiles);
    const msg: ServerMessage = { type: "inspect", result };
    this.sendScreens(msg);
    this.send(conn, msg);
  }

  private react(conn: Conn, seat: Seat, emoji: string): void {
    if (typeof emoji !== "string" || !ALLOWED_EMOJIS.includes(emoji)) return this.error(conn, "error.badMessage");
    // Några per sekund räcker; resten tappas tyst.
    const t = this.now();
    const recent = (seat.reactionTimes ?? []).filter((x) => t - x < REACTION_WINDOW_MS);
    if (recent.length >= REACTION_LIMIT) {
      seat.reactionTimes = recent;
      return;
    }
    recent.push(t);
    seat.reactionTimes = recent;
    this.sendAll({ type: "reaction", player: seat.player, emoji });
  }

  private setWarnings(seat: Seat, on: unknown): void {
    seat.warnings = on === true;
    if (!seat.warnings && seat.conn && this.state && this.state.turn.player === seat.player) {
      this.send(seat.conn, { type: "warnings", warnings: [] });
    } else {
      this.sendWarnings(seat);
    }
  }

  /** Varningar för den aktiva spelarens väntande delsteg, bara till hen och bara om de är påslagna. */
  private sendWarnings(seat: Seat | undefined): void {
    const state = this.state;
    if (!seat?.conn || !seat.warnings || !state || state.finished || state.turn.player !== seat.player) return;
    this.send(seat.conn, { type: "warnings", warnings: this.warningsFor(state, seat.player) });
  }

  private hostAction(conn: Conn, seat: Seat, player: PlayerId, action: HostAction): void {
    if (!seat.isHost) return this.error(conn, "error.hostOnly");
    const target = this.seats.find((s) => s.player === player);
    if (!target) return this.error(conn, "error.unknownPlayer");
    if (target.conn) return this.error(conn, "error.playerConnected");
    switch (action) {
      case "wait":
        return this.rosterChanged();
      case "skip": {
        if (this.phase !== "playing" || !this.state) return this.error(conn, "error.gameNotStarted");
        if (this.state.turn.player !== player) return this.error(conn, "error.cannotSkip");
        this.log.info(`värden hoppade över ${player}`);
        return this.advanceTurn(this.state, null);
      }
      case "remove": {
        if (this.phase === "lobby") {
          this.removeSeat(target);
          this.passHostIfNeeded();
          this.sendScreenInfo();
          return this.broadcastLobby();
        }
        if (!this.state) return;
        if (this.seats.length <= 1) return this.error(conn, "error.cannotRemoveLast");
        this.log.info(`värden tog bort ${player}`);
        return this.advanceTurn(this.state, player);
      }
      default:
        return this.error(conn, "error.badMessage");
    }
  }

  /**
   * Avbryter pågående delsteg för den aktiva spelaren och går vidare till nästa tur (hoppa över).
   * Med `remove` tas dessutom spelaren bort: pjäserna ut ur spelet och brickorna på hand
   * blandas tillbaka i högen.
   */
  private advanceTurn(state: GameState, remove: PlayerId | null): void {
    const skipped = state.turn.player;
    // Pågående tur avbryts bara om det är den frånvarandes tur.
    const advance = remove === null || remove === skipped;
    const snap = advance ? baseExt(state).snapshot : undefined;
    const s: GameState = structuredClone(snap ?? state);
    if (advance && remove === null && (s.ext.river as { done?: boolean } | undefined)?.done === false) {
      // Flodfasen: ingen ska hålla en flodbricka mellan turerna, den går tillbaka överst i högen.
      const p = s.players.find((x) => x.id === skipped)!;
      s.drawPile.unshift(...p.hand.splice(0));
    }
    const events: GameEvent[] = [];
    if (advance && !s.finished) finishTurn(this.engine.env, s, events);
    if (remove) {
      const p = s.players.find((x) => x.id === remove);
      if (p) {
        s.drawPile.push(...p.hand.splice(0));
        shuffle(s, s.drawPile);
      }
      s.figures = s.figures.filter((f) => f.owner !== remove);
      s.players = s.players.filter((x) => x.id !== remove);
      s.setup.players = s.setup.players.filter((x) => x.id !== remove);
      const seat = this.seats.find((x) => x.player === remove);
      if (seat) this.removeSeat(seat);
      this.passHostIfNeeded();
    }
    this.state = s;
    this.preview = null;
    this.shown = null;
    this.stepLogOk = false; // överhopp och borttagning går inte att spela om från delstegen
    if (advance) this.tracker?.addTurn(events, s);
    this.save();
    if (events.length > 0) this.sendAll({ type: "events", events });
    this.camera = this.fitCamera();
    this.sendScreenInfo();
    this.broadcastGame(true);
    if (s.finished) this.sendStats();
  }

  // ---------------------------------------------------------------- spara och statistik

  private duration(): number {
    return this.elapsedBefore + ((this.endedAt ?? this.now()) - this.startedAt) / 1000;
  }

  private save(): void {
    const state = this.state;
    if (!state || !this.savedDir) return;
    if (!this.saveId) {
      const used = new Set(listSaves(this.savedDir, STATE_VERSION, this.known).map((x) => x.id));
      const base = newSaveId();
      let id = base;
      for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
      this.saveId = id;
    }
    const file: SaveFile = {
      version: SAVE_VERSION,
      savedAt: new Date().toISOString(),
      setup: state.setup,
      steps: this.stepLogOk ? this.stepLog : [],
      snapshot: state,
      elapsedSeconds: Math.round(this.duration()),
      ...(this.tracker ? { stats: this.tracker.toData() } : {}),
    };
    if (!writeSave(this.savedDir, this.saveId, file)) this.log.warn(`kunde inte spara spelet ${this.saveId}`);
  }

  private statsMessage(): ServerMessage | null {
    if (!this.state?.finished || !this.tracker) return null;
    this.endedAt ??= this.now();
    this.statsMsg ??= this.tracker.result(this.duration());
    return { type: "stats", stats: this.statsMsg };
  }

  private sendStats(): void {
    const m = this.statsMessage();
    if (m) this.sendAll(m);
  }

  private removeSeat(seat: Seat): void {
    const i = this.seats.indexOf(seat);
    if (i >= 0) this.seats.splice(i, 1);
    const c = seat.conn;
    if (c) {
      this.bindings.delete(c);
      this.error(c, "error.removed");
    }
  }

  // ---------------------------------------------------------------- kamera

  private boardPositions(): Pos[] {
    return this.state ? Object.values(this.state.board).map((t) => t.pos) : [];
  }

  /** Giltiga platser för brickan (eller brickorna) den aktiva spelaren kan lägga just nu. */
  private currentSpots(): Pos[] {
    const s = this.state;
    if (!s || s.finished) return [];
    let tiles: string[] = [];
    if (s.turn.phase === "placeTile") {
      const t = currentTile(s);
      if (t) tiles = [t];
    } else if (s.turn.phase === "chooseTile") {
      tiles = [...new Set(s.players.find((p) => p.id === s.turn.player)?.hand ?? [])];
    }
    const seen = new Map<string, Pos>();
    for (const t of tiles)
      for (const p of this.engine.placementsFor(s, t)) seen.set(`${p.pos.x},${p.pos.y}`, { x: p.pos.x, y: p.pos.y });
    return [...seen.values()];
  }

  private fitCamera(): Camera {
    return fitAll(this.boardPositions(), this.currentSpots());
  }

  private camMsg(): ServerMessage {
    const c = this.camera;
    return { type: "camera", x: c.x, y: c.y, zoom: c.zoom, rotation: c.rotation };
  }

  private sendCamera(): void {
    if (this.cameraTimer) clearTimeout(this.cameraTimer);
    this.cameraTimer = null;
    this.lastCameraSent = Date.now();
    this.sendScreens(this.camMsg());
  }

  /** Begränsar takten: skicka direkt om det gått tillräckligt länge, annars en gång när tiden är ute. */
  private scheduleCamera(): void {
    const interval = this.opts.cameraIntervalMs ?? 33;
    const wait = interval - (Date.now() - this.lastCameraSent);
    if (wait <= 0) return this.sendCamera();
    if (!this.cameraTimer) this.cameraTimer = setTimeout(() => this.sendCamera(), wait);
  }

  // ---------------------------------------------------------------- utgående

  private send(conn: Conn, msg: ServerMessage): void {
    try {
      conn.send(msg);
    } catch (e) {
      this.log.warn(`kunde inte skicka: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private error(conn: Conn, key: string, params?: Record<string, string | number>): void {
    this.send(conn, params ? { type: "error", key, params } : { type: "error", key });
  }

  private sendScreens(msg: ServerMessage): void {
    for (const [c, b] of this.bindings) if (b.kind === "screen") this.send(c, msg);
  }

  private sendAll(msg: ServerMessage): void {
    for (const c of this.bindings.keys()) this.send(c, msg);
  }

  private lobbySeats(): LobbySeat[] {
    return this.seats.map((s) => ({
      player: s.player, name: s.name, color: s.color, connected: s.conn !== null, isHost: s.isHost,
    }));
  }

  private lobbyMsg(): ServerMessage {
    return {
      type: "lobby", seats: this.lobbySeats(), options: this.lobbyOptions(), gameCode: this.gameCode,
      available: availableOptions(this.modules), saves: this.saves,
    };
  }

  /** Med ett valt sparat spel gäller dess inställningar. */
  private lobbyOptions(): StartOptions {
    const p = this.pendingSave;
    if (!p) return this.options;
    const u = p.file.setup;
    return {
      ...this.options, expansions: [...u.expansions], variants: { ...u.variants }, handSize: u.handSize,
      showClosingTiles: u.showClosingTiles, savedGame: p.id,
    };
  }

  private broadcastLobby(): void {
    this.sendAll(this.lobbyMsg());
  }

  private screenInfo(): ServerMessage {
    const seatUrls: Record<PlayerId, string> = {};
    for (const s of this.seats) seatUrls[s.player] = `${this.baseUrl}/p?s=${s.token}`;
    return { type: "screenInfo", joinUrl: `${this.baseUrl}/p?g=${this.gameCode}`, seatUrls };
  }

  private sendScreenInfo(): void {
    this.sendScreens(this.screenInfo());
  }

  private sendWaitingFor(): void {
    this.sendScreens({ type: "waitingFor", seats: this.lobbySeats().filter((s) => !s.connected) });
  }

  /** Tillståndet till alla, och hand och tillåtna delsteg till respektive spelare. */
  private broadcastGame(withCamera: boolean): void {
    const state = this.state;
    if (!state) return;
    this.sendAll({ type: "state", state: toPublicState(state) });
    const legal = this.engine.legalSteps(state);
    for (const seat of this.seats) {
      if (!seat.conn) continue;
      this.sendSeatGame(seat, legal);
    }
    if (withCamera) this.sendCamera();
    this.sendWaitingFor();
    this.sendWarnings(this.activeSeat());
  }

  private sendSeatGame(seat: Seat, legal: Step[]): void {
    const state = this.state;
    if (!state || !seat.conn) return;
    const hand = state.players.find((p) => p.id === seat.player)?.hand ?? [];
    this.send(seat.conn, { type: "hand", tiles: [...hand] });
    this.send(seat.conn, { type: "legalSteps", steps: state.turn.player === seat.player ? legal : [] });
  }

  /** Allt en ny eller återansluten anslutning behöver för att komma ikapp. */
  private syncGame(conn: Conn): void {
    const state = this.state;
    const b = this.bindings.get(conn);
    if (!state || !b) return;
    this.send(conn, { type: "state", state: toPublicState(state) });
    const stats = this.statsMessage();
    if (stats) this.send(conn, stats);
    if (b.kind === "seat") {
      this.sendSeatGame(b.seat, this.engine.legalSteps(state));
    } else {
      this.send(conn, this.camMsg());
      this.send(conn, { type: "waitingFor", seats: this.lobbySeats().filter((s) => !s.connected) });
      if (this.preview) this.send(conn, { type: "preview", ...this.preview });
      if (this.shown && this.shown.player === state.turn.player) this.send(conn, { type: "shownTile", ...this.shown });
    }
  }
}

function isPos(p: unknown): p is Pos {
  return !!p && typeof p === "object" && Number.isInteger((p as Pos).x) && Number.isInteger((p as Pos).y);
}
