// Storskärmens vy: lobby, spelet med poängställning och räknare, återanslutning och slutställning.

import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import type { ComponentChildren } from "preact";
import type { GameStats, InspectResult, LobbySeat, PublicState, SavedGameInfo } from "../shared/messages";
import type { Translate } from "../shared/i18n";
import { LOCALES, availableLanguages, createTranslator } from "../i18n/index";
import { MapCanvas } from "./MapCanvas";
import { type Model, seatsToShow } from "./store";
import { isAndroidApp, isFullscreenNow, phaseKey, standings, wantsF11, withoutF11 } from "./logic";
import { ReplayPlayer, type ReplayView, shownScore } from "./replay";
import { ReactionBoard } from "./reactions";
import { axisTicks, reasonRows, recordMarks, scoreChart } from "./stats";
import { style, tileTypes } from "./data";
import { tileImage } from "./render";

/** Läses en gång när sidan startar, så att det gäller även efter återanslutning och byte av vy. */
const ANDROID_APP = typeof location !== "undefined" && isAndroidApp(location.search);

const qrSrc = (text: string) => `/qr.svg?text=${encodeURIComponent(text)}`;

function Dot({ color }: { color: string }) {
  return <span class="dot" style={{ background: color }} />;
}

function Qr({ text }: { text: string }) {
  return <img class="qr" src={qrSrc(text)} alt="" />;
}

function Lobby({ model, tr }: { model: Model; tr: Translate }) {
  const seats = model.lobby?.seats ?? [];
  const o = model.lobby?.options;
  const yesNo = (b: boolean) => tr(b ? "screen.yes" : "screen.no");
  const save = o?.savedGame ? model.lobby?.saves.find((x) => x.id === o.savedGame) : undefined;
  const langName = availableLanguages().find((l) => l.code === o?.screenLang)?.name ?? o?.screenLang;
  return (
    <div class="lobby">
      <h1>{tr("game.title")}</h1>
      <div class="lobby-cols">
        <section class="card join">
          <h2>{tr("screen.scanToJoin")}</h2>
          {model.screenInfo ? <Qr text={model.screenInfo.joinUrl} /> : <p>{tr("reconnect.connecting")}</p>}
        </section>
        <section class="card">
          <h2>{tr("lobby.title")} ({tr("lobby.players", { count: seats.length })})</h2>
          {seats.length === 0 && <p>{tr("screen.noPlayers")}</p>}
          <ul class="seats">
            {seats.map((s) => (
              <li key={s.player} class={s.connected ? "" : "away"}>
                <Dot color={s.color} />
                <span class="name">{s.name}</span>
                {s.isHost && <span class="badge">{tr("lobby.host")}</span>}
                {s.bot && <span class="badge">{tr("lobby.bot")}</span>}
                {save && !s.connected && <span class="badge wait">{tr("screen.lobby.seatWaiting")}</span>}
              </li>
            ))}
          </ul>
          {seats.length > 0 && <p class="muted">{tr("lobby.waitingForHost")}</p>}
          {save && (
            <div class="saved">
              <strong>{tr("screen.lobby.continuing")}</strong>
              <div>{savedSummary(save, tr)}</div>
              <div class="muted">{tr("screen.lobby.takeBackSeats")}</div>
            </div>
          )}
        </section>
        {o && (
          <section class="card options">
            <h2>{tr("start.title")}</h2>
            <dl>
              <dt>{tr("start.expansions")}</dt>
              <dd>{o.expansions.map((e) => tr(`expansion.${e}`)).join(", ")}</dd>
              <dt>{tr("start.screenLanguage")}</dt>
              <dd>{langName}</dd>
              <dt>{tr("start.handSize")}</dt>
              <dd>{o.handSize}</dd>
              <dt>{tr("start.showClosingTiles")}</dt>
              <dd>{yesNo(o.showClosingTiles)}</dd>
              {Object.entries(o.variants).map(([k, v]) => (
                <>
                  <dt key={k}>{tr(`variant.${k}`)}</dt>
                  <dd>{tr(`variant.${k}.${v}`)}</dd>
                </>
              ))}
            </dl>
          </section>
        )}
      </div>
      <aside class="firewall">
        {ANDROID_APP ? (
          <>
            <strong>{tr("screen.hotspot.title")}</strong> {tr("screen.hotspot.text")}
          </>
        ) : (
          <>
            <strong>{tr("screen.firewall.title")}</strong> {tr("screen.firewall.text")}
          </>
        )}
      </aside>
    </div>
  );
}

