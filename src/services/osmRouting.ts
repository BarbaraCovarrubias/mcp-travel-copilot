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
  throw new Error(`Fallo en solicitud: ${url}`);
}

export async function geocodePlace(query: string): Promise<{ point: GeoPoint | null; fromCache: boolean }> {
  const key = normalizeKey(query);
  const now = Math.floor(Date.now() / 1000);

  const cached = db.prepare(`SELECT display_name, latitude, longitude, created_at FROM geocoding_cache WHERE query_key = ?`).get(key) as any;
  if (cached && (now - cached.created_at) < GEO_TTL_SECONDS) {
    return { point: { name: cached.display_name, lat: cached.latitude, lon: cached.longitude }, fromCache: true };
  }
# Crear estructura de carpetas
mkdir -p src/services src/tools src/resources src/prompts nginx .github/workflows

# 1. package.json
cat << 'EOF' > package.json
{
  "name": "mcp-travel-copilot",
  "version": "1.0.0",
  "type": "module",
  "bin": {
    "travel-copilot": "./dist/index.js"
  },
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "test": "vitest run"
  },
  "dependencies": {
    "@modelcontextprotocol/sdk": "^1.0.1",
    "better-sqlite3": "^11.1.2",
    "grammy": "^1.30.0",
    "zod": "^3.23.8"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.11",
    "@types/node": "^22.0.0",
    "typescript": "^5.5.4",
    "vitest": "^2.0.0"
  }
}
