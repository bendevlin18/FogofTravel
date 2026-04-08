import { getDB } from './database';
import { getAirport } from '../utils/airports';
import greatCircle from '@turf/great-circle';
import * as turf from '@turf/helpers';
import type { Feature, LineString, FeatureCollection } from 'geojson';

export type TripType = 'flight' | 'road_trip' | 'unknown';

export interface Flight {
  id: number;
  origin_iata: string;
  dest_iata: string;
  origin_lat: number;
  origin_lng: number;
  dest_lat: number;
  dest_lng: number;
  date: string | null;
  airline: string | null;
  flight_number: string | null;
  distance_km: number | null;
  notes: string | null;
  trip_type: TripType;
  confidence: number;
}

/**
 * Add a new flight/trip. Looks up airport coordinates automatically.
 */
export function addFlight(params: {
  origin_iata: string;
  dest_iata: string;
  date?: string;
  airline?: string;
  flight_number?: string;
  notes?: string;
  trip_type?: TripType;
  confidence?: number;
}): Flight | null {
  const origin = getAirport(params.origin_iata);
  const dest = getAirport(params.dest_iata);

  if (!origin || !dest) return null;

  const distance = haversineKm(origin.lat, origin.lng, dest.lat, dest.lng);

  const db = getDB();
  const result = db.executeSync(
    `INSERT INTO flights (origin_iata, dest_iata, origin_lat, origin_lng, dest_lat, dest_lng, date, airline, flight_number, distance_km, notes, trip_type, confidence)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      origin.iata,
      dest.iata,
      origin.lat,
      origin.lng,
      dest.lat,
      dest.lng,
      params.date ?? null,
      params.airline ?? null,
      params.flight_number ?? null,
      Math.round(distance),
      params.notes ?? null,
      params.trip_type ?? 'flight',
      params.confidence ?? 1.0,
    ]
  );

  return {
    id: result.insertId ?? 0,
    origin_iata: origin.iata,
    dest_iata: dest.iata,
    origin_lat: origin.lat,
    origin_lng: origin.lng,
    dest_lat: dest.lat,
    dest_lng: dest.lng,
    date: params.date ?? null,
    airline: params.airline ?? null,
    flight_number: params.flight_number ?? null,
    distance_km: Math.round(distance),
    notes: params.notes ?? null,
    trip_type: params.trip_type ?? 'flight',
    confidence: params.confidence ?? 1.0,
  };
}

/**
 * Import trips from the detected_trips.json format.
 */
export function importDetectedTrips(
  trips: {
    origin_iata: string;
    dest_iata: string;
    date: string;
    distance_km: number;
    confidence: number;
    trip_type: string;
  }[]
): number {
  let imported = 0;
  for (const t of trips) {
    const result = addFlight({
      origin_iata: t.origin_iata,
      dest_iata: t.dest_iata,
      date: t.date,
      trip_type: t.trip_type as TripType,
      confidence: t.confidence,
    });
    if (result) imported++;
  }
  return imported;
}

/**
 * Get all flights/trips, optionally filtered by type.
 */
export function getAllFlights(typeFilter?: TripType | 'all'): Flight[] {
  const db = getDB();
  if (typeFilter && typeFilter !== 'all') {
    const result = db.executeSync(
      'SELECT * FROM flights WHERE trip_type = ? ORDER BY date DESC, id DESC',
      [typeFilter]
    );
    return result.rows as Flight[];
  }
  const result = db.executeSync('SELECT * FROM flights ORDER BY date DESC, id DESC');
  return result.rows as Flight[];
}

/**
 * Update the trip type for a flight.
 */
export function updateTripType(id: number, tripType: TripType): void {
  const db = getDB();
  db.executeSync('UPDATE flights SET trip_type = ?, confidence = 1.0 WHERE id = ?', [
    tripType,
    id,
  ]);
}

/**
 * Delete a flight by ID.
 */
export function deleteFlight(id: number): void {
  const db = getDB();
  db.executeSync('DELETE FROM flights WHERE id = ?', [id]);
}

/**
 * Get flight stats.
 */
export function getFlightStats(): {
  totalFlights: number;
  totalRoadTrips: number;
  totalDistanceKm: number;
  flightDistanceKm: number;
  uniqueAirports: number;
} {
  const db = getDB();

  const flightCount = db.executeSync(
    "SELECT COUNT(*) as count FROM flights WHERE trip_type = 'flight'"
  );
  const roadTripCount = db.executeSync(
    "SELECT COUNT(*) as count FROM flights WHERE trip_type = 'road_trip'"
  );
  const distResult = db.executeSync(
    'SELECT COALESCE(SUM(distance_km), 0) as total FROM flights'
  );
  const flightDistResult = db.executeSync(
    "SELECT COALESCE(SUM(distance_km), 0) as total FROM flights WHERE trip_type = 'flight'"
  );
  const airportResult = db.executeSync(
    `SELECT COUNT(DISTINCT iata) as count FROM (
      SELECT origin_iata as iata FROM flights
      UNION
      SELECT dest_iata as iata FROM flights
    )`
  );

  return {
    totalFlights: (flightCount.rows[0] as any)?.count ?? 0,
    totalRoadTrips: (roadTripCount.rows[0] as any)?.count ?? 0,
    totalDistanceKm: (distResult.rows[0] as any)?.total ?? 0,
    flightDistanceKm: (flightDistResult.rows[0] as any)?.total ?? 0,
    uniqueAirports: (airportResult.rows[0] as any)?.count ?? 0,
  };
}

/**
 * Generate a GeoJSON FeatureCollection of great-circle arcs for flights,
 * and straight lines for road trips.
 */
export function generateFlightArcs(
  typeFilter?: TripType | 'all'
): FeatureCollection<LineString> {
  const flights = getAllFlights(typeFilter);
  const features: Feature<LineString>[] = [];

  for (const f of flights) {
    try {
      let line: Feature<LineString>;

      if (f.trip_type === 'road_trip') {
        // Straight line for road trips
        line = turf.lineString(
          [
            [f.origin_lng, f.origin_lat],
            [f.dest_lng, f.dest_lat],
          ],
          {
            id: f.id,
            origin: f.origin_iata,
            dest: f.dest_iata,
            distance_km: f.distance_km,
            trip_type: f.trip_type,
          }
        );
      } else {
        // Great-circle arc for flights
        line = greatCircle(
          turf.point([f.origin_lng, f.origin_lat]),
          turf.point([f.dest_lng, f.dest_lat]),
          { npoints: 100 }
        ) as Feature<LineString>;
        line.properties = {
          id: f.id,
          origin: f.origin_iata,
          dest: f.dest_iata,
          distance_km: f.distance_km,
          trip_type: f.trip_type,
        };
      }

      features.push(line);
    } catch {
      // Skip if computation fails
    }
  }

  return turf.featureCollection(features) as FeatureCollection<LineString>;
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function toRad(deg: number): number {
  return (deg * Math.PI) / 180;
}
