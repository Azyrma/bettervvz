// Typo-tolerant search over one semester index (public/data/<semkez>.json).
// Runs inside the search worker; scripts/check-search.mjs exercises it in Node.
import { normalize } from './normalize.js';
import { RATING_STEPS } from '../labels.js';

const words = s => (s ? normalize(s).split(' ').filter(Boolean) : []);

// Optimal string alignment distance (Levenshtein + adjacent transpositions), bailing out above max.
function osa(a, b, max) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  let prev2 = null;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    let rowMin = i;
    for (let j = 1; j <= b.length; j++) {
      let v = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, prev2[j - 2] + 1);
      cur[j] = v;
      if (v < rowMin) rowMin = v;
    }
    if (rowMin > max) return max + 1;
    prev2 = prev;
    prev = cur;
  }
  return prev[b.length];
}

const ROMAN = { 1: 'i', 2: 'ii', 3: 'iii', 4: 'iv', 5: 'v', i: '1', ii: '2', iii: '3', iv: '4', v: '5' };

// How well query word q matches indexed word w. When q is itself a known word, only allow
// one typo so "analysis" doesn't drag in "catalysis".
function wordScore(q, w, known) {
  if (w === q || ROMAN[q] === w) return 1;
  if (w.startsWith(q)) return 0.8;
  if (q.length >= 3 && w.includes(q)) return 0.6;
  if (q.length < 4) return 0;
  const max = known || q.length < 9 ? 1 : 2;
  if (osa(q, w, max) <= max) return 0.5;
  if (!known && w.length > q.length && osa(q, w.slice(0, q.length), 1) <= 1) return 0.4;
  return 0;
}

function languagesOf(lg) {
  return [...new Set((lg ?? '').split(',').map(s => s.replace(/\(.*?\)/g, '').trim()).filter(Boolean))];
}

export const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;

export function buildIndex({ semkez, units, sections }) {
  const vocab = new Map();
  const ids = list => {
    const out = new Set();
    for (const w of list) {
      if (!vocab.has(w)) vocab.set(w, vocab.size);
      out.add(vocab.get(w));
    }
    return Int32Array.from(out);
  };

  const docs = units.map(u => ({
    u,
    title: ids([...words(u.t), ...words(u.tg)]),
    titleLen: words(u.t).length,
    lec: ids((u.lec ?? []).flatMap(words)),
    phrase: ` ${normalize(u.t)} | ${normalize(u.tg)} `,
    nn: u.no.replace(/\D/g, ''),
    langs: languagesOf(u.lg),
    rooms: (u.rm ?? []).map(r => ` ${normalize(r)}`),
    rating: u.cr ? mean(u.cr) : null,
    secs: (u.sec ?? []).map(s => s[0]),
  }));

  const secById = new Map(sections.map(([id, parent, name]) => [id, { id, parent, name, children: [], units: new Set() }]));
  for (const s of secById.values()) secById.get(s.parent)?.children.push(s.id);
  // Section ids follow scraping order, not the catalogue; VVZ (and the programme picker) list sections by name.
  for (const s of secById.values()) s.children.sort((a, b) => secById.get(a).name.localeCompare(secById.get(b).name));
  for (const d of docs) {
    for (const id of d.secs) {
      for (let s = secById.get(id); s; s = secById.get(s.parent)) s.units.add(d.u.id);
    }
  }
  const pathOf = id => {
    const names = [];
    for (let s = secById.get(id); s; s = secById.get(s.parent)) names.unshift(s.name);
    return names;
  };

  return {
    semkez,
    docs,
    words: [...vocab.keys()],
    vocab,
    secById,
    pathOf,
    byId: new Map(docs.map(d => [d.u.id, d.u])),
    byNumber: new Map(docs.map(d => [d.u.no, d.u])),
    timed: units.filter(u => u.ts).length,
    cache: new Map(),
  };
}

