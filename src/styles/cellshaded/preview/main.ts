// Förhandsvisning i webbläsaren: ritar alla brickor i en expansion och några pjäser. Bundlas av serve.ts.
import { TILE_DATA } from "../../../tiles";
import { computeGeometry } from "../../../geometry";
import { cellshadedStyle as style } from "../index";
import type { Rotation, TileType } from "../../../shared/tiles";
import { JUNCTION_MODES, type JunctionMode, endsAtCenter, setJunctionMode } from "../junction";

const q = new URLSearchParams(location.search);
const sel = document.getElementById("exp") as HTMLSelectElement;
const rotSel = document.getElementById("rot") as HTMLSelectElement;
const grid = document.getElementById("grid") as HTMLElement;
const figs = document.getElementById("figs") as HTMLCanvasElement;

for (const id of Object.keys(TILE_DATA)) sel.add(new Option(id, id));
sel.value = q.get("exp") ?? "base";
rotSel.value = q.get("rot") ?? "0";
const SIZE = Number(q.get("size") ?? 150);
const jq = q.get("junction");
if (jq && (JUNCTION_MODES as readonly string[]).includes(jq)) setJunctionMode(jq as JunctionMode);

const JUNCTION_TITLES: Record<JunctionMode, string> = {
  none: "Nuvarande ritning (referens)",
  A: "A: liten by med hus",
  B: "B: torg med brunn",
  C: "C: vägarna stannar före mitten, hus i mitten",
  D: "D: marknadsstånd på rund yta",
};

/** ?compare=1: korsningsbrickor och vägslut, en rad per förslag. */
function renderCompare(): void {
  document.body.querySelectorAll("#grid, #figs, label").forEach((e) => ((e as HTMLElement).style.display = "none"));
  const pool: TileType[] = Object.values(TILE_DATA).flatMap((d) => d?.tiles ?? []);
  const info = (t: TileType) => {
    const g = computeGeometry(t);
    return { t, n: g.features.filter((f) => f.kind === "road" && endsAtCenter(f.centerline)).length, cloister: g.features.some((f) => f.kind === "cloister"), city: g.features.some((f) => f.kind === "city") };
  };
  const all = pool.map(info);
  const pick = (f: (i: ReturnType<typeof info>) => boolean, n: number) => all.filter(f).slice(0, n).map((i) => i.t);
  const tiles = [...pick((i) => i.n === 3 && !i.city, 2), ...pick((i) => i.n === 4, 2), ...pick((i) => i.n === 3 && i.city, 1),
    ...pick((i) => i.n === 1 && i.city && !i.cloister, 2), ...pick((i) => i.n === 1 && !i.city && !i.cloister, 2), ...pick((i) => i.cloister && i.n === 1, 1)];
  const root = document.createElement("div");
  const dpr = window.devicePixelRatio || 1;
  const size = Number(q.get("size") ?? 130);
  for (const m of JUNCTION_MODES) {
    setJunctionMode(m);
    const h = document.createElement("h3");
    h.textContent = JUNCTION_TITLES[m];
    const row = document.createElement("div");
    row.style.cssText = "display:flex;gap:6px;flex-wrap:wrap";
    for (const tile of tiles) {
      const cv = document.createElement("canvas");
      cv.width = cv.height = Math.round(size * dpr);
      cv.style.width = cv.style.height = size + "px";
      style.drawTile({ ctx: cv.getContext("2d")!, tile, geometry: computeGeometry(tile), rotation: 0, size: size * dpr });
      row.append(cv);
    }
    root.append(h, row);
  }
  setJunctionMode("none");
  document.body.append(root);
}

function render(): void {
  const data = TILE_DATA[sel.value as keyof typeof TILE_DATA];
  grid.innerHTML = "";
  const rotation = Number(rotSel.value) as Rotation;
  const dpr = window.devicePixelRatio || 1;
  for (const tile of data?.tiles ?? []) {
    const cell = document.createElement("div");
    cell.className = "cell";
    const cv = document.createElement("canvas");
    cv.width = cv.height = Math.round(SIZE * dpr);
    cv.style.width = cv.style.height = SIZE + "px";
    const ctx = cv.getContext("2d")!;
    const geometry = computeGeometry(tile);
    style.drawTile({ ctx, tile, geometry, rotation, size: SIZE * dpr });
    if (q.get("anchors")) {
      for (const f of geometry.features) {
        ctx.fillStyle = "red";
        ctx.fillRect(f.anchor[0] * SIZE * dpr - 2, f.anchor[1] * SIZE * dpr - 2, 4, 4);
      }
    }
    const label = document.createElement("span");
    label.textContent = tile.id.split("/")[1] ?? tile.id;
    cell.append(cv, label);
    grid.append(cell);
  }
  drawFigures();
}

function drawFigures(): void {
  const ctx = figs.getContext("2d")!;
  ctx.clearRect(0, 0, figs.width, figs.height);
  ctx.fillStyle = "#7FD05B";
  ctx.fillRect(0, 0, figs.width, figs.height);
  const colors = ["#E53935", "#1E88E5", "#FDD835", "#43A047", "#212121", "#8E24AA", null];
  const kinds = ["meeple", "large-meeple", "abbot", "builder"];
  kinds.forEach((kind, r) => colors.forEach((color, c) => style.drawFigure({ ctx, kind, color, x: 50 + c * 80, y: 50 + r * 80, size: 60 })));
  const t = style.drawHighlight;
  const sq = (x: number) => [[[x, 330], [x + 70, 330], [x + 70, 390], [x, 390]]] as const;
  (["area", "open", "blocked", "preview"] as const).forEach((k, i) => t({ ctx, shapes: [sq(20 + i * 90)], kind: k }));
}

sel.onchange = rotSel.onchange = render;
if (q.get("compare")) renderCompare();
else render();
document.title = "ready";
