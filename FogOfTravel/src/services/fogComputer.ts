import * as turf from '@turf/helpers';
import buffer from '@turf/buffer';
import difference from '@turf/difference';
import type { Feature, Polygon, MultiPolygon } from 'geojson';

/**
 * World polygon covering the entire map.
 * Coordinates go counter-clockwise to represent the "fill" area.
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
 * Given an array of [lng, lat] points, compute the fog polygon.
 * The fog is the world minus buffered circles around each point.
 *
 * @param points - Array of [longitude, latitude] coordinates
 * @param radiusKm - Buffer radius around each point in kilometers
 * @returns GeoJSON Feature representing the fogged (unvisited) area
 */
export function computeFogPolygon(
  points: [number, number][],
  radiusKm: number = 50
): Feature<Polygon | MultiPolygon> {
  let fog: Feature<Polygon | MultiPolygon> = WORLD_POLYGON;

  for (const [lng, lat] of points) {
    const visited = buffer(turf.point([lng, lat]), radiusKm, {
      units: 'kilometers',
      steps: 32,
    });
    if (visited) {
      const result = difference(turf.featureCollection([fog, visited]));
      if (result) {
        fog = result;
      }
    }
  }

  return fog;
}
