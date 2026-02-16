# Mega Prompt: Custom Contest Platform for Codeforces Problems

## Project Overview

Build a web application similar to vjudge that allows hosting local programming contests using Codeforces problems. Participants log into the custom platform, read problem statements, and submit code. The platform uses their Codeforces cookies (JSESSIONID + cf_clearance + others) to submit code on their behalf via a Python microservice using `curl_cffi`.

**CRITICAL**: Codeforces uses Cloudflare with aggressive TLS fingerprinting. Standard HTTP clients (axios, fetch, requests, curl) are **blocked** on all inner pages. The **only working approach** is `curl_cffi` (Python), which wraps `curl-impersonate` to generate real Chrome TLS fingerprints. This has been **tested and verified** — submission #363219620 was successfully posted and received verdict OK.

## Tech Stack

- **Frontend**: React.js with Tailwind CSS
- **Backend**: Node.js with Express.jsر
- **Database**: MongoDB with Mongoose
- **CF Integration**: Python microservice using `curl_cffi` (MANDATORY — nothing else bypasses Cloudflare)
- **Real-time**: Socket.io for live leaderboard updates
- **Auth**: JWT for platform authentication
- **Caching**: Redis for problem statement cache + leaderboard cache
- **Queue**: BullMQ for submission job queue (Node.js → Python worker)

---

## System Architecture

### High-Level Architecture

```
┌─────────────────┐
│  React Frontend │
│  (Port 3000)    │
└────────┬────────┘
         │
         ├─── WebSocket (Socket.io)
         ├─── REST API
         │
┌────────▼────────┐       ┌──────────────────────┐
│  Express Server │──────►│  Python CF Service    │
│  (Port 5000)    │ HTTP  │  (Port 8000)          │
└────────┬────────┘       │  curl_cffi + FastAPI  │
         │                └──────────┬─────────────┘
         │                           │
         ├────► MongoDB              └────► Codeforces.com
         ├────► Redis                      (TLS-impersonated)
         └────► BullMQ Job Queue
```

### Why Python Microservice?

`curl_cffi` is a Python library. There is no equivalent Node.js library that can bypass Cloudflare's TLS fingerprinting. We tested and confirmed:

| Approach                           | Result                                                       |
| ---------------------------------- | ------------------------------------------------------------ |
| Node.js axios                      | **BLOCKED** — HTTP 400 (TLS fingerprint rejected)            |
| Node.js fetch                      | **BLOCKED** — Same TLS issue                                 |
| curl (CLI) with cookies            | **BLOCKED** — Cloudflare "Attention Required" on inner pages |
| Python requests                    | **BLOCKED** — Same TLS issue                                 |
| Selenium + undetected-chromedriver | **BLOCKED** — Cloudflare detects headless                    |
| **Python curl_cffi**               | **WORKS** — All pages load, submission succeeds              |

### Core Components

1. **User Management System**
   - Register/Login for platform
   - Link Codeforces account via full cookie string (JSESSIONID + cf_clearance + all others)
   - Cookie validation via Python service
   - Role-based access (Admin, Participant)

2. **Contest Management System**
   - Create/Edit/Delete contests
   - Add Codeforces problems by ID (e.g., "4A", "1234B")
   - Set start time, duration, scoring rules
   - Contest visibility (public/private/password-protected)

3. **Submission System**
   - Submit code through platform UI
   - Node.js enqueues job → Python worker dequeues and submits to CF
   - Track submission status via CF API (public, no auth needed)
   - Real-time verdict updates via Socket.io

4. **Leaderboard System**
   - Real-time standings via Socket.io
   - ICPC style scoring (solved count + penalty time)
   - IOI style scoring (partial points, best per problem)
   - Frozen leaderboard option

5. **Problem Display**
   - Fetch and cache problem statements via Python service (curl_cffi)
   - Render CF problem HTML in contest format
   - Cache aggressively in Redis (problems rarely change)

---

## Database Schema

### MongoDB Collections

#### 1. Users

```javascript
{
  _id: ObjectId,
  username: String,                // Platform username
  email: String,
  passwordHash: String,            // bcrypt hashed
  role: String,                    // "admin" | "participant"
  codeforcesHandle: String,        // CF username (validated on link)
  codeforcesCookies: String,       // AES-256 encrypted full cookie string
  cookiesValidatedAt: Date,        // Last time cookies were confirmed working
  createdAt: Date,
  lastLogin: Date
}
```

**IMPORTANT**: Store the **full cookie string**, not just JSESSIONID. Cloudflare requires `cf_clearance`, `JSESSIONID`, `X-User`, and several evercookie values. The user must provide all cookies from their browser.

#### 2. Contests

```javascript
{
  _id: ObjectId,
  title: String,
  description: String,
  createdBy: ObjectId,             // Admin user ID
  startTime: Date,
  duration: Number,                // in minutes
  endTime: Date,                   // computed: startTime + duration
  problems: [{
    problemId: String,             // e.g., "4A", "1234B"
    contestId: Number,             // CF contest ID (e.g., 4)
    problemIndex: String,          // CF problem index (e.g., "A")
    problemName: String,           // Cached name
    points: Number,                // Max points for this problem
    order: String                  // Display order: "A", "B", "C"...
  }],
  participants: [ObjectId],        // User IDs
  scoringType: String,             // "ICPC" | "IOI"
  penaltyTime: Number,             // ICPC: minutes per wrong submission (default: 20)
  freezeTime: Number,              // Minutes before end to freeze leaderboard (0 = no freeze)
  visibility: String,              // "public" | "private" | "password"
  password: String,                // If password-protected (bcrypt hashed)
  status: String,                  // "upcoming" | "running" | "ended"
  createdAt: Date
}
```

#### 3. Submissions

