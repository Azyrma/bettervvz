import { useState, useEffect, useRef, useCallback } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { searchCourses, getSemesters, getSectionIds, getSection, getCourseSchedule } from '../api/vvz';
import './CourseSearch.css';

const SEMESTERS = [
  { label: 'Spring (FS)', value: 'FS' },
  { label: 'Autumn (HS)', value: 'HS' },
];

const WEEKDAYS = [
  { label: 'Mon', value: 0 },
  { label: 'Tue', value: 1 },
  { label: 'Wed', value: 2 },
  { label: 'Thu', value: 3 },
  { label: 'Fri', value: 4 },
];

const PAGE_SIZE = 100;

function sectionDisplayName(section) {
  return section.name_english ?? section.name ?? `Section ${section.id}`;
}

function buildQuery(text, sectionPath, semester, year, credits) {
  const parts = [];
  for (const section of sectionPath) {
    parts.push(`off:"${section.name}"`);
  }
  if (text.trim()) parts.push(text.trim());
  if (semester) parts.push(`s:${semester}`);
  if (year) parts.push(`year:${year}`);
  else parts.push('year>=2020');
  if (credits > 0) parts.push(`credits:${credits}`);
  return parts.join(' ');
}

function semkezRank(semkez) {
  if (!semkez || semkez.length < 5) return 0;
  const year = parseInt(semkez.slice(0, 4), 10);
  return year * 2 + (semkez[4] === 'W' ? 1 : 0);
}

function deduplicateByTitle(courses) {
  const seen = new Map(); // title → course
  for (const course of courses) {
    const unit = course.units?.[0] ?? {};
    const title = unit.title_english || unit.title || '';
    if (!title) continue;
    const existing = seen.get(title);
    if (!existing) {
      seen.set(title, course);
    } else {
      const existingRank = semkezRank(existing.units?.[0]?.semkez);
      const currentRank = semkezRank(unit.semkez);
      if (currentRank > existingRank) seen.set(title, course);
    }
  }
  return [...seen.values()];
}

