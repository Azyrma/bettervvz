import { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, useSearchParams } from 'react-router-dom';
import { getCourseSchedule, getUnit, getUnitExaminers, getUnitLecturers } from '../api/vvz';
import { call } from '../search/client';
import {
  COURSE_TYPES, DEPARTMENTS, FREQUENCY, LEVELS, OCCURRENCE, RATINGS, SECTION_TYPES,
  capitalize, semesterLabel, semesterName,
} from '../labels';
import './CourseDetail.css';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const PERIODICITY = ['ONETIME', 'ANNUAL', 'SEMESTER', 'BIENNIAL'];
const HOUR_TYPES = { 1: 'h/week', 2: 'h/semester' };
const GROUPS_SHOWN = 6;
// VVZ order: lecture before exercise etc. ("4V+2U"); the course number ends in the type letter.
const TYPE_ORDER = 'VGUSPKADR';
const byType = (a, b) => TYPE_ORDER.indexOf(a.number.at(-1)) - TYPE_ORDER.indexOf(b.number.at(-1));

function formatRoom(ts) {
  return [ts.building, ts.floor, ts.room].filter(Boolean).join(' ');
}

function slotWhen(ts) {
  if (ts.weekday === 7) return 'By appointment';
  const time = ts.start_time ? `${ts.start_time}–${ts.end_time}` : '';
  const day = ts.date ? `${ts.date}.` : WEEKDAYS[ts.weekday] ?? '';
  return [day, time].filter(Boolean).join(' ');
}

function slotNotes(ts) {
  return [
    ts.biweekly && 'every two weeks',
    ts.first_half_semester && 'first half of semester',
    ts.second_half_semester && 'second half of semester',
  ].filter(Boolean).join(', ');
}

// One line per distinct time; parallel rooms (e.g. video-transmitted lectures, exercise groups) are merged.
function mergeTimeslots(timeslots) {
  const map = new Map();
  for (const ts of timeslots) {
    const key = `${ts.weekday}|${ts.date}|${ts.start_time}|${ts.end_time}|${slotNotes(ts)}`;
    if (!map.has(key)) map.set(key, { ts, rooms: [] });
    const room = formatRoom(ts);
    if (room && !map.get(key).rooms.includes(room)) map.get(key).rooms.push(room);
  }
  return [...map.values()];
}

function Slots({ timeslots }) {
  return (
    <ul className="slots">
      {mergeTimeslots(timeslots).map(({ ts, rooms }, i) => (
        <li key={i}>
          <span className="slot-when">{slotWhen(ts)}</span>
          {rooms.length > 0 && (
            <span className="slot-rooms" title={rooms.join(', ')}>
              {rooms.length > 3 ? `${rooms.slice(0, 3).join(', ')} +${rooms.length - 3} more` : rooms.join(', ')}
            </span>
          )}
          {slotNotes(ts) && <span className="slot-note">{slotNotes(ts)}</span>}
        </li>
      ))}
    </ul>
  );
}

function GroupList({ groups }) {
  return (
    <ul className="groups">
      {groups.map(g => (
        <li key={`${g.number}-${g.name}`}>
          <span className="group-name">{g.name}</span>
          {g.timeslots?.length > 0 && <Slots timeslots={g.timeslots} />}
          {g.restriction && <span className="slot-note">{g.restriction}</span>}
        </li>
      ))}
    </ul>
  );
}

