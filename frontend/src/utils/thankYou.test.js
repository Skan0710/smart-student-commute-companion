import { describe, it, expect } from 'vitest';
import { announceThankYou, THANK_YOU_EVENT } from './thankYou.js';
import { getThankYou, THANK_YOU_TYPES } from '../content/thankYou.js';
import { getCampusHubs, TESTIMONIALS, CASE_STUDY } from '../content/proof.js';

describe('thank-you announcements', () => {
  it('dispatches only known submission types', () => {
    const events = [];
    const target = { dispatchEvent: (e) => events.push(e) };
    expect(announceThankYou('alert', target)).toBe(true);
    expect(announceThankYou('bogus', target)).toBe(false);
    expect(announceThankYou('alert', null)).toBe(false);
    expect(events).toHaveLength(1);
    expect(events[0].type).toBe(THANK_YOU_EVENT);
    expect(events[0].detail.type).toBe('alert');
  });

  it('has specific copy per type and a safe generic fallback', () => {
    for (const type of THANK_YOU_TYPES) expect(getThankYou(type).type).toBe(type);
    expect(getThankYou('<script>').type).toBe('generic');
  });
});

describe('proof content', () => {
  it('builds encoded OpenStreetMap walking links for each campus hub', () => {
    for (const hub of getCampusHubs()) {
      const url = new URL(hub.walkUrl);
      expect(url.origin + url.pathname).toBe('https://www.openstreetmap.org/directions');
      expect(url.searchParams.get('route')).toBe(`${hub.from.lat},${hub.from.lon};${hub.to.lat},${hub.to.lon}`);
    }
  });

  it('never ships unconsented testimonials or a statistical case study', () => {
    expect(TESTIMONIALS.every((t) => t.consent === true)).toBe(true);
    expect(CASE_STUDY.label).toMatch(/^Illustrative/);
  });
});
