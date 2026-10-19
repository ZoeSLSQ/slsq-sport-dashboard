import express from 'express';
import cookieSession from 'cookie-session';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { parseEntriesWorkbook, EVENT_LABELS } from './parse.js';
import { buildSummary, DEFAULT_CONFIG } from './calc.js';
import * as store from './store.js';
import { fetchLive, liveConfigured } from './membership.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const PUBLIC = path.join(here, '..', 'public');
const prod = process.env.NODE_ENV === 'production';

// Passwords can be supplied as hashes (VIEWER_PASSWORD_HASH / ADMIN_PASSWORD_HASH)
// or as plain secrets (VIEWER_PASSWORD / ADMIN_PASSWORD, 12+ characters) which are hashed in memory at startup.
function hashFrom(hashVar, plainVar) {
  if (process.env[hashVar]) return process.env[hashVar];
  const plain = process.env[plainVar];
  return plain && plain.length >= 12 ? bcrypt.hashSync(plain, 12) : null;
}
const VIEWER_HASH = hashFrom('VIEWER_PASSWORD_HASH', 'VIEWER_PASSWORD');
const ADMIN_HASH = hashFrom('ADMIN_PASSWORD_HASH', 'ADMIN_PASSWORD');
const SECRET = process.env.SESSION_SECRET || (VIEWER_HASH && ADMIN_HASH ? crypto.createHash('sha256').update(`${VIEWER_HASH}|${ADMIN_HASH}`).digest('hex') : null);
if (!VIEWER_HASH || !ADMIN_HASH || !SECRET || SECRET.length < 24) {
  console.error('Set VIEWER_PASSWORD and ADMIN_PASSWORD (each 12+ characters) as secrets. See README.');
  process.exit(1);
}
const DUMMY = bcrypt.hashSync('not-a-real-password', 10);

const app = express();
app.set('trust proxy', 1);
app.disable('x-powered-by');

app.use((req, res, next) => {
  res.set({
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'same-origin',
    'Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; frame-ancestors 'none'",
  });
  next();
});
app.use(cookieSession({ name: 'sport', keys: [SECRET], httpOnly: true, sameSite: 'lax', secure: prod, maxAge: 8 * 60 * 60 * 1000 }));
app.use(express.urlencoded({ extended: false, limit: '10kb' }));
app.use(express.json({ limit: '200kb' }));

app.get('/health', (req, res) => res.send('ok'));

// ---------- login ----------
const fails = new Map(); // ip -> { n, until }
const tooMany = (ip) => (fails.get(ip)?.until ?? 0) > Date.now();

app.get('/login', (req, res) => res.sendFile(path.join(PUBLIC, 'login.html')));
app.get('/login.css', (req, res) => res.sendFile(path.join(PUBLIC, 'style.css')));
app.get('/login.js', (req, res) => res.sendFile(path.join(PUBLIC, 'login.js')));
app.post('/login', async (req, res) => {
  const ip = req.ip;
  if (tooMany(ip)) return res.status(429).redirect('/login?e=wait');
  const role = req.body.username === 'admin' ? 'admin' : req.body.username === 'viewer' ? 'viewer' : null;
  const hash = role === 'admin' ? ADMIN_HASH : role === 'viewer' ? VIEWER_HASH : DUMMY;
  const ok = await bcrypt.compare(String(req.body.password || ''), hash);
  if (ok && role) {
    fails.delete(ip);
    req.session = { role, at: Date.now() };
    return res.redirect('/');
  }
  const f = fails.get(ip) || { n: 0, until: 0 };
  f.n += 1;
  if (f.n >= 5) {
    f.until = Date.now() + 15 * 60 * 1000;
    f.n = 0;
  }
  fails.set(ip, f);
  res.redirect('/login?e=1');
});
app.post('/logout', (req, res) => {
  req.session = null;
  res.redirect('/login');
});

// ---------- everything below needs a login ----------
app.use((req, res, next) => {
  if (req.session?.role) return next();
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'Please sign in.' });
  res.redirect('/login');
});
const adminOnly = (req, res, next) => (req.session.role === 'admin' ? next() : res.status(403).json({ error: 'Admin only.' }));

function config() {
  return { ...DEFAULT_CONFIG, ...store.getConfig() };
}
function summary(role) {
  const cur = store.getCurrent();
  const s = buildSummary({
    parsed: cur.parsed,
    overrides: store.getOverrides(),
    membership: store.getMembership(),
    config: config(),
    benchmarks: store.getBenchmarks(),
    meta: { dataVersion: cur.version, filename: cur.filename, uploadedAt: cur.uploadedAt, uploadedBy: cur.uploadedBy, liveMembershipConfigured: liveConfigured() },
  });
  s.meta.role = role;
  return s;
}

app.get('/api/summary', (req, res) => res.json(summary(req.session.role)));

// ---------- admin: upload, preview, publish, history ----------
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 8 * 1024 * 1024, files: 1 } });

