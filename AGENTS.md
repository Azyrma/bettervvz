# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev       # Start dev server (HMR on localhost:5173)
npm run build     # Production build to dist/
npm run lint      # Run ESLint
npm run preview   # Preview production build
```

## Architecture

React 19 SPA using Vite, bootstrapped with `react-router-dom` v7 and `BrowserRouter` wrapping the entire app in `src/main.jsx`.

- `src/main.jsx` — entry point, mounts `<BrowserRouter><App /></BrowserRouter>`
- `src/App.jsx` — root component, owns the `<Routes>` tree
- `src/components/` — reusable components (currently just `NavBar.jsx`)

This is an early-stage ETH VVZ (course catalog) planner app. The routing and component structure are minimal stubs.

## Notes

- ESLint is configured for JS/JSX (not TypeScript). `no-unused-vars` ignores names matching `^[A-Z_]`.
- No test framework is set up yet.

 For the course page, use a bento box style layout. Have one section be the hero         
  section with the title, ects, level, department, year and lecturers. Have another       
  section with all exam information. One section for lecture location, time and that      
  stuff. One section for the descriptions and another to show where the course is         
  offered in (e.g. CS Bachelor, Core Courses)  


Resume: claude --resume 922fd450-6c80-4070-ab6a-0329d4def3b2