/** Rad om ett sparat spel: tid, spelare med poäng och antal lagda brickor. */
export function savedSummary(save: SavedGameInfo, tr: Translate): string {
  const players = save.players.map((p) => `${p.name} ${p.score}`).join(", ");
  return `${new Date(save.savedAt).toLocaleString()} \u00b7 ${players} \u00b7 ${tr("screen.lobby.tilesPlaced", { count: save.tilesPlaced })}`;
}

function TileThumb({ type, count }: { type: string; count: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx) return;
    const img = tileImage(style, tileTypes, { type, rotation: 0 }, 48);
    ctx.clearRect(0, 0, 48, 48);
    if (img) ctx.drawImage(img, 0, 0);
  }, [type]);
  return (
    <div class="thumb">
      <canvas ref={ref} width={48} height={48} />
      <span class="count">{count}</span>
    </div>
  );
}

function Scoreboard({ state, tr, view, reactions }: { state: PublicState; tr: Translate; view?: ReplayView; reactions: Record<string, string> }) {
  const rank = new Map(standings(state.players).map((s) => [s.id, s.rank]));
  return (
    <section class="panel scores">
      <h3>{tr("screen.scoreboard")}</h3>
      <ul>
        {state.players.map((p) => (
          <li key={p.id} class={p.id === state.turn.player && !state.finished ? "turn" : ""}>
            <span class="rank">{rank.get(p.id)}</span>
            <Dot color={p.color} />
            <span class="name">{p.name}</span>
            {reactions[p.id] && <span class="reaction" key={reactions[p.id]}>{reactions[p.id]}</span>}
            {view?.gaining[p.id] ? <span class="gain">+{view.gaining[p.id]}</span> : null}
            <span class="score">{shownScore(p.score, view, p.id)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TurnBanner({ state, tr }: { state: PublicState; tr: Translate }) {
  if (state.finished) return null;
  const p = state.players.find((x) => x.id === state.turn.player);
  if (!p) return null;
  const key = phaseKey(state.turn.phase, (k) => tr(k) !== k);
  return (
    <div class="banner" style={{ borderColor: p.color }}>
      <Dot color={p.color} />
      <span class="who">{tr("screen.turnOf", { player: p.name })}</span>
      <span class="phase">{tr(key)}</span>
    </div>
  );
}

function Remaining({ state, tr }: { state: PublicState; tr: Translate }) {
  const entries = useMemo(
    () => Object.entries(state.remaining).filter(([, n]) => n > 0).sort(([a], [b]) => (a < b ? -1 : 1)),
    [state.remaining],
  );
  return (
    <section class="panel remaining">
      <h3>{tr("turn.tilesLeft", { count: state.drawPileCount })}</h3>
      <div class="thumbs">
        {entries.map(([type, n]) => <TileThumb key={type} type={type} count={n} />)}
      </div>
    </section>
  );
}

function InspectPanel({ result, state, tr }: { result: InspectResult; state: PublicState; tr: Translate }) {
  const name = (id: string) => state.players.find((p) => p.id === id)?.name ?? id;
  const closing = Object.values(result.closingTiles ?? {});
  return (
    <section class="panel inspect">
      <div class="big">{tr("score.points", { count: result.points })}</div>
      <div>{tr(result.complete ? "screen.inspect.complete" : "screen.inspect.incomplete")}</div>
      <div>
        {result.figures.length === 0
          ? tr("screen.inspect.noFigures")
          : tr("screen.inspect.figures", { count: result.figures.length })}
      </div>
      {result.majority.length > 0 && <div>{tr("screen.inspect.majority", { players: result.majority.map(name).join(", ") })}</div>}
      {result.openSpots.length > 0 && <div>{tr("screen.inspect.open", { count: result.openSpots.length })}</div>}
      {result.blockedSpots.length > 0 && <div class="bad">{tr("screen.inspect.blocked", { count: result.blockedSpots.length })}</div>}
      {closing.length > 0 && <div>{tr("screen.inspect.closing")}</div>}
      {result.completedCities && <div>{tr("screen.inspect.cities", { count: result.completedCities.length })}</div>}
    </section>
  );
}

function ShownTile({ model, tr }: { model: Model; tr: Translate }) {
  const shown = model.shownTile;
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || !shown) return;
    const img = tileImage(style, tileTypes, { type: shown.tile, rotation: 0 }, 256);
    ctx.clearRect(0, 0, 256, 256);
    if (img) ctx.drawImage(img, 0, 0);
  }, [shown?.tile]);
  if (!shown || !model.state) return null;
  const p = model.state.players.find((x) => x.id === shown.player);
  return (
    <section class="panel shown" style={{ borderColor: p?.color }}>
      <h3>{tr("screen.shownTile", { player: p?.name ?? "" })}</h3>
      <canvas ref={ref} width={256} height={256} />
    </section>
  );
}

export function StatsView({ stats, state, tr }: { stats: GameStats; state: PublicState; tr: Translate }) {
  const ids = state.players.map((p) => p.id);
  const W = 640, H = 240;
  const chart = scoreChart(stats, ids, W, H);
  const rows = reasonRows(stats, ids);
  const nameOf = (id: string | null) => state.players.find((p) => p.id === id)?.name;
  const label = (key: string, fallback: string) => { const t = tr(key); return t === key ? fallback : t; };
  return (
    <div class="stats">
      <section class="card">
        <h2>{tr("screen.stats.curve")}</h2>
        <svg viewBox={`-40 -10 ${W + 60} ${H + 40}`} class="chart">
          {axisTicks(chart.maxScore).map((v) => {
            const y = H - (v / chart.maxScore) * H;
            return <g key={v}><line x1={0} x2={W} y1={y} y2={y} class="grid" /><text x={-8} y={y + 5} text-anchor="end">{v}</text></g>;
          })}
          {chart.lines.map((l) => (
            <path key={l.player} d={l.path} fill="none" stroke={state.players.find((p) => p.id === l.player)?.color} stroke-width={5} stroke-linejoin="round" stroke-linecap="round" />
          ))}
          <text x={0} y={H + 28}>{tr("screen.stats.turn", { count: 0 })}</text>
          <text x={W} y={H + 28} text-anchor="end">{tr("screen.stats.turn", { count: chart.turns })}</text>
        </svg>
      </section>
      <section class="card">
        <h2>{tr("screen.stats.byReason")}</h2>
        <table>
          <thead>
            <tr><th />{state.players.map((p) => <th key={p.id}><Dot color={p.color} /></th>)}</tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.reason}>
                <td>{label(`stats.reason.${r.reason}`, r.reason)}</td>
                {r.values.map((v, i) => <td key={i}>{v || ""}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {stats.records.length > 0 && (
        <section class="card">
          <h2>{tr("screen.stats.records")}</h2>
          <ul class="records">
            {stats.records.map((r, i) => (
              <li key={i}>
                <span class="what">{label(r.key, r.key.replace(/^stats\./, ""))}</span>
                {nameOf(r.player) && <span><Dot color={state.players.find((p) => p.id === r.player)?.color ?? "#888"} />{nameOf(r.player)}</span>}
                <b>{r.value}</b>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}

function FinalBoard({ state, tr, stats }: { state: PublicState; tr: Translate; stats?: GameStats }) {
  const rows = standings(state.players);
  const byId = new Map(state.players.map((p) => [p.id, p]));
  const winners = rows.filter((r) => r.rank === 1).map((r) => byId.get(r.id)!.name);
  return (
    <div class={`overlay final-wrap${stats ? " with-stats" : ""}`}>
      <section class="card final">
        <h1>{tr("screen.gameOver")}</h1>
        <h2>{tr("screen.winner", { player: winners.join(", "), count: winners.length })}</h2>
        <ol>
          {rows.map((r) => {
            const p = byId.get(r.id)!;
            return (
              <li key={r.id} class={r.rank === 1 ? "first" : ""}>
                <span class="rank">{r.rank}</span>
                <Dot color={p.color} />
                <span class="name">{p.name}</span>
                <span class="score">{p.score}</span>
              </li>
            );
          })}
        </ol>
      </section>
      {stats && <StatsView stats={stats} state={state} tr={tr} />}
    </div>
  );
}

function Waiting({ model, tr }: { model: Model; tr: Translate }) {
  const seats: LobbySeat[] = seatsToShow(model);
  if (seats.length === 0) return null;
  const urls = model.screenInfo?.seatUrls ?? {};
  return (
    <div class="overlay">
      <section class="card waiting">
        <h2>{model.restart ? tr("screen.reconnect.restart") : tr("screen.reconnect.title")}</h2>
        <div class="qrs">
          {seats.map((s) => (
            <figure key={s.player}>
              {urls[s.player] ? <Qr text={urls[s.player]!} /> : null}
              <figcaption><Dot color={s.color} /> {tr("screen.reconnect.scan", { player: s.name })}</figcaption>
            </figure>
          ))}
        </div>
      </section>
    </div>
  );
}

function Game({ model, tr }: { model: Model; tr: Translate }) {
  const state = model.state!;
  // Markeringen visas en stund och tonas bort av sig själv.
  const [shown, setShown] = useState<InspectResult | undefined>(undefined);
  useEffect(() => {
    setShown(model.inspect);
    if (!model.inspect) return;
    const t = setTimeout(() => setShown(undefined), 20000);
    return () => clearTimeout(t);
  }, [model.inspect]);
  // Repris och reaktioner: klockan går bara medan något pågår.
  const replay = useRef(new ReplayPlayer());
  const board = useRef(new ReactionBoard());
  const [, setTick] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | undefined>(undefined);
  const kick = () => {
    if (timer.current) return;
    timer.current = setInterval(() => {
      setTick((n) => n + 1);
      const t = performance.now();
      replay.current.view(t);
      if (!replay.current.active && Object.keys(board.current.active(t)).length === 0) {
        clearInterval(timer.current);
        timer.current = undefined;
      }
    }, 80);
  };
  useEffect(() => () => clearInterval(timer.current), []);
  useEffect(() => {
    if (model.events && replay.current.push(model.events.events, performance.now())) kick();
  }, [model.events?.seq]);
  useEffect(() => {
    if (!model.reaction) return;
    board.current.push(model.reaction.player, model.reaction.emoji, performance.now());
    kick();
  }, [model.reaction?.seq]);
  const now = performance.now();
  const view = replay.current.view(now);
  const marks = useMemo(() => (state.finished && model.stats ? recordMarks(model.stats) : undefined), [state.finished, model.stats]);
  return (
    <div class="game">
      <MapCanvas model={model} inspect={shown} replay={replay.current} marks={marks} />
      <TurnBanner state={state} tr={tr} />
      <Scoreboard state={state} tr={tr} view={view} reactions={board.current.active(now)} />
      <ShownTile model={model} tr={tr} />
      <Remaining state={state} tr={tr} />
      {shown && <InspectPanel result={shown} state={state} tr={tr} />}
      {state.finished && <FinalBoard state={state} tr={tr} stats={model.stats} />}
    </div>
  );
}

function F11Hint({ tr }: { tr: Translate }) {
  const [wanted] = useState(() => wantsF11(location.search));
  const [full, setFull] = useState(() => isFullscreenNow(document, window));
  useEffect(() => {
    if (!wanted) return;
    history.replaceState(null, "", location.pathname + withoutF11(location.search) + location.hash);
    const update = () => setFull(isFullscreenNow(document, window));
    window.addEventListener("resize", update);
    document.addEventListener("fullscreenchange", update);
    return () => {
      window.removeEventListener("resize", update);
      document.removeEventListener("fullscreenchange", update);
    };
  }, [wanted]);
  if (!wanted || full) return null;
  return <div class="f11-hint">{tr("screen.f11")}</div>;
}

export function App({ model }: { model: Model }): ComponentChildren {
  const tr = useMemo(() => createTranslator(model.lang in LOCALES ? model.lang : "en"), [model.lang]);
  return (
    <>
      {model.state ? <Game model={model} tr={tr} /> : <Lobby model={model} tr={tr} />}
      <Waiting model={model} tr={tr} />
      <F11Hint tr={tr} />
      {!model.connected && <div class="toast">{tr("reconnect.lost")}</div>}
      {model.errorKey && <div class="toast err">{tr(model.errorKey)}</div>}
    </>
  );
}
