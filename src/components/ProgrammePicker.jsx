import { useMemo, useState } from 'react';
import { normalize } from '../search/normalize';
import './ProgrammePicker.css';

// Search the whole VVZ section tree at once ("cs master core") or drill down level by level.
function ProgrammePicker({ sections, value, onChange }) {
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
    if (!words.length) return children.get(null) ?? [];
    return haystack
      .filter(([, h]) => words.every(w => h.includes(w)))
      .map(([s]) => s)
      .sort((a, b) => a.path.length - b.path.length || b.count - a.count)
      .slice(0, 80);
  }, [query, haystack, children]);

  const selected = value != null ? byId.get(value) : null;

  if (value != null && !selected) {
    // Section ids are per semester; an unknown id means the semester changed underneath.
    return <button type="button" className="pp-reset" onClick={() => onChange(null)}>Section not in this semester · clear</button>;
  }

  if (selected) {
    const ancestors = [];
    for (let s = byId.get(selected.parent); s; s = byId.get(s.parent)) ancestors.unshift(s);
    const kids = children.get(selected.id) ?? [];
    return (
      <div className="pp-selected">
        <div className="pp-crumbs">
          {ancestors.map(a => (
            <button type="button" key={a.id} className="pp-crumb" onClick={() => onChange(a.id)}>{a.name}</button>
          ))}
          <span className="pp-current">{selected.name}</span>
        </div>
        <button type="button" className="pp-clear" onClick={() => onChange(null)}>Clear programme</button>
        {kids.length > 0 && (
          <ul className="pp-children">
            {kids.map(k => (
              <li key={k.id}>
                <button type="button" onClick={() => onChange(k.id)}>
                  <span>{k.name}</span>
                  <span className="pp-count">{k.count}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    );
  }

  const pick = s => {
    onChange(s.id);
    setQuery('');
    setOpen(false);
  };

  return (
    <div
      className="pp-search"
      onBlur={e => { if (!e.currentTarget.contains(e.relatedTarget)) setOpen(false); }}
    >
      <input
        type="search"
        className="pp-input"
        placeholder="Programme, major or section…"
        value={query}
        onChange={e => { setQuery(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        onKeyDown={e => {
          if (e.key === 'Enter' && matches[0]) pick(matches[0]);
          if (e.key === 'Escape') setOpen(false);
        }}
        aria-label="Search study programme or section"
      />
      {open && (
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
  );
}

export default ProgrammePicker;
