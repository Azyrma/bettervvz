// Search runs off the main thread: indexes are parsed and queried here so typing never blocks the UI.
import { buildIndex, search, sectionList, unitSections } from './engine.js';
import { getSemesters, searchCourses } from '../api/vvz.js';
import { DEPARTMENTS } from '../labels.js';

const DATA = `${import.meta.env.BASE_URL}data/`;
const manifest = new Map();
const indexes = new Map();
const texts = new Map();
const livePages = new Map();

function once(map, key, load) {
  if (!map.has(key)) map.set(key, load().catch(e => {
    map.delete(key);
    throw e;
  }));
  return map.get(key);
}

async function fetchJson(url) {
  const res = await fetch(url);
  const body = await res.text();
  // Servers with an SPA fallback answer a missing data file with index.html rather than a 404.
  if (!res.ok || body.startsWith('<')) {
    throw new Error(`Course data not found at ${url.split('?')[0]}. Run "npm run data" (restart the dev server if it is running), then reload.`);
  }
  return JSON.parse(body);
}

const loadManifest = () => once(manifest, 'semesters', () => fetchJson(`${DATA}semesters.json`));
// Index URLs carry the dump version, so the service worker can cache them forever.
const versioned = async file => fetchJson(`${DATA}${file}?v=${(await loadManifest()).version}`);
const load = semkez => once(indexes, semkez, () => versioned(`${semkez}.json`).then(buildIndex));
const loadText = semkez => once(texts, semkez, () => versioned(`${semkez}.text.json`));

// Courses vvzapi.ch knows but the local index lacks (e.g. data newer than the last build).
function fromGroup(no, group, semkez) {
  const u = group.units.find(x => x.semkez === semkez) ?? group.units[0];
  return { id: u.id, no, t: u.title_english || u.title, c: u.credits, lv: u.levels ?? [], dp: u.departments ?? [], lg: u.language, ex: u.exam_type };
}

const LIVE_ORDER = { number: ['number', 'asc'], title: ['title_english', 'asc'], credits: ['credits', 'desc'], rating: ['coursereview', 'desc'] };
const LIVE_PAGE = 50;
const FRESH_LIMIT = 20;

const scope = (semkez, q) => `y:${semkez.slice(0, 4)} s:${semkez[4] === 'W' ? 'HS' : 'FS'}${q ? ` (${q})` : ''}`;

// ix is null for semesters that only vvzapi.ch knows about.
function livePage(ix, semkez, scoped, offset, sort, limit = LIVE_PAGE) {
  const [orderBy, order] = LIVE_ORDER[sort] ?? LIVE_ORDER.number;
  // ponytail: unbounded per-session cache of mapped pages; they are small (records are shared with the index).
  return once(livePages, `${sort}|${offset}|${limit}|${scoped}`, async () => {
    const res = await searchCourses(scoped, { limit, offset, orderBy, order });
    const items = Object.entries(res.results).map(([no, g]) => ix?.byNumber.get(no) ?? fromGroup(no, g, semkez));
    return { total: res.total, items, parsed: res.parsed_query, ms: res.exec_time_ms };
  });
}

const quote = s => `"${String(s).replace(/"/g, '')}"`;
const anyOf = (key, values) => (values?.length ? `(${values.map(v => `${key}:${quote(v)}`).join(' OR ')})` : '');

// The same plain search plus filters in vvzapi.ch query syntax, or null when a filter has no equivalent there.
function toQuery(p, ix) {
  if (p.type?.length || p.fq?.length || p.days?.length || p.from || p.to || p.room || p.occurs || p.desc) return null;
  const words = p.q.replace(/["'`()]/g, ' ').split(/\s+/).filter(Boolean)
    .map(w => (/^\d{3}-/.test(w) ? `n:${w}` : w));
  const path = p.prog != null ? ix.pathOf(p.prog) : [];
  return [
    ...words,
    ...path.map(name => `o:${quote(name)}`),
    anyOf('dep', p.dep?.map(d => DEPARTMENTS[d]?.[0] ?? d)),
    anyOf('lvl', p.lvl),
    anyOf('lang', p.lang),
    anyOf('e', p.exam),
    p.cmin != null && `c>=${p.cmin}`,
    p.cmax != null && `c<=${p.cmax}`,
    p.open && 'restricted:false',
    p.rmin != null && `cr>=${p.rmin}`,
    ...(p.lect ?? '').split(/\s+/).filter(Boolean).map(w => `l:${quote(w)}`),
    ...(p.cat ?? '').split(/\s+/).filter(Boolean).map(w => `d:${quote(w)}`),
  ].filter(Boolean).join(' ');
}

const handlers = {
  semesters: loadManifest,

  // Semesters published on vvzapi.ch after the last index build are listed too and searched live.
  async liveSemesters() {
    const local = await loadManifest();
    const live = await getSemesters().catch(() => []);
    const known = new Set(local.semesters.map(s => s.semkez));
    const extra = live.filter(s => !known.has(s)).map(semkez => ({ semkez, live: true }));
    return { ...local, semesters: [...local.semesters, ...extra].sort((a, b) => b.semkez.localeCompare(a.semkez)) };
  },

  async meta({ semkez }) {
    const ix = await load(semkez);
    return { sections: sectionList(ix), timed: ix.timed, total: ix.docs.length };
  },

  async search(p) {
    const [ix, text] = await Promise.all([load(p.semkez), p.desc || p.cat?.trim() ? loadText(p.semkez) : null]);
    return search(ix, p, text);
  },

  // Advanced vvzapi.ch query syntax is answered by vvzapi.ch itself, scoped to the chosen semester.
  async live({ semkez, q, limit = LIVE_PAGE, sort, indexed = true }) {
    const ix = indexed ? await load(semkez) : null;
    const scoped = scope(semkez, q);
    const offsets = [];
    for (let o = 0; o < limit; o += LIVE_PAGE) offsets.push(o);
    const pages = await Promise.all(offsets.map(o => livePage(ix, semkez, scoped, o, sort)));
    return {
      total: pages[0].total,
      items: pages.flatMap(p => p.items),
      parsed: pages[0].parsed,
      ms: Math.round(pages[0].ms),
    };
  },

  // Plain searches are also asked of vvzapi.ch (once typing pauses), so courses added since the
  // last index build still show up. Returns only the courses the local index doesn't have.
  async fresh(p) {
    const ix = await load(p.semkez);
    const q = toQuery(p, ix);
    if (q == null) return { checked: false, items: [] };
    const page = await livePage(ix, p.semkez, scope(p.semkez, q), 0, 'number', FRESH_LIMIT);
    return { checked: true, items: page.items.filter(u => !ix.byNumber.has(u.no)) };
  },

  async unit({ semkez, id }) {
    const ix = await load(semkez);
    const u = ix.byId.get(id);
    return u ? { ...u, sections: unitSections(ix, u) } : null;
  },
};

self.onmessage = async ({ data: { id, type, params } }) => {
  try {
    self.postMessage({ id, result: await handlers[type](params) });
  } catch (e) {
    self.postMessage({ id, error: e.message });
  }
};
