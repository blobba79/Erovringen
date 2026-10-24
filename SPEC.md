# Specifikation: Erövringen

**Erövringen** är en digital version av brickläggningsspelet Carcassonne, med expansioner, som spelas i webbläsaren. Inte namnet Carcassonne i spelet.

Projektet ligger i GitHub-repot **Erovringen**.

## Grafik

- Inga originalbilder från spelet används.
- Spelet **ritar brickorna själv** utifrån brickdata (vägar, städer, fält, kloster, floder, symboler osv.), så att allt blir enhetligt och skarpt i alla storlekar och nya expansioner automatiskt får samma stil.

### Grafikstil: Cellshadad (tills vidare)

Tecknad stil med svarta konturer och skarpa skuggor i två toner, som i tecknade spel.

- **Ljuset kommer från övre vänstra hörnet.** Alla skuggor faller åt höger och nedåt.
- **Två toner per föremål, med hård gräns mellan dem**, aldrig mjuka övergångar:
  - Hus och kloster: ljus vägg och vänstra takhalvan, mörkare högra vägg och högra takhalvan.
  - Träd: mörk cirkel med en ljusare cirkel förskjuten uppåt vänster, plus en liten högdagerprick.
  - Vägar: ljus väg med en mörkare skuggrand längs högra eller nedre kanten.
  - Flod: blått vatten med mörkare rand på ena sidan och streckade vita högdagrar på den andra.
  - Stad: mörkare band längs insidan av stadsmuren.
  - Sköld: ljus vänster halva, mörk höger halva.
- **Kastskuggor:** hus, kloster, träd och pjäser kastar en liten halvgenomskinlig skugga (svart, cirka 24 % täckning) snett ner åt höger.
- **Konturer:** mörka, tjocka linjer runt vägar, stadsmurar, flodbankar, hus, träd och pjäser.
- **Gräset** har mörkare och ljusare fläckar med hårda kanter.
- **Färger** (utgångsläge, får justeras):

| Del | Ljus | Mörk / skugga |
|---|---|---|
| Kontur | #1F2A2E | |
| Gräs | #7FD05B (fläckar #A8E978) | #5FB043 |
| Väg | #F3DCA2 | #CFAA66 |
| Stad | #F6C766 | #D99A3C |
| Husvägg | #FFF4DC | #DCC496 |
| Tak | #EE6A4A | #B8432D |
| Träd | #43B257 (högdager #9BE47F) | #2B8A42 |
| Vatten | #3FB3EC (högdager #E9F8FF) | #2290CF |
| Sköld | #2F63E0 | #1D42A6 |

- Inga tunga effekter (oskärpa, filter, texturer), så att det går snabbt att rita även en stor spelvärld på en äldre dator.

### Lätt att byta stil

- Utseendet är helt skilt från spellogiken och brickdatan. Brickdatan säger bara *vad* som finns var (väg, stad, kloster, flod, sköld …), och en **grafikstil** bestämmer *hur* det ritas.
- En grafikstil är en egen, avgränsad del av koden med alla färger, linjebredder och ritfunktioner per sorts föremål. Inga färger eller mått skrivs någon annanstans.
- En ny stil ska bara kräva en ny grafikstil, utan ändringar i resten av spelet.
- När det finns mer än en stil väljs den bland startvalen.

### Egna foton av brickor

- Det ska gå att använda **foton av mina egna brickor** som grafik. Fotona är bara för privat bruk: de ligger i en mapp bredvid programfilen, följer aldrig med i programfilen och läggs aldrig i GitHub-repot (mappen står i `.gitignore`).
- **Fotoläge på telefonen:** telefonen visar vilken brickstyp som ska fotograferas härnäst, med den ritade brickan som förebild. Man fotar med telefonens kamera, beskär till en kvadrat och vrider fotot så att det stämmer med förebilden. Fotot sparas i fotomappen. Man ska kunna hoppa över, göra om och se hur många som är klara av varje expansion.
- Det räcker med **ett foto per brickstyp**, även om det finns flera likadana brickor.
- **Saknas foto** för en brickstyp ritas den i den vanliga stilen, så att man kan fota lite i taget.
- Markeringar av områden och pjäsernas platser måste hamna rätt även på foton. JCloisterZone 4.x har formerna för områdena på originalgrafiken (`src/main/resources/plugins/classic/tiles/shapes.xml`, AGPL-3.0) och de får användas för det. Stämmer de inte med min utgåva av brickorna ska det gå att justera dem i fotoläget.
- Foton väljs som grafikstil bland startvalen, som vilken annan stil som helst.

