/**
 * Map / directions links
 *
 * The app is built on OpenStreetMap (map tiles, Nominatim, OSRM), so
 * "open this route in a map" uses OpenStreetMap's own directions page: a
 * standard, public URL that needs no API key and exposes no credentials.
 *
 * Coordinates come from geocoding the *area names* the student typed (they
 * are approximate, area-level points, never device GPS), and they only leave
 * the app when the student clicks the link.
 */

const OSM_DIRECTIONS_URL = 'https://www.openstreetmap.org/directions';

/** OSRM profiles OpenStreetMap's directions page understands. */
const ENGINES = {
  car: 'fossgis_osrm_car',
  bike: 'fossgis_osrm_bike',
  foot: 'fossgis_osrm_foot',
};

function validPoint(point) {
  const lat = Number(point && point.lat);
  const lon = Number(point && point.lon);
  const ok =
    point != null &&
    point.lat !== null && point.lat !== '' &&
    point.lon !== null && point.lon !== '' &&
    Number.isFinite(lat) && Number.isFinite(lon) &&
    lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
  return ok ? { lat, lon } : null;
}

/**
 * @param {{ origin: {lat:number|string, lon:number|string}, destination: {lat:number|string, lon:number|string}, profile?: 'car'|'bike'|'foot' }} input
 * @returns {string|null} an https OpenStreetMap directions URL, or null when either point is unusable
 */
export function buildOsmDirectionsUrl({ origin, destination, profile = 'car' } = {}) {
  const from = validPoint(origin);
  const to = validPoint(destination);
  if (!from || !to) return null;

  const engine = ENGINES[profile] || ENGINES.car;
  const route = `${from.lat},${from.lon};${to.lat},${to.lon}`;
  return `${OSM_DIRECTIONS_URL}?engine=${encodeURIComponent(engine)}&route=${encodeURIComponent(route)}`;
}
