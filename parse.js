// Parses the "SLSQ Dashboard Statistics" workbook (entries by event, by year).
import ExcelJS from 'exceljs';

export const EVENT_LABELS = {
  juniors: 'Juniors',
  seniors: 'Seniors',
  masters: 'Masters',
  pool: 'Pool',
  surfRescue: 'Surf Rescue',
  irb: 'IRB',
  boardRiding: 'Board Riding',
  endurance: 'Endurance',
  northAussies: 'North Aussies',
  interbranch: 'Interbranch',
  schoolLeague: 'School Surf League',
};

function eventKey(label) {
  const l = String(label || '').toLowerCase();
  if (l.includes('north aussies')) return 'northAussies';
  if (l.includes('endurance')) return 'endurance';
  if (l.includes('interbranch')) return 'interbranch';
  if (l.includes('board riding')) return 'boardRiding';
  if (l.includes('surf rescue')) return 'surfRescue';
  if (l.includes('school')) return 'schoolLeague';
  if (l.includes('junior')) return 'juniors';
  if (l.includes('master')) return 'masters';
  if (l.includes('senior')) return 'seniors';
  if (l.includes('pool')) return 'pool';
  if (l.includes('irb')) return 'irb';
  if (l.includes('total entries')) return 'TOTAL';
  return null;
}

function cellText(cell) {
  const v = cell.value;
  if (v == null) return '';
  if (typeof v === 'object') {
    if (v.richText) return v.richText.map((r) => r.text).join('');
    if ('result' in v) return String(v.result ?? '');
    if ('text' in v) return String(v.text);
  }
  return String(cell.text ?? v);
}

function cellNumber(cell) {
  let v = cell.value;
  if (v && typeof v === 'object' && 'result' in v) v = v.result;
  if (v == null || v === '') return { n: null, raw: '' };
  if (typeof v === 'number') return { n: v, raw: String(v) };
  const raw = cellText(cell).trim();
  const m = raw.match(/^\s*(\d[\d,]*)/);
  return { n: m ? Number(m[1].replace(/,/g, '')) : null, raw };
}

export async function parseEntriesWorkbook(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const ws = wb.getWorksheet('Dashboard Summary') || wb.worksheets[0];
  if (!ws) throw new Error('The workbook has no sheets.');

  const warnings = [];
  let yearRow = null;
  ws.eachRow((row, r) => {
    if (!yearRow && String(cellText(row.getCell(1))).trim().toUpperCase() === 'YEAR') yearRow = r;
  });
  if (!yearRow) throw new Error('Could not find the YEAR header row. Is this the entries dashboard file?');

  const yearCols = {};
  ws.getRow(yearRow).eachCell((cell, c) => {
    if (c === 1) return;
    const y = parseInt(cellText(cell), 10);
    if (y >= 2000 && y <= 2100) yearCols[c] = y;
  });
  const years = Object.values(yearCols).sort((a, b) => a - b);
  if (years.length < 5) throw new Error('Found fewer than five year columns. Check the file layout.');

  const events = {};
  const flags = {}; // flags[event][year] = 'zero' | 'note'
  const fileTotals = {};
  const notes = {};
  const schoolRaw = {};
  const unknownRows = [];
  let afterTotals = false;

  ws.eachRow((row, r) => {
    if (r <= yearRow) return;
    const label = cellText(row.getCell(1)).trim();
    const key = eventKey(label);

    if (afterTotals) {
      // footnote row: text sitting under year columns
      row.eachCell((cell, c) => {
        const t = cellText(cell).trim();
        if (t && yearCols[c]) notes[yearCols[c]] = t;
      });
      return;
    }
    if (!label) return;
    if (/^entrants per event/i.test(label)) return;
    if (!key) {
      unknownRows.push(label);
      return;
    }
    if (key === 'TOTAL') {
      for (const [c, y] of Object.entries(yearCols)) {
        const { n } = cellNumber(row.getCell(Number(c)));
        if (n) fileTotals[y] = n;
      }
      afterTotals = true;
      return;
    }
    events[key] = {};
    flags[key] = {};
    for (const [c, y] of Object.entries(yearCols)) {
      const { n, raw } = cellNumber(row.getCell(Number(c)));
      if (key === 'schoolLeague' && raw) schoolRaw[y] = raw;
      if (n === null) {
        events[key][y] = null;
      } else if (n === 0) {
        events[key][y] = null; // zero means the event did not run
        flags[key][y] = 'zero';
      } else {
        events[key][y] = n;
      }
    }
  });

  if (unknownRows.length) warnings.push(`Rows not recognised and skipped: ${unknownRows.join('; ')}`);
  const required = ['juniors', 'seniors', 'masters', 'pool', 'surfRescue', 'irb', 'boardRiding'];
  for (const k of required) if (!events[k]) warnings.push(`Missing core event row: ${EVENT_LABELS[k]}`);

  // Years where a core event has no value, so the core total cannot be like-for-like.
  const lastYear = [...years].reverse().find((y) => required.some((k) => events[k]?.[y] != null));
  const notRun = Object.keys(events).filter((k) => k !== 'schoolLeague' && events[k][lastYear] == null);
  if (notRun.length) {
    warnings.push(`${lastYear}: no figures yet for ${notRun.map((k) => EVENT_LABELS[k]).join(', ')}. They will show as "not yet run".`);
  }

  return { years, events, flags, fileTotals, notes, schoolRaw, warnings, lastYear };
}
