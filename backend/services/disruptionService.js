const { reportRepository } = require('../repositories');
const { MUMBAI_KNOWN_LOCATIONS } = require('./geocodingService');

/**
 * Calculates freshness multiplier based on age in milliseconds
 * 0–10 mins: 1.0
 * 10–30 mins: 0.75
 * 30–60 mins: 0.45
 * 60–120 mins: 0.20
 * > 120 mins: 0 (expired)
 */
function calculateFreshnessWeight(createdAt) {
  const ageMinutes = (Date.now() - createdAt) / (60 * 1000);
  if (ageMinutes <= 10) return 1.0;
  if (ageMinutes <= 30) return 0.75;
  if (ageMinutes <= 60) return 0.45;
  if (ageMinutes <= 120) return 0.20;
  return 0.0;
}

function haversineKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// Stopwords to prevent generic transit words from creating false corridor matches
const TRANSIT_STOPWORDS = new Set([
  'station', 'metro', 'train', 'local', 'line', 'stop', 'stand', 'depot',
  'east', 'west', 'road', 'express', 'highway', 'terminal', 'terminus',
  'junction', 'bridge', 'flyover', 'corridor', 'route', 'mumbai', 'suburban',
  'central', 'western', 'harbour', 'fast', 'slow', 'service', 'wr', 'cr',
  'platform', 'near', 'towards', 'interchange', 'gate'
]);

function extractSpecificLocationTokens(str) {
  return (str || '').toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length >= 3 && !TRANSIT_STOPWORDS.has(w));
}

function getReportCoordinates(report) {
  if (report.lat && report.lon) return { lat: report.lat, lon: report.lon };
  const areaLower = (report.area || '').toLowerCase();
  for (const [key, loc] of Object.entries(MUMBAI_KNOWN_LOCATIONS)) {
    if (areaLower.includes(key)) {
      return { lat: loc.lat, lon: loc.lon };
    }
  }
  return null;
}

function getActiveReports() {
  const now = Date.now();
  const reports = reportRepository.findActive(now);

  return reports.map(report => {
    const r = report.toRow ? report.toRow() : report;
    const freshness = calculateFreshnessWeight(r.created_at);
    const ageMinutes = Math.max(1, Math.round((now - r.created_at) / (60 * 1000)));
    return {
      ...r,
      freshnessWeight: freshness,
      ageMinutes,
      ageFormatted: ageMinutes < 60 ? `${ageMinutes}m ago` : `${Math.floor(ageMinutes / 60)}h ${ageMinutes % 60}m ago`,
      isConfirmedByCommunity: r.confirmation_count > r.contradiction_count
    };
  }).filter(r => r.freshnessWeight > 0);
}

/**
 * Evaluates candidate route impact against active community reports.
 * Route advisories and warnings are strictly filtered to the physical corridor of travel:
 * - A report must be within 2.0 km of the route's physical path or transit stops.
 * - Transportation modes must match the actual route legs (e.g. auto stand issues do not attach to train routes).
 *
 * Returns disruptionScore (0 = clean, 100 = severely blocked) and matching alerts.
 */
function evaluateRouteDisruptions(routeCandidate, activeReports) {
  let disruptionPenalty = 0;
  const matchingAlerts = [];

  // Build physical corridor reference coordinates from transit stations and sampled route geometry
  const corridorPoints = [];
  if (routeCandidate.transitStations && routeCandidate.transitStations.length > 0) {
    for (const s of routeCandidate.transitStations) {
      if (s.lat && s.lon) corridorPoints.push({ lat: s.lat, lon: s.lon });
    }
  }
  if (routeCandidate.geometry && Array.isArray(routeCandidate.geometry.coordinates)) {
    const coords = routeCandidate.geometry.coordinates;
    const step = Math.max(1, Math.floor(coords.length / 30));
    for (let i = 0; i < coords.length; i += step) {
      const pt = coords[i];
      if (pt && pt.length >= 2) {
        corridorPoints.push({ lat: pt[1], lon: pt[0] });
      }
    }
  }

  // Tokenize candidate route stations and leg endpoints for name matching
  const searchTarget = [
    routeCandidate.title,
    routeCandidate.subtitle,
    ...(routeCandidate.transitStations || []).map(s => s.name),
    ...(routeCandidate.legs || []).map(l => `${l.from} ${l.to}`)
  ].join(' ').toLowerCase();

  for (const report of activeReports) {
    // 1. Check transportation mode match
    const repMode = (report.mode || '').toLowerCase();
    const routeModes = [
      routeCandidate.primaryMode,
      ...(routeCandidate.modesIncluded || []),
      ...(routeCandidate.legs || []).map(l => l.mode)
    ].filter(Boolean).map(m => m.toLowerCase());

    const modeMatched = routeModes.includes(repMode) ||
      (repMode === 'train' && routeModes.some(m => m.includes('rail') || m.includes('train'))) ||
      (repMode === 'bus' && routeModes.some(m => m.includes('bus')));

    // 2. Check spatial corridor match
    let spatialMatched = null;
    const repCoords = getReportCoordinates(report);
    if (repCoords && corridorPoints.length > 0) {
      let minDist = Infinity;
      for (const pt of corridorPoints) {
        const d = haversineKm(repCoords.lat, repCoords.lon, pt.lat, pt.lon);
        if (d < minDist) minDist = d;
      }
      // Report must be within 2.0 km of this travel plan's physical path
      spatialMatched = minDist <= 2.0;
    }

    // 3. Name match using non-stopword tokens (e.g. "dadar", "ghatkopar", "vikhroli")
    const repTokens = extractSpecificLocationTokens(report.area);
    const nameMatched = repTokens.length > 0 && repTokens.some(tok => searchTarget.includes(tok));

    const locationMatched = spatialMatched !== null ? spatialMatched : nameMatched;

    // Report MUST be within physical travel corridor AND match route mode
    if (locationMatched && modeMatched) {
      let baseSeverity = 15;
      if (report.impact === 'high') baseSeverity = 40;
      if (report.impact === 'medium') baseSeverity = 25;
      if (report.impact === 'low') baseSeverity = 10;

      // Positive messages (smooth, on-time) decrease disruption penalty
      if (report.message && (report.message.toLowerCase().includes('smooth') || report.message.toLowerCase().includes('on schedule'))) {
        baseSeverity = -10;
      }

      // Net confirmation factor (more confirmations amplify validity; contradictions diminish it)
      const netConfirm = Math.max(0.3, 1 + (report.confirmation_count - report.contradiction_count) * 0.1);
      const effectiveImpact = Math.round(baseSeverity * report.freshnessWeight * Math.min(1.5, netConfirm));

      disruptionPenalty += effectiveImpact;

      matchingAlerts.push({
        id: report.id,
        area: report.area,
        message: report.message,
        impact: report.impact,
        mode: report.mode,
        pseudonym: report.pseudonym,
        ageFormatted: report.ageFormatted,
        freshnessWeight: report.freshnessWeight,
        effectiveImpact,
        label: '⚠ Community reported'
      });
    }
  }

  // Bound disruption penalty between 0 and 100
  const normalizedPenalty = Math.max(0, Math.min(100, disruptionPenalty));

  return {
    disruptionScore: normalizedPenalty,
    alerts: matchingAlerts,
    hasDisruption: matchingAlerts.length > 0
  };
}

module.exports = {
  calculateFreshnessWeight,
  getActiveReports,
  evaluateRouteDisruptions
};
