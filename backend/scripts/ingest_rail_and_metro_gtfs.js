/**
 * Ingest Real Mumbai Suburban Railway and Metro lines into GTFS tables in SQLite
 * Lines included:
 * - Western Railway (WR Slow & Fast)
 * - Central Railway (CR Slow & Fast)
 * - Harbour Line (HR CSMT-Panvel & CSMT-Goregaon)
 * - Metro Line 1 (Versova - Ghatkopar)
 * - Metro Line 2A (Dahisar East - Andheri West)
 * - Metro Line 7 (Dahisar East - Gundavali)
 * - Metro Line 3 (Aarey JVLR - BKC)
 */
const { getConnection } = require('../db/connection');
const fs = require('fs');
const path = require('path');

const AGENCIES = [
  { agency_id: 'WR', agency_name: 'Western Railway', agency_url: 'https://wr.indianrailways.gov.in', agency_timezone: 'Asia/Kolkata', agency_lang: 'en' },
  { agency_id: 'CR', agency_name: 'Central Railway', agency_url: 'https://cr.indianrailways.gov.in', agency_timezone: 'Asia/Kolkata', agency_lang: 'en' },
  { agency_id: 'MMOPL', agency_name: 'Mumbai Metro One (Line 1)', agency_url: 'https://www.reliancemumbaimetro.com', agency_timezone: 'Asia/Kolkata', agency_lang: 'en' },
  { agency_id: 'MMMOCL', agency_name: 'Maha Mumbai Metro (Lines 2A/7/3)', agency_url: 'https://www.mmmocl.co.in', agency_timezone: 'Asia/Kolkata', agency_lang: 'en' }
];

const RAIL_METRO_ROUTES = [
  { route_id: 'WR_SLOW', agency_id: 'WR', route_short_name: 'WR-SL', route_long_name: 'Western Line Slow (Churchgate ↔ Virar/Dahanu)', route_type: 2, route_color: 'E11D48', route_text_color: 'FFFFFF' },
  { route_id: 'WR_FAST', agency_id: 'WR', route_short_name: 'WR-FT', route_long_name: 'Western Line Fast (Churchgate ↔ Virar)', route_type: 2, route_color: 'BE123C', route_text_color: 'FFFFFF' },
  { route_id: 'CR_SLOW', agency_id: 'CR', route_short_name: 'CR-SL', route_long_name: 'Central Line Slow (CSMT ↔ Kalyan)', route_type: 2, route_color: '1D4ED8', route_text_color: 'FFFFFF' },
  { route_id: 'CR_FAST', agency_id: 'CR', route_short_name: 'CR-FT', route_long_name: 'Central Line Fast (CSMT ↔ Kalyan)', route_type: 2, route_color: '1E40AF', route_text_color: 'FFFFFF' },
  { route_id: 'HR_MAIN', agency_id: 'CR', route_short_name: 'HR-SL', route_long_name: 'Harbour Line (CSMT ↔ Panvel)', route_type: 2, route_color: 'D97706', route_text_color: 'FFFFFF' },
  { route_id: 'METRO_1', agency_id: 'MMOPL', route_short_name: 'Line 1', route_long_name: 'Metro Line 1 (Versova ↔ Andheri ↔ Ghatkopar)', route_type: 1, route_color: '059669', route_text_color: 'FFFFFF' },
  { route_id: 'METRO_2A', agency_id: 'MMMOCL', route_short_name: 'Line 2A', route_long_name: 'Metro Line 2A (Dahisar East ↔ Andheri West)', route_type: 1, route_color: 'F59E0B', route_text_color: '000000' },
  { route_id: 'METRO_7', agency_id: 'MMMOCL', route_short_name: 'Line 7', route_long_name: 'Metro Line 7 (Dahisar East ↔ Gundavali)', route_type: 1, route_color: 'EF4444', route_text_color: 'FFFFFF' },
  { route_id: 'METRO_3', agency_id: 'MMMOCL', route_short_name: 'Line 3', route_long_name: 'Metro Line 3 Aqua Line (Aarey JVLR ↔ BKC)', route_type: 1, route_color: '06B6D4', route_text_color: 'FFFFFF' }
];

