# Fog Rendering — Technical Design

This document covers the fog-of-war overlay system: the core visual feature of Fog of Travel. Implementation targets **Plan A (React Native + Mapbox)**.

---

## The Problem

The entire world starts covered in fog. Everywhere the user has visited is revealed. With potentially millions of location data points, we need to:

1. Compute which areas are "visited" (buffered circles around location clusters)
2. Render the remaining "unvisited" area as a fog overlay on the Mapbox map
3. Do this fast enough that the map remains smooth during pan/zoom
4. Support incremental updates when new data is imported

---

## Two Rendering Modes

The user selects a fog mode during initial app setup. This can be changed later in Settings.

### Fast Mode

Designed for low-powered devices and large datasets. Prioritizes frame rate and import speed over visual fidelity.

**Approach: Circle layer with inverted fill**

Rather than computing a single massive "unvisited" polygon (the expensive boolean-operation approach), Fast Mode avoids polygon union/difference entirely:

1. Render a full-screen semi-transparent fog fill layer covering the world.
2. Render visited location clusters as a **Mapbox circle layer** on top, using `circle-color: transparent` and composited with `destination-out` blend mode to "punch holes" in the fog.
3. The circle radii scale with the cluster's `radius_m` value and the current zoom level.
4. At low zoom, show coarse clusters (LOD 0) with large radii. At high zoom, show fine clusters (LOD 2) with small radii.

**Why this works:**
- No polygon boolean operations at all. Zero Turf.js union/difference calls.
- Mapbox handles circle rendering natively on the GPU — thousands of circles are cheap.
- LOD switching is just swapping which SQLite rows feed the GeoJSON source.
- Incremental update: insert new clusters, Mapbox re-renders automatically.

**Visual trade-offs:**
- Revealed areas are circular, not organic/merged. Overlapping circles look fine but you can see individual circle edges at certain zoom levels.
- No smooth feathered edges between fog and revealed terrain (hard circle boundaries).
- Fog is a uniform color/opacity — no blur, gradient, or texture.

**Fog styles available in Fast Mode:**
- White fog (semi-transparent white fill)
- Dark shroud (semi-transparent dark fill)

**Performance characteristics:**
- Import + render for 1M points: target < 30 seconds (clustering only, no polygon math)
- Memory: < 100 MB (no intermediate GeoJSON polygon objects)
- Zoom-level LOD switch: < 100 ms
- Incremental recompute: < 500 ms

---

### Fancy Mode

Designed for capable devices. Richer visuals, at the cost of heavier computation.

**Approach: Pre-computed GeoJSON fog polygon with Turf.js**

This is the polygon-boolean approach, but with mitigations for the scaling problems:

1. **Hierarchical merge** to avoid sequential union blowup:
   - Spatially partition clusters into grid cells (e.g., 10x10 degree tiles).
   - Union the clusters within each cell first (small polygon, fast).
   - Then union the per-cell results together (fewer operations, manageable vertex counts).
   - This reduces the O(n) sequential union to O(n/k) unions of size k, followed by O(k) merges.

2. **Vertex simplification** after each merge step:
   - Use `@turf/simplify` (Douglas-Peucker) to reduce vertex counts in intermediate polygons.
   - Target: keep each intermediate polygon under 10K vertices.
   - Final fog polygon target: under 50K vertices.

3. **Polygon difference** to produce the fog:
   - Subtract the merged "visited" polygon from a world-covering rectangle.
   - The result is the "unvisited" polygon, rendered as a Mapbox `FillLayer`.

4. **Cached in SQLite** as GeoJSON per LOD tier. Recomputed only when new data arrives.

5. **Incremental recompute:**
   - New clusters are buffered and unioned into the existing "visited" polygon.
   - Only the affected grid cells are re-merged.
   - New difference is computed against the world polygon.
   - Target: < 2 seconds for incremental update.

**Visual trade-offs (positive):**
- Revealed areas merge together organically — overlapping visits produce smooth, natural coastlines.
- Supports feathered/gradient fog edges via Mapbox `fill-opacity` interpolation on the polygon boundary.
- Supports additional fog styles: watercolor fade (textured fill pattern), satellite blur (raster layer with opacity mask).

**Fog styles available in Fancy Mode:**
- White fog (semi-transparent fill)
- Dark shroud (semi-transparent dark fill)
- Watercolor fade (textured fill pattern with soft edges)
- Satellite blur (blurred raster underlay where fog is opaque)

**Performance characteristics:**
- Import + render for 1M points: target < 90 seconds (clustering + hierarchical merge + difference)
- Import + render for 5M points: target < 5 minutes
- Memory during fog computation: < 200 MB (intermediate polygon objects)
- Zoom-level LOD switch: < 500 ms (swap cached GeoJSON)
- Incremental recompute: < 2 seconds

---

## Scaling Mitigations (Fancy Mode)

