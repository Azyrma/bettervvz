// Sanity check for the search engine against a real semester index: node scripts/check-search.mjs
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { buildIndex, search } from '../src/search/engine.js';

const semkez = '2026W';
const index = buildIndex(JSON.parse(fs.readFileSync(`public/data/${semkez}.json`, 'utf8')));
const text = JSON.parse(fs.readFileSync(`public/data/${semkez}.text.json`, 'utf8'));
const top = (q, extra = {}) => search(index, { q, limit: 5, ...extra }).items.map(u => u.t);

assert.match(top('anlysis')[0], /Analysis/, 'typo in title word');
assert.equal(top('intro programing')[0], 'Introduction to Programming', 'prefix + typo');
assert.equal(search(index, { q: '252-0027' }).items[0].no, '252-0027-00L', 'course number');
assert.equal(search(index, { q: '252-0027-00L' }).items[0].no, '252-0027-00L', 'full course number');
assert.ok(search(index, { q: '252', limit: 10000 }).items.every(u => u.no.startsWith('252-')), 'number prefix');
assert.ok(top('analysis 1').includes('Analysis I'), 'arabic matches roman numerals');
assert.match(top('machne lerning')[0], /Machine Learning/, 'two typos');
assert.equal(top('algorithmen datenstrukturen')[0], 'Algorithms and Data Structures', 'German title');
assert.ok(top('schwerhoff').includes('Introduction to Programming'), 'lecturer');
assert.equal(top('linear algebra')[0], 'Linear Algebra', 'exact phrase first');
assert.ok(!top('analysis', { limit: 200 }).some(t => /catalysis/i.test(t)), 'no distance-2 noise for real words');

const filtered = search(index, { dep: [5], lvl: ['BSC'], limit: 10000 });
assert.ok(filtered.total > 0 && filtered.items.every(u => u.dp.includes(5) && u.lv.includes('BSC')), 'facet filters');
assert.ok(filtered.facets.dep[1] > 0, 'facet counts ignore own selection');
const ects = search(index, { cmin: 8, cmax: 10, limit: 10000 });
assert.ok(ects.items.every(u => u.c >= 8 && u.c <= 10), 'credit range');

const fq = search(index, { fq: ['BIENNIAL'], limit: 10000 });
assert.ok(fq.total > 0 && fq.items.every(u => u.fq === 'BIENNIAL'), 'periodicity filter');
const inHG = search(index, { room: 'hg', limit: 10000 });
assert.ok(inHG.total > 0 && inHG.items.every(u => u.rm.some(r => r.startsWith('HG '))), 'room filter');
assert.ok(search(index, { lect: 'schwerhof', limit: 10000 }).items.some(u => u.no === '252-0027-00L'), 'lecturer filter with typo');
assert.equal(search(index, { q: 'programming', lect: 'schwerhoff', limit: 10000 }).total,
  search(index, { q: 'programming schwerhoff', limit: 10000 }).total, 'lecturer filter agrees with lecturer words in query');
assert.ok(search(index, { q: '252-0027', structure: true }).items[0].paths[0][0].includes('Computer Science'), 'structure paths');

const withText = search(index, { q: 'reinforcement', limit: 10000 }, text).total;
assert.ok(withText > search(index, { q: 'reinforcement', limit: 10000 }).total, 'description search widens results');

const queries = ['a', 'an', 'ana', 'anal', 'analy', 'analys', 'analysi', 'analysis', 'computer vison', 'hoefler', 'data', 'quantum mech'];
const t0 = performance.now();
for (const q of queries) search(index, { q, dep: [5] });
const per = (performance.now() - t0) / queries.length;
console.log(`all checks passed; ${per.toFixed(1)} ms per query over ${index.docs.length} courses`);
assert.ok(per < 25, 'search stays fast');
