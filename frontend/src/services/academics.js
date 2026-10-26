import { request } from './api';

/**
 * Academics, Courses, Calendar & Study Service
 * Handles endpoints for Subsystems A, B, C, D
 */

// --- Subsystem A: Courses & Assignments ---
export async function getCourses() {
  try {
    const res = await request('/api/academic/courses');
    return res?.data?.courses || res?.courses || (Array.isArray(res?.data) ? res.data : []);
  } catch (err) {
    console.warn('Using fallback courses:', err.message);
    return [
      { id: 'cs101', code: 'CS 301', name: 'Design and Analysis of Algorithms', faculty: 'Dr. Mehta', credits: 4, room: 'Lab 402', color: '#2563EB', active: true },
      { id: 'cs102', code: 'CS 302', name: 'Database Management Systems', faculty: 'Prof. Sharma', credits: 4, room: 'Room 312', color: '#059669', active: true },
      { id: 'cs103', code: 'CS 305', name: 'Operating Systems & Virtualization', faculty: 'Dr. Rao', credits: 3, room: 'Auditorium B', color: '#7C3AED', active: true },
      { id: 'cs104', code: 'CS 308', name: 'Web Computing & Modern Frameworks', faculty: 'Prof. Desai', credits: 3, room: 'Lab 201', color: '#EA580C', active: true },
    ];
  }
}

export async function createCourse(courseData) {
  return await request('/api/academic/courses', {
    method: 'POST',
    body: JSON.stringify(courseData),
  });
}

export async function getAssignments() {
  try {
    const res = await request('/api/academic/assignments');
    return res?.data?.assignments || res?.assignments || (Array.isArray(res?.data) ? res.data : []);
  } catch (err) {
    console.warn('Using fallback assignments:', err.message);
    return [
      { id: 'asgn-1', title: 'Dynamic Programming & Graph Algorithms Problem Set', courseCode: 'CS 301', dueDate: 'Tomorrow, 11:59 PM', priority: 'high', status: 'pending', estimatedHours: 3 },
      { id: 'asgn-2', title: 'SQL Query Optimization & Indexing Lab Sheet', courseCode: 'CS 302', dueDate: 'Thursday, 5:00 PM', priority: 'medium', status: 'in_progress', estimatedHours: 2 },
      { id: 'asgn-3', title: 'Kernel Threading and Synchronization Demo', courseCode: 'CS 305', dueDate: 'Next Monday', priority: 'low', status: 'completed', estimatedHours: 4 },
    ];
  }
}

export async function createAssignment(assignmentData) {
  return await request('/api/academic/assignments', {
    method: 'POST',
    body: JSON.stringify(assignmentData),
  });
}

// --- Subsystem B: Student Calendar & Study Sessions ---
export async function getTodayCalendar() {
  try {
    const res = await request('/api/calendar/today');
    return res?.data?.events || res?.events || (Array.isArray(res?.data) ? res.data : []);
  } catch (err) {
    console.warn('Using fallback calendar schedule:', err.message);
    return [
      { id: 'cal-1', title: 'Algorithms Lecture & Analysis', time: '09:00 AM - 10:30 AM', location: 'Hall 402', type: 'lecture' },
      { id: 'cal-2', title: 'DBMS Practical Lab & Tuning', time: '11:00 AM - 01:00 PM', location: 'Lab 312', type: 'lab' },
      { id: 'cal-3', title: 'Peer Study Group: Operating Systems', time: '03:30 PM - 05:00 PM', location: 'Central Library Room 4', type: 'study' },
    ];
  }
}

export async function getStudySessions() {
  try {
    const res = await request('/api/calendar/study-sessions');
    return res?.data?.sessions || res?.sessions || (Array.isArray(res?.data) ? res.data : []);
  } catch (err) {
    console.warn('Using fallback study sessions:', err.message);
    return [
      { id: 'sess-1', subject: 'Algorithms', topic: 'Greedy Heuristics & Dynamic Trees', plannedDuration: '90 mins', status: 'scheduled' },
      { id: 'sess-2', subject: 'Databases', topic: 'B+ Tree indexing and concurrency', plannedDuration: '60 mins', status: 'completed' },
    ];
  }
}

// --- Subsystem C: Study Resources & Materials ---
export async function getStudyResources() {
  try {
    const res = await request('/api/student/resources');
    return res?.data?.resources || res?.resources || (Array.isArray(res?.data) ? res.data : []);
  } catch (err) {
    console.warn('Using fallback study resources:', err.message);
    return [
      { id: 'res-1', title: 'Mumbai University Algorithms Question Bank (2020-2025)', type: 'PDF Document', size: '4.2 MB', course: 'CS 301', link: '#' },
      { id: 'res-2', title: 'Distributed Systems & Microservices Cheatsheet', type: 'Reference Sheet', size: '1.1 MB', course: 'CS 305', link: '#' },
      { id: 'res-3', title: 'Database Normalization & Transaction Isolation Notes', type: 'Lecture Notes', size: '2.8 MB', course: 'CS 302', link: '#' },
      { id: 'res-4', title: 'React 19 & Tailwind Modern Patterns Starter Repo', type: 'Code Repository', size: 'External', course: 'CS 308', link: '#' },
    ];
  }
}

export async function createStudyResource(resourceData) {
  return await request('/api/student/resources', {
    method: 'POST',
    body: JSON.stringify(resourceData),
  });
}

// --- Subsystem D: AI Study Plans & Work Scheduling Engine ---
export async function getCurrentStudyPlan() {
  try {
    const res = await request('/api/student/study-plans/current');
    return res?.data?.plan || res?.plan || res?.data || null;
  } catch (err) {
    console.warn('Using fallback study plan:', err.message);
    return {
      title: 'Weekly Academic Mastery Plan (Mid-Term Prep)',
      status: 'active',
      targetCompletion: '82%',
      allocatedHours: 18,
      completedHours: 12.5,
      items: [
        { id: 'spi-1', title: 'Complete Dynamic Programming Problems 1-15', duration: '120m', status: 'completed', day: 'Monday' },
        { id: 'spi-2', title: 'Revise SQL Joins and Query Optimization', duration: '90m', status: 'completed', day: 'Tuesday' },
        { id: 'spi-3', title: 'Operating Systems Process Scheduling Simulator', duration: '120m', status: 'in_progress', day: 'Wednesday' },
        { id: 'spi-4', title: 'Web App State Management Review & Practice', duration: '90m', status: 'planned', day: 'Thursday' },
      ]
    };
  }
}

export async function generateStudyPlan(preferences) {
  return await request('/api/student/study-plans/generate', {
    method: 'POST',
    body: JSON.stringify(preferences || {}),
  });
}
