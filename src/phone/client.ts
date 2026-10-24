// Telefonens klientlogik: anslutning, återanslutning, tillstånd från servern och spelarens val.
// Ingen DOM här: lagring, adress och transport kommer in utifrån, så att allt går att testa.

import type {
  AvailableOptions, ClientMessage, EdgeChoice, GameStats, HostAction, LobbySeat, MapControl, Preview, PublicState, SavedGameInfo,
  ServerMessage, StartOptions, Warning,
} from "../shared/messages";
import type { PlayerId, Pos, Step } from "../shared/state";
import type { Rotation } from "../shared/tiles";
import { initialRotation, nextRotation, placementsOf, rotationsAt, spotsFor, type Placement } from "./logic/spots";
import { expansionView, previewTargets, targetsKey } from "./logic/expansion";
import { chooserOf } from "./logic/turnview";
import {
  clearSeat, loadLang, loadSeat, loadWarnings, pickLang, planStart, saveLang, saveSeat, saveWarnings, type StartPlan, type StorageLike,
} from "./logic/session";

export interface TransportHandlers {
  /** Anropas vid varje (åter)anslutning. */
  open(): void;
  message(m: ServerMessage): void;
  /** Anropas varje gång anslutningen tappas. */
  close(): void;
}
export interface Transport {
  send(m: ClientMessage): void;
  close(): void;
}
export type TransportFactory = (h: TransportHandlers) => Transport;

export interface ClientDeps {
  storage: StorageLike | null;
  /** `location.search` vid start. */
  search: string;
  browserLang?: string;
  languages: readonly string[];
  /** Skriver om adressen (history.replaceState) så att omladdning återansluter. */
  replaceSearch?(search: string): void;
}

export type ConnStatus = "connecting" | "open" | "lost";

export interface PhoneState {
  conn: ConnStatus;
  lang: string;
  plan: StartPlan;
  joined: boolean;
  player: PlayerId | null;
  seatToken: string | null;
  isHost: boolean;
  lobby: {
    seats: LobbySeat[];
    options: StartOptions;
    gameCode: string;
    available: AvailableOptions;
    saves: SavedGameInfo[];
  } | null;
  state: PublicState | null;
  hand: string[];
  legal: Step[];
  /** De senaste tillåtna placeringarna av brickan (kvar även när brickan lagts, för rotera). */
  placements: Placement[];
  waiting: LobbySeat[];
  error: { key: string; params?: Record<string, string | number>; n: number } | null;
  /** Ökar varje gång turen går över till spelaren. */
  turnNonce: number;
  /** Vald kant i steget "Placera brickan". */
  edge: EdgeChoice | null;
  /** Vald del i steget "Välj pjäs". */
  feature: { pos: Pos; feature: string } | null;
  /** Valt mål (siffra) i ett expansionssteg, när flera steg finns på målet. */
  target: number | null;
  /** Varningar för nybörjare slagna på (sparas på telefonen). */
  warningsOn: boolean;
  /** Varningar om de väntande delstegen (bara när de är på och det är min tur). */
  warnings: Warning[];
  /** Markerad bricka på handen (index), för "Visa för alla" och byte. */
  selectedTile: number | null;
  /** Statistik när spelet är slut. */
  stats: GameStats | null;
}

type Listener = () => void;

export class Client {
  private s: PhoneState;
  private listeners = new Set<Listener>();
  private transport: Transport;
  private pendingJoin: { name: string; color: string } | null = null;
  private pendingRotate: { pos: Pos; rotation: Rotation } | null = null;
  private uiKey = "";
  private sentTargets = "";
  private errorN = 0;

  constructor(factory: TransportFactory, private deps: ClientDeps) {
    const plan = planStart(deps.search, loadSeat(deps.storage));
    this.s = {
      conn: "connecting",
      lang: pickLang(loadLang(deps.storage), deps.browserLang, deps.languages),
      plan,
      joined: false,
      player: null,
      seatToken: plan.kind === "rejoin" ? plan.seatToken : null,
      isHost: false,
      lobby: null,
      state: null,
      hand: [],
      legal: [],
      placements: [],
      waiting: [],
      error: null,
      turnNonce: 0,
      edge: null,
      feature: null,
      target: null,
      warningsOn: loadWarnings(deps.storage),
      warnings: [],
      selectedTile: null,
      stats: null,
    };
    this.transport = factory({
      open: () => this.onOpen(),
      message: (m) => this.onMessage(m),
      close: () => this.set({ conn: "lost" }),
    });
  }

