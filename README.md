# vvz-app

A web app for planning courses at ETH Zürich. Course data comes from the VVZ (Vorlesungsverzeichnis) through [vvzapi.ch](https://vvzapi.ch).

## Features

- Search for courses.
- View a course's details: credits, level, lecturers, exam type, schedule, rooms, description, and objectives.
- Add courses to a weekly timetable.
- Semester planner (not built yet).

## Development

Requires Node.js and npm. On Arch: `sudo pacman -S nodejs npm`.

```bash
npm install
npm run dev       # dev server on localhost:5173
npm run build     # production build to dist/
npm run lint      # ESLint
```
