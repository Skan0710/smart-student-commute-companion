import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('./api', () => ({
  planCommute: vi.fn(),
  submitFeedback: vi.fn(),
  fetchCommuteRecommendations: vi.fn(),
}));
vi.mock('../utils/authSession', () => ({ readAuthToken: vi.fn() }));

import { planCommute, fetchCommuteRecommendations } from './api';
import { readAuthToken } from '../utils/authSession';
import { requestPlan } from './planner';

// Trimmed copy of a real /api/commute/recommendations response
const personalizedResponse = {
  success: true,
  hasFeasibleRoute: true,
  recommendation: { id: 'rec-1', status: 'RECOMMENDED', selectedRoute: {} }, // NOT the standard {route, aiReasoning}
  primaryRecommendedRoute: {
    journeyId: 'cand-direct-auto-0815',
    origin: 'Andheri East',
    destination: 'IIT Bombay Powai',
    departureTime: '08:15',
    estimatedArrivalTime: '08:31',
    totalTravelTimeMinutes: 16,
    walkingTimeMinutes: 0,
    transfers: 0,
    estimatedCostRupees: 61,
    reliability: 'LOW',
    primaryMode: 'auto',
    modesIncluded: ['auto'],
    strengths: [],
    weaknesses: ['HIGH_COST'],
    segments: [],
    provenance: { sourceTier: 'ESTIMATED' },
  },
  alternativeRoutes: [],
  tradeOffs: ['Direct single-mode journey with 0 transfers.'],
  selectionReason: 'Arrives by 08:31 (before your 09:00 deadline).',
  uncertainty: 'LOW',
  explanationAudit: { provider: 'Deterministic Grounded Engine', isAiEnhanced: true },
  warnings: [],
};

const standardResponse = {
  query: { origin: { lat: 19.1, lon: 72.8 }, destination: { lat: 19.13, lon: 72.9 } },
  recommendation: { route: { id: 'r1', title: 'Bus 418 + Walking', durationMinutes: 31, fareRupees: 12 }, aiReasoning: {} },
  alternatives: [],
  allCandidatesCount: 3,
};

const form = { origin: 'Andheri East', destination: 'IIT Bombay Powai', desiredArrivalTime: '09:00' };

describe('requestPlan', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('maps the personalized response to the real values, never invented ones', async () => {
    readAuthToken.mockReturnValue('token');
    fetchCommuteRecommendations.mockResolvedValue(personalizedResponse);

    const plan = await requestPlan(form);
    const route = plan.recommendation.route;

    expect(route.durationMinutes).toBe(16);
    expect(route.estimatedDeparture).toBe('08:15');
    expect(route.estimatedArrival).toBe('08:31');
    expect(route.fareRupees).toBe(61);
    expect(route.walkingDurationMinutes).toBe(0);
    expect(route.reliability).toBe('LOW');
    expect(route.title).toBe('Auto');
    expect(plan.allCandidatesCount).toBe(1);
  });

  it('leaves unknown values null instead of fabricating defaults', async () => {
    readAuthToken.mockReturnValue('token');
    fetchCommuteRecommendations.mockResolvedValue({
      ...personalizedResponse,
      primaryRecommendedRoute: { journeyId: 'x', primaryMode: 'metro' },
    });

    const route = (await requestPlan(form)).recommendation.route;

    expect(route.durationMinutes).toBeNull();
    expect(route.fareRupees).toBeNull();
    expect(route.walkingDurationMinutes).toBeNull();
    expect(route.estimatedArrival).toBeNull();
  });

  it('does not treat the personalized `recommendation` object as a standard plan', async () => {
    readAuthToken.mockReturnValue('token');
    fetchCommuteRecommendations.mockResolvedValue(personalizedResponse);

    const plan = await requestPlan(form);

    expect(plan.recommendation).not.toBeNull();
    expect(plan.recommendation.route).toBeDefined();
  });

  it('names the engine after the provider the API reports', async () => {
    readAuthToken.mockReturnValue('token');
    fetchCommuteRecommendations.mockResolvedValue(personalizedResponse);
    expect((await requestPlan(form)).recommendation.aiReasoning.aiProvider).toBe('Deterministic Scoring Engine');

    fetchCommuteRecommendations.mockResolvedValue({
      ...personalizedResponse,
      explanationAudit: { provider: 'Gemini (gemini-2.5-flash)', isAiEnhanced: true },
    });
    expect((await requestPlan(form)).recommendation.aiReasoning.aiProvider).toBe('Gemini AI Personalized');
  });

  it('passes a standard /plan response through untouched for guests', async () => {
    readAuthToken.mockReturnValue(null);
    planCommute.mockResolvedValue(standardResponse);

    const plan = await requestPlan(form);

    expect(fetchCommuteRecommendations).not.toHaveBeenCalled();
    expect(plan.recommendation.route.durationMinutes).toBe(31);
    expect(plan.allCandidatesCount).toBe(3);
  });

  it('falls back to the standard planner when the personalized call fails', async () => {
    readAuthToken.mockReturnValue('token');
    fetchCommuteRecommendations.mockRejectedValue(new Error('boom'));
    planCommute.mockResolvedValue(standardResponse);

    const plan = await requestPlan(form);

    expect(plan.recommendation.route.id).toBe('r1');
  });
});
