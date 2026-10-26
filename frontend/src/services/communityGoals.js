import { apiFetch } from './api';

/**
 * Student Goals & Milestones Service (Subsystem E)
 */
export async function getStudentGoals() {
  try {
    const res = await apiFetch('/api/academic/goals');
    return res?.data?.goals || res?.goals || (Array.isArray(res?.data) ? res.data : []);
  } catch (err) {
    console.warn('Using fallback goals:', err.message);
    return [
      { id: 'g-1', title: 'Target 9.2+ Semester SGPA across all core subjects', progress: 75, targetDate: 'End of Semester', status: 'active', category: 'Academic' },
      { id: 'g-2', title: 'Publish Open-Source Transit & Routing Benchmark Paper', progress: 50, targetDate: 'Dec 15, 2026', status: 'active', category: 'Research' },
      { id: 'g-3', title: 'Zero Late Arrivals: Catch 8:15 AM Western Line Train Daily', progress: 90, targetDate: 'Ongoing', status: 'active', category: 'Habit' },
    ];
  }
}

export async function createStudentGoal(goalData) {
  return await apiFetch('/api/academic/goals', {
    method: 'POST',
    body: JSON.stringify(goalData),
  });
}

/**
 * Advanced Shared Travel Coordination Service (Subsystem F)
 */
export async function getSharedJourneys() {
  try {
    const res = await apiFetch('/api/shared-travel/journeys');
    return res?.data?.journeys || res?.journeys || (Array.isArray(res?.data) ? res.data : []);
  } catch (err) {
    console.warn('Using fallback shared journeys:', err.message);
    return [
      {
        id: 'sj-1',
        title: 'Andheri West Metro -> DJ Sanghvi Morning Commute',
        origin: 'Andheri Metro Station',
        destination: 'DJ Sanghvi College Campus',
        departureTime: '08:30 AM',
        seatsAvailable: 3,
        mode: 'Auto Share / Walk',
        organizer: 'Anirudh S.',
        participantsCount: 2
      },
      {
        id: 'sj-2',
        title: 'Borivali Fast Local Safety Buddy Pool',
        origin: 'Borivali Platform 3',
        destination: 'Vile Parle Station',
        departureTime: '07:55 AM',
        seatsAvailable: 4,
        mode: 'Local Train Group',
        organizer: 'Rohan M.',
        participantsCount: 3
      },
      {
        id: 'sj-3',
        title: 'Ghatkopar Metro to Western Line Interchange Connect',
        origin: 'Ghatkopar Metro Stn',
        destination: 'Andheri Western Line',
        departureTime: '08:15 AM',
        seatsAvailable: 2,
        mode: 'Metro Ride Group',
        organizer: 'Priya K.',
        participantsCount: 2
      }
    ];
  }
}

export async function getMeetingPoints() {
  try {
    const res = await apiFetch('/api/shared-travel/meeting-points');
    return res?.data?.meetingPoints || res?.meetingPoints || (Array.isArray(res?.data) ? res.data : []);
  } catch (err) {
    console.warn('Using fallback meeting points:', err.message);
    return [
      { id: 'mp-1', name: 'Andheri Station East Foot Overbridge Exit', landmark: 'Near Ticket Counter 4' },
      { id: 'mp-2', name: 'Vile Parle West Auto Stand Entrance', landmark: 'Outside Subway' },
      { id: 'mp-3', name: 'DJ Sanghvi College Main Gate Canopy', landmark: 'Campus Entrance' },
    ];
  }
}
