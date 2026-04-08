# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Fog of Travel** is an Android-first mobile app (iOS later) that renders a "fog of war" over an interactive world map, lifting the fog wherever the user has traveled. Flight paths arc between visited cities. The full plan is in `plan.md`.

## Chosen Implementation: Under Deliberation

The plan outlines three approaches (Plan A: React Native, Plan B: Flutter, Plan C: Kotlin Native). The updated recommendation in `plan.md` favors **Plan C (Kotlin Native)** for the Android MVP due to JTS polygon performance and coroutine-based import pipeline, reversing the original Plan A recommendation. Confirm with the user which plan to implement before scaffolding.

### Core Stack

| Concern | Library |
|---|---|
| Framework | React Native 0.76+ (New Architecture) |
| Navigation | React Navigation 7 |
| Map | `@rnmapbox/maps` |
| State | Zustand |
| Local DB | `op-sqlite` |
| Geospatial | `@turf/great-circle`, `@turf/buffer`, `@turf/union`, `@turf/clusters-dbscan` |
| Animations | `react-native-reanimated` |
| File I/O | `react-native-fs` |
| Build | EAS Build (Expo) |
| Dates | `date-fns` |

## Planned Source Layout

```
src/
├── app/                    # Entry point, navigation stack
├── screens/
│   ├── MapScreen.tsx       # Primary fog map view
│   ├── FlightsScreen.tsx   # Flight log + arc overlay
│   ├── StatsScreen.tsx     # Stats dashboard
│   ├── ImportScreen.tsx    # Google Takeout import flow
│   └── SettingsScreen.tsx
├── components/
│   ├── FogLayer.tsx        # Mapbox fog polygon rendering
│   ├── FlightArc.tsx       # Great-circle arc component
│   ├── AirportMarker.tsx
│   └── StatCard.tsx
├── services/
│   ├── locationImporter.ts # Streaming Google Takeout parser
│   ├── fogComputer.ts      # Turf.js polygon math
│   ├── flightService.ts    # Flight CRUD + arc generation
│   └── database.ts         # SQLite schema + queries
├── stores/
│   ├── mapStore.ts         # Zustand: fog state, map viewport
│   └── flightStore.ts      # Zustand: flights list
└── utils/
    ├── geo.ts              # Coordinate helpers
    ├── clustering.ts       # DBSCAN clustering
    └── airports.ts         # IATA lookup (airports.json asset)
```

## Key Architectural Decisions

### Fog Rendering
1. Start with a GeoJSON polygon covering the entire world.
2. Buffer each visited-location cluster into a circle with `@turf/buffer`.
3. Subtract all visited circles from the world polygon with `@turf/difference`.
4. Render the resulting "unvisited" polygon as a semi-transparent Mapbox fill layer.
5. Pre-compute and cache the result in SQLite; recompute incrementally on new data.
6. Use Level-of-Detail (LOD) tiers: coarser clusters at low zoom, finer at high zoom.

### Location Import Pipeline
- Stream-parse Google Takeout `Records.json` in chunks (never load the whole file into memory).
- Run DBSCAN clustering to reduce millions of raw points to ~1K clusters for fog computation.
- Support both new (`Records.json`) and legacy (`Location History.json`) Takeout formats.

### SQLite Schema

```sql
location_points   (id, lat, lng, timestamp, source)
location_clusters (id, lat, lng, point_count, radius_m, lod)
fog_cache         (lod, geojson, updated_at)
flights           (id, origin_iata, dest_iata, lat, lng, date, airline, flight_number, distance_km, notes)
visited_regions   (id, region_type, region_code, region_name, first_visited)
```

### Performance Targets
- 1M location points: import + render in < 60 seconds.
- Memory during import: < 200 MB.
- Incremental fog recompute: < 2 seconds.

## Environment Setup (when project is initialized)

```bash
# Bootstrap (run once)
npx react-native init FogOfTravel --template react-native-template-typescript
cd FogOfTravel

# Install core deps
npm install @rnmapbox/maps @turf/great-circle @turf/buffer @turf/union @turf/clusters-dbscan \
  op-sqlite zustand react-native-fs react-native-reanimated date-fns

# iOS (future)
cd ios && pod install

# Android dev build
npx react-native run-android

# EAS build (production)
eas build --platform android
```

Mapbox requires an API key set via `MAPBOX_DOWNLOADS_TOKEN` (in `.env`, not committed) and configured in `android/gradle.properties`.
