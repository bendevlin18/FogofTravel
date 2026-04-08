# Fog of Travel — App Development Plan

## Vision

A mobile app that visualizes your travel history as a "fog of war" overlay on an interactive map. Everywhere you haven't been is shrouded in fog; everywhere you have been is revealed — a living, growing portrait of your exploration of the world. Flight paths arc between cities you've flown to, stitching your journeys together.

---

## Core Features

### 1. Fog Map
- Full interactive map (pan, zoom, rotate, tilt)
- Dense fog overlay covering the entire world by default
- Fog is "lifted" in a configurable radius around every location you've visited
- Smooth transitions between fog and revealed terrain
- Multiple fog styles: classic white fog, dark shroud, watercolor fade, satellite blur
- Stats overlay: % of world revealed, countries visited, distance traveled

### 2. Google Location History Import
- Import Google Takeout `Records.json` (new format) and `Location History.json` (legacy)
- Parse latitude/longitude/timestamp data
- Batch-process millions of data points efficiently (chunked + background worker)
- Deduplicate and cluster nearby points to reduce rendering load
- Show import progress with estimated time remaining
- Incremental re-import (detect and add only new points)

### 3. Flight Tracker
- Manual flight entry: origin, destination, date, airline, flight number (optional)
- Animated great-circle arc paths between airports
- Airport markers with IATA codes
- Flight log with sortable/filterable list
- Auto-suggest airports with search
- Stats: total flights, total air miles, unique airports, unique airlines
- Optional: parse flight data from email confirmations or boarding pass screenshots (future)

### 4. Manual Location Entry
- Long-press map to mark "I've been here"
- Search for a city/place and mark as visited
- Add trips with date ranges and notes
- Photo attachment per location (stored locally)

### 5. Stats & Achievements
- Countries visited counter with flag collection
- States/provinces/regions visited
- Continents visited
- "Explorer rank" gamification (e.g., Neighborhood Walker → Globe Trotter → World Conqueror)
- Heatmap mode: density of visits rather than binary fog
- Year-in-review animation

### 6. Data & Privacy
- All data stored on-device by default (SQLite)
- Optional cloud backup (encrypted) for cross-device sync
- Export data as JSON/CSV/KML
- No analytics or tracking — this is a privacy-first app

---

## Implementation Plans

Three approaches are outlined below, each with different trade-offs around development speed, native performance, and long-term maintainability.

---

### Plan A — React Native + Mapbox (Recommended)

**Why:** Best balance of cross-platform code sharing, map rendering performance, and ecosystem maturity. Mapbox GL has first-class support for custom layers, fog/haze effects, and GeoJSON rendering, which are central to this app.

#### Tech Stack

| Layer | Technology |
|---|---|
| Framework | React Native 0.76+ (New Architecture) |
| Navigation | React Navigation 7 |
| Map | `@rnmapbox/maps` (Mapbox GL Native wrapper) |
| Fog rendering | Mapbox `fill-extrusion` or `raster` layer with custom opacity mask |
| Local DB | `op-sqlite` (fastest SQLite for RN) or WatermelonDB |
| State management | Zustand |
| File parsing | Custom JS parser for Google Takeout JSON (streaming with `react-native-fs`) |
| Flight arcs | Mapbox `LineLayer` with great-circle interpolation (`@turf/great-circle`) |
| Airport data | Bundled static JSON (~10 KB, IATA codes + coordinates) |
| Background processing | `react-native-worklets-core` or `expo-task-manager` |
| Cloud sync (optional) | Supabase (Postgres + Auth + Storage) or Firebase |
| Build/deploy | EAS Build (Expo) or Fastlane |

#### Key Dependencies

```json
{
  "@rnmapbox/maps": "^10.x",
  "@turf/great-circle": "^7.x",
  "@turf/buffer": "^7.x",
  "@turf/union": "^7.x",
  "@turf/clusters-dbscan": "^7.x",
  "op-sqlite": "^7.x",
  "zustand": "^5.x",
  "react-native-fs": "^2.x",
  "react-native-reanimated": "^3.x",
  "react-navigation": "^7.x",
  "date-fns": "^4.x"
}
```

