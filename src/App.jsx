import { Routes, Route, Navigate, useParams } from 'react-router-dom';
import './App.css';
import NavBar from './components/NavBar';
import CourseSearch from './pages/CourseSearch';
import CourseDetail from './pages/CourseDetail';

// A fresh detail page per course, so no state leaks between courses.
function CourseDetailRoute() {
  const { unitId } = useParams();
  return <CourseDetail key={unitId} unitId={Number(unitId)} />;
}

// Timetable, Semester Planner and the old landing page are hidden for now; their pages stay in src/pages.
function App() {
  return (
    <>
      <NavBar />
      <Routes>
        <Route path="/" element={<CourseSearch />} />
        <Route path="/courses/:unitId" element={<CourseDetailRoute />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </>
  );
}

export default App;
