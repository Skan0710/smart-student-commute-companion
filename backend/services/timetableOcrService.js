/**
 * Timetable OCR Service
 *
 * Combines local Tesseract OCR with an AI reasoning layer (Groq Qwen/Llama)
 * to accurately extract subject codes, full course names, class timings, and locations
 * from timetable images, spreadsheets, and messy OCR scans.
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const { execFile } = require('child_process');

function resolveTesseractBinary() {
  if (process.env.TESSERACT_PATH && fs.existsSync(process.env.TESSERACT_PATH)) {
    return process.env.TESSERACT_PATH;
  }
  const standardPaths = [
    'C:\\Program Files\\Tesseract-OCR\\tesseract.exe',
    'C:\\Program Files (x86)\\Tesseract-OCR\\tesseract.exe',
    '/usr/bin/tesseract',
    '/usr/local/bin/tesseract'
  ];
  for (const p of standardPaths) {
    if (fs.existsSync(p)) return p;
  }
  return 'tesseract';
}

/**
 * Comprehensive engineering subject dictionary (Mumbai University & Autonomous colleges)
 */
const COMMON_SUBJECT_NAMES = {
  'AOA': 'Design and Analysis of Algorithms',
  'CS301': 'Design and Analysis of Algorithms',
  'CSC301': 'Design and Analysis of Algorithms',
  'DBMS': 'Database Management Systems',
  'CS302': 'Database Management Systems',
  'CSC302': 'Database Management Systems',
  'OS': 'Operating Systems & Virtualization',
  'CS305': 'Operating Systems & Virtualization',
  'CSC305': 'Operating Systems & Virtualization',
  'CN': 'Computer Networks',
  'IT402': 'Computer Networks',
  'ITC402': 'Computer Networks',
  'AI': 'Artificial Intelligence',
  'AI401': 'Artificial Intelligence',
  'DWM': 'Data Warehousing & Mining',
  'DJS67': 'Data Warehousing & Mining',
  'YPOO': 'Python & Object Oriented Programming',
  'OOPM': 'Object Oriented Programming with Java',
  'TCS': 'Theoretical Computer Science',
  'SE': 'Software Engineering',
  'COA': 'Computer Organization & Architecture',
  'ML': 'Machine Learning',
  'DL': 'Deep Learning',
  'NLP': 'Natural Language Processing',
  'DS': 'Data Structures',
  'DSA': 'Data Structures & Algorithms',
  'DLDA': 'Digital Logic & Computer Architecture',
  'ECCF': 'Electronic Circuits & Communication Fundamentals',
  'MATHS': 'Applied Mathematics',
  'MATH3': 'Applied Mathematics III',
  'AM-III': 'Applied Mathematics III',
  'AM-IV': 'Applied Mathematics IV',
  'EM-1': 'Engineering Mathematics I',
  'EM-2': 'Engineering Mathematics II',
  'EM-3': 'Engineering Mathematics III',
  'EM-4': 'Engineering Mathematics IV',
  'PYTHON': 'Python Programming Lab',
  'WEB': 'Web Computing & Modern Frameworks',
  'SPCC': 'System Programming & Compiler Construction',
  'CG': 'Computer Graphics',
  'MP': 'Microprocessor & Microcontroller',
  'MPI': 'Microprocessor & Interfaces',
  'CSS': 'Cryptography & System Security',
  'CNS': 'Cryptography & Network Security',
  'BDA': 'Big Data Analytics',
  'MC': 'Mobile Computing',
  'IOT': 'Internet of Things',
  'IOE': 'Internet of Everything',
  'CC': 'Cloud Computing',
  'BEE': 'Basic Electrical & Electronics',
  'FEE': 'Fundamentals of Electrical Engineering',
  'EGD': 'Engineering Graphics & Drawing',
  'EP': 'Engineering Physics',
  'EC': 'Engineering Chemistry',
  'PCOM': 'Professional Communication',
  'ADS': 'Advanced Data Structures',
  'UCD': 'User Centered Design',
  'DEVOPS': 'Development Operations (DevOps)',
  'SA': 'Software Architecture',
  'COI': 'Constitution of India',
  'IPD': 'Innovative Product Development',
  'GENAI': 'Data Processing and Optimization with Generative AI',
  'MINI PROJECT': 'Mini Project Lab',
  'PROJ': 'Capstone Project'
};

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * Normalizes time string into standard "HH:mm" 24-hr format.
 */
