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

## Host it on a Raspberry Pi

`deploy/Caddyfile` serves the build with HTTPS, the fallback for `/courses/<id>` links and the cache headers the offline app relies on.

1. Install Caddy on the Pi: `sudo apt install caddy` (Raspberry Pi OS) or `sudo pacman -S caddy` (Arch Linux ARM).
2. Build and copy the app from your laptop (replace `pi@raspberrypi` with your Pi):
   ```bash
   ssh pi@raspberrypi 'sudo mkdir -p /srv/vvz && sudo chown $USER /srv/vvz'
   npm run build
   rsync -a --delete dist/ pi@raspberrypi:/srv/vvz/
   ```
3. Copy `deploy/Caddyfile` to `/etc/caddy/Caddyfile` on the Pi, set the site address on its first line, and run `sudo systemctl reload caddy`. For HTTPS, either
   - use a domain that points to the Pi with ports 80 and 443 forwarded; Caddy then gets a certificate on its own, or
   - keep it private with [Tailscale](https://tailscale.com) on the Pi and your phone: set the site address to `:80`, enable HTTPS certificates in the Tailscale admin console and run `sudo tailscale serve --bg 80` on the Pi. The app is then at `https://<pi-name>.<tailnet>.ts.net`.

Repeat step 2 whenever you want fresher course indexes; until then, plain searches still pick up newer courses from vvzapi.ch.

## Install on your phone

Any other static host with HTTPS works too, as long as it serves `index.html` for unknown paths (SPA fallback, needed for `/courses/<id>` links). Open the site on your phone:

- Android (Chrome): menu → **Install app**.
- iPhone (Safari): Share → **Add to Home Screen**.

Installation needs HTTPS (or `localhost`), so `npx vite preview --host` over plain HTTP in your local network is fine for trying the UI but won't offer installation.
