/**
 * Tests for formatters utility functions.
 */

import { describe, it, expect } from 'vitest';
import { formatDateISO, formatDateLocale, formatDuration } from '../../src/utils/formatters.js';

describe('formatDateISO', () => {
  it('should format a date as YYYY-MM-DD', () => {
    const date = new Date('2024-03-15T10:30:00Z');
    expect(formatDateISO(date)).toBe('2024-03-15');
  });

  it('should handle dates at midnight', () => {
    const date = new Date('2024-01-01T00:00:00Z');
    expect(formatDateISO(date)).toBe('2024-01-01');
  });

  it('should handle dates at end of day', () => {
    const date = new Date('2024-12-31T23:59:59.999Z');
    expect(formatDateISO(date)).toBe('2024-12-31');
  });

  it('should handle leap year dates', () => {
    const date = new Date('2024-02-29T12:00:00Z');
    expect(formatDateISO(date)).toBe('2024-02-29');
  });

  it('should handle epoch date', () => {
    const date = new Date('1970-01-01T00:00:00Z');
    expect(formatDateISO(date)).toBe('1970-01-01');
  });

  it('should handle future dates', () => {
    const date = new Date('2099-12-31T23:59:59Z');
    expect(formatDateISO(date)).toBe('2099-12-31');
  });

  it('should handle single-digit month and day', () => {
    const date = new Date('2024-01-05T10:00:00Z');
    expect(formatDateISO(date)).toBe('2024-01-05');
  });
});

describe('formatDateLocale', () => {
  it('should format an ISO string with locale formatting', () => {
    const isoString = '2024-03-15T10:30:00Z';
    const result = formatDateLocale(isoString);
    // Result varies by locale, but should contain key parts
    expect(result).toContain('2024');
    expect(result).toMatch(/Mar|3/); // Month in some form
    expect(result).toMatch(/15/); // Day
  });

  it('should handle date-only ISO string', () => {
    const isoString = '2024-03-15';
    const result = formatDateLocale(isoString);
    expect(result).toContain('2024');
    expect(result).toMatch(/Mar|3/);
    // Date may vary by timezone (14 or 15), just verify it's a valid day
    expect(result).toMatch(/1[45]/);
  });

  it('should handle ISO string with timezone offset', () => {
    const isoString = '2024-03-15T10:30:00+05:00';
    const result = formatDateLocale(isoString);
    expect(result).toContain('2024');
  });

  it('should handle ISO string with milliseconds', () => {
    const isoString = '2024-03-15T10:30:00.123Z';
    const result = formatDateLocale(isoString);
    expect(result).toContain('2024');
  });

  it('should handle epoch timestamp string', () => {
    const isoString = '1970-01-01T00:00:00Z';
    const result = formatDateLocale(isoString);
    // In timezones behind UTC, the date may show as Dec 31, 1969
    expect(result).toMatch(/1969|1970/);
    expect(result).toMatch(/Dec|Jan|12|1/);
  });
});

describe('formatDuration', () => {
  describe('milliseconds range (< 1000ms)', () => {
    it('should format 0ms', () => {
      expect(formatDuration(0)).toBe('0ms');
    });

    it('should format 1ms', () => {
      expect(formatDuration(1)).toBe('1ms');
    });

    it('should format 500ms', () => {
      expect(formatDuration(500)).toBe('500ms');
    });

    it('should format 999ms', () => {
      expect(formatDuration(999)).toBe('999ms');
    });
  });

  describe('seconds range (1000ms - 59999ms)', () => {
    it('should format exactly 1000ms as seconds', () => {
      expect(formatDuration(1000)).toBe('1.0s');
    });

    it('should format 1500ms with decimal', () => {
      expect(formatDuration(1500)).toBe('1.5s');
    });

    it('should format 30000ms', () => {
      expect(formatDuration(30000)).toBe('30.0s');
    });

    it('should format 59999ms (just under 1 minute)', () => {
      expect(formatDuration(59999)).toBe('60.0s');
    });

    it('should format 1234ms with proper decimal', () => {
      expect(formatDuration(1234)).toBe('1.2s');
    });
  });

  describe('minutes range (>= 60000ms)', () => {
    it('should format exactly 60000ms as 1 minute', () => {
      expect(formatDuration(60000)).toBe('1m 0s');
    });

    it('should format 90000ms as 1m 30s', () => {
      expect(formatDuration(90000)).toBe('1m 30s');
    });

    it('should format 120000ms as 2m 0s', () => {
      expect(formatDuration(120000)).toBe('2m 0s');
    });

    it('should format 5 minutes 45 seconds', () => {
      expect(formatDuration(345000)).toBe('5m 45s');
    });

    it('should format large durations (1 hour)', () => {
      expect(formatDuration(3600000)).toBe('60m 0s');
    });

    it('should format very large durations (2 hours)', () => {
      expect(formatDuration(7200000)).toBe('120m 0s');
    });
  });

  describe('edge cases', () => {
    it('should handle floating point milliseconds by truncation', () => {
      // formatDuration expects integer ms, but should handle floats gracefully
      expect(formatDuration(1500.5)).toBe('1.5s');
    });

    it('should handle boundary at 999.999ms', () => {
      // 999.999 < 1000, so stays in milliseconds format
      expect(formatDuration(999.999)).toBe('999.999ms');
    });
  });
});
