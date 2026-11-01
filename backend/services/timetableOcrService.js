/**
 * Timetable OCR Service
 *
 * Uses the local Tesseract OCR engine (installed on the device) to extract
 * subject codes, days, and class timings from timetable photos or documents.
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
 * Common engineering and university subject codes & abbreviations in Mumbai
 */
const COMMON_SUBJECT_NAMES = {
  'AOA': 'Design and Analysis of Algorithms',
  'CS301': 'Design and Analysis of Algorithms',
  'CS 301': 'Design and Analysis of Algorithms',
  'CSC301': 'Design and Analysis of Algorithms',
  'C301': 'Design and Analysis of Algorithms',
  'DBMS': 'Database Management Systems',
  'CS302': 'Database Management Systems',
  'CS 302': 'Database Management Systems',
  'CSC302': 'Database Management Systems',
  'C302': 'Database Management Systems',
  'OS': 'Operating Systems & Virtualization',
  'CS305': 'Operating Systems & Virtualization',
  'CS 305': 'Operating Systems & Virtualization',
  'CSC305': 'Operating Systems & Virtualization',
  'C305': 'Operating Systems & Virtualization',
  'CN': 'Computer Networks',
  'IT402': 'Computer Networks',
  'IT 402': 'Computer Networks',
  'ITC402': 'Computer Networks',
  'AI': 'Artificial Intelligence',
  'AI401': 'Artificial Intelligence',
  'AI 401': 'Artificial Intelligence',
  'ML': 'Machine Learning',
  'DS': 'Data Structures',
  'DSA': 'Data Structures & Algorithms',
  'DLDA': 'Digital Logic & Computer Architecture',
  'ECCF': 'Electronic Circuits & Communication Fundamentals',
  'MATHS': 'Applied Mathematics',
  'MATH3': 'Applied Mathematics III',
  'MATH 301': 'Applied Mathematics III',
  'AM-III': 'Applied Mathematics III',
  'AM-IV': 'Applied Mathematics IV',
  'PYTHON': 'Python Programming Lab',
  'WEB': 'Web Computing & Modern Frameworks',
  'CS308': 'Web Computing & Modern Frameworks',
  'CS 308': 'Web Computing & Modern Frameworks',
  'TCS': 'Theoretical Computer Science',
  'SPCC': 'System Programming & Compiler Construction',
  'SE': 'Software Engineering',
  'CG': 'Computer Graphics',
  'OOPM': 'Object Oriented Programming'
};

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * Normalizes time string (e.g. "9:00", "09.00 AM", "2:30 PM", "12;30") into standard "HH:mm" 24-hr format.
 */
function normalizeTime24(timeStr) {
  if (!timeStr) return '09:00';
  const clean = timeStr.trim().replace(/[.;]/g, ':');
  const isPM = /pm/i.test(clean);
  const isAM = /am/i.test(clean);
  const match = clean.match(/(\d{1,2}):(\d{2})/);
  if (!match) {
    // Check 4 digit time without colon e.g. "0900" or "1430"
    const digitMatch = clean.match(/\b(\d{2})(\d{2})\b/);
    if (digitMatch) {
      let h = parseInt(digitMatch[1], 10);
      const m = digitMatch[2];
      if (isPM && h < 12) h += 12;
      return `${String(h).padStart(2, '0')}:${m}`;
    }
    return '09:00';
  }

  let hours = parseInt(match[1], 10);
  const minutes = match[2];

  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;

  // Heuristic for colleges: classes between 1 and 6 without AM/PM are afternoon (PM)
  if (!isPM && !isAM && hours >= 1 && hours <= 6) {
    hours += 12;
  }

  return `${String(hours).padStart(2, '0')}:${minutes}`;
}

/**
 * Cleans OCR artifacts and prepares raw text for extraction.
 */
