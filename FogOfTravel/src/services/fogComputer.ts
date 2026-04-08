import * as turf from '@turf/helpers';
import buffer from '@turf/buffer';
import difference from '@turf/difference';
import union from '@turf/union';
import type { Feature, Polygon, MultiPolygon, FeatureCollection } from 'geojson';
import { gridCluster, LOD_TIERS, type Cluster } from './clustering';

/**
 * World polygon covering the entire map.
 */
const WORLD_POLYGON: Feature<Polygon> = turf.polygon([
  [
    [-180, -90],
    [180, -90],
    [180, 90],
    [-180, 90],
    [-180, -90],
  ],
]);

/**
 * Compute the fog polygon from raw location points.
 * Steps:
 * 1. Grid-cluster the raw points to reduce count
 * 2. Buffer each cluster into a circle
 * 3. Batch-union all circles into a single "visited" polygon
 * 4. Subtract visited from the world polygon → fog
 *
 * @param points - Array of [longitude, latitude]
 * @param lod - Level of detail tier (0=coarse, 1=medium, 2=fine). Use -1 for pre-clustered data.
 * @returns GeoJSON Feature representing the fogged (unvisited) area, or null on error
 */
export function computeFogPolygon(
  points: [number, number][],
  lod: number = 0
): Feature<Polygon | MultiPolygon> {
  if (points.length === 0) {
    return WORLD_POLYGON;
  }

  let clusterCoords: [number, number][];
  let radiusKm: number;

  if (lod === -1) {
    // Pre-clustered data (from SQL GROUP BY), skip JS clustering
    clusterCoords = points;
    radiusKm = 30; // Default radius for pre-clustered
  } else {
    const tier = LOD_TIERS[lod] ?? LOD_TIERS[0];
    const clusters = gridCluster(points, tier.gridSizeDeg);
    clusterCoords = clusters.map((c) => [c.lng, c.lat]);
    radiusKm = tier.radiusKm;
  }

  console.log(`[fog] ${points.length} points → ${clusterCoords.length} clusters, radius=${radiusKm}km`);

  // Buffer each cluster into a circle
  const circles: Feature<Polygon>[] = [];
  for (const [lng, lat] of clusterCoords) {
    const circle = buffer(turf.point([lng, lat]), radiusKm, {
      units: 'kilometers',
      steps: 16, // Fewer vertices for performance
    });
    if (circle) {
      circles.push(circle as Feature<Polygon>);
    }
  }

  if (circles.length === 0) {
    return WORLD_POLYGON;
  }

  // Batch-union circles into a single visited polygon using pairwise merge.
  // This is O(n log n) instead of O(n²) from sequential union.
  const visited = pairwiseUnion(circles);

  if (!visited) {
    return WORLD_POLYGON;
  }

  // Single difference: world minus all visited areas
  const fog = difference(turf.featureCollection([WORLD_POLYGON, visited]));
  return fog ?? WORLD_POLYGON;
}

/**
 * Pairwise (hierarchical) union of polygons.
 * Merges adjacent pairs, then merges results, etc.
 * Much faster than sequential union for large arrays.
 */
function pairwiseUnion(
  features: Feature<Polygon | MultiPolygon>[]
): Feature<Polygon | MultiPolygon> | null {
  if (features.length === 0) return null;
  if (features.length === 1) return features[0];

  let current = features;

  while (current.length > 1) {
    const next: Feature<Polygon | MultiPolygon>[] = [];

    for (let i = 0; i < current.length; i += 2) {
      if (i + 1 < current.length) {
        const merged = union(turf.featureCollection([current[i], current[i + 1]]));
        if (merged) {
          next.push(merged);
        } else {
          next.push(current[i]);
        }
      } else {
        // Odd one out, carry forward
        next.push(current[i]);
      }
    }

    current = next;
  }

  return current[0];
}
