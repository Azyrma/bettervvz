const BASE = 'https://vvzapi.ch';

export async function searchCourses(q, { limit = 20, offset = 0, orderBy = 'title_english', order = 'asc' } = {}) {
  const params = new URLSearchParams({ q, limit, offset, order_by: orderBy, order });
  const res = await fetch(`${BASE}/api/v2/search?${params}`);
  if (!res.ok) throw new Error(`Search failed: ${res.status}`);
  return res.json(); // { total, results, parsed_query, exec_time_ms }
}

export async function getUnit(unitId) {
  const res = await fetch(`${BASE}/api/v1/unit/${unitId}/get`);
  if (!res.ok) throw new Error(`Unit fetch failed: ${res.status}`);
  return res.json();
}

export async function getUnitLecturers(unitId) {
  const res = await fetch(`${BASE}/api/v1/unit/${unitId}/lecturers`);
  if (!res.ok) throw new Error(`Lecturers fetch failed: ${res.status}`);
  const ids = await res.json(); // array of lecturer IDs
  return Promise.all(ids.map(id => getLecturer(id)));
}

export async function getLecturer(lecturerId) {
  const res = await fetch(`${BASE}/api/v1/lecturer/get/${lecturerId}`);
  if (!res.ok) throw new Error(`Lecturer fetch failed: ${res.status}`);
  return res.json(); // { id, title, name, surname, department }
}

export async function getCourseSchedule(unitId) {
  const res = await fetch(`${BASE}/api/v1/course/get/${unitId}`);
  if (!res.ok) throw new Error(`Schedule fetch failed: ${res.status}`);
  return res.json(); // array of { type, timeslots: [{ weekday, start_time, end_time, building, floor, room }] }
}

export async function getSemesters() {
  const res = await fetch(`${BASE}/api/v1/misc/semesters`);
  if (!res.ok) throw new Error(`Semesters fetch failed: ${res.status}`);
  return res.json();
}

export async function getSectionIds({ level, semkez, parentId, nameSearch, limit = 200 } = {}) {
  const params = new URLSearchParams({ limit });
  if (level !== undefined) params.set('level', level);
  if (semkez) params.set('semkez', semkez);
  if (parentId !== undefined) params.set('parent_id', parentId);
  if (nameSearch) params.set('name_search', nameSearch);
  const res = await fetch(`${BASE}/api/v1/section/list?${params}`);
  if (!res.ok) throw new Error(`Section list failed: ${res.status}`);
  return res.json();
}

export async function getSection(sectionId) {
  const res = await fetch(`${BASE}/api/v1/section/${sectionId}/get`);
  if (!res.ok) throw new Error(`Section fetch failed: ${res.status}`);
  return res.json();
}
