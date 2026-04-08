# MWE Setup Notes

Issues encountered getting the app running on a physical Android device via `npx expo run:android`.

## Java 26 → 17

The Kotlin Gradle plugin can't parse Java 26. Switch to Java 17 before building:

```bash
export JAVA_HOME=$(/usr/libexec/java_home -v 17)
```

Add to `~/.zshrc` to make permanent. Installed via `brew install --cask temurin@17`.

## Corrupt NDK

NDK at `~/Library/Android/sdk/ndk/27.1.12297006` was missing `source.properties`. Fixed by deleting the folder and reinstalling via Android Studio SDK Manager (Settings → SDK Tools → NDK).

## Mapbox Native Token

The Mapbox native SDK initializes before the JS bridge runs `Mapbox.setAccessToken()`, so the token must be available at the native level. Fixed by reading the token from `.env` in `android/app/build.gradle` and injecting it as an Android resource:

```gradle
// In defaultConfig block
def envFile = new File(projectRoot, '.env')
def mapboxToken = ''
if (envFile.exists()) {
    envFile.eachLine { line ->
        if (line.startsWith('EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN=')) {
            mapboxToken = line.split('=', 2)[1].trim()
        }
    }
}
resValue "string", "mapbox_access_token", mapboxToken
```

## URI Scheme for Dev Client

The dev client needs a custom URI scheme. Added `"scheme": "fogoftravel"` to `app.json` under the `expo` key.

## Dev Server Mode

`npx expo start` defaults to Expo Go, which doesn't support native modules like Mapbox. Use development build mode:

- Run `npx expo run:android` (builds native app and starts Metro automatically)
- Or run `npx expo start --dev-client` separately