## Källor

- **Regel-PDF:en** ligger direkt i mappen `regler/`. Det är fansens regelsammanställning för grundspelet och alla valda expansioner, inklusive hur de fungerar tillsammans, och den är facit för regler, brickfördelning och pjäser. Titta även på bilderna i den: exempel, brickor och symboler innehåller ofta regler som inte står i texten.
- Regel-PDF:en är **Complete Annotated Rules v7.3** (december 2014, 334 sidor). Den är från tiden före spelets utgåva 3.0, vilket passar ihop med JCloisterZones brickdata och den gamla versionen av The Princess & the Dragon. Sidorna som gäller Erövringen (PDF-sida = tryckt sidnummer):

| Del | Sidor |
|---|---|
| Grundspelet | 10–26 |
| The River | 27–30 |
| The Abbot (Carcassonne II) | 196–198 |
| Inns & Cathedrals | 31–34 |
| Traders & Builders | 35–40 |
| The Princess & the Dragon | 52–62 |
| The Flying Machines (The Flier) | 139–142 |
| The Ferries | 147–150 |
| The Gold Mines (The Goldmines) | 151–153 |
| Mage & Witch | 154–156 |
| Crop Circles II | 164–166 |
| Turordning, figurer och poängräkning (alla expansioner) | 201–218 |
| Brickförteckning med antal per expansion | 224–273 |
| Symboler och ordlista | 274–296 |

