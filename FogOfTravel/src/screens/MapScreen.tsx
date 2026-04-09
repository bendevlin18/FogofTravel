import React, { useState, useCallback, useRef } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Mapbox from '@rnmapbox/maps';
import { useFocusEffect } from '@react-navigation/native';
import FogLayer from '../components/FogLayer';
import FlightArcs from '../components/FlightArcs';
import MapControls from '../components/MapControls';
import { getClusteredCoords, getLocationPointCount, getDataVersion } from '../services/database';

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '';

Mapbox.setAccessToken(MAPBOX_TOKEN);

export default function MapScreen() {
  const [locations, setLocations] = useState<[number, number][] | undefined>(undefined);
  const loadedVersionRef = useRef(-1);

  // Map controls state
  const [fogOpacity, setFogOpacity] = useState(0.7);
  const [showFlights, setShowFlights] = useState(true);
  const [showRoadTrips, setShowRoadTrips] = useState(true);

  useFocusEffect(
    useCallback(() => {
      const currentVersion = getDataVersion();
      if (loadedVersionRef.current === currentVersion) return;

      const count = getLocationPointCount();
      if (count > 0) {
        const coords = getClusteredCoords(0.5);
        setLocations(coords);
      } else {
        setLocations(undefined);
      }
      loadedVersionRef.current = currentVersion;
    }, [])
  );

  if (!MAPBOX_TOKEN) {
    return (
      <View style={styles.placeholder}>
        <Text style={styles.placeholderTitle}>Mapbox token not set</Text>
        <Text style={styles.placeholderText}>
          Set EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN in your .env file and restart the app.
        </Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Mapbox.MapView
        style={styles.map}
        styleURL="mapbox://styles/mapbox/outdoors-v12"
        logoEnabled={false}
        attributionEnabled={false}
        scaleBarEnabled={false}
      >
        <Mapbox.Camera
          defaultSettings={{
            centerCoordinate: [0, 20],
            zoomLevel: 1.5,
          }}
        />
        <FogLayer visitedLocations={locations} fogOpacity={fogOpacity} />
        <FlightArcs showFlights={showFlights} showRoadTrips={showRoadTrips} />
      </Mapbox.MapView>

      <MapControls
        fogOpacity={fogOpacity}
        onFogOpacityChange={setFogOpacity}
        showFlights={showFlights}
        onToggleFlights={() => setShowFlights((v) => !v)}
        showRoadTrips={showRoadTrips}
        onToggleRoadTrips={() => setShowRoadTrips((v) => !v)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    flex: 1,
  },
  placeholder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    backgroundColor: '#1a1a2e',
  },
  placeholderTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: '#e0e0e0',
    marginBottom: 12,
  },
  placeholderText: {
    fontSize: 14,
    color: '#888',
    textAlign: 'center',
    lineHeight: 20,
  },
});
