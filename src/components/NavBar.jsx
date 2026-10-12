import { useState } from 'react';
import { NavLink } from 'react-router-dom';
import './NavBar.css';

function ThemeToggle() {
  const [dark, setDark] = useState(() => document.documentElement.dataset.theme === 'dark');
  const toggle = () => {
    const next = !dark;
    setDark(next);
    if (next) document.documentElement.dataset.theme = 'dark';
    else delete document.documentElement.dataset.theme;
    try {
      localStorage.setItem('theme', next ? 'dark' : 'light');
    } catch { /* storage blocked: theme lasts for this visit */ }
  };
  return (
    <button type="button" className="theme-toggle" onClick={toggle} aria-pressed={dark} title={dark ? 'Switch to light mode' : 'Switch to dark mode'}>
      <span className="visually-hidden">Dark mode</span>
      {dark ? (
        <svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="4.5" /><path d="M12 2v2.5M12 19.5V22M2 12h2.5M19.5 12H22M4.9 4.9l1.8 1.8M17.3 17.3l1.8 1.8M4.9 19.1l1.8-1.8M17.3 6.7l1.8-1.8" /></svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5Z" /></svg>
      )}
    </button>
  );
}

// Timetable and Semester Planner links are hidden until course search is finished.
function NavBar() {
  return (
    <header className="navbar">
      <div className="navbar-inner container">
        <NavLink to="/" className="navbar-brand" aria-label="VVZ++ course search">
          <span className="navbar-mark">VVZ</span>
          <span className="navbar-plus">++</span>
          <span className="navbar-sub">ETH course catalogue</span>
        </NavLink>
        <nav className="navbar-links">
          <NavLink to="/" end className={({ isActive }) => (isActive ? 'active' : '')}>Courses</NavLink>
          <a href="https://www.vvz.ethz.ch/Vorlesungsverzeichnis/sucheLehrangebotPre.view?lang=en" target="_blank" rel="noreferrer">
            Official VVZ <span aria-hidden="true">↗</span>
          </a>
          <ThemeToggle />
        </nav>
      </div>
    </header>
  );
}

export default NavBar;