// Departments owning a programme: those attached to (nearly) every one of its courses, since vvzapi has
// no department per section. Programmes shared by more than three departments (Project Mobility, teaching
// diplomas) count as cross-department and get null, like cross-level collections for the Level filter.
function ownerDepartments(index, root) {
  const counts = {};
  for (const id of root.units) for (const d of index.byId.get(id).dp) counts[d] = (counts[d] ?? 0) + 1;
  const owners = Object.keys(counts).filter(d => counts[d] >= 0.95 * root.units.size).map(Number);
  return owners.length && owners.length <= 3 ? owners : null;
}

// Section list for the programme picker: only sections that actually contain courses.
// `dp` is the owning departments of the section's programme (its root section).
export function sectionList(index) {
  const owners = new Map();
  const rootOf = s => {
    while (index.secById.has(s.parent)) s = index.secById.get(s.parent);
    return s;
  };
  return [...index.secById.values()]
    .filter(s => s.units.size)
    .map(s => {
      const root = rootOf(s);
      if (!owners.has(root.id)) owners.set(root.id, ownerDepartments(index, root));
      return { id: s.id, parent: s.parent, name: s.name, path: index.pathOf(s.id), count: s.units.size, dp: owners.get(root.id) };
    });
}

// Section ids differ per semester: find the section with the same path of names here, or its deepest
// ancestor that exists (e.g. a major that was renamed falls back to "Majors").
export function findSection(index, path) {
  const byPath = new Map([...index.secById.keys()].map(id => [index.pathOf(id).join('\u0000'), id]));
  for (let n = path.length; n > 0; n--) {
    const id = byPath.get(path.slice(0, n).join('\u0000'));
    if (id != null) return id;
  }
  return null;
}

export function unitSections(index, u) {
  return (u.sec ?? []).map(([id, type]) => ({ id, type, path: index.pathOf(id) })).filter(s => s.path.length);
}

function wordScores(index, q) {
  let s = index.cache.get(q);
  if (s) return s;
  const known = index.vocab.has(q);
  s = Float32Array.from(index.words, w => wordScore(q, w, known));
  if (index.cache.size > 64) index.cache.clear();
  index.cache.set(q, s);
  return s;
}

// Course numbers like "252-0027-00L" or "252-0027" are matched on their digits, not as words.
const NUMBER = /\b\d{3}(?:-\d{0,4}(?:-\d{0,2}[a-z]?)?)?(?![\w-])|\b\d{5,}[a-z]?\b/gi;

function parseQuery(index, q) {
  const numbers = (q.match(NUMBER) ?? []).map(n => n.replace(/\D/g, ''));
  const qWords = words(q.replace(NUMBER, ' '));
  return { numbers, qWords, scores: qWords.map(w => wordScores(index, w)), phrase: qWords.join(' ') };
}

function textScore(d, { numbers, qWords, scores, phrase }, text) {
  let total = 0;
  for (const n of numbers) {
    const s = d.nn.startsWith(n) ? 1.5 : n.length >= 4 && d.nn.includes(n) ? 0.7 : 0;
    if (!s) return 0;
    total += s;
  }
  const body = text?.[d.u.id];
  let matched = 0;
  for (let i = 0; i < qWords.length; i++) {
    const s = scores[i];
    let best = 0;
    for (const id of d.title) if (s[id] > best) best = s[id];
    for (const id of d.lec) if (s[id] * 0.9 > best) best = s[id] * 0.9;
    if (!best && body && qWords[i].length >= 3 && body.includes(qWords[i])) best = 0.3;
    if (!best) return 0;
    if (best >= 0.5) matched++;
    total += best;
  }
  if (phrase.length > 2) {
    if (d.phrase.includes(` ${phrase} `)) total += 1;
    else if (d.phrase.includes(` ${phrase}`)) total += 0.6;
    if (d.phrase.startsWith(` ${phrase}`)) total += 0.4;
  }
  // Prefer titles that the query covers almost entirely ("Linear Algebra" over "Numerical Linear Algebra").
  return total + 0.5 * Math.min(1, matched / Math.max(1, d.titleLen));
}