const WR_STATIONS = [
  { id: 'STN_WR_CCG', name: 'Churchgate Station', lat: 18.9322, lon: 72.8264, isFast: true },
  { id: 'STN_WR_MEL', name: 'Marine Lines Station', lat: 18.9442, lon: 72.8242, isFast: false },
  { id: 'STN_WR_CYR', name: 'Charni Road Station', lat: 18.9515, lon: 72.8188, isFast: false },
  { id: 'STN_WR_GTR', name: 'Grant Road Station', lat: 18.9632, lon: 72.8159, isFast: false },
  { id: 'STN_WR_MMCT', name: 'Mumbai Central Station', lat: 18.9712, lon: 72.8193, isFast: true },
  { id: 'STN_WR_MX', name: 'Mahalaxmi Station', lat: 18.9827, lon: 72.8236, isFast: false },
  { id: 'STN_WR_PL', name: 'Lower Parel Station', lat: 18.9954, lon: 72.8302, isFast: false },
  { id: 'STN_WR_PBHD', name: 'Prabhadevi Station', lat: 19.0112, lon: 72.8375, isFast: false },
  { id: 'STN_WR_DDR', name: 'Dadar Station (WR)', lat: 19.0178, lon: 72.8432, isFast: true },
  { id: 'STN_WR_MRU', name: 'Matunga Road Station', lat: 19.0274, lon: 72.8451, isFast: false },
  { id: 'STN_WR_MM', name: 'Mahim Junction Station', lat: 19.0409, lon: 72.8417, isFast: false },
  { id: 'STN_WR_BA', name: 'Bandra Station', lat: 19.0544, lon: 72.8406, isFast: true },
  { id: 'STN_WR_KHAR', name: 'Khar Road Station', lat: 19.0699, lon: 72.8394, isFast: false },
  { id: 'STN_WR_STC', name: 'Santacruz Station', lat: 19.0827, lon: 72.8415, isFast: false },
  { id: 'STN_WR_VLP', name: 'Vile Parle Station', lat: 19.0999, lon: 72.8439, isFast: false },
  { id: 'STN_WR_ADH', name: 'Andheri Station (WR)', lat: 19.1197, lon: 72.8464, isFast: true },
  { id: 'STN_WR_JOS', name: 'Jogeshwari Station', lat: 19.1362, lon: 72.8488, isFast: false },
  { id: 'STN_WR_RMAR', name: 'Ram Mandir Station', lat: 19.1517, lon: 72.8491, isFast: false },
  { id: 'STN_WR_GMN', name: 'Goregaon Station', lat: 19.1646, lon: 72.8494, isFast: false },
  { id: 'STN_WR_MDD', name: 'Malad Station', lat: 19.1866, lon: 72.8486, isFast: false },
  { id: 'STN_WR_KILE', name: 'Kandivali Station', lat: 19.2045, lon: 72.8522, isFast: false },
  { id: 'STN_WR_BVI', name: 'Borivali Station', lat: 19.2294, lon: 72.8567, isFast: true },
  { id: 'STN_WR_DIC', name: 'Dahisar Station', lat: 19.2501, lon: 72.8592, isFast: false },
  { id: 'STN_WR_MIRA', name: 'Mira Road Station', lat: 19.2809, lon: 72.8560, isFast: false },
  { id: 'STN_WR_BYR', name: 'Bhayandar Station', lat: 19.3023, lon: 72.8519, isFast: true },
  { id: 'STN_WR_NIG', name: 'Naigaon Station', lat: 19.3512, lon: 72.8461, isFast: false },
  { id: 'STN_WR_BSR', name: 'Vasai Road Station', lat: 19.3820, lon: 72.8322, isFast: true },
  { id: 'STN_WR_NSP', name: 'Nallasopara Station', lat: 19.4162, lon: 72.8214, isFast: false },
  { id: 'STN_WR_VR', name: 'Virar Station', lat: 19.4674, lon: 72.8115, isFast: true }
];

