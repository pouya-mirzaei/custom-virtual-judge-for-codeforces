# PROGRESS.md — algo404 Contest Platform

> **Purpose**: If switching to a new chat session, paste this prompt:
> "Read /home/meraxes/workspace/uni/algo404/PROGRESS.md and continue building from where we left off. Also read MEGA_PROMPT_CONTEST_PLATFORM.md for the full spec."

## Current Status

**Last completed step**: 30 — Admin contest create/edit
**Next step**: 31 — Socket.io live integration

## Completed Steps

### 1. Project Scaffolding ✅

- Directory structure: `cf-service/`, `backend/src/{config,models,routes,middleware,services,utils}`, `frontend/`
- `backend/package.json` with all dependencies (express, mongoose, jwt, bcrypt, socket.io, etc.)
- `backend/.env` and `.env.example`
- `cf-service/requirements.txt` (fastapi, uvicorn, curl_cffi)

### 2-6. Python CF Service (cf-service/cf_service.py) ✅

All 5 Codeforces endpoints + health check, fully tested:

- `GET /health` — checks curl_cffi can reach CF
- `POST /cf/validate-cookies` — validates CF cookies, extracts handle
- `GET /cf/problem/{contest_id}/{problem_index}` — fetches & parses problem HTML, samples, limits, rating, tags
- `POST /cf/submit` — submits code to CF via curl_cffi (CSRF token extraction → POST → submission ID)
- `GET /cf/verdict/{handle}/{submission_id}` — gets verdict from CF public API (no cookies needed)

**How to run**: `cd cf-service && source ../.venv/bin/activate && uvicorn cf_service:app --host 0.0.0.0 --port 8000`
**Swagger docs**: http://localhost:8000/docs

### 7. Backend Express App + MongoDB ✅

- `backend/src/config/env.js` — env config (PORT, MONGODB_URI, JWT_SECRET, ENCRYPTION_KEY, CF_SERVICE_URL)
- `backend/src/config/db.js` — Mongoose connection with disconnect handling
- `backend/src/app.js` — Express app with CORS, JSON parser, health check, 404/error handlers
- `backend/src/server.js` — HTTP server (separate for Socket.io later)
- MongoDB running via Docker: `docker start algo404-mongo` (port 27017, volume `algo404-mongo-data`)

**How to run**: `cd backend && node src/server.js`
**Health check**: `curl http://localhost:5000/api/health`

### 8. User Model + Auth Routes ✅

- `backend/src/models/User.js` — Mongoose schema (username, email, passwordHash, role, codeforcesHandle, codeforcesCookies, cookiesValidatedAt), bcrypt pre-save hook, `comparePassword()`, `toJSON()` strips sensitive fields
- `backend/src/routes/auth.js` — `POST /register` (validates fields, checks duplicates, returns JWT), `POST /login` (accepts username or email)

### 9. JWT Middleware + /me Endpoint ✅

- `backend/src/middleware/auth.js` — `auth` middleware (extracts Bearer token, verifies JWT, attaches `req.user`), `adminOnly` middleware (checks role)
- `GET /api/auth/me` — returns current user from JWT

### 10. Encryption Util + CF Cookie Linking ✅

- `backend/src/utils/encryption.js` — AES-256-CBC encrypt/decrypt using ENCRYPTION_KEY from env (64-char hex → 32 bytes)
- `backend/src/routes/users.js` — `POST /link-codeforces` (validates cookies via Python CF service, encrypts & stores), `DELETE /unlink-codeforces` (clears CF fields)
- Encryption roundtrip verified: encrypt → decrypt returns original string

### 11. Contest Model + CRUD Routes ✅

- `backend/src/models/Contest.js` — Mongoose schema (title, description, createdBy, startTime, duration, endTime auto-computed, problems array, participants, scoringType ICPC/IOI, penaltyTime, freezeTime, visibility public/private/password, status upcoming/running/ended)
- `backend/src/routes/contests.js` — Full CRUD:
  - `GET /api/contests` — list all (public, no auth needed)
  - `GET /api/contests/:id` — single contest with populated createdBy & participants
  - `POST /api/contests` — create (admin only), auto-generates problemId from contestId+problemIndex
  - `PUT /api/contests/:id` — update (admin only), re-computes endTime
  - `DELETE /api/contests/:id` — delete (admin only)
  - `POST /api/contests/:id/join` — join contest (auth, requires linked CF account, password check for protected)
