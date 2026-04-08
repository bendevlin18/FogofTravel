import { open, type DB } from '@op-engineering/op-sqlite';

let db: DB | null = null;

export function getDB(): DB {
  if (!db) {
    db = open({ name: 'fogoftravel.db' });
    initSchema(db);
  }
  return db;
}

function initSchema(db: DB) {
  db.executeSync(`
    CREATE TABLE IF NOT EXISTS location_points (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      timestamp INTEGER,
      source TEXT DEFAULT 'google'
    );
  `);

  db.executeSync(`
    CREATE INDEX IF NOT EXISTS idx_loc_coords ON location_points(lat, lng);
  `);

  db.executeSync(`
    CREATE TABLE IF NOT EXISTS location_clusters (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      point_count INTEGER,
      radius_m REAL,
      lod INTEGER
    );
  `);

  db.executeSync(`
    CREATE TABLE IF NOT EXISTS fog_cache (
      lod INTEGER PRIMARY KEY,
      geojson TEXT,
      updated_at INTEGER
    );
  `);

  db.executeSync(`
    CREATE TABLE IF NOT EXISTS flights (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      origin_iata TEXT NOT NULL,
      dest_iata TEXT NOT NULL,
      origin_lat REAL,
      origin_lng REAL,
      dest_lat REAL,
      dest_lng REAL,
      date TEXT,
      airline TEXT,
      flight_number TEXT,
      distance_km REAL,
      notes TEXT
    );
  `);

  db.executeSync(`
    CREATE TABLE IF NOT EXISTS visited_regions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      region_type TEXT,
      region_code TEXT,
      region_name TEXT,
      first_visited INTEGER
    );
  `);
}

/**
 * Insert location points in batches within a transaction.
 */
export function insertLocationPoints(
  points: { lat: number; lng: number; timestamp: number | null; source: string }[]
): void {
  const db = getDB();
  db.executeSync('BEGIN TRANSACTION');
  try {
    for (const p of points) {
      db.executeSync(
        'INSERT INTO location_points (lat, lng, timestamp, source) VALUES (?, ?, ?, ?)',
        [p.lat, p.lng, p.timestamp, p.source]
      );
    }
    db.executeSync('COMMIT');
  } catch (e) {
    db.executeSync('ROLLBACK');
    throw e;
  }
}

/**
 * Get all location points as [lng, lat] pairs for fog computation.
 */
export function getAllLocationCoords(): [number, number][] {
  const db = getDB();
  const result = db.executeSync('SELECT lng, lat FROM location_points');
  return result.rows.map((row: any) => [row.lng, row.lat]);
}

/**
 * Get grid-clustered location centroids directly from SQL.
 * This is much faster than loading all 280K rows into JS.
 *
 * @param gridSize - Grid cell size in degrees (default 0.5° ≈ 55km)
 * @returns Array of [lng, lat] cluster centroids
 */
export function getClusteredCoords(gridSize: number = 0.5): [number, number][] {
  const db = getDB();
  const result = db.executeSync(
    `SELECT AVG(lng) as lng, AVG(lat) as lat
     FROM location_points
     GROUP BY CAST(lat / ? AS INTEGER), CAST(lng / ? AS INTEGER)`,
    [gridSize, gridSize]
  );
  return result.rows.map((row: any) => [row.lng, row.lat]);
}

/**
 * Get the total count of imported location points.
 */
export function getLocationPointCount(): number {
  const db = getDB();
  const result = db.executeSync('SELECT COUNT(*) as count FROM location_points');
  return result.rows[0]?.count ?? 0;
}

/**
 * Clear all location points (for re-import).
 */
export function clearLocationPoints(): void {
  const db = getDB();
  db.executeSync('DELETE FROM location_points');
}
