# vvz-app (VVZ++)

A faster, friendlier front end for the ETH Zürich course catalogue (VVZ, Vorlesungsverzeichnis). All course data comes from [vvzapi.ch](https://vvzapi.ch).

## Features

- Instant, typo-tolerant search over course titles (English and German), course numbers and lecturers. It runs in a Web Worker and answers in a few milliseconds per keystroke, so `machne lerning`, `anlysis 1` or `252-0027` all find what you meant.
- Everything the official VVZ search offers (semester, programme structure, department, level, title or number, lecturer, course type, language, periodicity, ECTS, catalogue data, day/time/place, results with programme structure), with live counts per filter option, plus registration restrictions, courses not taking place and CourseReview rating.
- Optional full-text search through the catalogue data (abstract, objective, content, literature, lecture notes, prerequisites, comments).
- The complete vvzapi.ch query syntax (e.g. `c>=6 o:"computer science master" -d:analysis`), answered live by vvzapi.ch for the selected semester.
- Plain searches are also sent to vvzapi.ch once you stop typing (unless a filter vvzapi.ch can't express, like course type or time, is active), so courses added since the last index build still show up. Semesters published after the build are searched live.
- Course pages with everything vvzapi.ch knows: credits, levels, departments, lecturers, times and rooms, exercise groups, performance assessment, examiners, registration rules, programmes the course counts for, descriptions, competencies, learning materials and CourseReview ratings.
- Every search is a URL: share it, bookmark it, and the back button restores your results.
- Installable on phones as an app (PWA) that keeps working offline after the first visit.
- Light mode by default, dark mode from the header toggle.
- Timetable and semester planner are hidden for now.

## How the data flows

`npm run data` downloads the vvzapi.ch database dump and turns it into a compact index per semester in `public/data/` (about 150 KB gzipped per semester), plus a description index that is only loaded when description search is switched on. It only re-downloads when vvzapi.ch publishes a new dump, and it runs automatically before `npm run dev` and `npm run build`.

Typing searches these indexes instantly because the live search API returns every semester's full text for each course (about 37 KB per course) and has no typo tolerance. vvzapi.ch stays the source of truth: course pages, advanced queries and semesters newer than the index go to its API directly, and plain searches are double-checked against it once typing pauses.

## Development

Requires Node.js 22.13 or newer (the data script uses the built-in `node:sqlite`) and npm. On Arch: `sudo pacman -S nodejs npm`.

```bash
npm install
npm run dev       # dev server on localhost:5173 (fetches course data first)
npm run build     # production build to dist/
npm run lint      # ESLint
npm test          # search engine checks against the HS26 index
npm run data      # refresh course data from vvzapi.ch by hand
```

## Install on your phone

Deploy `dist/` to any static host with HTTPS that serves `index.html` for unknown paths (SPA fallback, needed for `/courses/<id>` links), then open the site on your phone:

- Android (Chrome): menu → **Install app**.
- iPhone (Safari): Share → **Add to Home Screen**.

Installation needs HTTPS (or `localhost`), so `npx vite preview --host` over plain HTTP in your local network is fine for trying the UI but won't offer installation.
