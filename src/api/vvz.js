const BASE = 'https://vvzapi.ch';
const cache = new Map();

// One request per URL per session; the service worker additionally keeps responses across visits.
function getJson(path, what) {
  if (!cache.has(path)) {
    cache.set(path, fetch(`${BASE}${path}`)
      .then(res => {
        if (!res.ok) throw new Error(`${what} failed: ${res.status}`);
        return res.json();
      })
      .catch(e => {
        cache.delete(path);
        throw e;
      }));
  }
  return cache.get(path);
}

// Not memoized here: results are ~37 KB per course, so the search worker caches only what it keeps.
export async function searchCourses(q, { limit = 20, offset = 0, orderBy = 'number', order = 'asc' } = {}) {
  const params = new URLSearchParams({ q, limit, offset, order_by: orderBy, order });
  const res = await fetch(`${BASE}/api/v2/search?${params}`);
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return res.json(); // { total, results, parsed_query, exec_time_ms }
}

export function getSemesters() {
  return getJson('/api/v1/misc/semesters', 'Semesters fetch'); // ["2026W", "2027S", ...]
}

export function getUnit(unitId) {
  return getJson(`/api/v1/unit/${unitId}/get`, 'Unit fetch');
}

export async function getUnitLecturers(unitId) {
  const ids = await getJson(`/api/v1/unit/${unitId}/lecturers`, 'Lecturers fetch');
  return Promise.all(ids.map(id => getLecturer(id)));
}

export async function getUnitExaminers(unitId) {
  const ids = await getJson(`/api/v1/unit/${unitId}/examiners`, 'Examiners fetch');
  return Promise.all(ids.map(id => getLecturer(id)));
}

export function getLecturer(lecturerId) {
  return getJson(`/api/v1/lecturer/get/${lecturerId}`, 'Lecturer fetch'); // { id, title, name, surname, department }
}

export function getCourseSchedule(unitId) {
  // array of { type, number, hours, hour_type, comment, timeslots: [{ weekday, start_time, end_time, building, floor, room, ... }] }
  return getJson(`/api/v1/course/get/${unitId}`, 'Schedule fetch');
}
