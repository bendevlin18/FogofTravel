import React, { useState, useEffect, useRef } from 'react';
import Mapbox from '@rnmapbox/maps';
import { InteractionManager } from 'react-native';
import { computeFogPolygon } from '../services/fogComputer';
import { getFogCache, setFogCache } from '../services/database';
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

const FOG_LOD = -1; // Pre-clustered data LOD key

export default function FogLayer({
  visitedLocations,
  fogOpacity = 0.7,
  fogColor = '#1a1a2e',
}: FogLayerProps) {
  const locations = visitedLocations ?? TEST_VISITED_LOCATIONS;
  const [fogGeoJSON, setFogGeoJSON] = useState<Feature<Polygon | MultiPolygon> | null>(null);

  useEffect(() => {
    // Try loading from SQLite cache first
    const cached = getFogCache(FOG_LOD);
    if (cached) {
      try {
        setFogGeoJSON(JSON.parse(cached));
        return;
      } catch {
        // Corrupted cache, fall through to recompute
      }
    }

    // Compute after animations/transitions complete so tab switch isn't blocked
    const handle = InteractionManager.runAfterInteractions(() => {
      console.log('[fog] Cache miss — computing fog polygon...');
      const result = computeFogPolygon(locations, FOG_LOD);
      setFogGeoJSON(result);

      // Persist to cache for next tab switch / app launch
      try {
        setFogCache(FOG_LOD, JSON.stringify(result));
        console.log('[fog] Cached fog polygon to SQLite');
      } catch {
        // Cache write failed — non-fatal
      }
    });

    return () => handle.cancel();
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
