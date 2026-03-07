import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { getUnit, getUnitLecturers, getCourseSchedule } from '../api/vvz';

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];

function formatRoom(ts) {
  return [ts.building, ts.floor, ts.room].filter(Boolean).join(' ');
}

function mergeTimeslots(timeslots, isLecture) {
  // Key by day+time; for lectures collect rooms, for exercises ignore rooms
  const map = new Map();
  for (const ts of timeslots) {
    const key = `${ts.weekday}|${ts.start_time}|${ts.end_time}`;
    if (!map.has(key)) {
      map.set(key, { ts, rooms: [] });
    }
    const room = formatRoom(ts);
    if (isLecture && room && !map.get(key).rooms.includes(room)) {
      map.get(key).rooms.push(room);
    }
  }
  return [...map.values()].map(({ ts, rooms }) => {
    const day = WEEKDAYS[ts.weekday] ?? '';
    const time = `${ts.start_time}–${ts.end_time}`;
    return rooms.length ? `${day} ${time} · ${rooms.join(', ')}` : `${day} ${time}`;
  });
}
import './CourseDetail.css';

function Field({ label, children }) {
  if (!children) return null;
  return (
    <div className="detail-field">
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}

function CourseDetail() {
  const { unitId } = useParams();
  const [unit, setUnit] = useState(null);
  const [lecturers, setLecturers] = useState([]);
  const [schedule, setSchedule] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    setSchedule([]);

    Promise.all([getUnit(unitId), getUnitLecturers(unitId)])
      .then(([u, l]) => {
        setUnit(u);
        setLecturers(l);
      })
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));

    getCourseSchedule(unitId)
      .then(setSchedule)
      .catch(() => {});
  }, [unitId]);

  if (loading) return <main className="course-detail"><p className="detail-status">Loading…</p></main>;
  if (error)   return <main className="course-detail"><p className="detail-status error">{error}</p></main>;
  if (!unit)   return null;

  const title = unit.title_english || unit.title || '—';
  const description = unit.abstract_english || unit.abstract;
  const objective = unit.objective_english || unit.objective;
  const lecturerNames = lecturers
    .map(l => [l.title, l.name, l.surname].filter(Boolean).join(' '))
    .join(', ');

  return (
    <main className="course-detail">
      <Link to="/courses" className="back-link">← Course Search</Link>

      <h1 className="detail-title">{title}</h1>

      <dl className="detail-grid">
        <Field label="Course ID">{unit.number}</Field>
        <Field label="ECTS">{unit.credits}</Field>
        <Field label="Semester">{unit.semkez}</Field>
        <Field label="Language">{unit.language}</Field>
        <Field label="Level">{unit.levels?.join(', ')}</Field>
        <Field label="Exam">{[unit.exam_type, unit.exam_mode].filter(Boolean).join(' — ')}</Field>
        <Field label="Lecturer">{lecturerNames || null}</Field>
        {schedule
          .filter(c => c.timeslots?.length)
          .map(c => {
            const label = c.type.charAt(0).toUpperCase() + c.type.slice(1);
            const isLecture = c.type === 'lecture';
            const slots = mergeTimeslots(c.timeslots, isLecture);
            return (
              <Field key={c.number} label={label}>
                <span className="schedule-slots">
                  {slots.map((s, i) => (
                    <span key={i}>{s}</span>
                  ))}
                </span>
              </Field>
            );
          })}
      </dl>

      {description && (
        <section className="detail-section">
          <h2>Description</h2>
          <p>{description}</p>
        </section>
      )}

      {objective && (
        <section className="detail-section">
          <h2>Objective</h2>
          <p>{objective}</p>
        </section>
      )}
    </main>
  );
}

export default CourseDetail;
