// Usage: node scripts/make-seed.js path/to/SLSQ_DASHBOARD_STATISTICS.xlsx
import fs from 'node:fs';
import { parseEntriesWorkbook } from '../server/parse.js';

const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/make-seed.js <entries.xlsx>');
  process.exit(1);
}
const parsed = await parseEntriesWorkbook(fs.readFileSync(file));
const out = {
  version: 1,
  uploadedAt: new Date().toISOString(),
  uploadedBy: 'seed',
  filename: file.split('/').pop(),
  parsed,
};
fs.writeFileSync(new URL('../seed/seed.json', import.meta.url), JSON.stringify(out, null, 2));
console.log('Seed written. Years:', parsed.years[0], 'to', parsed.years.at(-1));
parsed.warnings.forEach((w) => console.log('WARNING:', w));
