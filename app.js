import { esc, fmt, lineChart, indexChart, barRows } from './charts.js';

let S = null; // the one summary object from /api/summary. Pages only display it.
const app = document.getElementById('app');

async function api(path, method = 'GET', body) {
  const opt = { method, headers: {} };
  if (body instanceof FormData) opt.body = body;
  else if (body) {
    opt.headers['Content-Type'] = 'application/json';
    opt.body = JSON.stringify(body);
  }
  const res = await fetch(path, opt);
  if (res.status === 401) location.href = '/login';
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
  return data;
}
async function load() {
  S = await api('/api/summary');
}

const pctTxt = (n) => (n == null ? 'n/a' : `${n > 0 ? '+' : ''}${n.toFixed(1)}%`);
const cls = (n) => (n == null ? '' : n < 0 ? 'dn' : 'up');
const IND = '<span class="chip">indicative</span>';

// ---------- pages ----------
function board() {
  const b = S.board;
  const L = b.latestYear;
  const delta = (d, extra = '') => `<div class="delta"><span class="label">vs ${d.year}${extra}</span>
    <b class="${cls(d.changePct)}">${pctTxt(d.changePct)}</b><small>${fmt(d.base)} entries</small></div>`;
  const tiles = S.events
    .map((e) => {
      const pending = e.notYetRun;
      const status = pending ? 'grey' : e.status;
      const pill = pending ? `Awaiting ${L}` : e.vs2024.changePct == null ? 'n/a' : pctTxt(e.vs2024.changePct) + ` vs ${S.rules.baseYear}`;
      const sub = pending
        ? `${fmt(e.latestValue)} in ${e.latestYear}${e.indicativeLatest ? ' (indicative)' : ''}. ${L} not yet run.`
        : `${L}${e.fiveYear.changePct != null ? `, ${pctTxt(e.fiveYear.changePct)} vs ${e.fiveYear.year}` : ''}`;
      return `<div class="card tile ${status}"><span class="label">${esc(e.label)}</span>
        <span class="n">${pending ? '' : fmt(e.latestValue)}</span><span><span class="pill ${status}">${esc(pill)}</span></span>
        <span class="small muted">${esc(sub)}</span></div>`;
    })
    .join('');
  const a = b.allEvents;
  return `
  <div class="page-title"><h1>Board Summary</h1></div>
  <p class="sub">Entries across the State Championship events. Data from ${esc(S.meta.filename)} (version ${S.meta.dataVersion}).</p>
  <div class="hero">
    <div class="card"><span class="label">Core events entries, ${L}</span><div class="big">${fmt(b.currentCore)}</div>
      <p class="small muted" style="margin:10px 0 0">Seven core events: ${esc(b.coreEvents.join(', '))}. These are the events that have run in ${L}, so comparisons are like for like.</p></div>
    <div class="card"><span class="label">Change in core entries</span>
      <div class="deltas" style="margin-top:8px">${delta(b.vs2025, ' ' + IND)}${delta(b.vs2024)}${delta(b.vs2021)}</div>
      <p class="small muted" style="margin:10px 0 0">${esc(S.rules.indicativeNote)}.</p></div>
  </div>
  <div class="card"><span class="label">What the numbers say</span><ul class="heads">${S.headlines.map((h) => `<li>${esc(h)}</li>`).join('')}</ul></div>
  <div class="section"><h2>By event</h2>
    <div class="grid g3">${tiles}</div>
    <p class="small muted">Colour shows change against ${S.rules.baseYear}: green is within ${Math.abs(S.rules.statusRules.greenAtOrAbove)}% or growing, orange is down ${Math.abs(S.rules.statusRules.greenAtOrAbove)} to ${Math.abs(S.rules.statusRules.orangeAtOrAbove)}%, red is down more than ${Math.abs(S.rules.statusRules.orangeAtOrAbove)}%. Grey means the event has not run yet this year.</p></div>
  <div class="section"><h2>Core entries since ${S.rules.trendStart}</h2>
    <div class="card chart">${lineChart(b.series, { label: 'core entries' })}
      <div class="legend"><span><i style="background:#6B1E2E"></i>Actual</span><span><i style="background:#fff;border:2px solid #C9A24B"></i>Indicative (${S.rules.indicativeYears.join(', ')}: TC Alfred cancellations)</span><span>Dashed line bridges ${S.rules.covidYears.join(', ')} (COVID, no State Titles for three events)</span></div></div></div>
  <div class="section"><h2>All events total (shown separately)</h2>
    <div class="card"><b style="font-size:22px">${fmt(a.total)}</b> entries in ${a.year}
      <p class="small muted" style="margin:6px 0 0">${a.missing.length ? `Not yet included because they have not run: ${esc(a.missing.join(', '))}. ` : ''}This total is not used for trends. Core entries above are the like-for-like measure. School league figures are excluded.</p></div></div>`;
}