#### Fog Rendering Strategy

The fog effect is the hardest technical problem. Here's the approach:

1. **World polygon:** Start with a GeoJSON polygon covering the entire world.
2. **Visited areas:** For each location cluster, generate a buffered circle polygon using `@turf/buffer`.
3. **Difference operation:** Subtract all visited-area polygons from the world polygon using `@turf/difference`, leaving the "unvisited" polygon.
4. **Render:** Display the unvisited polygon as a semi-transparent fill layer on top of the map tiles.
5. **Performance:** Pre-compute the fog polygon on import, store it in SQLite as GeoJSON, and only recompute incrementally when new points are added.
6. **Level of detail:** At low zoom, use coarse clusters (large buffer radius). At high zoom, use fine-grained points (small buffer radius). Swap between pre-computed LOD layers on zoom change.

#### Architecture

```
src/
├── app/                    # Entry point, navigation
├── screens/
│   ├── MapScreen.tsx        # Main fog map
│   ├── FlightsScreen.tsx    # Flight log + arc map
│   ├── StatsScreen.tsx      # Stats dashboard
│   ├── ImportScreen.tsx     # Google Takeout import
│   └── SettingsScreen.tsx   # Preferences, export, backup
├── components/
│   ├── FogLayer.tsx         # Mapbox fog overlay logic
│   ├── FlightArc.tsx        # Great-circle arc component
│   ├── AirportMarker.tsx    # Airport pin + label
│   └── StatCard.tsx         # Reusable stat display
├── services/
│   ├── locationImporter.ts  # Google Takeout parser
│   ├── fogComputer.ts       # Turf.js fog polygon math
│   ├── flightService.ts     # Flight CRUD + arc generation
│   └── database.ts          # SQLite schema + queries
├── stores/
│   ├── mapStore.ts          # Zustand: map state, fog data
│   └── flightStore.ts       # Zustand: flights
├── utils/
│   ├── geo.ts               # Coordinate helpers
│   ├── clustering.ts        # DBSCAN clustering for perf
│   └── airports.ts          # Airport lookup
└── assets/
    └── airports.json        # Static IATA database
```

#### Data Model (SQLite)

```sql
-- Raw imported points (millions of rows)
CREATE TABLE location_points (
  id INTEGER PRIMARY KEY,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  timestamp INTEGER,          -- Unix ms
  source TEXT DEFAULT 'google' -- 'google', 'manual', 'gps'
);
CREATE INDEX idx_loc_coords ON location_points(lat, lng);

-- Pre-computed clusters for fog rendering
CREATE TABLE location_clusters (
  id INTEGER PRIMARY KEY,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  point_count INTEGER,
  radius_m REAL,              -- Buffer radius used
  lod INTEGER                 -- Level of detail tier (0=coarse, 2=fine)
);

-- Cached fog polygon per LOD tier
CREATE TABLE fog_cache (
  lod INTEGER PRIMARY KEY,
  geojson TEXT,               -- The "unvisited" polygon
  updated_at INTEGER
);

-- Flights
CREATE TABLE flights (
  id INTEGER PRIMARY KEY,
  origin_iata TEXT NOT NULL,
  dest_iata TEXT NOT NULL,
  origin_lat REAL,
  origin_lng REAL,
  dest_lat REAL,
  dest_lng REAL,
  date TEXT,                  -- ISO 8601
  airline TEXT,
  flight_number TEXT,
  distance_km REAL,
  notes TEXT
);

-- Visited countries / regions (derived)
CREATE TABLE visited_regions (
  id INTEGER PRIMARY KEY,
  region_type TEXT,           -- 'country', 'state', 'continent'
  region_code TEXT,           -- ISO 3166-1/2
  region_name TEXT,
  first_visited INTEGER       -- Unix ms
);
```

#### Workflow

