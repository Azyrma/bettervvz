import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { call, isAdvancedQuery } from '../search/client';
import { getCourseSchedule, getUnit } from '../api/vvz';
import ProgrammePicker from '../components/ProgrammePicker';
import { COURSE_TYPES, DEPARTMENTS, FREQUENCY, LEVELS, OCCURRENCE, SECTION_TYPES, WEEKDAYS, capitalize, semesterLabel, semesterName } from '../labels';
import './CourseSearch.css';

const PAGE = 50;
const SCROLL_KEY = 'course-search-position';

let semestersPromise = null;
const loadSemesters = () => (semestersPromise ??= call('semesters').catch(e => {
  semestersPromise = null;
  throw e;
}));

const fmt = n => n.toLocaleString('de-CH').replace(/’/g, "'");
const avg = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
const baseLanguages = lg => [...new Set((lg ?? '').split(',').map(s => s.replace(/\(.*?\)/g, '').trim()).filter(Boolean))];

function readParams(sp) {
  const list = k => sp.get(k)?.split(',').filter(Boolean) ?? [];
  const num = k => (sp.get(k) ? Number(sp.get(k)) : null);
  return {
    q: sp.get('q') ?? '',
    sem: sp.get('sem'),
    prog: num('prog'),
    dep: list('dep').map(Number),
    lvl: list('lvl'),
    lang: list('lang'),
    type: list('type'),
    exam: list('exam'),
    fq: list('fq'),
    days: list('days').map(Number),
    from: sp.get('from') ?? '',
    to: sp.get('to') ?? '',
    room: sp.get('room') ?? '',
    lect: sp.get('lect') ?? '',
    cat: sp.get('cat') ?? '',
    cmin: num('cmin'),
    cmax: num('cmax'),
    rmin: num('rmin'),
    open: sp.get('open') === '1',
    occurs: sp.get('occurs') === '1',
    desc: sp.get('desc') === '1',
    structure: sp.get('structure') === '1',
    flat: sp.get('flat') === '1',
    sort: sp.get('sort') ?? 'relevance',
  };
}

function readSaved() {
  try {
    return JSON.parse(sessionStorage.getItem(SCROLL_KEY));
  } catch {
    return null;
  }
}

let hoverTimer;
function prefetch(id) {
  clearTimeout(hoverTimer);
  hoverTimer = setTimeout(() => {
    getUnit(id).catch(() => {});
    getCourseSchedule(id).catch(() => {});
  }, 120);
}

function ResultRow({ u, semkez, onOpen }) {
  const sems = u.sm?.map(semesterLabel);
  const rating = u.cr ? avg(u.cr) : null;
  const depList = (u.dp ?? []).map(d => DEPARTMENTS[d]?.[0]).filter(Boolean);
  const deps = depList.length > 3 ? `${depList.slice(0, 3).join(', ')} +${depList.length - 3}` : depList.join(', ');
  return (
    <li>
      <Link
        to={`/courses/${u.id}?sem=${u.sk ?? semkez}`}
        state={{ unit: u }}
        className="result"
        onClick={onOpen}
        onPointerEnter={() => prefetch(u.id)}
        onPointerLeave={() => clearTimeout(hoverTimer)}
      >
        <span className="result-no">
          {u.no}
          {u.linkType && u.linkType.split(' ').map(t => (
            <abbr key={t} className="link-type" title={SECTION_TYPES[t] ?? t}>{t}</abbr>
          ))}
        </span>
        <span className="result-credits">
          {u.c != null ? <><b>{Number(u.c)}</b> ECTS</> : '–'}
        </span>
        <span className="result-title">{u.t}</span>
        {u.tg && <span className="result-sub">{u.tg}</span>}
        <span className="result-meta">
          {u.lv?.map(l => <span key={l} className="tag" title={LEVELS[l]}>{l}</span>)}
          {u.oc && <span className="tag tag-warn">{OCCURRENCE[u.oc] ?? u.oc}</span>}
          {u.rs && <span className="tag tag-warn" title="Registration is restricted, e.g. priority for a target group">Restricted</span>}
          {u.hr && <span title={u.ty?.map(t => COURSE_TYPES[t]).join(', ')}>{u.hr.join('+')}</span>}
          {u.lg && <span>{baseLanguages(u.lg).join(' / ')}</span>}
          {deps && <span>{deps}</span>}
          {u.ex && <span>{capitalize(u.ex)}</span>}
          {rating != null && <span className="result-rating" title="CourseReview average">★ {rating.toFixed(1)}</span>}
          {sems && (
            <span className="result-sems" title={`Offered in ${sems.join(', ')}`}>
              {sems.slice(0, 3).join(' · ')}{sems.length > 3 && ` +${sems.length - 3}`}
            </span>
          )}
        </span>
        {u.cm && <span className="result-note">{u.cm}</span>}
        {u.lec && <span className="result-lec">{u.lec.join(', ')}</span>}
        {u.paths?.length > 0 && (
          <span className="result-paths">
            {u.paths.slice(0, 3).map(path => <span key={path.join('|')}>{path.join(' › ')}</span>)}
            {u.paths.length > 3 && <span>+{u.paths.length - 3} more</span>}
          </span>
        )}
      </Link>
    </li>
  );
}