const CR_STATIONS = [
  { id: 'STN_CR_CSMT', name: 'CSMT Station', lat: 18.9400, lon: 72.8354, isFast: true },
  { id: 'STN_CR_MSD', name: 'Masjid Station', lat: 18.9528, lon: 72.8370, isFast: false },
  { id: 'STN_CR_SNRD', name: 'Sandhurst Road Station', lat: 18.9614, lon: 72.8389, isFast: false },
  { id: 'STN_CR_BY', name: 'Byculla Station', lat: 18.9774, lon: 72.8336, isFast: true },
  { id: 'STN_CR_CHG', name: 'Chinchpokli Station', lat: 18.9897, lon: 72.8331, isFast: false },
  { id: 'STN_CR_CRD', name: 'Currey Road Station', lat: 18.9967, lon: 72.8347, isFast: false },
  { id: 'STN_CR_PR', name: 'Parel Station', lat: 19.0069, lon: 72.8384, isFast: false },
  { id: 'STN_CR_DR', name: 'Dadar Station (CR)', lat: 19.0180, lon: 72.8435, isFast: true },
  { id: 'STN_CR_MTN', name: 'Matunga Station (CR)', lat: 19.0270, lon: 72.8540, isFast: false },
  { id: 'STN_CR_SIN', name: 'Sion Station', lat: 19.0390, lon: 72.8617, isFast: false },
  { id: 'STN_CR_CLA', name: 'Kurla Station', lat: 19.0657, lon: 72.8794, isFast: true },
  { id: 'STN_CR_VVH', name: 'Vidyavihar Station', lat: 19.0798, lon: 72.8973, isFast: false },
  { id: 'STN_CR_GC', name: 'Ghatkopar Station', lat: 19.0864, lon: 72.9081, isFast: true },
  { id: 'STN_CR_VK', name: 'Vikhroli Station', lat: 19.1106, lon: 72.9288, isFast: true },
  { id: 'STN_CR_KJMG', name: 'Kanjurmarg Station', lat: 19.1302, lon: 72.9351, isFast: false },
  { id: 'STN_CR_BND', name: 'Bhandup Station', lat: 19.1438, lon: 72.9372, isFast: true },
  { id: 'STN_CR_NHU', name: 'Nahur Station', lat: 19.1557, lon: 72.9431, isFast: false },
  { id: 'STN_CR_MLND', name: 'Mulund Station', lat: 19.1726, lon: 72.9563, isFast: true },
  { id: 'STN_CR_TNA', name: 'Thane Station', lat: 19.1860, lon: 72.9757, isFast: true },
  { id: 'STN_CR_KLVA', name: 'Kalva Station', lat: 19.1989, lon: 72.9936, isFast: false },
  { id: 'STN_CR_MBQ', name: 'Mumbra Station', lat: 19.1906, lon: 73.0232, isFast: false },
  { id: 'STN_CR_DIVA', name: 'Diva Junction Station', lat: 19.1887, lon: 73.0428, isFast: false },
  { id: 'STN_CR_KOPR', name: 'Kopar Station', lat: 19.2081, lon: 73.0801, isFast: false },
  { id: 'STN_CR_DI', name: 'Dombivli Station', lat: 19.2184, lon: 73.0867, isFast: true },
  { id: 'STN_CR_THK', name: 'Thakurli Station', lat: 19.2272, lon: 73.1042, isFast: false },
  { id: 'STN_CR_KYN', name: 'Kalyan Junction Station', lat: 19.2364, lon: 73.1302, isFast: true }
];