1. **Setup:** `npx react-native init FogOfTravel` or use Expo prebuild
2. **Map integration:** Configure Mapbox API key, render base map
3. **Fog layer:** Implement fog polygon computation + rendering
4. **Import pipeline:** Build streaming JSON parser for Takeout data → cluster → compute fog → cache
5. **Flight tracker:** CRUD screens + great-circle rendering
6. **Stats:** Query SQLite for aggregates, render dashboard
7. **Polish:** Animations, onboarding, fog style themes
8. **Android release:** Google Play Console, AAB build via EAS/Fastlane
9. **iOS release:** Xcode signing, App Store Connect (future phase)

#### Estimated Timeline

| Phase | Duration |
|---|---|
| Map + fog core | 3–4 weeks |
| Google import pipeline | 2 weeks |
| Flight tracker | 2 weeks |
| Stats + achievements | 1–2 weeks |
| Polish, testing, onboarding | 2 weeks |
| Play Store submission | 1 week |
| **Total (Android MVP)** | **~11–13 weeks** |

#### Pros

- **Cross-platform with one codebase.** Ship Android now, iOS later with ~85–90% shared code.
- **Mature map binding.** `@rnmapbox/maps` is the most battle-tested mobile Mapbox wrapper with a large community, active maintenance, and extensive documentation.
- **Rich geospatial ecosystem.** Turf.js is the de facto standard for browser/JS geospatial math. Well-documented, well-tested, and feature-complete.
- **Fast iteration.** Hot reload, large npm ecosystem, and Expo/EAS streamline development and CI/CD.
- **Proven fog approach.** The Turf.js polygon-difference technique has been used in similar "fog of war" map projects in the web/JS world.

#### Cons

- **Single-threaded JS engine.** Hermes runs all JS on one thread. Heavy geospatial computation (DBSCAN clustering, polygon boolean ops on thousands of clusters) will block the UI thread and cause jank. `react-native-worklets-core` helps for simple worklets, but Turf.js is not worklet-compatible — you'd need a custom JSI bridge or a background-thread workaround, which is non-trivial.
- **Turf.js polygon operations don't scale well.** `@turf/union` uses the Martinez polygon-clipping algorithm. Sequentially unioning ~1K buffered circles accumulates vertices rapidly — the resulting polygon can have 100K+ vertices, causing both the union computation and subsequent Mapbox rendering to become very slow. This is the **single biggest technical risk** in Plan A.
- **Bridge overhead.** Passing large GeoJSON strings (potentially megabytes) from JS to the native Mapbox layer incurs serialization cost. Frequent fog-polygon updates during zoom-level changes could cause noticeable lag.
- **Memory pressure in JS.** Turf.js creates many intermediate GeoJSON objects during polygon operations. Combined with streaming millions of Takeout points, this can push JS heap memory toward the 200 MB target.
- **RN New Architecture is still maturing.** Not all third-party libraries fully support Fabric + TurboModules yet. Some `@rnmapbox/maps` features may lag behind the native SDK.

#### Potential Issues

1. **Fog computation bottleneck.** The timeline estimate of 3–4 weeks for "Map + fog core" may be optimistic if the polygon union approach hits performance walls at scale. You may need to switch to a tile-based or mask-layer approach for fog rendering, which would be a significant architectural pivot.
2. **Streaming JSON in RN.** `react-native-fs` can read files in chunks, but wiring that into a proper streaming JSON parser (handling partial records across chunk boundaries) requires careful implementation. There's no off-the-shelf streaming JSON parser for RN that handles multi-GB files gracefully.
3. **Mapbox GeoJSON rendering limits.** Mapbox GL Native has practical limits on GeoJSON complexity. A fog polygon with 100K+ vertices after union operations may cause the map to stutter or drop frames during pan/zoom.

---

### Plan B — Flutter + Mapbox GL

**Why:** Flutter's rendering engine gives more control over custom paint operations (the fog effect could be drawn as a custom Canvas overlay). Dart's strong typing and hot reload accelerate development. Good choice if you prefer Dart or want pixel-perfect UI control.

