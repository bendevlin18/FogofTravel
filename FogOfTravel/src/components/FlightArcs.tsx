import React, { useState, useCallback } from 'react';
import Mapbox from '@rnmapbox/maps';
import { useFocusEffect } from '@react-navigation/native';
import { generateFlightArcs, getAllFlights } from '../services/flightService';
import type { FeatureCollection, LineString, Point } from 'geojson';
import * as turf from '@turf/helpers';

export default function FlightArcs() {
  const [flightArcs, setFlightArcs] = useState<FeatureCollection<LineString> | null>(null);
  const [roadTripArcs, setRoadTripArcs] = useState<FeatureCollection<LineString> | null>(null);
  const [airports, setAirports] = useState<FeatureCollection<Point> | null>(null);

  useFocusEffect(
    useCallback(() => {
      // Generate arcs split by type
      const allArcs = generateFlightArcs('all');

      const flightFeatures = allArcs.features.filter(
        (f) => f.properties?.trip_type !== 'road_trip'
      );
      const roadFeatures = allArcs.features.filter(
        (f) => f.properties?.trip_type === 'road_trip'
      );

      setFlightArcs(turf.featureCollection(flightFeatures) as FeatureCollection<LineString>);
      setRoadTripArcs(turf.featureCollection(roadFeatures) as FeatureCollection<LineString>);

      // Airport markers from all flights
      const flights = getAllFlights();
      const seen = new Set<string>();
      const points: any[] = [];
      for (const f of flights) {
        if (!seen.has(f.origin_iata)) {
          seen.add(f.origin_iata);
          points.push(turf.point([f.origin_lng, f.origin_lat], { iata: f.origin_iata }));
        }
        if (!seen.has(f.dest_iata)) {
          seen.add(f.dest_iata);
          points.push(turf.point([f.dest_lng, f.dest_lat], { iata: f.dest_iata }));
        }
      }
      setAirports(turf.featureCollection(points) as FeatureCollection<Point>);
    }, [])
  );

  const hasFlights = flightArcs && flightArcs.features.length > 0;
  const hasRoadTrips = roadTripArcs && roadTripArcs.features.length > 0;

  if (!hasFlights && !hasRoadTrips) return null;

  return (
    <>
      {/* Flight arcs — blue dashed */}
      {hasFlights && (
        <Mapbox.ShapeSource id="flight-arcs" shape={flightArcs}>
          <Mapbox.LineLayer
            id="flight-arcs-line"
            style={{
              lineColor: '#4fc3f7',
              lineWidth: 2,
              lineOpacity: 0.8,
              lineDasharray: [4, 2],
            }}
          />
        </Mapbox.ShapeSource>
      )}

      {/* Road trip lines — green solid */}
      {hasRoadTrips && (
        <Mapbox.ShapeSource id="road-trip-arcs" shape={roadTripArcs}>
          <Mapbox.LineLayer
            id="road-trip-arcs-line"
            style={{
              lineColor: '#66bb6a',
              lineWidth: 2,
              lineOpacity: 0.6,
            }}
          />
        </Mapbox.ShapeSource>
      )}

      {/* Airport markers */}
      {airports && airports.features.length > 0 && (
        <Mapbox.ShapeSource id="airport-markers" shape={airports}>
          <Mapbox.CircleLayer
            id="airport-circles"
            style={{
              circleRadius: 4,
              circleColor: '#4fc3f7',
              circleStrokeWidth: 1.5,
              circleStrokeColor: '#ffffff',
            }}
          />
          <Mapbox.SymbolLayer
            id="airport-labels"
            style={{
              textField: ['get', 'iata'],
              textSize: 11,
              textColor: '#ffffff',
              textHaloColor: '#000000',
              textHaloWidth: 1,
              textOffset: [0, 1.2],
              textAnchor: 'top',
            }}
          />
        </Mapbox.ShapeSource>
      )}
    </>
  );
}
