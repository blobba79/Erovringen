// Spelvyn: poäng, tur, delstegen, hand, pekplatta och pjäser.

import { useEffect, useMemo, useRef } from "preact/hooks";
import type { EdgeChoice, PublicState } from "../../shared/messages";
import type { PlayerId, Step } from "../../shared/state";
import type { Client, PhoneState } from "../client";
import { computeGeometry } from "../../geometry/index";
import { GestureTracker } from "../logic/gestures";
import { featureAtPoint } from "../logic/hit";
import { visibleCounters } from "../logic/counters";
import { drawCounterIcon } from "../../styles/cellshaded/index";
import { rotationsAt, spotsFor } from "../logic/spots";
import { chooserOf, deriveTurn, figureSupply, type TurnView } from "../logic/turnview";
import { SeatActions } from "./connect";
import { AfterView, Tools, Warnings } from "./extras";
import { ExpansionStage } from "./expansion";
import { HandStrip } from "./hand";
import { FigureIcon, LangSelect, TileCanvas, tileType, useClient, useT, useTileSize, type Highlight } from "./common";

type FigureStep = Extract<Step, { type: "placeFigure" }>;

export function GameView({ s }: { s: PhoneState }) {
  const t = useT();
  const c = useClient();
  const state = s.state!;
  const me = s.player;
  const view = deriveTurn(state, me, s.hand);
  const current = state.players.find((p) => p.id === chooserOf(state.turn));
  const myColor = state.players.find((p) => p.id === me)?.color ?? null;
  const has = (type: Step["type"]) => s.legal.some((x) => x.type === type);

  return (
    <main class="view game">
      <Banner state={state} view={view} name={current?.name ?? ""} />
      <div class="topbar">
        <ScoreBar state={state} me={me} />
        {me && <Supply state={state} me={me} color={myColor} />}
      </div>
      {s.waiting.length > 0 && <SeatActions seats={s.waiting} host={s.isHost} />}
      {state.finished && <AfterView s={s} />}
      {view.mine && <Warnings s={s} />}
      {view.mine && <Stage s={s} view={view} />}
      {view.mine && (has("undo") || has("confirm")) && (
        <div class="actions">
          {has("undo") && (
            <button type="button" class="big" onClick={() => c.step({ type: "undo" })}>{t("turn.undo")}</button>
          )}
          {has("confirm") && (
            <button type="button" class="big primary" onClick={() => c.step({ type: "confirm" })}>{t("turn.confirm")}</button>
          )}
        </div>
      )}
      {view.mine && <PadBlock s={s} view={view} />}
      <HandStrip s={s} view={view} />
      {!state.finished && <Tools s={s} phase={view.phase} mine={view.mine} />}
      {state.finished && <LangSelect />}
    </main>
  );
}

function Banner({ state, view, name }: { state: PublicState; view: TurnView; name: string }) {
  const t = useT();
  if (state.finished) return <h1 class="banner">{t("phone.gameOver")}</h1>;
  const phaseKey =
    view.phase === "chooseTile" ? "turn.chooseTile"
    : view.phase === "placeTile" ? "turn.placeTile"
    : view.phase === "placeFigure" ? "turn.chooseFigure"
    : view.phase === "confirm" ? "turn.confirm"
    : t(`phase.${view.phase}`) !== `phase.${view.phase}` ? `phase.${view.phase}`
    : "turn.extraPlacements";
  return (
    <h1 class={`banner${view.mine ? " mine" : ""}`}>
      {view.isActor ? t("turn.yourChoice") : view.mine ? t("turn.yourTurn") : t("turn.waiting", { player: name })}
      <small>{view.mine ? t(phaseKey) : ""}</small>
      <small class="left">{t("turn.tilesLeft", { count: state.drawPileCount })}</small>
    </h1>
  );
}

/** Räknarens ikon i en liten canvas; okänd räknare ger en färgad prick (texten visas då bredvid). */
function CounterIcon({ id, color }: { id: string; color: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const px = 14;
  const known = color !== "#999999";
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const dpr = window.devicePixelRatio || 1;
    c.width = c.height = Math.round(px * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, px, px);
    drawCounterIcon(ctx, id, px / 2, px / 2, px);
  }, [id]);
  return known
    ? <canvas ref={ref} class="cicon" aria-hidden="true" style={{ width: `${px}px`, height: `${px}px` }} />
    : <span class="dot" style={{ background: color }} />;
}