- Test users: `testuser` (admin), `regularuser` (user)

### 12. CachedProblem Model + Problem Fetch Route ✅

- `backend/src/models/CachedProblem.js` — Mongoose schema (problemId unique, contestId, problemIndex, name, timeLimit, memoryLimit, htmlContent, samples, rating, tags, fetchedAt). `isStale()` method (24h TTL)
- `backend/src/routes/problems.js` — `GET /api/problems/:contestId/:problemIndex` (auth required). Checks MongoDB cache first, if miss/stale proxies to Python CF service, upserts result
- Cache hit: ~18ms. Fresh fetch: seconds (CF roundtrip)

### 13. Submission Model + Submit Route ✅

- `backend/src/models/Submission.js` — Mongoose schema (contestId, userId, problemId, code, language, languageId, cfSubmissionId, verdict, testsPassed, timeTaken, memoryUsed, points, penalty). Indexed on contestId+userId+problemId and cfSubmissionId
- `backend/src/routes/submissions.js` — 3 endpoints:
  - `POST /api/submissions` — validates contest running, user is participant, problem in contest, decrypts cookies, submits to CF via Python service, saves with PENDING verdict
  - `GET /api/submissions` — list with filters (contestId, userId, problemId), non-admin sees own only, excludes code
  - `GET /api/submissions/:id` — full submission with code (owner or admin only)
- Guards tested: missing fields (400), contest not running (400), not participant (403), problem not in contest (400), no cookies (400)

### 14. Verdict Polling ✅

- `backend/src/services/verdictPoller.js` — in-process background poller
  - `pollVerdict(submissionDbId, cfHandle, cfSubmissionId, contestId)` — polls `GET /cf/verdict/{handle}/{id}` every 5s, max 60 attempts (5 min)
  - On final verdict (not TESTING): updates Submission with verdict, testsPassed, timeTaken, memoryUsed
  - On timeout: sets verdict to `VERDICT_TIMEOUT`
  - Tracks active polls via Map, exposes `getActivePollCount()` for debugging
  - TODO hooks for standings update (step 15) and Socket.io emit (step 16)
- Wired into `POST /api/submissions` — fire-and-forget after save (no await)
- Tested: created PENDING submission → polled tourist's CF submission 362666374 → updated to COMPILATION_ERROR

### 15. Standing Model + Scoring Service ✅

- `backend/src/models/Standing.js` — Mongoose schema (contestId, userId, rank, totalPoints, totalPenalty, problemsSolved, problems array). Unique index on contestId+userId, rank index for sorted leaderboard
- `backend/src/services/scoringService.js` — ICPC scoring logic:
  - `calculateICPCScore(contestId, userId)` — processes submissions chronologically, tracks attempts/solveTime/penalty per problem
  - `updateStandings(contestId)` — recalculates all participants, sorts by solved desc / penalty asc, upserts Standing docs
  - Penalty = solveTime + (failedAttempts × penaltyTime). Tested: 2 WA + 1 AC at 25min = penalty 65 ✓
- `backend/src/routes/standings.js` — `GET /api/standings/:contestId` returns contest info, problem list, and sorted standings with populated usernames
- Wired into `app.js` and `verdictPoller.js` — standings auto-update after each verdict

### 16. Socket.io Setup + Real-Time Events ✅

- `backend/src/services/socketService.js` — Socket.io service:
  - `init(server)` — attaches Socket.io to HTTP server with CORS
  - `emitSubmissionUpdate(contestId, submission)` — emits `submission-update` to contest room
  - `emitStandingsUpdate(contestId, standings)` — emits `standings-update` to contest room
  - Room-based: clients join/leave `contest-{id}` rooms
