import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./api', () => ({ request: vi.fn() }));
vi.mock('../utils/authSession', () => ({ readAuthToken: vi.fn(), readAuthSession: vi.fn() }));

import { request } from './api';
import { readAuthToken } from '../utils/authSession';
import { loadAcademicHub, loadTodaySchedule } from './academics';

const course = { id: 'c1', name: 'Algorithms', code: 'CS301', instructor: 'Dr. Mehta', credits: 4, archived: false };

describe('academics service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('serves flagged sample data to guests without touching the network', async () => {
    readAuthToken.mockReturnValue(null);

    const hub = await loadAcademicHub();

    expect(hub.isSample).toBe(true);
    expect(hub.courses.length).toBeGreaterThan(0);
    expect(request).not.toHaveBeenCalled();
  });

  it('calls the real, un-doubled API paths for signed-in students', async () => {
    readAuthToken.mockReturnValue('token');
    request.mockResolvedValue({});

    await loadAcademicHub();

    const paths = request.mock.calls.map(([path]) => path);
    expect(paths.every((path) => !path.startsWith('/api/'))).toBe(true);
    expect(paths).toEqual(
      expect.arrayContaining([
        expect.stringContaining('/academic/courses'),
        expect.stringContaining('/academic/assignments'),
        '/calendar/today',
        expect.stringContaining('/calendar/study-sessions'),
        expect.stringContaining('/student/resources'),
        '/student/study-plans/current',
      ])
    );
  });

  it('adapts camelCase backend rows to the shapes the screens render', async () => {
    readAuthToken.mockReturnValue('token');
    const due = new Date(2026, 9, 29, 23, 59).getTime();
    const responses = {
      '/academic/courses': { courses: [course, { ...course, id: 'old', archived: true }] },
      '/academic/assignments': { assignments: [{ id: 'a1', courseId: 'c1', title: 'Problem set', dueDate: due, priority: 'high', status: 'pending' }] },
      '/calendar/today': { events: [{ id: 'e1', title: 'Lecture', location: 'Hall 402', eventType: 'lecture', startTime: due, endTime: due + 5400000 }] },
      '/calendar/study-sessions': { studySessions: [{ id: 's1', courseId: 'c1', title: 'Revision', plannedDurationMinutes: 90, status: 'planned' }] },
      '/student/resources': { resources: [{ id: 'r1', courseId: 'c1', title: 'Notes', resourceType: 'link', url: 'https://example.edu', fileSize: 4400000 }] },
      '/student/study-plans/current': {
        plan: { id: 'p1', title: 'Sprint', status: 'active' },
        items: [
          { id: 'i1', title: 'Done', durationMinutes: 60, plannedDate: due, status: 'completed', orderIndex: 0 },
          { id: 'i2', title: 'Todo', durationMinutes: 60, plannedDate: due, status: 'planned', orderIndex: 1 },
        ],
      },
    };
    request.mockImplementation((path) => {
      const key = Object.keys(responses).find((k) => path.startsWith(k));
      return Promise.resolve(responses[key]);
    });

    const hub = await loadAcademicHub();

    expect(hub.isSample).toBe(false);
    expect(hub.courses).toHaveLength(1); // archived course excluded
    expect(hub.courses[0]).toMatchObject({ code: 'CS301', faculty: 'Dr. Mehta', credits: 4 });
    expect(hub.assignments[0]).toMatchObject({ title: 'Problem set', courseCode: 'CS301', priority: 'high' });
    expect(hub.assignments[0].dueDate).toMatch(/Thu, 29 Oct/);
    expect(hub.events[0].time).toBe('11:59 PM – 01:29 AM');
    expect(hub.sessions[0]).toMatchObject({ subject: 'CS301', topic: 'Revision', plannedDuration: '1 h 30 min' });
    expect(hub.resources[0]).toMatchObject({ type: 'Link', size: '4.2 MB', course: 'CS301', link: 'https://example.edu' });
    expect(hub.plan).toMatchObject({ title: 'Sprint', allocatedHours: 2, completedHours: 1, targetCompletion: 50 });
  });

  it('reports no plan (not a made-up one) when the student has none', async () => {
    readAuthToken.mockReturnValue('token');
    request.mockResolvedValue({ plan: null, items: [], courses: [], assignments: [], events: [], studySessions: [], resources: [] });

    const hub = await loadAcademicHub();

    expect(hub.plan).toBeNull();
    expect(hub.courses).toEqual([]);
  });

  it('lets signed-in failures reject instead of silently showing sample data', async () => {
    readAuthToken.mockReturnValue('token');
    request.mockRejectedValue(new Error('Unable to connect to the server.'));

    await expect(loadAcademicHub()).rejects.toThrow('Unable to connect');
  });

  it('gives guests no invented timetable', async () => {
    readAuthToken.mockReturnValue(null);

    expect(await loadTodaySchedule()).toEqual({ events: [], isSignedIn: false });
  });
});
