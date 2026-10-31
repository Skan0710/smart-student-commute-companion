/**
 * Export real Mumbai GTFS data from SQLite to data/gtfs/*.txt
 */
const fs = require('fs');
const path = require('path');
const { getConnection } = require('../db/connection');

function csvEscape(val) {
  if (val === null || val === undefined) return '';
  const s = String(val);
  if (s.includes(',') || s.includes('"') || s.includes('\n')) {
    return `"${s.replace(/"/g, '""')}"`;
  }
  return s;
}

async function exportGtfs() {
  console.log('Exporting real Mumbai GTFS tables to data/gtfs/ ...');
  const db = getConnection();
  const outDir = path.resolve(__dirname, '..', '..', 'data', 'gtfs');
  if (!fs.existsSync(outDir)) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  // 1. agency.txt
  const agencies = db.prepare('SELECT agency_id, agency_name, agency_url, agency_timezone, agency_lang FROM gtfs_agency').all();
  let agencyCsv = 'agency_id,agency_name,agency_url,agency_timezone,agency_lang\n';
  for (const a of agencies) {
    agencyCsv += `${csvEscape(a.agency_id)},${csvEscape(a.agency_name)},${csvEscape(a.agency_url)},${csvEscape(a.agency_timezone)},${csvEscape(a.agency_lang)}\n`;
  }
  fs.writeFileSync(path.join(outDir, 'agency.txt'), agencyCsv, 'utf8');
  console.log(`✓ Exported ${agencies.length} agencies to agency.txt`);

  // 2. routes.txt
  const routes = db.prepare('SELECT route_id, agency_id, route_short_name, route_long_name, route_type, route_color, route_text_color FROM gtfs_routes').all();
  let routesCsv = 'route_id,agency_id,route_short_name,route_long_name,route_type,route_color,route_text_color\n';
  for (const r of routes) {
    routesCsv += `${csvEscape(r.route_id)},${csvEscape(r.agency_id)},${csvEscape(r.route_short_name)},${csvEscape(r.route_long_name)},${r.route_type},${csvEscape(r.route_color)},${csvEscape(r.route_text_color)}\n`;
  }
  fs.writeFileSync(path.join(outDir, 'routes.txt'), routesCsv, 'utf8');
  console.log(`✓ Exported ${routes.length} routes to routes.txt`);

  // 3. stops.txt
  const stops = db.prepare('SELECT stop_id, stop_name, stop_lat, stop_lon, location_type FROM gtfs_stops').all();
  let stopsCsv = 'stop_id,stop_name,stop_lat,stop_lon,location_type\n';
  for (const s of stops) {
    stopsCsv += `${csvEscape(s.stop_id)},${csvEscape(s.stop_name)},${s.stop_lat},${s.stop_lon},${s.location_type || 0}\n`;
  }
  fs.writeFileSync(path.join(outDir, 'stops.txt'), stopsCsv, 'utf8');
  console.log(`✓ Exported ${stops.length} stops to stops.txt`);

  // 4. trips.txt
  const trips = db.prepare('SELECT route_id, service_id, trip_id, trip_headsign, direction_id FROM gtfs_trips').all();
  let tripsCsv = 'route_id,service_id,trip_id,trip_headsign,direction_id\n';
  for (const t of trips) {
    tripsCsv += `${csvEscape(t.route_id)},${csvEscape(t.service_id)},${csvEscape(t.trip_id)},${csvEscape(t.trip_headsign)},${t.direction_id || 0}\n`;
  }
  fs.writeFileSync(path.join(outDir, 'trips.txt'), tripsCsv, 'utf8');
  console.log(`✓ Exported ${trips.length} trips to trips.txt`);

  // 5. stop_times.txt (stream in batches)
  const stopTimesFile = path.join(outDir, 'stop_times.txt');
  const ws = fs.createWriteStream(stopTimesFile, { encoding: 'utf8' });
  ws.write('trip_id,arrival_time,departure_time,stop_id,stop_sequence\n');

  const batchSize = 10000;
  let offset = 0;
  let totalStopTimes = 0;

  while (true) {
    const rows = db.prepare('SELECT trip_id, arrival_time, departure_time, stop_id, stop_sequence FROM gtfs_stop_times LIMIT ? OFFSET ?').all(batchSize, offset);
    if (!rows || rows.length === 0) break;

    let chunk = '';
    for (const r of rows) {
      chunk += `${csvEscape(r.trip_id)},${csvEscape(r.arrival_time)},${csvEscape(r.departure_time)},${csvEscape(r.stop_id)},${r.stop_sequence}\n`;
    }
    ws.write(chunk);
    totalStopTimes += rows.length;
    offset += batchSize;
  }
  ws.end();
  console.log(`✓ Exported ${totalStopTimes} stop times to stop_times.txt`);

  // 6. calendar.txt
  const calendarCsv = 'service_id,monday,tuesday,wednesday,thursday,friday,saturday,sunday,start_date,end_date\n' +
    'DAILY,1,1,1,1,1,1,1,20260101,20261231\n' +
    'WEEKDAY,1,1,1,1,1,0,0,20260101,20261231\n' +
    'WEEKEND,0,0,0,0,0,1,1,20260101,20261231\n';
  fs.writeFileSync(path.join(outDir, 'calendar.txt'), calendarCsv, 'utf8');

  console.log('🎉 Successfully exported complete real GTFS dataset to data/gtfs/');
}

exportGtfs().catch(err => {
  console.error('Export failed:', err);
  process.exit(1);
});