function events() {
  const cards = S.events
    .map((e) => {
      const status = e.notYetRun ? 'grey' : e.status;
      return `<div class="card"><div style="display:flex;justify-content:space-between;gap:8px;align-items:start">
        <div><h3>${esc(e.label)}</h3><span class="small muted">${e.core ? 'Core event' : 'Not in core total'} since ${e.firstYear}</span></div>
        <span class="pill ${status}">${e.notYetRun ? `Awaiting ${S.board.latestYear}` : pctTxt(e.vs2024.changePct) + ` vs ${S.rules.baseYear}`}</span></div>
        <div style="margin:10px 0"><span style="font-size:30px;font-weight:700;color:var(--maroon)">${fmt(e.latestValue)}</span>
          <span class="muted small"> in ${e.latestYear}${e.indicativeLatest ? ' (indicative)' : ''}${e.notYetRun ? `, ${S.board.latestYear} not yet run` : ''}</span></div>
        <div class="chart">${lineChart(e.series, { compact: true, label: e.label + ' entries' })}</div>
        <table style="margin-top:8px"><tbody>
          <tr><td>Change vs ${e.fiveYear.year} (five years)</td><td class="r"><b>${pctTxt(e.fiveYear.changePct)}</b></td></tr>
          <tr><td>Change vs ${S.rules.baseYear}</td><td class="r"><b>${pctTxt(e.vs2024.changePct)}</b></td></tr>
          ${e.share != null ? `<tr><td>Share of core entries</td><td class="r"><b>${e.share.toFixed(1)}%</b></td></tr>` : ''}
        </tbody></table></div>`;
    })
    .join('');
  return `<div class="page-title"><h1>Events</h1></div>
  <p class="sub">Entries by State Championship event. Hover a point to see the exact figure.</p>
  <div class="grid g2">${cards}</div>
  <p class="small muted" style="margin-top:14px">${esc(S.interbranch.label)} is a fixed team number (${fmt(S.interbranch.value)}) so it is not judged here.</p>`;
}

function participation() {
  const P = S.participation;
  const rows = P.rows;
  const body = rows.length
    ? rows
        .map((r) => `<tr><td>${esc(r.season)}</td><td class="r">${fmt(r.juniorEntries)}</td><td class="r">${fmt(r.juniorEligible)}</td><td class="r"><b>${r.juniorRatePct == null ? 'n/a' : r.juniorRatePct + '%'}</b></td>
          <td class="r">${fmt(r.seniorMasterEntries)}</td><td class="r">${fmt(r.activeMembers)}</td><td class="r"><b>${r.adultRatePct == null ? 'n/a' : r.adultRatePct + '%'}</b></td>
          <td>${esc(r.source)}</td></tr>`)
        .join('')
    : '<tr><td colspan="8" class="muted">No membership figures yet. An Admin can connect the membership dashboard or enter them on the Admin page.</td></tr>';

  const idx = (key, memKey) => {
    const pts = rows.filter((r) => r[key] != null && r[memKey] != null);
    if (pts.length < 2) return null;
    const a = pts[0];
    return { years: pts.map((r) => r.season), entries: pts.map((r) => (r[key] / a[key]) * 100), members: pts.map((r) => (r[memKey] / a[memKey]) * 100) };
  };
  const chart = (title, d, memName) =>
    d
      ? `<div class="card chart"><h3 style="margin-bottom:6px">${title}</h3>${indexChart(d.years, [{ name: 'Entries', color: '#6B1E2E', values: d.entries }, { name: memName, color: '#C9A24B', values: d.members }])}
        <div class="legend"><span><i style="background:#6B1E2E"></i>Entries</span><span><i style="background:#C9A24B"></i>${esc(memName)}</span><span>First season shown = 100</span></div></div>`
      : `<div class="card"><h3>${title}</h3><p class="muted small">Needs membership figures for at least two seasons.</p></div>`;
  const diag = P.diagnoses
    .map((d) => `<div class="card"><span class="label">${esc(d.label)}</span><p style="margin:6px 0 4px"><b>${esc(d.text)}</b></p>${d.entriesChangePct != null ? `<span class="small muted">${esc(d.from)} to ${esc(d.to)}: entries ${pctTxt(d.entriesChangePct)}, members ${pctTxt(d.membershipChangePct)}</span>` : ''}</div>`)
    .join('');
  return `<div class="page-title"><h1>Participation rate</h1></div>
  <p class="sub">Entries compared with the members who could enter. This separates fewer members from members competing less.</p>
  <div class="grid g2">${diag}</div>
  <div class="section"><div class="card" style="overflow:auto"><table><thead><tr><th>Season</th><th class="r">Junior entries</th><th class="r">Eligible juniors</th><th class="r">Rate</th><th class="r">Senior + Masters entries</th><th class="r">Active members</th><th class="r">Rate</th><th>Source</th></tr></thead><tbody>${body}</tbody></table>
    <p class="small muted" style="margin:10px 0 0">Eligible juniors: ${esc(P.juniorEligibleRule)}. Adult base: ${esc(P.adultBase)}. Rates are entries divided by members, so one person entering several events counts more than once. Each sport year is matched to the season it falls in (for example ${S.board.latestYear} entries use the ${S.board.latestYear - 1}/${String(S.board.latestYear).slice(2)} season).</p></div></div>
  <div class="section grid g2">${chart('Juniors: entries vs eligible members', idx('juniorEntries', 'juniorEligible'), 'Eligible juniors')}${chart('Seniors and Masters: entries vs active members', idx('seniorMasterEntries', 'activeMembers'), 'Active members')}</div>
  <div class="section"><div class="note"><b>Age group view (coming).</b> The entries file holds one Juniors figure, not entries by age group. Once an export by age group is available, this page can show participation for each age group, which is the clearest way to see where young members drop out.</div></div>`;
}

