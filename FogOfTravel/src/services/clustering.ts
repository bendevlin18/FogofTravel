/**
 * Grid-based spatial clustering.
 *
 * Bins points into grid cells of a given resolution (in degrees),
 * then returns the centroid of each cell weighted by point count.
 * This is O(n) and deterministic — much faster than DBSCAN for large datasets.
 */

export interface Cluster {
  lat: number;
  lng: number;
  pointCount: number;
}

/**
 * Cluster [lng, lat] points into grid cells.
 *
 * @param points - Array of [longitude, latitude]
 * @param gridSizeDeg - Grid cell size in degrees (default 0.1° ≈ 11km)
 * @returns Array of cluster centroids with point counts
 */
export function gridCluster(
  points: [number, number][],
  gridSizeDeg: number = 0.1
): Cluster[] {
  const cells = new Map<string, { sumLat: number; sumLng: number; count: number }>();

  for (const [lng, lat] of points) {
    // Quantize to grid cell
    const cellLat = Math.floor(lat / gridSizeDeg);
    const cellLng = Math.floor(lng / gridSizeDeg);
    const key = `${cellLat},${cellLng}`;

    const cell = cells.get(key);
    if (cell) {
      cell.sumLat += lat;
      cell.sumLng += lng;
      cell.count++;
    } else {
      cells.set(key, { sumLat: lat, sumLng: lng, count: 1 });
    }
  }

  const clusters: Cluster[] = [];
  for (const cell of cells.values()) {
    clusters.push({
      lat: cell.sumLat / cell.count,
      lng: cell.sumLng / cell.count,
      pointCount: cell.count,
    });
  }

  return clusters;
}

/**
 * LOD (Level of Detail) configurations.
 * Coarser grids for zoomed-out views, finer for zoomed-in.
 */
export const LOD_TIERS = [
  { lod: 0, gridSizeDeg: 0.5, radiusKm: 30 },  // Coarse — world view
  { lod: 1, gridSizeDeg: 0.1, radiusKm: 10 },   // Medium — country view
  { lod: 2, gridSizeDeg: 0.02, radiusKm: 3 },    // Fine — city view
] as const;
