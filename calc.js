// The ONE place every number is calculated. Pages only display what this returns.
import { EVENT_LABELS } from './parse.js';

export const CORE = ['juniors', 'seniors', 'masters', 'pool', 'surfRescue', 'irb', 'boardRiding'];
export const CARD_EVENTS = ['juniors', 'seniors', 'masters', 'pool', 'surfRescue', 'irb', 'boardRiding', 'endurance', 'northAussies'];
export const TREND_START = 2014;
export const COVID_YEARS = [2020];
export const INDICATIVE_YEARS = [2025];
export const INDICATIVE_NOTE = 'Indicative (State Champs cancelled due to TC Alfred)';
export const STATUS_RULES = { greenAtOrAbove: -5, orangeAtOrAbove: -15 }; // % change vs 2024
export const BASE_YEAR = 2024;

export const DEFAULT_CONFIG = {
  // Which Junior age groups are "eligible" for the Junior Championship (editable by Admin).
  juniorMinAge: 8,
  juniorMaxAge: 14,
};

const pct = (cur, base) => (cur == null || base == null || base === 0 ? null : ((cur - base) / base) * 100);
const round1 = (n) => (n == null ? null : Math.round(n * 10) / 10);

export function statusFor(changePct) {
  if (changePct == null) return 'grey';
  if (changePct >= STATUS_RULES.greenAtOrAbove) return 'green';
  if (changePct >= STATUS_RULES.orangeAtOrAbove) return 'orange';
  return 'red';
}

export function buildSummary({ parsed, overrides = [], membership = {}, config = DEFAULT_CONFIG, benchmarks = [], meta = {} }) {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const years = parsed.years.filter((y) => Object.keys(parsed.events).some((k) => parsed.events[k][y] != null));
  const latestYear = Math.max(...years.filter((y) => CORE.some((k) => parsed.events[k]?.[y] != null)));

  // effective value = admin override if present, else the file value
  const ov = {};
  for (const o of overrides) (ov[o.event] ||= {})[o.year] = o;
  const val = (ev, y) => {
    const o = ov[ev]?.[y];
    if (o) return o.value;
    return parsed.events[ev]?.[y] ?? null;
  };

  const coreTotal = (y) => {
    const vals = CORE.map((k) => val(k, y));
    return vals.every((v) => v != null) ? vals.reduce((a, b) => a + b, 0) : null;
  };
  const allEvents = (y) => {
    const keys = Object.keys(parsed.events).filter((k) => k !== 'schoolLeague');
    let total = 0;
    const missing = [];
    for (const k of keys) {
      const v = val(k, y);
      if (v == null) missing.push(EVENT_LABELS[k]);
      else total += v;
    }
    return { total: total || null, missing };
  };

  // ---- Board summary ----
  const trendYears = years.filter((y) => y >= TREND_START && y <= latestYear);
  const coreSeries = trendYears.map((y) => ({
    year: y,
    value: coreTotal(y),
    covid: COVID_YEARS.includes(y),
    indicative: INDICATIVE_YEARS.includes(y),
  }));
  const cur = coreTotal(latestYear);
  const compare = (baseYear) => {
    const base = coreTotal(baseYear);
    return { year: baseYear, base, changePct: round1(pct(cur, base)), indicative: INDICATIVE_YEARS.includes(baseYear) };
  };
  const board = {
    latestYear,
    coreEvents: CORE.map((k) => EVENT_LABELS[k]),
    currentCore: cur,
    vs2025: compare(latestYear - 1),
    vs2024: compare(BASE_YEAR),
    vs2021: compare(latestYear - 5),
    series: coreSeries,
    allEvents: { year: latestYear, ...allEvents(latestYear) },
    fileTotal: parsed.fileTotals[latestYear] ?? null,
  };

  // ---- Event cards ----
  const events = CARD_EVENTS.map((k) => {
    const first = years.find((y) => val(k, y) != null);
    const latest = [...years].reverse().find((y) => val(k, y) != null);
    const notYetRun = latest < latestYear;
    const series = years.filter((y) => y >= first).map((y) => ({
      year: y,
      value: val(k, y),
      covid: COVID_YEARS.includes(y) && val(k, y) == null,
      indicative: INDICATIVE_YEARS.includes(y),
      overridden: !!ov[k]?.[y],
    }));
    const latestValue = val(k, latest);
    const baseline = latest > BASE_YEAR ? val(k, BASE_YEAR) : null;
    const fiveYearBase = val(k, latest - 5);
    const change2024 = round1(pct(latestValue, baseline));
    return {
      key: k,
      label: EVENT_LABELS[k],
      core: CORE.includes(k),
      firstYear: first,
      latestYear: latest,
      latestValue,
      notYetRun,
      indicativeLatest: INDICATIVE_YEARS.includes(latest),
      vs2024: { year: BASE_YEAR, base: baseline, changePct: change2024 },
      fiveYear: { year: latest - 5, base: fiveYearBase, changePct: round1(pct(latestValue, fiveYearBase)) },
      status: statusFor(change2024),
      series,
      share: CORE.includes(k) && cur ? round1((latestValue / cur) * 100) : null,
    };
  });

  // Interbranch is a fixed team number: shown for context, never judged.
  const interbranch = { label: EVENT_LABELS.interbranch, value: val('interbranch', latestYear - 1) ?? val('interbranch', latestYear), fixed: true };

  // ---- Concentration (core events, current year) ----
  const concentration = events
    .filter((e) => e.core)
    .map((e) => ({ key: e.key, label: e.label, entries: e.latestValue, sharePct: e.share }))
    .sort((a, b) => b.entries - a.entries);

  // ---- Participation (membership link) ----
  const participation = buildParticipation({ val, years, latestYear, membership, cfg });

  // ---- Reconciliation: file's own totals vs recomputed ----
  const reconciliation = years
    .filter((y) => parsed.fileTotals[y])
    .map((y) => {
      const a = allEvents(y);
      return { year: y, fileTotal: parsed.fileTotals[y], recomputedAllEvents: a.total, difference: a.total == null ? null : a.total - parsed.fileTotals[y], missing: a.missing };
    });

  // ---- Headlines ----
  const headlines = makeHeadlines({ board, events, participation });

  return {
    meta: { ...meta, generatedAt: new Date().toISOString(), config: cfg },
    rules: {
      trendStart: TREND_START,
      covidYears: COVID_YEARS,
      indicativeYears: INDICATIVE_YEARS,
      indicativeNote: INDICATIVE_NOTE,
      statusRules: STATUS_RULES,
      baseYear: BASE_YEAR,
    },
    notes: parsed.notes,
    board,
    events,
    interbranch,
    concentration,
    participation,
    reconciliation,
    headlines,
    benchmarks,
    overrides,
  };
}