#### Tech Stack

| Layer | Technology |
|---|---|
| Framework | Flutter 3.24+ |
| Map | `mapbox_maps_flutter` (official Mapbox SDK) |
| Fog rendering | Mapbox annotation layers OR Flutter `CustomPainter` overlay |
| Local DB | `drift` (type-safe SQLite for Dart) |
| State management | Riverpod 2 |
| File parsing | Dart `isolate` for background JSON parsing |
| Flight arcs | `mapbox_maps_flutter` PolylineAnnotation with great-circle math |
| Geo math | `turf_dart` or `geolocator` |
| Airport data | Bundled JSON asset |
| Build/deploy | `flutter build appbundle`, Fastlane, or Codemagic |

#### Key Dependencies

```yaml
dependencies:
  mapbox_maps_flutter: ^2.x
  drift: ^2.x
  riverpod: ^2.x
  turf_dart: ^0.x        # Dart port of Turf.js (partial)
  path_provider: ^2.x
  file_picker: ^8.x
  fl_chart: ^0.x          # Stats charts
  intl: ^0.x
  freezed_annotation: ^2.x

dev_dependencies:
  drift_dev: ^2.x
  build_runner: ^2.x
  freezed: ^2.x
```

#### Fog Rendering Strategy (Flutter Variant)

Two sub-approaches:

- **Option B1 — Mapbox layer (same as Plan A):** Compute the fog GeoJSON polygon in Dart, pass it to the Mapbox SDK as a `FillLayer`. This is simpler but less customizable visually.
- **Option B2 — CustomPainter overlay:** Render the map underneath, then draw a Flutter `CustomPainter` on top that paints fog everywhere except visited areas. This allows richer visual effects (blur, gradient edges, animated fog particles) but requires manual coordinate-to-pixel projection synced with map gestures. More complex, but produces a more distinctive look.

**Recommendation:** Start with B1 for MVP, migrate to B2 for visual polish.

#### Trade-offs vs Plan A

| Dimension | React Native (Plan A) | Flutter (Plan B) |
|---|---|---|
| Map ecosystem | Mature (`rnmapbox` is battle-tested) | Newer (`mapbox_maps_flutter` is official but younger) |
| Fog effects | Mapbox layers are sufficient | CustomPainter enables richer visuals |
| Background parsing | Hermes engine is fast, but JS is single-threaded without workarounds | Dart isolates give true multi-threading |
| Hiring/community | Larger RN talent pool | Growing Flutter talent pool |
| iOS parity | Shared codebase, near-identical | Shared codebase, pixel-identical |
| Bundle size | ~15–25 MB | ~10–20 MB |

#### Pros

- **True multi-threading via Dart isolates.** The heavy geospatial work (clustering, polygon boolean ops, Takeout parsing) can run on dedicated isolates without touching the UI thread. This is a significant advantage over Plan A's single-threaded JS engine.
- **CustomPainter enables richer fog visuals.** Gaussian blur, gradient edges, animated fog particles, watercolor effects — things that are difficult or impossible with Mapbox fill layers alone. This directly supports the "multiple fog styles" feature.
- **Pixel-identical cross-platform rendering.** Flutter's own rendering engine means the fog visuals look exactly the same on Android and iOS — no platform-specific rendering quirks.
- **Strong type system and tooling.** Dart's sound null safety, drift's type-safe SQL, and freezed's immutable data classes reduce entire categories of bugs.
- **Smaller bundle size.** Flutter apps typically ship at 10–20 MB, slightly smaller than RN.

#### Cons

