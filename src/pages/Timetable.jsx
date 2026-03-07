import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getCourseSchedule } from '../api/vvz';
import './Timetable.css';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'];
const START_HOUR = 8;
const END_HOUR = 20;
const HOURS = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);
const SLOT_H = 5;         // rem per hour
const TOTAL_SLOTS = HOURS.length * 2; // 30-min slots

const TYPE_COLORS = {
  lecture: '#B7352D',
  exercise: '#215CAF',
};

function timeToRem(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return (h + m / 60 - START_HOUR) * SLOT_H;
}

function timeToFrac(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h + m / 60;
}

function slotToTime(slot) {
  const totalMins = START_HOUR * 60 + slot * 30;
  const h = Math.floor(totalMins / 60);
  const m = totalMins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function getSlotFromY(clientY, colEl) {
  const rect = colEl.getBoundingClientRect();
  const fraction = Math.max(0, Math.min(1 - 1e-9, (clientY - rect.top) / rect.height));
  return Math.floor(fraction * TOTAL_SLOTS);
}

function overlaps(a, b) {
  return timeToFrac(a.start) < timeToFrac(b.end) && timeToFrac(b.start) < timeToFrac(a.end);
}

function assignColumns(events) {
  if (!events.length) return [];
  const sorted = [...events].sort((a, b) => timeToFrac(a.start) - timeToFrac(b.start));
  const colEnds = [];
  const assigned = sorted.map(ev => {
    const startFrac = timeToFrac(ev.start);
    let col = colEnds.findIndex(end => end <= startFrac);
    if (col === -1) col = colEnds.length;
    colEnds[col] = timeToFrac(ev.end);
    return { ...ev, col };
  });
  return assigned.map(ev => {
    let maxCol = ev.col;
    for (const other of assigned) {
      if (overlaps(ev, other)) maxCol = Math.max(maxCol, other.col);
    }
    return { ...ev, totalCols: maxCol + 1 };
  });
}

function Timetable({ timetableCourses = [] }) {
  const navigate = useNavigate();
  const [schedules, setSchedules] = useState({});
  const fetchedRef = useRef(new Set());

  // Drag-to-select state
  const [drag, setDrag] = useState(null);     // { startDay, startSlot, endDay, endSlot }
  const [popup, setPopup] = useState(null);   // { startDay, endDay, startSlot, endSlot, x, y }
  const dragRef = useRef(null);               // mirrors drag for document-level handlers
  const colRefs = useRef([]);                 // DOM refs for each day column
  const gridRef = useRef(null);               // DOM ref for the grid container
  const popupRef = useRef(null);              // DOM ref for the popup

  useEffect(() => {
    for (const course of timetableCourses) {
      if (fetchedRef.current.has(course.id)) continue;
      fetchedRef.current.add(course.id);
      getCourseSchedule(course.id)
        .then(data => setSchedules(prev => ({ ...prev, [course.id]: data })))
        .catch(() => setSchedules(prev => ({ ...prev, [course.id]: [] })));
    }
  }, [timetableCourses]);

  // Document-level mouseup: finalise selection and show popup
  useEffect(() => {
    function onMouseUp(e) {
      if (!dragRef.current) return;
      const d = dragRef.current;
      dragRef.current = null;
      setDrag(null);
      setPopup({
        startDay:  Math.min(d.startDay,  d.endDay),
        endDay:    Math.max(d.startDay,  d.endDay),
        startSlot: Math.min(d.startSlot, d.endSlot),
        endSlot:   Math.max(d.startSlot, d.endSlot),
        x: e.clientX,
        y: e.clientY,
      });
    }
    document.addEventListener('mouseup', onMouseUp);
    return () => document.removeEventListener('mouseup', onMouseUp);
  }, []);

  // Close popup when clicking outside it
  useEffect(() => {
    if (!popup) return;
    function onMouseDown(e) {
      if (popupRef.current && !popupRef.current.contains(e.target)) {
        setPopup(null);
      }
    }
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, [popup]);

  function handleColMouseDown(e, di) {
    // Only left button, ignore clicks on event links
    if (e.button !== 0 || e.target.closest('.tt-event')) return;
    e.preventDefault();
    const slot = getSlotFromY(e.clientY, colRefs.current[di]);
    const d = { startDay: di, startSlot: slot, endDay: di, endSlot: slot };
    dragRef.current = d;
    setDrag(d);
    setPopup(null);
  }

  function handleColMouseMove(e, di) {
    if (!dragRef.current) return;
    const slot = getSlotFromY(e.clientY, colRefs.current[di]);
    const d = { ...dragRef.current, endDay: di, endSlot: slot };
    dragRef.current = d;
    setDrag(d);
  }

  // Compute a single pixel rect for the merged selection overlay (persists via popup)
  const selSource = drag ?? popup;
  const selRect = useMemo(() => {
    if (!selSource || !gridRef.current) return null;
    const minDay  = Math.min(selSource.startDay,  selSource.endDay);
    const maxDay  = Math.max(selSource.startDay,  selSource.endDay);
    const minSlot = Math.min(selSource.startSlot, selSource.endSlot);
    const maxSlot = Math.max(selSource.startSlot, selSource.endSlot);
    const startCol = colRefs.current[minDay];
    const endCol   = colRefs.current[maxDay];
    if (!startCol || !endCol) return null;
    const gridRect     = gridRef.current.getBoundingClientRect();
    const startColRect = startCol.getBoundingClientRect();
    const endColRect   = endCol.getBoundingClientRect();
    const halfSlotPx   = startColRect.height / TOTAL_SLOTS;
    return {
      left:   startColRect.left - gridRect.left,
      top:    startColRect.top  - gridRect.top + minSlot * halfSlotPx,
      width:  endColRect.right  - startColRect.left,
      height: (maxSlot - minSlot + 1) * halfSlotPx,
    };
  }, [selSource]);

  function formatRoom(ts) {
    return [ts.building, ts.floor, ts.room].filter(Boolean).join(' ');
  }

  const eventMaps = [new Map(), new Map(), new Map(), new Map(), new Map()];
  timetableCourses.forEach((course) => {
    for (const entry of schedules[course.id] ?? []) {
      const color = TYPE_COLORS[entry.type] ?? '#627313';
      for (const ts of entry.timeslots ?? []) {
        if (ts.weekday >= 0 && ts.weekday < 5) {
          const dupKey = `${course.title}|${entry.type}|${ts.start_time}|${ts.end_time}`;
          const map = eventMaps[ts.weekday];
          const room = formatRoom(ts);
          if (map.has(dupKey)) {
            if (room) map.get(dupKey).rooms.add(room);
          } else {
            map.set(dupKey, {
              key: `${course.id}-${entry.type}-${ts.weekday}-${ts.start_time}`,
              unitId: course.id,
              title: course.title,
              type: entry.type,
              start: ts.start_time,
              end: ts.end_time,
              color,
              rooms: new Set(room ? [room] : []),
            });
          }
        }
      }
    }
  });

  const eventsByDay = eventMaps.map(map => [...map.values()].map(ev => {
    const roomList = [...ev.rooms];
    const roomLabel = ev.type === 'lecture'
      ? roomList.join(', ')
      : roomList.length > 1 ? 'Various' : roomList[0] ?? '';
    return { ...ev, rooms: undefined, roomLabel };
  }));

  const totalH = HOURS.length * SLOT_H;

  return (
    <main className="timetable-page">
      <h2>Timetable</h2>
      {timetableCourses.length === 0 && (
        <p className="tt-empty">No courses added yet. Search for courses and click + to add them here.</p>
      )}
      <div className="timetable-scroll">
        <div className={`timetable-grid${drag ? ' tt-selecting' : ''}`} ref={gridRef}>
          {/* Header row */}
          <div className="tt-corner" />
          {DAYS.map(day => (
            <div key={day} className="tt-day-header">{day}</div>
          ))}

          {/* Body: time labels + day columns */}
          <div className="tt-time-labels">
            {HOURS.map(h => (
              <div key={h} className="tt-time-label">
                {String(h).padStart(2, '0')}:00
              </div>
            ))}
          </div>
          {selRect && (
            <div
              className="tt-selection"
              style={{
                left:   selRect.left,
                top:    selRect.top,
                width:  selRect.width,
                height: selRect.height,
              }}
            />
          )}
          {DAYS.map((day, di) => {
            const placed = assignColumns(eventsByDay[di]);
            return (
              <div
                key={day}
                className="tt-day-col"
                style={{ height: `${totalH}rem` }}
                ref={el => { colRefs.current[di] = el; }}
                onMouseDown={e => handleColMouseDown(e, di)}
                onMouseMove={e => handleColMouseMove(e, di)}
              >
                {HOURS.map((h, hi) => (
                  <div
                    key={h}
                    className={`tt-gridline${hi === HOURS.length - 1 ? ' tt-gridline--last' : ''}`}
                  />
                ))}
                {placed.map(ev => (
                  <Link
                    key={ev.key}
                    to={`/courses/${ev.unitId}`}
                    className="tt-event"
                    style={{
                      top:    `${timeToRem(ev.start)}rem`,
                      height: `${timeToRem(ev.end) - timeToRem(ev.start)}rem`,
                      left:   `calc(${(ev.col / ev.totalCols) * 100}% + 2px)`,
                      width:  `calc(${(1 / ev.totalCols) * 100}% - 4px)`,
                      borderLeftColor: ev.color,
                    }}
                  >
                    <span className="tt-event-title">{ev.title}</span>
                    <span className="tt-event-time">{ev.start}–{ev.end}</span>
                    {ev.roomLabel && <span className="tt-event-room">{ev.roomLabel}</span>}
                  </Link>
                ))}
              </div>
            );
          })}
        </div>
      </div>

      {timetableCourses.length > 0 && (
        <div className="tt-legend">
          {[['Lecture', '#B7352D'], ['Exercise', '#215CAF'], ['Other', '#627313']].map(([label, color]) => (
            <div key={label} className="tt-legend-item">
              <span className="tt-legend-dot" style={{ background: color }} />
              <span>{label}</span>
            </div>
          ))}
        </div>
      )}

      {popup && (
        <div
          ref={popupRef}
          className="tt-popup"
          style={{ left: popup.x, top: popup.y }}
        >
          <p className="tt-popup-days">
            {popup.startDay === popup.endDay
              ? DAYS[popup.startDay]
              : `${DAYS[popup.startDay]} – ${DAYS[popup.endDay]}`}
          </p>
          <p className="tt-popup-time">
            {slotToTime(popup.startSlot)} – {slotToTime(popup.endSlot + 1)}
          </p>
          <button
            className="tt-popup-search"
            onClick={() => {
              navigate('/courses', {
                state: {
                  presetDays:  Array.from(
                    { length: popup.endDay - popup.startDay + 1 },
                    (_, i) => popup.startDay + i
                  ),
                  presetStart: slotToTime(popup.startSlot),
                  presetEnd:   slotToTime(popup.endSlot + 1),
                },
              });
            }}
          >
            Search courses in this time
          </button>
        </div>
      )}
    </main>
  );
}

export default Timetable;
