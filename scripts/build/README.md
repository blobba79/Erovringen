# Paketering

## Bygga lokalt

- `npm run build` bygger `dist/erovringen-windows-x64.exe` och `dist/erovringen-linux-x64`.
- `npm run build -- --target windows` (eller `linux`) bygger bara den ena.
- Första korsbygget laddar ner Buns körmiljö för det andra systemet.
- Provkör en byggd fil: `npx bun scripts/build/smoke.ts dist/erovringen-windows-x64.exe`. Den startar filen i en tillfällig mapp, kontrollerar sidorna och mapparna `logg/` och `sparade/`, och avslutar.

## Göra en release

1. Höj `version` i `package.json` och committa.
2. Publicera en release på GitHub (ny tagg).
3. GitHub Actions (`release.yml`) kör typkontroll och tester, bygger båda filerna, provkör Linux-filen och lägger filerna på release-sidan.

Utan release: kör arbetsflödet "Release" för hand (Actions, Run workflow). Filerna blir då artefakter på körningen.