- `server.js` — Socket.io initialized on HTTP server startup
- `verdictPoller.js` — emits both events after verdict + standings update
- Tested: client connects, joins room, server logs connection/room events

### 17. Admin Routes ✅

- `backend/src/routes/admin.js` — 3 admin-only endpoints (all guarded by auth + adminOnly middleware):
  - `GET /api/admin/users` — list all users (excludes passwordHash & cookies)
  - `PUT /api/admin/users/:id/role` — change user role (admin/user), self-demotion blocked
  - `POST /api/admin/rejudge/:submissionId` — resets verdict to PENDING, re-polls CF verdict
- Wired into `app.js`
- Tested: list users ✓, role change ✓, self-demotion block ✓, invalid role ✓, non-admin 403 ✓, rejudge errors ✓

### 18. Rate Limiting + Input Validation ✅

- `backend/src/middleware/rateLimiter.js` — 3 rate limiters:
  - `globalLimiter`: 100 requests/min per IP (applied to all routes in app.js)
  - `submitLimiter`: 3 requests/min (applied to POST /api/submissions)
  - `authLimiter`: 10 requests/min (applied to POST /api/auth/register + /login)
- `backend/src/utils/validators.js` — 5 validation chains + `validate` middleware:
  - `registerValidation`: username (3-30 chars, alphanumeric+underscore), email, password (6-128 chars)
  - `loginValidation`: login + password required
  - `submitValidation`: contestId (valid MongoDB ID), problemId (regex match), code (1-100k chars), language, languageId
  - `contestValidation`: title (3-200 chars), startTime (ISO8601), duration (1-10080 min), problems array
  - `linkCookiesValidation`: cookies string required (10-10000 chars)
- Wired: globalLimiter in app.js, authLimiter+validation in auth.js, submitLimiter+validation in submissions.js, contestValidation in contests.js, linkCookiesValidation in users.js
- Tested: register with bad data → 400 with field errors ✓, login empty body → 400 ✓, submit invalid fields → 400 ✓

### 19. React + Vite + Tailwind CSS Setup ✅

- Scaffolded `frontend/` with Vite + React template
- Installed: react-router-dom, axios, socket.io-client, lucide-react, react-hot-toast, date-fns
- Tailwind CSS v4 with @tailwindcss/vite plugin (CSS-first config)
- `vite.config.js`: port 3000, API proxy `/api` → `http://localhost:5000`
- `index.css`: Tailwind import + dark theme (custom colors: primary, dark, card, border, text, etc.)
- `App.jsx`: BrowserRouter + Toaster + placeholder route
- `.env`: VITE_API_URL=http://localhost:5000
- Tested: `npm run dev` serves on :3000, API proxy forwards to backend ✓

### 20. API Client + AuthContext ✅

- `frontend/src/services/api.js` — Axios instance:
  - baseURL `/api` (proxied by Vite), auto-attaches JWT from localStorage
  - 401 interceptor: clears token + redirects to /login (skips auth routes)
- `frontend/src/context/AuthContext.jsx` — React context:
  - `AuthProvider` wraps app, auto-fetches user on mount via GET /auth/me
  - Exports: `user`, `loading`, `login()`, `register()`, `logout()`, `fetchUser()`, `isAdmin`
  - Token stored in localStorage, user state in React state
- `App.jsx` updated: wrapped with `<AuthProvider>`, temp Home component shows user info or "Not logged in"
- Tested: frontend loads, AuthContext initializes (no token → no user → shows "Not logged in") ✓

### 21. Login & Register Pages ✅

- `frontend/src/pages/LoginPage.jsx` — username/email + password form, calls `useAuth().login()`, toast on error, redirects to `/` on success
- `frontend/src/pages/RegisterPage.jsx` — username + email + password + confirm form, calls `useAuth().register()`, shows per-field validation errors as toasts
- `GuestRoute` component in App.jsx — redirects authenticated users away from login/register
- Routes: `/login`, `/register` wired in App.jsx
- Dark themed cards with Tailwind, lucide-react icons (LogIn, UserPlus)
- Tested: pages load at /login and /register, no compile errors ✓

