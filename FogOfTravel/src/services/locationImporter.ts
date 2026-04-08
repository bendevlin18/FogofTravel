import { insertLocationPoints } from './database';

const BATCH_SIZE = 1000;

export interface ImportProgress {
  pointsProcessed: number;
  pointsInserted: number;
  phase: 'reading' | 'parsing' | 'done' | 'error';
  error?: string;
}

type ProgressCallback = (progress: ImportProgress) => void;

/**
 * Parse a "lat°, lng°" string into [lat, lng] numbers.
 * e.g. "40.3409707°, -80.0897527°" → [40.3409707, -80.0897527]
 */
function parseLatLngString(str: string): { lat: number; lng: number } | null {
  const match = str.match(/([\d.-]+)°,\s*([\d.-]+)°/);
  if (!match) return null;
  const lat = parseFloat(match[1]);
  const lng = parseFloat(match[2]);
  if (isNaN(lat) || isNaN(lng)) return null;
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { lat, lng };
}

/**
 * Extract all location points from the new Timeline.json format.
 * Pulls coordinates from:
 * - timelinePath[].point (path points with timestamps)
 * - visit.topCandidate.placeLocation.latLng (visited places)
 * - activity.start.latLng / activity.end.latLng (activity endpoints)
 */
function extractFromTimeline(
  data: any,
  onBatch: (batch: { lat: number; lng: number; timestamp: number | null; source: string }[]) => void
): number {
  const segments = data.semanticSegments;
  if (!Array.isArray(segments)) return 0;

  let batch: { lat: number; lng: number; timestamp: number | null; source: string }[] = [];
  let total = 0;

  function pushPoint(lat: number, lng: number, timestamp: number | null, source: string) {
    batch.push({ lat, lng, timestamp, source });
    total++;
    if (batch.length >= BATCH_SIZE) {
      onBatch(batch);
      batch = [];
    }
  }

  for (const seg of segments) {
    const segTime = seg.startTime ? new Date(seg.startTime).getTime() : null;

    // Timeline path points
    if (seg.timelinePath) {
      for (const p of seg.timelinePath) {
        const coord = parseLatLngString(p.point);
        if (!coord) continue;
        const ts = p.time ? new Date(p.time).getTime() : segTime;
        pushPoint(coord.lat, coord.lng, ts, 'google');
      }
    }

    // Visit locations
    if (seg.visit?.topCandidate?.placeLocation?.latLng) {
      const coord = parseLatLngString(seg.visit.topCandidate.placeLocation.latLng);
      if (coord) {
        pushPoint(coord.lat, coord.lng, segTime, 'google');
      }
    }

    // Activity start/end
    if (seg.activity?.start?.latLng) {
      const coord = parseLatLngString(seg.activity.start.latLng);
      if (coord) {
        pushPoint(coord.lat, coord.lng, segTime, 'google');
      }
    }
    if (seg.activity?.end?.latLng) {
      const coord = parseLatLngString(seg.activity.end.latLng);
      if (coord) {
        const endTime = seg.endTime ? new Date(seg.endTime).getTime() : segTime;
        pushPoint(coord.lat, coord.lng, endTime, 'google');
      }
    }
  }

  // Flush remaining
  if (batch.length > 0) {
    onBatch(batch);
  }

  return total;
}

/**
 * Extract from compact preprocessed format: [[lng, lat, timestamp], ...]
 */
function extractFromCompact(
  data: [number, number, number | null][],
  onBatch: (batch: { lat: number; lng: number; timestamp: number | null; source: string }[]) => void
): number {
  let batch: { lat: number; lng: number; timestamp: number | null; source: string }[] = [];
  let total = 0;

  for (const [lng, lat, ts] of data) {
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;
    batch.push({ lat, lng, timestamp: ts, source: 'google' });
    total++;
    if (batch.length >= BATCH_SIZE) {
      onBatch(batch);
      batch = [];
    }
  }

  if (batch.length > 0) {
    onBatch(batch);
  }

  return total;
}

/**
 * Extract from the older Records.json / Location History.json formats.
 * Fields: latitudeE7, longitudeE7, timestamp/timestampMs
 */
function extractFromRecords(
  records: any[],
  onBatch: (batch: { lat: number; lng: number; timestamp: number | null; source: string }[]) => void
): number {
  let batch: { lat: number; lng: number; timestamp: number | null; source: string }[] = [];
  let total = 0;

  for (const record of records) {
    let lat: number | undefined;
    let lng: number | undefined;
    let timestamp: number | null = null;

    if (record.latitudeE7 !== undefined && record.longitudeE7 !== undefined) {
      lat = record.latitudeE7 / 1e7;
      lng = record.longitudeE7 / 1e7;
    } else if (record.lat !== undefined && record.lng !== undefined) {
      lat = record.lat;
      lng = record.lng;
    } else if (record.latitude !== undefined && record.longitude !== undefined) {
      lat = record.latitude;
      lng = record.longitude;
    }

    if (lat === undefined || lng === undefined) continue;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) continue;

    const accuracy = record.accuracy ?? record.accuracyMeters;
    if (accuracy !== undefined && accuracy > 1000) continue;

    if (record.timestamp) {
      timestamp = new Date(record.timestamp).getTime();
    } else if (record.timestampMs) {
      timestamp = parseInt(record.timestampMs, 10);
    }

    batch.push({ lat, lng, timestamp, source: 'google' });
    total++;

    if (batch.length >= BATCH_SIZE) {
      onBatch(batch);
      batch = [];
    }
  }

  if (batch.length > 0) {
    onBatch(batch);
  }

  return total;
}

/**
 * Import location data from a Google Takeout JSON file.
 * Supports:
 * - Timeline.json (new semantic segments format)
 * - Records.json (latitudeE7/longitudeE7 format)
 * - Location History.json (legacy format)
 */
export async function importGoogleTakeout(
  fileUri: string,
  onProgress?: ProgressCallback
): Promise<ImportProgress> {
  const progress: ImportProgress = {
    pointsProcessed: 0,
    pointsInserted: 0,
    phase: 'reading',
  };

  try {
    onProgress?.(progress);

    progress.phase = 'parsing';
    onProgress?.(progress);

    const response = await fetch(fileUri);
    if (!response.ok) {
      throw new Error('Failed to read file');
    }
    const content = await response.text();
    const data = JSON.parse(content);

    const onBatch = (batch: { lat: number; lng: number; timestamp: number | null; source: string }[]) => {
      insertLocationPoints(batch);
      progress.pointsInserted += batch.length;
      progress.pointsProcessed += batch.length;
      onProgress?.(progress);
    };

    // Detect format and extract
    if (data.semanticSegments) {
      // New Timeline.json format
      extractFromTimeline(data, onBatch);
    } else if (Array.isArray(data) && data.length > 0 && Array.isArray(data[0])) {
      // Compact format: [[lng, lat, timestamp], ...]
      extractFromCompact(data, onBatch);
    } else if (Array.isArray(data.locations)) {
      extractFromRecords(data.locations, onBatch);
    } else if (Array.isArray(data)) {
      extractFromRecords(data, onBatch);
    } else if (data.locationHistory?.locations) {
      extractFromRecords(data.locationHistory.locations, onBatch);
    } else {
      throw new Error(
        'Unrecognized format. Expected Timeline.json, Records.json, or Location History.json'
      );
    }

    progress.phase = 'done';
    onProgress?.(progress);
    return progress;
  } catch (e: any) {
    progress.phase = 'error';
    progress.error = e.message ?? 'Unknown error';
    onProgress?.(progress);
    return progress;
  }
}
