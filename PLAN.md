# Plan för Erövringen (fas 0, förslag)

Förslag att godkänna innan någon kod skrivs. `SPEC.md` är facit; den här filen beskriver *hur*.

## 1. Teknikval

| Del | Förslag | Varför |
|---|---|---|
| Språk | **TypeScript** överallt (server, storskärm, telefon) | Samma regelkod på server och klient, typer för gränssnitten mellan delarna. |
| Körmiljö och paketering | **Bun** (`bun build --compile`) | Bygger en enda körbar fil för `bun-windows-x64` och `bun-linux-x64` från samma dator, med alla filer inbyggda. Inbyggd HTTP- och WebSocket-server och testkörare. Ett kommando bygger båda. |
| Nätverk | HTTP + WebSocket på lokala nätet | Servern bestämmer allt; klienterna skickar önskade drag och får tillstånd och händelser. |
| Kartan på storskärmen | **Canvas 2D** | Varje brickstyp ritas en gång per rotation och stil till en bild i minnet, och kartan ritas sedan av färdiga bilder. Snabbt även på en äldre dator och med en stor spelvärld. |
| Knappar och menyer | **Preact** (cirka 4 kB) + vanlig CSS | Litet, inget byggsteg som behöver installeras utöver Bun. |
| Tester | `bun test` | Regler, poäng och testspelare i samma verktyg. |
| QR-koder | Litet bibliotek inbyggt i filen (t.ex. `qrcode-generator`, MIT) | |

Inga andra program behövs på datorn än en webbläsare. Programmet letar efter Chrome, Edge, Chromium och Firefox och startar den i helskärm (`--kiosk`), annars standardwebbläsaren med en uppmaning att trycka F11.

## 2. Mappstruktur

```
src/
  shared/            typer, meddelanden, språkkärna (används av alla)
  engine/            spelmotor: brickor, karta, områden, tur, poäng (grundspelet)
  expansions/<namn>/ en modul per expansion, även river och abbot
  tiles/             brickdata i eget JSON-format (genererad)
  geometry/          brickans former (från brickdatan), gemensam för alla stilar
  server/            HTTP, WebSocket, spelrum, QR, sparning, logg, webbläsarstart
  screen/            storskärmens klient
  phone/             telefonens klient
  styles/<stil>/     grafikstilar, först cellshaded, senare foto
locales/             en.json, sv.json (+ lista över oöversatta ord)
scripts/             konvertering av brickdata, kontroll av antal, bygge
tests/               regeltester och testspelare
regler/sammanfattning/
```

Varje mapp ägs av en del i fas 1, så att två agenter aldrig ändrar samma fil. Gemensamma typer i `src/shared/` ändras bara av samordnaren.

## 3. Grunden som läggs fast i fas 0 (bara gränssnitt, ingen logik)

- **Brickdata:** en brickstyp har id, expansion, antal, fyra kanter (varje kant delad i tre delar: fält–väg/flod–fält eller stad) och en lista med områden (stad, väg, fält, kloster, flod, plus expansionernas typer). Varje område säger vilka kantdelar det täcker och har egenskaper (sköld, värdshus, katedral, vara, guld, symbol …). Ingen grafik i datan, bara *vad* som finns var. Konverteras med skript från JCloisterZones XML, och antalen kontrolleras mot regel-PDF:en. Grundspelet tas från utgåvan `basic:2`, som har trädgårdarna som abboten behöver.
- **Speltillstånd:** ett vanligt JSON-objekt (karta, hög, händer, pjäser, poäng, tur och fas, expansionernas egna fält). Motorn är en ren funktion `utför(tillstånd, drag) → nytt tillstånd + händelser`, med slumpfrö i tillståndet. Det ger repris, testspelare, ångra av delsteg och sparning på köpet.
- **Expansionsmoduler:** varje modul anmäler sina brickor, pjäser, områdestyper, extra turfaser, poängregler och drag via krokar i motorn. Påslagen eller avslagen vid spelstart.
- **Meddelanden:** typade meddelanden mellan server, storskärm och telefon (anslut, startval, delsteg, bekräfta, ångra, kartstyrning, markera område, reaktioner, tillstånd, händelser).
- **Grafikstil:** gränssnitt med ritfunktioner per sorts föremål (gräs, väg, stad, flod, hus, träd, pjäs …), och alla färger och mått på ett ställe.
- **Språkfiler:** JSON med nycklar, insatta värden `{namn}` och ental och flertal (via `Intl.PluralRules`). Saknas en text visas den engelska.
- **Sparade spel:** startval + slumpfrö + lista med bekräftade drag + ögonblicksbild, med versionsnummer och uppgradering vid nya versioner.

## 4. Byggordning

Enligt `SPEC.md` (Arbetssätt): 1) grundspelet på en skärm, 2) telefoner, kartstyrning och områdesmarkering, 3) hand, repris, varningar, statistik, emojis, spara, 4) paketering, 5) expansionerna.

