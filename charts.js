// Tiny inline-SVG chart helpers. No external libraries.
export const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const fmt = (n) => (n == null ? 'n/a' : Number(n).toLocaleString('en-AU'));

const MAROON = '#6B1E2E';
const GOLD = '#C9A24B';
const GRID = '#E6DADD';
const MUTED = '#7A6A6E';

function niceMax(v) {
  // round the top of the axis so four equal ticks land on tidy numbers
  const raw = v / 4;
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * p).find((c) => c >= raw);
  return step * 4;
}

// points: [{year, value|null, covid, indicative}]
export function lineChart(points, { height = 260, label = 'entries', compact = false } = {}) {
  const W = compact ? 360 : 760;
  const H = compact ? 150 : height;
  const m = { l: compact ? 36 : 48, r: 14, t: 14, b: 26 };
  const vals = points.map((p) => p.value).filter((v) => v != null);
  if (!vals.length) return '<p class="muted">No data</p>';
  const max = niceMax(Math.max(...vals) * 1.05);
  const min = 0;
  const x = (i) => m.l + (points.length === 1 ? 0 : (i * (W - m.l - m.r)) / (points.length - 1));
  const y = (v) => H - m.b - ((v - min) / (max - min)) * (H - m.t - m.b);
  const ticks = 4;
  let g = '';
  for (let i = 0; i <= ticks; i++) {
    const v = (max / ticks) * i;
    g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="${GRID}"/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end" font-size="${compact ? 9 : 11}" fill="${MUTED}">${fmt(Math.round(v))}</text>`;
  }
  const step = compact ? Math.ceil(points.length / 6) : points.length > 14 ? 2 : 1;
  points.forEach((p, i) => {
    if (i % step === 0 || i === points.length - 1) g += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="${compact ? 9 : 11}" fill="${MUTED}">${compact ? String(p.year).slice(2) : p.year}</text>`;
  });
  // path with gaps where value is null
  let d = '';
  let pen = false;
  points.forEach((p, i) => {
    if (p.value == null) {
      pen = false;
      return;
    }
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.value).toFixed(1)} `;
    pen = true;
  });
  g += `<path d="${d}" fill="none" stroke="${MAROON}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>`;
  // dashed bridge across a COVID gap
  points.forEach((p, i) => {
    if (p.covid) {
      const a = points.slice(0, i).reverse().find((q) => q.value != null);
      const b = points.slice(i + 1).find((q) => q.value != null);
      if (a && b) g += `<line x1="${x(points.indexOf(a))}" y1="${y(a.value)}" x2="${x(points.indexOf(b))}" y2="${y(b.value)}" stroke="${MAROON}" stroke-width="1.5" stroke-dasharray="4 4" opacity=".55"/>`;
      g += `<text x="${x(i)}" y="${H - m.b - 6}" text-anchor="middle" font-size="${compact ? 8 : 10}" fill="${MUTED}">COVID</text>`;
    }
  });
  points.forEach((p, i) => {
    if (p.value == null) return;
    const ind = p.indicative;
    g += `<circle cx="${x(i)}" cy="${y(p.value)}" r="${compact ? 2.8 : 4}" fill="${ind ? '#fff' : MAROON}" stroke="${ind ? GOLD : MAROON}" stroke-width="${ind ? 2.5 : 1}"><title>${p.year}: ${fmt(p.value)} ${label}${ind ? ' (indicative)' : ''}${p.overridden ? ' (admin override)' : ''}</title></circle>`;
  });
  if (!compact) {
    const last = points.length - 1;
    points.forEach((p, i) => {
      if (p.value != null && (i === last || p.indicative || i === 0)) g += `<text x="${x(i)}" y="${y(p.value) - 9}" text-anchor="middle" font-size="11" font-weight="600" fill="${MAROON}">${fmt(p.value)}</text>`;
    });
  }
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Line chart of ${esc(label)} by year">${g}</svg>`;
}

// Index chart: several series rebased to 100 at their first shared year.
export function indexChart(years, series, { height = 240 } = {}) {
  const W = 760;
  const H = height;
  const m = { l: 48, r: 14, t: 14, b: 26 };
  const all = series.flatMap((s) => s.values.filter((v) => v != null));
  if (!all.length) return '<p class="muted">No data</p>';
  const lo = Math.floor(Math.min(...all, 100) / 10) * 10 - 5;
  const hi = Math.ceil(Math.max(...all, 100) / 10) * 10 + 5;
  const x = (i) => m.l + (years.length === 1 ? 0 : (i * (W - m.l - m.r)) / (years.length - 1));
  const y = (v) => H - m.b - ((v - lo) / (hi - lo)) * (H - m.t - m.b);
  let g = '';
  for (let v = Math.ceil(lo / 10) * 10; v <= hi; v += 10) g += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(v)}" y2="${y(v)}" stroke="${v === 100 ? MUTED : GRID}" ${v === 100 ? 'stroke-dasharray="3 3"' : ''}/><text x="${m.l - 6}" y="${y(v) + 4}" text-anchor="end" font-size="11" fill="${MUTED}">${v}</text>`;
  years.forEach((yr, i) => (g += `<text x="${x(i)}" y="${H - 8}" text-anchor="middle" font-size="11" fill="${MUTED}">${yr}</text>`));
  series.forEach((s) => {
    let d = '';
    s.values.forEach((v, i) => {
      if (v != null) d += `${d ? 'L' : 'M'}${x(i)},${y(v)} `;
    });
    g += `<path d="${d}" fill="none" stroke="${s.color}" stroke-width="2.4"/>`;
    s.values.forEach((v, i) => {
      if (v != null) g += `<circle cx="${x(i)}" cy="${y(v)}" r="3.6" fill="${s.color}"><title>${esc(s.name)} ${years[i]}: ${v.toFixed(1)}</title></circle>`;
    });
  });
  return `<svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Index chart, first year = 100">${g}</svg>`;
}

export function barRows(rows) {
  // rows: [{label, value, pct}] horizontal bars for share of entries
  const max = Math.max(...rows.map((r) => r.pct || 0), 1);
  return rows
    .map((r) => `<div style="display:grid;grid-template-columns:110px 1fr 70px;gap:10px;align-items:center;margin:6px 0">
      <span class="small">${esc(r.label)}</span>
      <span style="background:#F3E6E9;border-radius:6px;height:14px;display:block"><span style="display:block;height:14px;border-radius:6px;background:${MAROON};width:${((r.pct || 0) / max) * 100}%"></span></span>
      <span class="small" style="text-align:right">${r.pct == null ? 'n/a' : r.pct.toFixed(1) + '%'}</span></div>`)
    .join('');
}
