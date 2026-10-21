# Erövringen

Digitalt brickläggningsspel för webbläsaren: en storskärm och en telefon per spelare. **`SPEC.md` är facit** för vad som ska byggas. Läs bara de avsnitt du behöver.

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