function parseTime24(timeStr) {
  if (!timeStr) return null;
  const clean = timeStr.trim().replace(/[.;]/g, ':');
  const isPM = /pm/i.test(clean);
  const isAM = /am/i.test(clean);
  const match = clean.match(/(\d{1,2}):(\d{2})/);
  if (!match) {
    const digitMatch = clean.match(/\b(\d{2})(\d{2})\b/);
    if (digitMatch) {
      let h = parseInt(digitMatch[1], 10);
      const m = digitMatch[2];
      if (isPM && h < 12) h += 12;
      return h <= 23 && Number(m) <= 59 ? `${String(h).padStart(2, '0')}:${m}` : null;
    }
    return null;
  }

  let hours = parseInt(match[1], 10);
  const minutes = match[2];

  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;

  if (!isPM && !isAM && hours >= 1 && hours <= 6) {
    hours += 12;
  }

  if (hours > 23 || Number(minutes) > 59) return null;
  return `${String(hours).padStart(2, '0')}:${minutes}`;
}

function normalizeTime24(timeStr) {
  return parseTime24(timeStr) || '09:00';
}

const GROQ_MODEL = () => process.env.GROQ_TIMETABLE_MODEL || 'llama-3.3-70b-versatile';

/**
 * Pulls the first JSON array/object out of an LLM reply (handles <think> blocks,
 * markdown fences and surrounding prose).
 */