- **`mapbox_maps_flutter` is younger.** While it's the official Mapbox Flutter SDK, it has fewer community examples, Stack Overflow answers, and edge-case coverage than `@rnmapbox/maps`. You'll hit undocumented behavior more often.
- **`turf_dart` is an incomplete port.** This is a **critical risk**. The Dart port of Turf.js does not implement all operations — specifically, `difference` and `union` (the polygon boolean ops central to the fog algorithm) may be missing or buggy. You'd likely need to FFI into JTS (via platform channels to Java/Kotlin on Android, and a C/C++ library on iOS), which adds significant complexity and defeats some of the cross-platform benefit.
- **PlatformView performance on Android.** Flutter renders maps via Android's PlatformView mechanism, which has known compositing overhead and gesture-handling quirks. Scrolling, pinch-zoom, and rotation on the map may feel slightly less smooth than native.
- **CustomPainter coordinate sync is hard.** Option B2 (Flutter overlay on top of Mapbox) requires translating map coordinates to screen pixels in real time during gestures. Getting this jitter-free during pinch-zoom and rotation is a known hard problem — any frame-lag between the map and the overlay is very visible.
- **Smaller geospatial ecosystem.** Dart/Flutter has far fewer geospatial libraries than JS or Java/Kotlin. If you hit a gap in turf_dart, there's no easy alternative.

#### Potential Issues

1. **turf_dart feature gaps could block MVP.** If polygon `union`/`difference` operations are missing or unreliable, the entire fog rendering pipeline stalls. Mitigation: verify turf_dart capabilities before committing to Plan B, or plan for JTS FFI from day one.
2. **Map gesture conflicts.** Flutter's gesture system and Mapbox's own gesture handling can conflict, causing double-handling of taps or swallowed gestures. This requires careful gesture disambiguation.
3. **CustomPainter fog at scale.** Drawing fog as a Flutter canvas overlay means the app is painting over every pixel on every frame. On older devices, this can be expensive, especially at full-screen resolution with blur effects.

---

### Plan C — Kotlin (Android-First Native) + Compose

**Why:** Maximum Android performance and platform integration. Best if you want the tightest, most performant Android experience first and are willing to build iOS separately later (in Swift/SwiftUI). No cross-platform abstraction layer.

#### Tech Stack

| Layer | Technology |
|---|---|
| Language | Kotlin 2.0 |
| UI | Jetpack Compose |
| Map | Mapbox Maps SDK for Android (`com.mapbox.maps`) |
| Fog rendering | Mapbox `FillLayer` + GeoJSON source |
| Local DB | Room (SQLite abstraction) |
| State management | Compose ViewModel + StateFlow |
| File parsing | Kotlin coroutines + `kotlinx.serialization` streaming parser |
| Flight arcs | Mapbox `LineLayer` with great-circle interpolation |
| Geo math | JTS Topology Suite (`org.locationtech.jts`) or Turf-Android |
| DI | Hilt |
| Build/deploy | Gradle, Play Console |

#### Key Dependencies

```kotlin
// build.gradle.kts
dependencies {
    implementation("com.mapbox.maps:android:11.x")
    implementation("com.mapbox.mapboxsdk:mapbox-sdk-turf:7.x")
    implementation("androidx.room:room-ktx:2.6.x")
    implementation("androidx.lifecycle:lifecycle-viewmodel-compose:2.8.x")
    implementation("com.google.dagger:hilt-android:2.51.x")
    implementation("org.jetbrains.kotlinx:kotlinx-serialization-json:1.7.x")
    implementation("org.locationtech.jts:jts-core:1.20.x")
    implementation("io.coil-kt:coil-compose:2.x")
}
```

#### Trade-offs vs Cross-Platform Plans

| Dimension | Native Kotlin (Plan C) | Cross-Platform (A or B) |
|---|---|---|
| Android performance | Best possible | Very good (95%+ of native) |
| Map rendering | Direct SDK access, full API surface | Wrapper with slight lag in new feature adoption |
| iOS effort | Must rebuild from scratch (Swift/SwiftUI) | Shared codebase, ~90% code reuse |
| Development speed (Android only) | Fast (Compose is excellent) | Similar |
| Long-term maintenance | Two codebases | One codebase |

#### Pros