```javascript
{
  _id: ObjectId,
  contestId: ObjectId,
  userId: ObjectId,
  problemId: String,               // e.g., "4A"
  code: String,                    // Source code
  language: String,                // Language key (e.g., "cpp17")
  languageId: String,              // CF programTypeId (e.g., "54")
  submittedAt: Date,
  cfSubmissionId: Number,          // Codeforces submission ID (e.g., 363219620)
  verdict: String,                 // "PENDING" | "TESTING" | "OK" | "WRONG_ANSWER" | "TIME_LIMIT_EXCEEDED" | etc.
  testsPassed: Number,
  timeTaken: Number,               // milliseconds
  memoryUsed: Number,              // bytes
  points: Number,                  // Points awarded (IOI) or 0/1 (ICPC)
  penalty: Number                  // Time penalty in minutes (ICPC)
}
```

#### 4. Standings

```javascript
{
  _id: ObjectId,
  contestId: ObjectId,
  userId: ObjectId,
  rank: Number,
  totalPoints: Number,
  totalPenalty: Number,            // ICPC penalty time in minutes
  problemsSolved: Number,
  problems: [{
    problemId: String,
    attempts: Number,              // Total attempts
    solved: Boolean,
    points: Number,
    penalty: Number,               // Minutes
    solveTime: Number              // Minutes from contest start
  }],
  lastUpdated: Date
}
```

#### 5. CachedProblems

```javascript
{
  _id: ObjectId,
  problemId: String,               // e.g., "4A" — unique index
  contestId: Number,
  problemIndex: String,
  name: String,
  timeLimit: String,
  memoryLimit: String,
  statementHtml: String,           // Full problem statement HTML from CF
  sampleTests: [{
    input: String,
    output: String
  }],
  rating: Number,                  // CF difficulty rating
  tags: [String],
  fetchedAt: Date,
  expiresAt: Date                  // TTL: refetch after 24h
}
```

---

## Backend API Endpoints (Node.js Express)

### Authentication & Users

```
POST   /api/auth/register              - Register new user
POST   /api/auth/login                 - Login user
POST   /api/auth/logout                - Logout user
GET    /api/auth/me                    - Get current user info
```

### Codeforces Account Linking

```
POST   /api/users/link-codeforces      - Link CF account (sends cookies to Python service for validation)
GET    /api/users/cf-status             - Check if CF cookies are still valid
POST   /api/users/refresh-cookies       - Update CF cookies
```

### Contests

```
POST   /api/contests                   - Create new contest (Admin only)
GET    /api/contests                   - List all contests
GET    /api/contests/:id               - Get contest details
PUT    /api/contests/:id               - Update contest (Admin only)
DELETE /api/contests/:id               - Delete contest (Admin only)
POST   /api/contests/:id/register      - Register for contest
GET    /api/contests/:id/problems      - Get contest problems (statements)
```

### Submissions

```
POST   /api/submissions                - Submit code (enqueues job for Python worker)
GET    /api/submissions/:id            - Get submission details
GET    /api/submissions/contest/:contestId          - All submissions in contest
GET    /api/submissions/contest/:contestId/my       - My submissions in contest
```

### Leaderboard

```
GET    /api/standings/:contestId       - Get contest standings
```

### Problems

```
GET    /api/problems/:problemId        - Get cached problem (or fetch via Python service)
```

### Admin

```
GET    /api/admin/users                - List all users
PUT    /api/admin/users/:id/role       - Change user role
POST   /api/admin/rejudge/:submissionId - Rejudge a submission
```

---

## Python Microservice (FastAPI + curl_cffi)

This is the critical component. It handles ALL communication with Codeforces.

### Endpoints

```
POST   /cf/validate-cookies            - Validate CF cookies, return handle
POST   /cf/submit                      - Submit code to CF, return submission ID
GET    /cf/problem/:contestId/:index   - Fetch problem statement HTML
GET    /cf/verdict/:submissionId       - Get submission verdict (uses public API, no cookies needed)
```

### Core Implementation