- Läs bara de sidor som behövs. Resten av PDF:en handlar om expansioner som inte är med.
- Ligger fler än en sammanställning i `regler/` går den nyaste först. Säger de olika saker, följ den nyaste och tala om för mig att det skiljer sig.
- Läs igenom regel-PDF:en en gång i början och skriv en sammanfattning per expansion i `regler/sammanfattning/`, med hänvisning till sida. Använd sammanfattningarna i senare sessioner och gå tillbaka till PDF:en vid tveksamheter.
- **Upphovsrätt:** PDF:er i `regler/` läggs aldrig i GitHub-repot (`regler/*.pdf` står i `.gitignore`), eftersom de innehåller förlagets bilder och text. Sammanfattningarna skrivs med egna ord, utan kopierade stycken, och får ligga i repot.
- Eftersom PDF:en inte finns i git kommer den inte automatiskt med i nya worktrees. `regler/*.pdf` står därför i `.worktreeinclude`. Saknas den ändå i en worktree läses den från huvudmappen.
- **JCloisterZone** används som hjälp:
  - **Spelmotorn** (https://github.com/farin/JCloisterZone, huvudgrenen, MIT-licens, Java) är facit för hur reglerna fungerar i knepiga fall. Logiken skrivs om i Erövringens eget språk.
  - **Brickdatan** (https://github.com/farin/JCloisterZone-Client, mappen `src/extraResources/expansions/`, AGPL-3.0) får användas och konverteras till Erövringens eget format. Den innehåller brickornas kanter, områden och antal, i två utgåvor per expansion. Välj den utgåva som stämmer med regel-PDF:en och kontrollera antalet brickor mot den.
  - Från andra Carcassonne-projekt hämtas inget utan att fråga mig först.

## Licens

- Erövringen blir öppen källkod på GitHub under **AGPL-3.0**, eftersom brickdatan från JCloisterZone har den licensen.
- Filen `LICENSE` och en `README` med tack till JCloisterZone (Roman Krejčík) och en kort förklaring av vad som kommer därifrån. Upphovsrättsraden från spelmotorns MIT-licens följer med där kod eller logik är hämtad.
- Inga originalbilder och inte namnet Carcassonne i spelet. I README får det stå att spelet är inspirerat av Carcassonne, med en notering om att det inte är kopplat till förlaget.

## Språk

- Spelet byggs med **både engelska och svenska från början**.
- **Storskärmens språk** väljs av värden bland startvalen.
- **Varje spelare väljer språk på sin egen telefon**, oberoende av storskärmen och de andra spelarna. Valet kommer ihåg till nästa gång telefonen ansluter.
- Engelska: de engelska namnen från regel-PDF:en på brickor, pjäser, expansioner och regler.
- Svenska: om du inte vet, eller är osäker på, vad något heter på svenska används det engelska ordet tills vidare. Markera sådana texter i den svenska språkfilen (t.ex. en lista över oöversatta ord), så att jag enkelt kan hitta och rätta dem senare.
- Programmet byggs så att det är **enkelt att översätta**: ingen text skrivs direkt i koden, utan all text hämtas från en språkfil per språk (t.ex. `en.json` och `sv.json`). Ett nytt språk ska bara kräva en ny språkfil.
- Språkfilerna ska klara text med insatta värden (t.ex. spelarnamn och poäng) och olika former för ental och flertal.
- Saknas en text i ett språk visas den engelska, aldrig ett fel eller en tom ruta.

---

## Upplägg

- En gemensam **storskärm** (webbläsare, t.ex. på en TV) visar spelvärlden.
- Spelarna sitter i samma rum och styr allt med sina **egna telefoner**. De ansluter genom att skanna en QR-kod på storskärmen och väljer namn och färg.
- Allt körs lokalt på min dator över samma wifi. Så många spelare som reglerna tillåter.
- **Servern** är den enda som bestämmer över spelets tillstånd och kontrollerar att alla drag är tillåtna.
- Om en telefon tappar anslutningen (t.ex. skärmlås) kan spelaren återansluta till sin plats utan att spelet tar slut.
- **Säkerhet:** QR-koden innehåller en hemlig kod för just det här spelet, så att bara de som ser storskärmen kan ansluta, även om främlingar finns på samma wifi.
- **Inga nya spelare mitt i ett parti.** Alla ansluter före start. Varje spelare behöver en egen telefon.
- **Vem som börjar** slumpas.

### Återanslutning

- Varje plats runt bordet har en **egen QR-kod** med spelarens namn och färg. Den tar spelaren direkt tillbaka till sin plats.
- Tappar någon anslutningen visar storskärmen den spelarens QR-kod, så att hen kan skanna och fortsätta.
- Har programmet startats om (t.ex. om datorn somnat eller stängts av) fortsätter spelet från senast sparade drag. Storskärmen visar då **en QR-kod i taget**, med namnet på spelaren som hade platsen, tills alla är tillbaka.

### En spelare som lämnar

- Värden kan välja att **vänta**, **hoppa över** spelaren eller **ta bort** hen. Tas spelaren bort går hens pjäser tillbaka och hens brickor på hand blandas tillbaka i högen.
- **Storskärmen ska aldrig behöva röras efter start.** När programmet startats sköts allt från telefonerna.

## Paketering och start

- Det färdiga spelet är **en enda programfil per operativsystem**, som går att ta med på ett USB-minne: en för **Windows** och en för **Linux** (vanliga 64-bitars datorer). Dessutom finns en Android-app som nödlösning (se nedan). Båda byggs från samma kod, och båda kan ligga i samma mapp och dela sparade spel. **Allt finns i programfilen**, även alla expansioner.
- Man dubbelklickar på filen för sitt operativsystem. Den startar servern och öppnar webbläsaren med storskärmen **direkt i helskärm**. Ingen installation och inga andra program ska behövas, utöver en webbläsare som redan finns på datorn.
- Programmet hittar själv en installerad webbläsare och startar den i helskärm. Går inte det öppnas standardwebbläsaren med en tydlig uppmaning att trycka F11.
- Det ska finnas ett enkelt sätt för mig att bygga båda programfilerna, t.ex. ett enda kommando.
- **Automatiska byggen på GitHub:** när jag gör en ny version (release) bygger GitHub Actions både Windows- och Linux-filen och lägger dem på release-sidan. Det är gratis för publika repon med GitHubs vanliga byggmaskiner, så använd bara sådana.
- **Loggfil:** programmet skriver en loggfil i mappen bredvid programfilen, med fel och viktiga händelser, så att jag kan ge den till Claude Code när något går fel. Loggen ska inte växa obegränsat.
- **Nya versioner:** sparade spel och startval ska fungera även efter en uppdatering. Går ett sparat spel inte att öppna ska storskärmen säga det tydligt, aldrig krascha.
- Allt spelet sparar (sparade spel, senaste startvalen) hamnar i en mapp **bredvid programfilen**, så att allt följer med på USB-minnet.
- Om datorns brandvägg frågar om nätverksåtkomst första gången ska storskärmen förklara kort vad man ska svara.

### Android-app (nödlösning)

- En **Android-app** gör att en surfplatta eller telefon kan vara både server och storskärm, t.ex. på jobbet eller på resande fot. Datorn är fortfarande det vanliga sättet att spela.
- Appen öppnas och visar storskärmen direkt, med QR-koden. Spelarnas telefoner ansluter som vanligt med webbläsaren.
- Det ska fungera **utan internet**: telefonerna kan ansluta till surfplattans wifi-hotspot. Storskärmen förklarar kort hur man slår på hotspot om ingen telefon kan ansluta.
- Samma regler, samma storskärm och samma telefonvy som på datorn, byggda från samma kod. Alla expansioner finns med.
- Sparade spel och senaste startvalen sparas i appen, och sparade spel fungerar efter en uppdatering av appen.
- Skärmen hålls tänd medan appen är öppen. Appen visas i liggande läge.
- APK-filen byggs av GitHub Actions tillsammans med Windows- och Linux-filen och läggs på release-sidan. Den installeras direkt från filen, inte via Google Play.

## Värd och startval

- Den **första som ansluter är värd** och gör startvalen på sin telefon. Lämnar värden spelet går rollen vidare till nästa spelare.
- Startval:
  - Vilka expansioner som är med (bocka i och ur).
  - Storskärmens språk (engelska eller svenska).
  - Antal brickor på hand (1 = vanliga regler).
  - **Datorstyrda spelare:** värden kan lägga till och ta bort datorstyrda spelare. De spelar på servern med en enkel men rimlig strategi och tar en kort paus per drag så att man hinner se vad de gör på storskärmen. De följer med i sparade spel.
  - Om det ska visas hur många brickor i högen som kan stänga en öppning.
  - **Regelvarianter:** där regel-PDF:en beskriver olika versioner av en regel (t.ex. om draken flyttar före eller efter poängräkningen) går varianten att välja, med Hans im Glücks regel som standard. Se `PLAN.md`.
  - Starta nytt spel eller fortsätt ett sparat.
- **Startvalen kommer ihåg från förra gången.**

## Storskärmen

- Storskärmen är alltid **liggande** (byggd för en TV eller datorskärm i 16:9).

- Den växande spelvärlden.
- Poängställning, vems tur det är och vilken fas turen är i.
- **Brickräknare**: hur många brickor av varje sort som finns kvar.
- Ett **sikte** i mitten av kartan, som används för att markera områden.
- **Repris av senaste draget**: brickan som landar, pjäser som ställs ut och poäng som tickar upp, så att alla hänger med.
- **Snabbreaktioner**: emojis som spelarna skickar visas kort vid spelarens namn. Inga ljud.
- **Statistik efter spelet**: poängkurva över hela partiet, största staden, mest poäng från fält och liknande.

## Kartstyrning (från den aktiva spelarens telefon)

- Telefonen fungerar som pekplatta för storskärmens karta:
  - ett finger panorerar
  - nyp zoomar
  - två fingrar som vrids roterar kartan.
- Storskärmen följer mjukt och i realtid. Endast spelaren vars tur det är kan styra kartan.
- Knappen **"Visa allt"** zoomar så att hela spelvärlden och alla giltiga platser syns, och vrider tillbaka kartan så att norr är uppåt.

## Markera områden

Trycker man på pekplattan markeras området under siktet (väg, stad, fält, kloster eller motsvarande från expansionerna). Då visas:

- hela områdets utbredning
- vilka pjäser som står där och vem som har majoritet
- hur många poäng området är värt just nu
- vad som återstår för att det ska bli klart:
  - **Vägar:** de öppna ändarna.
  - **Städer:** de öppna kanterna.
  - **Kloster, kyrkor och liknande:** vilka av de omgivande rutorna som är tomma och hur många som är fyllda.
  - **Områdestyper från expansionerna:** motsvarande.
  - **Fält** blir aldrig klara. För dem visas i stället vilka färdiga städer fältet gränsar till.
- De rutor som behöver fyllas markeras på kartan, och det visas om en öppning inte längre går att stänga.
- Om det är valt vid start: hur många brickor i högen som kan stänga en öppning.

## Speltur

En tur byggs upp som en kedja av delsteg. Varje delsteg delbekräftas, och inget blir permanent förrän spelaren trycker **"Bekräfta drag"**. **"Ångra"** backar alltid ett delsteg.

Spelarens brickor på hand visas bara på den egna telefonen. Knappen **"Visa för alla"** visar den valda brickan på storskärmen, och gäller bara den aktuella turen.

### 1. Välj bricka

Har spelaren flera brickor på hand väljs vilken som ska spelas.

Går ingen av brickorna på handen att lägga någonstans får spelaren byta ut en av dem mot en ny från högen, på samma sätt som grundreglerna gör när en dragen bricka inte passar.

### 2. Placera brickan

- Spelaren trycker på en av brickans fyra kanter på telefonen. Alla kanter går att välja, även kanter med bara gräs. Knappen **"Alla platser"** hoppar över kantvalet och visar alla giltiga platser direkt.
- Storskärmen visar tydliga **siffror** på alla platser där brickan kan läggas med den valda kanten ansluten mot en befintlig bricka. Siffrorna numreras i fast ordning (vänster till höger, uppifrån och ner) så att de inte byter plats vid zoom eller rotation.
- Spelaren väljer siffra. Brickan förhandsvisas på platsen. Finns flera giltiga rotationer växlar rotera-knappen bara mellan dem.
- Delbekräfta brickan.

### 3. Välj pjäs och del av brickan

- Telefonen visar brickan stort. Spelaren trycker på den del där pjäsen ska stå (stad, väg, fält, kloster osv.). Bara giltiga delar går att välja.
- Storskärmen markerar hela området som delen tillhör, så att man ser utbredningen och om någon redan står där.
- Har spelaren flera sorters pjäser väljs vilken i samma steg.
- Ger expansionerna andra handlingar i stället för att placera en pjäs visas de som alternativ här, liksom **"Ingen pjäs"**.
- Delbekräfta.

### 4. Extra placeringar från expansioner (t.ex. guldtackor)

För varje extra pjäs som ska placeras visar storskärmen siffror på de brickor där den får ligga. Spelaren väljer siffra och delbekräftar, en pjäs i taget.

### 5. Bekräfta drag

"Bekräfta drag" genomför hela turen. Därefter räknas poäng, spelaren fyller på sin hand och turen går vidare.

## Telefonvyn i övrigt

- Visar hela tiden spelarens brickor på hand, alla pjäser och hur många som finns kvar.
- Pjäser kan tas tillbaka när reglerna tillåter det.
- Moment som involverar flera spelare (t.ex. budgivning, byten) sköts via respektive telefon. Dolda val visas bara på den egna telefonen tills de avslöjas.
- Telefonen **vibrerar** när det är spelarens tur. Går det inte att vibrera (t.ex. på iPhone) blinkar skärmen tydligt i stället.
- Knapp för **snabbreaktioner** (emojis).
- Knappen **"Vad kan jag göra?"** förklarar vad spelaren kan göra i den aktuella fasen av sin tur, inklusive regler från de expansioner som är aktiva.
- **Varningar för nybörjare**, som varje spelare slår av eller på på sin egen telefon. Exempel: "den här placeringen gör din stad omöjlig att avsluta" eller "du ger en motståndare majoritet i fältet".
- Knappar och text är stora och lätta att trycka på.
- Telefonvyn är byggd för **stående** telefon.

## Spara och fortsätt

- Spelet sparas automatiskt **efter varje bekräftat drag**, i mappen bredvid programfilen, så att inget går förlorat om datorn somnar eller programmet stängs.
- Värden kan välja att fortsätta ett sparat spel vid start. Spelarna ansluter igen och tar tillbaka sina platser.

## Expansioner

- Expansionerna läggs till **en i taget, först när grundspelet fungerar**.
- **Grundspelet** innehåller floden och abboten (som i den nya utgåvan av grundspelet).
- **Floden** spelas med två uppsättningar flodbrickor som standard (en källa och en sjö), och alla flodbrickor läggs före alla andra brickor. Den vanliga startbrickan kommer efter sjön. Spelarna har full hand (flodbrickor) redan under floden, och floden får inte kunna köra fast.
- **Valda expansioner**, med all deras spelmekanik och alla pjäser:
  - Stora expansioner:
    1. Inns & Cathedrals
    2. Traders & Builders
    3. The Princess & the Dragon – den gamla versionen, med prinsessan och vulkanen
  - Miniexpansioner:
    1. The Flying Machines
    2. The Ferries
    3. The Gold Mines
    4. Mage & Witch
    5. Crop Circles II (de sex brickorna som ingår i Big Box)
- **Spelreglerna ska vara lätta att nå i spelet:** en knapp **Regler** på telefonen, i lobbyn och under spelet, visar en kort och begriplig sammanfattning av grundspelet och varje expansion som är med, på svenska eller engelska.
- **Tills vidare utelämnas** The Messengers och The Robbers. Bygg så att de går att lägga till senare.
- Expansioner som bygger på fysisk skicklighet tas inte med.
- Alla expansioner är **inbyggda i programfilen**. I koden är varje expansion en egen, avgränsad modul som slås på eller av vid spelstart, så att den är lätt att testa och ändra.
- Grundspelet ska fungera precis som vanligt utan några expansioner påslagna.
- Där regler krockar mellan expansioner följs regel-PDF:en. Fråga mig om något är otydligt.

## Arbetssätt

- Börja med en plan: teknikval, hur projektet delas upp och i vilka steg det byggs. Ställ frågor om något är oklart innan du skriver kod.
- Bygg i steg så att jag kan provspela tidigt:
  1. Grundspelet på en skärm.
  2. Telefonstyrning, kartstyrning och områdesmarkering.
  3. Hand med brickor, repris, varningar, statistik, emojis och spara/fortsätt.
  4. Paketering till en programfil för Windows och en för Linux, som startar i helskärm.
  5. Android-appen (nödlösning).
  6. En expansion i taget, i den ordning du föreslår.
- Skriv automatiska tester för regler och poängräkning.
- **Testspelare:** osynliga datorspelare som gör slumpade men tillåtna drag, och som bara används i testerna. De ska kunna spela tusentals partier med olika kombinationer av expansioner för att hitta fel och krascher. De syns aldrig i spelet.
- Håll den här filen uppdaterad när vi bestämmer nya saker.

### Parallellt arbete med flera agenter

Arbetet delas upp på flera agenter där det går, men bara när delarna inte är beroende av varandra.

**Fas 0 – i en enda session, innan något delas upp**
- Läs reglerna. Här passar det att låta **en underagent per expansion** läsa sitt avsnitt i regel-PDF:en och skriva sammanfattningen i `regler/sammanfattning/`, parallellt.
- Gör planen och lägg fast grunden som alla andra delar bygger på: mappstruktur, brickdatans format, spelets tillstånd, meddelandena mellan server, storskärm och telefoner, grafikstilens gränssnitt och språkfilernas format.
- Skriv `CLAUDE.md` med en kort beskrivning av projektet, mappstrukturen och var gränserna mellan delarna går, med hänvisning till den här filen.
- Inga parallella agenter förrän grunden är klar och godkänd av mig.

**Fas 1 och framåt – delar som kan byggas parallellt**
Varje del äger sina egna mappar och filer. Två agenter får aldrig ändra samma fil.
- Brickdata: konvertera JCloisterZones data och kontrollera antalet brickor mot regel-PDF:en.
- Regelmotor för grundspelet, med tester.
- Grafikstilen (cellshadad).
- Server, nätverk, QR-koder och återanslutning.
- Telefonvyn.
- Storskärmen (när grafik och server finns).
- Språkfilerna, engelska och svenska.
- Paketering och GitHub Actions.
- Senare: **en agent per expansion**, eftersom varje expansion är en egen modul.

**Hur det görs**
- Arbetet görs med **underagenter** inifrån en samordnande huvudsession. Agentteam (experimentellt) används inte, om jag inte ber om det.
- Agenttyperna finns i `.claude/agents/` och arbetsreglerna i `CLAUDE.md`. Följ dem.
- Varje `modulbyggare` körs i en **egen git-worktree**, så att agenterna inte skriver över varandras ändringar. Samordnaren slår ihop delarna och kör alla tester efteråt.

**Modeller, för att få ut mest per token**

| Uppgift | Modell | Effort |
|---|---|---|
| Huvudsession: plan och grund i fas 0 | Opus | high |
| Huvudsession: samordning efter fas 0 | Sonnet räcker oftast, Opus vid svåra beslut | medium |
| Bygga moduler (`modulbyggare`) | Sonnet | medium, high för knepiga regler |
| Sammanfatta regler, översätta | Sonnet | medium |
| Granska regelkod (`regelgranskare`) | Opus | high |
| Söka i koden, köra tester | Haiku | low |

- **Effort** styr hur mycket modellen tänker innan den svarar. Lägre effort ger snabbare och billigare svar, högre ger noggrannare. Varje agenttyp har sin effort i `.claude/agents/`, och den gäller före huvudsessionens inställning. Vilka nivåer som finns beror på modellen.
- För de knepigaste delarna, som regelmotorn för grundspelets poängräkning och The Princess & the Dragon, höjs `modulbyggare` tillfälligt till `effort: high`.

- Underagenter utan egen modell körs på Sonnet (`.claude/settings.json`).
- Mekaniskt arbete görs med skript i stället för med en modell.
- Varje agent räknas mot samma användningsgräns som allt annat. Dela bara upp arbete där delarna verkligen är oberoende.
