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
  'MINI PROJECT': 'Mini Project Lab',
  'PROJ': 'Capstone Project'
};

const DAYS_OF_WEEK = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

/**
 * Normalizes time string into standard "HH:mm" 24-hr format.
 */
function normalizeTime24(timeStr) {
  if (!timeStr) return '09:00';
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
      return `${String(h).padStart(2, '0')}:${m}`;
    }
    return '09:00';
  }

  let hours = parseInt(match[1], 10);
  const minutes = match[2];

  if (isPM && hours < 12) hours += 12;
  if (isAM && hours === 12) hours = 0;

  if (!isPM && !isAM && hours >= 1 && hours <= 6) {
    hours += 12;
  }

  return `${String(hours).padStart(2, '0')}:${minutes}`;
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

  try {
    const prompt = `You are an expert college timetable analyzer.
Below is the raw OCR text extracted from an engineering college timetable (which may have OCR typos, pipes '|', or column breaks):

---
${ocrText.trim().slice(0, 4000)}
---

Task:
Extract every scheduled class, lab, or lecture into a structured JSON array.
Rules:
1. Each item must have:
   - "subjectCode": standard uppercase abbreviation (e.g. "DWM", "AI", "YPOO", "CN", "TCS", "SE", "CS301")
   - "title": clear expanded subject title (e.g. "Data Warehousing & Mining", "Artificial Intelligence", "Python & Object Oriented Programming", "Computer Networks")
   - "day": full weekday name ("Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday")
   - "startTime": 24-hour "HH:mm" (e.g. "09:00", "11:15", "14:00")
   - "endTime": 24-hour "HH:mm" (e.g. "10:00", "13:15", "16:00")
   - "location": room, hall, or lab name if visible (e.g. "CR 67", "Lab 402", or "")
   - "eventType": "lecture" or "lab" or "tutorial"
2. Fix common OCR mistakes (e.g. '0' vs 'O', 'PMCS' -> 'CS', missing colons).
3. Do NOT include breaks or recess.
4. Return ONLY valid, parseable JSON array. No markdown fences, no conversational text.`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey.trim()}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        model: 'qwen/qwen3.8-27b',
        messages: [
          { role: 'system', content: 'You are an accurate JSON-only timetable parser.' },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1
      }),
      signal: controller.signal
    });

    clearTimeout(timeout);

    if (!response.ok) {
      console.warn(`[Timetable AI] Groq returned status ${response.status}`);
      return null;
    }

    const data = await response.json();
    let text = data.choices?.[0]?.message?.content || '';

    // Strip markdown formatting if present
    text = text.replace(/```json/gi, '').replace(/```/g, '').trim();

    const parsed = JSON.parse(text);
    if (!Array.isArray(parsed) || parsed.length === 0) {
      return null;
    }

    // Sanitize and normalize items
    return parsed.map((item, idx) => ({
      id: `slot-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 6)}`,
      subjectCode: String(item.subjectCode || item.code || 'SUB').toUpperCase(),
      title: String(item.title || item.subjectCode || 'College Class'),
      day: DAYS_OF_WEEK.find(d => d.toLowerCase() === String(item.day || '').toLowerCase()) || 'Monday',
      startTime: normalizeTime24(item.startTime || item.start_time),
      endTime: normalizeTime24(item.endTime || item.end_time),
      location: String(item.location || item.room || '').trim(),
      eventType: String(item.eventType || item.event_type || 'lecture').toLowerCase()
    }));
  } catch (err) {
    console.warn(`[Timetable AI] AI parsing bypassed: ${err.message}`);
    return null;
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

/**
 * High-level timetable extraction pipeline: AI-first with robust fallback.
 */
async function processTimetableText(rawText) {
  if (!rawText || !rawText.trim()) {
    return { items: [], parser: 'none' };
  }

  // 1. Try AI-powered analysis first for superhuman accuracy
  const aiItems = await analyzeTimetableWithAI(rawText);
  if (aiItems && aiItems.length > 0) {
    return { items: aiItems, parser: 'ai-qwen-3.8' };
  }

  // 2. Fall back to enhanced deterministic rule-based parser
  const fallbackItems = parseTimetableTextDeterministic(rawText);
  return { items: fallbackItems, parser: 'deterministic' };
}

/**
 * Scans a timetable image using Tesseract OCR, followed by AI reasoning.
 */
async function scanTimetableImage(imageBuffer) {
  const tesseractBinary = resolveTesseractBinary();
  const tempId = `timetable_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.png`;
  const tempPath = path.join(os.tmpdir(), tempId);

  try {
    await fs.promises.writeFile(tempPath, imageBuffer);

    // Multi-pass OCR: try uniform block PSM 6, then fallback to automatic PSM 3
    const ocrText = await new Promise((resolve) => {
      execFile(
        tesseractBinary,
        [tempPath, 'stdout', '-l', 'eng', '--psm', '6'],
        { maxBuffer: 10 * 1024 * 1024, timeout: 25000 },
        (err, stdout) => {
          if (!err && stdout && stdout.trim().length > 20) {
            return resolve(stdout);
          }
          // Try PSM 4 (single column variable text) or PSM 3
          execFile(
            tesseractBinary,
            [tempPath, 'stdout', '-l', 'eng', '--psm', '4'],
            { maxBuffer: 10 * 1024 * 1024, timeout: 25000 },
            (err2, stdout2) => {
              resolve(stdout2 || stdout || '');
            }
          );
        }
      );
    });

    const { items, parser } = await processTimetableText(ocrText);

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
  resolveTesseractBinary,
  COMMON_SUBJECT_NAMES
};
