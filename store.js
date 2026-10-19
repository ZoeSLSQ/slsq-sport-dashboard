// Small file-based store on the Fly volume (DATA_DIR). Writes are atomic.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const DATA_DIR = process.env.DATA_DIR || path.join(here, 'data');
// Works whether seed.json sits next to this file or in a seed/ folder.
const SEED = [path.join(here, 'seed.json'), path.join(here, 'seed', 'seed.json'), path.join(here, '..', 'seed', 'seed.json')].find((f) => fs.existsSync(f)) || path.join(here, 'seed.json');

for (const d of ['', 'versions', 'previews']) fs.mkdirSync(path.join(DATA_DIR, d), { recursive: true });

const p = (...a) => path.join(DATA_DIR, ...a);

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}
function writeJson(file, obj) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj, null, 2));
  fs.renameSync(tmp, file);
}

export function getCurrent() {
  let cur = readJson(p('current.json'), null);
  if (!cur) {
    cur = readJson(SEED, null);
    if (!cur) throw new Error('No data: seed/seed.json is missing. Run: npm run seed -- <entries.xlsx>');
    writeJson(p('current.json'), cur);
  }
  return cur;
}

export function publish(parsed, { filename, by }) {
  const prev = getCurrent();
  const id = Date.now().toString(36);
  writeJson(p('versions', `${id}.json`), { ...prev, versionId: prev.versionId || 'seed' }); // keep what we are replacing
  const next = { version: (prev.version || 0) + 1, versionId: id, uploadedAt: new Date().toISOString(), uploadedBy: by, filename, parsed };
  writeJson(p('current.json'), next);
  return next;
}

export function history() {
  const files = fs.readdirSync(p('versions')).filter((f) => f.endsWith('.json'));
  return files
    .map((f) => readJson(p('versions', f), null))
    .filter(Boolean)
    .map((v) => ({ versionId: v.versionId, version: v.version, uploadedAt: v.uploadedAt, uploadedBy: v.uploadedBy, filename: v.filename }))
    .sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)));
}

export function rollback(versionId) {
  const target = readJson(p('versions', `${versionId}.json`), null);
  if (!target) throw new Error('That version was not found.');
  const cur = getCurrent();
  writeJson(p('versions', `${Date.now().toString(36)}.json`), cur);
  writeJson(p('current.json'), { ...target, rolledBackAt: new Date().toISOString() });
}

export function savePreview(obj) {
  const id = crypto.randomBytes(8).toString('hex');
  writeJson(p('previews', `${id}.json`), obj);
  return id;
}
export function getPreview(id) {
  if (!/^[a-f0-9]{16}$/.test(id)) return null;
  return readJson(p('previews', `${id}.json`), null);
}

export const getOverrides = () => readJson(p('overrides.json'), []);
export const setOverrides = (o) => writeJson(p('overrides.json'), o);
export const getMembership = () => readJson(p('membership.json'), {});
export const setMembership = (m) => writeJson(p('membership.json'), m);
export const getConfig = () => readJson(p('config.json'), {});
export const setConfig = (c) => writeJson(p('config.json'), c);
export const getBenchmarks = () =>
  readJson(p('benchmarks.json'), [
    { body: 'Surf Life Saving Australia (Aussies)', note: 'Add the national entry figures and trend here.', year: '', value: '' },
    { body: 'Surf Life Saving NSW', note: 'Reported as growing. Add figures and source.', year: '', value: '' },
    { body: 'Surf Life Saving WA', note: 'Reported as growing. Add figures and source.', year: '', value: '' },
    { body: 'Life Saving South Australia', note: 'Reported as declining. Add figures and source.', year: '', value: '' },
    { body: 'Surf Life Saving Tasmania', note: 'Reported as declining. Add figures and source.', year: '', value: '' },
  ]);
export const setBenchmarks = (b) => writeJson(p('benchmarks.json'), b);
