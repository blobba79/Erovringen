# Android-appen

Nödlösning: en surfplatta eller telefon är både server och storskärm. Spelarnas telefoner ansluter med webbläsaren, gärna via enhetens wifi-hotspot (inget internet behövs).

## Så fungerar den

- En aktivitet i liggande helskärm, skärmen hålls tänd. Bakåtknappen kräver två tryck.
- En **synlig WebView** visar storskärmen (`http://127.0.0.1:<port>/?android=1`). En **dold WebView** (1x1 px) kör spelrummet (`/room`), alltså samma `Room`-kod som på datorn.
- En **Ktor-server** (CIO) i appen lyssnar på port 8765 (annars en ledig) och serverar `assets/web/`: `/` storskärmen, `/p` telefonen, `/room` spelrummet (bara från enheten själv). `/ws` är WebSocket, `/qr.svg` och `/join-colors` skickas vidare till spelrummet.
- Bryggan mellan appen och spelrummet är `src/shared/android.ts`: `ErovringenHost` (appen) och `erovringenRoom` (sidan). Anrop köas tills spelrummet sagt `ready()`.
- Adressen för telefonerna (wifi eller hotspot) läses av `NetworkWatcher` och skickas med `setBaseUrl`.
- Sparade spel ligger i `filesDir/sparade/`, loggen i `filesDir/logg/erovringen.log` (roterar vid 1 MB). Båda ligger kvar vid uppdatering av appen.
- Ingen förgrundstjänst: servern och spelrummet lever så länge aktiviteten gör det. Appen är gjord för att ligga framme.

## Bygga

GitHub bygger APK:n (`.github/workflows/android.yml`, vid release eller manuellt med "Run workflow"; filen heter `erovringen-android.apk`).

Lokalt (kräver JDK 17, Android SDK och Gradle 8.9):

```
npm ci
npm run build:android-web      # bygger webbfilerna till android/app/src/main/assets/web/
gradle -p android assembleRelease
```

APK:n hamnar i `android/app/build/outputs/apk/release/`. Utan egen nyckel signeras den med debug-nyckeln.

## Egen signeringsnyckel

Ger samma signatur vid varje version, så att appen kan uppdateras utan att avinstalleras.

```
keytool -genkeypair -v -keystore erovringen.keystore -alias erovringen \
  -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 erovringen.keystore > keystore.b64      # på Mac: base64 -i erovringen.keystore
```

Lägg in fyra hemligheter under Settings, Secrets and variables, Actions i GitHub-repot:

- `ANDROID_KEYSTORE_BASE64`: innehållet i `keystore.b64`
- `ANDROID_KEYSTORE_PASSWORD`: nyckelfilens lösenord
- `ANDROID_KEY_ALIAS`: `erovringen`
- `ANDROID_KEY_PASSWORD`: nyckelns lösenord

Spara nyckelfilen på ett säkert ställe och lägg den aldrig i git (`*.keystore` är ignorerad).