### 22. Navbar + AppLayout ✅

- `frontend/src/components/Navbar.jsx` — sticky top nav with:
  - Logo link, Home, Contests, Admin (if admin), Profile (username), CF handle badge, Logout
  - Active route highlighting, lucide-react icons
  - Guest mode: Sign In + Register links
- `frontend/src/components/AppLayout.jsx` — layout wrapper with Navbar + `<Outlet />` + footer
- `App.jsx` restructured: login/register outside layout, all other routes inside `<AppLayout />`
- Tested: no compile errors, page loads with navbar ✓

### 23. Home Page (Contests List) ✅

- `frontend/src/pages/HomePage.jsx` — fetches GET /api/contests, groups by status:
  - Running Now (red dot), Upcoming, Past Contests sections
  - Contest cards: title, status badge, date, duration, scoring type, problem count
  - Live countdown timers for running (ends in) and upcoming (starts in) contests
  - Hover reveals "Enter contest" / "View details" / "View results" links
  - Loading spinner, error state handling
- Routes: `/` and `/contests` both render HomePage
- Tested: no compile errors, page loads correctly ✓

### 24. Profile + CF Cookie Linking ✅

- `frontend/src/pages/ProfilePage.jsx` — user profile + CF linking UI:
  - Account info section: username, email, role
  - CF link section: linked state shows handle + unlink button; unlinked state shows instructions + cookie textarea + link button
  - Step-by-step instructions for getting CF cookies from DevTools
  - Calls POST /api/users/link-codeforces and DELETE /api/users/unlink-codeforces
  - Refreshes user state via fetchUser() after link/unlink
  - Loading spinners, error toasts, success toasts
- Route `/profile` wired in App.jsx (redirects to /login if not authenticated)
- Tested: no compile errors, page loads ✓

### 25. Contest Detail Page ✅

- `frontend/src/pages/ContestPage.jsx` — contest dashboard:
  - Header: title, description, status badge, live countdown timer
  - Meta: start time, duration, scoring type, participant count
  - Join button (or "registered" badge, or "ended" indicator)
  - Quick links to Standings and My Submissions
  - Problem table: letter index (A, B, C...), title, CF source, links to problem view
  - Problems hidden for upcoming contests (unless participant)
- Route `/contest/:id` wired in App.jsx
- Tested: no compile errors, page loads ✓

### 26. Problem View Page ✅

- `frontend/src/pages/ProblemPage.jsx` — full problem viewer:
  - Breadcrumb: Contest name → Problem letter + name
  - Header: letter badge, problem name, "Submit Solution" button
  - Limits: time limit, memory limit, rating, CF source ID
  - Problem statement HTML rendered via `dangerouslySetInnerHTML` with `.problem-statement` CSS
  - Sample tests: side-by-side input/output with copy-to-clipboard buttons
  - Tags: collapsible spoiler section
  - Navigation: prev/next problem links + "All Problems" link
- Route `/contest/:id/problem/:order` wired in App.jsx
- Tested: no compile errors, page loads ✓

### 27. Code Submission UI ✅

- `frontend/src/pages/SubmitPage.jsx` — solution submission page:
  - Breadcrumb: Contest → Problem letter → Submit
  - Header: problem letter badge, name, CF source
  - CF cookies warning if not linked (with link to profile)
  - Language selector dropdown (27 CF languages with programTypeId)
  - Code textarea: monospace, line count, resizable, 384px default height
  - File upload button (max 256KB, reads into textarea)
  - Submit button: posts to `POST /api/submissions` with contestId, problemId, code, language, languageId
  - On success: navigates to `/contest/:id/submissions`
- Route `/contest/:id/problem/:order/submit` wired in App.jsx
- Tested: no compile errors, page loads ✓

### 28. My Submissions Page ✅

- `frontend/src/pages/SubmissionsPage.jsx` — user's submissions list:
  - Breadcrumb: Contest → My Submissions
  - Refresh button (manual)
  - Auto-refresh every 5s when any submission is PENDING/TESTING
  - Table: problem letter, language, verdict badge (colored AC/WA/TLE/MLE/RE/CE/Pending), time, memory, relative timestamp
  - VerdictBadge component with short names and color coding
  - Problem letter lookup from contest data
  - Link to submission detail + link to problem
  - Empty state with link back to contest
