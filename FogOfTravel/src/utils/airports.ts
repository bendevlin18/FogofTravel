import airportsData from '../assets/airports.json';

export interface Airport {
  iata: string;
  name: string;
  city: string;
  country: string;
  lat: number;
  lng: number;
}

const airports: Airport[] = airportsData as Airport[];

// Index by IATA code for fast lookup
const byIata = new Map<string, Airport>();
for (const a of airports) {
  byIata.set(a.iata.toUpperCase(), a);
}

/**
 * Look up an airport by IATA code.
 */
export function getAirport(iata: string): Airport | undefined {
  return byIata.get(iata.toUpperCase());
}

/**
 * Search airports by query string.
 * Matches against IATA code, city name, and airport name.
 * Returns up to `limit` results.
 */
export function searchAirports(query: string, limit: number = 10): Airport[] {
  if (!query || query.length < 2) return [];

  const q = query.toLowerCase();
  const results: Airport[] = [];

  // Exact IATA match first
  const exact = byIata.get(query.toUpperCase());
  if (exact) results.push(exact);

  for (const a of airports) {
    if (results.length >= limit) break;
    if (exact && a.iata === exact.iata) continue; // Skip duplicate

    if (
      a.iata.toLowerCase().includes(q) ||
      a.city.toLowerCase().includes(q) ||
      a.name.toLowerCase().includes(q)
    ) {
      results.push(a);
    }
  }

  return results;
}