- **Best Android performance, period.** No abstraction layer, no bridge, no rendering overhead. Direct access to the GPU, native memory management, and platform APIs. For a map-heavy app processing millions of data points, this matters.
- **JTS is the gold standard for polygon operations.** The Java Topology Suite is a mature, heavily optimized library for polygon boolean operations (union, difference, intersection). It handles edge cases (self-intersections, topology errors, degenerate geometries) that Turf.js and turf_dart struggle with. Unioning 1K polygons with JTS is dramatically faster and more robust than with Turf.js.
- **Kotlin coroutines + structured concurrency.** The import pipeline (streaming JSON parse → batch SQLite insert → DBSCAN cluster → polygon compute) maps naturally to coroutine flows with backpressure. No single-thread limitations, no isolate overhead.
- **Direct Mapbox SDK access.** Every Mapbox Android API is available on day one — no waiting for wrapper libraries to expose new features. Full control over layer ordering, source management, and render callbacks.
- **Room is mature and performant.** Android's official SQLite abstraction with compile-time query verification, reactive queries via Flow, and excellent migration support.
- **`kotlinx.serialization` streaming parser.** Handles multi-GB JSON files natively with coroutine integration — no chunk-boundary headaches.

#### Cons

- **No iOS code sharing.** If iOS is on the roadmap, you're building a second app from scratch in Swift/SwiftUI. This roughly doubles total development effort for cross-platform parity.
- **Smaller addressable audience at launch.** Android-only limits initial reach. If early user feedback or traction matters, shipping on one platform first is a risk.
- **Compose + Mapbox integration requires custom work.** Mapbox's Android SDK is View-based, not Compose-native. Wrapping it in `AndroidView` composable works but introduces some Compose-View interop friction (recomposition, state, gestures).
- **Two codebases to maintain long-term.** Even if you defer iOS, eventual cross-platform means maintaining two separate apps with different languages, tooling, and release processes.
- **Steeper onboarding for contributors.** If you ever want collaborators, finding Kotlin/Compose + Mapbox expertise is a narrower pool than React Native developers.

#### Potential Issues

1. **Compose-Mapbox gesture conflicts.** The Mapbox MapView handles its own touch events. Embedding it in a Compose layout with other gesture detectors (e.g., bottom sheets, swipe-to-dismiss) can cause gesture theft. Requires careful `NestedScrollConnection` and touch delegation.
2. **JTS dependency size.** JTS pulls in a significant chunk of Java geometry code (~2 MB). Not a deal-breaker, but worth noting for APK size.
3. **iOS rebuild cost is real.** The plan treats iOS as "future phase," but if user demand arises early, the pressure to ship iOS with no shared code will be painful. Swift/SwiftUI + MapKit (or Mapbox iOS SDK) is a very different codebase.

---

## Recommendation

### Comparative Summary

| Dimension | Plan A (React Native) | Plan B (Flutter) | Plan C (Kotlin Native) |
|---|---|---|---|
| **Cross-platform story** | Strong (one codebase, iOS later) | Strong (one codebase, pixel-identical) | None (Android only; iOS from scratch) |
| **Fog computation performance** | Weak — Turf.js on single JS thread | Medium — Dart isolates help, but turf_dart is incomplete | Strong — JTS is fast, robust, and runs on coroutines |
| **Fog visual richness** | Limited to Mapbox fill layers | Best — CustomPainter allows blur, gradients, particles | Limited to Mapbox fill layers |
| **Map SDK maturity** | Best — @rnmapbox/maps is battle-tested | Adequate — official but younger SDK | Best — direct native SDK, full API surface |
| **Geospatial library ecosystem** | Good (Turf.js is feature-complete) | Risky (turf_dart is partial) | Best (JTS is the gold standard) |
| **Heavy import pipeline** | Challenging — JS single-thread bottleneck | Good — Dart isolates handle multi-threading | Best — coroutines + kotlinx.serialization |
| **Time to Android MVP** | ~11–13 weeks | ~12–14 weeks | ~10–12 weeks |
| **Time to add iOS** | +2–3 weeks (shared codebase) | +2–3 weeks (shared codebase) | +10–14 weeks (rebuild in Swift) |
| **Risk of architectural pivot** | High — Turf.js polygon scaling | Medium — turf_dart gaps | Low — JTS handles scale |