function benchmarks() {
  const rows = S.benchmarks
    .map((r) => `<tr><td><b>${esc(r.body)}</b></td><td>${esc(r.year)}</td><td>${esc(r.value)}</td><td>${esc(r.note)}</td></tr>`)
    .join('');
  return `<div class="page-title"><h1>Benchmarking</h1></div><p class="sub">How other state bodies and the national championships are tracking. Edited by Admins.</p>
  <div class="card" style="overflow:auto"><table><thead><tr><th>Body</th><th>Year</th><th>Figure</th><th>Notes and source</th></tr></thead><tbody>${rows}</tbody></table></div>`;
}

function notes() {
  const R = S.rules;
  const rec = S.reconciliation
    .filter((r) => r.difference !== 0)
    .map((r) => `<tr><td>${r.year}</td><td class="r">${fmt(r.fileTotal)}</td><td class="r">${fmt(r.recomputedAllEvents)}</td><td class="r">${r.difference > 0 ? '+' : ''}${fmt(r.difference)}</td></tr>`)
    .join('');
  const fileNotes = Object.entries(S.notes).map(([y, t]) => `<li><b>${y}:</b> ${esc(t)}</li>`).join('');
  return `<div class="page-title"><h1>Data notes</h1></div><p class="sub">The rules behind every number, in plain language.</p>
  <div class="card"><ul class="heads">
    <li><b>Core events.</b> Trends use seven events: ${esc(S.board.coreEvents.join(', '))}, from ${R.trendStart}. A year only has a core total if all seven have a figure.</li>
    <li><b>Events not yet run.</b> A blank means the event has not happened yet. It is shown as awaiting, never as zero. Endurance, North Aussies and Interbranch are outside the core total for this reason.</li>
    <li><b>${R.indicativeYears.join(', ')} is indicative.</b> ${esc(R.indicativeNote)}.</li>
    <li><b>${R.covidYears.join(', ')} is COVID.</b> Juniors, Masters and Seniors State Titles were cancelled, so the year has no core total and the chart bridges the gap with a dashed line.</li>
    <li><b>School Surf League</b> is excluded from all trends because it only has figures for 2014 to 2018.</li>
    <li><b>Interbranch</b> is a fixed team number (192) and is not judged.</li>
    <li><b>Colour tiles</b> compare each event with ${R.baseYear}. Green is down less than ${Math.abs(R.statusRules.greenAtOrAbove)}% or growing, orange is down ${Math.abs(R.statusRules.greenAtOrAbove)} to ${Math.abs(R.statusRules.orangeAtOrAbove)}%, red is down more.</li>
    <li><b>One calculation.</b> Every figure on every page comes from the same calculation, so the Board Summary and Events pages cannot disagree.</li>
    <li><b>Admin overrides.</b> If a figure is corrected by an Admin, it is marked and the reason is recorded (${S.overrides.length} in use).</li>
  </ul></div>
  <div class="section"><h2>Footnotes from the source file</h2><div class="card"><ul class="heads">${fileNotes || '<li class="muted">None</li>'}</ul></div></div>
  <div class="section"><h2>Why the file's own totals differ</h2><div class="card" style="overflow:auto">
    <p class="small muted" style="margin-top:0">The source file's "Total Entries" row mixes what is included from year to year, which is why this dashboard recalculates totals. Years not listed match exactly.</p>
    <table><thead><tr><th>Year</th><th class="r">File total</th><th class="r">All events recalculated</th><th class="r">Difference</th></tr></thead><tbody>${rec}</tbody></table>
    <p class="small muted" style="margin-bottom:0">Early years leave Surf Rescue out of the file total. 2014 and 2018 include school league entries.</p></div></div>`;
}