function preprocessOcrText(rawText) {
  return rawText
    .replace(/\r\n/g, '\n')
    // Fix fused PM/AM with words e.g. "PMCS302" -> "PM CS302"
    .replace(/([0-9AaPp][Mm])([A-Za-z])/g, '$1 $2')
    // Fix semicolons in times e.g. "12;30" -> "12:30"
    .replace(/(\d{1,2});(\d{2})/g, '$1:$2')
    // Fix dot in times e.g. "09.30" -> "09:30"
    .replace(/(\d{1,2})\.(\d{2})/g, '$1:$2')
    // Remove isolated backslashes or rogue symbols at start of lines
    .replace(/^[\\\/_~`|]+\s*/gm, '');
}

/**
 * Parses raw OCR text into timetable slots.
 */
function parseTimetableText(rawInput) {
  if (!rawInput) return [];
  const rawText = preprocessOcrText(rawInput);
  const lines = rawText.split('\n').map(l => l.trim()).filter(Boolean);
  const items = [];
  const seenKeys = new Set();

  const dayRegex = /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat)\b/i;
  const timeRangeRegex = /(\d{1,2}[:.]\d{2}(?:\s*[AaPp][Mm])?|\b\d{4}\b)\s*(?:-|to|–|—)\s*(\d{1,2}[:.]\d{2}(?:\s*[AaPp][Mm])?|\b\d{4}\b)/i;
  const locationRegex = /\b(?:Lab|Room|Hall|Audi|Auditorium|CR|Classroom)\s*[-_#]?\s*[A-Za-z0-9]+/i;
  const codeRegex = /\b(?!(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday|Mon|Tue|Wed|Thu|Fri|Sat|AM|PM|Lab|Room|Hall|Audi|CR|Time|Day)\b)([A-Z]{1,5}\s*[-_]?\s*\d{2,4}[A-Z]?|(?:AOA|DBMS|OS|CN|AI|ML|DS|DSA|DLDA|ECCF|MATHS?|PYTHON|WEB|TCS|SPCC|SE|CG|OOPM))\b/i;

  let currentDay = 'Monday';

  for (let lineIndex = 0; lineIndex < lines.length; lineIndex++) {
    const line = lines[lineIndex];

    // Check for day heading
    const dayMatch = line.match(dayRegex);
    if (dayMatch && !line.includes('|')) {
      const d = dayMatch[1].toLowerCase();
      const matchedDay = DAYS_OF_WEEK.find(x => x.toLowerCase().startsWith(d.slice(0, 3)));
      if (matchedDay) currentDay = matchedDay;
    }

    // 1. Tabular format check (contains '|' or multiple column breaks)
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

          // Extract location first so it does not collide with course code
          const locMatch = cell.match(locationRegex);
          const cellWithoutLocation = locMatch ? cell.replace(locMatch[0], '') : cell;
          const codeMatch = cellWithoutLocation.match(codeRegex);

          if (codeMatch) {
            const code = codeMatch[1].trim().toUpperCase();
            const assignedDay = targetDays[dayColIndex] || currentDay;
            dayColIndex++;

            const cleanName = cellWithoutLocation
              .replace(codeRegex, '')
              .replace(/[()]/g, '')
              .trim();
            const title = cleanName || COMMON_SUBJECT_NAMES[code] || COMMON_SUBJECT_NAMES[code.replace(/\s+/g, '')] || code;

            const dedupeKey = `${assignedDay}-${startTime}-${code}`;
            if (!seenKeys.has(dedupeKey)) {
              seenKeys.add(dedupeKey);
              items.push({
                id: `ocr-${Math.random().toString(36).slice(2, 9)}`,
                subjectCode: code,
                title,
                day: assignedDay,
                startTime,
                endTime,
                location: locMatch ? locMatch[0] : '',
                eventType: /lab|practical/i.test(cell) ? 'lab' : 'lecture',
                rawLine: cell
              });
            }
          }
        }
        continue;
      }
    }

    // 2. Linear line format (e.g. "Mon 09:00 - 10:00 CS 301 Algorithms Lab 402")
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

        const title = cleanTitle || COMMON_SUBJECT_NAMES[code] || COMMON_SUBJECT_NAMES[code.replace(/\s+/g, '')] || code;

        const dedupeKey = `${lineDay}-${startTime}-${code}`;
        if (!seenKeys.has(dedupeKey)) {
          seenKeys.add(dedupeKey);
          items.push({
            id: `ocr-${Math.random().toString(36).slice(2, 9)}`,
            subjectCode: code,
            title,
            day: lineDay,
            startTime,
            endTime,
            location: locMatch ? locMatch[0] : '',
            eventType: /lab|practical/i.test(line) ? 'lab' : 'lecture',
            rawLine: line
          });
        }
      }
    } else {
      // 3. Multi-line card block format: subject code on current line, time on next line
      const locMatch = line.match(locationRegex);
      const lineWithoutLocation = locMatch ? line.replace(locMatch[0], '') : line;
      const codeMatch = lineWithoutLocation.match(codeRegex);

      if (codeMatch && lineIndex + 1 < lines.length) {
        const nextLine = lines[lineIndex + 1];
        const nextTimeMatch = nextLine.match(timeRangeRegex);
        if (nextTimeMatch) {
          const startTime = normalizeTime24(nextTimeMatch[1]);
          const endTime = normalizeTime24(nextTimeMatch[2]);
          const code = codeMatch[1].trim().toUpperCase();
          const nextLocMatch = nextLine.match(locationRegex);

          const dedupeKey = `${currentDay}-${startTime}-${code}`;
          if (!seenKeys.has(dedupeKey)) {
            seenKeys.add(dedupeKey);
            items.push({
              id: `ocr-${Math.random().toString(36).slice(2, 9)}`,
              subjectCode: code,
              title: COMMON_SUBJECT_NAMES[code] || COMMON_SUBJECT_NAMES[code.replace(/\s+/g, '')] || code,
              day: currentDay,
              startTime,
              endTime,
              location: locMatch ? locMatch[0] : (nextLocMatch ? nextLocMatch[0] : ''),
              eventType: /lab|practical/i.test(line) || /lab|practical/i.test(nextLine) ? 'lab' : 'lecture',
              rawLine: `${line} / ${nextLine}`
            });
          }
        }
      }
    }
  }

  // Sort items chronologically by day and start time
  const dayOrder = {
    'Monday': 1, 'Tuesday': 2, 'Wednesday': 3, 'Thursday': 4,
    'Friday': 5, 'Saturday': 6, 'Sunday': 7
  };
  items.sort((a, b) => {
    const diff = (dayOrder[a.day] || 99) - (dayOrder[b.day] || 99);
    if (diff !== 0) return diff;
    return a.startTime.localeCompare(b.startTime);
  });

  return items;
}

/**
 * Runs Tesseract OCR on an image buffer or file path.
 *
 * @param {Buffer} imageBuffer - Binary buffer of the uploaded image
 * @returns {Promise<{success: boolean, items: Array, rawText: string, tesseractPath: string}>}
 */
async function scanTimetableImage(imageBuffer) {
  const tesseractBinary = resolveTesseractBinary();

  // Write image buffer to a temporary file
  const tempId = `timetable_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
  const tempPath = path.join(os.tmpdir(), tempId);

  try {
    await fs.promises.writeFile(tempPath, imageBuffer);

    // Run Tesseract OCR command: tesseract.exe <tempPath> stdout -l eng --psm 6
    const ocrText = await new Promise((resolve, reject) => {
      execFile(
        tesseractBinary,
        [tempPath, 'stdout', '-l', 'eng', '--psm', '6'],
        { maxBuffer: 10 * 1024 * 1024, timeout: 30000 },
        (err, stdout, stderr) => {
          if (err) {
            // Try automatic psm 3 if psm 6 fails
            execFile(
              tesseractBinary,
              [tempPath, 'stdout', '-l', 'eng'],
              { maxBuffer: 10 * 1024 * 1024, timeout: 30000 },
              (err2, stdout2) => {
                if (err2) return reject(new Error(`Tesseract OCR execution failed: ${err.message}`));
                resolve(stdout2 || '');
              }
            );
            return;
          }
          resolve(stdout || '');
        }
      );
    });

    const parsedItems = parseTimetableText(ocrText);

    return {
      success: true,
      count: parsedItems.length,
      items: parsedItems,
      rawText: ocrText.trim(),
      tesseractPath: tesseractBinary
    };
  } finally {
    // Always clean up temp file
    try {
      if (fs.existsSync(tempPath)) {
        await fs.promises.unlink(tempPath);
      }
    } catch (_) {
      // Ignore cleanup error
    }
  }
}

module.exports = {
  scanTimetableImage,
  parseTimetableText,
  resolveTesseractBinary
};
