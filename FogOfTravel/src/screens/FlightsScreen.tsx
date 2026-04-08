import React, { useState, useCallback } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { searchAirports, type Airport } from '../utils/airports';
import {
  addFlight,
  getAllFlights,
  deleteFlight,
  updateTripType,
  getFlightStats,
  importDetectedTrips,
  type Flight,
  type TripType,
} from '../services/flightService';
import * as DocumentPicker from 'expo-document-picker';

type FilterType = TripType | 'all';

export default function FlightsScreen() {
  const [flights, setFlights] = useState<Flight[]>([]);
  const [stats, setStats] = useState({
    totalFlights: 0,
    totalRoadTrips: 0,
    totalDistanceKm: 0,
    flightDistanceKm: 0,
    uniqueAirports: 0,
  });
  const [filter, setFilter] = useState<FilterType>('all');

  // Add flight form
  const [originQuery, setOriginQuery] = useState('');
  const [destQuery, setDestQuery] = useState('');
  const [selectedOrigin, setSelectedOrigin] = useState<Airport | null>(null);
  const [selectedDest, setSelectedDest] = useState<Airport | null>(null);
  const [originResults, setOriginResults] = useState<Airport[]>([]);
  const [destResults, setDestResults] = useState<Airport[]>([]);
  const [date, setDate] = useState('');
  const [showForm, setShowForm] = useState(false);

  const reload = useCallback(() => {
    setFlights(getAllFlights(filter));
    setStats(getFlightStats());
  }, [filter]);

  useFocusEffect(reload);

  const handleOriginSearch = (text: string) => {
    setOriginQuery(text);
    setSelectedOrigin(null);
    setOriginResults(searchAirports(text, 5));
  };

  const handleDestSearch = (text: string) => {
    setDestQuery(text);
    setSelectedDest(null);
    setDestResults(searchAirports(text, 5));
  };

  const selectOrigin = (airport: Airport) => {
    setSelectedOrigin(airport);
    setOriginQuery(`${airport.iata} - ${airport.city}`);
    setOriginResults([]);
  };

  const selectDest = (airport: Airport) => {
    setSelectedDest(airport);
    setDestQuery(`${airport.iata} - ${airport.city}`);
    setDestResults([]);
  };

  const handleAddFlight = () => {
    if (!selectedOrigin || !selectedDest) {
      Alert.alert('Error', 'Please select both origin and destination airports.');
      return;
    }
    addFlight({
      origin_iata: selectedOrigin.iata,
      dest_iata: selectedDest.iata,
      date: date || undefined,
      trip_type: 'flight',
    });
    setOriginQuery('');
    setDestQuery('');
    setSelectedOrigin(null);
    setSelectedDest(null);
    setDate('');
    setShowForm(false);
    reload();
  };

  const handleImportTrips = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: ['application/json', 'text/plain', '*/*'],
        copyToCacheDirectory: true,
      });
      if (result.canceled) return;
      const file = result.assets[0];
      if (!file?.uri) return;

      const response = await fetch(file.uri);
      const content = await response.text();
      const trips = JSON.parse(content);

      if (!Array.isArray(trips)) {
        Alert.alert('Error', 'Invalid format. Expected an array of trips.');
        return;
      }

      const count = importDetectedTrips(trips);
      Alert.alert('Import Complete', `Imported ${count} trips.`);
      reload();
    } catch (e: any) {
      Alert.alert('Error', e.message ?? 'Failed to import.');
    }
  };

  const handleCycleType = (flight: Flight) => {
    const types: TripType[] = ['flight', 'road_trip', 'unknown'];
    const currentIndex = types.indexOf(flight.trip_type);
    const nextType = types[(currentIndex + 1) % types.length];
    updateTripType(flight.id, nextType);
    reload();
  };

  const handleDelete = (id: number) => {
    Alert.alert('Delete Trip', 'Are you sure?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => { deleteFlight(id); reload(); },
      },
    ]);
  };

  const renderSuggestion = (airport: Airport, onSelect: (a: Airport) => void) => (
    <TouchableOpacity
      key={airport.iata}
      style={styles.suggestion}
      onPress={() => onSelect(airport)}
    >
      <Text style={styles.suggestionIata}>{airport.iata}</Text>
      <Text style={styles.suggestionText} numberOfLines={1}>
        {airport.city} - {airport.name}
      </Text>
    </TouchableOpacity>
  );

  const tripTypeIcon = (type: TripType) => {
    switch (type) {
      case 'flight': return 'FLT';
      case 'road_trip': return 'DRV';
      default: return ' ? ';
    }
  };

  const tripTypeColor = (type: TripType) => {
    switch (type) {
      case 'flight': return '#4fc3f7';
      case 'road_trip': return '#66bb6a';
      default: return '#ffa726';
    }
  };

  const confidenceBar = (confidence: number) => {
    const width = Math.round(confidence * 100);
    const color = confidence >= 0.6 ? '#4fc3f7' : confidence >= 0.3 ? '#ffa726' : '#ef5350';
    return (
      <View style={styles.confidenceBarBg}>
        <View style={[styles.confidenceBarFill, { width: `${width}%`, backgroundColor: color }]} />
      </View>
    );
  };

  const renderFlight = ({ item }: { item: Flight }) => (
    <TouchableOpacity
      style={styles.flightCard}
      onPress={() => handleCycleType(item)}
      onLongPress={() => handleDelete(item.id)}
    >
      <View style={styles.flightHeader}>
        <View style={styles.flightRoute}>
          <Text style={styles.flightIata}>{item.origin_iata}</Text>
          <Text style={styles.flightArrow}> → </Text>
          <Text style={styles.flightIata}>{item.dest_iata}</Text>
        </View>
        <View style={[styles.typeBadge, { backgroundColor: tripTypeColor(item.trip_type) + '22', borderColor: tripTypeColor(item.trip_type) }]}>
          <Text style={[styles.typeBadgeText, { color: tripTypeColor(item.trip_type) }]}>
            {tripTypeIcon(item.trip_type)}
          </Text>
        </View>
      </View>
      <View style={styles.flightDetails}>
        {item.date && <Text style={styles.flightDate}>{item.date}</Text>}
        {item.distance_km != null && (
          <Text style={styles.flightDistance}>{item.distance_km.toLocaleString()} km</Text>
        )}
      </View>
      {item.confidence < 1.0 && (
        <View style={styles.confidenceRow}>
          <Text style={styles.confidenceLabel}>Confidence</Text>
          {confidenceBar(item.confidence)}
          <Text style={styles.confidenceValue}>{Math.round(item.confidence * 100)}%</Text>
        </View>
      )}
    </TouchableOpacity>
  );

  return (
    <KeyboardAvoidingView
      style={styles.container}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      {/* Stats */}
      <View style={styles.statsRow}>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{stats.totalFlights}</Text>
          <Text style={styles.statLabel}>Flights</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{stats.totalRoadTrips}</Text>
          <Text style={styles.statLabel}>Road Trips</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>
            {stats.totalDistanceKm > 0 ? `${Math.round(stats.totalDistanceKm / 1000)}K` : '0'}
          </Text>
          <Text style={styles.statLabel}>km total</Text>
        </View>
        <View style={styles.statBox}>
          <Text style={styles.statValue}>{stats.uniqueAirports}</Text>
          <Text style={styles.statLabel}>Airports</Text>
        </View>
      </View>

      {/* Filter tabs */}
      <View style={styles.filterRow}>
        {(['all', 'flight', 'road_trip', 'unknown'] as FilterType[]).map((f) => (
          <TouchableOpacity
            key={f}
            style={[styles.filterTab, filter === f && styles.filterTabActive]}
            onPress={() => { setFilter(f); }}
          >
            <Text style={[styles.filterText, filter === f && styles.filterTextActive]}>
              {f === 'all' ? 'All' : f === 'flight' ? 'Flights' : f === 'road_trip' ? 'Drives' : 'Unknown'}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {/* Action buttons */}
      {!showForm && (
        <View style={styles.actionRow}>
          <TouchableOpacity
            style={[styles.actionButton, { flex: 1 }]}
            onPress={() => setShowForm(true)}
          >
            <Text style={styles.actionButtonText}>+ Add Trip</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.actionButton, { flex: 1, borderColor: '#66bb6a' }]}
            onPress={handleImportTrips}
          >
            <Text style={[styles.actionButtonText, { color: '#66bb6a' }]}>Import Detected</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Add form */}
      {showForm && (
        <View style={styles.form}>
          <View style={styles.inputRow}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>From</Text>
              <TextInput
                style={styles.input}
                placeholder="Airport or city"
                placeholderTextColor="#555"
                value={originQuery}
                onChangeText={handleOriginSearch}
                autoCapitalize="characters"
              />
              {originResults.map((a) => renderSuggestion(a, selectOrigin))}
            </View>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>To</Text>
              <TextInput
                style={styles.input}
                placeholder="Airport or city"
                placeholderTextColor="#555"
                value={destQuery}
                onChangeText={handleDestSearch}
                autoCapitalize="characters"
              />
              {destResults.map((a) => renderSuggestion(a, selectDest))}
            </View>
          </View>
          <TextInput
            style={[styles.input, { marginBottom: 12 }]}
            placeholder="Date (YYYY-MM-DD, optional)"
            placeholderTextColor="#555"
            value={date}
            onChangeText={setDate}
          />
          <View style={styles.formButtons}>
            <TouchableOpacity style={styles.cancelButton} onPress={() => setShowForm(false)}>
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.submitButton} onPress={handleAddFlight}>
              <Text style={styles.submitButtonText}>Add Flight</Text>
            </TouchableOpacity>
          </View>
        </View>
      )}

      {/* Tip */}
      {flights.length > 0 && (
        <Text style={styles.tipText}>Tap a trip to change its type. Long press to delete.</Text>
      )}

      {/* Trip list */}
      <FlatList
        data={flights}
        keyExtractor={(item) => String(item.id)}
        renderItem={renderFlight}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <Text style={styles.emptyText}>No trips yet. Add manually or import detected trips.</Text>
        }
      />
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0f0f23', paddingTop: 60 },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    paddingHorizontal: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  statBox: { alignItems: 'center' },
  statValue: { fontSize: 22, fontWeight: '700', color: '#4fc3f7' },
  statLabel: { fontSize: 11, color: '#888', marginTop: 2 },
  filterRow: {
    flexDirection: 'row',
    padding: 12,
    paddingBottom: 4,
    gap: 8,
  },
  filterTab: {
    flex: 1,
    paddingVertical: 6,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
  },
  filterTabActive: {
    borderColor: '#4fc3f7',
    backgroundColor: '#4fc3f711',
  },
  filterText: { color: '#666', fontSize: 12 },
  filterTextActive: { color: '#4fc3f7' },
  actionRow: {
    flexDirection: 'row',
    paddingHorizontal: 12,
    paddingTop: 8,
    gap: 8,
  },
  actionButton: {
    padding: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#4fc3f7',
    borderStyle: 'dashed',
    alignItems: 'center',
  },
  actionButtonText: { color: '#4fc3f7', fontSize: 14, fontWeight: '600' },
  form: { margin: 12, padding: 16, backgroundColor: '#1a1a2e', borderRadius: 8 },
  inputRow: { flexDirection: 'row', gap: 12, marginBottom: 12 },
  inputGroup: { flex: 1 },
  inputLabel: { color: '#888', fontSize: 12, marginBottom: 4 },
  input: {
    backgroundColor: '#0f0f23',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 6,
    padding: 10,
    color: '#e0e0e0',
    fontSize: 14,
  },
  suggestion: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
    borderBottomWidth: 1,
    borderBottomColor: '#222',
  },
  suggestionIata: { color: '#4fc3f7', fontWeight: '700', fontSize: 14, width: 40 },
  suggestionText: { color: '#aaa', fontSize: 12, flex: 1 },
  formButtons: { flexDirection: 'row', gap: 12 },
  cancelButton: {
    flex: 1,
    padding: 12,
    borderRadius: 6,
    borderWidth: 1,
    borderColor: '#333',
    alignItems: 'center',
  },
  cancelButtonText: { color: '#888', fontSize: 14 },
  submitButton: {
    flex: 1,
    padding: 12,
    borderRadius: 6,
    backgroundColor: '#4fc3f7',
    alignItems: 'center',
  },
  submitButtonText: { color: '#0f0f23', fontSize: 14, fontWeight: '600' },
  tipText: { color: '#555', fontSize: 11, textAlign: 'center', paddingTop: 8 },
  list: { padding: 12 },
  flightCard: {
    backgroundColor: '#1a1a2e',
    borderRadius: 8,
    padding: 14,
    marginBottom: 8,
  },
  flightHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  flightRoute: { flexDirection: 'row', alignItems: 'center' },
  flightIata: { fontSize: 18, fontWeight: '700', color: '#e0e0e0' },
  flightArrow: { fontSize: 18, color: '#4fc3f7' },
  typeBadge: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
    borderWidth: 1,
  },
  typeBadgeText: { fontSize: 11, fontWeight: '700' },
  flightDetails: { flexDirection: 'row', justifyContent: 'space-between' },
  flightDate: { color: '#888', fontSize: 13 },
  flightDistance: { color: '#666', fontSize: 13 },
  confidenceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
    gap: 8,
  },
  confidenceLabel: { color: '#555', fontSize: 11 },
  confidenceBarBg: {
    flex: 1,
    height: 4,
    backgroundColor: '#222',
    borderRadius: 2,
    overflow: 'hidden',
  },
  confidenceBarFill: { height: '100%', borderRadius: 2 },
  confidenceValue: { color: '#555', fontSize: 11, width: 30, textAlign: 'right' },
  emptyText: { color: '#555', fontSize: 14, textAlign: 'center', marginTop: 32 },
});