// ---------- admin ----------
let adminMsg = {};
let preview = null;
let history = null;

const EVENT_OPTIONS = ['juniors', 'seniors', 'masters', 'pool', 'surfRescue', 'irb', 'boardRiding', 'endurance', 'northAussies', 'interbranch'];
const LABELS = { juniors: 'Juniors', seniors: 'Seniors', masters: 'Masters', pool: 'Pool', surfRescue: 'Surf Rescue', irb: 'IRB', boardRiding: 'Board Riding', endurance: 'Endurance', northAussies: 'North Aussies', interbranch: 'Interbranch' };
const msg = (k) => (adminMsg[k] ? `<div class="${adminMsg[k].ok ? 'ok' : 'err'}" role="status">${esc(adminMsg[k].text)}</div>` : '');

async function admin() {
  if (S.meta.role !== 'admin') return '<div class="card">This page is for Admins.</div>';
  if (!history) history = await api('/api/admin/history');
  const L = S.board.latestYear;
  const memRows = S.participation.rows;
  return `<div class="page-title"><h1>Admin</h1></div><p class="sub">Update data, correct figures and manage the membership link.</p>

  <div class="card"><h2 style="font-size:17px">1. Upload new entries file</h2>
    <p class="small muted">Upload the entries workbook (.xlsx). You will see a preview and any warnings before anything changes.</p>
    <div class="row"><input type="file" id="file" accept=".xlsx"><button class="btn" data-a="upload">Preview</button></div>${msg('upload')}
    ${preview ? `<div style="margin-top:12px"><b>${esc(preview.filename)}</b>: ${preview.changeCount} figure${preview.changeCount === 1 ? '' : 's'} would change.
      ${preview.warnings.map((w) => `<div class="warn" style="margin:8px 0">${esc(w)}</div>`).join('')}
      ${preview.changes.length ? `<table><thead><tr><th>Event</th><th>Year</th><th class="r">Was</th><th class="r">Now</th></tr></thead><tbody>${preview.changes.map((c) => `<tr><td>${esc(c.event)}</td><td>${c.year}</td><td class="r">${fmt(c.was)}</td><td class="r">${fmt(c.now)}</td></tr>`).join('')}</tbody></table>` : ''}
      <div class="row" style="margin-top:10px"><button class="btn" data-a="publish">Publish this version</button><button class="btn alt" data-a="cancel-preview">Cancel</button></div></div>` : ''}
    <h3 style="margin:18px 0 6px;font-size:15px">Version history</h3>
    <table><tbody>${history.map((h, i) => `<tr><td>v${h.version ?? '?'}</td><td>${esc(h.filename)}</td><td>${esc(new Date(h.uploadedAt).toLocaleString('en-AU'))}</td><td class="r"><button class="btn alt" data-a="rollback" data-id="${esc(h.versionId)}">Restore</button></td></tr>`).join('') || '<tr><td class="muted">No earlier versions yet.</td></tr>'}</tbody></table>${msg('history')}
  </div>

  <div class="section card"><h2 style="font-size:17px">2. Correct a figure (with a reason)</h2>
    <p class="small muted">Use when two sources disagree. The corrected figure is flagged everywhere it appears and the reason is kept.</p>
    <div class="row"><label>Event<select id="ov-event">${EVENT_OPTIONS.map((k) => `<option value="${k}">${LABELS[k]}</option>`).join('')}</select></label>
      <label>Year<input id="ov-year" type="number" value="${L - 1}" style="width:90px"></label>
      <label>Entries<input id="ov-value" type="number" min="1" style="width:110px"></label>
      <label style="flex:1;min-width:220px">Reason<input id="ov-reason" maxlength="300"></label>
      <button class="btn" data-a="override">Save</button></div>${msg('override')}
    ${S.overrides.length ? `<table style="margin-top:10px"><tbody>${S.overrides.map((o) => `<tr><td>${esc(LABELS[o.event])} ${o.year}</td><td class="r"><b>${fmt(o.value)}</b></td><td>${esc(o.reason)}</td><td class="r"><button class="btn alt" data-a="rm-override" data-event="${esc(o.event)}" data-year="${o.year}">Remove</button></td></tr>`).join('')}</tbody></table>` : ''}
  </div>

  <div class="section card"><h2 style="font-size:17px">3. Membership link</h2>
    <p class="small muted">${S.meta.liveMembershipConfigured ? 'Connected to the membership dashboard (read only). It refreshes every six hours.' : 'Not connected yet. Set MEMBERSHIP_API_URL to the membership dashboard /api/data address to switch on the live link. Until then, enter figures by hand below.'}</p>
    <div class="row">${S.meta.liveMembershipConfigured ? '<button class="btn" data-a="refresh-live">Refresh from membership dashboard now</button>' : ''}</div>${msg('live')}
    <h3 style="margin:14px 0 6px;font-size:15px">Enter or correct a season by hand</h3>
    <div class="row"><label>Sport year<input id="m-year" type="number" value="${L}" style="width:90px"></label>
      <label>Eligible juniors<input id="m-jr" type="number" min="0" style="width:120px"></label>
      <label>Active members<input id="m-act" type="number" min="0" style="width:120px"></label>
      <label>Total members<input id="m-tot" type="number" min="0" style="width:120px"></label>
      <button class="btn" data-a="member">Save season</button></div>
    <p class="small muted">Sport year ${L} means the ${L - 1}/${String(L).slice(2)} season. Leave all three blank and save to remove a season.</p>${msg('member')}
    ${memRows.length ? `<table><thead><tr><th>Season</th><th class="r">Eligible juniors</th><th class="r">Active</th><th class="r">Total</th><th>Source</th></tr></thead><tbody>${memRows.map((r) => `<tr><td>${esc(r.season)}</td><td class="r">${fmt(r.juniorEligible)}</td><td class="r">${fmt(r.activeMembers)}</td><td class="r">${fmt(r.totalMembers)}</td><td>${esc(r.source)}</td></tr>`).join('')}</tbody></table>` : ''}
    <h3 style="margin:14px 0 6px;font-size:15px">Which junior age groups are eligible?</h3>
    <div class="row"><label>From Under<input id="c-min" type="number" value="${S.meta.config.juniorMinAge}" style="width:80px"></label><label>To Under<input id="c-max" type="number" value="${S.meta.config.juniorMaxAge}" style="width:80px"></label><button class="btn" data-a="config">Save</button></div>
    <p class="small muted">Check this matches who can enter the Junior Championship.</p>${msg('config')}
  </div>

  <div class="section card"><h2 style="font-size:17px">4. Benchmarking table</h2>
    <div id="bm">${S.benchmarks.map(bmRow).join('')}</div>
    <div class="row" style="margin-top:8px"><button class="btn alt" data-a="bm-add">Add row</button><button class="btn" data-a="bm-save">Save table</button></div>${msg('bm')}
  </div>`;
}
const bmRow = (r) => `<div class="row bm-row" style="margin-bottom:8px"><label style="flex:1;min-width:180px">Body<input class="bm-body" value="${esc(r.body)}"></label>
  <label>Year<input class="bm-year" value="${esc(r.year)}" style="width:80px"></label><label>Figure<input class="bm-value" value="${esc(r.value)}" style="width:110px"></label>
  <label style="flex:2;min-width:220px">Notes and source<input class="bm-note" value="${esc(r.note)}"></label></div>`;