Fas 1, parallellt efter att grunden är godkänd: brickdata + konvertering, regelmotor för grundspelet (med river och abbot), cellshadad grafikstil, språkfiler. Server och telefon kommer i fas 2.

Fas 2, parallellt: server, storskärm och telefon, så att grundspelet går att spela (steg 1 och 2 i `SPEC.md`). Hand med flera brickor, repris, emojis, statistik, varningar och spara/fortsätt väntar till fas 3, men meddelandena finns redan.

**Konventioner för fas 2:**
- `npm run dev` startar `src/server/main.ts`. Servern serverar klienterna med Buns HTML-import (`import screen from "../screen/index.html"`), så att de byggs in i programfilen i fas 4.
- Adresser: `/` storskärmen, `/p?g=<spelkod>` ny spelare, `/p?s=<platskod>` återanslutning, `/ws` WebSocket, `/qr.svg?text=…` QR-kod som SVG.
- Klienterna importerar motorn (`src/engine`), brickdatan, brickgeometrin, stilen och språkstödet direkt; servern skickar bara tillstånd, inte grafik.
- Kameran (läge, zoom, rotation) ägs av servern: den aktiva telefonen skickar `map`, servern skickar `camera` till storskärmen. Siktet är kamerans mittpunkt, så servern räknar själv ut området under siktet vid `inspect`.
- Nya texter: en del som behöver nya nycklar skriver dem (med engelsk text) i sin rapport. Samordnaren lägger in dem i `locales/en.json` och översättaren gör svenskan.

Fas 3, parallellt: regelmotorn (varningar), server, storskärm och telefon. Hand med flera brickor, "Visa för alla", repris, varningar för nybörjare, "Vad kan jag göra?", statistik, emojis och spara/fortsätt.

**Konventioner för fas 3:**
- Sparade spel: `sparade/<id>.json` i formatet `SavedGame`, skrivs efter varje bekräftat drag. Ett spel byggs upp igen från `setup` + `steps` med motorn (då får servern även alla händelser till statistiken); går det inte används `snapshot`. En fil som inte går att läsa visas med `readable: false` och får aldrig krascha servern.
- Varningar: `stepWarnings(state, player)` i `src/engine/warnings.ts` (ägs av regelmotorn). Servern anropar den efter varje delsteg för spelare som slagit på varningar och skickar `warnings`.
- Statistik: servern räknar `GameStats` ur partiets händelser och skickar `stats` när spelet är slut. Rekordens nycklar är `stats.<id>`.
- Startvalen som går att välja kommer från servern (`lobby.available`), inte från listor i klienterna.

Fas 4, parallellt: servern (webbläsarstart) och paketeringen (bygge och GitHub Actions). Se `SPEC.md`, "Paketering och start".

**Konventioner för fas 4:**
- Startpunkten är fortfarande `src/server/main.ts`, både för `npm run dev` och programfilen.
- `npm run build` kör `scripts/build/build.ts`, som bygger `dist/erovringen-windows-x64.exe` och `dist/erovringen-linux-x64` med `bun build --compile`. `npm run build -- --target windows` (eller `linux`) bygger bara en.
- Versionen kommer från `package.json` och byggs in som konstanten `EROVRINGEN_VERSION` (`--define`). Under `npm run dev` är den `"dev"`. Servern skriver versionen i loggen vid start.
- Webbläsaren öppnas bara när programmet körs som programfil, aldrig under `npm run dev` eller i tester. `--no-browser` stänger av det även i programfilen. Webbläsarstarten ligger i `src/server/browser.ts`.
- Sparade spel och loggen hamnar i `sparade/` och `logg/` bredvid programfilen (`baseDir()` i `src/server/options.ts`).
- GitHub Actions: `.github/workflows/release.yml` körs när en release publiceras. Den kör typkontroll och tester, bygger båda filerna på `ubuntu-latest` och laddar upp dem till releasen.

Fas 5, parallellt: spelrummet i webbläsaren (servern) och Android-appen. Se `SPEC.md`, "Android-app (nödlösning)". Expansionerna kommer i fas 6.

**Konventioner för fas 5:**
- Appen ligger i `android/` (Kotlin, Gradle, minSdk 26). Den har två WebView: storskärmen (synlig, `http://127.0.0.1:<port>/?android=1`) och spelrummet (dold, `http://127.0.0.1:<port>/room`). Bryggan mellan dem och appen är `src/shared/android.ts`.
- Appens server lyssnar på alla nätverkskort, port 8765 eller en ledig. Den serverar de byggda filerna (`/` storskärmen, `/p` telefonen, `/room` spelrummet, bara från enheten själv), tar emot `/ws` och skickar `/qr.svg` och `/join-colors` vidare till spelrummet med `EmbeddedRoom.http`. En anslutning är lokal om den kommer från 127.0.0.1 eller ::1.
- Spelrummet i webbläsaren: samma `Room` som på datorn. Filerna läses och skrivs genom ett gränssnitt (`FileStore` i `src/server/`), med en version för Node och en för bryggan. Sidan för spelrummet ligger i `src/server/embedded/`.
- `npm run build:android-web` (`scripts/build/android-web.ts`) bygger storskärmen, telefonen och spelrummet till `android/app/src/main/assets/web/`. Mappen är ignorerad av git.
- APK:n byggs av `.github/workflows/android.yml` (`ubuntu-latest`), som körs på samma sätt som `release.yml` (release och `workflow_dispatch`) och laddar upp `erovringen-android.apk`. `release.yml` rörs inte. APK:n signeras med en nyckel ur GitHub-hemligheter om de finns, annars med debug-nyckeln.
- Med `?android=1` visar storskärmen hur man slår på wifi-hotspot i stället för texten om brandväggen.