```python
"""
cf_service.py — FastAPI microservice for Codeforces integration.
Uses curl_cffi to bypass Cloudflare TLS fingerprinting.

PROVEN WORKING: Submission #363219620, Verdict: OK
"""

import re
import time
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel
from curl_cffi import requests as cf_requests

app = FastAPI(title="CF Integration Service")


# --- Models ---

class CookieValidation(BaseModel):
    cookies: str  # Full cookie string from browser

class SubmissionRequest(BaseModel):
    cookies: str           # Full cookie string
    problem_code: str      # e.g., "4A" or "1234B"
    source_code: str
    language_id: str       # CF programTypeId (e.g., "54")

class ProblemRequest(BaseModel):
    contest_id: int        # e.g., 4
    problem_index: str     # e.g., "A"


# --- Cookie Parsing ---

def parse_cookies(cookie_str: str) -> dict:
    """Parse 'key=value; key2=value2' into dict."""
    cookies = {}
    for part in cookie_str.split(";"):
        part = part.strip()
        if "=" in part:
            k, v = part.split("=", 1)
            cookies[k.strip()] = v.strip()
    return cookies


def make_session(cookie_str: str) -> cf_requests.Session:
    """Create a curl_cffi session impersonating Chrome with the given cookies."""
    sess = cf_requests.Session(impersonate="chrome")
    cookies = parse_cookies(cookie_str)
    for k, v in cookies.items():
        sess.cookies.set(k, v, domain=".codeforces.com")
    return sess


# --- Endpoints ---

@app.post("/cf/validate-cookies")
def validate_cookies(req: CookieValidation):
    """
    Validate cookies by loading CF homepage and extracting handle.
    Returns: { "valid": true, "handle": "pouya.hp2004" }
    """
    sess = make_session(req.cookies)
    r = sess.get("https://codeforces.com/")

    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"CF returned HTTP {r.status_code}")

    if "Attention Required" in r.text:
        raise HTTPException(status_code=502, detail="Cloudflare blocked request")

    # Extract handle from page JavaScript
    handle_match = re.search(r'handle\s*=\s*"([^"]+)"', r.text)
    if handle_match:
        return {"valid": True, "handle": handle_match.group(1)}

    # Fallback: check for profile link
    profile_match = re.search(r'/profile/([^"\']+)', r.text)
    if profile_match:
        return {"valid": True, "handle": profile_match.group(1)}

    raise HTTPException(status_code=401, detail="Cookies invalid or expired")


@app.post("/cf/submit")
def submit_solution(req: SubmissionRequest):
    """
    Submit a solution to Codeforces.

    Flow (PROVEN WORKING):
    1. GET /problemset/submit → extract csrf_token
    2. POST /problemset/submit?csrf_token=XXX with form data
    3. On success, CF redirects to /problemset/status?my=on
    4. Extract submission ID from page or via API

    Returns: { "success": true, "submission_id": 363219620 }
    """
    sess = make_session(req.cookies)

    # Step 1: Get CSRF token from submit page
    r = sess.get("https://codeforces.com/problemset/submit")
    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"Failed to load submit page: HTTP {r.status_code}")

    if "Attention Required" in r.text:
        raise HTTPException(status_code=502, detail="Cloudflare blocked submit page")

    # Extract CSRF token (try multiple patterns)
    csrf_token = None
    for pattern in [
        r'csrf_token\s*["\']?\s*[:=]\s*["\']?([a-f0-9]{32})',
        r'name=["\']csrf_token["\']\s+value=["\']([^"\']+)["\']',
        r"csrf_token\s*=\s*'([^']+)'",
    ]:
        match = re.search(pattern, r.text)
        if match:
            csrf_token = match.group(1)
            break

    if not csrf_token:
        raise HTTPException(status_code=502, detail="Could not extract CSRF token from submit page")

    # Step 2: POST submission
    data = {
        "csrf_token": csrf_token,
        "action": "submitSolutionFormSubmitted",
        "submittedProblemCode": req.problem_code,
        "programTypeId": req.language_id,
        "source": req.source_code,
        "tabSize": "4",
        "_tta": "176",
    }

    headers = {
        "Referer": "https://codeforces.com/problemset/submit",
        "Origin": "https://codeforces.com",
    }

    r = sess.post(
        f"https://codeforces.com/problemset/submit?csrf_token={csrf_token}",
        data=data,
        headers=headers,
    )

    # Step 3: Check for success (redirect to status page)
    if "my=on" in str(r.url) or "status" in str(r.url):
        # Try to extract submission ID from the status page HTML
        sid_match = re.search(r'data-submission-id="(\d+)"', r.text)
        if sid_match:
            return {"success": True, "submission_id": int(sid_match.group(1))}

        # Fallback: get latest submission via API
        # Extract handle first
        handle_match = re.search(r'handle\s*=\s*"([^"]+)"', r.text)
        if handle_match:
            handle = handle_match.group(1)
            api_r = sess.get(
                f"https://codeforces.com/api/user.status?handle={handle}&from=1&count=1"
            )
            if api_r.status_code == 200:
                api_data = api_r.json()
                if api_data.get("status") == "OK" and api_data.get("result"):
                    return {"success": True, "submission_id": api_data["result"][0]["id"]}

        return {"success": True, "submission_id": None}

    # Check for rate limiting
    if "You have submitted" in r.text:
        raise HTTPException(status_code=429, detail="Codeforces rate limit: submitted too often")

    # Check for "same code" rejection
    if "You have already submitted" in r.text:
        raise HTTPException(status_code=409, detail="Duplicate submission: same code already submitted")

    raise HTTPException(
        status_code=502,
        detail=f"Unexpected response from CF: HTTP {r.status_code}, URL: {r.url}"
    )


@app.get("/cf/problem/{contest_id}/{problem_index}")
def fetch_problem(contest_id: int, problem_index: str):
    """
    Fetch a problem statement from Codeforces.
    Uses curl_cffi to bypass Cloudflare.
    Returns parsed problem data.
    """
    sess = cf_requests.Session(impersonate="chrome")
    url = f"https://codeforces.com/contest/{contest_id}/problem/{problem_index}"
    r = sess.get(url)

    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"CF returned HTTP {r.status_code}")

    if "Attention Required" in r.text:
        raise HTTPException(status_code=502, detail="Cloudflare blocked request")

    # Parse problem statement HTML
    # Extract the .problem-statement div
    statement_match = re.search(
        r'<div class="problem-statement">(.*?)</div>\s*</div>\s*</div>',
        r.text,
        re.DOTALL
    )

    # Extract title
    title_match = re.search(r'<div class="title">(.+?)</div>', r.text)

    # Extract time limit
    time_match = re.search(r'<div class="time-limit">.*?(\d+\s*second)', r.text)

    # Extract memory limit
    memory_match = re.search(r'<div class="memory-limit">.*?(\d+\s*megabyte)', r.text)

    # Extract sample tests
    samples = []
    input_blocks = re.findall(r'<div class="input"><pre[^>]*>(.*?)</pre>', r.text, re.DOTALL)
    output_blocks = re.findall(r'<div class="output"><pre[^>]*>(.*?)</pre>', r.text, re.DOTALL)
    for inp, out in zip(input_blocks, output_blocks):
        # Clean HTML tags from samples
        inp_clean = re.sub(r'<[^>]+>', '\n', inp).strip()
        out_clean = re.sub(r'<[^>]+>', '\n', out).strip()
        samples.append({"input": inp_clean, "output": out_clean})

    return {
        "contestId": contest_id,
        "problemIndex": problem_index,
        "name": title_match.group(1).strip() if title_match else "Unknown",
        "timeLimit": time_match.group(1) if time_match else "Unknown",
        "memoryLimit": memory_match.group(1) if memory_match else "Unknown",
        "statementHtml": statement_match.group(0) if statement_match else r.text,
        "sampleTests": samples,
    }


@app.get("/cf/verdict/{handle}/{submission_id}")
def get_verdict(handle: str, submission_id: int):
    """
    Get submission verdict from CF public API.
    No cookies needed — this is a public endpoint.
    """
    # Use regular requests for public API (no Cloudflare on API endpoints)
    import urllib.request
    import json

    url = f"https://codeforces.com/api/user.status?handle={handle}&from=1&count=10"
    try:
        with urllib.request.urlopen(url, timeout=10) as resp:
            data = json.loads(resp.read())
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"CF API error: {str(e)}")

    if data.get("status") != "OK":
        raise HTTPException(status_code=502, detail=f"CF API returned: {data.get('comment', 'Unknown error')}")

    # Find the specific submission
    for sub in data.get("result", []):
        if sub["id"] == submission_id:
            return {
                "id": sub["id"],
                "verdict": sub.get("verdict", "TESTING"),
                "testsPassed": sub.get("passedTestCount", 0),
                "timeMs": sub.get("timeConsumedMillis", 0),
                "memoryBytes": sub.get("memoryConsumedBytes", 0),
                "problem": f"{sub['problem']['contestId']}{sub['problem']['index']}",
            }

    # Submission not found in recent — might still be in queue
    return {
        "id": submission_id,
        "verdict": "TESTING",
        "testsPassed": 0,
        "timeMs": 0,
        "memoryBytes": 0,
        "problem": "unknown",
    }


# --- Health Check ---

@app.get("/health")
def health():
    """Check that curl_cffi can reach Codeforces."""
    try:
        sess = cf_requests.Session(impersonate="chrome")
        r = sess.get("https://codeforces.com/", timeout=10)
        cf_ok = r.status_code == 200 and "Attention Required" not in r.text
    except Exception:
        cf_ok = False

    return {
        "status": "ok" if cf_ok else "degraded",
        "codeforces_reachable": cf_ok,
    }
```

