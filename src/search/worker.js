// Search runs off the main thread: indexes are parsed and queried here so typing never blocks the UI.
import { buildIndex, search, sectionList, unitSections } from './engine.js';
import { searchCourses } from '../api/vvz.js';

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
  if (!res.ok) throw new Error(`Could not load course data (${res.status})`);
  return res.json();
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

function livePage(ix, scoped, offset, sort) {
  const [orderBy, order] = LIVE_ORDER[sort] ?? LIVE_ORDER.number;
  // ponytail: unbounded per-session cache of mapped pages; they are small (records are shared with the index).
  return once(livePages, `${sort}|${offset}|${scoped}`, async () => {
    const res = await searchCourses(scoped, { limit: LIVE_PAGE, offset, orderBy, order });
    const items = Object.entries(res.results).map(([no, g]) => ix.byNumber.get(no) ?? fromGroup(no, g, ix.semkez));
    return { total: res.total, items, parsed: res.parsed_query, ms: res.exec_time_ms };
  });
}

const handlers = {
  semesters: loadManifest,

  async meta({ semkez }) {
    const ix = await load(semkez);
    return { sections: sectionList(ix), hasTimes: ix.hasTimes };
  },

  async search(p) {
    const [ix, text] = await Promise.all([load(p.semkez), p.desc ? loadText(p.semkez) : null]);
    return search(ix, p, text);
  },

  // Advanced vvzapi.ch query syntax is answered by vvzapi.ch itself, scoped to the chosen semester.
  async live({ semkez, q, limit = LIVE_PAGE, sort }) {
    const ix = await load(semkez);
    const scoped = `y:${semkez.slice(0, 4)} s:${semkez[4] === 'W' ? 'HS' : 'FS'} (${q})`;
    const offsets = [];
    for (let o = 0; o < limit; o += LIVE_PAGE) offsets.push(o);
    const pages = await Promise.all(offsets.map(o => livePage(ix, scoped, o, sort)));
    return {
      total: pages[0].total,
      items: pages.flatMap(p => p.items),
      parsed: pages[0].parsed,
      ms: Math.round(pages[0].ms),
    };
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