// ---------- actions ----------
const $ = (id) => document.getElementById(id);
async function act(name, fn, okText) {
  try {
    const r = await fn();
    adminMsg[name] = { ok: true, text: okText || 'Saved.' };
    return r;
  } catch (e) {
    adminMsg[name] = { ok: false, text: e.message };
  } finally {
    await refresh(false);
  }
}
app.addEventListener('click', async (ev) => {
  const t = ev.target.closest('[data-a]');
  if (!t) return;
  const a = t.dataset.a;
  if (a === 'upload') {
    const f = $('file').files[0];
    if (!f) return void ((adminMsg.upload = { ok: false, text: 'Choose a file first.' }), refresh(false));
    const fd = new FormData();
    fd.append('file', f);
    preview = null;
    const r = await act('upload', () => api('/api/admin/upload', 'POST', fd), 'Preview ready. Nothing has changed yet.');
    if (r) preview = r;
    await refresh(false);
  } else if (a === 'cancel-preview') {
    preview = null;
    adminMsg.upload = null;
    refresh(false);
  } else if (a === 'publish') {
    await act('upload', () => api('/api/admin/publish', 'POST', { previewId: preview.previewId }), 'Published. The dashboard now uses this file.');
    preview = null;
    history = null;
    await refresh(true);
  } else if (a === 'rollback') {
    if (!confirm('Restore this earlier version? The current one is kept in history.')) return;
    await act('history', () => api('/api/admin/rollback', 'POST', { versionId: t.dataset.id }), 'Restored.');
    history = null;
    await refresh(true);
  } else if (a === 'override') {
    await act('override', () => api('/api/admin/override', 'POST', { event: $('ov-event').value, year: $('ov-year').value, value: $('ov-value').value, reason: $('ov-reason').value }));
    await refresh(true);
  } else if (a === 'rm-override') {
    await api('/api/admin/override', 'DELETE', { event: t.dataset.event, year: t.dataset.year });
    await refresh(true);
  } else if (a === 'member') {
    await act('member', () => api('/api/admin/membership', 'POST', { year: $('m-year').value, juniorEligible: $('m-jr').value, activeMembers: $('m-act').value, totalMembers: $('m-tot').value }));
    await refresh(true);
  } else if (a === 'refresh-live') {
    await act('live', async () => {
      const r = await api('/api/admin/membership/refresh', 'POST');
      if (r.skipped) throw new Error(r.skipped);
      return r;
    }, 'Membership figures refreshed.');
    await refresh(true);
  } else if (a === 'config') {
    await act('config', () => api('/api/admin/config', 'POST', { juniorMinAge: $('c-min').value, juniorMaxAge: $('c-max').value }));
    await refresh(true);
  } else if (a === 'bm-add') {
    $('bm').insertAdjacentHTML('beforeend', bmRow({ body: '', year: '', value: '', note: '' }));
  } else if (a === 'bm-save') {
    const rows = [...document.querySelectorAll('.bm-row')].map((r) => ({ body: r.querySelector('.bm-body').value, year: r.querySelector('.bm-year').value, value: r.querySelector('.bm-value').value, note: r.querySelector('.bm-note').value }));
    await act('bm', () => api('/api/admin/benchmarks', 'POST', { rows }));
    await refresh(true);
  }
});

