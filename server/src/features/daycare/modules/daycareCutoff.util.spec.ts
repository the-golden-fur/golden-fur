import { describe, expect, it } from 'vitest';
import {
  formatDaycareCutoff,
  resolveDaycareCutoffTime,
} from './daycareCutoff.util.ts';

describe('daycareCutoff.util', () => {
  describe('resolveDaycareCutoffTime', () => {
    it('is two hours before the closing time set for the day', () => {
      expect(resolveDaycareCutoffTime('21:00')).toBe('19:00');
      expect(resolveDaycareCutoffTime('18:30')).toBe('16:30');
    });

    it('accepts an HH:MM:SS closing time', () => {
      expect(resolveDaycareCutoffTime('20:00:00')).toBe('18:00');
    });

    it('never goes before midnight', () => {
      expect(resolveDaycareCutoffTime('01:00')).toBe('00:00');
    });
  });

  describe('formatDaycareCutoff', () => {
    it('reads as a 12-hour clock time', () => {
      expect(formatDaycareCutoff('19:00')).toBe('7:00 PM');
      expect(formatDaycareCutoff('16:00:00')).toBe('4:00 PM');
    });
  });
});
