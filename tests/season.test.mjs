import test from 'node:test';
import assert from 'node:assert/strict';
import { seasonForDate } from '../js/season.js';

test('January remains in the previous autumn season', () => {
  assert.deepEqual(seasonForDate(new Date('2027-01-15T12:00:00')), { year: 2026, half: 'Podzim' });
});

test('spring covers February through July of the current year', () => {
  assert.deepEqual(seasonForDate(new Date('2026-07-29T12:00:00')), { year: 2026, half: 'Jaro' });
});

test('autumn starts in August of the current year', () => {
  assert.deepEqual(seasonForDate(new Date('2026-08-01T12:00:00')), { year: 2026, half: 'Podzim' });
});
