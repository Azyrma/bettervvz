import { Link } from 'react-router-dom';
import './Hero.css';

function Hero() {
  return (
    <main className="hero">
      <h1 className="hero-title">Plan your ETH semester.</h1>
      <p className="hero-subtitle">
        Search courses, build your timetable, and map out your degree — all in one place.
      </p>
      <div className="hero-actions">
        <Link to="/courses" className="btn-primary">Browse Courses</Link>
        <Link to="/planner" className="btn-secondary">Semester Planner</Link>
      </div>
    </main>
  );
}

export default Hero;
