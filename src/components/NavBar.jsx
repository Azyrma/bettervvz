import { NavLink } from 'react-router-dom';
import './NavBar.css';

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
        </nav>
      </div>
    </header>
  );
}

export default NavBar;
