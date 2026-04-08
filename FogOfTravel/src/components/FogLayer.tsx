import React, { useMemo } from 'react';
import Mapbox from '@rnmapbox/maps';
import { computeFogPolygon } from '../services/fogComputer';

/**
 * Hardcoded test locations for the fog prototype.
 * [longitude, latitude]
 */
const TEST_VISITED_LOCATIONS: [number, number][] = [
  [-74.006, 40.7128],    // New York City
  [-87.6298, 41.8781],   // Chicago
  [-118.2437, 34.0522],  // Los Angeles
  [-0.1276, 51.5074],    // London
  [2.3522, 48.8566],     // Paris
  [139.6917, 35.6895],   // Tokyo
  [-43.1729, -22.9068],  // Rio de Janeiro
  [151.2093, -33.8688],  // Sydney
];

interface FogLayerProps {
  visitedLocations?: [number, number][];
  radiusKm?: number;
  fogOpacity?: number;
  fogColor?: string;
}

export default function FogLayer({
  visitedLocations = TEST_VISITED_LOCATIONS,
  radiusKm = 50,
  fogOpacity = 0.7,
  fogColor = '#1a1a2e',
}: FogLayerProps) {
  const fogGeoJSON = useMemo(() => {
    return computeFogPolygon(visitedLocations, radiusKm);
  }, [visitedLocations, radiusKm]);

  return (
    <Mapbox.ShapeSource id="fog-source" shape={fogGeoJSON}>
      <Mapbox.FillLayer
        id="fog-fill"
        style={{
          fillColor: fogColor,
          fillOpacity: fogOpacity,
        }}
      />
    </Mapbox.ShapeSource>
  );
}
