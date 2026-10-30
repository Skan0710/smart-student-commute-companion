/**
 * Ingest Real Mumbai GTFS Data into SQLite
 * Handles 7,500+ stops, 935+ routes, agencies, trips and stop_times
 */
const fs = require('fs');
const readline = require('readline');
const path = require('path');
const { getConnection } = require('../db/connection');

function parseCsvLine(text) {
  const result = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      result.push(cur);
      cur = '';
    } else {
      cur += c;
    }
  }
  result.push(cur);
  return result;
}

async function processLineByLine(filePath, onRow) {
  const fileStream = fs.createReadStream(filePath, { encoding: 'utf8' });
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let headers = null;
  for await (const line of rl) {
    if (!line || !line.trim()) continue;
    const parts = parseCsvLine(line);
    if (!headers) {
      headers = parts.map(h => h.trim().replace(/^[\uFEFF]/, ''));
      continue;
    }
    const row = {};
    for (let i = 0; i < headers.length; i++) {
      row[headers[i]] = parts[i] !== undefined ? parts[i].trim() : '';
    }
    onRow(row);
  }
}

async function ingest() {
  console.log('Starting ingestion of real Mumbai GTFS into SQLite...');
  const t0 = Date.now();
  const db = getConnection();

  // Pragmas for fast bulk load
  db.pragma('synchronous = OFF');
  db.pragma('journal_mode = MEMORY');

  // Clear previous synthetic GTFS tables
  console.log('Clearing old synthetic GTFS records...');
  db.exec(`
    DELETE FROM gtfs_stop_times;
    DELETE FROM gtfs_trips;
    DELETE FROM gtfs_routes;
    DELETE FROM gtfs_stops;
    DELETE FROM gtfs_agency;
  `);

  // 1. Ingest agencies
  console.log('1. Ingesting agencies...');
  const insertAgency = db.prepare(`
    INSERT OR REPLACE INTO gtfs_agency (agency_id, agency_name, agency_url, agency_timezone, agency_lang)
    VALUES (?, ?, ?, ?, ?)
  `);

  const insertAgenciesTx = db.transaction((agencies) => {
    for (const a of agencies) {
      insertAgency.run(a.agency_id || 'BEST', a.agency_name, a.agency_url || '', a.agency_timezone || 'Asia/Kolkata', a.agency_lang || 'en');
    }
  });

  const agencies = [];
  const agencyPath = path.resolve(__dirname, '..', 'agency.txt');
  if (fs.existsSync(agencyPath)) {
    await processLineByLine(agencyPath, (row) => {
      agencies.push(row);
    });
    insertAgenciesTx(agencies);
    console.log(`Inserted ${agencies.length} agencies.`);
  }

  // 2. Ingest stops
  console.log('2. Ingesting stops...');
  const insertStop = db.prepare(`
    INSERT OR REPLACE INTO gtfs_stops (stop_id, stop_name, stop_lat, stop_lon, location_type)
    VALUES (?, ?, ?, ?, ?)
  `);

  let stopBatch = [];
  const insertStopsTx = db.transaction((batch) => {
    for (const s of batch) {
      insertStop.run(s.stop_id, s.stop_name, parseFloat(s.stop_lat) || 0, parseFloat(s.stop_lon) || 0, parseInt(s.location_type) || 0);
    }
  });

  let totalStops = 0;
  const stopsPath = path.resolve(__dirname, '..', 'stops.txt');
  await processLineByLine(stopsPath, (row) => {
    stopBatch.push(row);
    if (stopBatch.length >= 1000) {
      insertStopsTx(stopBatch);
      totalStops += stopBatch.length;
      stopBatch = [];
    }
  });
  if (stopBatch.length > 0) {
    insertStopsTx(stopBatch);
    totalStops += stopBatch.length;
  }
  console.log(`Inserted ${totalStops} real Mumbai stops.`);

  // 3. Ingest routes
  console.log('3. Ingesting routes...');
  const insertRoute = db.prepare(`
    INSERT OR REPLACE INTO gtfs_routes (route_id, agency_id, route_short_name, route_long_name, route_type, route_color, route_text_color)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  let routeBatch = [];
  const insertRoutesTx = db.transaction((batch) => {
    for (const r of batch) {
      insertRoute.run(r.route_id, r.agency_id || 'BEST', r.route_short_name || '', r.route_long_name || '', parseInt(r.route_type) || 3, r.route_color || '', r.route_text_color || '');
    }
  });

  let totalRoutes = 0;
  const routesPath = path.resolve(__dirname, '..', 'routes.txt');
  await processLineByLine(routesPath, (row) => {
    routeBatch.push(row);
    if (routeBatch.length >= 1000) {
      insertRoutesTx(routeBatch);
      totalRoutes += routeBatch.length;
      routeBatch = [];
    }
  });
  if (routeBatch.length > 0) {
    insertRoutesTx(routeBatch);
    totalRoutes += routeBatch.length;
  }
  console.log(`Inserted ${totalRoutes} real Mumbai transit routes.`);

  // 4. Ingest trips
  console.log('4. Ingesting trips (representative operational trips across all routes)...');
  const insertTrip = db.prepare(`
    INSERT OR REPLACE INTO gtfs_trips (route_id, service_id, trip_id, trip_headsign, direction_id)
    VALUES (?, ?, ?, ?, ?)
  `);

  let tripBatch = [];
  const routeTripCount = new Map();
  const selectedTripIds = new Set();

  const insertTripsTx = db.transaction((batch) => {
    for (const t of batch) {
      insertTrip.run(t.route_id, t.service_id, t.trip_id, t.trip_headsign || '', parseInt(t.direction_id) || 0);
    }
  });

  let totalTrips = 0;
  const tripsPath = path.resolve(__dirname, '..', 'trips.txt');
  await processLineByLine(tripsPath, (row) => {
    // Keep up to 10 trips per route direction for crisp fast routing while covering full topology
    const key = `${row.route_id}_${row.direction_id || 0}`;
    const count = routeTripCount.get(key) || 0;
    if (count < 10) {
      routeTripCount.set(key, count + 1);
      selectedTripIds.add(row.trip_id);
      tripBatch.push(row);
      if (tripBatch.length >= 1000) {
        insertTripsTx(tripBatch);
        totalTrips += tripBatch.length;
        tripBatch = [];
      }
    }
  });
  if (tripBatch.length > 0) {
    insertTripsTx(tripBatch);
    totalTrips += tripBatch.length;
  }
  console.log(`Inserted ${totalTrips} representative trips covering ${routeTripCount.size} route directions.`);

  // 5. Ingest stop times for selected trips
  console.log('5. Ingesting stop times for active trips...');
  const insertStopTime = db.prepare(`
    INSERT INTO gtfs_stop_times (trip_id, arrival_time, departure_time, stop_id, stop_sequence)
    VALUES (?, ?, ?, ?, ?)
  `);

  let stopTimesBatch = [];
  const insertStopTimesTx = db.transaction((batch) => {
    for (const st of batch) {
      insertStopTime.run(st.trip_id, st.arrival_time, st.departure_time, st.stop_id, parseInt(st.stop_sequence) || 0);
    }
  });

  let totalStopTimes = 0;
  const stopTimesPath = path.resolve(__dirname, '..', 'stop_times.txt');
  await processLineByLine(stopTimesPath, (row) => {
    if (selectedTripIds.has(row.trip_id)) {
      stopTimesBatch.push(row);
      if (stopTimesBatch.length >= 2500) {
        insertStopTimesTx(stopTimesBatch);
        totalStopTimes += stopTimesBatch.length;
        stopTimesBatch = [];
        if (totalStopTimes % 50000 === 0) {
          console.log(`  Processed ${totalStopTimes} stop times...`);
        }
      }
    }
  });
  if (stopTimesBatch.length > 0) {
    insertStopTimesTx(stopTimesBatch);
    totalStopTimes += stopTimesBatch.length;
  }
  console.log(`Inserted ${totalStopTimes} stop times.`);

  // Restore normal pragmas
  db.pragma('synchronous = NORMAL');
  db.pragma('journal_mode = WAL');

  console.log(`\n🎉 Ingestion complete in ${((Date.now() - t0) / 1000).toFixed(1)}s!`);
  console.log(`Total Stops: ${totalStops}`);
  console.log(`Total Routes: ${totalRoutes}`);
  console.log(`Total Trips: ${totalTrips}`);
  console.log(`Total Stop Times: ${totalStopTimes}`);
}

ingest().catch(err => {
  console.error('Ingestion failed:', err);
  process.exit(1);
});