// VVZ-style section header ("Majors › Major in Data Management Systems › Core Courses") before a block of courses.
function ResultGroup({ heading, children }) {
  if (!heading) return children;
  return (
    <>
      <li className="group-head">{(heading.length > 1 ? heading.slice(1) : heading).join(' › ')}</li>
      {children}
    </>
  );
}

function CheckList({ options, selected, counts, onToggle }) {
  return (
    <ul className="checklist">
      {options.map(([value, label, hint]) => {
        const n = counts?.[value] ?? 0;
        const on = selected.includes(value);
        return (
          <li key={value}>
            <label className={!n && !on ? 'dim' : ''}>
              <input type="checkbox" checked={on} onChange={() => onToggle(value)} />
              <span className="checklist-label">
                {label}
                {hint && <span className="checklist-hint">{hint}</span>}
              </span>
              <span className="count">{fmt(n)}</span>
            </label>
          </li>
        );
      })}
    </ul>
  );
}

function ChipToggles({ options, selected, counts, onToggle }) {
  return (
    <div className="chips">
      {options.map(([value, label, title]) => {
        const on = selected.includes(value);
        const n = counts?.[value];
        return (
          <button
            type="button"
            key={value}
            title={title}
            className={`chip${on ? ' on' : ''}${counts && !n && !on ? ' dim' : ''}`}
            aria-pressed={on}
            onClick={() => onToggle(value)}
          >
            {label}
            {counts && <span className="count">{fmt(n ?? 0)}</span>}
          </button>
        );
      })}
    </div>
  );
}

const SYNTAX = [
  ['t', 'title (English or German)', 't:analysis'],
  ['n', 'course number', 'n:252-0027'],
  ['l', 'lecturer', 'l:Schwerhoff'],
  ['c', 'credits, also > < >= <= !=', 'c>=6'],
  ['d', 'descriptions (abstract, content, …)', 'd:"reinforcement learning"'],
  ['dep', 'department (fuzzy)', 'dep:computer'],
  ['lvl', 'level: BSC, MSC, DR, …', 'lvl:MSC'],
  ['o', 'offered in programme / section', 'o:"computer science master" o:"core course"'],
  ['e', 'exam type', 'e:"session examination"'],
  ['lang', 'teaching language', 'lang:German'],
  ['cr', 'CourseReview rating 0–5', 'cr>=4'],
  ['restricted', 'priority / registration restriction', 'restricted:false'],
  ['ptg', 'primary target group', 'ptg:"Data Science"'],
];

