import React, { useState } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, ActivityIndicator } from 'react-native';
import * as DocumentPicker from 'expo-document-picker';
import { importGoogleTakeout, type ImportProgress } from '../services/locationImporter';
import { getLocationPointCount } from '../services/database';

export default function ImportScreen() {
  const [progress, setProgress] = useState<ImportProgress | null>(null);
  const [pointCount, setPointCount] = useState<number | null>(null);

  const handlePickFile = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });

      if (result.canceled) return;

      const file = result.assets[0];
      if (!file?.uri) return;

      setProgress({ pointsProcessed: 0, pointsInserted: 0, phase: 'reading' });

      const finalProgress = await importGoogleTakeout(file.uri, (p) => {
        setProgress({ ...p });
      });

      setProgress(finalProgress);
      setPointCount(getLocationPointCount());
    } catch (e: any) {
      setProgress({
        pointsProcessed: 0,
        pointsInserted: 0,
        phase: 'error',
        error: e.message ?? 'Unknown error',
      });
    }
  };

  const isImporting = progress?.phase === 'reading' || progress?.phase === 'parsing';

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Import Location History</Text>
      <Text style={styles.subtitle}>
        Import your Google Takeout location data to reveal where you've been on the fog map.
      </Text>

      <View style={styles.steps}>
        <Text style={styles.step}>1. Export your location history from Google Takeout or Maps Timeline</Text>
        <Text style={styles.step}>2. Run the preprocessor script on your computer:{'\n'}   node preprocess_timeline.js Timeline.json</Text>
        <Text style={styles.step}>3. Transfer locations_export.json to your phone</Text>
        <Text style={styles.step}>4. Tap "Select File" below</Text>
      </View>

      <TouchableOpacity
        style={[styles.button, isImporting && styles.buttonDisabled]}
        onPress={handlePickFile}
        disabled={isImporting}
      >
        {isImporting ? (
          <ActivityIndicator color="#fff" />
        ) : (
          <Text style={styles.buttonText}>Select JSON File</Text>
        )}
      </TouchableOpacity>

      {progress && (
        <View style={styles.progressContainer}>
          {progress.phase === 'reading' && (
            <Text style={styles.progressText}>Reading file...</Text>
          )}
          {progress.phase === 'parsing' && (
            <Text style={styles.progressText}>
              Processed: {progress.pointsProcessed.toLocaleString()} points
              {'\n'}Inserted: {progress.pointsInserted.toLocaleString()} points
            </Text>
          )}
          {progress.phase === 'done' && (
            <Text style={styles.successText}>
              Import complete!{'\n'}
              {progress.pointsInserted.toLocaleString()} location points imported.
              {'\n'}Switch to the Map tab to see your fog clear.
            </Text>
          )}
          {progress.phase === 'error' && (
            <Text style={styles.errorText}>Error: {progress.error}</Text>
          )}
        </View>
      )}

      {pointCount !== null && (
        <Text style={styles.countText}>
          Total points in database: {pointCount.toLocaleString()}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0f0f23',
    padding: 24,
    paddingTop: 60,
  },
  title: {
    fontSize: 24,
    fontWeight: '700',
    color: '#e0e0e0',
    marginBottom: 8,
  },
  subtitle: {
    fontSize: 14,
    color: '#888',
    lineHeight: 20,
    marginBottom: 24,
  },
  steps: {
    marginBottom: 32,
    gap: 8,
  },
  step: {
    fontSize: 14,
    color: '#aaa',
    lineHeight: 20,
  },
  button: {
    backgroundColor: '#4fc3f7',
    paddingVertical: 14,
    borderRadius: 8,
    alignItems: 'center',
    marginBottom: 24,
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  buttonText: {
    color: '#0f0f23',
    fontSize: 16,
    fontWeight: '600',
  },
  progressContainer: {
    padding: 16,
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    marginBottom: 16,
  },
  progressText: {
    color: '#ccc',
    fontSize: 14,
    lineHeight: 22,
  },
  successText: {
    color: '#66bb6a',
    fontSize: 14,
    lineHeight: 22,
  },
  errorText: {
    color: '#ef5350',
    fontSize: 14,
    lineHeight: 22,
  },
  countText: {
    color: '#666',
    fontSize: 13,
    textAlign: 'center',
  },
});
