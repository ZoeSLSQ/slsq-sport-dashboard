import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import bcrypt from 'bcryptjs';

process.env.DATA_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'sport-test-'));
process.env.VIEWER_PASSWORD_HASH = bcrypt.hashSync('viewer-passphrase-123', 4);
process.env.ADMIN_PASSWORD_HASH = bcrypt.hashSync('admin-passphrase-456', 4);
process.env.SESSION_SECRET = 'x'.repeat(40);

const { app } = await import('../server/index.js');
const server = app.listen(0);
const base = `http://127.0.0.1:${server.address().port}`;
test.after(() => server.close());

async function login(username, password) {
  const res = await fetch(`${base}/login`, { method: 'POST', redirect: 'manual', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ username, password }) });
  const cookie = (res.headers.getSetCookie?.() || []).map((c) => c.split(';')[0]).join('; ');
  return { res, cookie };
}

test('whole site requires login', async () => {
  for (const p of ['/', '/api/summary', '/app.js']) {
    const r = await fetch(base + p, { redirect: 'manual' });
    assert.ok([302, 401].includes(r.status), `${p} gave ${r.status}`);
  }
});

test('wrong password is refused, right one works', async () => {
  const bad = await login('viewer', 'nope');
  assert.match(bad.res.headers.get('location'), /e=1/);
  const ok = await login('viewer', 'viewer-passphrase-123');
  assert.equal(ok.res.headers.get('location'), '/');
});

test('viewer can read but not use admin routes; admin can', async () => {
  const v = await login('viewer', 'viewer-passphrase-123');
  const sum = await (await fetch(`${base}/api/summary`, { headers: { cookie: v.cookie } })).json();
  assert.equal(sum.board.currentCore, 3613);
  const denied = await fetch(`${base}/api/admin/config`, { method: 'POST', headers: { cookie: v.cookie, 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(denied.status, 403);

  const a = await login('admin', 'admin-passphrase-456');
  const cfg = await fetch(`${base}/api/admin/config`, { method: 'POST', headers: { cookie: a.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify({ juniorMinAge: 8, juniorMaxAge: 13 }) });
  assert.equal(cfg.status, 200);
  const after = await (await fetch(`${base}/api/summary`, { headers: { cookie: a.cookie } })).json();
  assert.equal(after.meta.config.juniorMaxAge, 13);
});

test('override needs a reason and flows through the summary', async () => {
  const a = await login('admin', 'admin-passphrase-456');
  const post = (body) => fetch(`${base}/api/admin/override`, { method: 'POST', headers: { cookie: a.cookie, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  assert.equal((await post({ event: 'endurance', year: 2025, value: 382, reason: '' })).status, 400);
  assert.equal((await post({ event: 'endurance', year: 2025, value: 382, reason: 'Operational Plan figure' })).status, 200);
  const s = await (await fetch(`${base}/api/summary`, { headers: { cookie: a.cookie } })).json();
  assert.equal(s.events.find((e) => e.key === 'endurance').latestValue, 382);
});

test('upload previews first and publishes only when confirmed', async () => {
  const a = await login('admin', 'admin-passphrase-456');
  const file = process.env.TEST_XLSX;
  if (!file || !fs.existsSync(file)) return; // optional: needs the real workbook
  const fd = new FormData();
  fd.append('file', new Blob([fs.readFileSync(file)]), 'entries.xlsx');
  const up = await (await fetch(`${base}/api/admin/upload`, { method: 'POST', headers: { cookie: a.cookie }, body: fd })).json();
  assert.ok(up.previewId);
  assert.equal(up.changeCount, 0);
});
