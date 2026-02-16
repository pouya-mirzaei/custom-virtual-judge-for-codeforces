"""
cf_service.py — FastAPI microservice for Codeforces integration.
Uses curl_cffi to bypass Cloudflare TLS fingerprinting.

PROVEN WORKING: Submission #363219620, Verdict: OK
"""

import re
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from curl_cffi import requests as cf_requests


# --- Request Models ---


class CookieValidation(BaseModel):
    cookies: str  # Full cookie string from browser


class SubmissionRequest(BaseModel):
    cookies: str  # Full cookie string
    problem_code: str  # e.g., "4A" or "1234B"
    source_code: str
    language_id: str  # CF programTypeId (e.g., "54" for G++17)


app = FastAPI(title="CF Integration Service", version="1.0.0")

# CORS — allow backend to call this service
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Utility Functions ---


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


# --- Cookie Validation ---


@app.post("/cf/validate-cookies")
def validate_cookies(req: CookieValidation):
    """
    Validate cookies by loading CF homepage and extracting handle.
    Returns: { "valid": true, "handle": "username" }
    """
    sess = make_session(req.cookies)
    try:
        r = sess.get("https://codeforces.com/", timeout=15)
    except Exception as e:
        raise HTTPException(
            status_code=502, detail=f"Failed to reach Codeforces: {str(e)}"
        )

    if r.status_code != 200:
        raise HTTPException(status_code=502, detail=f"CF returned HTTP {r.status_code}")

    if "Attention Required" in r.text:
        raise HTTPException(status_code=502, detail="Cloudflare blocked request")

    # Extract handle from page JavaScript: handle = "username"
    # This variable only exists when the user is logged in
    handle_match = re.search(r'handle\s*=\s*"([^"]+)"', r.text)
    if handle_match:
        return {"valid": True, "handle": handle_match.group(1)}

    # Fallback: look for the header logout link (only present when logged in)
    # Pattern: <a href="/profile/handle">handle</a> near "logout" in the header
    logout_match = re.search(r"logout", r.text, re.IGNORECASE)
    if logout_match:
        # Find profile link near the header area (logged-in user's profile)
        header_match = re.search(r'<a[^>]+href="/profile/([^"]+)"[^>]*>\1</a>', r.text)
        if header_match:
            return {"valid": True, "handle": header_match.group(1)}

    # No logged-in indicators found
    raise HTTPException(
        status_code=401, detail="Cookies invalid or expired — no logged-in handle found"
    )


# --- Fetch Problem Statement ---


@app.get("/cf/problem/{contest_id}/{problem_index}")
def fetch_problem(contest_id: int, problem_index: str):
    """
    Fetch a problem statement from Codeforces.
    Uses curl_cffi to bypass Cloudflare (no cookies needed for public problems).
    Returns parsed problem data including HTML statement and sample tests.
    """
    sess = cf_requests.Session(impersonate="chrome")
    url = f"https://codeforces.com/contest/{contest_id}/problem/{problem_index}"

    try:
        r = sess.get(url, timeout=15)
    except Exception as e:
        raise HTTPException(
            status_code=502, detail=f"Failed to reach Codeforces: {str(e)}"
        )

    if r.status_code != 200:
        raise HTTPException(
            status_code=502, detail=f"CF returned HTTP {r.status_code} for {url}"
        )

    if "Attention Required" in r.text:
        raise HTTPException(status_code=502, detail="Cloudflare blocked request")

    html = r.text

    # Extract the full problem-statement div
    statement_match = re.search(
        r'<div class="problem-statement">(.*?)</div>\s*</div>\s*</div>',
        html,
        re.DOTALL,
    )

    # Extract title (e.g., "A. Watermelon")
    title_match = re.search(r'<div class="title">(.+?)</div>', html)

    # Extract time limit
    time_match = re.search(
        r'<div class="time-limit">.*?(\d+\s*second)', html, re.DOTALL
    )

    # Extract memory limit
    memory_match = re.search(
        r'<div class="memory-limit">.*?(\d+\s*megabyte)', html, re.DOTALL
    )

    # Extract sample tests
    samples = []
    input_blocks = re.findall(
        r'<div class="input">.*?<pre[^>]*>(.*?)</pre>', html, re.DOTALL
    )
    output_blocks = re.findall(
        r'<div class="output">.*?<pre[^>]*>(.*?)</pre>', html, re.DOTALL
    )
    for inp, out in zip(input_blocks, output_blocks):
        # Clean HTML tags from samples (e.g., <br> → newline)
        inp_clean = re.sub(r"<br\s*/?>", "\n", inp)
        inp_clean = re.sub(r"<[^>]+>", "", inp_clean).strip()
        out_clean = re.sub(r"<br\s*/?>", "\n", out)
        out_clean = re.sub(r"<[^>]+>", "", out_clean).strip()
        samples.append({"input": inp_clean, "output": out_clean})

    # Extract rating if available
    rating = None
    rating_match = re.search(r'title="Difficulty"[^>]*>\s*\*(\d+)', html)
    if rating_match:
        rating = int(rating_match.group(1))

    # Extract tags
    tags = re.findall(r'<span class="tag-box"[^>]*>([^<]+)</span>', html)
    tags = [t.strip() for t in tags]

    return {
        "contestId": contest_id,
        "problemIndex": problem_index,
        "name": title_match.group(1).strip() if title_match else "Unknown",
        "timeLimit": time_match.group(1) if time_match else "Unknown",
        "memoryLimit": memory_match.group(1) if memory_match else "Unknown",
        "statementHtml": statement_match.group(0) if statement_match else "",
        "sampleTests": samples,
        "rating": rating,
        "tags": tags,
    }


