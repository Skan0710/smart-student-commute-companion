import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./api', () => ({ request: vi.fn() }));
vi.mock('../utils/authSession', () => ({
  readAuthToken: vi.fn(),
  readAuthSession: vi.fn(() => ({ token: 't', user: { id: 'me' } })),
}));

import { request } from './api';
import { readAuthToken } from '../utils/authSession';
import {
  loadGoals,
  createStudentGoal,
  loadSharedTravel,
  createSharedJourney,
  discoverJourneys,
} from './communityGoals';

describe('community service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('serves flagged sample goals to guests without a network call', async () => {
    readAuthToken.mockReturnValue(null);

    const { goals, isSample } = await loadGoals();

    expect(isSample).toBe(true);
    expect(goals.length).toBeGreaterThan(0);
    expect(request).not.toHaveBeenCalled();
  });

  it('adapts real goals (progress clamped, readable target date)', async () => {
    readAuthToken.mockReturnValue('token');
    request.mockResolvedValue({
      goals: [{ id: 'g1', title: 'Target 9.2 SGPA', progress: 140, status: 'in_progress', targetDate: new Date(2026, 11, 15).getTime() }],
    });

    const { goals, isSample } = await loadGoals();

    expect(request).toHaveBeenCalledWith(expect.stringMatching(/^\/academic\/goals/));
    expect(isSample).toBe(false);
    expect(goals[0]).toMatchObject({ title: 'Target 9.2 SGPA', progress: 100, targetDate: '15 Dec 2026' });
  });

  it('sends a goal the backend can validate (epoch target_date, no unknown fields)', async () => {
    request.mockResolvedValue({});
    const target = new Date(2026, 11, 15, 23, 59).getTime();

    await createStudentGoal({ title: 'Ship the paper', description: 'Draft + revise', targetDate: target });

    const [path, options] = request.mock.calls[0];
    expect(path).toBe('/academic/goals');
    expect(JSON.parse(options.body)).toEqual({ title: 'Ship the paper', description: 'Draft + revise', target_date: target });
  });

  it('asks for consent instead of loading journeys while sharing is off', async () => {
    readAuthToken.mockReturnValue('token');
    request.mockResolvedValue({ preferences: { sharingEnabled: false } });

    const travel = await loadSharedTravel();

    expect(travel).toMatchObject({ isSample: false, sharingEnabled: false, active: [], meetingPoints: [] });
    expect(request).toHaveBeenCalledTimes(1);
  });

  it('flattens the real journeys payload once sharing is on', async () => {
    readAuthToken.mockReturnValue('token');
    const journey = {
      id: 'j1',
      title: 'Andheri pool',
      organizer: { userId: 'me', pseudonym: 'Student_Commuter' },
      originArea: 'Andheri East',
      destinationArea: 'Powai',
      departureWindow: { startTime: new Date(2026, 9, 29, 8, 0).getTime(), preferredDepartureTime: '08:30' },
      transportMode: 'metro',
      maxParticipants: 4,
      currentParticipantCount: 1,
      isMember: true,
    };
    request.mockImplementation((path) => {
      if (path === '/shared-travel/preferences') return Promise.resolve({ preferences: { sharingEnabled: true } });
      if (path === '/shared-travel/journeys') {
        return Promise.resolve({ activeJourneys: [journey], pendingInvitations: [{ groupId: 'j2', invitationId: 'm1', group: { ...journey, id: 'j2' } }], pastJourneys: [] });
      }
      return Promise.resolve({ meetingPoints: [{ id: 'mp1', name: 'Gate', area: 'Vile Parle' }] });
    });

    const travel = await loadSharedTravel();

    expect(travel.sharingEnabled).toBe(true);
    expect(travel.active[0]).toMatchObject({ title: 'Andheri pool', origin: 'Andheri East', departureTime: '08:30', seatsAvailable: 3, mode: 'Metro', isOrganizer: true, isMember: true });
    expect(travel.pending[0]).toMatchObject({ id: 'j2', membershipId: 'm1' });
    expect(travel.meetingPoints[0]).toEqual({ id: 'mp1', name: 'Gate', landmark: 'Vile Parle' });
  });

  it('builds a coarse-area departure window around the chosen time', async () => {
    request.mockResolvedValue({});
    const departureAt = new Date(2026, 9, 29, 8, 30).getTime();

    await createSharedJourney({
      title: 'Morning pool',
      originArea: 'Andheri East',
      destinationArea: 'Vile Parle',
      departureAt,
      flexMinutes: 15,
      transportMode: 'train',
      maxParticipants: 4,
    });

    const body = JSON.parse(request.mock.calls[0][1].body);
    expect(request.mock.calls[0][0]).toBe('/shared-travel/journeys');
    expect(body.departureWindow).toEqual({
      startTime: departureAt - 15 * 60000,
      endTime: departureAt + 15 * 60000,
      preferredDepartureTime: '08:30',
      flexMinutes: 15,
    });
  });

  it('adapts discovery matches into joinable cards', async () => {
    request.mockResolvedValue({
      matches: [{ groupId: 'g9', title: 'Borivali fast local', coarseOriginArea: 'Borivali West', coarseDestinationArea: 'Vile Parle', availableSlots: 3, totalCapacity: 4, organizerPseudonym: 'Peer_Rider', transportMode: 'train', departureWindowSummary: { preferredDepartureTime: '07:55' } }],
    });

    const [match] = await discoverJourneys({ originArea: ' Borivali ' });

    expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({ originArea: 'Borivali' });
    expect(match).toMatchObject({ id: 'g9', seatsAvailable: 3, participantsCount: 1, organizer: 'Peer_Rider', mode: 'Local train', departureTime: '07:55' });
  });
});
