import { db } from '../db.js';

export interface GeoPoint {
  name: string;
  lat: number;
  lon: number;
}

export interface RouteMetrics {
  total_duration_ms: number;
  origin_cache_hit: boolean;
  destination_cache_hit: boolean;
  routing_cache_hit: boolean;
  cache_hits: number;
  cache_misses: number;
}

export interface RouteResult {
  origin: string;
  destination: string;
  mode: 'driving' | 'foot' | 'bike';
  distance_km: number;
  duration_minutes: number;
  cached: boolean;
  metrics: RouteMetrics;
}

const GEO_TTL_SECONDS = 30 * 24 * 60 * 60;
const ROUTE_TTL_SECONDS = 7 * 24 * 60 * 60;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function normalizeKey(str: string): string {
  return str.trim().toLowerCase().replace(/\s+/g, ' ');
}

export async function fetchWithRetry(url: string, options: RequestInit = {}, retries = 3, baseDelay = 800): Promise<Response> {
  let attempt = 0;
  while (attempt <= retries) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 6000);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      if (response.ok || (response.status !== 429 && response.status < 500)) {
        return response;
      }
    } catch (err: any) {
      if (attempt === retries) throw err;
    } finally {
      clearTimeout(timer);
    }
    attempt++;
    await sleep(baseDelay * Math.pow(2, attempt - 1) + Math.random() * 200);
  }
  throw new Error('Fallo en solicitud: ' + url);
}

export async function geocodePlace(query: string): Promise<{ point: GeoPoint | null; fromCache: boolean }> {
  const key = normalizeKey(query);
  const now = Math.floor(Date.now() / 1000);

  const cachedRes = await db.execute({
    sql: 'SELECT display_name, latitude, longitude, created_at FROM geocoding_cache WHERE query_key = ?',
    args: [key],
  });

  if (cachedRes.rows.length > 0) {
    const row = cachedRes.rows[0];
    if (now - Number(row.created_at) < GEO_TTL_SECONDS) {
      return {
        point: {
          name: String(row.display_name),
          lat: Number(row.latitude),
          lon: Number(row.longitude),
        },
        fromCache: true,
      };
    }
  }

  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('q', query);
  url.searchParams.set('format', 'json');
  url.searchParams.set('limit', '1');

  const res = await fetchWithRetry(url.toString(), {
    headers: { 'User-Agent': 'TravelCopilot-MCPServer/1.0 (contact: admin@travelcopilot.local)' },
  });

  const data = (await res.json()) as any[];
  if (!data || data.length === 0) return { point: null, fromCache: false };

  const point = {
    name: data[0].display_name,
    lat: parseFloat(data[0].lat),
    lon: parseFloat(data[0].lon),
  };

  await db.execute({
    sql: `
      INSERT INTO geocoding_cache (query_key, display_name, latitude, longitude, created_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(query_key) DO UPDATE SET
        display_name=excluded.display_name,
        latitude=excluded.latitude,
        longitude=excluded.longitude,
        created_at=excluded.created_at
    `,
    args: [key, point.name, point.lat, point.lon, now],
  });

  return { point, fromCache: false };
}

export async function calculateOsmRoute(
  originQuery: string,
  destinationQuery: string,
  mode: 'driving' | 'foot' | 'bike' = 'driving'
): Promise<RouteResult> {
  const start = performance.now();
  const [originResult, destResult] = await Promise.all([
    geocodePlace(originQuery),
    geocodePlace(destinationQuery),
  ]);

  if (!originResult.point) throw new Error('Origen no geolocalizado: ' + originQuery);
  if (!destResult.point) throw new Error('Destino no geolocalizado: ' + destinationQuery);

  const originGeo = originResult.point;
  const destGeo = destResult.point;
  const routeKey = originGeo.lat.toFixed(4) + ',' + originGeo.lon.toFixed(4) + '->' + destGeo.lat.toFixed(4) + ',' + destGeo.lon.toFixed(4) + ':' + mode;
  const now = Math.floor(Date.now() / 1000);

  const cachedRes = await db.execute({
    sql: 'SELECT distance_km, duration_minutes, created_at FROM routing_cache WHERE route_key = ?',
    args: [routeKey],
  });

  let distance_km = 0;
  let duration_minutes = 0;
  let routingFromCache = false;

  if (cachedRes.rows.length > 0) {
    const row = cachedRes.rows[0];
    if (now - Number(row.created_at) < ROUTE_TTL_SECONDS) {
      distance_km = Number(row.distance_km);
      duration_minutes = Number(row.duration_minutes);
      routingFromCache = true;
    }
  }

  if (!routingFromCache) {
    const coordinates = originGeo.lon + ',' + originGeo.lat + ';' + destGeo.lon + ',' + destGeo.lat;
    const osrmUrl = 'https://router.project-osrm.org/route/v1/' + mode + '/' + coordinates + '?overview=false';
    const res = await fetchWithRetry(osrmUrl);
    const routeData = (await res.json()) as any;
    if (routeData.code !== 'Ok' || !routeData.routes?.[0]) throw new Error('OSRM no encontró camino viable.');

    const route = routeData.routes[0];
    distance_km = parseFloat((route.distance / 1000).toFixed(2));
    duration_minutes = Math.round(route.duration / 60);

    await db.execute({
      sql: `
        INSERT INTO routing_cache (route_key, mode, distance_km, duration_minutes, created_at)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(route_key) DO UPDATE SET
          distance_km=excluded.distance_km,
          duration_minutes=excluded.duration_minutes,
          created_at=excluded.created_at
      `,
      args: [routeKey, mode, distance_km, duration_minutes, now],
    });
  }

  const end = performance.now();
  const hits = (originResult.fromCache ? 1 : 0) + (destResult.fromCache ? 1 : 0) + (routingFromCache ? 1 : 0);

  return {
    origin: originGeo.name,
    destination: destGeo.name,
    mode,
    distance_km,
    duration_minutes,
    cached: routingFromCache,
    metrics: {
      total_duration_ms: parseFloat((end - start).toFixed(2)),
      origin_cache_hit: originResult.fromCache,
      destination_cache_hit: destResult.fromCache,
      routing_cache_hit: routingFromCache,
      cache_hits: hits,
      cache_misses: 3 - hits,
    },
  };
}
