import { describe, it, expect } from 'vitest';
import {
  formatAge,
  formatDuration,
  formatFileSize,
  formatStatus,
  formatTimeRange,
  formatDueDate,
  titleCase,
} from './formatters';

describe('formatAge', () => {
  it('turns long ages into hours and days instead of a huge minute count', () => {
    expect(formatAge(0)).toBe('Just now');
    expect(formatAge(5)).toBe('5 min ago');
    expect(formatAge(125)).toBe('2 h ago');
    expect(formatAge(3098)).toBe('2 d ago');
  });

  it('never prints NaN for a missing age', () => {
    expect(formatAge(undefined)).toBe('Recently');
    expect(formatAge(NaN)).toBe('Recently');
  });
});

describe('formatDuration', () => {
  it('formats minutes, whole hours and mixed durations', () => {
    expect(formatDuration(45)).toBe('45 min');
    expect(formatDuration(120)).toBe('2 h');
    expect(formatDuration(90)).toBe('1 h 30 min');
  });

  it('returns an empty string for invalid input', () => {
    expect(formatDuration(undefined)).toBe('');
    expect(formatDuration(-5)).toBe('');
  });
});

describe('formatFileSize', () => {
  it('scales units and keeps one decimal below 10', () => {
    expect(formatFileSize(512)).toBe('512 B');
    expect(formatFileSize(4400000)).toBe('4.2 MB');
    expect(formatFileSize(25 * 1024 * 1024)).toBe('25 MB');
  });

  it('returns an empty string when there is no size', () => {
    expect(formatFileSize(null)).toBe('');
    expect(formatFileSize(0)).toBe('');
  });
});

describe('formatStatus / titleCase', () => {
  it('humanises snake_case values', () => {
    expect(formatStatus('in_progress')).toBe('In progress');
    expect(formatStatus('')).toBe('');
    expect(titleCase('shared_auto')).toBe('Shared Auto');
  });
});

describe('date helpers', () => {
  it('renders a time range with upper-case meridiems', () => {
    const start = new Date(2026, 9, 28, 9, 0).getTime();
    const end = new Date(2026, 9, 28, 10, 30).getTime();
    expect(formatTimeRange(start, end)).toBe('09:00 AM – 10:30 AM');
  });

  it('labels a missing due date instead of printing "Invalid Date"', () => {
    expect(formatDueDate(undefined)).toBe('No due date');
  });
});
