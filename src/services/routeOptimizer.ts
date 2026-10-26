import { geocodePlace, calculateOsmRoute } from './osmRouting.js';

export interface OptimizedStop {
  order: number;
  name: string;
  original_query: string;
  coordinates: { lat: number; lon: number };
  distance_from_previous_km: number;
  transit_time_from_previous_minutes: number;
}

export async function optimizeAttractionsOrder(
  attractions: string[],
  mode: 'driving' | 'foot' | 'bike' = 'foot',
  fixStart = true,
  roundTrip = false
) {
  if (attractions.length < 2) throw new Error('Se requieren al menos 2 paradas para optimizar.');

  const geoResults = await Promise.all(
    attractions.map(async (name) => {
      const geo = await geocodePlace(name);
      if (!geo.point) throw new Error(`No se pudo geolocalizar: "${name}"`);
      return { query: name, geo: geo.point };
    })
  );

  const n = geoResults.length;
  const distMatrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));
  const timeMatrix: number[][] = Array.from({ length: n }, () => new Array(n).fill(0));

  for (let i = 0; i < n; i++) {
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const res = await calculateOsmRoute(geoResults[i].query, geoResults[j].query, mode);
      distMatrix[i][j] = res.distance_km;
      timeMatrix[i][j] = res.duration_minutes;
    }
  }

  const visited = new Array(n).fill(false);
  const route = [0];
  visited[0] = true;

  for (let step = 1; step < n; step++) {
    const last = route[route.length - 1];
    let nextCity = -1;
    let minDist = Infinity;
    for (let c = 0; c < n; c++) {
      if (!visited[c] && distMatrix[last][c] < minDist) {
        minDist = distMatrix[last][c];
        nextCity = c;
      }
    }
    visited[nextCity] = true;
    route.push(nextCity);
  }

  const orderedStops: OptimizedStop[] = [];
  let totalDistance = 0;
  let totalMinutes = 0;

  for (let step = 0; step < route.length; step++) {
    const cur = route[step];
    const item = geoResults[cur];
    let legDist = 0;
    let legTime = 0;

    if (step > 0) {
      const prev = route[step - 1];
      legDist = distMatrix[prev][cur];
      legTime = timeMatrix[prev][cur];
      totalDistance += legDist;
      totalMinutes += legTime;
    }

    orderedStops.push({
      order: step + 1,
      name: item.geo.name,
      original_query: item.query,
      coordinates: { lat: item.geo.lat, lon: item.geo.lon },
      distance_from_previous_km: parseFloat(legDist.toFixed(2)),
      transit_time_from_previous_minutes: legTime,
    });
  }

  return {
    orderedStops,
    total_distance_km: parseFloat(totalDistance.toFixed(2)),
    total_transit_minutes: totalMinutes,
    mode,
    circuit_closed: roundTrip,
  };
}