# --- Submit Solution ---


@app.post("/cf/submit")
def submit_solution(req: SubmissionRequest):
    """
    Submit a solution to Codeforces.

    Flow (PROVEN WORKING — Submission #363219620, Verdict: OK):
    1. GET /problemset/submit → extract csrf_token
    2. POST /problemset/submit?csrf_token=XXX with form data
    3. On success, CF redirects to /problemset/status?my=on
    4. Extract submission ID from page or via API

    Returns: { "success": true, "submission_id": 363219620 }
    """
    sess = make_session(req.cookies)

    # Step 1: Get CSRF token from submit page
    try:
        r = sess.get("https://codeforces.com/problemset/submit", timeout=15)
    except Exception as e:
        raise HTTPException(
            status_code=502, detail=f"Failed to load submit page: {str(e)}"
        )

    if r.status_code != 200:
        raise HTTPException(
            status_code=502,
            detail=f"Failed to load submit page: HTTP {r.status_code}",
        )

    if "Attention Required" in r.text:
        raise HTTPException(status_code=502, detail="Cloudflare blocked submit page")

    # Check if user is logged in (submit page requires auth)
    if "Enter" in r.text and "Register" in r.text and "submit" not in r.url.lower():
        raise HTTPException(
            status_code=401,
            detail="Not logged in — cookies may be expired",
        )

    # Extract CSRF token (try multiple patterns)
    csrf_token = None
    for pattern in [
        r'name=["\']csrf_token["\']\s+value=["\']([^"\']+)["\']',
        r"csrf_token\s*[\"']?\s*[:=]\s*[\"']?([a-f0-9]{32})",
        r"csrf_token\s*=\s*'([^']+)'",
    ]:
        match = re.search(pattern, r.text)
        if match:
            csrf_token = match.group(1)
            break

    if not csrf_token:
        raise HTTPException(
            status_code=502,
            detail="Could not extract CSRF token — user may not be logged in",
        )

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

    try:
        r = sess.post(
            f"https://codeforces.com/problemset/submit?csrf_token={csrf_token}",
            data=data,
            headers=headers,
            timeout=30,
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Submission POST failed: {str(e)}")

    # Step 3: Check for success (redirect to status page)
    final_url = str(r.url)

    if "my=on" in final_url or "status" in final_url:
        # Try to extract submission ID from the status page HTML
        sid_match = re.search(r'data-submission-id="(\d+)"', r.text)
        if sid_match:
            return {"success": True, "submission_id": int(sid_match.group(1))}

        # Fallback: get latest submission via public API
        handle_match = re.search(r'handle\s*=\s*"([^"]+)"', r.text)
        if handle_match:
            handle = handle_match.group(1)
            try:
                api_r = sess.get(
                    f"https://codeforces.com/api/user.status?handle={handle}&from=1&count=1",
                    timeout=10,
                )
                if api_r.status_code == 200:
                    api_data = api_r.json()
                    if api_data.get("status") == "OK" and api_data.get("result"):
                        return {
                            "success": True,
                            "submission_id": api_data["result"][0]["id"],
                        }
            except Exception:
                pass

        # Submission went through but couldn't extract ID
        return {"success": True, "submission_id": None}

    # Check for rate limiting
    if "You have submitted" in r.text:
        raise HTTPException(
            status_code=429,
            detail="Codeforces rate limit: submitted too often. Wait ~10 seconds.",
        )

    # Check for "same code" rejection
    if "You have already submitted" in r.text or "Same code" in r.text:
        raise HTTPException(
            status_code=409,
            detail="Duplicate submission: same code was already submitted for this problem",
        )

    raise HTTPException(
        status_code=502,
        detail=f"Unexpected response from CF: HTTP {r.status_code}, URL: {final_url}",
    )


# --- Get Verdict ---


@app.get("/cf/verdict/{handle}/{submission_id}")
def get_verdict(handle: str, submission_id: int):
    """
    Get submission verdict from CF public API.
    No cookies needed — this is a public endpoint.
    Returns verdict, tests passed, time, memory.
    """
    import urllib.request
    import json as json_module

    url = f"https://codeforces.com/api/user.status" f"?handle={handle}&from=1&count=10"

    try:
        req = urllib.request.Request(url)
        req.add_header("User-Agent", "Mozilla/5.0")
        with urllib.request.urlopen(req, timeout=10) as resp:
            data = json_module.loads(resp.read())
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"CF API error: {str(e)}")

    if data.get("status") != "OK":
        raise HTTPException(
            status_code=502,
            detail=f"CF API returned: {data.get('comment', 'Unknown error')}",
        )

    # Find the specific submission in recent results
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