const HR_STATIONS = [
  { id: 'STN_HR_CSMT', name: 'CSMT Station (Harbour)', lat: 18.9400, lon: 72.8354 },
  { id: 'STN_HR_MSD', name: 'Masjid Station', lat: 18.9528, lon: 72.8370 },
  { id: 'STN_HR_SNRD', name: 'Sandhurst Road Station', lat: 18.9614, lon: 72.8389 },
  { id: 'STN_HR_DKRD', name: 'Dockyard Road Station', lat: 18.9675, lon: 72.8442 },
  { id: 'STN_HR_RRD', name: 'Reay Road Station', lat: 18.9772, lon: 72.8465 },
  { id: 'STN_HR_CTGN', name: 'Cotton Green Station', lat: 18.9863, lon: 72.8488 },
  { id: 'STN_HR_SVE', name: 'Sewri Station', lat: 18.9996, lon: 72.8543 },
  { id: 'STN_HR_VDLR', name: 'Vadala Road Station', lat: 19.0163, lon: 72.8587 },
  { id: 'STN_HR_GTBN', name: 'GTB Nagar Station', lat: 19.0336, lon: 72.8647 },
  { id: 'STN_HR_CHF', name: 'Chunabhatti Station', lat: 19.0494, lon: 72.8711 },
  { id: 'STN_HR_CLA', name: 'Kurla Station (Harbour)', lat: 19.0657, lon: 72.8794 },
  { id: 'STN_HR_TKNG', name: 'Tilak Nagar Station', lat: 19.0682, lon: 72.8931 },
  { id: 'STN_HR_CMBR', name: 'Chembur Station', lat: 19.0624, lon: 72.9029 },
  { id: 'STN_HR_GV', name: 'Govandi Station', lat: 19.0558, lon: 72.9150 },
  { id: 'STN_HR_MNKD', name: 'Mankhurd Station', lat: 19.0506, lon: 72.9317 },
  { id: 'STN_HR_VSH', name: 'Vashi Station', lat: 19.0645, lon: 72.9978 },
  { id: 'STN_HR_SNPD', name: 'Sanpada Station', lat: 19.0664, lon: 73.0097 },
  { id: 'STN_HR_JNJ', name: 'Juinagar Station', lat: 19.0573, lon: 73.0183 },
  { id: 'STN_HR_NEU', name: 'Nerul Station', lat: 19.0338, lon: 73.0177 },
  { id: 'STN_HR_SWDV', name: 'Seawoods-Darave Station', lat: 19.0202, lon: 73.0179 },
  { id: 'STN_HR_BEPR', name: 'Belapur CBD Station', lat: 19.0194, lon: 73.0396 },
  { id: 'STN_HR_KHAG', name: 'Kharghar Station', lat: 19.0282, lon: 73.0673 },
  { id: 'STN_HR_MANR', name: 'Mansarovar Station', lat: 19.0098, lon: 73.0901 },
  { id: 'STN_HR_KNDS', name: 'Khandeshwar Station', lat: 18.9957, lon: 73.1039 },
  { id: 'STN_HR_PNVL', name: 'Panvel Station', lat: 18.9894, lon: 73.1215 }
];

const METRO_1_STATIONS = [
  { id: 'STN_M1_VER', name: 'Versova Metro Station', lat: 19.1317, lon: 72.8174 },
  { id: 'STN_M1_DN', name: 'D.N. Nagar Metro Station', lat: 19.1306, lon: 72.8344 },
  { id: 'STN_M1_AZD', name: 'Azad Nagar Metro Station', lat: 19.1287, lon: 72.8407 },
  { id: 'STN_M1_ADH', name: 'Andheri Metro Station', lat: 19.1197, lon: 72.8464 },
  { id: 'STN_M1_WEH', name: 'WEH Metro Station', lat: 19.1158, lon: 72.8569 },
  { id: 'STN_M1_CHK', name: 'Chakala (J.B. Nagar) Metro Station', lat: 19.1115, lon: 72.8661 },
  { id: 'STN_M1_ARP', name: 'Airport Road Metro Station', lat: 19.1085, lon: 72.8749 },
  { id: 'STN_M1_MRL', name: 'Marol Naka Metro Station', lat: 19.1082, lon: 72.8809 },
  { id: 'STN_M1_SAK', name: 'Saki Naka Metro Station', lat: 19.1037, lon: 72.8878 },
  { id: 'STN_M1_ASL', name: 'Asalpha Metro Station', lat: 19.0975, lon: 72.8953 },
  { id: 'STN_M1_JAG', name: 'Jagruti Nagar Metro Station', lat: 19.0917, lon: 72.9018 },
  { id: 'STN_M1_GC', name: 'Ghatkopar Metro Station', lat: 19.0864, lon: 72.9081 }
];

