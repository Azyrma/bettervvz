import { NavLink } from 'react-router-dom';
import './NavBar.css';

function NavBar() {
  return (
    <nav className="navbar">
      <NavLink to="/" className="navbar-brand">VVZ++</NavLink>
      <div className="navbar-links">
        <NavLink to="/" end className={({ isActive }) => isActive ? 'active' : ''}>Home</NavLink>
        <NavLink to="/courses" className={({ isActive }) => isActive ? 'active' : ''}>Course Search</NavLink>
        <NavLink to="/timetable" className={({ isActive }) => isActive ? 'active' : ''}>Timetable</NavLink>
        <NavLink to="/planner" className={({ isActive }) => isActive ? 'active' : ''}>Semester Planner</NavLink>
      </div>
    </nav>
  );
}

export default NavBar;