function seasonLabel(y) {
  return `${y - 1}/${String(y).slice(2)}`;
}

function buildParticipation({ val, years, latestYear, membership, cfg }) {
  const rows = [];
  for (const y of years) {
    const m = membership[y];
    if (!m) continue;
    const jr = val('juniors', y);
    const sm = [val('seniors', y), val('masters', y)];
    const smEntries = sm.every((v) => v != null) ? sm[0] + sm[1] : null;
    rows.push({
      year: y,
      season: seasonLabel(y),
      source: m.source,
      juniorEligible: m.juniorEligible ?? null,
      activeMembers: m.activeMembers ?? null,
      totalMembers: m.totalMembers ?? null,
      juniorEntries: jr,
      seniorMasterEntries: smEntries,
      juniorRatePct: jr != null && m.juniorEligible ? round1((jr / m.juniorEligible) * 100) : null,
      adultRatePct: smEntries != null && m.activeMembers ? round1((smEntries / m.activeMembers) * 100) : null,
    });
  }
  rows.sort((a, b) => a.year - b.year);

  const diagnose = (entriesKey, memKey, label) => {
    const pts = rows.filter((r) => r[entriesKey] != null && r[memKey] != null);
    if (pts.length < 2) return { label, text: 'Needs membership figures for at least two seasons.', kind: 'none' };
    const a = pts[0];
    const b = pts[pts.length - 1];
    const e = pct(b[entriesKey], a[entriesKey]);
    const m = pct(b[memKey], a[memKey]);
    let kind, text;
    if (e >= -3) {
      kind = 'holding';
      text = 'Entries are holding up against membership.';
    } else if (m >= -3) {
      kind = 'pathway';
      text = 'Entries are down while membership is steady. Points to event design, cost or pathway, not recruitment.';
    } else if (e < m - 5) {
      kind = 'both-faster';
      text = 'Membership and entries are both down, and entries are falling faster. Both recruitment and event appeal matter.';
    } else {
      kind = 'membership';
      text = 'Entries are falling roughly in line with membership. Points to recruitment and retention.';
    }
    return { label, kind, text, from: a.season, to: b.season, entriesChangePct: round1(e), membershipChangePct: round1(m) };
  };

  return {
    rows,
    ageGroupEntriesAvailable: false,
    juniorEligibleRule: `Junior members aged ${cfg.juniorMinAge} to ${cfg.juniorMaxAge} (Under ${cfg.juniorMinAge} to Under ${cfg.juniorMaxAge})`,
    adultBase: 'Active members (all active categories)',
    diagnoses: [diagnose('juniorEntries', 'juniorEligible', 'Juniors'), diagnose('seniorMasterEntries', 'activeMembers', 'Seniors and Masters')],
  };
}

function makeHeadlines({ board, events, participation }) {
  const out = [];
  const L = board.latestYear;
  const sign = (n) => `${n > 0 ? 'up' : 'down'} ${Math.abs(n).toFixed(1)}%`;
  if (board.currentCore != null && board.vs2024.changePct != null) {
    out.push(`Entries across the seven core State Championship events total ${board.currentCore.toLocaleString('en-AU')} in ${L}, ${sign(board.vs2024.changePct)} on ${board.vs2024.year} and ${board.vs2021.changePct == null ? 'n/a' : sign(board.vs2021.changePct)} on ${board.vs2021.year}.`);
  }
  const run = events.filter((e) => e.core && e.vs2024.changePct != null);
  const falls = run.filter((e) => e.vs2024.changePct < 0).sort((a, b) => a.vs2024.changePct - b.vs2024.changePct).slice(0, 3);
  if (falls.length) out.push(`Biggest falls against ${BASE_YEAR}: ${falls.map((e) => `${e.label} (${e.vs2024.changePct.toFixed(1)}%)`).join(', ')}.`);
  const grew = run.filter((e) => e.vs2024.changePct > 0);
  const pending = events.filter((e) => e.notYetRun).map((e) => e.label);
  if (grew.length) out.push(`${grew.map((e) => e.label).join(' and ')} grew against ${BASE_YEAR}.${pending.length ? ` ${pending.join(', ')} ${pending.length > 1 ? 'have' : 'has'} not run yet in ${L}.` : ''}`);
  else if (pending.length) out.push(`No core event has grown against ${BASE_YEAR}. ${pending.join(', ')} ${pending.length > 1 ? 'have' : 'has'} not run yet in ${L}.`);
  return out.slice(0, 3);
}
