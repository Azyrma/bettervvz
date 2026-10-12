// Builds the compact per-semester search indexes in public/data/ from the vvzapi.ch data dump.
// The full search payload is ~37 KB per course (every semester, every text field), so the client
// searches these slim indexes instead and fetches full course details from vvzapi.ch on demand.
import { createHash } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createInflateRaw } from 'node:zlib';
import { normalize } from '../src/search/normalize.js';

const DUMP = 'https://vvzapi.ch/api/v2/dump';
const CACHE = '.cache';
const OUT = 'public/data';

// Single-entry zip extraction; the dump is one deflated SQLite file well below the zip64 limits.
async function unzipSingle(zipPath, outPath) {
  const fd = fs.openSync(zipPath, 'r');
  const { size } = fs.fstatSync(fd);
  const tail = Buffer.alloc(Math.min(size, 65557));
  fs.readSync(fd, tail, 0, tail.length, size - tail.length);
  const eocd = tail.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (eocd < 0) throw new Error('Dump is not a zip file');
  const cdOffset = tail.readUInt32LE(eocd + 16);
  const cd = Buffer.alloc(46);
  fs.readSync(fd, cd, 0, 46, cdOffset);
  const method = cd.readUInt16LE(10);
  const compressed = cd.readUInt32LE(20);
  const localOffset = cd.readUInt32LE(42);
  if (method !== 8 || compressed === 0xffffffff) throw new Error('Unsupported zip entry in dump');
  const local = Buffer.alloc(30);
  fs.readSync(fd, local, 0, 30, localOffset);
  const start = localOffset + 30 + local.readUInt16LE(26) + local.readUInt16LE(28);
  fs.closeSync(fd);
  await pipeline(
    fs.createReadStream(zipPath, { start, end: start + compressed - 1 }),
    createInflateRaw(),
    fs.createWriteStream(outPath),
  );
}