### Critical Issue: Polygon Boolean Operations at Scale

The fog rendering pipeline depends on computing the union of ~1K buffered circles and then differencing that from a world polygon. This operation is the load-bearing technical challenge of the app:

- **Turf.js (Plan A):** Uses the Martinez polygon-clipping algorithm. Sequentially unioning 1K polygons causes vertex counts to balloon (100K+ vertices in the result), with each successive union getting slower. At scale, this is likely to exceed the performance targets. Workarounds exist (hierarchical merge, tile-based approach) but they add significant complexity and may require rethinking the rendering strategy.
- **turf_dart (Plan B):** May not implement `union`/`difference` at all, or may have bugs in edge cases. This is a blocking risk that must be verified before committing to Plan B. Fallback is FFI to JTS, which undermines the simplicity of the cross-platform approach.
- **JTS (Plan C):** Purpose-built for this. Handles degenerate geometries, self-intersections, and large polygon sets. Supports `CascadedPolygonUnion` (optimized bulk union using a spatial index) which is orders of magnitude faster than sequential union. This is the only option where the fog algorithm is low-risk.

### Which Plan to Choose

**If iOS is important within the first 6 months → Plan A**, despite its performance risks. The cross-platform payoff is real, and the fog computation bottleneck can potentially be mitigated with:
- A tile-based fog approach instead of global polygon boolean ops
- Pre-computing fog at coarser LOD and progressively refining
- Moving polygon math to a native module (essentially embedding JTS via JSI)
- Using Mapbox's native clustering instead of JS-side DBSCAN

The risk is that you may need to abandon the Turf.js polygon-difference approach mid-development and switch to a mask/tile strategy, which would be a significant rework of the fog rendering pipeline.

**If Android is the only near-term target and performance matters most → Plan C.** JTS solves the hardest technical problem (polygon boolean ops) out of the box. Kotlin coroutines make the import pipeline clean and performant. Direct Mapbox SDK access eliminates an entire class of wrapper-related bugs. The trade-off is real: no iOS code sharing. But for an Android-first app where the core challenge is heavy geospatial computation, native Kotlin is the lowest-risk path to a performant MVP.

**Plan B is the weakest option for this specific app.** The turf_dart gap is a potential blocker, the PlatformView performance overhead undermines the map experience, and the CustomPainter advantage (richer fog visuals) is a nice-to-have, not a must-have for MVP. Plan B would be stronger for an app where the map is secondary and custom UI rendering is primary.

### Updated Recommendation

**Plan C (Kotlin Native)** is the recommended path, reversing the original recommendation. The reasoning:

1. **The hardest problem is geospatial computation, not cross-platform reach.** JTS vs. Turf.js is the difference between a fog algorithm that works reliably at scale and one that may need emergency rearchitecting mid-development.
2. **Android-first is already the stated strategy.** The plan already defers iOS. Choosing React Native to "keep the iOS option open" adds real technical risk to the Android MVP for a speculative future benefit.
3. **Kotlin coroutines are a natural fit** for the streaming import pipeline with backpressure, concurrent clustering, and incremental fog recomputation.
4. **Time to Android MVP is comparable** (10–12 weeks native vs. 11–13 weeks RN), and the native version is more likely to hit performance targets without mid-project pivots.
5. **iOS can be revisited later** with Kotlin Multiplatform (KMP) sharing the data/domain layer, or as a separate SwiftUI app sharing the architectural patterns.

Plan A remains a viable choice if cross-platform is a hard requirement. But for this app's specific technical profile — millions of data points, heavy polygon math, map-centric UX — native Kotlin is the safer bet.

---

## Google Takeout Import — Technical Detail

This is a critical workflow, so here's the detailed pipeline:

### User Flow

