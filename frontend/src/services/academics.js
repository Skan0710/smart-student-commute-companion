import { request } from './api';
import { readAuthToken } from '../utils/authSession';
import {
  formatDueDate,
  formatTimeRange,
  formatDuration,
  formatFileSize,
  formatWeekday,
  titleCase,
} from '../utils/formatters';

/**
 * Academics, Courses, Calendar & Study Service
 * Handles endpoints for Subsystems A, B, C, D
 *
 * Every student endpoint here is authenticated, so:
 * - Signed-in students get their real data, adapted from the backend's
 *   camelCase rows to the shapes the screens render. Failures REJECT so the
 *   screen can show an error with a retry — never a silent stand-in.
 * - Guests (no session) get clearly labelled SAMPLE data without a pointless
 *   401 round trip. Results carry `isSample` so the UI can say so.
 */

const LIST_LIMIT = 50; // backend page-size cap for list endpoints

const isSignedIn = () => Boolean(readAuthToken());

const RESOURCE_TYPE_LABELS = {
  note: 'Note',
  link: 'Link',
  reference: 'Reference',
  document: 'Document',
  other: 'Resource',
};

// ─── Sample data (guests only — always flagged `isSample`) ──────────────────

const SAMPLE_COURSES = [
  { id: 'sample-c1', code: 'CS 301', name: 'Design and Analysis of Algorithms', faculty: 'Dr. Mehta', credits: 4, room: 'Lab 402', color: '#2563EB', active: true },
  { id: 'sample-c2', code: 'CS 302', name: 'Database Management Systems', faculty: 'Prof. Sharma', credits: 4, room: 'Room 312', color: '#059669', active: true },
  { id: 'sample-c3', code: 'CS 305', name: 'Operating Systems & Virtualization', faculty: 'Dr. Rao', credits: 3, room: 'Auditorium B', color: '#7C3AED', active: true },
  { id: 'sample-c4', code: 'CS 308', name: 'Web Computing & Modern Frameworks', faculty: 'Prof. Desai', credits: 3, room: 'Lab 201', color: '#EA580C', active: true },
];

const SAMPLE_ASSIGNMENTS = [
  { id: 'sample-a1', title: 'Dynamic Programming & Graph Algorithms Problem Set', courseCode: 'CS 301', dueDate: 'Tomorrow, 11:59 PM', priority: 'high', status: 'pending', estimatedHours: 3 },
  { id: 'sample-a2', title: 'SQL Query Optimization & Indexing Lab Sheet', courseCode: 'CS 302', dueDate: 'Thursday, 5:00 PM', priority: 'medium', status: 'in_progress', estimatedHours: 2 },
  { id: 'sample-a3', title: 'Kernel Threading and Synchronization Demo', courseCode: 'CS 305', dueDate: 'Next Monday', priority: 'low', status: 'completed', estimatedHours: 4 },
];

const SAMPLE_EVENTS = [
  { id: 'sample-e1', title: 'Algorithms Lecture & Analysis', time: '09:00 AM – 10:30 AM', location: 'Hall 402', type: 'lecture' },
  { id: 'sample-e2', title: 'DBMS Practical Lab & Tuning', time: '11:00 AM – 01:00 PM', location: 'Lab 312', type: 'lab' },
  { id: 'sample-e3', title: 'Peer Study Group: Operating Systems', time: '03:30 PM – 05:00 PM', location: 'Central Library Room 4', type: 'study' },
];

const SAMPLE_SESSIONS = [
  { id: 'sample-s1', subject: 'Algorithms', topic: 'Greedy Heuristics & Dynamic Trees', plannedDuration: '1 h 30 min', status: 'planned' },
  { id: 'sample-s2', subject: 'Databases', topic: 'B+ Tree indexing and concurrency', plannedDuration: '1 h', status: 'completed' },
];

const SAMPLE_RESOURCES = [
  { id: 'sample-r1', title: 'Mumbai University Algorithms Question Bank (2020-2025)', type: 'Document', size: '4.2 MB', course: 'CS 301', link: null },
  { id: 'sample-r2', title: 'Distributed Systems & Microservices Cheatsheet', type: 'Reference', size: '1.1 MB', course: 'CS 305', link: null },
  { id: 'sample-r3', title: 'Database Normalization & Transaction Isolation Notes', type: 'Note', size: '2.8 MB', course: 'CS 302', link: null },
  { id: 'sample-r4', title: 'React & Tailwind Modern Patterns Starter Repo', type: 'Link', size: '', course: 'CS 308', link: null },
];

