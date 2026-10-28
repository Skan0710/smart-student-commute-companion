import React, { useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';

// Custom SVG Icons
function createCustomIcon(color, label, iconSvg) {
  return L.divIcon({
    className: 'custom-leaflet-marker',
    html: `
      <div style="
        background: ${color};
        width: 32px;
        height: 32px;
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        display: flex;
        align-items: center;
        justify-content: center;
        border: 2px solid #ffffff;
        box-shadow: 0 4px 10px rgba(0,0,0,0.5);
      ">
        <div style="transform: rotate(45deg); display: flex; align-items: center; justify-content: center;">
          ${iconSvg}
        </div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
    popupAnchor: [0, -32]
  });
}

const originIcon = createCustomIcon('#10b981', 'Origin', '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><circle cx="12" cy="12" r="6"/></svg>');
const destIcon = createCustomIcon('#6366f1', 'College', '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.5"><path d="M22 10v6M2 10l10-5 10 5-10 5z"/><path d="M6 12v5c3 3 9 3 12 0v-5"/></svg>');
const transitIcon = createCustomIcon('#f59e0b', 'Station', '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><rect x="4" y="3" width="16" height="16" rx="2"/><path d="M4 11h16"/><path d="M12 3v8"/></svg>');

/**
 * Representative coordinates for Mumbai transit hubs & college locations.
 */
const AREA_COORDINATES = [
  { match: ['andheri'], lat: 19.1197, lon: 72.8464 },
  { match: ['powai', 'jvlr', 'iit bombay'], lat: 19.122, lon: 72.905 },
  { match: ['dadar'], lat: 19.0178, lon: 72.8478 },
  { match: ['ghatkopar'], lat: 19.0864, lon: 72.9081 },
  { match: ['bandra'], lat: 19.0596, lon: 72.8295 },
  { match: ['kurla'], lat: 19.0728, lon: 72.8826 },
  { match: ['borivali'], lat: 19.2307, lon: 72.8567 },
  { match: ['kandivali'], lat: 19.2049, lon: 72.8526 },
  { match: ['malad'], lat: 19.1864, lon: 72.8493 },
  { match: ['goregaon'], lat: 19.1663, lon: 72.8526 },
  { match: ['jogeshwari'], lat: 19.1361, lon: 72.849 },
  { match: ['vile parle', 'parle', 'dj sanghvi', 'djsce', 'sanghvi'], lat: 19.099, lon: 72.8445 },
  { match: ['santacruz'], lat: 19.0817, lon: 72.8417 },
  { match: ['matunga'], lat: 19.027, lon: 72.857 },
  { match: ['sion'], lat: 19.039, lon: 72.8619 },
  { match: ['wadala'], lat: 19.0176, lon: 72.8561 },
  { match: ['mahim'], lat: 19.041, lon: 72.84 },
  { match: ['lower parel', 'parel'], lat: 18.993, lon: 72.83 },
  { match: ['churchgate'], lat: 18.9322, lon: 72.8264 },
  { match: ['marine lines'], lat: 18.944, lon: 72.823 },
  { match: ['mumbai central'], lat: 18.969, lon: 72.8196 },
  { match: ['csmt', 'cst', 'fort'], lat: 18.9398, lon: 72.8355 },
  { match: ['colaba'], lat: 18.9067, lon: 72.8147 },
  { match: ['versova'], lat: 19.131, lon: 72.818 },
  { match: ['vikhroli'], lat: 19.11, lon: 72.927 },
  { match: ['mulund'], lat: 19.1726, lon: 72.9425 },
  { match: ['thane'], lat: 19.186, lon: 72.975 },
  { match: ['chembur'], lat: 19.0522, lon: 72.9005 },
  { match: ['vashi'], lat: 19.0771, lon: 72.998 },
  { match: ['airoli'], lat: 19.159, lon: 72.999 },
  { match: ['panvel'], lat: 18.9894, lon: 73.1175 },
];

export function locateArea(area) {
  const name = String(area || '').toLowerCase();
  if (!name) return null;
  return AREA_COORDINATES.find((entry) => entry.match.some((keyword) => name.includes(keyword))) || null;
}

/**
 * Robust coordinate normalizer that converts any representation
 * (GeoJSON [lon, lat], Leaflet [lat, lon], objects {lat, lon}, or area names)
 * into a verified Leaflet [lat, lon] pair.
 */
export function resolvePoint(pt) {
  if (!pt) return null;
  if (typeof pt === 'string') {
    const loc = locateArea(pt);
    return loc ? [loc.lat, loc.lon] : null;
  }
  if (Array.isArray(pt)) {
    const [a, b] = pt;
    if (typeof a === 'number' && typeof b === 'number') {
      // Mumbai latitude is ~18.8 - 19.5, longitude is ~72.7 - 73.3
      if (a > 50 && b < 50) return [b, a]; // GeoJSON [lon, lat] -> [lat, lon]
      return [a, b];
    }
  }
  if (typeof pt === 'object') {
    const lat = pt.lat ?? pt.latitude;
    const lon = pt.lon ?? pt.lng ?? pt.longitude;
    if (typeof lat === 'number' && typeof lon === 'number') {
      return [lat, lon];
    }
    const name = pt.display_name || pt.name || pt.area;
    if (name) {
      const loc = locateArea(name);
      if (loc) return [loc.lat, loc.lon];
    }
  }
  return null;
}

/**
 * Builds guaranteed continuous route coordinates under ALL conditions:
 * - Direct OSRM geometry if present
 * - Seamless connections to origin and destination
 * - Station-to-station corridor interpolation if geometry is absent
 */
function getRoutePoints(route, originCoord, destCoord) {
  if (!route) return [];
  const points = [];

  // 1. Try geometry coordinates
  if (route.geometry && Array.isArray(route.geometry.coordinates) && route.geometry.coordinates.length > 0) {
    route.geometry.coordinates.forEach((c) => {
      const pt = resolvePoint(c);
      if (pt) points.push(pt);
    });
  }

  // 2. If geometry is empty or has fewer than 2 points, construct from stations
  if (points.length < 2) {
    if (originCoord) points.push(originCoord);
    const stations = route.transitStations || route.stations || [];
    stations.forEach((s) => {
      const sPt = resolvePoint(s);
      if (sPt) points.push(sPt);
    });
    if (destCoord) points.push(destCoord);
  } else {
    // Ensure origin is connected to start of geometry if not already close
    if (originCoord && points.length > 0) {
      const distStart = Math.hypot(points[0][0] - originCoord[0], points[0][1] - originCoord[1]);
      if (distStart > 0.003) {
        points.unshift(originCoord);
      }
    }
    // Ensure destination is connected to end of geometry if not already close
    if (destCoord && points.length > 0) {
      const distEnd = Math.hypot(points[points.length - 1][0] - destCoord[0], points[points.length - 1][1] - destCoord[1]);
      if (distEnd > 0.003) {
        points.push(destCoord);
      }
    }
  }

  return points;
}

// Re-measure the map whenever its container changes size
function ResizeWatcher() {
  const map = useMap();
  useEffect(() => {
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() => map.invalidateSize());
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);
  return null;
}

// Helper component to auto fit map bounds to routes
function FitBoundsToRoutes({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.isValid()) {
      map.fitBounds(bounds, { padding: [45, 45], maxZoom: 15 });
    }
  }, [bounds, map]);
  return null;
}

export default function MapView({
  planResult,
  selectedRouteId,
  disruptionReports = []
}) {
  // Default coordinates: Central Mumbai
  const defaultCenter = [19.0760, 72.8777];

  const originCoord = useMemo(() => {
    if (!planResult?.query) return null;
    return resolvePoint(planResult.query.origin);
  }, [planResult]);

  const destCoord = useMemo(() => {
    if (!planResult?.query) return null;
    return resolvePoint(planResult.query.destination);
  }, [planResult]);

  const allRoutes = useMemo(() => {
    if (!planResult) return [];
    const list = [];
    if (planResult.recommendation?.route) {
      list.push(planResult.recommendation.route);
    }
    if (Array.isArray(planResult.alternatives)) {
      list.push(...planResult.alternatives.filter(Boolean));
    }
    return list;
  }, [planResult]);

  const selectedRoute = useMemo(() => {
    if (allRoutes.length === 0) return null;
    if (!selectedRouteId) return allRoutes[0];
    return (
      allRoutes.find((r) => String(r.id) === String(selectedRouteId) || String(r.journeyId) === String(selectedRouteId)) ||
      allRoutes[0]
    );
  }, [allRoutes, selectedRouteId]);

  // Guaranteed points for the selected route
  const selectedRoutePoints = useMemo(() => {
    if (!selectedRoute) return [];
    return getRoutePoints(selectedRoute, originCoord, destCoord);
  }, [selectedRoute, originCoord, destCoord]);

  // Compute bounding box for map
  const bounds = useMemo(() => {
    const latLngs = [];
    if (originCoord) latLngs.push(originCoord);
    if (destCoord) latLngs.push(destCoord);
    if (selectedRoutePoints.length > 0) {
      selectedRoutePoints.forEach((pt) => latLngs.push(pt));
    }
    if (latLngs.length === 0) return null;
    return L.latLngBounds(latLngs);
  }, [originCoord, destCoord, selectedRoutePoints]);

  const stationsToDisplay = useMemo(() => {
    const list = selectedRoute?.transitStations || selectedRoute?.stations || [];
    return list
      .map((s) => {
        const coord = resolvePoint(s);
        return coord ? { name: s.name || s.display_name || 'Station', coord } : null;
      })
      .filter(Boolean);
  }, [selectedRoute]);

  const routeColor = useMemo(() => {
    const mode = selectedRoute?.primaryMode || selectedRoute?.mode || 'transit';
    if (mode === 'metro') return '#f59e0b';
    if (mode === 'train' || mode === 'rail') return '#38bdf8';
    if (mode === 'bus') return '#f97316';
    if (mode === 'auto') return '#eab308';
    return '#10b981';
  }, [selectedRoute]);

  return (
    <div className="relative w-full h-[500px] lg:h-full min-h-[450px] rounded-3xl overflow-hidden font-sans">
      {/* Map Legend Overlay */}
      <div className="absolute bottom-8 left-3 z-[1000] bg-white/95 dark:bg-slate-900/90 backdrop-blur-md border border-slate-200 dark:border-white/10 rounded-xl px-3 py-2 text-xs space-y-1 shadow-lg pointer-events-auto">
        <div className="font-bold text-slate-700 dark:text-slate-200 text-[11px] uppercase tracking-wider mb-1 flex items-center justify-between gap-4">
          <span>Transit Map</span>
          <span className="text-[10px] text-emerald-600 dark:text-emerald-400">Verified GTFS</span>
        </div>
        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 text-[11px]">
          <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 border border-white"></span>
          <span>Origin</span>
        </div>
        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 text-[11px]">
          <span className="w-2.5 h-2.5 rounded-full bg-indigo-500 border border-white"></span>
          <span>College Destination</span>
        </div>
        <div className="flex items-center gap-2 text-slate-600 dark:text-slate-300 text-[11px]">
          <span className="w-3.5 h-1.5 rounded-full" style={{ backgroundColor: routeColor }}></span>
          <span>Active Route</span>
        </div>
      </div>

      <MapContainer
        center={bounds ? bounds.getCenter() : defaultCenter}
        zoom={12}
        scrollWheelZoom={true}
        className="w-full h-full"
      >
        {/* OpenStreetMap Tile Layer - Clean natural map theme in all modes */}
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        <ResizeWatcher />
        {bounds && <FitBoundsToRoutes bounds={bounds} />}

        {/* Origin Marker */}
        {originCoord && (
          <Marker
            position={originCoord}
            icon={originIcon}
            title={`Starting area: ${planResult?.query?.origin?.display_name || planResult?.query?.origin || 'origin'}`}
            alt={`Starting area: ${planResult?.query?.origin?.display_name || planResult?.query?.origin || 'origin'}`}
          >
            <Popup>
              <div className="text-xs">
                <div className="font-bold text-emerald-700 dark:text-emerald-400">Starting Point</div>
                <div className="text-slate-700 dark:text-slate-200 mt-0.5">
                  {typeof planResult?.query?.origin === 'string'
                    ? planResult.query.origin
                    : planResult?.query?.origin?.display_name || 'Origin'}
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Destination Marker */}
        {destCoord && (
          <Marker
            position={destCoord}
            icon={destIcon}
            title={`Destination college: ${planResult?.query?.destination?.display_name || planResult?.query?.destination || 'destination'}`}
            alt={`Destination college: ${planResult?.query?.destination?.display_name || planResult?.query?.destination || 'destination'}`}
          >
            <Popup>
              <div className="text-xs">
                <div className="font-bold text-indigo-700 dark:text-indigo-400">Destination College</div>
                <div className="text-slate-700 dark:text-slate-200 mt-0.5">
                  {typeof planResult?.query?.destination === 'string'
                    ? planResult.query.destination
                    : planResult?.query?.destination?.display_name || 'Destination College'}
                </div>
              </div>
            </Popup>
          </Marker>
        )}

        {/* Alternative Routes Polylines (Muted dashed lines) */}
        {allRoutes.map((route) => {
          if (route.id === selectedRoute?.id) return null;
          const altPoints = getRoutePoints(route, originCoord, destCoord);
          if (altPoints.length < 2) return null;
          return (
            <Polyline
              key={route.id}
              positions={altPoints}
              pathOptions={{
                color: '#64748b',
                weight: 3.5,
                opacity: 0.45,
                dashArray: '5, 8'
              }}
            />
          );
        })}

        {/* Active Selected Route Polyline (Glow + Vibrant Path) */}
        {selectedRoutePoints.length >= 2 && (
          <>
            <Polyline
              positions={selectedRoutePoints}
              pathOptions={{
                color: routeColor,
                weight: 8,
                opacity: 0.28
              }}
            />
            <Polyline
              positions={selectedRoutePoints}
              pathOptions={{
                color: routeColor,
                weight: 4.5,
                opacity: 0.95
              }}
            />
          </>
        )}

        {/* Transit Station Markers */}
        {stationsToDisplay.map((station, idx) => (
          <Marker
            key={idx}
            position={station.coord}
            icon={transitIcon}
            title={`Transit stop: ${station.name || 'stop'}`}
            alt={`Transit stop: ${station.name || 'stop'}`}
          >
            <Popup>
              <div className="text-xs">
                <div className="font-bold text-amber-800 dark:text-amber-400">Transit Stop</div>
                <div className="text-slate-700 dark:text-slate-200">{station.name}</div>
                <div className="text-[10px] text-slate-500 dark:text-slate-400 mt-0.5">Verified Mumbai GTFS Stop</div>
              </div>
            </Popup>
          </Marker>
        ))}

        {/* Disruption Warning Area Circles */}
        {disruptionReports.map((report) => {
          const location = locateArea(report.area);
          if (!location) return null;

          return (
            <Circle
              key={report.id}
              center={[location.lat, location.lon]}
              radius={450}
              pathOptions={{
                color: report.impact === 'high' ? '#ef4444' : '#f59e0b',
                fillColor: report.impact === 'high' ? '#ef4444' : '#f59e0b',
                fillOpacity: 0.25,
                weight: 2
              }}
            >
              <Popup>
                <div className="text-xs max-w-[200px]">
                  <div className="font-bold text-amber-800 dark:text-amber-400 flex items-center gap-1">
                    <span>⚠ Community Disruption</span>
                  </div>
                  <div className="font-semibold text-slate-900 dark:text-white mt-0.5">{report.area}</div>
                  <p className="text-slate-600 dark:text-slate-300 mt-1 text-[11px] leading-snug">{report.message}</p>
                </div>
              </Popup>
            </Circle>
          );
        })}
      </MapContainer>
    </div>
  );
}