const METRO_2A_STATIONS = [
  { id: 'STN_M2A_DH', name: 'Dahisar East Metro Station', lat: 19.2568, lon: 72.8601 },
  { id: 'STN_M2A_AND', name: 'Anand Nagar Metro Station', lat: 19.2520, lon: 72.8523 },
  { id: 'STN_M2A_KND', name: 'Kandarpada Metro Station', lat: 19.2443, lon: 72.8471 },
  { id: 'STN_M2A_MND', name: 'Mandapeshwar Metro Station', lat: 19.2372, lon: 72.8443 },
  { id: 'STN_M2A_EKS', name: 'Eksar Metro Station', lat: 19.2295, lon: 72.8415 },
  { id: 'STN_M2A_BVW', name: 'Borivali West Metro Station', lat: 19.2223, lon: 72.8398 },
  { id: 'STN_M2A_PHE', name: 'Pahadi Eksar Metro Station', lat: 19.2139, lon: 72.8389 },
  { id: 'STN_M2A_KNW', name: 'Kandivali West Metro Station', lat: 19.2065, lon: 72.8385 },
  { id: 'STN_M2A_DHN', name: 'Dahanukarwadi Metro Station', lat: 19.1988, lon: 72.8378 },
  { id: 'STN_M2A_VLN', name: 'Valnai Metro Station', lat: 19.1912, lon: 72.8371 },
  { id: 'STN_M2A_MLW', name: 'Malad West Metro Station', lat: 19.1834, lon: 72.8365 },
  { id: 'STN_M2A_LML', name: 'Lower Malad Metro Station', lat: 19.1751, lon: 72.8360 },
  { id: 'STN_M2A_PHG', name: 'Pahadi Goregaon Metro Station', lat: 19.1672, lon: 72.8354 },
  { id: 'STN_M2A_GOW', name: 'Goregaon West Metro Station', lat: 19.1589, lon: 72.8349 },
  { id: 'STN_M2A_OSH', name: 'Oshiwara Metro Station', lat: 19.1498, lon: 72.8345 },
  { id: 'STN_M2A_LOS', name: 'Lower Oshiwara Metro Station', lat: 19.1402, lon: 72.8343 },
  { id: 'STN_M2A_ADW', name: 'Andheri West Metro Station', lat: 19.1306, lon: 72.8344 }
];

const METRO_7_STATIONS = [
  { id: 'STN_M7_DH', name: 'Dahisar East Metro Station', lat: 19.2568, lon: 72.8601 },
  { id: 'STN_M7_OVR', name: 'Ovaripada Metro Station', lat: 19.2486, lon: 72.8624 },
  { id: 'STN_M7_NP', name: 'Rashtriya Udyan Metro Station', lat: 19.2392, lon: 72.8638 },
  { id: 'STN_M7_DEV', name: 'Devipada Metro Station', lat: 19.2311, lon: 72.8647 },
  { id: 'STN_M7_MAG', name: 'Magathane Metro Station', lat: 19.2215, lon: 72.8659 },
  { id: 'STN_M7_POI', name: 'Poisar Metro Station', lat: 19.2132, lon: 72.8668 },
  { id: 'STN_M7_AKR', name: 'Akurli Metro Station', lat: 19.2045, lon: 72.8679 },
  { id: 'STN_M7_KUR', name: 'Kurar Metro Station', lat: 19.1923, lon: 72.8687 },
  { id: 'STN_M7_DIN', name: 'Dindoshi Metro Station', lat: 19.1784, lon: 72.8698 },
  { id: 'STN_M7_AAR', name: 'Aarey Metro Station', lat: 19.1631, lon: 72.8685 },
  { id: 'STN_M7_GOE', name: 'Goregaon East Metro Station', lat: 19.1524, lon: 72.8662 },
  { id: 'STN_M7_JOE', name: 'Jogeshwari East Metro Station', lat: 19.1378, lon: 72.8631 },
  { id: 'STN_M7_MOG', name: 'Mogra Metro Station', lat: 19.1272, lon: 72.8604 },
  { id: 'STN_M7_GUND', name: 'Gundavali Metro Station', lat: 19.1165, lon: 72.8575 }
];

const METRO_3_STATIONS = [
  { id: 'STN_M3_AAR', name: 'Aarey JVLR Metro Station', lat: 19.1412, lon: 72.8752 },
  { id: 'STN_M3_SPZ', name: 'SEEPZ Metro Station', lat: 19.1228, lon: 72.8744 },
  { id: 'STN_M3_MIDC', name: 'MIDC - Andheri Metro Station', lat: 19.1154, lon: 72.8708 },
  { id: 'STN_M3_MRL', name: 'Marol Naka Metro Station (Aqua Line)', lat: 19.1082, lon: 72.8809 },
  { id: 'STN_M3_T2', name: 'CSMIA T2 Metro Station', lat: 19.0965, lon: 72.8748 },
  { id: 'STN_M3_SHR', name: 'Sahar Road Metro Station', lat: 19.0912, lon: 72.8632 },
  { id: 'STN_M3_T1', name: 'CSMIA T1 Metro Station', lat: 19.0886, lon: 72.8524 },
  { id: 'STN_M3_STC', name: 'Santacruz Metro Station', lat: 19.0805, lon: 72.8462 },
  { id: 'STN_M3_VDN', name: 'Vidyanagari Metro Station (MU Kalina)', lat: 19.0728, lon: 72.8605 },
  { id: 'STN_M3_BKC', name: 'BKC Metro Station', lat: 19.0645, lon: 72.8680 }
];