  getState = (): PhoneState => this.s;

  subscribe = (fn: Listener): (() => void) => {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  };

  private set(patch: Partial<PhoneState>): void {
    this.s = { ...this.s, ...patch };
    for (const l of [...this.listeners]) l();
  }

  close(): void {
    this.transport.close();
  }

  // --- Anslutning ---

  private onOpen(): void {
    this.set({ conn: "open" });
    if (this.s.seatToken) this.transport.send({ type: "rejoin", seatToken: this.s.seatToken });
    else if (this.pendingJoin && this.s.plan.kind === "join") this.sendJoin(this.s.plan.gameCode, this.pendingJoin);
  }

  private sendJoin(gameCode: string, j: { name: string; color: string }): void {
    this.transport.send({ type: "join", gameCode, name: j.name, color: j.color, lang: this.s.lang });
  }

  /** Ny spelare (adressen hade en spelkod). */
  join(name: string, color: string): void {
    if (this.s.plan.kind !== "join") return;
    this.pendingJoin = { name, color };
    if (this.s.conn === "open") this.sendJoin(this.s.plan.gameCode, this.pendingJoin);
  }

  setLang(lang: string): void {
    saveLang(this.deps.storage, lang);
    this.set({ lang });
  }

  dismissError(): void {
    this.set({ error: null });
  }

  // --- Meddelanden från servern ---

  private onMessage(m: ServerMessage): void {
    switch (m.type) {
      case "welcome": {
        const gameCode = this.s.plan.kind === "join" ? this.s.plan.gameCode : this.s.lobby?.gameCode;
        saveSeat(this.deps.storage, { token: m.seatToken, ...(gameCode ? { gameCode } : {}) });
        this.deps.replaceSearch?.(`?s=${encodeURIComponent(m.seatToken)}`);
        this.pendingJoin = null;
        this.set({ joined: true, player: m.player, seatToken: m.seatToken, isHost: m.isHost });
        this.send({ type: "setWarnings", on: this.s.warningsOn });
        return;
      }
      case "lobby": {
        const me = m.seats.find((x) => x.player === this.s.player);
        this.set({
          lobby: { seats: m.seats, options: m.options, gameCode: m.gameCode, available: m.available, saves: m.saves },
          ...(me ? { isHost: me.isHost } : {}),
        });
        return;
      }
      case "state":
        this.onState(m.state);
        return;
      case "hand":
        this.set({ hand: m.tiles });
        return;
      case "legalSteps": {
        const placements = placementsOf(m.steps);
        this.set({ legal: m.steps, ...(placements.length > 0 ? { placements } : {}) });
        this.syncTargets();
        this.continueRotation(m.steps);
        return;
      }
      case "warnings":
        this.set({ warnings: m.warnings });
        return;
      case "stats":
        this.set({ stats: m.stats });
        return;
      case "waitingFor":
        this.set({ waiting: m.seats });
        return;
      case "error":
        if (!this.s.joined && this.s.seatToken) {
          // Platskoden gäller inte längre: glöm den och börja om.
          clearSeat(this.deps.storage);
          const plan: StartPlan = this.s.plan.kind === "join" ? this.s.plan : { kind: "scan" };
          this.set({ seatToken: null, plan });
        }
        this.set({ error: { key: m.key, ...(m.params ? { params: m.params } : {}), n: ++this.errorN } });
        return;
      default:
        return;
    }
  }

  private onState(state: PublicState): void {
    const wasMine = !!this.s.state && chooserOf(this.s.state.turn) === this.s.player && !this.s.state.finished;
    const mine = chooserOf(state.turn) === this.s.player && !state.finished;
    const patch: Partial<PhoneState> = { state };
    this.sentTargets = ""; // servern glömmer förhandsvisningen när tillståndet ändras
    if (mine && !wasMine) patch.turnNonce = this.s.turnNonce + 1;
    if (!mine) {
      patch.legal = [];
      patch.placements = [];
      patch.warnings = [];
    }
    const uiKey = `${state.turn.player}/${state.turn.actor ?? ""}/${state.turn.phase}/${state.turn.pending.length}`;
    if (uiKey !== this.uiKey) {
      this.uiKey = uiKey;
      patch.edge = null;
      patch.feature = null;
      patch.target = null;
      patch.selectedTile = null;
    }
    this.set(patch);
  }