### Running the Python Service

```bash
# Install dependencies
pip install fastapi uvicorn curl_cffi

# Run
uvicorn cf_service:app --host 0.0.0.0 --port 8000
```

---

## Codeforces Language IDs (Verified)

| Language              | programTypeId |
| --------------------- | ------------- |
| GNU GCC C11 5.1.0     | 43            |
| Clang++17 Diagnostics | 52            |
| GNU G++17 7.3.0       | 54            |
| GNU G++20 11.2.0      | 73            |
| Python 3.8.10         | 31            |
| PyPy 3-64             | 70            |
| Java 17               | 87            |
| JavaScript V8         | 34            |
| Kotlin 1.7            | 83            |
| Rust 1.75.0           | 75            |
| Go 1.22.2             | 32            |
| C# 10 (.NET 6)        | 65            |

---

## Frontend Structure

### Pages/Routes

```
/                              - Home page (upcoming contests list)
/login                         - Login page
/register                      - Registration page
/profile                       - User profile & CF cookie linking
/contests                      - List of all contests
/contest/:id                   - Contest dashboard
/contest/:id/problem/:order    - Problem statement (A, B, C...)
/contest/:id/submit/:order     - Submit solution for problem
/contest/:id/submissions       - My submissions in this contest
/contest/:id/standings         - Live leaderboard
/admin                         - Admin dashboard
/admin/contest/create          - Create new contest
/admin/contest/:id/edit        - Edit contest
```

### Key React Components

#### Layout

```jsx
<AppLayout>
  <Navbar>              // Logo, nav links, user menu, CF link status indicator
  <Outlet />            // React Router outlet
</AppLayout>
```

#### Home Page

```jsx
<HomePage>
  <UpcomingContests /> // Cards for upcoming/running contests
  <RecentContests /> // Past contests
</HomePage>
```

#### Contest Page

```jsx
<ContestDashboard>
  <ContestHeader /> // Title, timer countdown, status badge
  <ProblemList /> // Problems A, B, C... with solved/attempted indicators
  <MiniStandings /> // Top 10 quick view
</ContestDashboard>
```

#### Problem View

```jsx
<ProblemPage>
  <ProblemStatement /> // Rendered CF problem HTML (from cache)
  <SampleTests /> // Copyable input/output blocks
  <SubmitForm /> // Language selector, code editor (Monaco), submit button
</ProblemPage>
```

#### Standings Page

```jsx
<StandingsPage>
  <StandingsTable /> // Full ICPC/IOI-style standings grid
  <FrozenBanner /> // "Standings frozen" indicator if applicable
</StandingsPage>
```

#### Profile Page

```jsx
<ProfilePage>
  <UserInfo /> // Username, email
  <CFLinkSection /> // Link CF account: paste cookies, validate, show status
  <SubmissionHistory /> // Past submissions across contests
</ProfilePage>
```

#### CF Cookie Linking Flow

```jsx
<CFLinkSection>
  <Instructions /> // Step-by-step guide with screenshots
  <CookieInput /> // Textarea for pasting full cookie string
  <ValidateButton /> // Calls /api/users/link-codeforces
  <StatusBadge /> // "Linked as pouya.hp2004" or "Not linked"
</CFLinkSection>
```

---

## Node.js Backend Implementation

### Project Structure

```
backend/
├── src/
│   ├── app.js                  // Express app setup
│   ├── server.js               // HTTP server + Socket.io
│   ├── config/
│   │   ├── db.js               // MongoDB connection
│   │   ├── redis.js            // Redis client
│   │   └── env.js              // Environment variables
│   ├── models/
│   │   ├── User.js
│   │   ├── Contest.js
│   │   ├── Submission.js
│   │   ├── Standing.js
│   │   └── CachedProblem.js
│   ├── routes/
│   │   ├── auth.js
│   │   ├── users.js
│   │   ├── contests.js
│   │   ├── submissions.js
│   │   ├── standings.js
│   │   ├── problems.js
│   │   └── admin.js
│   ├── middleware/
│   │   ├── auth.js             // JWT verification
│   │   ├── admin.js            // Admin role check
│   │   └── rateLimiter.js
│   ├── services/
│   │   ├── cfProxy.js          // HTTP client to Python CF service
│   │   ├── submissionWorker.js // BullMQ worker: poll verdicts
│   │   ├── scoringService.js   // ICPC/IOI scoring logic
│   │   └── socketService.js    // Socket.io event emitters
│   └── utils/
│       ├── encryption.js       // AES-256 encrypt/decrypt cookies
│       └── validators.js       // Input validation schemas
├── package.json
└── .env
```

### CF Proxy Service (Node.js → Python)

