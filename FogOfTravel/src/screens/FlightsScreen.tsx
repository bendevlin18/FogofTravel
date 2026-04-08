import React from 'react';
import { StyleSheet, View, Text } from 'react-native';

export default function FlightsScreen() {
  return (
    <View style={styles.container}>
      <Text style={styles.title}>Flights</Text>
      <Text style={styles.subtitle}>Your flight log will appear here.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
  },
  title: {
    fontSize: 24,
    fontWeight: '600',
    color: '#e0e0e0',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
  },
});
