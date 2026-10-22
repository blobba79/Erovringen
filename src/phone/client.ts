// Telefonens klientlogik: anslutning, återanslutning, tillstånd från servern och spelarens val.
// Ingen DOM här: lagring, adress och transport kommer in utifrån, så att allt går att testa.

import type {
  ClientMessage, EdgeChoice, HostAction, LobbySeat, MapControl, Preview, PublicState, ServerMessage, StartOptions,
} from "../shared/messages";
import type { PlayerId, Pos, Step } from "../shared/state";
import type { Rotation } from "../shared/tiles";
import { initialRotation, nextRotation, placementsOf, rotationsAt, spotsFor, type Placement } from "./logic/spots";
import {
  clearSeat, loadLang, loadSeat, pickLang, planStart, saveLang, saveSeat, type StartPlan, type StorageLike,
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
  lobby: { seats: LobbySeat[]; options: StartOptions; gameCode: string } | null;
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
}

type Listener = () => void;

export class Client {
  private s: PhoneState;
  private listeners = new Set<Listener>();
  private transport: Transport;
  private pendingJoin: { name: string; color: string } | null = null;
  private pendingRotate: { pos: Pos; rotation: Rotation } | null = null;
  private uiKey = "";
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
        return;
      }
      case "lobby": {
        const me = m.seats.find((x) => x.player === this.s.player);
        this.set({ lobby: { seats: m.seats, options: m.options, gameCode: m.gameCode }, ...(me ? { isHost: me.isHost } : {}) });
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
        this.continueRotation(m.steps);
        return;
      }
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
    const wasMine = this.s.state?.turn.player === this.s.player && !this.s.state?.finished;
    const mine = state.turn.player === this.s.player && !state.finished;
    const patch: Partial<PhoneState> = { state };
    if (mine && !wasMine) patch.turnNonce = this.s.turnNonce + 1;
    if (!mine) {
      patch.legal = [];
      patch.placements = [];
    }
    const uiKey = `${state.turn.player}/${state.turn.phase}/${state.turn.pending.length}`;
    if (uiKey !== this.uiKey) {
      this.uiKey = uiKey;
      patch.edge = null;
      patch.feature = null;
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

  /** Välj kant (eller "Alla platser") i steget "Placera brickan". */
  selectEdge(edge: EdgeChoice): void {
    const st = this.s.state;
    if (!st) return;
    const spots = spotsFor(placementsOf(this.s.legal), st.board, edge);
    this.set({ edge });
    this.preview({ edge, spots });
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
    this.preview(f ? { feature: f } : {});
  }

  map(control: MapControl): void {
    this.send({ type: "map", control });
  }

  inspect(): void {
    this.send({ type: "inspect" });
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

  hostAction(player: PlayerId, action: HostAction): void {
    this.send({ type: "hostAction", player, action });
  }
}