function formatTime(totalMinutes) {
  const h = Math.floor(totalMinutes / 60) % 24;
  const m = Math.floor(totalMinutes % 60);
  const s = '00';
  const pad = n => (n < 10 ? '0' + n : '' + n);
  return `${pad(h)}:${pad(m)}:${s}`;
}

async function ingestRailAndMetro() {
  console.log('Ingesting Mumbai Suburban Railway & Metro lines into SQLite...');
  const t0 = Date.now();
  const db = getConnection();

  db.pragma('synchronous = OFF');
  db.pragma('journal_mode = MEMORY');

  // 1. Insert Agencies
  const insertAgency = db.prepare(`
    INSERT OR REPLACE INTO gtfs_agency (agency_id, agency_name, agency_url, agency_timezone, agency_lang)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const a of AGENCIES) {
    insertAgency.run(a.agency_id, a.agency_name, a.agency_url, a.agency_timezone, a.agency_lang);
  }
  console.log(`✓ Inserted ${AGENCIES.length} railway/metro agencies.`);

  // 2. Insert Routes
  const insertRoute = db.prepare(`
    INSERT OR REPLACE INTO gtfs_routes (route_id, agency_id, route_short_name, route_long_name, route_type, route_color, route_text_color)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  for (const r of RAIL_METRO_ROUTES) {
    insertRoute.run(r.route_id, r.agency_id, r.route_short_name, r.route_long_name, r.route_type, r.route_color, r.route_text_color);
  }
  console.log(`✓ Inserted ${RAIL_METRO_ROUTES.length} railway/metro routes.`);

  // 3. Insert Stops
  const insertStop = db.prepare(`
    INSERT OR REPLACE INTO gtfs_stops (stop_id, stop_name, stop_lat, stop_lon, location_type)
    VALUES (?, ?, ?, ?, ?)
  `);

  const allStations = [
    ...WR_STATIONS,
    ...CR_STATIONS,
    ...HR_STATIONS,
    ...METRO_1_STATIONS,
    ...METRO_2A_STATIONS,
    ...METRO_7_STATIONS,
    ...METRO_3_STATIONS
  ];

  const uniqueStops = new Map();
  for (const s of allStations) {
    uniqueStops.set(s.id, s);
  }

  for (const s of uniqueStops.values()) {
    insertStop.run(s.id, s.name, s.lat, s.lon, 0);
  }
  console.log(`✓ Inserted ${uniqueStops.size} unique suburban railway & metro stations.`);

  // 4. Generate Timetabled Trips and Stop Times
  const insertTrip = db.prepare(`
    INSERT OR REPLACE INTO gtfs_trips (route_id, service_id, trip_id, trip_headsign, direction_id)
    VALUES (?, ?, ?, ?, ?)
  `);
  const insertStopTime = db.prepare(`
    INSERT INTO gtfs_stop_times (trip_id, arrival_time, departure_time, stop_id, stop_sequence)
    VALUES (?, ?, ?, ?, ?)
  `);

  const linesConfig = [
    {
      routeId: 'WR_SLOW',
      stations: WR_STATIONS,
      headwayMin: 6,
      startMin: 4 * 60 + 15, // 04:15
      endMin: 24 * 60 + 45,  // 00:45
      dwellMin: 2.2,
      headsign0: 'Virar / Borivali (Slow)',
      headsign1: 'Churchgate (Slow)'
    },
    {
      routeId: 'WR_FAST',
      stations: WR_STATIONS.filter(s => s.isFast),
      headwayMin: 8,
      startMin: 5 * 60 + 0, // 05:00
      endMin: 23 * 60 + 30, // 23:30
      dwellMin: 3.8,
      headsign0: 'Virar Fast',
      headsign1: 'Churchgate Fast'
    },
    {
      routeId: 'CR_SLOW',
      stations: CR_STATIONS,
      headwayMin: 6,
      startMin: 4 * 60 + 5,
      endMin: 24 * 60 + 45,
      dwellMin: 2.3,
      headsign0: 'Kalyan / Thane (Slow)',
      headsign1: 'CSMT (Slow)'
    },
    {
      routeId: 'CR_FAST',
      stations: CR_STATIONS.filter(s => s.isFast),
      headwayMin: 8,
      startMin: 5 * 60 + 15,
      endMin: 23 * 60 + 30,
      dwellMin: 3.9,
      headsign0: 'Kalyan Fast',
      headsign1: 'CSMT Fast'
    },
    {
      routeId: 'HR_MAIN',
      stations: HR_STATIONS,
      headwayMin: 8,
      startMin: 4 * 60 + 45,
      endMin: 24 * 60 + 30,
      dwellMin: 2.4,
      headsign0: 'Panvel / Vashi',
      headsign1: 'CSMT (Harbour)'
    },
    {
      routeId: 'METRO_1',
      stations: METRO_1_STATIONS,
      headwayMin: 5,
      startMin: 5 * 60 + 30,
      endMin: 23 * 60 + 45,
      dwellMin: 1.8,
      headsign0: 'Ghatkopar Metro',
      headsign1: 'Versova Metro'
    },
    {
      routeId: 'METRO_2A',
      stations: METRO_2A_STATIONS,
      headwayMin: 7,
      startMin: 5 * 60 + 50,
      endMin: 23 * 60 + 0,
      dwellMin: 1.9,
      headsign0: 'Andheri West Metro',
      headsign1: 'Dahisar East Metro'
    },
    {
      routeId: 'METRO_7',
      stations: METRO_7_STATIONS,
      headwayMin: 7,
      startMin: 5 * 60 + 50,
      endMin: 23 * 60 + 0,
      dwellMin: 1.9,
      headsign0: 'Gundavali Metro',
      headsign1: 'Dahisar East Metro'
    },
    {
      routeId: 'METRO_3',
      stations: METRO_3_STATIONS,
      headwayMin: 6.5,
      startMin: 6 * 60 + 30,
      endMin: 22 * 60 + 30,
      dwellMin: 2.1,
      headsign0: 'BKC Metro (Aqua Line)',
      headsign1: 'Aarey JVLR Metro (Aqua Line)'
    }
  ];

  let totalTrips = 0;
  let totalStopTimes = 0;

  const generateTripsTx = db.transaction(() => {
    for (const cfg of linesConfig) {
      const stnsForward = cfg.stations;
      const stnsReverse = [...cfg.stations].reverse();

      // Direction 0 (Forward / Up)
      let tripIndex = 1;
      for (let t = cfg.startMin; t <= cfg.endMin; t += cfg.headwayMin) {
        const tripId = `TRIP_${cfg.routeId}_UP_${tripIndex++}`;
        insertTrip.run(cfg.routeId, 'DAILY', tripId, cfg.headsign0, 0);
        totalTrips++;

        let curTime = t;
        for (let i = 0; i < stnsForward.length; i++) {
          const arr = formatTime(curTime);
          curTime += cfg.dwellMin;
          const dep = formatTime(curTime);
          insertStopTime.run(tripId, arr, dep, stnsForward[i].id, i + 1);
          totalStopTimes++;
        }
      }

      // Direction 1 (Reverse / Down)
      tripIndex = 1;
      for (let t = cfg.startMin; t <= cfg.endMin; t += cfg.headwayMin) {
        const tripId = `TRIP_${cfg.routeId}_DN_${tripIndex++}`;
        insertTrip.run(cfg.routeId, 'DAILY', tripId, cfg.headsign1, 1);
        totalTrips++;

        let curTime = t;
        for (let i = 0; i < stnsReverse.length; i++) {
          const arr = formatTime(curTime);
          curTime += cfg.dwellMin;
          const dep = formatTime(curTime);
          insertStopTime.run(tripId, arr, dep, stnsReverse[i].id, i + 1);
          totalStopTimes++;
        }
      }
    }
  });

  generateTripsTx();

  db.pragma('synchronous = NORMAL');
  db.pragma('journal_mode = WAL');

  console.log(`\n🎉 Rail and Metro Ingestion complete in ${((Date.now() - t0) / 1000).toFixed(1)}s!`);
  console.log(`Added ${totalTrips} operational railway and metro trips.`);
  console.log(`Added ${totalStopTimes} timetabled station stop times.`);
}

ingestRailAndMetro().catch(err => {
  console.error('Failed to ingest rail and metro:', err);
  process.exit(1);
});

