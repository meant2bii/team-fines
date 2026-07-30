import test from 'node:test';
import assert from 'node:assert/strict';
import { seasonForDate } from '../js/season.js';

test('spring covers January through June of the current year', () => {
  assert.deepEqual(seasonForDate(new Date('2027-01-15T12:00:00')), { year: 2027, half: 'Jaro' });
  assert.deepEqual(seasonForDate(new Date('2026-06-30T12:00:00')), { year: 2026, half: 'Jaro' });
});

test('autumn starts on 1 July of the current year', () => {
  assert.deepEqual(seasonForDate(new Date('2026-07-01T12:00:00')), { year: 2026, half: 'Podzim' });
  assert.deepEqual(seasonForDate(new Date('2026-07-30T12:00:00')), { year: 2026, half: 'Podzim' });
});

test('autumn remains active through the end of December', () => {
  assert.deepEqual(seasonForDate(new Date('2026-12-31T12:00:00')), { year: 2026, half: 'Podzim' });
});
