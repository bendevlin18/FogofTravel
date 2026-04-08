import React, { useMemo, useState, useEffect } from 'react';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import Mapbox from '@rnmapbox/maps';
import { computeFogPolygon } from '../services/fogComputer';
import type { Feature, Polygon, MultiPolygon } from 'geojson';

/**
 * Hardcoded test locations (used when no imported data exists).
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
  fogOpacity?: number;
  fogColor?: string;
}

export default function FogLayer({
  visitedLocations,
  fogOpacity = 0.7,
  fogColor = '#1a1a2e',
}: FogLayerProps) {
  const locations = visitedLocations ?? TEST_VISITED_LOCATIONS;
  const [fogGeoJSON, setFogGeoJSON] = useState<Feature<Polygon | MultiPolygon> | null>(null);

  useEffect(() => {
    // Defer computation so the UI renders first
    const timer = setTimeout(() => {
      // Data is already clustered from SQL, pass lod=-1 to skip JS clustering
      const result = computeFogPolygon(locations, -1);
      setFogGeoJSON(result);
    }, 100);
    return () => clearTimeout(timer);
  }, [locations]);

  if (!fogGeoJSON) {
    return null;
  }

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
