/**
 * Offline checks for the timetable OCR parsing pipeline (no Tesseract/Groq needed).
 * Synthetic word boxes mimic Tesseract TSV output for a grid timetable.
 */
const assert = require('assert');
const {
  parseTimetableFromWords,
  parseTesseractTsv,
  extractJsonPayload,
  sanitizeSlots,
  normalizeTime24
} = require('../services/timetableOcrService');

const word = (text, cx, cy) => ({ text, left: cx - 20, top: cy - 8, width: 40, height: 16, cx, cy });

// --- Grid reconstruction -------------------------------------------------
const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const colX = days.map((_, i) => 300 + i * 200);
const rowY = (i) => 100 + i * 80;
const words = [];
days.forEach((d, i) => words.push(word(d, colX[i], 40)));
const times = [['08:00', '09:00'], ['09:00', '10:00'], ['10:00', '11:00'], ['11:00', '12:00']];
times.forEach(([a, b], i) => { words.push(word(a, 60, rowY(i))); words.push(word('-', 90, rowY(i))); words.push(word(b, 120, rowY(i))); });
// Monday periods 3-4: same class spans two rows
['Project(LS)', 'Project(LS)'].forEach((t, k) => words.push(word(t, colX[0], rowY(2 + k))));
// Thursday period 3: DWM(SC)(27)
words.push(word('DWM(SC)(27)', colX[3], rowY(2)));
// Tuesday period 2: batch lab with OCR'd "Ll" room, split over words
words.push(word('I3-1:', colX[1] - 40, rowY(1) - 6), word('CN(RS)(Ll)', colX[1] + 10, rowY(1) - 6));
// Wednesday period 1: two parallel tracks in one cell
words.push(word('EL-3:', colX[2] - 30, rowY(0) - 8), word('UCD(SM)(L6)', colX[2] + 20, rowY(0) - 8));
words.push(word('ADS(MM)(65)', colX[2], rowY(0) + 10));

const slots = parseTimetableFromWords(words);
const find = (day, code) => slots.find(s => s.day === day && s.subjectCode === code);

const dwm = find('Thursday', 'DWM');
assert(dwm, 'Thursday DWM found');
assert.strictEqual(dwm.startTime, '10:00');
assert.strictEqual(dwm.endTime, '11:00');
assert.strictEqual(dwm.location, '27');
assert.strictEqual(dwm.title, 'Data Warehousing & Mining');

const cn = find('Tuesday', 'CN');
assert(cn, 'Tuesday CN lab found');
assert.strictEqual(cn.location, 'L1', 'OCR "Ll" room repaired to L1');
assert.strictEqual(cn.eventType, 'lab');
assert(cn.title.includes('I3-1'), 'batch kept in title');

assert(find('Wednesday', 'ADS') && find('Wednesday', 'UCD'), 'parallel tracks both extracted');

const project = slots.filter(s => s.day === 'Monday');
assert.strictEqual(project.length, 1, 'two-hour block merged into one slot');
assert.strictEqual(project[0].startTime, '10:00');
assert.strictEqual(project[0].endTime, '12:00');

assert.deepStrictEqual(parseTimetableFromWords([word('Monday', 100, 10)]), [], 'no grid -> empty');

// --- TSV parsing -----------------------------------------------------------
const tsv = [
  'level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext',
  '5\t1\t1\t1\t1\t1\t10\t20\t50\t12\t91.2\tMonday',
  '5\t1\t1\t1\t1\t2\t70\t20\t50\t12\t-1\t',
  '5\t1\t1\t1\t1\t3\t130\t20\t50\t12\t88\tTuesday'
].join('\n');
const parsed = parseTesseractTsv(tsv);
assert.strictEqual(parsed.length, 2);
assert.strictEqual(parsed[0].cx, 35);

// --- LLM output handling ---------------------------------------------------
assert.deepStrictEqual(extractJsonPayload('<think>hmm [1]</think>```json\n{"slots":[]}\n```'), { slots: [] });
assert.deepStrictEqual(extractJsonPayload('Here you go: [{"a":1}] thanks'), [{ a: 1 }]);
assert.strictEqual(extractJsonPayload('no json here'), null);

const clean = sanitizeSlots([
  { subjectCode: 'ai', day: 'mon', startTime: '2:00 PM', endTime: '15:00', location: 'CR 66', eventType: 'weird' },
  { subjectCode: 'AI', day: 'Funday', startTime: '09:00', endTime: '10:00' },
  { subjectCode: 'AI', day: 'Monday', startTime: 'garbage', endTime: '10:00' },
  { subjectCode: 'AI', day: 'Monday', startTime: '11:00', endTime: '10:00' },
  { subjectCode: 'BREAK', day: 'Monday', startTime: '11:00', endTime: '12:00' }
]);
assert.strictEqual(clean.length, 1, 'invalid slots dropped instead of defaulted');
assert.strictEqual(clean[0].day, 'Monday');
assert.strictEqual(clean[0].startTime, '14:00');
assert.strictEqual(clean[0].eventType, 'lecture');

assert.strictEqual(normalizeTime24('1:00'), '13:00');
assert.strictEqual(normalizeTime24('08:00'), '08:00');

console.log('timetable OCR parser checks passed');
