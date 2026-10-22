// Förhandsvisning i webbläsaren: ritar alla brickor i en expansion och några pjäser. Bundlas av serve.ts.
import { TILE_DATA } from "../../../tiles";
import { computeGeometry } from "../../../geometry";
import { cellshadedStyle as style } from "../index";
import type { Rotation } from "../../../shared/tiles";

const q = new URLSearchParams(location.search);
const sel = document.getElementById("exp") as HTMLSelectElement;
const rotSel = document.getElementById("rot") as HTMLSelectElement;
const grid = document.getElementById("grid") as HTMLElement;
const figs = document.getElementById("figs") as HTMLCanvasElement;

for (const id of Object.keys(TILE_DATA)) sel.add(new Option(id, id));
sel.value = q.get("exp") ?? "base";
rotSel.value = q.get("rot") ?? "0";
const SIZE = Number(q.get("size") ?? 150);

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
render();
document.title = "ready";
