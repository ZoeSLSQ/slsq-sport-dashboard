// Read-only link to the membership dashboard's /api/data endpoint.
// This app only ever reads from it. It never writes to the membership app.

export function liveConfigured() {
  return !!process.env.MEMBERSHIP_API_URL;
}

const num = (v) => (typeof v === 'number' && isFinite(v) ? v : null);

function pickCount(item) {
  if (num(item)) return item;
  if (item && typeof item === 'object') {
    for (const k of ['count', 'members', 'total', 'current', 'value', 'unique', 'uniqueMembers']) {
      if (num(item[k]) != null) return item[k];
    }
  }
  return null;
}

function ageOf(label) {
  const m = String(label ?? '').match(/(\d{1,2})/);
  return m ? Number(m[1]) : null;
}

// Accepts juniorAgeGroups as an array of {label, count} or as a {label: count} map.
export function adapt(json, { juniorMinAge, juniorMaxAge }) {
  const raw = json?.juniorAgeGroups;
  const groups = [];
  if (Array.isArray(raw)) {
    for (const it of raw) {
      const label = it?.label ?? it?.name ?? it?.ageGroup ?? it?.group ?? it?.age;
      const count = pickCount(it);
      if (label != null && count != null) groups.push({ label: String(label), age: ageOf(label), count });
    }
  } else if (raw && typeof raw === 'object') {
    for (const [label, v] of Object.entries(raw)) {
      const count = pickCount(v);
      if (count != null) groups.push({ label, age: ageOf(label), count });
    }
  }
  if (!groups.length) throw new Error('The membership endpoint did not include juniorAgeGroups in a shape this app understands.');

  const eligible = groups.filter((g) => g.age != null && g.age >= juniorMinAge && g.age <= juniorMaxAge);
  const pickTop = (...keys) => {
    for (const k of keys) {
      const parts = k.split('.');
      let v = json;
      for (const part of parts) v = v?.[part];
      if (num(v) != null) return v;
    }
    return null;
  };
  const seasonStr = String(json?.season ?? json?.seasonLabel ?? '');
  const sm = seasonStr.match(/(\d{4})\D+(\d{2,4})/);
  const seasonYear = sm ? (sm[2].length === 2 ? Number(sm[1].slice(0, 2) + sm[2]) : Number(sm[2])) : null;

  return {
    groups,
    juniorEligible: eligible.length ? eligible.reduce((a, g) => a + g.count, 0) : null,
    eligibleLabels: eligible.map((g) => g.label),
    activeMembers: pickTop('activeMembers', 'active.total', 'summary.activeMembers', 'state.activeMembers'),
    totalMembers: pickTop('totalMembers', 'total', 'summary.totalMembers', 'state.totalMembers'),
    seasonYear,
  };
}

export async function fetchLive(cfg) {
  const url = process.env.MEMBERSHIP_API_URL;
  if (!url) throw new Error('MEMBERSHIP_API_URL is not set.');
  const headers = {};
  if (process.env.MEMBERSHIP_API_TOKEN) headers.Authorization = `Bearer ${process.env.MEMBERSHIP_API_TOKEN}`;
  const res = await fetch(url, { headers, signal: AbortSignal.timeout(8000) });
  if (!res.ok) throw new Error(`Membership endpoint returned ${res.status}.`);
  return adapt(await res.json(), cfg);
}