// ---------- router ----------
const PAGES = { board: ['Board Summary', board], events: ['Events', events], participation: ['Participation', participation], benchmarks: ['Benchmarking', benchmarks], notes: ['Data notes', notes], admin: ['Admin', admin] };
async function render() {
  const key = (location.hash.replace('#/', '') || 'board').split('?')[0];
  const page = PAGES[key] || PAGES.board;
  const k = PAGES[key] ? key : 'board';
  const items = Object.entries(PAGES).filter(([id]) => id !== 'admin' || S.meta.role === 'admin');
  $('nav').innerHTML = items.map(([id, [name]]) => `<a href="#/${id}" class="${id === k ? 'on' : ''}">${name}</a>`).join('');
  $('who').textContent = S.meta.role === 'admin' ? 'Admin' : 'Viewer';
  app.innerHTML = await page[1]();
  document.title = `${page[0]} | SLSQ Sport Participation`;
}
async function refresh(reload) {
  if (reload) await load();
  const y = window.scrollY;
  await render();
  window.scrollTo(0, y);
}
window.addEventListener('hashchange', () => {
  window.scrollTo(0, 0);
  render();
});
try {
  await load();
  await render();
} catch (e) {
  app.innerHTML = `<div class="card err">Could not load the dashboard: ${esc(e.message)}</div>`;
}
