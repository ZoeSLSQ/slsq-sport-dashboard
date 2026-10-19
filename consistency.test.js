import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildSummary, CORE } from '../server/calc.js';
import { adapt } from '../server/membership.js';

const seed = JSON.parse(fs.readFileSync(new URL('../seed/seed.json', import.meta.url)));
const S = buildSummary({ parsed: seed.parsed });

test('Board Summary core total equals the sum of the seven core event cards', () => {
  const sum = S.events.filter((e) => e.core).reduce((a, e) => a + e.latestValue, 0);
  assert.equal(S.events.filter((e) => e.core).length, CORE.length);
  assert.equal(S.board.currentCore, sum);
});

test('Concentration shares add to about 100% and match the board total', () => {
  const total = S.concentration.reduce((a, c) => a + c.entries, 0);
  assert.equal(total, S.board.currentCore);
  const pct = S.concentration.reduce((a, c) => a + c.sharePct, 0);
  assert.ok(Math.abs(pct - 100) < 0.5);
});

test('Latest chart point equals the headline figure', () => {
  assert.equal(S.board.series.at(-1).value, S.board.currentCore);
});

test('Known figures from the source file', () => {
  assert.equal(S.board.latestYear, 2026);
  assert.equal(S.board.currentCore, 3613);
  assert.equal(S.board.vs2024.base, 4137);
  assert.equal(S.board.vs2021.base, 4264);
  assert.equal(S.board.vs2025.base, 3706);
  assert.equal(S.board.vs2024.changePct, -12.7);
  assert.equal(S.board.vs2021.changePct, -15.3);
});

test('Years with matching totals reconcile to the source file exactly', () => {
  for (const r of S.reconciliation.filter((x) => x.year >= 2019)) {
    if (r.year === 2019 || r.year >= 2020) assert.equal(r.difference, 0, `year ${r.year}`);
  }
});

test('COVID year has no core total; blanks are never treated as zero', () => {
  assert.equal(S.board.series.find((p) => p.year === 2020).value, null);
  const endurance = S.events.find((e) => e.key === 'endurance');
  assert.equal(endurance.notYetRun, true);
  assert.equal(endurance.latestYear, 2025);
});

test('2025 is marked indicative', () => {
  assert.equal(S.board.series.find((p) => p.year === 2025).indicative, true);
  assert.equal(S.board.vs2025.indicative, true);
});

test('Admin override changes every page through the single calculation', () => {
  const o = buildSummary({ parsed: seed.parsed, overrides: [{ event: 'juniors', year: 2026, value: 1400, reason: 'test' }] });
  assert.equal(o.board.currentCore, 3613 - 1308 + 1400);
  assert.equal(o.events.find((e) => e.key === 'juniors').latestValue, 1400);
  assert.equal(o.board.series.at(-1).value, o.board.currentCore);
});

test('Participation rate uses entries and eligible members', () => {
  const m = { 2025: { juniorEligible: 10000, activeMembers: 8000, source: 'manual' }, 2026: { juniorEligible: 10000, activeMembers: 8000, source: 'manual' } };
  const P = buildSummary({ parsed: seed.parsed, membership: m }).participation;
  const r = P.rows.find((x) => x.year === 2026);
  assert.equal(r.juniorRatePct, 13.1);
  assert.equal(r.adultRatePct, Math.round(((981 + 550) / 8000) * 1000) / 10);
  assert.equal(P.diagnoses[0].kind, 'pathway');
});

test('Membership adapter reads juniorAgeGroups arrays and maps', () => {
  const cfg = { juniorMinAge: 8, juniorMaxAge: 14 };
  const a = adapt({ juniorAgeGroups: [{ label: 'Under 6', count: 100 }, { label: 'Under 8', count: 200 }, { label: 'Under 14', count: 300 }, { label: 'Under 15', count: 50 }] }, cfg);
  assert.equal(a.juniorEligible, 500);
  const b = adapt({ juniorAgeGroups: { 'Under 9': 10, 'Under 10': 20 }, season: '2025/2026' }, cfg);
  assert.equal(b.juniorEligible, 30);
  assert.equal(b.seasonYear, 2026);
  assert.throws(() => adapt({}, cfg));
});
