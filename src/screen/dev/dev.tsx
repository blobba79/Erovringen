// Dev-sida: matar storskärmen med ett riktigt tillstånd från motorn. Starta med `bun src/screen/dev/index.html`.
// Mellanslag = nästa drag, P = siffror på platserna, I = markera med inspect-exempel, pilar/+/-/R = kamera, F = visa allt.

import { render } from "preact";
import { useEffect, useRef, useState } from "preact/hooks";
import { App } from "../App";
import { applyStyleColors } from "../data";
import { type Model, initialModel, reduce } from "../store";
import { devEngine, devSetup, previewSpots, randomStep, toPublic } from "./game";
import { makeRng } from "../../../tests/players/random-player";
import type { ServerMessage } from "../../shared/messages";

applyStyleColors(document.documentElement);

const eng = devEngine();

function Dev() {
  const game = useRef(eng.newGame(devSetup()));
  const rnd = useRef(makeRng(3));
  const cam = useRef({ x: 0, y: 0, zoom: 9, rotation: 0 });
  const [model, setModel] = useState<Model>(() => ({ ...initialModel, connected: true }));
  const send = (m: ServerMessage) => setModel((x) => reduce(x, m));
  const sync = () => send({ type: "state", state: toPublic(game.current) });

  useEffect(() => {
    send({ type: "lobby", seats: [], options: { expansions: ["base", "river", "abbot"], variants: {}, screenLang: "en", handSize: 1, showClosingTiles: true }, gameCode: "dev", available: { expansions: ["base", "river", "abbot"], variants: {}, languages: ["en", "sv"], maxHandSize: 8 }, saves: [] });
    sync();
    const sendCam = () => send({ type: "camera", ...cam.current });
    sendCam();
    const onKey = (e: KeyboardEvent) => {
      const c = cam.current;
      if (e.key === " ") {
        for (let i = 0; i < 3; i++) {
          const mv = randomStep(eng, game.current, rnd.current);
          if (!mv) break;
          const r = eng.apply(game.current, mv.player, mv.step);
          if (r.ok) game.current = r.state;
          if (mv.step.type === "confirm") break;
        }
        sync();
      } else if (e.key === "p") send({ type: "preview", player: game.current.turn.player, preview: previewSpots(eng, game.current) });
      else if (e.key === "i") {
        const t = Object.values(game.current.board)[0]!;
        send({ type: "inspect", result: { kind: "city", tiles: [t.pos], figures: [], majority: [], points: 3, complete: false, openSpots: [{ x: t.pos.x + 1, y: t.pos.y }], blockedSpots: [{ x: t.pos.x - 1, y: t.pos.y }], closingTiles: { [`${t.pos.x + 1},${t.pos.y}`]: 4 } } });
      } else if (e.key === "ArrowLeft") c.x -= 1;
      else if (e.key === "ArrowRight") c.x += 1;
      else if (e.key === "ArrowUp") c.y -= 1;
      else if (e.key === "ArrowDown") c.y += 1;
      else if (e.key === "+") c.zoom = Math.max(3, c.zoom - 1);
      else if (e.key === "-") c.zoom += 1;
      else if (e.key === "r") c.rotation = (c.rotation + 90) % 360;
      else if (e.key === "f") { c.x = 0; c.y = 0; c.rotation = 0; c.zoom = 12; }
      sendCam();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return <App model={model} />;
}

render(<Dev />, document.getElementById("app")!);