function Field({ label, children }) {
  if (children == null || children === '' || children === false) return null;
  return (
    <div className="field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function Card({ title, className, children, aside }) {
  return (
    <section className={`card ${className}`}>
      <header className="card-head">
        <h2>{title}</h2>
        {aside}
      </header>
      {children}
    </section>
  );
}

const person = l => [l.title, l.name, l.surname].filter(Boolean).join(' ');
const en = (u, k) => u?.[`${k}_english`] || u?.[k] || null;
const clean = s => s?.replace(/^\s*:\s*/, '') || null;

function Competencies({ data }) {
  const groups = Object.entries(data ?? {});
  if (!groups.length) return null;
  return (
    <div className="competencies">
      {groups.map(([group, items]) => (
        <div key={group}>
          <h4>{group}</h4>
          <ul>
            {Object.entries(items).map(([name, level]) => (
              <li key={name}><span>{name}</span><span className={`comp comp-${level}`}>{level}</span></li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

function CourseDetail({ unitId }) {
  const location = useLocation();
  const navigate = useNavigate();
  const [sp] = useSearchParams();
  const preview = location.state?.unit?.id === unitId ? location.state.unit : null;

  const [unit, setUnit] = useState(null);
  const [indexed, setIndexed] = useState(null);
  const [lecturers, setLecturers] = useState(null);
  const [examiners, setExaminers] = useState(null);
  const [schedule, setSchedule] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    window.scrollTo(0, 0);
    let alive = true;
    const set = setter => value => alive && setter(value);
    const lookup = semkez => call('unit', { semkez, id: unitId }).then(set(setIndexed)).catch(() => {});

    const sem = sp.get('sem');
    if (sem) lookup(sem);
    getUnit(unitId)
      .then(u => {
        set(setUnit)(u);
        if (u.semkez !== sem) lookup(u.semkez);
      })
      .catch(e => set(setError)(e.message));
    getUnitLecturers(unitId).then(set(setLecturers)).catch(() => set(setLecturers)([]));
    getUnitExaminers(unitId).then(set(setExaminers)).catch(() => set(setExaminers)([]));
    getCourseSchedule(unitId).then(c => set(setSchedule)([...c].sort(byType))).catch(() => set(setSchedule)([]));
    return () => { alive = false; };
  }, [unitId, sp]);

  const title = en(unit, 'title') ?? preview?.t;
  const number = unit?.number ?? preview?.no;
  const semkez = unit?.semkez ?? sp.get('sem');

  useEffect(() => {
    if (title) document.title = `${number} ${title} · VVZ++`;
    return () => { document.title = 'VVZ++ · ETH course search'; };
  }, [title, number]);

  const back = location.key !== 'default'
    ? <button type="button" className="back-link" onClick={() => navigate(-1)}>← Back to results</button>
    : <Link to="/" className="back-link">← Course search</Link>;

  if (error) {
    return (
      <main className="course-detail container">
        {back}
        <div className="card detail-error">
          <p>Could not load this course: {error}</p>
          <a href={`https://www.vvz.ethz.ch/Vorlesungsverzeichnis/lerneinheit.view?lerneinheitId=${unitId}&lang=en`} target="_blank" rel="noreferrer">
            Try the official VVZ ↗
          </a>
        </div>
      </main>
    );
  }

  const loading = <p className="loading-line">Loading…</p>;
  const germanTitle = unit?.title && unit.title !== title ? unit.title : preview?.tg;
  const lecturerNames = lecturers?.length ? lecturers.map(person) : indexed?.lec ?? preview?.lec ?? [];
  const hours = schedule?.length
    ? schedule.filter(c => c.hours).map(c => `${Number(c.hours)}${c.number.at(-1)}`).join('+')
    : (indexed?.hr ?? preview?.hr)?.join('+');
  const frequency = FREQUENCY[PERIODICITY[unit?.course_frequency]] ?? FREQUENCY[indexed?.fq];
  const occurrence = OCCURRENCE[unit?.occurence] ?? OCCURRENCE[indexed?.oc];
  const ratings = indexed?.cr ?? preview?.cr;
  const courseSlots = schedule?.filter(c => c.timeslots?.length) ?? [];
  const groups = (unit?.groups ?? []).filter(g => g.timeslots?.length || g.restriction);
  const materials = Object.entries(unit?.learning_materials ?? {});
  const vvzUrl = `https://www.vvz.ethz.ch/Vorlesungsverzeichnis/lerneinheit.view?lerneinheitId=${unitId}${semkez ? `&semkez=${semkez}` : ''}&lang=en`;

  const descriptions = [
    ['Abstract', en(unit, 'abstract')],
    ['Learning objective', en(unit, 'objective')],
    ['Content', en(unit, 'content')],
    ['Lecture notes', en(unit, 'lecture_notes')],
    ['Literature', en(unit, 'literature')],
    ['Prerequisites / notice', en(unit, 'additional')],
    ['Comment', en(unit, 'comment')],
  ].filter(([, text]) => text);

  return (
    <main className="course-detail">
      <div className="container">
        {back}
        <div className="bento">
          <section className="card card-hero">
            <div className="hero-main">
              <p className="hero-kicker">
                <span>{number}</span>
                {semkez && <span>{semesterLabel(semkez)} · {semesterName(semkez)}</span>}
              </p>
              <h1 className="hero-title">{title ?? 'Loading…'}</h1>
              {germanTitle && <p className="hero-subtitle" lang="de">{germanTitle}</p>}
              {occurrence && <p className="hero-warning">{occurrence}</p>}
              <div className="hero-lecturers">
                <span className="hero-label">{lecturerNames.length === 1 ? 'Lecturer' : 'Lecturers'}</span>
                <span>{lecturerNames.length ? lecturerNames.join(', ') : lecturers ? 'Not announced' : '…'}</span>
              </div>
              <div className="hero-links">
                <a href={vvzUrl} target="_blank" rel="noreferrer">Official VVZ page ↗</a>
                {number && <a href={`https://coursereview.ch/course/${number}`} target="_blank" rel="noreferrer">CourseReview ↗</a>}
              </div>
            </div>
            <dl className="hero-stats">
              <div className="stat stat-key">
                <dt>Credits</dt>
                <dd>{(unit?.credits ?? preview?.c) != null ? <><b>{Number(unit?.credits ?? preview?.c)}</b> ECTS</> : '–'}</dd>
              </div>
              <div className="stat">
                <dt>Level</dt>
                <dd>{(unit?.levels ?? preview?.lv ?? []).map(l => <span key={l} title={LEVELS[l]}>{l} <small>{LEVELS[l]}</small></span>)}</dd>
              </div>
              <div className="stat">
                <dt>Department</dt>
                <dd>{(unit?.departments ?? preview?.dp ?? []).map(d => (
                  <span key={d}>{DEPARTMENTS[d]?.[0] ?? d} <small>{DEPARTMENTS[d]?.[1]}</small></span>
                ))}</dd>
              </div>
              <div className="stat">
                <dt>Semester</dt>
                <dd>{semkez ? <span>{semesterLabel(semkez)} <small>{semesterName(semkez)}</small></span> : '–'}</dd>
              </div>
              <div className="stat">
                <dt>Language</dt>
                <dd>{unit?.language ?? preview?.lg ?? '–'}</dd>
              </div>
              <div className="stat">
                <dt>Hours</dt>
                <dd>{hours || '–'}{frequency && <small>{frequency}</small>}</dd>
              </div>
            </dl>
          </section>

          <div className="bento-main">
            <Card title="Lectures, times & rooms" className="card-schedule">
              {!schedule ? loading : (
                <>
                  {schedule.map(c => (
                    <div key={c.number} className="course-block">
                      <div className="course-block-head">
                        <span className="course-type">{capitalize(c.type) ?? COURSE_TYPES[c.number.at(-1)]}</span>
                        <span className="course-no">{c.number}</span>
                        {c.hours != null && <span className="course-hours">{Number(c.hours)} {HOUR_TYPES[c.hour_type] ?? 'h'}</span>}
                      </div>
                      {c.timeslots?.length ? <Slots timeslots={c.timeslots} /> : null}
                      {c.comment && <p className="prose small">{c.comment}</p>}
                    </div>
                  ))}
                  {groups.length > 0 && (
                    <div className="course-block">
                      <div className="course-block-head"><span className="course-type">Groups</span></div>
                      <GroupList groups={groups.slice(0, GROUPS_SHOWN)} />
                      {groups.length > GROUPS_SHOWN && (
                        <details className="more-groups">
                          <summary>Show all {groups.length} groups</summary>
                          <GroupList groups={groups.slice(GROUPS_SHOWN)} />
                        </details>
                      )}
                    </div>
                  )}
                  {!courseSlots.length && !groups.length && (
                    <p className="muted-note">
                      vvzapi.ch has no times or rooms for this course yet. The <a href={vvzUrl} target="_blank" rel="noreferrer">official VVZ page</a> may have more.
                    </p>
                  )}
                </>
              )}
            </Card>

            <Card title="Description" className="card-desc">
              {!unit ? loading : (
                <>
                  {descriptions.length === 0 && materials.length === 0 && <p className="muted-note">No description available.</p>}
                  {descriptions.map(([label, text]) => (
                    <div key={label} className="desc-block">
                      <h3>{label}</h3>
                      <p className="prose">{text}</p>
                    </div>
                  ))}
                  {materials.length > 0 && (
                    <div className="desc-block">
                      <h3>Learning materials</h3>
                      <ul className="materials">
                        {materials.flatMap(([group, links]) => links.map(l => (
                          <li key={`${group}-${l.url}`}>
                            <a href={l.url} target="_blank" rel="noreferrer">{l.name || l.url}</a>
                            {group && <span className="slot-note">{group}</span>}
                          </li>
                        )))}
                      </ul>
                    </div>
                  )}
                  {Object.keys(unit.competencies_english ?? unit.competencies ?? {}).length > 0 && (
                    <div className="desc-block">
                      <h3>Competencies</h3>
                      <Competencies data={Object.keys(unit.competencies_english ?? {}).length ? unit.competencies_english : unit.competencies} />
                    </div>
                  )}
                </>
              )}
            </Card>
          </div>

          <div className="bento-side">
            <Card title="Performance assessment" className="card-exam">
              {!unit ? loading : (
                <dl className="fields">
                  <Field label="Type">{capitalize(unit.exam_type)}</Field>
                  <Field label="Mode">{capitalize(unit.exam_mode)}</Field>
                  <Field label="Language">{unit.exam_language}</Field>
                  <Field label="Written aids">{unit.written_aids}</Field>
                  <Field label="Examiners">{examiners?.length ? examiners.map(person).join(', ') : null}</Field>
                  <Field label="Repetition">{unit.repetition}</Field>
                  <Field label="Distance examination">{unit.distance_exam}</Field>
                  <Field label="Digital exam">{unit.digital}</Field>
                  <Field label="Exam block">{unit.exam_block?.length ? unit.exam_block.join('; ') : null}</Field>
                  <Field label="Two-semester credits">{unit.two_semester_credits != null ? `${Number(unit.two_semester_credits)} ECTS` : null}</Field>
                  <Field label="Additional information">{unit.additional_info && <span className="prose">{unit.additional_info}</span>}</Field>
                  <Field label="Regulations">{unit.regulations?.length ? unit.regulations.join('; ') : null}</Field>
                </dl>
              )}
            </Card>

            <Card title="Offered in" className="card-offered">
              {!indexed ? (unit ? <p className="muted-note">No programme data.</p> : loading) : indexed.sections.length === 0
                ? <p className="muted-note">Not listed in any programme.</p>
                : (
                  <ul className="offered">
                    {indexed.sections.map(s => (
                      <li key={s.id}>
                        <Link to={`/?sem=${semkez}&prog=${s.id}`} className="offered-path">
                          <span className="offered-root">{s.path[0]}</span>
                          {s.path.length > 1 && <span className="offered-rest">{s.path.slice(1).join(' › ')}</span>}
                        </Link>
                        {s.type && (
                          <span className="offered-types">
                            {s.type.split(' ').map(t => <abbr key={t} title={SECTION_TYPES[t] ?? t}>{t}</abbr>)}
                          </span>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
            </Card>

            <Card title="Registration" className="card-registration">
              {!unit ? loading : (
                <>
                <dl className="fields">
                  <Field label="Places">{unit.max_places > 0 ? `Limited to ${unit.max_places}` : null}</Field>
                  <Field label="Registration start">{unit.signup_start}</Field>
                  <Field label="Registration end">{unit.signup_end}</Field>
                  <Field label="Waiting list until">{unit.waitlist_end}</Field>
                  <Field label="Group registration until">{unit.groups_signup_end}</Field>
                  <Field label="Priority">{unit.priority}</Field>
                  <Field label="Primary target group">{unit.primary_target_group?.length ? (
                    <ul className="plain">{unit.primary_target_group.map(g => <li key={g}>{g}</li>)}</ul>
                  ) : null}</Field>
                  <Field label="Restrictions">{clean(unit.general_restrictions)}</Field>
                  <Field label="Offered">{frequency}</Field>
                </dl>
                {!(unit.max_places > 0) && !unit.signup_end && !unit.priority && !unit.primary_target_group?.length && !unit.general_restrictions && (
                  <p className="muted-note">No registration restrictions listed.</p>
                )}
                </>
              )}
            </Card>

            {ratings && (
              <Card
                title="CourseReview"
                className="card-review"
                aside={<span className="review-avg">★ {(ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1)}</span>}
              >
                <ul className="ratings">
                  {RATINGS.map((label, i) => (
                    <li key={label}>
                      <span>{label}</span>
                      <span className="rating-bar" title={`${ratings[i]} / 5`}><span style={{ width: `${(ratings[i] / 5) * 100}%` }} /></span>
                      <span className="rating-value">{ratings[i].toFixed(1)}</span>
                    </li>
                  ))}
                </ul>
                <a className="review-link" href={`https://coursereview.ch/course/${number}`} target="_blank" rel="noreferrer">Read reviews ↗</a>
              </Card>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}

export default CourseDetail;