const SAMPLE_PLAN = {
  id: 'sample-plan',
  title: 'Weekly Academic Mastery Plan (Mid-Term Prep)',
  status: 'active',
  allocatedHours: 6,
  completedHours: 3.5,
  targetCompletion: 58,
  items: [
    { id: 'sample-p1', title: 'Complete Dynamic Programming Problems 1-15', duration: '2 h', day: 'Monday', status: 'completed', priority: 'high', minutes: 120 },
    { id: 'sample-p2', title: 'Revise SQL Joins and Query Optimization', duration: '1 h 30 min', day: 'Tuesday', status: 'completed', priority: 'medium', minutes: 90 },
    { id: 'sample-p3', title: 'Operating Systems Process Scheduling Simulator', duration: '2 h', day: 'Wednesday', status: 'in_progress', priority: 'medium', minutes: 120 },
    { id: 'sample-p4', title: 'Web App State Management Review & Practice', duration: '1 h 30 min', day: 'Thursday', status: 'planned', priority: 'low', minutes: 90 },
  ],
};

// ─── Adapters: backend rows → UI shapes ─────────────────────────────────────

const courseLabelOf = (courseMap, courseId) => {
  const course = courseMap.get(courseId);
  return course ? course.code || course.name : '';
};

function normalizeCourse(course) {
  return {
    id: course.id,
    code: course.code || '',
    name: course.name,
    faculty: course.instructor || '',
    credits: course.credits,
    room: '',
    color: course.color,
    active: !course.archived,
  };
}

function normalizeAssignment(assignment, courseMap) {
  return {
    id: assignment.id,
    title: assignment.title,
    courseCode: courseLabelOf(courseMap, assignment.courseId),
    dueDate: formatDueDate(assignment.dueDate),
    dueAt: assignment.dueDate,
    priority: assignment.priority,
    status: assignment.status,
    estimatedHours: null,
  };
}

function normalizeEvent(event) {
  return {
    id: event.id,
    title: event.title,
    time: formatTimeRange(event.startTime, event.endTime),
    startTime: event.startTime,
    location: event.location || '',
    type: event.eventType,
  };
}

function normalizeSession(session, courseMap) {
  return {
    id: session.id,
    subject: courseLabelOf(courseMap, session.courseId),
    topic: session.title,
    plannedDuration: formatDuration(session.plannedDurationMinutes),
    plannedAt: session.plannedStartTime,
    status: session.status,
  };
}

function normalizeResource(resource, courseMap) {
  return {
    id: resource.id,
    title: resource.title,
    type: RESOURCE_TYPE_LABELS[resource.resourceType] || titleCase(resource.resourceType) || 'Resource',
    size: formatFileSize(resource.fileSize),
    course: courseLabelOf(courseMap, resource.courseId),
    link: resource.url || null,
  };
}

const roundToTenth = (value) => Math.round(value * 10) / 10;

function normalizeStudyPlan(response) {
  const plan = response?.plan;
  if (!plan) return null;

  const items = (response.items || [])
    .slice()
    .sort((a, b) => (a.orderIndex ?? 0) - (b.orderIndex ?? 0) || (a.plannedDate ?? 0) - (b.plannedDate ?? 0))
    .map((item) => ({
      id: item.id,
      title: item.title,
      duration: formatDuration(item.durationMinutes),
      day: formatWeekday(item.plannedDate),
      status: item.status,
      priority: item.priority,
      minutes: item.durationMinutes || 0,
    }));

  const totalMinutes = items.reduce((sum, item) => sum + item.minutes, 0);
  const doneMinutes = items
    .filter((item) => item.status === 'completed')
    .reduce((sum, item) => sum + item.minutes, 0);

  return {
    id: plan.id,
    title: plan.title,
    status: plan.status,
    items,
    allocatedHours: roundToTenth(totalMinutes / 60),
    completedHours: roundToTenth(doneMinutes / 60),
    targetCompletion: totalMinutes > 0 ? Math.round((doneMinutes / totalMinutes) * 100) : null,
  };
}

// ─── Loaders ────────────────────────────────────────────────────────────────

const activeCourses = (response) => (response?.courses || []).filter((course) => !course.archived);

/**
 * Everything the Academic Hub screen shows, in one call.
 *
 * @returns {Promise<{courses: Array, assignments: Array, events: Array, sessions: Array,
 *   resources: Array, plan: Object|null, isSample: boolean}>}
 */