const BIT = {
  text: 1, prog: 2, dep: 4, lvl: 8, lang: 16, type: 32, exam: 64, credits: 128, time: 256,
  open: 512, rating: 1024, occurs: 2048, fq: 4096, room: 8192, lect: 16384, cat: 32768,
};
const FACETS = {
  dep: d => d.u.dp,
  lvl: d => d.u.lv,
  lang: d => d.langs,
  type: d => d.u.ty ?? [],
  exam: d => (d.u.ex ? [d.u.ex] : []),
  fq: d => (d.u.fq ? [d.u.fq] : []),
};

// Section ids under `id` mapped to their position in catalogue order (depth-first, children by name).
function subtree(index, id) {
  const out = new Map();
  const visit = sid => {
    const s = index.secById.get(sid);
    if (!s || out.has(sid)) return;
    out.set(sid, out.size);
    s.children.forEach(visit);
  };
  visit(id);
  return out;
}

const SORTS = {
  number: (a, b) => a.d.u.no.localeCompare(b.d.u.no),
  title: (a, b) => a.d.u.t.localeCompare(b.d.u.t),
  credits: (a, b) => (b.d.u.c ?? -1) - (a.d.u.c ?? -1) || SORTS.number(a, b),
  rating: (a, b) => (b.d.rating ?? -1) - (a.d.rating ?? -1) || SORTS.number(a, b),
  // In the any-semester index (sk = newest offering) equally good matches list current courses first.
  relevance: (a, b) => b.score - a.score || (b.d.u.sk ?? '').localeCompare(a.d.u.sk ?? '') || SORTS.number(a, b),
};

/**
 * p: { q, prog, dep[], lvl[], lang[], type[], exam[], fq[], cmin, cmax, days[], from, to, room, lect, cat,
 *      desc, open, occurs, rmin, structure, flat, sort, limit }
 * With `prog` set (and not `flat`), results are grouped like VVZ: one row per course and sub-section,
 * in catalogue order, each carrying `group` (section id) and `linkType` (O, W, W+, …).
 * text: { [unitId]: normalized catalogue data }, needed for `desc` (query words may match it) and `cat`.
 * `cat` is VVZ's separate "Katalogdaten" field: all its words must appear in the catalogue data.
 * Multi-select filters (FACETS and days) narrow like stacked VVZ filters: a course must match every
 * ticked value. Their option counts come from the current results, so every tick only narrows further.
 * Single-choice filters (prog, credits, rating, toggles) count against all *other* filters, so the
 * alternatives you could switch to stay visible.
 */