The naive approach (sequentially union 1K polygons with Turf.js) fails at scale. These mitigations are essential:

### 1. Hierarchical spatial merge

```
Raw clusters (~1K)
  → Partition into spatial grid cells (~100 cells)
  → Union clusters within each cell (~10 unions of ~10 polygons each) 
  → Simplify each cell polygon (Douglas-Peucker, tolerance ~0.001 degrees)
  → Union cell polygons into final "visited" polygon (~10 merge steps)
  → Difference from world polygon → fog polygon
```

This keeps intermediate polygon complexity bounded. Each individual union operates on small polygons (few vertices), and simplification prevents vertex accumulation across merge steps.

### 2. Vertex budget

Enforce a maximum vertex count at each stage:
- Per-cluster buffer circle: 64 vertices
- Per-cell union result: 10K vertices max (simplify if exceeded)
- Final visited polygon: 50K vertices max
- If the budget is exceeded after simplification, increase the grid cell size (coarser spatial partitioning) to reduce merge complexity.

### 3. Web Worker offloading

Turf.js computations run on the JS thread. To avoid blocking the UI:
- Use `react-native-worklets-core` if Turf.js operations can be isolated into self-contained functions.
- Alternatively, compute fog in a headless JS context via `react-native-reanimated` worklets (limited — Turf.js may be too large to bundle in a worklet).
- Fallback: run fog computation in batches with `requestIdleCallback`-style yielding, updating a progress indicator. The map remains interactive during recompute with the previous cached fog polygon displayed.

### 4. LOD tiers

| LOD | Zoom range | Cluster source | Buffer radius | Use case |
|---|---|---|---|---|
| 0 | 0–5 (world/continent) | Coarse DBSCAN (eps=50km) | ~25 km | Broad strokes |
| 1 | 5–10 (country/region) | Medium DBSCAN (eps=5km) | ~2.5 km | Regional detail |
| 2 | 10+ (city/street) | Fine DBSCAN (eps=500m) | ~250 m | Street-level reveal |

Each LOD tier has its own pre-computed fog polygon cached in SQLite. On zoom change, swap the active GeoJSON source. The swap should feel instant since the polygons are pre-cached.

---

## Shared Infrastructure (Both Modes)

### DBSCAN Clustering

Both modes depend on clustering raw location points into manageable groups:

- Use `@turf/clusters-dbscan` on imported `location_points`.
- Run at three epsilon values to produce LOD 0, 1, and 2 cluster sets.
- Store clusters in `location_clusters` table with `lod` column.
- Clustering runs once per import, not per render.

### SQLite Schema (fog-related)

```sql
-- Pre-computed clusters for fog rendering
CREATE TABLE location_clusters (
  id INTEGER PRIMARY KEY,
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  point_count INTEGER,
  radius_m REAL,              -- Buffer radius for this cluster
  lod INTEGER                 -- 0=coarse, 1=medium, 2=fine
);
CREATE INDEX idx_clusters_lod ON location_clusters(lod);

-- Cached fog polygon per LOD tier (Fancy Mode only)
CREATE TABLE fog_cache (
  lod INTEGER PRIMARY KEY,
  geojson TEXT,               -- The "unvisited" polygon as GeoJSON
  updated_at INTEGER          -- Unix ms
);

-- User preference
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT
);
-- key='fog_mode', value='fast' or 'fancy'
```

### Mode Selection UX

During initial app setup (after onboarding, before first import):

> **Choose your fog style**
>
> **Fast** — Clean circle reveals. Best for older devices or very large location histories. Uses less battery.
>
> **Fancy** — Organic, merged fog boundaries with visual effects. Looks beautiful but uses more processing power.
>
> _You can change this anytime in Settings._

If the user selects Fancy Mode and a fog computation takes longer than 30 seconds, show a non-blocking toast suggesting they try Fast Mode for better performance.

---

## Risk Summary

| Risk | Affects | Mitigation |
|---|---|---|
| Turf.js union blows up vertex count | Fancy | Hierarchical merge + vertex budget + simplification |
| JS thread blocked during fog compute | Fancy | Batched computation with yielding; show stale fog during recompute |
| Mapbox can't render 50K+ vertex polygon smoothly | Fancy | Enforce vertex budget; degrade to Fast Mode if needed |
| Circle blend mode (`destination-out`) not supported on all devices | Fast | Fallback: render circles as opaque "revealed" patches on top of fog fill |
| User picks Fancy on a low-end device | Both | Performance detection on first compute; suggest Fast Mode if slow |

---

## Implementation Order

1. **Fast Mode first.** It's simpler (no polygon math), validates the clustering pipeline, and gives a working fog overlay to build the rest of the app against.
2. **Fancy Mode second.** Layer it on top of the same clustering infrastructure. The hierarchical merge and caching logic are the complex parts.
3. **Fog style themes last.** Once both modes work, add the visual variants (watercolor, satellite blur) as cosmetic enhancements.
