# Erövringen

Digitalt brickläggningsspel för webbläsaren: en storskärm och en telefon per spelare. **`SPEC.md` är facit** för vad som ska byggas. Läs bara de avsnitt du behöver. `PLAN.md` beskriver teknikval, formaten och byggordningen.

## Projektet

TypeScript med Bun (installerat lokalt: `npx bun …`). `npm run typecheck` kontrollerar typerna, `npx bun test` kör testerna. Regler läses i `regler/sammanfattning/` (index och tveksamheter i `README.md` där).

**Gemensamma gränssnitt i `src/shared/`** (bara typer). Alla delar bygger på dem, och bara samordnaren ändrar dem:
- `tiles.ts`: brickdata (kanter N/E/S/W, fält per halvkant, som i JCloisterZone)
- `state.ts`: speltillstånd, delsteg, händelser, `Engine`
- `expansion.ts`: `ExpansionModule` med krokar och regelvarianter
- `messages.ts`: meddelanden mellan server, storskärm och telefon, och format för sparade spel
- `style.ts`: `GraphicStyle` och brickgeometri
- `i18n.ts`: språkfilernas format

**Vem äger vad** (en del = en agent; ingen rör en annan dels filer):

| Del | Äger |
|---|---|
| Samordnaren | `src/shared/`, `CLAUDE.md`, `SPEC.md`, `PLAN.md`, `package.json`, `tsconfig.json`, `.gitignore` |
| Brickdata | `scripts/tiles/`, `src/tiles/`, `tests/tiles/` |
| Regelmotor för grundspelet (med River och Abbot) | `src/engine/`, `src/expansions/river/`, `src/expansions/abbot/`, `tests/engine/`, `tests/players/` |
| En expansion | `src/expansions/<id>/`, `tests/expansions/<id>/` |
| Brickgeometri och grafikstil | `src/geometry/`, `src/styles/<stil>/`, `tests/geometry/` |
| Server | `src/server/`, `tests/server/` |
| Storskärm | `src/screen/`, `tests/screen/` |
| Telefon | `src/phone/`, `tests/phone/` |
| Språk | `locales/`, `src/i18n/`, `scripts/i18n/`, `tests/i18n/` |
| Paketering | `scripts/build/`, `.github/workflows/` |

I en ny worktree saknas `node_modules/`: kör `npm ci` först.

Behöver en del ett nytt beroende i `package.json` eller en ändring i `src/shared/`, ska den säga det i sin rapport i stället för att göra ändringen.

<!-- Fas 0 fyller i: teknikval, mappstruktur, gränssnitt mellan delarna, kommandon för att bygga, testa och köra testspelarna. -->

## Arbetsregler för agenter (spara tokens)

**Roller**
- Huvudsessionen är **samordnare**: planerar, delar ut uppgifter, slår ihop delarna och pratar med mig. Den skriver helst inte större mängder kod själv.
- Underagenter i `.claude/agents/`:
  - `Explore` (Haiku, effort low): all sökning i koden.
  - `regelsammanfattare` (Sonnet, medium): en per expansion, i fas 0.
  - `modulbyggare` (Sonnet, medium, egen worktree): bygger en avgränsad del.
  - `regelgranskare` (Opus, high): granskar andras regelkod mot regel-PDF:en.
  - `testkorare` (Haiku, low): kör tester och testspelare.
  - `oversattare` (Sonnet, medium): svenska språkfilen.
- Andra underagenter körs på Sonnet (inställt i `.claude/settings.json`).
- Höj `modulbyggare` till `effort: high` bara för de knepigaste reglerna, och sänk tillbaka efteråt.

**Så används tokens klokt**
- Ge varje underagent ett **kort, självständigt uppdrag**: vilka avsnitt i `SPEC.md` som gäller, vilka mappar den äger, vilka gränssnitt den ska följa och vad som räknas som klart. Den ser inte den här konversationen.
- Underagenter svarar med en **kort rapport**, aldrig hela filer, diffar eller loggar.
- Regler läses i `regler/sammanfattning/`. Regel-PDF:en i `regler/` öppnas bara vid tveksamhet, och då bara de sidor som tabellen i `SPEC.md` (Källor) pekar på.
- Läs PDF:en som **text** med ett verktyg som `pdftotext`, vilket är mycket billigare än att titta på sidorna. Titta på en sida som bild bara när en bild behövs, t.ex. för att se hur en bricka eller ett exempel ser ut. Den finns inte i git; saknas den i en worktree, läs den från huvudmappen.
- Mekaniskt arbete (konvertera data, räkna brickor, kontrollera antal) görs med **skript**, inte genom att läsa och skriva för hand.
- Starta bara så många parallella underagenter som det finns delar som verkligen är oberoende. Hellre en underagent med flera små, närliggande uppgifter än många små agenter.
- Läs inte om filer du redan läst i samma session om de inte har ändrats.

**Worktrees och ordning**
- `modulbyggare` får en worktree som utgår från **main**. Grunden (fas 0) och gränssnitt som en del behöver måste därför vara commitade till main innan den delen startas.
- Två agenter får aldrig äga samma fil. Ändringar i gemensamma gränssnitt görs av samordnaren.
- Samordnaren slår ihop klara delar, kör `testkorare` och låter `regelgranskare` granska regelkod innan en fas räknas som klar.
- Fråga mig innan en ny fas startas.
