// Ingångsfil för spelrummets sida i Android-appen (index.html laddar den).

import type { AndroidHost } from "../../shared/android";
import { createEmbeddedRoom } from "./room";

const host = (window as unknown as { ErovringenHost?: AndroidHost }).ErovringenHost;
if (host) {
  const { api } = createEmbeddedRoom(host);
  (window as unknown as { erovringenRoom: unknown }).erovringenRoom = api;
  host.log("info", "spelrummet startat");
  host.ready();
}
