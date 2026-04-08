import React, { useEffect } from 'react';
import { StyleSheet, View, Text } from 'react-native';
import Mapbox from '@rnmapbox/maps';

const MAPBOX_TOKEN = process.env.EXPO_PUBLIC_MAPBOX_ACCESS_TOKEN ?? '';

Mapbox.setAccessToken(MAPBOX_TOKEN);

export default function MapScreen() {
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
        <Mapbox.UserLocation visible />
      </Mapbox.MapView>
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