  // --- Spelarens val ---

  send(m: ClientMessage): void {
    this.transport.send(m);
  }

  step(step: Step): void {
    this.send({ type: "step", step });
  }

  private preview(p: Preview): void {
    this.send({ type: "preview", preview: p });
  }

  /** Förhandsvisningen av det som är valt just nu: kant och platser, område och expansionens mål. */
  private composePreview(over: Partial<PhoneState> = {}): Preview {
    const cur = { ...this.s, ...over };
    const p: Preview = {};
    if (cur.edge !== null && cur.state) {
      p.edge = cur.edge;
      p.spots = spotsFor(placementsOf(cur.legal), cur.state.board, cur.edge);
    }
    if (cur.feature) p.feature = cur.feature;
    const targets = previewTargets(expansionView(cur.legal));
    if (targets.length > 0) p.targets = targets;
    return p;
  }

  /** Skickar målen i expansionens steg till storskärmen när de ändrats. */
  private syncTargets(): void {
    const key = targetsKey(expansionView(this.s.legal));
    if (key === this.sentTargets) return;
    this.sentTargets = key;
    if (key !== "") this.preview(this.composePreview());
  }

  /** Välj kant (eller "Alla platser") i steget "Placera brickan". */
  selectEdge(edge: EdgeChoice): void {
    if (!this.s.state) return;
    this.set({ edge });
    this.preview(this.composePreview({ edge }));
  }

  /** Välj ett mål (siffra) i ett expansionssteg: ett enda steg görs direkt, annars visas valen. */
  pickTarget(n: number): void {
    const t = expansionView(this.s.legal).targets.find((x) => x.n === n);
    if (!t) return;
    if (t.steps.length === 1) this.step(t.steps[0]!);
    else this.set({ target: n });
  }

  /** Välj plats; brickan läggs direkt med första passande rotation. */
  placeAt(pos: Pos): void {
    const st = this.s.state;
    if (!st || this.s.edge === null) return;
    const rotation = initialRotation(placementsOf(this.s.legal), st.board, pos, this.s.edge);
    if (rotation !== null) this.step({ type: "placeTile", pos, rotation });
  }

  /** Växla till nästa tillåtna rotation: ångra brickan och lägg den igen. */
  rotate(): void {
    const placed = this.s.state?.turn.pending.find((x): x is Extract<Step, { type: "placeTile" }> => x.type === "placeTile");
    if (!placed) return;
    this.pendingRotate = { pos: placed.pos, rotation: placed.rotation };
    this.step({ type: "undo" });
  }

  private continueRotation(steps: Step[]): void {
    const r = this.pendingRotate;
    if (!r) return;
    const placements = placementsOf(steps);
    if (placements.length === 0) return; // väntar på rätt läge
    this.pendingRotate = null;
    const next = nextRotation(rotationsAt(placements, r.pos), r.rotation);
    if (next !== null) this.step({ type: "placeTile", pos: r.pos, rotation: next });
  }

  /** Välj del av brickan (eller null för att ångra valet). */
  selectFeature(f: { pos: Pos; feature: string } | null): void {
    this.set({ feature: f });
    this.preview(this.composePreview({ feature: f }));
  }

  map(control: MapControl): void {
    this.send({ type: "map", control });
  }

  inspect(): void {
    this.send({ type: "inspect" });
  }

  selectTile(index: number | null): void {
    this.set({ selectedTile: index });
  }

  react(emoji: string): void {
    this.send({ type: "react", emoji });
  }

  setWarningsOn(on: boolean): void {
    saveWarnings(this.deps.storage, on);
    this.set({ warningsOn: on, ...(on ? {} : { warnings: [] }) });
    this.send({ type: "setWarnings", on });
  }

  showToAll(handIndex: number): void {
    this.send({ type: "showToAll", handIndex });
  }

  setOptions(options: StartOptions): void {
    this.send({ type: "setOptions", options });
  }

  startGame(): void {
    this.send({ type: "startGame" });
  }

  addBot(): void {
    this.send({ type: "addBot" });
  }

  removeBot(player: PlayerId): void {
    this.send({ type: "removeBot", player });
  }

  hostAction(player: PlayerId, action: HostAction): void {
    this.send({ type: "hostAction", player, action });
  }
}