app.post('/api/admin/upload', adminOnly, upload.single('file'), async (req, res) => {
  try {
    if (!req.file) throw new Error('No file received.');
    if (!/\.xlsx$/i.test(req.file.originalname)) throw new Error('Please upload an .xlsx file.');
    const parsed = await parseEntriesWorkbook(req.file.buffer);
    const cur = store.getCurrent().parsed;
    const changes = [];
    for (const k of Object.keys(EVENT_LABELS)) {
      for (const y of parsed.years) {
        const a = cur.events[k]?.[y] ?? null;
        const b = parsed.events[k]?.[y] ?? null;
        if (a !== b) changes.push({ event: EVENT_LABELS[k], year: y, was: a, now: b });
      }
    }
    const previewId = store.savePreview({ parsed, filename: req.file.originalname });
    res.json({ previewId, filename: req.file.originalname, warnings: parsed.warnings, changeCount: changes.length, changes: changes.slice(0, 80), years: [parsed.years[0], parsed.years.at(-1)] });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

app.post('/api/admin/publish', adminOnly, (req, res) => {
  const pv = store.getPreview(String(req.body.previewId || ''));
  if (!pv) return res.status(400).json({ error: 'Preview not found. Upload the file again.' });
  const next = store.publish(pv.parsed, { filename: pv.filename, by: 'admin' });
  res.json({ ok: true, version: next.version });
});
app.get('/api/admin/history', adminOnly, (req, res) => res.json(store.history()));
app.post('/api/admin/rollback', adminOnly, (req, res) => {
  try {
    store.rollback(String(req.body.versionId || ''));
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
});

// ---------- admin: overrides (value + reason) ----------
app.post('/api/admin/override', adminOnly, (req, res) => {
  const { event, year, value, reason } = req.body;
  const y = Number(year);
  const v = Number(value);
  if (!EVENT_LABELS[event] || event === 'schoolLeague') return res.status(400).json({ error: 'Unknown event.' });
  if (!Number.isInteger(y) || y < 2000 || y > 2100) return res.status(400).json({ error: 'Invalid year.' });
  if (!Number.isInteger(v) || v <= 0 || v > 100000) return res.status(400).json({ error: 'Value must be a positive whole number.' });
  if (!String(reason || '').trim()) return res.status(400).json({ error: 'A reason is required.' });
  const list = store.getOverrides().filter((o) => !(o.event === event && o.year === y));
  list.push({ event, year: y, value: v, reason: String(reason).trim().slice(0, 300), at: new Date().toISOString(), by: 'admin' });
  store.setOverrides(list);
  res.json({ ok: true });
});
app.delete('/api/admin/override', adminOnly, (req, res) => {
  const y = Number(req.body.year);
  store.setOverrides(store.getOverrides().filter((o) => !(o.event === req.body.event && o.year === y)));
  res.json({ ok: true });
});

// ---------- admin: membership link ----------
const toNum = (v) => (v === '' || v == null ? null : Number.isFinite(Number(v)) && Number(v) >= 0 ? Math.round(Number(v)) : NaN);

app.post('/api/admin/membership', adminOnly, (req, res) => {
  const y = Number(req.body.year);
  if (!Number.isInteger(y) || y < 2000 || y > 2100) return res.status(400).json({ error: 'Invalid year.' });
  const rec = { juniorEligible: toNum(req.body.juniorEligible), activeMembers: toNum(req.body.activeMembers), totalMembers: toNum(req.body.totalMembers) };
  if (Object.values(rec).some(Number.isNaN)) return res.status(400).json({ error: 'Member counts must be whole numbers.' });
  const m = store.getMembership();
  if (Object.values(rec).every((v) => v == null)) delete m[y];
  else m[y] = { ...rec, source: 'manual', at: new Date().toISOString() };
  store.setMembership(m);
  res.json({ ok: true });
});

async function refreshLive() {
  const live = await fetchLive(config());
  const year = live.seasonYear || store.getCurrent().parsed.lastYear;
  const m = store.getMembership();
  if (m[year]?.source === 'manual') return { year, skipped: 'A manual entry exists for this season, so it was kept.', live };
  m[year] = { juniorEligible: live.juniorEligible, activeMembers: live.activeMembers, totalMembers: live.totalMembers, source: 'live', at: new Date().toISOString() };
  store.setMembership(m);
  return { year, live };
}
app.post('/api/admin/membership/refresh', adminOnly, async (req, res) => {
  try {
    res.json({ ok: true, ...(await refreshLive()) });
  } catch (e) {
    res.status(502).json({ error: e.message });
  }
});

app.post('/api/admin/config', adminOnly, (req, res) => {
  const a = Number(req.body.juniorMinAge);
  const b = Number(req.body.juniorMaxAge);
  if (![a, b].every(Number.isInteger) || a < 4 || b > 19 || a > b) return res.status(400).json({ error: 'Ages must be whole numbers between 4 and 19, minimum first.' });
  store.setConfig({ juniorMinAge: a, juniorMaxAge: b });
  res.json({ ok: true });
});

app.post('/api/admin/benchmarks', adminOnly, (req, res) => {
  const list = Array.isArray(req.body.rows) ? req.body.rows.slice(0, 20) : [];
  const clean = list
    .map((r) => ({ body: String(r.body || '').trim().slice(0, 80), note: String(r.note || '').trim().slice(0, 400), year: String(r.year || '').trim().slice(0, 12), value: String(r.value || '').trim().slice(0, 60) }))
    .filter((r) => r.body);
  store.setBenchmarks(clean);
  res.json({ ok: true });
});

// ---------- static front end ----------
app.use(express.static(PUBLIC, { index: 'index.html' }));

export { app };

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = process.env.PORT || 8080;
  app.listen(port, () => console.log(`SLSQ Sport dashboard listening on ${port}`));
  if (liveConfigured()) {
    const tick = () => refreshLive().catch((e) => console.warn('Membership refresh failed:', e.message));
    setTimeout(tick, 5000);
    setInterval(tick, 6 * 60 * 60 * 1000);
  }
}
