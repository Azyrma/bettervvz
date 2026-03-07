import { useState } from 'react';
import { Routes, Route } from 'react-router-dom';
import './App.css';
import NavBar from './components/NavBar';
import Hero from './pages/Hero';
import CourseSearch from './pages/CourseSearch';
import CourseDetail from './pages/CourseDetail';
import Placeholder from './pages/Placeholder';
import Timetable from './pages/Timetable';

function App() {
  const [timetableCourses, setTimetableCourses] = useState([]);

  function toggleTimetableCourse(courseInfo) {
    setTimetableCourses(prev => {
      const exists = prev.some(c => c.id === courseInfo.id);
      return exists ? prev.filter(c => c.id !== courseInfo.id) : [...prev, courseInfo];
    });
  }

  return (
    <>
      <NavBar />
      <Routes>
        <Route path="/" element={<Hero />} />
        <Route path="/courses" element={<CourseSearch timetableCourses={timetableCourses} onToggleCourse={toggleTimetableCourse} />} />
        <Route path="/courses/:unitId" element={<CourseDetail />} />
        <Route path="/timetable" element={<Timetable timetableCourses={timetableCourses} />} />
        <Route path="/planner" element={<Placeholder title="Semester Planner" />} />
      </Routes>
    </>
  );
}

export default App;
