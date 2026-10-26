const axios = require('axios');

/**
 * Calculates straight line distance in km between two GPS points (Haversine formula)
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 6371; // Radius of the Earth in km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Generates intermediate coordinates between start and end for smooth fallback geometry
 */
function generateFallbackGeometry(lat1, lon1, lat2, lon2, steps = 10) {
  const coordinates = [];
  for (let i = 0; i <= steps; i++) {
    const ratio = i / steps;
    const lat = lat1 + (lat2 - lat1) * ratio;
    const lon = lon1 + (lon2 - lon1) * ratio;
    // coordinates in GeoJSON format are [longitude, latitude]
    coordinates.push([lon, lat]);
  }
  return {
    type: 'LineString',
    coordinates
  };
}

// In-memory cache for OSRM route geometries to eliminate redundant API calls and prevent rate limiting
const routeGeometryCache = new Map();
const ROUTE_CACHE_MAX = 500;

function getCacheKey(mode, coordsStr) {
  return `${mode}:${coordsStr}`;
}

function setCache(key, data) {
  if (routeGeometryCache.size >= ROUTE_CACHE_MAX) {
    const firstKey = routeGeometryCache.keys().next().value;
    routeGeometryCache.delete(firstKey);
  }
  routeGeometryCache.set(key, { data, timestamp: Date.now() });
}

function getCache(key) {
  const cached = routeGeometryCache.get(key);
  if (!cached) return null;
  // Valid for 2 hours
  if (Date.now() - cached.timestamp > 2 * 60 * 60 * 1000) {
    routeGeometryCache.delete(key);
    return null;
  }
  return cached.data;
}

/**
 * Fetches routing geometry and estimated travel duration using OSRM.
 * mode: 'driving' or 'walking'
 */
async function getOsrmRoute(origin, destination, mode = 'driving') {
  const profile = mode === 'walking' ? 'walking' : 'driving';
  const coordsKey = `${origin.lon.toFixed(5)},${origin.lat.toFixed(5)};${destination.lon.toFixed(5)},${destination.lat.toFixed(5)}`;
  const cacheKey = getCacheKey(profile, coordsKey);

  const cached = getCache(cacheKey);
  if (cached) {
    return cached;
  }

  const url = `https://router.project-osrm.org/route/v1/${profile}/${coordsKey}?overview=full&geometries=geojson&steps=true`;

  try {
    const response = await axios.get(url, { timeout: 4500 });
    if (response.data && response.data.routes && response.data.routes.length > 0) {
      const route = response.data.routes[0];
      const distanceKm = +(route.distance / 1000).toFixed(2);
      // In Mumbai, driving speed during peak hours is slower (~22 km/h city average)
      let durationMinutes = Math.round(route.duration / 60);
      if (mode === 'driving') {
        durationMinutes = Math.max(10, Math.round(distanceKm * 2.8 + 8));
      } else {
        durationMinutes = Math.max(3, Math.round(distanceKm * 13.3));
      }

      const result = {
        success: true,
        source: 'OSRM Real Road Network API',
        distanceKm,
        durationMinutes,
        geometry: route.geometry,
        legs: route.legs
      };

      setCache(cacheKey, result);
      return result;
    }
  } catch (err) {
    console.warn(`OSRM ${mode} route calculation failed: ${err.message}. Using fallback geometry.`);
  }

  // Fallback calculation using Haversine
  const distanceKm = +(haversineDistance(origin.lat, origin.lon, destination.lat, destination.lon) * 1.3).toFixed(2);
  let durationMinutes = 0;
  if (mode === 'walking') {
    durationMinutes = Math.max(5, Math.round(distanceKm * 13.5));
  } else {
    durationMinutes = Math.max(12, Math.round(distanceKm * 2.9 + 10));
  }

  return {
    success: false,
    source: 'Estimated Route (Haversine Grid)',
    distanceKm,
    durationMinutes,
    geometry: generateFallbackGeometry(origin.lat, origin.lon, destination.lat, destination.lon),
    legs: []
  };
}

/**
 * Fetches road/street geometry following actual road networks through multiple waypoints.
 * points: Array of { lat, lon }
 * mode: 'driving' or 'walking'
 */
async function getOsrmRouteThroughWaypoints(points, mode = 'driving') {
  if (!points || points.length < 2) return null;
  const profile = mode === 'walking' ? 'walking' : 'driving';
  const coordsStr = points.map(p => `${p.lon.toFixed(5)},${p.lat.toFixed(5)}`).join(';');
  const cacheKey = getCacheKey(profile, coordsStr);

  const cached = getCache(cacheKey);
  if (cached) {
    return cached.geometry;
  }

  const url = `https://router.project-osrm.org/route/v1/${profile}/${coordsStr}?overview=full&geometries=geojson&steps=false`;

  try {
    const response = await axios.get(url, { timeout: 6000 });
    if (response.data && response.data.routes && response.data.routes.length > 0) {
      const geometry = response.data.routes[0].geometry;
      setCache(cacheKey, { geometry });
      return geometry;
    }
  } catch (err) {
    console.warn(`OSRM multi-waypoint ${mode} failed: ${err.message}`);
  }
  return null;
}

module.exports = {
  getOsrmRoute,
  getOsrmRouteThroughWaypoints,
  haversineDistance,
  generateFallbackGeometry
};