function extractJsonPayload(text) {
  if (!text) return null;
  const cleaned = String(text)
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?/gi, '')
    .trim();
  try {
    return JSON.parse(cleaned);
  } catch (_) { /* fall through to bracket scan */ }
  const start = cleaned.search(/[\[{]/);
  if (start === -1) return null;
  const open = cleaned[start];
  const close = open === '[' ? ']' : '}';
  const end = cleaned.lastIndexOf(close);
  if (end <= start) return null;
  try {
    return JSON.parse(cleaned.slice(start, end + 1));
  } catch (_) {
    return null;
  }
}

/**
 * Validates and normalizes raw slot objects (from AI or elsewhere).
 * Items with an unknown day or unparseable/inverted times are dropped instead of
 * being silently defaulted to "Monday 09:00".
 */
function sanitizeSlots(rawItems) {
  const out = [];
  const seen = new Set();
  for (const item of rawItems || []) {
    if (!item || typeof item !== 'object') continue;
    const dayRaw = String(item.day || '').trim().toLowerCase();
    const day = DAYS_OF_WEEK.find(d => d.toLowerCase() === dayRaw || d.toLowerCase().slice(0, 3) === dayRaw.slice(0, 3) && dayRaw.length >= 3);
    const startTime = parseTime24(item.startTime || item.start_time);
    const endTime = parseTime24(item.endTime || item.end_time);
    if (!day || !startTime || !endTime || endTime <= startTime) continue;

    const subjectCode = String(item.subjectCode || item.code || '').trim().toUpperCase();
    if (!subjectCode || /^(BREAK|RECESS|LUNCH|FREE)$/.test(subjectCode)) continue;
    const key = `${day}-${startTime}-${subjectCode}-${String(item.location || '').toLowerCase()}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const eventTypeRaw = String(item.eventType || item.event_type || 'lecture').toLowerCase();
    out.push({
      id: `slot-${Date.now()}-${out.length}-${Math.random().toString(36).slice(2, 6)}`,
      subjectCode,
      title: String(item.title || COMMON_SUBJECT_NAMES[subjectCode] || subjectCode).trim(),
      day,
      startTime,
      endTime,
      location: String(item.location || item.room || '').trim(),
      eventType: ['lecture', 'lab', 'tutorial'].includes(eventTypeRaw) ? eventTypeRaw : 'lecture'
    });
  }
  return out;
}

/**
 * AI-Powered Timetable Reasoner using Groq LLM.
 * Reconstructs fragmented tabular OCR output and accurately resolves subjects and timings.
 */
async function analyzeTimetableWithAI(ocrText) {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey || !ocrText || ocrText.trim().length < 15) {
    return null;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30000);
  try {
    const prompt = `You are an expert college timetable analyzer.
Below is raw OCR text from a college timetable. Columns are separated by " | " where the layout was detected; text may contain OCR typos.

---
${ocrText.trim().slice(0, 12000)}
---

Timetable conventions to respect:
- Days are usually COLUMNS (Monday..Saturday) and hourly periods are ROWS (e.g. 08:00-09:00 ... 05:00-06:00). Times without am/pm between 1 and 7 are afternoon (13:00-19:00); 8-11 are morning; 12 is noon.
- A cell looks like "SUBJECT(FACULTY)(ROOM)", e.g. "DWM(SC)(66)" = subject DWM, faculty SC, room 66. Faculty initials are NOT subjects.
- Batch cells look like "I3-1: CN(RS)(L1)" - one slot per batch/track; keep them as separate slots and append the batch to the title, e.g. "Computer Networks (I3-1)". "EL-1:" style prefixes are elective tracks - treat them the same way.
- Several lines in one cell are parallel tracks: emit one slot for each.
- A class spanning two rows (labs, 2-hour blocks) is ONE slot with the combined start and end time.
- Rooms starting with "L" followed by a digit (L1, L6) are labs: eventType "lab". Otherwise "lecture".
- Grey/empty cells, RECESS/BREAK/LUNCH, and symbol-only cells (*, #, $) are NOT classes - skip them.

Return a JSON object: {"slots":[{"subjectCode":"DWM","title":"Data Warehousing & Mining","day":"Monday","startTime":"13:00","endTime":"14:00","location":"66","eventType":"lecture"}]}
- "day" full weekday name; "startTime"/"endTime" 24-hour "HH:mm"; "location" is the room/lab or "".
- Fix obvious OCR mistakes (O/0, l/1/I in room codes like "L1").
Return ONLY the JSON.`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: GROQ_MODEL(),
        messages: [
          { role: 'system', content: 'You are an accurate JSON-only timetable parser.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0,
        response_format: { type: 'json_object' }
      }),
      signal: controller.signal
    });

    if (!response.ok) {
      console.warn(`[Timetable AI] Groq returned status ${response.status}`);
      return null;
    }

    const data = await response.json();
    const payload = extractJsonPayload(data.choices?.[0]?.message?.content || '');
    const list = Array.isArray(payload) ? payload : (payload && (payload.slots || payload.items || payload.timetable));
    if (!Array.isArray(list)) return null;

    const slots = sanitizeSlots(list);
    return slots.length > 0 ? slots : null;
  } catch (err) {
    console.warn(`[Timetable AI] AI parsing bypassed: ${err.message}`);
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

/**
 * Deterministic local fallback parser with expanded subject dictionary
 */
function parseTimetableTextDeterministic(rawInput) {
  if (!rawInput) return [];
  const lines = rawInput
    .replace(/\r\n/g, '\n')
    .replace(/([0-9AaPp][Mm])([A-Za-z])/g, '$1 $2')
    .replace(/(\d{1,2});(\d{2})/g, '$1:$2')
    .replace(/(\d{1,2})\.(\d{2})/g, '$1:$2')
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean);

  const items = [];
  const seenKeys = new Set();

  const dayRegex = /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat)\b/i;
  const timeRangeRegex = /(\d{1,2}[:.]\d{2}(?:\s*[AaPp][Mm])?|\b\d{4}\b)\s*(?:-|to|–|—)\s*(\d{1,2}[:.]\d{2}(?:\s*[AaPp][Mm])?|\b\d{4}\b)/i;
  const locationRegex = /\b(?:Lab|Room|Hall|Audi|Auditorium|CR|Classroom)\s*[-_#]?\s*[A-Za-z0-9]+/i;
  const codeRegex = /\b(?!(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|AM|PM|Lab|Room|Hall|Audi|CR|Time|Day|Recess|Break)\b)([A-Z]{1,5}\s*[-_]?\s*\d{2,4}[A-Z]?|(?:DWM|YPOO|AI|ML|DS|DSA|DLDA|ECCF|MATHS?|PYTHON|WEB|TCS|SPCC|SE|CG|OOPM|AOA|DBMS|OS|CN|COA|MP|MPI|CSS|CNS|BDA|MC|IOT|IOE|CC|EM|AM))\b/i;

  let currentDay = 'Monday';

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];

    const dayMatch = line.match(dayRegex);
    if (dayMatch && !line.includes('|')) {
      const d = dayMatch[1].toLowerCase();
      const matchedDay = DAYS_OF_WEEK.find(x => x.toLowerCase().startsWith(d.slice(0, 3)));
      if (matchedDay) currentDay = matchedDay;
    }

    // Grid table parsing (contains | separators)
    if (line.includes('|')) {
      const parts = line.split('|').map(p => p.trim()).filter(Boolean);
      const timePart = parts.find(p => timeRangeRegex.test(p));
      if (timePart) {
        const timeMatch = timePart.match(timeRangeRegex);
        const startTime = normalizeTime24(timeMatch[1]);
        const endTime = normalizeTime24(timeMatch[2]);

        const targetDays = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
        let dayColIndex = 0;

        for (const cell of parts) {
          if (cell === timePart) continue;
          if (/time|day|recess|break|lunch/i.test(cell)) continue;

          const locMatch = cell.match(locationRegex);
          const cellWithoutLocation = locMatch ? cell.replace(locMatch[0], '') : cell;
          const codeMatch = cellWithoutLocation.match(codeRegex);

          if (codeMatch) {
            const code = codeMatch[1].trim().toUpperCase();
            const assignedDay = targetDays[dayColIndex] || currentDay;
            dayColIndex++;

            const cleanName = cellWithoutLocation.replace(codeRegex, '').replace(/[()]/g, '').trim();
            const title = COMMON_SUBJECT_NAMES[code] || COMMON_SUBJECT_NAMES[code.replace(/\s+/g, '')] || cleanName || code;

            const dedupeKey = `${assignedDay}-${startTime}-${code}`;
            if (!seenKeys.has(dedupeKey)) {
              seenKeys.add(dedupeKey);
              items.push({
                id: `slot-${Date.now()}-${items.length}-${Math.random().toString(36).slice(2, 6)}`,
                subjectCode: code,
                title,
                day: assignedDay,
                startTime,
                endTime,
                location: locMatch ? locMatch[0] : '',
                eventType: /lab|practical/i.test(cell) ? 'lab' : 'lecture'
              });
            }
          }
        }
        continue;
      }
    }

    // Linear time format
    const timeMatch = line.match(timeRangeRegex);
    if (timeMatch) {
      const startTime = normalizeTime24(timeMatch[1]);
      const endTime = normalizeTime24(timeMatch[2]);
      const locMatch = line.match(locationRegex);
      const lineWithoutLocation = locMatch ? line.replace(locMatch[0], '') : line;
      const codeMatch = lineWithoutLocation.match(codeRegex);

      if (codeMatch) {
        const code = codeMatch[1].trim().toUpperCase();
        const lineDay = dayMatch
          ? DAYS_OF_WEEK.find(x => x.toLowerCase().startsWith(dayMatch[1].toLowerCase().slice(0, 3))) || currentDay
          : currentDay;

        const cleanTitle = lineWithoutLocation
          .replace(timeRangeRegex, '')
          .replace(dayRegex, '')
          .replace(codeRegex, '')
          .replace(/[():-]/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();

        const title = COMMON_SUBJECT_NAMES[code] || COMMON_SUBJECT_NAMES[code.replace(/\s+/g, '')] || cleanTitle || code;

        const dedupeKey = `${lineDay}-${startTime}-${code}`;
        if (!seenKeys.has(dedupeKey)) {
          seenKeys.add(dedupeKey);
          items.push({
            id: `slot-${Date.now()}-${items.length}-${Math.random().toString(36).slice(2, 6)}`,
            subjectCode: code,
            title,
            day: lineDay,
            startTime,
            endTime,
            location: locMatch ? locMatch[0] : '',
            eventType: /lab|practical/i.test(line) ? 'lab' : 'lecture'
          });
        }
      }
    }
  }

  return items;
}

/* ------------------------------------------------------------------ *
 * Layout-aware parsing (uses Tesseract word bounding boxes)
 * ------------------------------------------------------------------ */

const DAY_HEADER_REGEX = /^(mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun)(day|sday|nesday|rsday|urday)?[.:]?$/i;
const CELL_ENTRY_REGEX = /(?:\b(I{1,3}\d?-\d|[A-Z]{1,3}-\d)\s*:\s*)?([A-Za-z][A-Za-z0-9 ,/&\-]*?)\s*\(\s*([A-Za-z]{1,4})\s*\)\s*(?:\(\s*([A-Za-z]?[0-9OIl|]{1,3})\s*\))?/g;

function normalizeRoom(room) {
  if (!room) return '';
  let r = room.trim();
  if (/^[Ll][0-9OIl|]$/.test(r)) {
    return 'L' + r[1].replace(/O/g, '0').replace(/[Il|]/g, '1');
  }
  if (/^[0-9OIl|]+$/.test(r)) r = r.replace(/O/g, '0').replace(/[Il|]/g, '1');
  return r.toUpperCase();
}

/** Parse a TSV from `tesseract ... tsv` into word boxes. */
function parseTesseractTsv(tsv) {
  const words = [];
  const rows = String(tsv || '').split(/\r?\n/);
  for (let i = 1; i < rows.length; i++) {
    const c = rows[i].split('\t');
    if (c.length < 12) continue;
    const text = c.slice(11).join('\t').trim();
    const conf = parseFloat(c[10]);
    if (!text || !(conf >= 5)) continue;
    const left = +c[6], top = +c[7], width = +c[8], height = +c[9];
    words.push({ text, left, top, width, height, cx: left + width / 2, cy: top + height / 2 });
  }
  return words;
}

/** Rebuilds readable text from word boxes, marking large horizontal gaps as column breaks. */
function wordsToText(words) {
  const sorted = [...words].sort((a, b) => a.cy - b.cy || a.left - b.left);
  const lines = [];
  for (const w of sorted) {
    const last = lines[lines.length - 1];
    if (last && Math.abs(last.cy - w.cy) <= Math.max(w.height, last.h) * 0.6) {
      last.words.push(w);
      last.cy = (last.cy * (last.words.length - 1) + w.cy) / last.words.length;
      last.h = Math.max(last.h, w.height);
    } else {
      lines.push({ cy: w.cy, h: w.height, words: [w] });
    }
  }
  return lines.map(l => {
    const ws = l.words.sort((a, b) => a.left - b.left);
    let out = ws[0].text;
    for (let i = 1; i < ws.length; i++) {
      const gap = ws[i].left - (ws[i - 1].left + ws[i - 1].width);
      out += (gap > l.h * 1.8 ? ' | ' : ' ') + ws[i].text;
    }
    return out;
  }).join('\n');
}

function extractCellEntries(cellText) {
  const entries = [];
  const text = cellText.replace(/\s+/g, ' ').trim();
  const re = new RegExp(CELL_ENTRY_REGEX.source, 'g');
  let m;
  while ((m = re.exec(text)) !== null) {
    const subject = m[2].trim().replace(/^[-,/&\s]+/, '');
    if (!subject || /^(recess|break|lunch)$/i.test(subject)) continue;
    entries.push({
      batch: m[1] ? m[1].toUpperCase() : '',
      subject,
      faculty: m[3].toUpperCase(),
      room: normalizeRoom(m[4])
    });
  }
  return entries;
}

function parseRowLabel(txt) {
  const m = txt.match(/(\d{1,2}\s*[:.]\s*\d{2}|\b\d{1,2}\b)\s*(?:-|–|—|to)\s*(\d{1,2}\s*[:.]\s*\d{2}|\b\d{1,2}\b)/i);
  if (!m) return null;
  const fix = (v) => v.replace(/\s+/g, '').replace(/^(\d{1,2})$/, '$1:00');
  const start = parseTime24(fix(m[1]));
  const end = parseTime24(fix(m[2]));
  return start && end && end > start ? { start, end } : null;
}

/**
 * Builds slots by mapping every OCR word to a (day column, time row) cell.
 * Requires at least 3 weekday header words and 2 time-range labels; otherwise returns [].
 */
function parseTimetableFromWords(words) {
  const byDay = new Map();
  for (const h of words.filter(w => DAY_HEADER_REGEX.test(w.text))) {
    const key = h.text.toLowerCase().slice(0, 3);
    if (!byDay.has(key) || h.cy < byDay.get(key).cy) byDay.set(key, h);
  }
  const dayHeaders = [...byDay.values()].sort((a, b) => a.cx - b.cx);
  if (dayHeaders.length < 3) return [];
  const headerBottom = Math.max(...dayHeaders.map(h => h.top + h.height));

  const colDays = dayHeaders.map(h => ({
    day: DAYS_OF_WEEK.find(d => d.toLowerCase().startsWith(h.text.toLowerCase().slice(0, 3))),
    cx: h.cx
  }));
  const spacing = (colDays[colDays.length - 1].cx - colDays[0].cx) / (colDays.length - 1);
  const firstDayLeft = Math.min(...dayHeaders.map(h => h.left));

  // Time labels live left of the first day column; group them into visual lines.
  const labelWords = words.filter(w => w.top > headerBottom - 2 && w.cx < firstDayLeft - 2);
  const groups = [];
  for (const w of [...labelWords].sort((a, b) => a.cy - b.cy)) {
    const g = groups[groups.length - 1];
    if (g && Math.abs(g.cy - w.cy) <= w.height * 0.6) {
      g.words.push(w);
      g.cy = g.words.reduce((a, x) => a + x.cy, 0) / g.words.length;
    } else {
      groups.push({ cy: w.cy, words: [w] });
    }
  }
  const rowLabels = [];
  for (const g of groups) {
    const label = parseRowLabel(g.words.sort((a, b) => a.left - b.left).map(w => w.text).join(' '));
    if (label) rowLabels.push({ cy: g.cy, ...label });
  }
  if (rowLabels.length < 2) return [];

  const cells = new Map();
  for (const w of words) {
    if (w.top <= headerBottom - 2 || w.cx < firstDayLeft - spacing * 0.15) continue;
    let ci = 0, best = Infinity;
    colDays.forEach((c, i) => { const d = Math.abs(c.cx - w.cx); if (d < best) { best = d; ci = i; } });
    if (best > spacing * 0.75) continue;
    let ri = 0, rbest = Infinity;
    rowLabels.forEach((r, i) => { const d = Math.abs(r.cy - w.cy); if (d < rbest) { rbest = d; ri = i; } });
    const key = `${ri}|${ci}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(w);
  }

  const raw = [];
  for (const [key, ws] of cells) {
    const [ri, ci] = key.split('|').map(Number);
    const text = wordsToText(ws).replace(/ \| /g, ' ');
    for (const e of extractCellEntries(text)) {
      raw.push({ ...e, day: colDays[ci].day, ri, start: rowLabels[ri].start, end: rowLabels[ri].end });
    }
  }

  // Merge consecutive hourly rows of the same class into a single slot.
  const sig = (r) => `${r.day}|${r.batch}|${r.subject}|${r.faculty}|${r.room}`;
  raw.sort((a, b) => (sig(a) < sig(b) ? -1 : sig(a) > sig(b) ? 1 : a.ri - b.ri));
  const merged = [];
  for (const r of raw) {
    const prev = merged[merged.length - 1];
    if (prev && sig(prev) === sig(r) && prev.end === r.start) {
      prev.end = r.end;
    } else {
      merged.push({ ...r });
    }
  }

  return sanitizeSlots(merged.map(r => {
    const upper = r.subject.replace(/\s+/g, ' ').toUpperCase();
    const known = COMMON_SUBJECT_NAMES[upper] || COMMON_SUBJECT_NAMES[upper.replace(/\s+/g, '')];
    const isLongName = r.subject.length > 8;
    const code = isLongName ? r.subject.split(/[ ,]+/).filter(Boolean).map(x => x[0]).join('').toUpperCase().slice(0, 6) : upper;
    const base = known || r.subject;
    return {
      subjectCode: code,
      title: r.batch ? `${base} (${r.batch})` : base,
      day: r.day,
      startTime: r.start,
      endTime: r.end,
      location: r.room,
      eventType: /^L\d/.test(r.room) ? 'lab' : 'lecture'
    };
  }));
}

/** Rough quality score of an OCR pass, used to choose between page segmentation modes. */
function scoreOcrText(text) {
  if (!text) return 0;
  const days = (text.match(/\b(mon|tue|wed|thu|fri|sat)[a-z]*/gi) || []).length;
  const times = (text.match(/\d{1,2}\s*[:.]\s*\d{2}/g) || []).length;
  const cells = (text.match(/\([A-Za-z]{1,4}\)/g) || []).length;
  return days * 3 + times * 2 + cells * 2 + Math.min(text.length / 200, 10);
}

/**
 * High-level timetable extraction pipeline: AI-first with robust fallback.
 */
async function processTimetableText(rawText) {
  if (!rawText || !rawText.trim()) {
    return { items: [], parser: 'none' };
  }

  const aiItems = await analyzeTimetableWithAI(rawText);
  if (aiItems && aiItems.length > 0) {
    return { items: aiItems, parser: 'ai-groq' };
  }

  return { items: parseTimetableTextDeterministic(rawText), parser: 'deterministic' };
}

function runTesseract(binary, imagePath, args) {
  return new Promise((resolve) => {
    execFile(
      binary,
      [imagePath, 'stdout', '-l', 'eng', '--dpi', '300', '-c', 'preserve_interword_spaces=1', ...args],
      { maxBuffer: 20 * 1024 * 1024, timeout: 45000 },
      (err, stdout) => resolve(stdout || '')
    );
  });
}

/**
 * Scans a timetable image using Tesseract OCR (several page-segmentation modes,
 * word-box layout reconstruction), followed by AI reasoning.
 */
async function scanTimetableImage(imageBuffer) {
  const tesseractBinary = resolveTesseractBinary();
  const tempId = `timetable_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
  const tempPath = path.join(os.tmpdir(), tempId);

  try {
    await fs.promises.writeFile(tempPath, imageBuffer);

    // Two TSV passes (uniform block + sparse text) give word boxes; keep the best.
    const passes = [];
    for (const psm of ['6', '11']) {
      const tsv = await runTesseract(tesseractBinary, tempPath, ['--psm', psm, 'tsv']);
      const words = parseTesseractTsv(tsv);
      const text = wordsToText(words);
      passes.push({ words, text, score: scoreOcrText(text) });
    }
    passes.sort((a, b) => b.score - a.score);
    let best = passes[0];

    // Plain-text fallback if TSV produced nothing
    if (!best.text || best.text.trim().length < 20) {
      const plain = await runTesseract(tesseractBinary, tempPath, ['--psm', '4']);
      best = { words: [], text: plain, score: scoreOcrText(plain) };
    }
    const ocrText = best.text;

    // 1. Geometry-based grid reconstruction (most reliable on grid timetables)
    let layoutItems = [];
    for (const pass of passes) {
      const found = parseTimetableFromWords(pass.words);
      if (found.length > layoutItems.length) layoutItems = found;
    }

    // 2. AI reasoning over reconstructed text; prefer it unless geometry found clearly more
    const aiItems = await analyzeTimetableWithAI(ocrText);
    let items, parser;
    if (aiItems && aiItems.length >= layoutItems.length * 0.8) {
      items = aiItems; parser = 'ai-groq';
    } else if (layoutItems.length > 0) {
      items = layoutItems; parser = 'layout-grid';
    } else {
      items = parseTimetableTextDeterministic(ocrText); parser = 'deterministic';
    }

    return {
      success: true,
      count: items.length,
      items,
      rawText: (ocrText || '').trim(),
      parser,
      tesseractPath: tesseractBinary
    };
  } finally {
    try {
      if (fs.existsSync(tempPath)) {
        await fs.promises.unlink(tempPath);
      }
    } catch (_) {}
  }
}

module.exports = {
  scanTimetableImage,
  processTimetableText,
  parseTimetableText: (text) => parseTimetableTextDeterministic(text),
  parseTimetableFromWords,
  parseTesseractTsv,
  wordsToText,
  extractJsonPayload,
  sanitizeSlots,
  normalizeTime24,
  resolveTesseractBinary,
  COMMON_SUBJECT_NAMES
};