1. User goes to [Google Takeout](https://takeout.google.com)
2. Selects "Location History" and exports as JSON
3. Downloads the `.zip` file to their phone (or transfers from desktop)
4. Opens the app → Settings → Import → selects the `.zip` or extracted `.json`
5. App shows progress bar with point count and estimated time
6. On completion, fog map updates to reveal all visited areas

### Parsing Pipeline

```
ZIP file
  → Extract Records.json (new format) or Location History.json (legacy)
  → Stream-parse JSON (do NOT load entire file into memory)
  → For each location record:
      Extract: latitudeE7 / longitudeE7 / timestamp
      Convert: lat = latitudeE7 / 1e7, lng = longitudeE7 / 1e7
      Filter: discard records with accuracy > 1000m
      Batch-insert into SQLite (1000 rows per transaction)
  → Run DBSCAN clustering on all points
  → Generate fog polygon per LOD tier
  → Cache fog polygons in fog_cache table
  → Update map
```

### Performance Targets

| Metric | Target |
|---|---|
| 1M location points | < 60 seconds to import + render |
| 5M location points | < 5 minutes |
| Memory usage during import | < 200 MB |
| Fog polygon recompute (incremental) | < 2 seconds |

---

## Flight Tracker — Technical Detail

### Airport Database

Bundle a static JSON file (~6,000 airports) with fields: `iata`, `name`, `city`, `country`, `lat`, `lng`. Source: [OurAirports](https://ourairports.com/data/) (public domain).

### Great-Circle Arc Rendering

Use `@turf/great-circle` to generate a GeoJSON `LineString` with ~100 interpolated points along the great-circle path between origin and destination. Render as a Mapbox `LineLayer` with a dashed or gradient style and optional animation (animated dash offset).

### Flight Entry UI

- Two airport search fields with autocomplete (fuzzy match on IATA code, city name, airport name)
- Date picker
- Optional: airline, flight number, seat, notes
- "Quick add" mode: just type `JFK → LAX` and it parses both airports
- Swipe-to-delete in flight list

---

## Future Roadmap (Post-MVP)

| Feature | Priority | Notes |
|---|---|---|
| iOS release | High | Shared codebase (Plan A/B) makes this straightforward |
| Live GPS tracking | High | Background location service to auto-reveal fog as you move |
| Cloud sync | Medium | Supabase or Firebase for multi-device |
| Social sharing | Medium | Share fog map as image/video, compare with friends |
| Road trip mode | Medium | Trace actual driving routes, not just point buffers |
| Email flight import | Low | Parse airline confirmation emails for auto-adding flights |
| Boarding pass OCR | Low | Camera scan of boarding pass to extract flight info |
| Offline map tiles | Low | Download map regions for use without connectivity |
| Widgets | Low | Android home screen widget showing % explored |
| Apple Watch / Wear OS | Low | Glanceable stats on wrist |

---

## Risk Register

| Risk | Impact | Mitigation |
|---|---|---|
| Google Takeout format changes | Medium | Abstract parser behind interface; support both known formats; add format-version detection |
| Mapbox pricing (>25K monthly active users) | Medium | Free tier covers 25K MAU. Evaluate MapLibre GL (open-source fork) as fallback |
| Performance with 10M+ points | High | Aggressive clustering, LOD tiers, fog polygon caching, spatial indexing |
| Large Takeout files (>1 GB) crash on low-RAM devices | High | Streaming JSON parser, never load full file into memory, chunked processing |
| App Store rejection (iOS) | Low | Follow Apple guidelines from the start; no private APIs |

---

## Getting Started Checklist

- [ ] Create Mapbox account, get API access token
- [ ] Set up React Native project with New Architecture enabled
- [ ] Integrate `@rnmapbox/maps` and render a base map
- [ ] Implement basic fog overlay with a hardcoded test polygon
- [ ] Build the Takeout JSON streaming parser
- [ ] Wire parser → clustering → fog polygon → map layer
- [ ] Build flight entry UI + great-circle rendering
- [ ] Add stats dashboard
- [ ] Design onboarding flow
- [ ] Set up EAS Build for Android
- [ ] Submit to Google Play Console
