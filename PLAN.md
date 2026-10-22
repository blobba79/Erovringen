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

**Förslag på expansionsordning** (enklast först, de som påverkar mest sist):
1. Inns & Cathedrals, 2. Traders & Builders, 3. The Gold Mines, 4. Mage & Witch, 5. The Ferries, 6. The Flying Machines, 7. Crop Circles II, 8. The Princess & the Dragon.

## 5. Tveksamheter i reglerna

Se `regler/sammanfattning/README.md`. Brickornas utseende och de flesta kantfall i samspelet mellan expansionerna avgörs av JCloisterZones brickdata och spelmotor.

**Regelvarianter:** där regel-PDF:en beskriver olika versioner av samma regel blir de **valbara bland startvalen** (under "Regelvarianter", per expansion). Varje variant är en inställning som expansionsmodulen läser, med ett standardval:

| Variant | Standard | Alternativ |
|---|---|---|
| Draken flyttar | före poängräkning (HiG/ZMG) | efter poängräkning (RGG) |
| Guldtackor delas ut | en i taget i tur (HiG) | en per poängräknat område |
| Floden | River I, källan är startbricka, sjön sist i flodhögen, vanliga startbrickan blandas in | vanliga startbrickan läggs när floden är klar |
| Flodens återvändsgränder | bara direkt U-sväng är förbjuden (originalregeln) | förbjud också lägen där floden inte kan fortsätta (som JCloisterZone) |

Under flodfasen har ingen brickor på hand, oavsett handstorlek: man drar en flodbricka i början av sin tur. Händerna delas ut när sjön är lagd.

Fler varianter läggs till på samma sätt när de dyker upp.

**Beslutat i övrigt:**
- Teknik enligt avsnitt 1 (TypeScript, Bun, Canvas 2D, Preact).
- Crop Circles II: varje miniexpansion har sina 8 egna brickor. De sex sädescirkelbrickorna hör bara till Crop Circles II, eftersom brickan som följer med varje mini är en av dem (s. 166). (Förslag, säg till om du vill ha det annorlunda.)