export function search(index, p, text = null) {
  const t0 = performance.now();
  const query = parseQuery(index, p.q ?? '');
  const hasQuery = query.numbers.length + query.qWords.length > 0;
  const prog = p.prog ? subtree(index, p.prog) : null;
  const sets = Object.fromEntries(Object.keys(FACETS).map(k => [k, new Set(p[k] ?? [])]));
  const days = new Set(p.days ?? []);
  const timed = index.timed > 0 && (days.size || p.from || p.to);
  const inWindow = ([, start, end]) => (!p.from || start >= p.from) && (!p.to || end <= p.to);
  const room = p.room ? ` ${normalize(p.room)}` : '';
  // Lecturer filter: every word must match a lecturer name (typos allowed), not just a title word.
  const lect = words(p.lect).map(w => wordScores(index, w));
  const cat = text ? words(p.cat) : [];
  const facets = {
    ...Object.fromEntries(Object.keys(FACETS).map(k => [k, {}])),
    prog: {}, credits: {}, days: {}, rating: {}, open: 0, occurs: 0,
  };
  const counted = new Map(); // section id → index of the last course counted there
  const results = [];

  for (let i = 0; i < index.docs.length; i++) {
    const d = index.docs[i];
    const u = d.u;
    let fail = 0;
    let score = 0;
    if (hasQuery && !(score = textScore(d, query, p.desc ? text : null))) fail |= BIT.text;
    if (cat.length && !cat.every(w => text[u.id]?.includes(w))) fail |= BIT.cat;
    if (prog && !d.secs.some(id => prog.has(id))) fail |= BIT.prog;
    for (const k in FACETS) {
      if (sets[k].size) {
        const values = FACETS[k](d);
        for (const v of sets[k]) if (!values.includes(v)) fail |= BIT[k];
      }
    }
    if ((p.cmin != null && !(u.c >= p.cmin)) || (p.cmax != null && !(u.c <= p.cmax))) fail |= BIT.credits;
    if (timed && !(days.size
      ? [...days].every(wd => u.ts?.some(slot => slot[0] === wd && inWindow(slot)))
      : u.ts?.some(inWindow))) fail |= BIT.time;
    if (room.length > 1 && !d.rooms.some(r => r.includes(room))) fail |= BIT.room;
    if (lect.length && !lect.every(s => d.lec.some(id => s[id] >= 0.5))) fail |= BIT.lect;
    if (p.open && u.rs) fail |= BIT.open;
    if (p.occurs && u.oc) fail |= BIT.occurs;
    if (p.rmin && !(d.rating >= p.rmin)) fail |= BIT.rating;

    if (!fail) results.push({ d, score });
    if (!fail) for (const k in FACETS) for (const v of FACETS[k](d)) facets[k][v] = (facets[k][v] ?? 0) + 1;
    if ((fail & ~BIT.prog) === 0) {
      // Count the course once per section and ancestor, even when it is linked in several branches.
      for (const id of d.secs) {
        for (let s = index.secById.get(id); s && counted.get(s.id) !== i; s = index.secById.get(s.parent)) {
          counted.set(s.id, i);
          facets.prog[s.id] = (facets.prog[s.id] ?? 0) + 1;
        }
      }
    }
    if ((fail & ~BIT.credits) === 0 && u.c != null) facets.credits[u.c] = (facets.credits[u.c] ?? 0) + 1;
    if (!fail && index.timed > 0 && u.ts) {
      for (const wd of new Set(u.ts.filter(inWindow).map(([wd]) => wd))) facets.days[wd] = (facets.days[wd] ?? 0) + 1;
    }
    if ((fail & ~BIT.open) === 0 && !u.rs) facets.open++;
    if ((fail & ~BIT.occurs) === 0 && !u.oc) facets.occurs++;
    if ((fail & ~BIT.rating) === 0 && d.rating != null) {
      for (const step of RATING_STEPS) if (d.rating >= step) facets.rating[step] = (facets.rating[step] ?? 0) + 1;
    }
  }

  const sort = p.sort && p.sort !== 'relevance' ? p.sort : hasQuery ? 'relevance' : 'number';
  results.sort(SORTS[sort] ?? SORTS.number);
  const limit = p.limit ?? 50;

  if (prog && !p.flat) {
    const rows = results.flatMap(r => (r.d.u.sec ?? [])
      .filter(([id]) => prog.has(id))
      .map(([id, type]) => ({ r, id, type })));
    rows.sort((a, b) => prog.get(a.id) - prog.get(b.id)); // stable: keeps the chosen sort within a section
    const page = rows.slice(0, limit);
    const depth = index.pathOf(p.prog).length - 1;
    return {
      total: results.length,
      rows: rows.length,
      items: page.map(({ r, id, type }) => ({ ...r.d.u, group: id, linkType: type })),
      groups: Object.fromEntries([...new Set(page.map(x => x.id))].map(id => [id, index.pathOf(id).slice(depth)])),
      facets,
      ms: Math.round((performance.now() - t0) * 10) / 10,
    };
  }

  const page = results.slice(0, limit).map(r => r.d.u);
  return {
    total: results.length,
    // "Show programmes" mirrors VVZ's result view with structural information.
    items: p.structure ? page.map(u => ({ ...u, paths: unitSections(index, u).map(s => s.path) })) : page,
    facets,
    ms: Math.round((performance.now() - t0) * 10) / 10,
  };
}