function CourseSearch({ timetableCourses = [], onToggleCourse }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [semester, setSemester] = useState(null);
  const [year, setYear] = useState('');
  const [years, setYears] = useState([]);
  const [credits, setCredits] = useState(0);
  const [latestSemkez, setLatestSemkez] = useState('');

  // Section hierarchy state
  // sectionPath[0] = selected programme, sectionPath[1] = first sub-selection, etc.
  const [sectionPath, setSectionPath] = useState([]);
  // levelOptions[i] = children of sectionPath[i], shown as the filter row at depth i+1
  const [levelOptions, setLevelOptions] = useState([]);
  const [sectionLoading, setSectionLoading] = useState(false);

  // Programme autocomplete
  const [programQuery, setProgramQuery] = useState('');
  const [programOptions, setProgramOptions] = useState([]);
  const [programLoading, setProgramLoading] = useState(false);
  const [programDropdownOpen, setProgramDropdownOpen] = useState(false);
  const programInputRef = useRef(null);
  const programDebounceRef = useRef(null);

  const [dayFilter, setDayFilter] = useState([]); // array of selected weekday indices
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [courseSchedules, setCourseSchedules] = useState({});
  const schedFetchedRef = useRef(new Set());

  const [courses, setCourses] = useState([]);
  const [total, setTotal] = useState(null);
  const [loadingInitial, setLoadingInitial] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const debounceRef = useRef(null);
  const observerRef = useRef(null);
  const effectiveQueryRef = useRef('');
  const offsetRef = useRef(0);
  const loadingInitialRef = useRef(false);
  const loadingMoreRef = useRef(false);

  // Apply filter preset passed via navigation state (e.g. from timetable popup)
  useEffect(() => {
    if (!location.state) return;
    const { presetDays, presetStart, presetEnd } = location.state;
    if (presetDays?.length) setDayFilter(presetDays);
    if (presetStart) setStartTime(presetStart);
    if (presetEnd) setEndTime(presetEnd);
    // Clear state so back-navigation doesn't re-apply
    navigate(location.pathname, { replace: true, state: null });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    getSemesters()
      .then(semesters => {
        const unique = [...new Set(semesters.map(s => s.slice(0, 4)))]
          .filter(y => Number(y) >= 2020)
          .sort((a, b) => b - a);
        setYears(unique);
        const sorted = [...semesters].sort((a, b) => b.localeCompare(a));
        if (sorted.length) setLatestSemkez(sorted[0]);
      })
      .catch(() => {});
  }, []);

  // Programme search autocomplete
  useEffect(() => {
    clearTimeout(programDebounceRef.current);
    if (!programQuery.trim() || !latestSemkez) {
      setProgramOptions([]);
      setProgramLoading(false);
      return;
    }
    setProgramLoading(true);
    programDebounceRef.current = setTimeout(async () => {
      try {
        const ids = await getSectionIds({ level: 0, semkez: latestSemkez, nameSearch: programQuery.trim(), limit: 20 });
        const sections = await Promise.all(ids.map(id => getSection(id)));
        setProgramOptions(sections.map(s => ({ id: s.id, name: sectionDisplayName(s) })));
      } catch {
        setProgramOptions([]);
      } finally {
        setProgramLoading(false);
      }
    }, 300);
    return () => clearTimeout(programDebounceRef.current);
  }, [programQuery, latestSemkez]);

  async function fetchChildren(sectionId) {
    const childIds = await getSectionIds({ parentId: sectionId, limit: 100 });
    if (!childIds.length) return [];
    const children = await Promise.all(childIds.map(id => getSection(id)));
    return children.map(s => ({ id: s.id, name: sectionDisplayName(s) }));
  }

  async function drillInto(section, depth) {
    // depth = index in sectionPath where section is being selected
    // Toggle off if already selected
    if (sectionPath[depth]?.id === section.id) {
      setSectionPath(prev => prev.slice(0, depth));
      setLevelOptions(prev => prev.slice(0, depth));
      return;
    }

    setSectionPath(prev => [...prev.slice(0, depth), section]);
    setLevelOptions(prev => prev.slice(0, depth));
    setSectionLoading(true);
    try {
      const children = await fetchChildren(section.id);
      if (children.length > 0) {
        setLevelOptions(prev => [...prev.slice(0, depth), children]);
      }
    } catch {
      // no children shown
    } finally {
      setSectionLoading(false);
    }
  }

  function selectProgram(program) {
    setProgramQuery('');
    setProgramDropdownOpen(false);
    setSectionPath([]);
    setLevelOptions([]);
    drillInto(program, 0);
  }

  function clearProgram() {
    setSectionPath([]);
    setLevelOptions([]);
    setProgramQuery('');
  }

  // Reset and fetch first page whenever filters change
  useEffect(() => {
    const effectiveQuery = buildQuery(query, sectionPath, semester, year, credits);
    effectiveQueryRef.current = effectiveQuery;
    offsetRef.current = 0;
    // Reset any in-flight loadMore so it doesn't block future calls
    loadingMoreRef.current = false;

    setCourses([]);
    setTotal(null);
    setError(null);
    setLoadingMore(false);

    clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(async () => {
      loadingInitialRef.current = true;
      setLoadingInitial(true);
      try {
        const data = await searchCourses(effectiveQuery, { limit: PAGE_SIZE, offset: 0 });
        if (effectiveQueryRef.current !== effectiveQuery) return;
        const list = Object.values(data.results ?? {});
        setCourses(list);
        setTotal(data.total ?? list.length);
        offsetRef.current = list.length;
      } catch (e) {
        if (effectiveQueryRef.current !== effectiveQuery) return;
        setError(e.message);
      } finally {
        if (effectiveQueryRef.current === effectiveQuery) {
          loadingInitialRef.current = false;
          setLoadingInitial(false);
        }
      }
    }, 400);

    return () => clearTimeout(debounceRef.current);
  }, [query, sectionPath, semester, year, credits]);

  const loadMore = useCallback(async () => {
    if (loadingMoreRef.current || loadingInitialRef.current) return;
    const effectiveQuery = effectiveQueryRef.current;
    const currentOffset = offsetRef.current;

    loadingMoreRef.current = true;
    setLoadingMore(true);
    try {
      const data = await searchCourses(effectiveQuery, { limit: PAGE_SIZE, offset: currentOffset });
      if (effectiveQueryRef.current !== effectiveQuery) return;
      const list = Object.values(data.results ?? {});
      setCourses(prev => [...prev, ...list]);
      offsetRef.current = currentOffset + list.length;
    } catch (e) {
      if (effectiveQueryRef.current !== effectiveQuery) return;
      setError(e.message);
    } finally {
      if (effectiveQueryRef.current === effectiveQuery) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, []);

  // Callback ref: sets up / tears down the IntersectionObserver
  // whenever the sentinel div mounts or unmounts.
  const sentinelRef = useCallback((node) => {
    if (observerRef.current) {
      observerRef.current.disconnect();
      observerRef.current = null;
    }
    if (node) {
      observerRef.current = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) loadMore(); },
        { rootMargin: '200px' }
      );
      observerRef.current.observe(node);
    }
  }, [loadMore]);

  // Fetch schedules for visible courses when any schedule-based filter is active
  const needsSchedule = dayFilter.length > 0 || startTime !== '' || endTime !== '';
  useEffect(() => {
    if (!needsSchedule) return;
    const deduped = deduplicateByTitle(courses);
    const visible = credits > 0
      ? deduped.filter(c => (c.units?.[0]?.credits ?? null) === credits)
      : deduped;
    for (const course of visible) {
      const unitId = course.units?.[0]?.id;
      if (!unitId || schedFetchedRef.current.has(unitId)) continue;
      schedFetchedRef.current.add(unitId);
      getCourseSchedule(unitId)
        .then(data => setCourseSchedules(prev => ({ ...prev, [unitId]: data })))
        .catch(() => setCourseSchedules(prev => ({ ...prev, [unitId]: [] })));
    }
  }, [needsSchedule, courses, credits]);

  const hasMore = total !== null && courses.length < total;
  const deduped = deduplicateByTitle(courses);
  const creditFiltered = credits > 0
    ? deduped.filter(c => (c.units?.[0]?.credits ?? null) === credits)
    : deduped;
  const displayCourses = !needsSchedule
    ? creditFiltered
    : creditFiltered.filter(c => {
        const sched = courseSchedules[c.units?.[0]?.id];
        if (sched === undefined) return true; // still loading — keep visible
        return sched.some(entry => entry.timeslots?.some(ts => {
          if (dayFilter.length > 0 && !dayFilter.includes(ts.weekday)) return false;
          if (startTime && ts.start_time < startTime) return false;
          if (endTime && ts.end_time > endTime) return false;
          return true;
        }));
      });
  const selectedProgram = sectionPath[0] ?? null;

  return (
    <main className="course-search">
      <div className="search-header">
        <h2>Course Search</h2>
        <input
          className="search-input"
          type="text"
          placeholder='Search for courses here...'
          value={query}
          onChange={e => setQuery(e.target.value)}
          autoFocus
        />
        <div className="filters">
          {SEMESTERS.map(({ label, value }) => (
            <button
              key={value}
              className={`filter-btn${semester === value ? ' active' : ''}`}
              onClick={() => setSemester(prev => prev === value ? null : value)}
            >
              {label}
            </button>
          ))}
          <div className="filter-divider" />
          <select
            className="filter-select"
            value={year}
            onChange={e => setYear(e.target.value)}
          >
            <option value="">All years</option>
            {years.map(y => (
              <option key={y} value={y}>{y}</option>
            ))}
          </select>
          <div className="filter-divider" />
          {WEEKDAYS.map(({ label, value }) => (
            <button
              key={value}
              className={`filter-btn${dayFilter.includes(value) ? ' active' : ''}`}
              onClick={() => setDayFilter(prev =>
                prev.includes(value) ? prev.filter(d => d !== value) : [...prev, value]
              )}
            >
              {label}
            </button>
          ))}
          <div className="filter-divider" />
          <span className="filter-row-label">Time:</span>
          <input
            type="time"
            className="time-input"
            value={startTime}
            onChange={e => setStartTime(e.target.value)}
          />
          <span className="filter-row-label">–</span>
          <input
            type="time"
            className="time-input"
            value={endTime}
            onChange={e => setEndTime(e.target.value)}
          />
        </div>

        {/* Programme picker */}
        <div className="filter-row">
          <span className="filter-row-label">Programme:</span>
          {selectedProgram ? (
            <span className="program-chip">
              {selectedProgram.name}
              <button className="program-chip-clear" onClick={clearProgram} aria-label="Clear programme">×</button>
            </span>
          ) : (
            <div className="program-search-wrap">
              <input
                ref={programInputRef}
                className="program-search-input"
                type="text"
                placeholder="Search study programme…"
                value={programQuery}
                onChange={e => { setProgramQuery(e.target.value); setProgramDropdownOpen(true); }}
                onFocus={() => { if (programQuery.trim()) setProgramDropdownOpen(true); }}
                onBlur={() => setTimeout(() => setProgramDropdownOpen(false), 150)}
              />
              {programDropdownOpen && (programOptions.length > 0 || programLoading) && (
                <ul className="program-dropdown">
                  {programLoading && <li className="program-dropdown-status">Searching…</li>}
                  {!programLoading && programOptions.map(opt => (
                    <li key={opt.id}>
                      <button className="program-dropdown-item" onMouseDown={() => selectProgram(opt)}>
                        {opt.name}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>

        {/* Dynamic sub-level filter rows */}
        {levelOptions.map((options, levelIndex) => (
          <div key={levelIndex} className="filter-row filter-row--sub">
            <span className="filter-row-label">{sectionPath[levelIndex].name}:</span>
            {options.map(opt => (
              <button
                key={opt.id}
                className={`filter-btn${sectionPath[levelIndex + 1]?.id === opt.id ? ' active' : ''}`}
                onClick={() => drillInto(opt, levelIndex + 1)}
              >
                {opt.name}
              </button>
            ))}
            {sectionLoading && levelIndex === levelOptions.length - 1 && (
              <span className="filter-row-label">…</span>
            )}
          </div>
        ))}

        <div className="credits-filter">
          <span className="credits-label">Credits:</span>
          <input
            type="number"
            className="credits-input"
            min={0}
            max={30}
            value={credits || ''}
            placeholder="Any"
            onKeyDown={e => { if (!/[\d]|Backspace|Delete|ArrowLeft|ArrowRight|Tab/.test(e.key)) e.preventDefault(); }}
            onChange={e => {
              const v = e.target.value === '' ? 0 : Math.min(30, Math.max(0, Number(e.target.value)));
              setCredits(v);
            }}
          />
        </div>
        {total !== null && !loadingInitial && (
          <p className="result-count">{total} result{total !== 1 ? 's' : ''}</p>
        )}
      </div>

      {loadingInitial && <p className="status">Searching…</p>}
      {error && <p className="status error">{error}</p>}

      {!loadingInitial && displayCourses.length > 0 && (
        <ul className="results-list">
          {displayCourses.map(course => {
            const unit = course.units?.[0] ?? {};
            const title = unit.title_english || unit.title || '—';
            const levels = unit.levels?.join(', ');
            const isAdded = timetableCourses.some(c => c.id === unit.id);
            return (
              <li key={course.number} className="result-row">
                <Link to={`/courses/${unit.id}`} className="result-item">
                  <div className="result-main">
                    <span className="result-number">{course.number}</span>
                    <span className="result-title">{title}</span>
                  </div>
                  <div className="result-meta">
                    {unit.credits != null && <span>{unit.credits} ECTS</span>}
                    {unit.language && <span>{unit.language}</span>}
                    {levels && <span>{levels}</span>}
                    {unit.semkez && <span>{unit.semkez}</span>}
                  </div>
                </Link>
                <button
                  className={`add-to-tt-btn${isAdded ? ' added' : ''}`}
                  onClick={() => onToggleCourse({ id: unit.id, title, number: course.number })}
                  aria-label={isAdded ? 'Remove from timetable' : 'Add to timetable'}
                  title={isAdded ? 'Remove from timetable' : 'Add to timetable'}
                >
                  {isAdded ? '✓' : '+'}
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {hasMore && !loadingInitial && (
        <div ref={sentinelRef} className="sentinel">
          {loadingMore && <p className="status">Loading…</p>}
        </div>
      )}

      {!loadingInitial && total === 0 && (
        <p className="status">No courses found.</p>
      )}
    </main>
  );
}

export default CourseSearch;
