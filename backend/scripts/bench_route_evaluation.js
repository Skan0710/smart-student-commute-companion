/**
 * Route-evaluation latency benchmark
 *
 * Measures the server-side step that ranks a student's candidate routes
 * (DeterministicRouteScoringService.scoreAndRankRoutes) so any latency figure shown
 * on the public site is a measured number you can reproduce, not a guess:
 *
 *   node backend/scripts/bench_route_evaluation.js            # human-readable
 *   node backend/scripts/bench_route_evaluation.js --json     # machine-readable
 *
 * Scope: in-process scoring of 5 candidate routes on this machine. It excludes the
 * network, OpenStreetMap/OSRM/Open-Meteo calls and database access, which add their
 * own time. Run it on the production hardware before quoting it anywhere.
 */

const { deterministicRouteScoringService } = require('../services/deterministicRouteScoringService');
const { RouteEvaluation } = require('../models/RouteEvaluation');
const { DataProvenance, PROVENANCE_TIERS } = require('../models/CommuteContracts');

function candidate(i) {
  const baseline = 22 + i * 7;
  const delay = i % 2 === 0 ? 0 : 4 + i;
  return new RouteEvaluation({
    journeyId: `bench-${i}`,
    origin: 'Andheri West',
    destination: 'D.J. Sanghvi College of Engineering',
    departureTime: '08:00',
    estimatedArrivalTime: '08:30',
    updatedArrivalTime: '08:30',
    totalTravelTime: baseline + delay,
    baselineTravelTime: baseline,
    additionalDisruptionDelay: delay,
    totalAdditionalDelay: delay,
    waitingTime: 3 + i,
    walkingTime: 5 + i,
    transitTime: baseline - 8,
    numberOfTransfers: i % 3,
    estimatedCost: 15 + i * 10,
    totalDistanceKm: 4 + i,
    primaryMode: ['metro', 'train', 'bus', 'auto', 'train'][i % 5],
    modesIncluded: ['walk', ['metro', 'train', 'bus', 'auto', 'train'][i % 5]],
    isFeasible: true,
    feasibilityReason: 'OPERATIONAL',
    affectedSegments: [],
    unavailableSegments: [],
    reliability: 'LOW',
    uncertainty: 'LOW',
    trafficImpact: { level: 'normal', addedTravelTimeMinutes: 0 },
    weatherImpact: { condition: 'clear', totalAddedTravelTimeMinutes: 0, walkingInconvenienceLevel: 'NONE', travelUncertaintyLevel: 'LOW' },
    transportStatus: { dominantStatus: 'AVAILABLE', isUsable: true },
    reasonCodes: [],
    weaknesses: [],
    advisories: [],
    dataTiers: [PROVENANCE_TIERS.VERIFIED],
    provenance: DataProvenance.verified('Transit Feed', 'Official GTFS schedule')
  });
}

function percentile(sorted, p) {
  return sorted[Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length))];
}

function run({ iterations = 2000, warmup = 200 } = {}) {
  const routes = [0, 1, 2, 3, 4].map(candidate);
  for (let i = 0; i < warmup; i++) deterministicRouteScoringService.scoreAndRankRoutes(routes);

  const samples = [];
  for (let i = 0; i < iterations; i++) {
    const start = process.hrtime.bigint();
    deterministicRouteScoringService.scoreAndRankRoutes(routes);
    samples.push(Number(process.hrtime.bigint() - start) / 1e6);
  }
  samples.sort((a, b) => a - b);
  return {
    candidateRoutes: routes.length,
    iterations,
    medianMs: +percentile(samples, 50).toFixed(3),
    p95Ms: +percentile(samples, 95).toFixed(3),
    p99Ms: +percentile(samples, 99).toFixed(3),
    maxMs: +samples[samples.length - 1].toFixed(3),
    node: process.version,
    platform: `${process.platform}/${process.arch}`
  };
}

if (require.main === module) {
  const result = run();
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify(result));
  } else {
    console.log('Route evaluation (rank 5 candidate routes), in-process:');
    console.log(`  median ${result.medianMs} ms | p95 ${result.p95Ms} ms | p99 ${result.p99Ms} ms | max ${result.maxMs} ms`);
    console.log(`  ${result.iterations} runs on ${result.platform}, node ${result.node}`);
  }
}

module.exports = { run };
