import { describe, it, expect } from 'vitest';
import { parseClockMinutes, parseTimeRange, annotateSchedule, greetingForHour } from './schedule.js';

const at = (h, m = 0) => new Date(2026, 10, 3, h, m);

describe('schedule helpers', () => {
  it('parses 12 and 24 hour clock text', () => {
    expect(parseClockMinutes('09:00 AM')).toBe(540);
    expect(parseClockMinutes('12:15 AM')).toBe(15);
    expect(parseClockMinutes('12:15 PM')).toBe(735);
    expect(parseClockMinutes('3:30 pm')).toBe(930);
    expect(parseClockMinutes('13:30')).toBe(810);
    expect(parseClockMinutes('soon')).toBeNull();
    expect(parseClockMinutes('25:00')).toBeNull();
    expect(parseClockMinutes('13:00 PM')).toBeNull();
  });

  it('parses a range and repairs an end that crossed noon', () => {
    expect(parseTimeRange('09:00 AM – 10:30 AM')).toEqual({ start: 540, end: 630 });
    expect(parseTimeRange('11:00 AM – 01:00 PM')).toEqual({ start: 660, end: 780 });
    expect(parseTimeRange('')).toEqual({ start: null, end: null });
  });

  it('marks done / now / next / later against the clock', () => {
    const events = [
      { id: 1, time: '09:00 AM – 10:30 AM' },
      { id: 2, time: '11:00 AM – 01:00 PM' },
      { id: 3, time: '03:30 PM – 05:00 PM' },
    ];
    expect(annotateSchedule(events, at(8)).map((e) => e.status)).toEqual(['next', 'later', 'later']);
    expect(annotateSchedule(events, at(9, 45)).map((e) => e.status)).toEqual(['now', 'next', 'later']);
    expect(annotateSchedule(events, at(10, 30)).map((e) => e.status)).toEqual(['done', 'next', 'later']);
    expect(annotateSchedule(events, at(18)).map((e) => e.status)).toEqual(['done', 'done', 'done']);
  });

  it('never invents a status for unparseable times and keeps the input intact', () => {
    const events = [{ id: 1, time: 'TBA', title: 'x' }];
    const out = annotateSchedule(events, at(9));
    expect(out[0]).toEqual({ id: 1, time: 'TBA', title: 'x', status: 'later' });
    expect(events[0].status).toBeUndefined();
    expect(annotateSchedule(null, at(9))).toEqual([]);
  });

  it('greets by local hour', () => {
    expect(greetingForHour(2)).toBe('Up late');
    expect(greetingForHour(9)).toBe('Good morning');
    expect(greetingForHour(14)).toBe('Good afternoon');
    expect(greetingForHour(20)).toBe('Good evening');
  });
});