- Route `/contest/:id/submissions` wired in App.jsx
- Tested: no compile errors, page loads ✓

### 29. Standings Page ✅

- `frontend/src/pages/StandingsPage.jsx` — ICPC-style standings table:
  - Breadcrumb: Contest → Standings
  - Scoring type badge (ICPC)
  - Refresh button
  - Table: rank (gold/silver/bronze medals for top 3), username + CF handle, solved count, total penalty
  - Per-problem columns: +N (AC with wrong tries), solve time, -N (wrong attempts only)
  - Current user row highlighted with blue tint
  - Problem column headers link to problem pages
  - Empty state when no standings exist
  - RankBadge component with medal icons for top 3
  - ProblemCell component with color-coded AC/WA display
- Route `/contest/:id/standings` wired in App.jsx
- Tested: no compile errors, page loads ✓

### 30. Admin Contest Create/Edit ✅

- `frontend/src/pages/AdminPage.jsx` — admin dashboard:
  - Tabs: Contests (table with title, status, start, duration, problems, edit link) + Users (table with role toggle)
  - "Create Contest" button linking to form
  - User role promotion/demotion via PUT `/api/admin/users/:id/role`
  - Admin-only guard (redirects non-admins)
- `frontend/src/pages/AdminContestFormPage.jsx` — create/edit contest form:
  - Title, description, datetime-local start time, duration (minutes)
  - Scoring: type (ICPC/IOI), penalty time, freeze time
  - Visibility: public/private/password (with password input)
  - Problems: dynamic list of CF problem codes (e.g. 4A, 1234/B) with A/B/C auto-assignment
  - Parses problem codes to contestId + problemIndex
  - POST `/api/contests` or PUT `/api/contests/:id`
  - On create success: navigates to contest page
- Routes: `/admin`, `/admin/contest/new`, `/admin/contest/:id/edit` wired in App.jsx
- Tested: no compile errors, pages load ✓

## Remaining Steps

### Backend (Node.js Express) — Steps 14-18

14. ✅ Verdict polling (background polling after submission)
15. ✅ Standing model + ICPC scoring service
16. ✅ Socket.io setup + real-time events (submission-update, standings-update)
17. ✅ Admin routes (list users, change roles, rejudge)
18. ✅ Rate limiting + express-validator input validation

### Frontend (React) — Steps 19-31

19. ✅ React + Vite + Tailwind CSS setup
20. ✅ API client (axios) + AuthContext
21. ✅ Login & Register pages
22. ✅ Navbar + AppLayout component
23. ✅ Home page (upcoming/running contests)
24. ✅ Profile page + CF cookie linking UI
25. ✅ Contest dashboard + problem list
26. ✅ Problem view page (rendered CF HTML)
27. ✅ Submit page (code editor + language selector)
28. ✅ My submissions page
29. ✅ Standings page (ICPC table)
30. ✅ Admin: create/edit contest page
31. Socket.io real-time integration (live verdicts + standings)

### Infrastructure — Step 32

32. Docker Compose (MongoDB, Redis, cf-service, backend, frontend)

## Key Decisions Made

- Full cookie string required (not just JSESSIONID) — Cloudflare needs cf_clearance
- curl_cffi is the ONLY working approach for CF inner pages
- Python microservice on port 8000, Express on 5000, React on 3000
- AES-256-CBC for cookie encryption in MongoDB
- In-process verdict polling first (BullMQ can be added later)
- Existing .venv at project root: `/home/meraxes/workspace/uni/algo404/.venv`

## Tech Stack

- Frontend: React + Vite + Tailwind CSS
- Backend: Node.js + Express
- Database: MongoDB + Mongoose
- CF Integration: Python + FastAPI + curl_cffi
- Real-time: Socket.io
- Auth: JWT + bcrypt
- Encryption: AES-256-CBC
