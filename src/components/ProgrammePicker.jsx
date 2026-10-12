import { useMemo, useState } from 'react';
import { normalize } from '../search/normalize';
import './ProgrammePicker.css';

// Programme level from its name, the way VVZ groups programmes by Stufe. Cross-level sections
// (General Courses, Science in Perspective, …) match no rule and are listed under every level.
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
const levelOf = name => LEVEL_RULES.find(([re]) => re.test(name))?.[1] ?? null;
const fitsLevel = (s, levels) => {
  const level = levelOf(s.path[0]);
  return !levels.length || level == null || levels.includes(level);
};

// VVZ's Studiengang / Bereich / Unterbereich names; deeper levels keep the last one.
const DEPTH_LABELS = ['Programme', 'Area', 'Sub-area'];

// Cascading selects down the VVZ section tree (one more per level until a leaf), plus a search across the whole tree.
function ProgrammePicker({ sections, value, onChange, levels = [] }) {
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState(false);

  const byId = useMemo(() => new Map(sections.map(s => [s.id, s])), [sections]);
  const children = useMemo(() => {
    const map = new Map();
    for (const s of sections) {
      const parent = byId.has(s.parent) ? s.parent : null;
      if (!map.has(parent)) map.set(parent, []);
      map.get(parent).push(s);
    }
    for (const list of map.values()) list.sort((a, b) => a.name.localeCompare(b.name));
    return map;
  }, [sections, byId]);
  const haystack = useMemo(() => sections.map(s => [s, normalize(s.path.join(' '))]), [sections]);

  const matches = useMemo(() => {
    const words = normalize(query).split(' ').filter(Boolean);
    if (!words.length) return [];
    return haystack
      .filter(([s, h]) => words.every(w => h.includes(w)) && fitsLevel(s, levels))
      .map(([s]) => s)
      .sort((a, b) => a.path.length - b.path.length || b.count - a.count)
      .slice(0, 80);
  }, [query, haystack, levels]);

  if (value != null && !byId.has(value)) {
    // Section ids are per semester; an unknown id means the semester changed underneath.
    return <button type="button" className="pp-reset" onClick={() => onChange(null)}>Section not in this semester · clear</button>;
  }

  const chain = [];
  for (let s = byId.get(value); s; s = byId.get(s.parent)) chain.unshift(s);
  const roots = (children.get(null) ?? []).filter(s => fitsLevel(s, levels) || s.id === chain[0]?.id);
  const levelsShown = [{ options: roots, selected: chain[0]?.id, parent: null }];
  chain.forEach((s, i) => {
    const kids = children.get(s.id);
    if (kids?.length) levelsShown.push({ options: kids, selected: chain[i + 1]?.id, parent: s.id });
  });

  const pick = s => {
    onChange(s.id);
    setQuery('');
    setOpen(false);
  };

  return (
    <div className="pp">
      <div className="pp-search" onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}>
        <input
          type="search"
          className="pp-input"
          placeholder="Search programme or section…"
          value={query}
          onChange={e => { setQuery(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          onKeyDown={e => {
            if (e.key === 'Enter' && matches[0]) pick(matches[0]);
            if (e.key === 'Escape') setOpen(false);
          }}
          aria-label="Search study programme or section"
        />
        {open && query.trim() && (
          <ul className="pp-options" onMouseDown={e => e.preventDefault()}>
            {matches.length === 0 && <li className="pp-empty">No matching section</li>}
            {matches.map(s => (
              <li key={s.id}>
                <button type="button" onClick={() => pick(s)}>
                  {s.path.length > 1 && <span className="pp-path">{s.path.slice(0, -1).join(' › ')}</span>}
                  <span className="pp-name">{s.name}</span>
                  <span className="pp-count">{s.count}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {levelsShown.map(({ options, selected, parent }, depth) => (
        <label key={parent ?? 'root'} className="pp-level">
          <span>{DEPTH_LABELS[Math.min(depth, DEPTH_LABELS.length - 1)]}</span>
          <select value={selected ?? ''} onChange={e => onChange(e.target.value ? Number(e.target.value) : parent)}>
            <option value="">{depth === 0 ? 'All programmes' : 'All'}</option>
            {options.map(o => <option key={o.id} value={o.id}>{o.name} ({o.count})</option>)}
          </select>
        </label>
      ))}
    </div>
  );
}

export default ProgrammePicker;