async function ensureDump() {
  fs.mkdirSync(CACHE, { recursive: true });
  const cached = () => fs.readdirSync(CACHE).filter(f => /^vvz-\d+\.db$/.test(f)).sort().pop();
  let version;
  try {
    const res = await fetch(`${DUMP}/metadata`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    version = (await res.json()).last_modified_ms;
  } catch (e) {
    const db = cached();
    if (!db) throw new Error(`Cannot reach vvzapi.ch and no cached dump exists (${e.message})`);
    console.warn(`vvzapi.ch unreachable (${e.message}), using cached ${db}`);
    return { db: `${CACHE}/${db}`, version: Number(db.slice(4, -3)) };
  }
  const db = `${CACHE}/vvz-${version}.db`;
  if (fs.existsSync(db)) return { db, version };

  console.log('Downloading vvzapi.ch data dump…');
  const res = await fetch(DUMP);
  if (!res.ok) throw new Error(`Dump download failed: HTTP ${res.status}`);
  const zip = `${CACHE}/dump.zip`;
  await pipeline(Readable.fromWeb(res.body), fs.createWriteStream(zip));
  await unzipSingle(zip, `${db}.tmp`);
  fs.renameSync(`${db}.tmp`, db);
  fs.rmSync(zip);
  for (const f of fs.readdirSync(CACHE)) {
    if (f.startsWith('vvz-') && `${CACHE}/${f}` !== db) fs.rmSync(`${CACHE}/${f}`);
  }
  return { db, version };
}

const json = s => (s == null || s === 'null' ? null : JSON.parse(s));
const num = h => String(Number(h));
// VVZ lists course hours in this order, e.g. "4V+2U".
const TYPE_ORDER = 'VGUSPKADR';
const byType = (a, b) => TYPE_ORDER.indexOf(a) - TYPE_ORDER.indexOf(b);

function buildSemester(db, semkez) {
  const units = new Map();
  const byNumber = new Map();
  const rows = db.prepare(`
    SELECT u.id, u.number, u.title, u.title_english, u.credits, u.levels, u.departments, u.language,
           u.exam_type, u.priority, u.max_places, u.course_frequency, u.occurence, u."groups", u.scraped_at,
           COALESCE(u.abstract_english, u.abstract) AS abstract, COALESCE(u.objective_english, u.objective) AS objective,
           COALESCE(u.content_english, u.content) AS content,
           COALESCE(u.literature_english, u.literature) AS literature,
           COALESCE(u.lecture_notes_english, u.lecture_notes) AS lecture_notes,
           COALESCE(u.additional_english, u.additional) AS additional,
           COALESCE(u.comment_english, u.comment) AS comment,
           r.recommended, r.engaging, r.difficulty, r.effort, r.resources
    FROM learningunit u LEFT JOIN rating r ON r.course_number = u.number
    WHERE u.semkez = ? AND u.number IS NOT NULL AND u.title IS NOT NULL`).all(semkez);
  for (const u of rows) {
    // A few numbers were scraped twice in one semester; keep the newest copy.
    const prev = byNumber.get(u.number);
    if (prev && prev.scraped_at >= u.scraped_at) continue;
    if (prev) units.delete(prev.id);
    byNumber.set(u.number, u);
    const ratings = [u.recommended, u.engaging, u.difficulty, u.effort, u.resources];
    units.set(u.id, {
      id: u.id,
      no: u.number,
      t: u.title_english || u.title,
      ...(u.title_english && u.title_english !== u.title && { tg: u.title }),
      c: u.credits,
      lv: json(u.levels) ?? [],
      dp: (json(u.departments) ?? []).map(Number),
      lg: u.language || null,
      ex: u.exam_type || null,
      ...(u.priority && { rs: 1 }),
      // VVZ shows the unit's comment right in the result list ("Only one of the two courses can be counted…").
      ...(u.comment && { cm: u.comment }),
      ...(u.max_places > 0 && { mp: u.max_places }),
      fq: u.course_frequency || null,
      ...(u.occurence && { oc: u.occurence }),
      ...(u.recommended != null && { cr: ratings.map(x => Math.round(x * 100) / 100) }),
      hr: [],
      ty: [],
      ts: [],
      rm: [],
      lec: [],
      sec: [],
      _seen: new Set(),
      _groups: json(u.groups) ?? [],
      _text: normalize([u.abstract, u.objective, u.content, u.literature, u.lecture_notes, u.additional, u.comment].filter(Boolean).join(' ')),
      scraped_at: u.scraped_at,
    });
  }

  const courses = db.prepare(
    'SELECT unit_id, type, hours, hour_type, timeslots FROM course WHERE semkez = ? ORDER BY number',
  ).all(semkez);
  const addSlots = (u, slots, type) => {
    for (const s of slots ?? []) {
      const room = [s.building, s.floor, s.room].filter(Boolean).join(' ');
      if (room && !u.rm.includes(room)) u.rm.push(room);
      if (s.weekday > 6 || !s.start_time) continue;
      const key = `${s.weekday}|${s.start_time}|${s.end_time}|${type}`;
      if (u._seen.has(key)) continue;
      u._seen.add(key);
      u.ts.push([s.weekday, s.start_time, s.end_time, type]);
    }
  };
  for (const c of courses) {
    const u = units.get(c.unit_id);
    if (!u) continue;
    if (!u.ty.includes(c.type)) u.ty.push(c.type);
    if (c.hours) u.hr.push(c.hour_type === 'SEMESTER_HOURS' ? `${num(c.hours)}s ${c.type}` : `${num(c.hours)}${c.type}`);
    addSlots(u, json(c.timeslots), c.type);
  }
  // Exercise groups carry their own times, sometimes even when the course itself has none yet.
  for (const u of units.values()) {
    for (const g of u._groups) addSlots(u, g.timeslots, g.number?.at(-1) ?? 'U');
  }

  const lecturers = db.prepare(`
    SELECT l.unit_id, le.name, le.surname FROM unitlecturerlink l
    JOIN lecturer le ON le.id = l.lecturer_id
    JOIN learningunit u ON u.id = l.unit_id WHERE u.semkez = ?`).all(semkez);
  for (const l of lecturers) {
    const name = [l.name, l.surname].filter(Boolean).join(' ');
    const u = units.get(l.unit_id);
    if (u && name && !u.lec.includes(name)) u.lec.push(name);
  }

  const links = db.prepare(`
    SELECT l.unit_id, l.section_id, l.type FROM unitsectionlink l
    JOIN learningunit u ON u.id = l.unit_id WHERE u.semkez = ?`).all(semkez);
  for (const l of links) units.get(l.unit_id)?.sec.push(l.type ? [l.section_id, l.type] : [l.section_id]);

  const sections = db.prepare(
    'SELECT id, parent_id, name, name_english FROM section WHERE semkez = ? ORDER BY id',
  ).all(semkez).map(s => [s.id, s.parent_id, s.name_english || s.name]);

  const list = [...units.values()].sort((a, b) => a.no.localeCompare(b.no));
  const text = {};
  for (const u of list) {
    u.ty.sort(byType);
    u.hr.sort((a, b) => byType(a.at(-1), b.at(-1)));
    if (u._text) text[u.id] = u._text;
    delete u._seen;
    delete u._groups;
    delete u._text;
    delete u.scraped_at;
    for (const k of ['hr', 'ty', 'ts', 'rm', 'lec', 'sec']) if (!u[k].length) delete u[k];
  }
  return { index: { semkez, units: list, sections }, text };
}

async function main() {
  const { db: dbPath, version } = await ensureDump();
  // Regenerate only when the dump or this builder changed.
  const build = createHash('sha1')
    .update(fs.readFileSync(new URL(import.meta.url)))
    .update(fs.readFileSync(new URL('../src/search/normalize.js', import.meta.url)))
    .digest('hex');
  try {
    const prev = JSON.parse(fs.readFileSync(`${OUT}/semesters.json`, 'utf8'));
    if (prev.version === version && prev.build === build) return console.log('Course data is up to date.');
  } catch { /* no previous data */ }

  const db = new DatabaseSync(dbPath, { readOnly: true });
  const semkezs = db.prepare('SELECT DISTINCT semkez FROM learningunit ORDER BY semkez DESC').all().map(r => r.semkez);
  const latest = db.prepare('SELECT semkez FROM latestsemkez ORDER BY scraped_at DESC LIMIT 1').get()?.semkez;

  // Overwrite in place rather than recreating the folder: a running dev server can lose track
  // of public files that are deleted and re-added in one burst, and then serves index.html instead.
  fs.mkdirSync(OUT, { recursive: true });
  const stale = new Set(fs.readdirSync(OUT));
  const write = (name, data) => {
    fs.writeFileSync(`${OUT}/${name}`, JSON.stringify(data));
    stale.delete(name);
  };
  const semesters = [];
  for (const semkez of semkezs) {
    const { index, text } = buildSemester(db, semkez);
    if (!index.units.length) continue;
    write(`${semkez}.json`, index);
    // Catalogue data (abstract, objective, content, literature, …) for full-text search; only fetched when that toggle is on.
    write(`${semkez}.text.json`, text);
    semesters.push({ semkez, count: index.units.length });
  }
  write('semesters.json', {
    version,
    build,
    latest: latest ?? semesters[0]?.semkez,
    semesters,
  });
  for (const name of stale) fs.rmSync(`${OUT}/${name}`);
  db.close();
  console.log(`Wrote ${semesters.length} semester indexes (dump ${new Date(version).toISOString()}) to ${OUT}/`);
}

main().catch(e => {
  if (fs.existsSync(`${OUT}/semesters.json`)) {
    console.warn(`Keeping existing data in ${OUT}/: ${e.message}`);
  } else {
    console.error(e.message);
    process.exit(1);
  }
});