export async function loadAcademicHub() {
  if (!isSignedIn()) {
    return {
      courses: SAMPLE_COURSES,
      assignments: SAMPLE_ASSIGNMENTS,
      events: SAMPLE_EVENTS,
      sessions: SAMPLE_SESSIONS,
      resources: SAMPLE_RESOURCES,
      plan: SAMPLE_PLAN,
      isSample: true,
    };
  }

  const [coursesRes, assignmentsRes, todayRes, sessionsRes, resourcesRes, planRes] = await Promise.all([
    request(`/academic/courses?limit=${LIST_LIMIT}`),
    request(`/academic/assignments?limit=${LIST_LIMIT}`),
    request('/calendar/today'),
    request(`/calendar/study-sessions?limit=${LIST_LIMIT}`),
    request(`/student/resources?limit=${LIST_LIMIT}`),
    request('/student/study-plans/current'),
  ]);

  const rawCourses = activeCourses(coursesRes);
  const courseMap = new Map(rawCourses.map((course) => [course.id, course]));

  return {
    courses: rawCourses.map(normalizeCourse),
    assignments: (assignmentsRes?.assignments || [])
      .slice()
      .sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0))
      .map((assignment) => normalizeAssignment(assignment, courseMap)),
    events: (todayRes?.events || []).map(normalizeEvent),
    sessions: (sessionsRes?.studySessions || []).map((session) => normalizeSession(session, courseMap)),
    resources: (resourcesRes?.resources || []).map((resource) => normalizeResource(resource, courseMap)),
    plan: normalizeStudyPlan(planRes),
    isSample: false,
  };
}

/**
 * The academic slice the main dashboard summarises (no sessions/resources).
 *
 * @returns {Promise<{courses: Array, assignments: Array, events: Array, plan: Object|null, isSample: boolean}>}
 */
export async function loadAcademicSnapshot() {
  if (!isSignedIn()) {
    return {
      courses: SAMPLE_COURSES,
      assignments: SAMPLE_ASSIGNMENTS,
      events: SAMPLE_EVENTS,
      plan: SAMPLE_PLAN,
      isSample: true,
    };
  }

  const [coursesRes, assignmentsRes, todayRes, planRes] = await Promise.all([
    request(`/academic/courses?limit=${LIST_LIMIT}`),
    request(`/academic/assignments?limit=${LIST_LIMIT}`),
    request('/calendar/today'),
    request('/student/study-plans/current'),
  ]);

  const rawCourses = activeCourses(coursesRes);
  const courseMap = new Map(rawCourses.map((course) => [course.id, course]));

  return {
    courses: rawCourses.map(normalizeCourse),
    assignments: (assignmentsRes?.assignments || [])
      .slice()
      .sort((a, b) => (a.dueDate ?? 0) - (b.dueDate ?? 0))
      .map((assignment) => normalizeAssignment(assignment, courseMap)),
    events: (todayRes?.events || []).map(normalizeEvent),
    plan: normalizeStudyPlan(planRes),
    isSample: false,
  };
}

/**
 * Today's timetable only (used by the commute planner's "next class" card).
 * Guests get no events — the planner shows a sign-in hint instead of a made-up class.
 *
 * @returns {Promise<{events: Array, isSignedIn: boolean}>}
 */
export async function loadTodaySchedule() {
  if (!isSignedIn()) return { events: [], isSignedIn: false };
  const todayRes = await request('/calendar/today');
  return { events: (todayRes?.events || []).map(normalizeEvent), isSignedIn: true };
}

/** Re-read just the active study plan (after generating one). */
export async function getCurrentStudyPlan() {
  if (!isSignedIn()) return SAMPLE_PLAN;
  return normalizeStudyPlan(await request('/student/study-plans/current'));
}

// ─── Mutations (signed-in only; the screens gate these behind a session) ────

export function createCourse(courseData) {
  return request('/academic/courses', { method: 'POST', body: JSON.stringify(courseData) });
}

export function createAssignment(assignmentData) {
  return request('/academic/assignments', { method: 'POST', body: JSON.stringify(assignmentData) });
}

export function createCalendarEvent(eventData) {
  return request('/calendar/events', { method: 'POST', body: JSON.stringify(eventData) });
}

export function createStudyResource(resourceData) {
  return request('/student/resources', { method: 'POST', body: JSON.stringify(resourceData) });
}

export function generateStudyPlan(preferences) {
  return request('/student/study-plans/generate', {
    method: 'POST',
    body: JSON.stringify(preferences || {}),
  });
}