Fas 6: expansionerna, en i taget i ordningen nedan, och spelreglerna i spelet.

**Konventioner för fas 6:**
- En expansion är klar när modulen finns i `src/expansions/<id>/` med tester i `tests/expansions/<id>/`, är anmäld i `src/server/modules.ts`, har texter i `locales/` och har granskats av `regelgranskare`.
- **Spelarens räknare** (`players[].counters`): varor i Traders & Builders heter `goods.wine`, `goods.grain` och `goods.cloth`, guldtackor i The Gold Mines `gold`. Texten för en räknare är `counter.<id>`. Storskärmen och telefonen visar alla räknare som inte är noll, så nya expansioner behöver inte ändra dem.
- **Expansionernas val:** en expansion som vill att spelaren väljer något (flytta draken, magikern, en färja …) erbjuder steg av typen `expansion` med `data` enligt `ExpansionStepData` i `src/shared/state.ts`. Telefonen och storskärmen visar dem utan att känna till expansionen: mål på kartan numreras på storskärmen (`Preview.targets`) och väljs med en siffra, val utan mål blir knappar. Texter: `step.<expansion>.<action>` och `step.<expansion>.<action>.<choice>`. En expansion får ha en egen fas i turen; telefonen visar då bara stegen.
- **Spelregler i spelet:** begripliga sammanfattningar för spelare (inte de tekniska sammanfattningarna i `regler/sammanfattning/`) ligger i `locales/rules/<språk>/<id>.md`, en fil per del (`base`, `river`, `abbot` och expansionernas id). De beskriver reglerna som de fungerar i Erövringen, med husregler och standardvarianter. Formatet är en enkel delmängd av Markdown: `#` och `##` rubriker, stycken, `-` listor och `**fetstil**`. Svenska och engelska. `locales/rules/index.ts` importerar filerna som text. Telefonen visar dem under knappen **Regler**, i lobbyn och under spelet, för de delar som är med i spelet.

**Förslag på expansionsordning** (enklast först, de som påverkar mest sist):
1. Inns & Cathedrals, 2. Traders & Builders, 3. The Gold Mines, 4. Mage & Witch, 5. The Ferries, 6. The Flying Machines, 7. Crop Circles II, 8. The Princess & the Dragon.

## 5. Tveksamheter i reglerna

Se `regler/sammanfattning/README.md`. Brickornas utseende och de flesta kantfall i samspelet mellan expansionerna avgörs av JCloisterZones brickdata och spelmotor.

**Regelvarianter:** där regel-PDF:en beskriver olika versioner av samma regel blir de **valbara bland startvalen** (under "Regelvarianter", per expansion). Varje variant är en inställning som expansionsmodulen läser, med ett standardval:

| Variant | Standard | Alternativ |
|---|---|---|
| Draken flyttar | före poängräkning (HiG/ZMG) | efter poängräkning (RGG) |
| Guldtackor delas ut | en i taget i tur (HiG) | en per poängräknat område |
| Floden, startbricka | vanliga startbrickan kommer efter sjön (husregel: floden läggs alltid först) | vanliga startbrickan blandas in bland flodbrickorna |
| Flodens längd | två flodset med en källa och en sjö (husregel) | ett flodset |
| Flodens återvändsgränder | förbjud lägen där floden inte kan fortsätta (som JCloisterZone, ser 7 brickor framåt) | bara direkt U-sväng är förbjuden (originalregeln) |

Under flodfasen har spelarna upp till handstorleken flodbrickor på hand, men aldrig vanliga brickor. Sjön delas ut sist, och den som saknar flodbricka hoppas över. Vanliga händer delas ut när sjön är lagd.

Fler varianter läggs till på samma sätt när de dyker upp.

**Beslutat i övrigt:**
- Teknik enligt avsnitt 1 (TypeScript, Bun, Canvas 2D, Preact).
- Crop Circles II: varje miniexpansion har sina 8 egna brickor. De sex sädescirkelbrickorna hör bara till Crop Circles II, eftersom brickan som följer med varje mini är en av dem (s. 166). (Förslag, säg till om du vill ha det annorlunda.)