function SyntaxHelp({ onExample }) {
  return (
    <div className="syntax">
      <p>
        Queries with <code>key:value</code> filters, <code>OR</code>, parentheses or <code>-negation</code> are
        answered by <a href="https://vvzapi.ch/guide" target="_blank" rel="noreferrer">vvzapi.ch</a> for the
        selected semester. Plain text uses the instant typo-tolerant search.
      </p>
      <table>
        <tbody>
          {SYNTAX.map(([key, what, example]) => (
            <tr key={key}>
              <th><code>{key}</code></th>
              <td>
                {what}
                <button type="button" className="syntax-example" onClick={() => onExample(example)}>{example}</button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function CourseSearch() {
  const [sp, setSp] = useSearchParams();
  const key = sp.toString();
  const p = useMemo(() => readParams(new URLSearchParams(key)), [key]);

  const [manifest, setManifest] = useState(null);
  const [meta, setMeta] = useState(null);
  const [res, setRes] = useState(null);
  const [fresh, setFresh] = useState(null);
  const [error, setError] = useState(null);
  const [saved] = useState(readSaved);
  const [page, setPage] = useState(() => (saved?.key === key ? { key, limit: saved.limit } : { key: null, limit: PAGE }));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const restored = useRef(false);
  const inputRef = useRef(null);

  const semkez = p.sem ?? manifest?.latest;
  const anySem = semkez === 'all';
  const semName = anySem ? 'all semesters' : semkez ? semesterLabel(semkez) : '';
  // Semesters missing from the local index (published on vvzapi.ch since the last build) are searched live.
  const liveOnly = !!manifest && !anySem && !manifest.semesters.some(s => s.semkez === semkez && !s.live);
  const advanced = liveOnly || isAdvancedQuery(p.q);
  const plainQuery = !advanced && p.q.trim().length >= 3;
  const limit = page.key === key ? page.limit : PAGE;
  const resKey = `${semkez}|${key}|${limit}`;
  const loading = !res || res.key !== resKey;

  const update = useCallback(changes => {
    setSp(prev => {
      const next = new URLSearchParams(prev);
      for (const [k, v] of Object.entries(changes)) {
        const s = Array.isArray(v) ? v.join(',') : v === true ? '1' : v === false || v == null ? '' : String(v);
        if (s) next.set(k, s);
        else next.delete(k);
      }
      return next;
    }, { replace: true });
  }, [setSp]);

  const toggle = (k, value) => update({ [k]: p[k].includes(value) ? p[k].filter(v => v !== value) : [...p[k], value] });

  useEffect(() => {
    loadSemesters()
      .then(local => {
        setManifest(local);
        return call('liveSemesters').then(setManifest);
      })
      .catch(e => setError(e.message));
  }, []);

  useEffect(() => {
    if (!manifest || !semkez || liveOnly) return;
    let alive = true;
    call('meta', { semkez })
      .then(m => alive && setMeta({ semkez, ...m }))
      .catch(e => alive && setError(e.message));
    return () => { alive = false; };
  }, [manifest, semkez, liveOnly]);

  useEffect(() => {
    if (!manifest || !semkez) return;
    let alive = true;
    const run = () => call(advanced ? 'live' : 'search', { ...p, q: p.q.trim(), semkez, limit, indexed: !liveOnly })
      .then(r => {
        if (!alive) return;
        setRes({ ...r, key: `${semkez}|${key}|${limit}`, advanced });
        setError(null);
      })
      .catch(e => alive && setError(e.message));
    // Local search answers in milliseconds; only vvzapi.ch queries wait for typing to pause.
    const timer = setTimeout(run, advanced ? 400 : 0);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [manifest, semkez, key, p, limit, advanced, liveOnly]);

  // Once typing pauses, ask vvzapi.ch too, for courses newer than the local index.
  useEffect(() => {
    if (!manifest || !semkez || !plainQuery || liveOnly) return;
    let alive = true;
    const timer = setTimeout(() => {
      call('fresh', { ...p, q: p.q.trim(), semkez })
        .then(r => alive && setFresh({ ...r, key: `${semkez}|${key}` }))
        .catch(() => alive && setFresh({ checked: false, items: [], key: `${semkez}|${key}` }));
    }, 600);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [manifest, semkez, key, p, plainQuery, liveOnly]);
  const freshNow = plainQuery && fresh?.key === `${semkez}|${key}` ? fresh : null;

  // Coming back from a course page: restore how far the list was scrolled.
  useEffect(() => {
    if (restored.current || loading || saved?.key !== key) return;
    restored.current = true;
    window.scrollTo(0, saved.y);
  }, [loading, saved, key]);

  useEffect(() => {
    const onKey = e => {
      if (e.key === '/' && !['INPUT', 'SELECT', 'TEXTAREA'].includes(document.activeElement?.tagName)) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    document.body.style.overflow = filtersOpen ? 'hidden' : '';
    return () => { document.body.style.overflow = ''; };
  }, [filtersOpen]);

  const remember = () => {
    try {
      sessionStorage.setItem(SCROLL_KEY, JSON.stringify({ key, limit, y: window.scrollY }));
    } catch { /* storage unavailable */ }
  };

  const hasMore = res && !loading && res.items.length < (res.rows ?? res.total);
  const sentinel = useCallback(node => {
    if (!node) return;
    const io = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) setPage({ key, limit: limit + PAGE });
    }, { rootMargin: '600px' });
    io.observe(node);
    return () => io.disconnect();
  }, [key, limit]);

  const facets = !advanced && res?.facets;
  const metaReady = meta != null && meta.semkez === semkez;
  const sections = metaReady ? meta.sections : null;
  const timed = metaReady ? meta.timed : null;
  const semCount = metaReady ? meta.total : null;
  const sectionName = sections?.find(s => s.id === p.prog)?.name;

  const active = [
    p.prog != null && { label: sectionName ?? 'Programme', clear: { prog: null } },
    ...p.dep.map(d => ({ label: DEPARTMENTS[d]?.[0] ?? d, clear: { dep: p.dep.filter(x => x !== d) } })),
    ...p.lvl.map(l => ({ label: l, clear: { lvl: p.lvl.filter(x => x !== l) } })),
    (p.cmin != null || p.cmax != null) && {
      label: p.cmin === p.cmax ? `${p.cmin} ECTS` : `${p.cmin ?? 0}–${p.cmax ?? '∞'} ECTS`,
      clear: { cmin: null, cmax: null },
    },
    ...p.type.map(t => ({ label: COURSE_TYPES[t] ?? t, clear: { type: p.type.filter(x => x !== t) } })),
    ...p.lang.map(l => ({ label: l, clear: { lang: p.lang.filter(x => x !== l) } })),
    ...p.exam.map(x => ({ label: capitalize(x), clear: { exam: p.exam.filter(y => y !== x) } })),
    ...p.fq.map(f => ({ label: FREQUENCY[f] ?? f, clear: { fq: p.fq.filter(x => x !== f) } })),
    p.lect && { label: `Lecturer: ${p.lect}`, clear: { lect: null } },
    p.cat && { label: `Catalogue data: ${p.cat}`, clear: { cat: null } },
    p.room && { label: `Room: ${p.room}`, clear: { room: null } },
    (p.days.length > 0 || p.from || p.to) && {
      label: [p.days.map(d => WEEKDAYS[d]).join(', '), (p.from || p.to) && `${p.from || '…'}–${p.to || '…'}`].filter(Boolean).join(' '),
      clear: { days: null, from: null, to: null },
    },
    p.open && { label: 'Open registration', clear: { open: null } },
    p.occurs && { label: 'Taking place', clear: { occurs: null } },
    p.rmin != null && { label: `★ ≥ ${p.rmin}`, clear: { rmin: null } },
  ].filter(Boolean);
  const clearAll = Object.assign({}, ...active.map(a => a.clear));

  const languages = facets ? Object.keys(facets.lang).sort((a, b) => facets.lang[b] - facets.lang[a]) : p.lang;
  const exams = facets ? Object.keys(facets.exam).sort((a, b) => facets.exam[b] - facets.exam[a]) : p.exam;

  const filterPanel = advanced ? (
    <SyntaxHelp onExample={ex => update({ q: ex })} />
  ) : (
    <>
      <details className="filter-group" open>
        <summary>Programme</summary>
        {sections ? (
          <ProgrammePicker sections={sections} value={p.prog} onChange={id => update({ prog: id })} />
        ) : <p className="filter-note">Loading sections…</p>}
      </details>

      <details className="filter-group" open>
        <summary>Department</summary>
        <CheckList
          options={Object.entries(DEPARTMENTS).map(([id, [short, name]]) => [Number(id), short, name])}
          selected={p.dep}
          counts={facets?.dep}
          onToggle={v => toggle('dep', v)}
        />
      </details>

      <details className="filter-group" open>
        <summary>Level</summary>
        <ChipToggles
          options={Object.entries(LEVELS)
            .filter(([l]) => facets?.lvl[l] || p.lvl.includes(l))
            .map(([l, name]) => [l, l, name])}
          selected={p.lvl}
          counts={facets?.lvl}
          onToggle={v => toggle('lvl', v)}
        />
      </details>

      <details className="filter-group" open>
        <summary>ECTS credits</summary>
        <div className="range">
          <label>
            <span>Min</span>
            <input type="number" inputMode="decimal" min="0" max="60" step="1" value={p.cmin ?? ''} placeholder="0"
              onChange={e => update({ cmin: e.target.value === '' ? null : e.target.value })} />
          </label>
          <span aria-hidden="true">–</span>
          <label>
            <span>Max</span>
            <input type="number" inputMode="decimal" min="0" max="60" step="1" value={p.cmax ?? ''} placeholder="any"
              onChange={e => update({ cmax: e.target.value === '' ? null : e.target.value })} />
          </label>
        </div>
        <div className="chips chips-quick">
          {[2, 3, 4, 5, 6, 7, 8, 10].map(c => (
            <button type="button" key={c} className={`chip${p.cmin === c && p.cmax === c ? ' on' : ''}`}
              onClick={() => update(p.cmin === c && p.cmax === c ? { cmin: null, cmax: null } : { cmin: c, cmax: c })}>
              {c}
            </button>
          ))}
        </div>
      </details>

      <details className="filter-group" open>
        <summary>Course type</summary>
        <ChipToggles
          options={Object.entries(COURSE_TYPES)
            .filter(([t]) => facets?.type[t] || p.type.includes(t))
            .map(([t, name]) => [t, name, t])}
          selected={p.type}
          counts={facets?.type}
          onToggle={v => toggle('type', v)}
        />
      </details>

      <details className="filter-group" open={!!p.lect}>
        <summary>Lecturer</summary>
        <input type="search" className="text-filter" placeholder="Name — typos are fine" value={p.lect}
          onChange={e => update({ lect: e.target.value })} aria-label="Lecturer name" />
      </details>

      <details className="filter-group" open={!!p.cat}>
        <summary>Catalogue data</summary>
        {anySem && <p className="filter-note">Pick a specific semester to search catalogue data.</p>}
        <input type="search" className="text-filter" placeholder="Words in abstract, content, literature…" value={p.cat}
          disabled={anySem} onChange={e => update({ cat: e.target.value })} aria-label="Catalogue data" />
      </details>

      <details className="filter-group" open={p.lang.length > 0}>
        <summary>Language</summary>
        <CheckList options={languages.map(l => [l, l])} selected={p.lang} counts={facets?.lang} onToggle={v => toggle('lang', v)} />
      </details>

      <details className="filter-group" open={p.exam.length > 0}>
        <summary>Performance assessment</summary>
        <CheckList options={exams.map(x => [x, capitalize(x)])} selected={p.exam} counts={facets?.exam} onToggle={v => toggle('exam', v)} />
      </details>

      <details className="filter-group" open={p.fq.length > 0}>
        <summary>Periodicity</summary>
        <CheckList
          options={Object.entries(FREQUENCY).filter(([f]) => facets?.fq?.[f] || p.fq.includes(f))}
          selected={p.fq}
          counts={facets?.fq}
          onToggle={v => toggle('fq', v)}
        />
      </details>

      <details className="filter-group" open={p.days.length > 0 || !!p.from || !!p.to || !!p.room}>
        <summary>Day, time &amp; place</summary>
        {timed === 0 && (
          <p className="filter-note">vvzapi.ch has no times or rooms for {semName} yet, so this filter is off.</p>
        )}
        {timed > 0 && timed < semCount / 2 && (
          <p className="filter-note">
            Only {fmt(timed)} of {fmt(semCount)} courses in {semName} have times or rooms on vvzapi.ch so far;
            the others are hidden while this filter is on.
          </p>
        )}
        <fieldset disabled={timed === 0}>
          <div className="chips">
            {WEEKDAYS.slice(0, 6).map((d, i) => (
              <button type="button" key={d} className={`chip${p.days.includes(i) ? ' on' : ''}`} aria-pressed={p.days.includes(i)}
                onClick={() => toggle('days', i)}>{d}</button>
            ))}
          </div>
          <div className="range">
            <label>
              <span>From</span>
              <input type="time" step="900" value={p.from} onChange={e => update({ from: e.target.value })} />
            </label>
            <span aria-hidden="true">–</span>
            <label>
              <span>Until</span>
              <input type="time" step="900" value={p.to} onChange={e => update({ to: e.target.value })} />
            </label>
          </div>
          <input type="search" className="text-filter" placeholder="Building or room, e.g. HG or CAB G 61" value={p.room}
            onChange={e => update({ room: e.target.value })} aria-label="Building or room" />
        </fieldset>
      </details>

      <details className="filter-group" open={p.open || p.occurs || p.rmin != null}>
        <summary>More</summary>
        <label className="check">
          <input type="checkbox" checked={p.open} onChange={e => update({ open: e.target.checked })} />
          No registration restriction
        </label>
        <label className="check">
          <input type="checkbox" checked={p.occurs} onChange={e => update({ occurs: e.target.checked })} />
          Hide courses not taking place
        </label>
        <label className="select-row">
          <span>CourseReview rating</span>
          <select value={p.rmin ?? ''} onChange={e => update({ rmin: e.target.value || null })}>
            <option value="">Any</option>
            {[3, 3.5, 4, 4.5].map(r => <option key={r} value={r}>★ {r}+</option>)}
          </select>
        </label>
      </details>
    </>
  );

  return (
    <main className="search">
      <section className="search-hero">
        <div className="container">
          <h1 className="search-heading">Course catalogue</h1>
          <form className="searchbar" role="search" onSubmit={e => { e.preventDefault(); inputRef.current?.blur(); }}>
            <label className="searchbox">
              <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="10.5" cy="10.5" r="6.5" /><path d="m15.5 15.5 5 5" /></svg>
              <input
                ref={inputRef}
                type="search"
                enterKeyHint="search"
                autoComplete="off"
                spellCheck="false"
                placeholder="Title, number or lecturer — typos are fine"
                value={p.q}
                onChange={e => update({ q: e.target.value })}
                aria-label="Search courses"
              />
            </label>
            <label className="semester">
              <span className="visually-hidden">Semester</span>
              <select value={semkez ?? ''} onChange={e => update({ sem: e.target.value, prog: null })}>
                {!manifest && <option value="">…</option>}
                {manifest && <option value="all">Any semester</option>}
                {manifest?.semesters.map(s => (
                  <option key={s.semkez} value={s.semkez}>{semesterLabel(s.semkez)} · {semesterName(s.semkez)}</option>
                ))}
              </select>
            </label>
          </form>
          <div className="search-options">
            <label className="check">
              <input type="checkbox" checked={p.desc && !anySem} disabled={advanced || anySem} onChange={e => update({ desc: e.target.checked })} />
              Also search catalogue data
            </label>
            {p.prog != null && !advanced ? (
              <label className="check">
                <input type="checkbox" checked={!p.flat} onChange={e => update({ flat: !e.target.checked })} />
                Group by programme structure
              </label>
            ) : (
              <label className="check">
                <input type="checkbox" checked={p.structure} disabled={advanced} onChange={e => update({ structure: e.target.checked })} />
                Show programmes in results
              </label>
            )}
            {advanced
              ? <span className="mode-badge">{liveOnly ? `Live from vvzapi.ch · ${semesterLabel(semkez)} not indexed yet` : 'Advanced query · vvzapi.ch'}</span>
              : <details className="syntax-toggle">
                  <summary>Advanced syntax</summary>
                  <SyntaxHelp onExample={ex => update({ q: ex })} />
                </details>}
          </div>
        </div>
      </section>

      <div className="container search-body">
        <aside className={`filters${filtersOpen ? ' open' : ''}`} aria-label="Filters">
          <div className="filters-backdrop" onClick={() => setFiltersOpen(false)} />
          <div className="filters-panel">
            <div className="filters-head">
              <h2>{advanced ? 'Query syntax' : 'Filters'}</h2>
              {active.length > 0 && !advanced && (
                <button type="button" className="link-btn" onClick={() => update(clearAll)}>Reset all</button>
              )}
            </div>
            {filterPanel}
            <div className="filters-foot">
              <button type="button" className="btn-primary" onClick={() => setFiltersOpen(false)}>
                Show {res ? fmt(res.total) : ''} courses
              </button>
            </div>
          </div>
        </aside>

        <section className="results" aria-live="polite" aria-busy={loading}>
          <div className="results-bar">
            <p className="results-count">
              {res ? <><b>{fmt(res.total)}</b> {res.total === 1 ? 'course' : 'courses'}</> : 'Loading courses…'}
              {res && semkez && <> in {semName}</>}
              {res?.ms != null && <span className="results-ms"> · {res.advanced ? 'vvzapi.ch ' : ''}{res.ms} ms</span>}
              {freshNow?.checked && <span className="results-ms" title="This search was also run on vvzapi.ch to catch courses newer than the local index"> · checked with vvzapi.ch</span>}
            </p>
            <div className="results-tools">
              <button type="button" className="filters-btn" onClick={() => setFiltersOpen(true)}>
                {advanced ? 'Syntax' : 'Filters'}{!advanced && active.length > 0 && <span className="filters-btn-count">{active.length}</span>}
              </button>
              <label className="sort">
                <span>Sort</span>
                <select value={p.sort} onChange={e => update({ sort: e.target.value === 'relevance' ? null : e.target.value })}>
                  <option value="relevance">{p.q.trim() && !advanced ? 'Best match' : 'Number'}</option>
                  <option value="title">Title</option>
                  <option value="credits">ECTS</option>
                  <option value="rating">Rating</option>
                </select>
              </label>
            </div>
          </div>

          {!advanced && active.length > 0 && (
            <div className="active-filters">
              {active.map(a => (
                <button type="button" key={a.label} className="active-chip" onClick={() => update(a.clear)}>
                  {a.label}<span aria-hidden="true">×</span><span className="visually-hidden">remove filter</span>
                </button>
              ))}
              {active.length > 1 && <button type="button" className="link-btn" onClick={() => update(clearAll)}>Clear all</button>}
            </div>
          )}

          {advanced && res?.parsed && <p className="parsed">Parsed as <code>{res.parsed}</code></p>}
          {loading && <div className="progress" aria-hidden="true" />}
          {error && <p className="status error">{error}</p>}

          {res && res.items.length > 0 && (
            <ol className="result-list">
              {res.items.map((u, i) => (
                <ResultGroup key={u.group ? `${u.group}-${u.id}` : u.id} heading={u.group && u.group !== res.items[i - 1]?.group ? res.groups[u.group] : null}>
                  <ResultRow u={u} semkez={semkez} onOpen={remember} />
                </ResultGroup>
              ))}
            </ol>
          )}
          {hasMore && <div ref={sentinel} className="sentinel" />}

          {!hasMore && freshNow?.items.length > 0 && (
            <section className="fresh">
              <h3>New on vvzapi.ch <span>not in the local index yet</span></h3>
              <ol className="result-list">
                {freshNow.items.map(u => <ResultRow key={u.id} u={u} semkez={semkez} onOpen={remember} />)}
              </ol>
            </section>
          )}

          {res && !loading && res.total === 0 && !freshNow?.items.length && (
            <div className="empty">
              <p>No courses match{p.q.trim() ? <> “{p.q.trim()}”</> : ''}.</p>
              <div className="empty-actions">
                {active.length > 0 && !advanced && <button type="button" className="btn-secondary" onClick={() => update(clearAll)}>Clear filters</button>}
                {!p.desc && !advanced && p.q.trim() && <button type="button" className="btn-secondary" onClick={() => update({ desc: true })}>Search descriptions too</button>}
              </div>
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export default CourseSearch;
