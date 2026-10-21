# Brickdata

Genererad från JCloisterZone-Client (AGPL-3.0, Roman Krejčík), commit `0f66860787918482131939390ea05de7e96c45a6`
(`src/extraResources/expansions/*.xml`). Skriv inte om JSON-filerna för hand: kör
`npx bun scripts/tiles/convert.ts` (hämtar XML till `scripts/tiles/cache/`, **som bör läggas i .gitignore**).
Kontroll: `npx bun scripts/tiles/check.ts` och `npx bun test tests/tiles`.
Räknetabellen mot regel-PDF:en (`tests/tiles/pdf-counts.json`) skapas med `npx bun scripts/tiles/pdfcounts.ts`.

Varje `<expansion>.json` har `{ set: TileSet, tiles: TileType[] }`; `index.ts` exporterar `TILE_DATA`.
Brickid: `<expansion>/<JCZ-id utan prefix>`, t.ex. `base/CcRr+`. `set.source` = `jcz@<commit>:<mängd>`.

## Vald utgåva

| Expansion | JCZ-mängd | Brickor |
|---|---|---|
| base | `basic:2` (8 trädgårdar för abboten) | 72, start `base/RCr` |
| river | `river/1:2` (River I, en trädgård) | 12, start = källan `river/s`, sjön `river/I.e` sist |
| inns-cathedrals, traders-builders, princess-dragon, flying-machines, mage-witch | `:1` (utan trädgårdar; PDF:en har gamla utgåvan och trädgårdar bara på grundbrickor och River I) | 18 / 24 / 30 / 8 / 8 |
| ferries, gold-mines | enda mängden | 8 / 8 |
| crop-circles-2 | `corn-circles/2` | 6 |
| abbot | inga egna brickor | - |

Varje mini har bara sina 8 egna brickor; skördecirkelbrickan i paketet är en av Crop Circles II och ligger bara där.
Startbrickan i grundspelet är JCZ:s `BA/RCr` (inte markerad i XML-filen). River II och Crop Circles I används inte.

## Mappning

- `city` -> `CityFeature`; `pennants` kopieras; `cathedral="true"` -> props `{cathedral: true}`; `princess="true"` -> `{princess: true}`; `resource` (wine/grain/cloth) -> `{goods: "<vara>"}`.
- `road` -> `RoadFeature`; `inn="true"` -> `{inn: true}`; `tunnel="true"` -> `{tunnel: true}` (utan funktion tills Tunnel-expansionen finns).
- `river` -> `RiverFeature`. `field` -> `FieldFeature` (`halfEdges`, `adjacentCities` från attributet `city`, översatt från kant till stads-id).
- `monastery` -> `{kind: "cloister", id: "cloister"}`; `garden` -> `{kind: "garden", id: "garden"}`.
- Områdes-id: `city0..`, `road0..`, `river0..`, `field0..` i dokumentordning.
- Symboler: `volcano`, `dragon`, `portal`, `mage`, `ferry`, `goldmine` -> `gold`, `flying-machine direction=X` -> `flier:X` (W eller NW), `corn-circle type=T` -> `crop-circle:city|road|field`.

## Utelämnat

- `wagon-move` (Count of Carcassonne), `castle-base` (Bridges, Castles and Bazaars), `pig-herd` (River II), `max`/`group`-attribut och `<remove>` (bara mängdhantering; källan/sjön ordnas i skriptet).
- Allt från expansioner som inte ingår (River II, Crop Circles I m.fl.).

## Kontroll mot PDF:en

Summor stämmer (72/12/18/24/30/8/8/8/8/6). Dessutom jämförs antalet per kantmönster (t.ex. `ccrr`, roterat) per källa mot förteckningen s. 224-273: allt stämmer utom att PDF:ens förteckning räknar bara 6 av Gold Mines 8 brickor (JCZ och komponentlistan har 8; de två saknade har fyra vägkanter).
River jämförs inte per mönster (förteckningen s. 267-269 blandar River I/II); där kontrolleras antalet 12 och att sjön är sist.
