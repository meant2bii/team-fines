import test from 'node:test';
import assert from 'node:assert/strict';
import { parseVoiceChunk, parseVoiceTranscript, resolveVoicePlayer, suggestVoiceReasons } from '../js/voice.js';

const players = [
  { name: 'Michal Novák', nicknames: ['Míša', 'Bago'] },
  { name: 'Lukáš Teichmann', nicknames: ['Teichi'] },
  { name: 'Pavel Malý', nicknames: [] },
  { name: 'Pavel Velký', nicknames: [] },
];
const reasons = [
  { label: 'Bago', price: 100 },
  { label: 'Píčovina', price: 200 },
];

test('parses a nickname, catalogue reason and spoken amount', () => {
  const fine = parseVoiceChunk('Míša Bago sto', players, reasons);
  assert.equal(fine.resolution.player, 'Michal Novák');
  assert.equal(fine.reason, 'Bago');
  assert.equal(fine.amount, 100);
  assert.deepEqual(fine.issues, []);
});

test('uses catalogue price when the amount is intentionally omitted', () => {
  const fine = parseVoiceChunk('Teichi Píčovina', players, reasons);
  assert.equal(fine.resolution.player, 'Lukáš Teichmann');
  assert.equal(fine.amount, 200);
  assert.equal(fine.usedCatalogPrice, true);
});

test('splits a spoken batch using the explicit další separator', () => {
  const fines = parseVoiceTranscript('Míša Bago sto další Teichi Píčovina dvě stě', players, reasons);
  assert.equal(fines.length, 2);
  assert.deepEqual(fines.map(f => f.resolution.player), ['Michal Novák', 'Lukáš Teichmann']);
  assert.deepEqual(fines.map(f => f.amount), [100, 200]);
});

test('keeps an unknown player unresolved instead of inventing a player', () => {
  const fine = parseVoiceChunk('Neznámý Bago sto', players, reasons);
  assert.equal(fine.resolution.player, null);
  assert.ok(fine.issues.includes('player'));
});

test('refuses an ambiguous player match', () => {
  const result = resolveVoicePlayer('Pavel', players);
  assert.equal(result.status, 'ambiguous');
  assert.equal(result.player, null);
});

test('keeps an amount said with korun out of the reason', () => {
  const fine = parseVoiceChunk('Michal Novák 22 korun', players, reasons);
  assert.equal(fine.resolution.player, 'Michal Novák');
  assert.equal(fine.reason, '');
  assert.equal(fine.amount, 22);
});

test('keeps punctuated spoken amounts out of reasons in a multi-fine batch', () => {
  const fines = parseVoiceTranscript('Míša 30 korun, Teichi 50 korun.', players, reasons);
  assert.equal(fines.length, 2);
  assert.deepEqual(fines.map(f => f.resolution.player), ['Michal Novák', 'Lukáš Teichmann']);
  assert.deepEqual(fines.map(f => f.reason), ['', '']);
  assert.deepEqual(fines.map(f => f.amount), [30, 50]);
});

test('suggests close catalogue reasons without silently replacing the spoken text', () => {
  const catalog = [
    { label: 'Bago – deset přihrávek', price: 30 },
    { label: 'Bago – devátá pokažená přihrávka', price: 30 },
  ];
  const fine = parseVoiceChunk('Míša blogo 50', players, catalog);
  assert.equal(fine.reason, 'blogo');
  assert.deepEqual(fine.reasonCandidates.map(item => item.label), catalog.map(item => item.label));
  assert.deepEqual(suggestVoiceReasons('blogo', catalog).map(item => item.price), [30, 30]);
  assert.equal(fine.amount, 50);
});

test('další separates entries and konec ends the voice batch', () => {
  const fines = parseVoiceTranscript('Míša 22 korun další Teichi 30 konec Míša 99', players, reasons);
  assert.equal(fines.length, 2);
  assert.deepEqual(fines.map(f => f.amount), [22, 30]);
});

test('supports the spoken separators used during a continuous entry', () => {
  const separators = ['středník', 'dále', 'a další', 'ještě', 'plus', 'navíc', 'a také', 'taky'];
  for (const separator of separators) {
    const fines = parseVoiceTranscript(`Míša 20 ${separator} Teichi 30`, players, reasons);
    assert.equal(fines.length, 2, separator);
  }
});
