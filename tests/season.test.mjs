import test from 'node:test';
import assert from 'node:assert/strict';
import { seasonForDate } from '../js/season.js';

test('January through June belong to the football year that started last July', () => {
  assert.deepEqual(seasonForDate(new Date('2027-01-15T12:00:00')), { year: 2026 });
  assert.deepEqual(seasonForDate(new Date('2026-06-30T12:00:00')), { year: 2025 });
});

test('a new football year starts on 1 July', () => {
  assert.deepEqual(seasonForDate(new Date('2026-07-01T12:00:00')), { year: 2026 });
  assert.deepEqual(seasonForDate(new Date('2026-07-30T12:00:00')), { year: 2026 });
});

test('the football year remains active through the following June', () => {
  assert.deepEqual(seasonForDate(new Date('2026-12-31T12:00:00')), { year: 2026 });
  assert.deepEqual(seasonForDate(new Date('2027-06-30T12:00:00')), { year: 2026 });
});