function ScoreBar({ state, me }: { state: PublicState; me: PlayerId | null }) {
  const t = useT();
  return (
    <ul class="scores">
      {state.players.map((p) => (
        <li class={`${p.id === state.turn.player ? "turn" : ""}${p.id === me ? " me" : ""}`}>
          <span class="dot" style={{ background: p.color }} />
          <b>{p.name}</b>
          <span>{t("score.points", { count: p.score })}</span>
          {visibleCounters(p.counters).length > 0 && (
            <span class="counters">
              {visibleCounters(p.counters).map((c) => {
                const key = `counter.${c.id}`;
                const label = t(key) !== key ? t(key) : c.id;
                return (
                  <span class="counter" title={label} data-counter={c.id}>
                    <CounterIcon id={c.id} color={c.color} />
                    {c.color === "#999999" ? `${label} ` : ""}{c.count}
                  </span>
                );
              })}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function Supply({ state, me, color }: { state: PublicState; me: PlayerId; color: string | null }) {
  const t = useT();
  return (
    <ul class="supply">
      {figureSupply(state, me).map((f) => (
        <li class={f.left === 0 ? "none" : ""}>
          <FigureIcon kind={f.kind} color={color} />
          <span>{t("phone.figureCount", { figure: t(`figure.${f.kind}`), left: f.left, total: f.total })}</span>
        </li>
      ))}
    </ul>
  );
}

// --- Delsteg ---

function Stage({ s, view }: { s: PhoneState; view: TurnView }) {
  return (
    <>
      <PhaseStage s={s} view={view} />
      <ExpansionStage s={s} />
    </>
  );
}

function PhaseStage({ s, view }: { s: PhoneState; view: TurnView }) {
  const t = useT();
  switch (view.phase) {
    case "chooseTile":
      return <p class="hint">{s.legal.some((x) => x.type === "exchangeTile") ? t("phone.exchangeHint") : t("turn.chooseTile")}</p>;
    case "placeTile":
      return <PlaceStage s={s} view={view} />;
    case "placeFigure":
      return <FigureStage s={s} view={view} />;
    case "confirm":
      return view.placedTile ? <TilePreview s={s} view={view} /> : null;
    default:
      return null;
  }
}

function PlaceStage({ s, view }: { s: PhoneState; view: TurnView }) {
  const t = useT();
  const c = useClient();
  const size = useTileSize(0.3, 190);
  if (!view.tileId) return null;
  const board = s.state!.board;
  const edge = s.edge;
  const spots = edge === null ? [] : spotsFor(s.placements, board, edge);
  const edges: EdgeChoice[] = [0, 1, 2, 3];
  return (
    <section class="stage place">
      <div class="tile-frame" style={{ width: `${size}px`, height: `${size}px` }}>
        <TileCanvas tileId={view.tileId} size={size} />
        {edges.map((e) => (
          <button
            type="button"
            class={`edge e${e}${edge === e ? " on" : ""}`}
            onClick={() => c.selectEdge(e)}
          />
        ))}
      </div>
      <div class="side">
        <p class="hint small">{edge === null ? t("phone.pickEdge") : spots.length > 0 ? t("phone.pickSpot") : t("phone.noSpots")}</p>
        <button type="button" class={`big${edge === "all" ? " on" : ""}`} onClick={() => c.selectEdge("all")}>
          {t("turn.allPositions")}
        </button>
        {edge !== null && (
          <div class="digits">
            {spots.map((p, i) => (
              <button type="button" class="digit" onClick={() => c.placeAt(p)}>{i + 1}</button>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

function FigureStage({ s, view }: { s: PhoneState; view: TurnView }) {
  const t = useT();
  const c = useClient();
  const size = useTileSize(0.28, 220);
  const placed = view.placedTile;
  const type = placed ? tileType(placed.type) : undefined;
  const steps = s.legal.filter((x): x is FigureStep => x.type === "placeFigure");
  const features = useMemo(() => new Set(steps.map((x) => x.feature)), [steps]);
  if (!placed || !type) return null;
  const geometry = computeGeometry(type);
  const sel = s.feature && s.feature.pos.x === placed.pos.x && s.feature.pos.y === placed.pos.y ? s.feature.feature : null;
  const kinds = [...new Set(steps.filter((x) => x.feature === sel).map((x) => x.kind))];
  const highlights: Highlight[] = [...features].map((f) => ({ feature: f, kind: f === sel ? "area" : "open" }));
  const returns = s.legal.filter((x): x is Extract<Step, { type: "returnFigure" }> => x.type === "returnFigure");
  const canRotate = rotationsAt(s.placements, placed.pos).length !== 1;
  return (
    <section class="stage figure">
      <TileCanvas
        tileId={placed.type}
        rotation={placed.rotation}
        size={size}
        highlights={highlights}
        onPoint={(p) => {
          const f = featureAtPoint(geometry, placed.rotation, p, features);
          c.selectFeature(f && f !== sel ? { pos: placed.pos, feature: f } : null);
        }}
      />
      <p class="hint">{sel ? "" : t("phone.pickFeature")}</p>
      <div class="row wrap">
        {sel &&
          kinds.map((k) => (
            <button
              type="button"
              class="big primary"
              onClick={() => c.step({ type: "placeFigure", kind: k, pos: placed.pos, feature: sel })}
            >
              {t(`figure.${k}`)}
            </button>
          ))}
        {returns.map((r) => {
          const fig = s.state!.figures.find((f) => f.id === r.figure);
          return (
            <button type="button" class="big" onClick={() => c.step(r)}>
              {t("phone.takeBack", { figure: t(`figure.${fig?.kind ?? ""}`) })}
            </button>
          );
        })}
        {s.legal.some((x) => x.type === "noFigure") && (
          <button type="button" class="big" onClick={() => c.step({ type: "noFigure" })}>{t("turn.noFigure")}</button>
        )}
        {canRotate && (
          <button type="button" class="big" onClick={() => c.rotate()}>{t("turn.rotate")}</button>
        )}
      </div>
    </section>
  );
}

function TilePreview({ s, view }: { s: PhoneState; view: TurnView }) {
  const size = useTileSize(0.26, 200);
  const p = view.placedTile!;
  const hl: Highlight[] = view.figure ? [{ feature: view.figure.feature, kind: "area" }] : [];
  void s;
  return (
    <section class="stage">
      <TileCanvas tileId={p.type} rotation={p.rotation} size={size} highlights={hl} />
    </section>
  );
}

// --- Pekplattan ---

function PadBlock({ s, view }: { s: PhoneState; view: TurnView }) {
  const t = useT();
  const c = useClient();
  return (
    <section class="padblock">
      <Pad onMap={(m) => c.map(m)} onTap={() => c.inspect()} hint={t("phone.padHint")} />
      <div class="row">
        <button type="button" onClick={() => c.map({ type: "fitAll" })}>{t("turn.showAll")}</button>
      </div>
    </section>
  );
}

function Pad({ onMap, onTap, hint }: { onMap: Client["map"]; onTap: () => void; hint: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const tracker = useRef<GestureTracker | null>(null);
  if (!tracker.current) tracker.current = new GestureTracker(300);
  const out = (list: ReturnType<GestureTracker["move"]>) => {
    for (const o of list) {
      if (o.type === "tap") onTap();
      else onMap(o);
    }
  };
  useEffect(() => () => tracker.current?.cancel(), []);
  const now = () => performance.now();
  return (
    <div
      ref={ref}
      class="pad"
      title={hint}
      aria-label={hint}
      onPointerDown={(e) => {
        const el = e.currentTarget as HTMLDivElement;
        el.setPointerCapture(e.pointerId);
        tracker.current!.setWidth(el.getBoundingClientRect().width);
        out(tracker.current!.down(e.pointerId, e.clientX, e.clientY, now()));
      }}
      onPointerMove={(e) => out(tracker.current!.move(e.pointerId, e.clientX, e.clientY, now()))}
      onPointerUp={(e) => out(tracker.current!.up(e.pointerId, now()))}
      onPointerCancel={(e) => {
        void e;
        tracker.current!.cancel();
      }}
    />
  );
}