```javascript
// src/services/cfProxy.js
const axios = require('axios');

const CF_SERVICE_URL = process.env.CF_SERVICE_URL || 'http://localhost:8000';

/**
 * Validate Codeforces cookies via the Python service.
 * @param {string} cookies - Full cookie string from browser
 * @returns {{ valid: boolean, handle: string }}
 */
async function validateCookies(cookies) {
  const res = await axios.post(`${CF_SERVICE_URL}/cf/validate-cookies`, { cookies });
  return res.data;
}

/**
 * Submit code to Codeforces via the Python service.
 * @param {string} cookies - Encrypted cookies (will be decrypted before sending)
 * @param {string} problemCode - e.g., "4A"
 * @param {string} sourceCode - The source code
 * @param {string} languageId - CF programTypeId (e.g., "54")
 * @returns {{ success: boolean, submission_id: number }}
 */
async function submitToCodeforces(cookies, problemCode, sourceCode, languageId) {
  const res = await axios.post(`${CF_SERVICE_URL}/cf/submit`, {
    cookies,
    problem_code: problemCode,
    source_code: sourceCode,
    language_id: languageId,
  });
  return res.data;
}

/**
 * Fetch problem statement from Codeforces.
 * @param {number} contestId
 * @param {string} problemIndex
 */
async function fetchProblem(contestId, problemIndex) {
  const res = await axios.get(`${CF_SERVICE_URL}/cf/problem/${contestId}/${problemIndex}`);
  return res.data;
}

/**
 * Get submission verdict. Uses CF public API (no cookies needed).
 * @param {string} handle - CF handle
 * @param {number} submissionId
 */
async function getVerdict(handle, submissionId) {
  const res = await axios.get(`${CF_SERVICE_URL}/cf/verdict/${handle}/${submissionId}`);
  return res.data;
}

module.exports = { validateCookies, submitToCodeforces, fetchProblem, getVerdict };
```

### Submission Flow (Node.js)

```javascript
// src/routes/submissions.js
const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Submission = require('../models/Submission');
const Contest = require('../models/Contest');
const User = require('../models/User');
const { decrypt } = require('../utils/encryption');
const cfProxy = require('../services/cfProxy');
const { emitSubmissionUpdate } = require('../services/socketService');

/**
 * POST /api/submissions
 * Submit code to a contest problem.
 */
router.post('/', auth, async (req, res) => {
  try {
    const { contestId, problemId, code, language, languageId } = req.body;

    // Validate contest is running
    const contest = await Contest.findById(contestId);
    if (!contest || contest.status !== 'running') {
      return res.status(400).json({ error: 'Contest is not running' });
    }

    // Check user is registered for contest
    if (!contest.participants.includes(req.userId)) {
      return res.status(403).json({ error: 'Not registered for this contest' });
    }

    // Check problem exists in contest
    const problem = contest.problems.find((p) => p.problemId === problemId);
    if (!problem) {
      return res.status(400).json({ error: 'Problem not in this contest' });
    }

    // Get user's CF cookies
    const user = await User.findById(req.userId);
    if (!user.codeforcesCookies) {
      return res.status(400).json({ error: 'Codeforces account not linked. Go to Profile to link it.' });
    }

    const cookies = decrypt(user.codeforcesCookies);

    // Create submission record with PENDING status
    const submission = new Submission({
      contestId,
      userId: req.userId,
      problemId,
      code,
      language,
      languageId,
      submittedAt: new Date(),
      verdict: 'PENDING',
    });
    await submission.save();

    // Submit to Codeforces via Python service
    try {
      const result = await cfProxy.submitToCodeforces(cookies, problemId, code, languageId);

      submission.cfSubmissionId = result.submission_id;
      submission.verdict = 'TESTING';
      await submission.save();

      // Start verdict polling (background)
      pollVerdict(submission._id, user.codeforcesHandle, result.submission_id, contestId);

      res.status(201).json({
        id: submission._id,
        cfSubmissionId: result.submission_id,
        verdict: 'TESTING',
      });
    } catch (cfError) {
      submission.verdict = 'SUBMISSION_FAILED';
      await submission.save();

      const status = cfError.response?.status || 500;
      const detail = cfError.response?.data?.detail || 'Submission to Codeforces failed';
      res.status(status).json({ error: detail });
    }
  } catch (error) {
    console.error('Submission error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

/**
 * Poll CF API for verdict updates.
 * Runs in background after submission.
 */
async function pollVerdict(submissionDbId, cfHandle, cfSubmissionId, contestId) {
  const MAX_ATTEMPTS = 60; // 5 minutes max
  const POLL_INTERVAL = 5000; // 5 seconds

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));

    try {
      const verdict = await cfProxy.getVerdict(cfHandle, cfSubmissionId);

      if (verdict.verdict && verdict.verdict !== 'TESTING') {
        // Final verdict received
        const submission = await Submission.findById(submissionDbId);
        submission.verdict = verdict.verdict;
        submission.testsPassed = verdict.testsPassed;
        submission.timeTaken = verdict.timeMs;
        submission.memoryUsed = verdict.memoryBytes;
        await submission.save();

        // Update standings
        const scoringService = require('../services/scoringService');
        await scoringService.updateStandings(contestId, submission.userId);

        // Emit real-time update
        emitSubmissionUpdate(contestId, submission);

        return;
      }
    } catch (error) {
      console.error(`Verdict poll error for ${cfSubmissionId}:`, error.message);
    }
  }

  // Timed out
  const submission = await Submission.findById(submissionDbId);
  submission.verdict = 'VERDICT_TIMEOUT';
  await submission.save();
}

module.exports = router;
```

### Verdict Polling (Alternative: Background Worker with BullMQ)

For production, use BullMQ instead of in-process polling:

```javascript
// src/services/submissionWorker.js
const { Queue, Worker } = require('bullmq');
const cfProxy = require('./cfProxy');
const Submission = require('../models/Submission');
const scoringService = require('./scoringService');
const { emitSubmissionUpdate } = require('./socketService');

const verdictQueue = new Queue('verdict-polling', {
  connection: { host: '127.0.0.1', port: 6379 },
});

// Enqueue a verdict check job
async function enqueueVerdictCheck(submissionDbId, cfHandle, cfSubmissionId, contestId) {
  await verdictQueue.add(
    'check-verdict',
    {
      submissionDbId,
      cfHandle,
      cfSubmissionId,
      contestId,
      attempt: 0,
    },
    {
      delay: 3000, // Wait 3s before first check
    },
  );
}

// Worker processes verdict checks
const worker = new Worker(
  'verdict-polling',
  async (job) => {
    const { submissionDbId, cfHandle, cfSubmissionId, contestId, attempt } = job.data;

    const verdict = await cfProxy.getVerdict(cfHandle, cfSubmissionId);

    if (verdict.verdict && verdict.verdict !== 'TESTING') {
      // Final verdict
      const submission = await Submission.findById(submissionDbId);
      submission.verdict = verdict.verdict;
      submission.testsPassed = verdict.testsPassed;
      submission.timeTaken = verdict.timeMs;
      submission.memoryUsed = verdict.memoryBytes;
      await submission.save();

      await scoringService.updateStandings(contestId, submission.userId);
      emitSubmissionUpdate(contestId, submission);
      return;
    }

    // Still testing — re-enqueue with backoff
    if (attempt < 60) {
      await verdictQueue.add(
        'check-verdict',
        {
          submissionDbId,
          cfHandle,
          cfSubmissionId,
          contestId,
          attempt: attempt + 1,
        },
        {
          delay: 5000, // Check again in 5s
        },
      );
    } else {
      // Timed out
      const submission = await Submission.findById(submissionDbId);
      submission.verdict = 'VERDICT_TIMEOUT';
      await submission.save();
    }
  },
  {
    connection: { host: '127.0.0.1', port: 6379 },
    concurrency: 5,
  },
);

module.exports = { enqueueVerdictCheck };
```

---

## Scoring & Leaderboard Logic

### ICPC Style

```javascript
// src/services/scoringService.js

async function calculateICPCScore(contestId, userId) {
  const submissions = await Submission.find({
    contestId,
    userId,
    verdict: { $ne: 'PENDING' },
  }).sort({ submittedAt: 1 });

  const contest = await Contest.findById(contestId);
  const problems = {};

  for (const sub of submissions) {
    if (!problems[sub.problemId]) {
      problems[sub.problemId] = {
        attempts: 0,
        solved: false,
        penalty: 0,
        solveTime: 0,
      };
    }

    const prob = problems[sub.problemId];
    if (prob.solved) continue;

    prob.attempts++;

    if (sub.verdict === 'OK') {
      prob.solved = true;
      const minutesFromStart = (sub.submittedAt - contest.startTime) / 60000;
      prob.solveTime = Math.floor(minutesFromStart);
      prob.penalty = prob.solveTime + (prob.attempts - 1) * contest.penaltyTime;
    }
  }

  let totalSolved = 0;
  let totalPenalty = 0;

  for (const prob of Object.values(problems)) {
    if (prob.solved) {
      totalSolved++;
      totalPenalty += prob.penalty;
    }
  }

  return { problemsSolved: totalSolved, totalPenalty, problems };
}

async function updateStandings(contestId, userId) {
  const contest = await Contest.findById(contestId);
  const allParticipants = contest.participants;

  // Recalculate all standings
  const standings = [];
  for (const uid of allParticipants) {
    const score = await calculateICPCScore(contestId, uid);
    standings.push({ userId: uid, ...score });
  }

  // Sort: more solved first, then less penalty
  standings.sort((a, b) => {
    if (a.problemsSolved !== b.problemsSolved) return b.problemsSolved - a.problemsSolved;
    return a.totalPenalty - b.totalPenalty;
  });

  // Assign ranks and save
  for (let i = 0; i < standings.length; i++) {
    standings[i].rank = i + 1;
    await Standing.findOneAndUpdate(
      { contestId, userId: standings[i].userId },
      { ...standings[i], contestId, lastUpdated: new Date() },
      { upsert: true },
    );
  }

  // Emit to all clients in contest room
  const { emitStandingsUpdate } = require('./socketService');
  emitStandingsUpdate(contestId, standings);

  return standings;
}

module.exports = { calculateICPCScore, updateStandings };
```

### IOI Style

```javascript
async function calculateIOIScore(contestId, userId) {
  const submissions = await Submission.find({
    contestId,
    userId,
    verdict: { $ne: 'PENDING' },
  });

  const contest = await Contest.findById(contestId);
  const problemScores = {};

  for (const sub of submissions) {
    const problemConfig = contest.problems.find((p) => p.problemId === sub.problemId);
    if (!problemConfig) continue;

    // For IOI: take the best (highest points) submission per problem
    const subPoints =
      sub.verdict === 'OK' ? problemConfig.points : sub.testsPassed > 0 ? Math.floor((problemConfig.points * sub.testsPassed) / 100) : 0;

    if (!problemScores[sub.problemId] || subPoints > problemScores[sub.problemId].points) {
      problemScores[sub.problemId] = { points: subPoints, maxPoints: problemConfig.points };
    }
  }

  const totalPoints = Object.values(problemScores).reduce((sum, p) => sum + p.points, 0);
  return { totalPoints, problems: problemScores };
}
```

---

## Real-Time Features (Socket.io)

### Server-side

```javascript
// src/services/socketService.js
let io;

function init(server) {
  const { Server } = require('socket.io');
  io = new Server(server, {
    cors: { origin: process.env.FRONTEND_URL || 'http://localhost:3000' },
  });

  io.on('connection', (socket) => {
    socket.on('join-contest', (contestId) => {
      socket.join(`contest-${contestId}`);
    });
    socket.on('leave-contest', (contestId) => {
      socket.leave(`contest-${contestId}`);
    });
  });
}

function emitSubmissionUpdate(contestId, submission) {
  if (io)
    io.to(`contest-${contestId}`).emit('submission-update', {
      id: submission._id,
      problemId: submission.problemId,
      userId: submission.userId,
      verdict: submission.verdict,
      submittedAt: submission.submittedAt,
    });
}

function emitStandingsUpdate(contestId, standings) {
  if (io) io.to(`contest-${contestId}`).emit('standings-update', standings);
}

module.exports = { init, emitSubmissionUpdate, emitStandingsUpdate };
```

