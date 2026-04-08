#!/usr/bin/env node

/**
 * Detect likely flights and road trips from Google Takeout Timeline.json.
 *
 * Assigns each detected trip a confidence score (0-1) for being a flight vs road trip.
 * Heuristics:
 *   - Average speed: flights are typically 400-900 km/h, drives < 200 km/h
 *   - Distance: long distances (>1000km) strongly suggest flight
 *   - Duration: very short time for long distance = flight
 *   - Impossible speed (>1200 km/h for non-transatlantic) = GPS error, low confidence
 *   - Multiple short sequential hops on same day = likely road trip
 */

const fs = require('fs');

const inputPath = process.argv[2] || '/Users/bendevlin/Downloads/Timeline.json';
const data = JSON.parse(fs.readFileSync(inputPath, 'utf8'));

const airports = JSON.parse(
  fs.readFileSync('/Users/bendevlin/FogofTravel/FogOfTravel/src/assets/airports.json', 'utf8')
);

function parseLatLngString(str) {
  const match = str.match(/([\d.-]+)°,\s*([\d.-]+)°/);
  if (!match) return null;
  const lat = parseFloat(match[1]);
  const lng = parseFloat(match[2]);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

function haversineKm(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function findNearestAirport(lat, lng, maxDistKm = 100) {
  let best = null;
  let bestDist = Infinity;
  for (const a of airports) {
    const d = haversineKm(lat, lng, a.lat, a.lng);
    if (d < bestDist) { bestDist = d; best = a; }
  }
  return bestDist <= maxDistKm ? { airport: best, distKm: Math.round(bestDist) } : null;
}

/**
 * Compute flight confidence score (0-1).
 * Higher = more likely a real flight.
 */
function computeConfidence(distKm, timeHours, speedKmh) {
  let score = 0.5; // Start neutral

  // Speed scoring
  if (speedKmh >= 400 && speedKmh <= 1000) {
    score += 0.25; // Typical commercial flight speed
  } else if (speedKmh > 1000 && speedKmh <= 1200) {
    score += 0.1; // Fast but possible (headwinds, supersonic-ish GPS interpolation)
  } else if (speedKmh > 1200) {
    score -= 0.3; // Likely GPS error or timestamp issue
  } else if (speedKmh < 400 && speedKmh >= 300) {
    score += 0.05; // Slow for a flight, could be either
  }

  // Distance scoring
  if (distKm > 2000) {
    score += 0.2; // Very long distance, almost certainly a flight
  } else if (distKm > 1000) {
    score += 0.15;
  } else if (distKm > 500) {
    score += 0.05;
  } else if (distKm < 300) {
    score -= 0.2; // Short distance, likely driving with GPS gap
  }

  // Duration scoring
  if (timeHours >= 1.5 && timeHours <= 15) {
    score += 0.05; // Reasonable flight duration
  } else if (timeHours < 0.3) {
    score -= 0.3; // Too short, probably GPS glitch
  }

  // Clamp to [0, 1]
  return Math.max(0, Math.min(1, score));
}

// Extract all timestamped points
console.log('Extracting points...');
const points = [];

for (const seg of data.semanticSegments) {
  if (seg.timelinePath) {
    for (const p of seg.timelinePath) {
      const coord = parseLatLngString(p.point);
      if (coord && p.time) points.push({ ...coord, time: new Date(p.time).getTime() });
    }
  }
  if (seg.visit?.topCandidate?.placeLocation?.latLng) {
    const coord = parseLatLngString(seg.visit.topCandidate.placeLocation.latLng);
    const time = seg.startTime ? new Date(seg.startTime).getTime() : null;
    if (coord && time) points.push({ ...coord, time });
  }
  if (seg.activity?.start?.latLng) {
    const coord = parseLatLngString(seg.activity.start.latLng);
    const time = seg.startTime ? new Date(seg.startTime).getTime() : null;
    if (coord && time) points.push({ ...coord, time });
  }
  if (seg.activity?.end?.latLng) {
    const coord = parseLatLngString(seg.activity.end.latLng);
    const time = seg.endTime ? new Date(seg.endTime).getTime() : null;
    if (coord && time) points.push({ ...coord, time });
  }
}

points.sort((a, b) => a.time - b.time);
console.log(`Total timestamped points: ${points.length.toLocaleString()}\n`);

// Detect jumps
const MIN_DISTANCE_KM = 200;
const MAX_TIME_HOURS = 24;
const MIN_SPEED_KMH = 300;

const rawTrips = [];

for (let i = 1; i < points.length; i++) {
  const prev = points[i - 1];
  const curr = points[i];

  const distKm = haversineKm(prev.lat, prev.lng, curr.lat, curr.lng);
  const timeHours = (curr.time - prev.time) / (1000 * 60 * 60);

  if (distKm < MIN_DISTANCE_KM) continue;
  if (timeHours <= 0 || timeHours > MAX_TIME_HOURS) continue;

  const speedKmh = distKm / timeHours;
  if (speedKmh < MIN_SPEED_KMH) continue;

  const origin = findNearestAirport(prev.lat, prev.lng);
  const dest = findNearestAirport(curr.lat, curr.lng);
  if (!origin || !dest) continue;
  if (origin.airport.iata === dest.airport.iata) continue;

  const confidence = computeConfidence(distKm, timeHours, speedKmh);

  rawTrips.push({
    date: new Date(prev.time).toISOString().split('T')[0],
    departTime: new Date(prev.time).toISOString().substring(11, 16),
    arriveTime: new Date(curr.time).toISOString().substring(11, 16),
    originIata: origin.airport.iata,
    originCity: origin.airport.city,
    destIata: dest.airport.iata,
    destCity: dest.airport.city,
    distKm: Math.round(distKm),
    timeHours: parseFloat(timeHours.toFixed(1)),
    speedKmh: Math.round(speedKmh),
    confidence,
  });
}

// Deduplicate
const seen = new Set();
const trips = [];
for (const t of rawTrips) {
  const key = `${t.date}-${t.originIata}-${t.destIata}`;
  if (!seen.has(key)) { seen.add(key); trips.push(t); }
}

// Post-process: detect road trip sequences
// If 3+ short hops happen on the same day, lower their confidence
const byDate = {};
for (const t of trips) {
  (byDate[t.date] = byDate[t.date] || []).push(t);
}
for (const [date, dayTrips] of Object.entries(byDate)) {
  if (dayTrips.length >= 3) {
    const shortHops = dayTrips.filter(t => t.distKm < 500);
    if (shortHops.length >= 2) {
      // Likely a road trip day
      for (const t of shortHops) {
        t.confidence = Math.max(0, t.confidence - 0.25);
      }
    }
  }
}

// Classify
for (const t of trips) {
  if (t.confidence >= 0.6) {
    t.tripType = 'flight';
  } else if (t.confidence <= 0.3) {
    t.tripType = 'road_trip';
  } else {
    t.tripType = 'unknown';
  }
}

// Print table
const flightCount = trips.filter(t => t.tripType === 'flight').length;
const roadTripCount = trips.filter(t => t.tripType === 'road_trip').length;
const unknownCount = trips.filter(t => t.tripType === 'unknown').length;

console.log(`Detected ${trips.length} trips: ${flightCount} flights, ${roadTripCount} road trips, ${unknownCount} unknown\n`);

const header = `${'Date'.padEnd(12)} ${'From'.padEnd(5)} ${'City'.padEnd(18)} ${'To'.padEnd(5)} ${'City'.padEnd(18)} ${'Dist'.padStart(7)} ${'Speed'.padStart(9)} ${'Conf'.padStart(5)} Type`;
console.log(header);
console.log('-'.repeat(header.length));

for (const t of trips) {
  const typeIcon = t.tripType === 'flight' ? 'FLT' : t.tripType === 'road_trip' ? 'DRV' : ' ? ';
  console.log(
    `${t.date.padEnd(12)} ${t.originIata.padEnd(5)} ${t.originCity.substring(0, 16).padEnd(18)} ${t.destIata.padEnd(5)} ${t.destCity.substring(0, 16).padEnd(18)} ${(t.distKm + 'km').padStart(7)} ${(t.speedKmh + 'km/h').padStart(9)} ${t.confidence.toFixed(2).padStart(5)} ${typeIcon}`
  );
}

// Save for import
const output = trips.map(t => ({
  origin_iata: t.originIata,
  dest_iata: t.destIata,
  date: t.date,
  distance_km: t.distKm,
  speed_kmh: t.speedKmh,
  duration_hours: t.timeHours,
  confidence: t.confidence,
  trip_type: t.tripType,
}));

fs.writeFileSync(
  '/Users/bendevlin/Downloads/detected_trips.json',
  JSON.stringify(output, null, 2)
);
console.log(`\nSaved to /Users/bendevlin/Downloads/detected_trips.json`);
