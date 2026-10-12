import { useMemo, useState } from 'react';
import { normalize } from '../search/normalize';
import { programmeLevel } from '../labels';
import './ProgrammePicker.css';

// With a level chosen, only programmes of that level (by name) are offered; cross-level collections
// like Science in Perspective or "General Courses" only appear when no level is chosen.
const fitsLevel = (s, levels) => !levels.length || levels.includes(programmeLevel(s.path[0]));

// VVZ's Studiengang / Bereich / Unterbereich names; deeper levels keep the last one.
const DEPTH_LABELS = ['Programme', 'Area', 'Sub-area'];

// Cascading selects down the VVZ section tree (one more per level until a leaf), plus a search across the whole tree.
// `counts` (section id → matching courses under the other filters) hides sections the current filters leave empty.
function ProgrammePicker({ sections, value, onChange, levels = [], counts }) {
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

  const countOf = s => (counts ? counts[s.id] ?? 0 : s.count);

  const matches = useMemo(() => {
    const words = normalize(query).split(' ').filter(Boolean);
    if (!words.length) return [];
    const n = s => (counts ? counts[s.id] ?? 0 : s.count);
    return haystack
      .filter(([s, h]) => words.every(w => h.includes(w)) && fitsLevel(s, levels) && n(s) > 0)
      .map(([s]) => s)
      .sort((a, b) => a.path.length - b.path.length || n(b) - n(a))
      .slice(0, 80);
  }, [query, haystack, levels, counts]);

  if (value != null && !byId.has(value)) {
    // Section ids are per semester; an unknown id means the semester changed underneath.
    return <button type="button" className="pp-reset" onClick={() => onChange(null)}>Section not in this semester · clear</button>;
  }

  const chain = [];
  for (let s = byId.get(value); s; s = byId.get(s.parent)) chain.unshift(s);
  const inChain = s => chain.some(c => c.id === s.id);
  const roots = (children.get(null) ?? []).filter(s => (fitsLevel(s, levels) && countOf(s) > 0) || inChain(s));
  const levelsShown = [{ options: roots, selected: chain[0]?.id, parent: null }];
  chain.forEach((s, i) => {
    const kids = (children.get(s.id) ?? []).filter(k => countOf(k) > 0 || inChain(k));
    if (kids.length) levelsShown.push({ options: kids, selected: chain[i + 1]?.id, parent: s.id });
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
                  <span className="pp-count">{countOf(s)}</span>
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
            {options.map(o => <option key={o.id} value={o.id}>{o.name} ({countOf(o)})</option>)}
          </select>
        </label>
      ))}
    </div>
  );
}

export default ProgrammePicker;