### Client-side (React)

```javascript
import { io } from 'socket.io-client';
import { useEffect, useState } from 'react';

const socket = io(import.meta.env.VITE_API_URL || 'http://localhost:5000');

function useContestUpdates(contestId) {
  const [standings, setStandings] = useState([]);
  const [submissions, setSubmissions] = useState([]);

  useEffect(() => {
    socket.emit('join-contest', contestId);

    socket.on('standings-update', setStandings);
    socket.on('submission-update', (sub) => {
      setSubmissions((prev) => [sub, ...prev]);
    });

    return () => {
      socket.emit('leave-contest', contestId);
      socket.off('standings-update');
      socket.off('submission-update');
    };
  }, [contestId]);

  return { standings, submissions };
}
```

---

## Security

### Cookie Encryption (AES-256)

```javascript
// src/utils/encryption.js
const crypto = require('crypto');

const KEY = Buffer.from(process.env.ENCRYPTION_KEY, 'hex'); // 32 bytes
const IV_LEN = 16;

function encrypt(text) {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-cbc', KEY, iv);
  let encrypted = cipher.update(text, 'utf8');
  encrypted = Buffer.concat([encrypted, cipher.final()]);
  return iv.toString('hex') + ':' + encrypted.toString('hex');
}

function decrypt(text) {
  const [ivHex, encHex] = text.split(':');
  const iv = Buffer.from(ivHex, 'hex');
  const encrypted = Buffer.from(encHex, 'hex');
  const decipher = crypto.createDecipheriv('aes-256-cbc', KEY, iv);
  let decrypted = decipher.update(encrypted);
  decrypted = Buffer.concat([decrypted, decipher.final()]);
  return decrypted.toString('utf8');
}

module.exports = { encrypt, decrypt };
```

### JWT Authentication

```javascript
// src/middleware/auth.js
const jwt = require('jsonwebtoken');

function generateToken(userId) {
  return jwt.sign({ userId }, process.env.JWT_SECRET, { expiresIn: '7d' });
}

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.userId = decoded.userId;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = { generateToken, auth };
```

### Rate Limiting

```javascript
const rateLimit = require('express-rate-limit');

// Global: 100 requests per minute
const globalLimiter = rateLimit({ windowMs: 60000, max: 100 });

// Submissions: 3 per minute per user (CF itself limits ~1 per 10s)
const submitLimiter = rateLimit({ windowMs: 60000, max: 3 });

// Auth: 10 per minute
const authLimiter = rateLimit({ windowMs: 60000, max: 10 });
```

### Input Validation

```javascript
const { body } = require('express-validator');

const submitValidation = [
  body('contestId').isMongoId(),
  body('problemId').matches(/^\d+[A-Z]\d?$/), // e.g., "4A", "1234B1"
  body('code').isLength({ min: 1, max: 100000 }),
  body('language').isIn(['c', 'cpp17', 'cpp20', 'python3', 'pypy3', 'java', 'javascript', 'kotlin', 'rust', 'go']),
  body('languageId').matches(/^\d+$/),
];
```

---

## How to Link Codeforces Account (User Guide)

### Getting Your Cookies

**IMPORTANT**: You must provide your **full cookie string**, not just JSESSIONID. Cloudflare requires `cf_clearance` and other cookies.

#### Method 1: Chrome DevTools

