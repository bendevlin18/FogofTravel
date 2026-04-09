import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity } from 'react-native';
import Slider from '@react-native-community/slider';

interface MapControlsProps {
  fogOpacity: number;
  onFogOpacityChange: (value: number) => void;
  showFlights: boolean;
  onToggleFlights: () => void;
  showRoadTrips: boolean;
  onToggleRoadTrips: () => void;
}

export default function MapControls({
  fogOpacity,
  onFogOpacityChange,
  showFlights,
  onToggleFlights,
  showRoadTrips,
  onToggleRoadTrips,
}: MapControlsProps) {
  const [expanded, setExpanded] = useState(false);

  return (
    <View style={styles.container} pointerEvents="box-none">
      {/* Toggle button */}
      <TouchableOpacity
        style={styles.toggleButton}
        onPress={() => setExpanded(!expanded)}
        activeOpacity={0.7}
      >
        <Text style={styles.toggleIcon}>{expanded ? '\u2715' : '\u2699'}</Text>
      </TouchableOpacity>

      {/* Expandable panel */}
      {expanded && (
        <View style={styles.panel}>
          {/* Fog opacity slider */}
          <Text style={styles.label}>Fog Opacity</Text>
          <View style={styles.sliderRow}>
            <Slider
              style={styles.slider}
              minimumValue={0}
              maximumValue={1}
              step={0.05}
              value={fogOpacity}
              onValueChange={onFogOpacityChange}
              minimumTrackTintColor="#4fc3f7"
              maximumTrackTintColor="#555"
              thumbTintColor="#4fc3f7"
            />
            <Text style={styles.sliderValue}>{Math.round(fogOpacity * 100)}%</Text>
          </View>

          {/* Layer toggles */}
          <Text style={[styles.label, { marginTop: 12 }]}>Layers</Text>

          <TouchableOpacity
            style={styles.toggleRow}
            onPress={onToggleFlights}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, showFlights && styles.checkboxActive]}>
              {showFlights && <Text style={styles.checkmark}>{'\u2713'}</Text>}
            </View>
            <View style={[styles.colorDot, { backgroundColor: '#4fc3f7' }]} />
            <Text style={styles.toggleLabel}>Flights</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.toggleRow}
            onPress={onToggleRoadTrips}
            activeOpacity={0.7}
          >
            <View style={[styles.checkbox, showRoadTrips && styles.checkboxActive]}>
              {showRoadTrips && <Text style={styles.checkmark}>{'\u2713'}</Text>}
            </View>
            <View style={[styles.colorDot, { backgroundColor: '#66bb6a' }]} />
            <Text style={styles.toggleLabel}>Road Trips</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 52,
    right: 12,
    alignItems: 'flex-end',
  },
  toggleButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: 'rgba(15, 15, 35, 0.85)',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
  },
  toggleIcon: {
    color: '#e0e0e0',
    fontSize: 18,
  },
  panel: {
    marginTop: 8,
    backgroundColor: 'rgba(15, 15, 35, 0.92)',
    borderRadius: 12,
    padding: 16,
    width: 220,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  label: {
    color: '#888',
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 6,
  },
  sliderRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  slider: {
    flex: 1,
    height: 32,
  },
  sliderValue: {
    color: '#ccc',
    fontSize: 12,
    width: 36,
    textAlign: 'right',
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 6,
  },
  checkbox: {
    width: 20,
    height: 20,
    borderRadius: 4,
    borderWidth: 1.5,
    borderColor: '#555',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8,
  },
  checkboxActive: {
    borderColor: '#4fc3f7',
    backgroundColor: 'rgba(79, 195, 247, 0.15)',
  },
  checkmark: {
    color: '#4fc3f7',
    fontSize: 13,
    fontWeight: '700',
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    marginRight: 8,
  },
  toggleLabel: {
    color: '#e0e0e0',
    fontSize: 14,
  },
});
