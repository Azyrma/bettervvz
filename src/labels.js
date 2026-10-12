// Display names for the codes used in VVZ data (see vvzapi models.py and the VVZ legends).

export const DEPARTMENTS = {
  1: ['D-ARCH', 'Architecture'],
  2: ['D-BAUG', 'Civil, Environmental and Geomatic Engineering'],
  3: ['D-MAVT', 'Mechanical and Process Engineering'],
  5: ['D-INFK', 'Computer Science'],
  7: ['D-MTEC', 'Management, Technology, and Economics'],
  8: ['D-MATH', 'Mathematics'],
  9: ['D-PHYS', 'Physics'],
  11: ['D-BIOL', 'Biology'],
  13: ['D-ERDW', 'Earth and Planetary Sciences'],
  17: ['D-GESS', 'Humanities, Social and Political Sciences'],
  18: ['D-ITET', 'Information Technology and Electrical Engineering'],
  19: ['D-MATL', 'Materials'],
  20: ['D-CHAB', 'Chemistry and Applied Biosciences'],
  23: ['D-BSSE', 'Biosystems Science and Engineering'],
  24: ['D-HEST', 'Health Sciences and Technology'],
  25: ['D-USYS', 'Environmental Systems Science'],
};

export const LEVELS = {
  BSC: 'Bachelor',
  MSC: 'Master',
  DR: 'Doctorate',
  DZ: 'Didactics Certificate',
  DS: 'Diploma Programme',
  SHE: 'Teaching Diploma',
  GS: 'Mobility Students',
  WBZ: 'Advanced Studies (CAS, DAS)',
  NDS: 'Master of Advanced Studies',
};

export const COURSE_TYPES = {
  V: 'Lecture',
  G: 'Lecture with exercise',
  U: 'Exercise',
  S: 'Seminar',
  P: 'Practical / lab course',
  K: 'Colloquium',
  A: 'Independent project',
  D: 'Thesis',
  R: 'Revision course / private study',
};

export const SECTION_TYPES = {
  O: 'Compulsory',
  WO: 'Compulsory elective',
  'W+': 'Eligible for credits and recommended',
  W: 'Eligible for credits',
  'E-': 'Recommended, not eligible for credits',
  Z: 'Outside the curriculum',
  Dr: 'Suitable for doctorate',
};

export const FREQUENCY = {
  ANNUAL: 'Every year',
  SEMESTER: 'Every semester',
  BIENNIAL: 'Every two years',
  ONETIME: 'One-time',
};

export const OCCURRENCE = { NO: 'Not taking place this year', CANCELLED: 'Cancelled' };

export const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

export const RATINGS = ['Recommended', 'Engaging', 'Difficulty', 'Effort', 'Resources'];

// Minimum CourseReview averages offered by the rating filter.
export const RATING_STEPS = [3, 3.5, 4, 4.5];

// Programme level from its name, the way VVZ groups programmes by Stufe. Cross-level sections
// (General Courses, Science in Perspective, …) match no rule and belong to every level.
const LEVEL_RULES = [
  [/Master of Advanced Studies|\bMAS\b|\bEMBA\b/, 'NDS'],
  [/\bBachelor\b/, 'BSC'],
  [/\bMaster\b/, 'MSC'],
  [/Doctora/, 'DR'],
  [/Teaching Diploma/, 'SHE'],
  [/Didactic|\bTC\b/, 'DZ'],
  [/\b(CAS|DAS)\b|Advanced Studies/, 'WBZ'],
  [/Mobility/, 'GS'],
];
export const programmeLevel = name => LEVEL_RULES.find(([re]) => re.test(name))?.[1] ?? null;

export const capitalize = s => (s ? s[0].toUpperCase() + s.slice(1) : s);

// "2026W" → "HS26", "2027S" → "FS27"
export const semesterLabel = semkez => `${semkez[4] === 'W' ? 'HS' : 'FS'}${semkez.slice(2, 4)}`;
export const semesterName = semkez => `${semkez[4] === 'W' ? 'Autumn' : 'Spring'} ${semkez.slice(0, 4)}`;

export const formatCredits = c => (c == null ? null : `${Number(c)} ECTS`);