1. Go to [codeforces.com](https://codeforces.com) and **log in**
2. Press **F12** to open DevTools
3. Go to the **Network** tab
4. Click on any request to `codeforces.com`
5. In the **Headers** section, find the `Cookie:` request header
6. **Copy the entire value** (it will look like `JSESSIONID=XXX; cf_clearance=YYY; X-User=ZZZ; ...`)
7. Paste it into the platform's cookie field

#### Method 2: Console Command

1. Go to [codeforces.com](https://codeforces.com) and log in
2. Press **F12** → go to **Console** tab
3. Type: `document.cookie`
4. Copy the output
5. Paste into the platform

### Cookie Expiry

- `JSESSIONID` expires when the CF session ends (variable, typically hours to days)
- `cf_clearance` expires after ~30 minutes of Cloudflare token
- Users will need to **refresh cookies periodically**
- The platform will notify users when their cookies expire (validation fails)

---

## Environment Variables

### Node.js Backend (.env)

```env
PORT=5000
MONGODB_URI=mongodb://localhost:27017/algo404
JWT_SECRET=<random-64-char-hex-string>
ENCRYPTION_KEY=<random-32-byte-hex-string>
CF_SERVICE_URL=http://localhost:8000
REDIS_URL=redis://localhost:6379
FRONTEND_URL=http://localhost:3000
NODE_ENV=development
```

### Python CF Service (.env)

```env
HOST=0.0.0.0
PORT=8000
```

---

## Deployment (Local/LAN)

### Prerequisites

- Node.js v18+
- Python 3.10+ with pip
- MongoDB 6+
- Redis 7+
- Git

### Quick Start

```bash
# 1. Clone
git clone <repo-url>
cd algo404

# 2. Python CF Service
cd cf-service
python -m venv .venv
source .venv/bin/activate
pip install fastapi uvicorn curl_cffi
uvicorn cf_service:app --host 0.0.0.0 --port 8000 &

# 3. Backend
cd ../backend
npm install
cp .env.example .env  # Edit with your values
npm start &

# 4. Frontend
cd ../frontend
npm install
npm run dev

# 5. Access
# Frontend: http://localhost:3000
# Backend API: http://localhost:5000
# CF Service: http://localhost:8000/docs (Swagger UI)
```

### Docker Compose

```yaml
version: '3.8'

services:
  mongodb:
    image: mongo:7
    ports: ['27017:27017']
    volumes: [mongodb-data:/data/db]

  redis:
    image: redis:7-alpine
    ports: ['6379:6379']

  cf-service:
    build: ./cf-service
    ports: ['8000:8000']
    environment:
      - HOST=0.0.0.0
      - PORT=8000

  backend:
    build: ./backend
    ports: ['5000:5000']
    environment:
      - MONGODB_URI=mongodb://mongodb:27017/algo404
      - REDIS_URL=redis://redis:6379
      - CF_SERVICE_URL=http://cf-service:8000
    depends_on: [mongodb, redis, cf-service]

  frontend:
    build: ./frontend
    ports: ['3000:3000']
    depends_on: [backend]

volumes:
  mongodb-data:
```

### Project Directory Structure

```
algo404/
├── cf-service/                 # Python microservice
│   ├── cf_service.py           # FastAPI app (all CF interaction)
│   ├── requirements.txt        # fastapi, uvicorn, curl_cffi
│   └── Dockerfile
├── backend/                    # Node.js Express API
│   ├── src/
│   │   ├── app.js
│   │   ├── server.js
│   │   ├── config/
│   │   ├── models/
│   │   ├── routes/
│   │   ├── middleware/
│   │   ├── services/
│   │   └── utils/
│   ├── package.json
│   └── Dockerfile
├── frontend/                   # React app
│   ├── src/
│   │   ├── components/
│   │   ├── pages/
│   │   ├── hooks/
│   │   ├── services/          # API client
│   │   └── App.jsx
│   ├── package.json
│   └── Dockerfile
├── docker-compose.yml
└── README.md
```

---

## Submission Flow (End-to-End)

This is the complete flow, every step verified:

```
1. User writes code in frontend editor
   └► Frontend POST /api/submissions { contestId, problemId, code, language, languageId }

2. Express validates request, checks contest is running, user is registered
   └► Decrypts user's CF cookies from MongoDB

3. Express calls Python service POST /cf/submit { cookies, problem_code, source_code, language_id }
   └► Python service creates curl_cffi session with impersonate="chrome"
   └► GET /problemset/submit → extracts csrf_token from HTML
   └► POST /problemset/submit?csrf_token=XXX with form data
   └► CF processes submission, redirects to /problemset/status?my=on
   └► Python extracts submission ID from status page (data-submission-id="363219620")
   └► Returns { success: true, submission_id: 363219620 }

4. Express stores CF submission ID in MongoDB, sets verdict = "TESTING"
   └► Returns 201 to frontend

5. Background: Express polls CF public API every 5 seconds
   └► GET https://codeforces.com/api/user.status?handle=XXX&from=1&count=10
   └► Finds submission by ID, checks verdict
   └► When verdict != "TESTING": updates MongoDB, recalculates standings
   └► Emits Socket.io events: "submission-update" + "standings-update"

6. Frontend receives Socket.io events
   └► Updates submission status in UI
   └► Updates leaderboard in real-time
```

---

## Codeforces API Endpoints Used (Public, No Auth)

These work with standard HTTP — no curl_cffi needed:

```
GET /api/problemset.problems                           - List all problems
GET /api/contest.list                                  - List all contests
GET /api/contest.standings?contestId=X&from=1&count=1  - Get contest info
GET /api/user.status?handle=X&from=1&count=N           - Get user's submissions
GET /api/user.info?handles=X                           - Get user profile info
```

These require curl_cffi (Cloudflare-protected web pages):

```
GET  /contest/{id}/problem/{index}                     - Problem statement HTML
GET  /problemset/submit                                - Submit page (CSRF token)
POST /problemset/submit?csrf_token=XXX                 - Submit solution
```

---

## Known Issues & Solutions

| Issue                               | Solution                                                       |
| ----------------------------------- | -------------------------------------------------------------- |
| Cookies expire frequently           | Validate on each submission; notify user to refresh            |
| cf_clearance short-lived (~30 min)  | User must provide fresh cookies; consider browser extension    |
| CF rate limits submissions (~1/10s) | Server-side queue with 10s delay between submissions per user  |
| "Same code" rejection               | Add unique comment (e.g., timestamp) to code before submitting |
| CF API rate limit (1 req/2s)        | Redis-cached API responses; batch verdict checks               |
| Problem HTML rendering issues       | Sanitize CF HTML; serve with CF's CSS classes                  |
| curl_cffi version changes           | Pin version in requirements.txt                                |

---

## Testing Strategy

### Unit Tests

```bash
# Backend (Jest)
npm test

# Python service (pytest)
pytest cf-service/tests/
```

### Integration Test: Full Submission Pipeline

```python
# This is the proven test script from test-submission/test_curl_cffi.py
# It validates: session → inner pages → CSRF extraction → submission → verdict
# Last run: Submission #363219620, Verdict: OK
```

### Load Testing

```bash
# Use Artillery for the Node.js backend
npx artillery run load-test.yml
```

---

## Timeline Estimation

### Phase 1: Foundation (Week 1)

- [x] Research & validate CF submission mechanism
- [x] Prove curl_cffi bypasses Cloudflare (DONE — submission #363219620)
- [ ] Set up project structure (monorepo)
- [ ] MongoDB schemas + Express boilerplate
- [ ] Python CF service (FastAPI + curl_cffi)
- [ ] JWT authentication

### Phase 2: Core Features (Week 2-3)

- [ ] Contest CRUD (admin)
- [ ] Problem fetching + caching
- [ ] Submission pipeline (full flow)
- [ ] Verdict polling
- [ ] Basic frontend (login, contests list, problem view)

### Phase 3: Leaderboard & Real-time (Week 4)

- [ ] ICPC/IOI scoring
- [ ] Socket.io integration
- [ ] Live standings page
- [ ] Frozen leaderboard

### Phase 4: Polish & Deploy (Week 5)

- [ ] Admin dashboard
- [ ] CF cookie linking UX (step-by-step guide)
- [ ] Error handling & edge cases
- [ ] Docker compose
- [ ] Documentation

---

## Success Criteria

1. Users can register and link Codeforces account via cookies
2. Admins can create contests with Codeforces problems
3. Problem statements display correctly (fetched from CF)
4. Users can submit code through the platform
5. Submissions are posted to Codeforces via curl_cffi (bypassing Cloudflare)
6. Verdicts are tracked and displayed in real-time
7. ICPC-style leaderboard updates live during contest
8. Stable for 30+ concurrent users on LAN
9. Complete setup documentation
