#!/usr/bin/env python3
"""
Test Codeforces submission using curl_cffi to bypass Cloudflare TLS fingerprinting.
curl_cffi wraps curl-impersonate, which generates real browser TLS fingerprints.
"""

import sys
import re
from curl_cffi import requests

# --- Configuration ---
COOKIES_FILE = ".cookies.txt"
CF_BASE = "https://codeforces.com"

# Test problem: 4A - Watermelon (simplest problem on CF)
TEST_PROBLEM = "4A"
TEST_CODE = """
#include <iostream>
using namespace std;
int main() {
    int n;
    cin >> n;
    if (n > 2 && n % 2 == 0)
        cout << "YES" << endl;
    else
        cout << "NO" << endl;
    return 0;
}
"""
TEST_LANG_ID = "54"  # GNU G++17 7.3.0


def load_cookies(path: str) -> dict:
    """Parse cookie string from file into dict."""
    with open(path) as f:
        raw = f.read().strip()
    cookies = {}
    for part in raw.split(";"):
        part = part.strip()
        if "=" in part:
            k, v = part.split("=", 1)
            cookies[k.strip()] = v.strip()
    return cookies


def make_session(cookies: dict) -> requests.Session:
    """Create a curl_cffi session impersonating Chrome."""
    sess = requests.Session(impersonate="chrome")
    for k, v in cookies.items():
        sess.cookies.set(k, v, domain=".codeforces.com")
    return sess


def step1_validate_session(sess: requests.Session) -> bool:
    """Check if the session is logged in by hitting the homepage."""
    print("[Step 1] Validating session (homepage)...")
    r = sess.get(f"{CF_BASE}/")
    if r.status_code != 200:
        print(f"  FAIL: HTTP {r.status_code}")
        return False

    # Check for Cloudflare block
    if "Attention Required" in r.text or "cf-error" in r.text:
        print("  FAIL: Cloudflare blocked homepage")
        return False

    # Check if logged in
    handle_match = re.search(r'handle\s*=\s*"([^"]+)"', r.text)
    if handle_match:
        print(f"  OK: Logged in as '{handle_match.group(1)}'")
        return True

    # Alternative check
    if "pouya.hp2004" in r.text or "/profile/" in r.text:
        print("  OK: Session appears valid (profile link found)")
        return True

    print("  WARN: Could not confirm login status, but page loaded")
    print(f"  Status: {r.status_code}, Length: {len(r.text)}")
    return True


def step2_access_inner_page(sess: requests.Session) -> bool:
    """Test accessing an inner page (the critical Cloudflare test)."""
    urls = [
        f"{CF_BASE}/problemset/problem/4/A",
        f"{CF_BASE}/contest/4/problem/A",
        f"{CF_BASE}/problemset/submit",
    ]

    print("[Step 2] Testing inner page access (Cloudflare bypass)...")
    for url in urls:
        r = sess.get(url)
        blocked = "Attention Required" in r.text or "cf-error" in r.text
        has_content = len(r.text) > 1000
        print(f"  {url}")
        print(
            f"    Status: {r.status_code}, Length: {len(r.text)}, Blocked: {blocked}, Has content: {has_content}"
        )

        if blocked:
            print("  FAIL: Cloudflare is blocking inner pages")
            return False

    print("  OK: Inner pages accessible!")
    return True


def step3_extract_csrf(sess: requests.Session) -> str | None:
    """Fetch the submit page and extract the CSRF token."""
    print("[Step 3] Extracting CSRF token from submit page...")
    r = sess.get(f"{CF_BASE}/problemset/submit")

    if r.status_code != 200:
        print(f"  FAIL: HTTP {r.status_code}")
        return None

    if "Attention Required" in r.text:
        print("  FAIL: Cloudflare blocked")
        return None

    # Look for csrf_token in meta tag or form
    csrf_match = re.search(r'csrf_token\s*["\']?\s*[:=]\s*["\']?([a-f0-9]{32})', r.text)
    if not csrf_match:
        # Try hidden input
        csrf_match = re.search(
            r'name=["\']csrf_token["\']\s+value=["\']([^"\']+)["\']', r.text
        )
    if not csrf_match:
        # Try JavaScript variable
        csrf_match = re.search(r"csrf_token\s*=\s*'([^']+)'", r.text)

    if csrf_match:
        token = csrf_match.group(1)
        print(f"  OK: CSRF token = {token[:16]}...")
        return token

    print("  FAIL: Could not find CSRF token in page")
    # Debug: save page for inspection
    with open("debug_submit_page.html", "w") as f:
        f.write(r.text)
    print("  Saved page to debug_submit_page.html for inspection")
    return None


def step4_submit(sess: requests.Session, csrf_token: str) -> str | None:
    """Submit a solution to Codeforces."""
    print(f"[Step 4] Submitting solution for problem {TEST_PROBLEM}...")

    data = {
        "csrf_token": csrf_token,
        "action": "submitSolutionFormSubmitted",
        "submittedProblemCode": TEST_PROBLEM,
        "programTypeId": TEST_LANG_ID,
        "source": TEST_CODE,
        "tabSize": "4",
        "_tta": "176",
    }

    headers = {
        "Referer": f"{CF_BASE}/problemset/submit",
        "Origin": CF_BASE,
    }

    r = sess.post(
        f"{CF_BASE}/problemset/submit?csrf_token={csrf_token}",
        data=data,
        headers=headers,
    )

    print(f"  Response: HTTP {r.status_code}, Length: {len(r.text)}")
    print(f"  Final URL: {r.url}")

    # If redirected to status page with my=on, submission was successful
    if "my=on" in str(r.url) or "status" in str(r.url):
        print("  OK: Submission appears successful (redirected to status page)")

        # Try to extract submission ID
        sid_match = re.search(r'data-submission-id="(\d+)"', r.text)
        if sid_match:
            sid = sid_match.group(1)
            print(f"  Submission ID: {sid}")
            return sid
        else:
            print("  Could not extract submission ID from page, checking via API...")
            return "unknown"

    # Check for error
    if "You have submitted" in r.text:
        print("  WARN: Rate limited (submitted too often)")
        return "rate_limited"

    if "Attention Required" in r.text:
        print("  FAIL: Cloudflare blocked the POST request")
        return None

    print("  FAIL: Unexpected response")
    with open("debug_submit_response.html", "w") as f:
        f.write(r.text)
    print("  Saved response to debug_submit_response.html")
    return None


def step5_check_verdict(sess: requests.Session, handle: str = "pouya.hp2004") -> None:
    """Check the latest submission verdict via CF API."""
    print("[Step 5] Checking verdict via Codeforces API...")
    import time

    api_url = f"https://codeforces.com/api/user.status?handle={handle}&from=1&count=1"

    for attempt in range(12):  # Wait up to 60 seconds
        r = sess.get(api_url)
        if r.status_code == 200:
            data = r.json()
            if data["status"] == "OK" and data["result"]:
                sub = data["result"][0]
                verdict = sub.get("verdict", "TESTING")
                problem = f"{sub['problem']['contestId']}{sub['problem']['index']}"
                lang = sub.get("programmingLanguage", "?")
                sid = sub.get("id", "?")

                print(f"  Latest: #{sid} | {problem} | {lang} | {verdict}")

                if verdict != "TESTING":
                    print(f"  FINAL VERDICT: {verdict}")
                    return

        if attempt < 11:
            print(f"  Still testing... (attempt {attempt + 1}/12)")
            time.sleep(5)

    print("  Timed out waiting for verdict")


def main():
    # Load cookies
    try:
        cookies = load_cookies(COOKIES_FILE)
        print(f"Loaded {len(cookies)} cookies")
    except FileNotFoundError:
        print(f"Cookie file '{COOKIES_FILE}' not found")
        sys.exit(1)

    # Create session
    sess = make_session(cookies)

    # Step 1: Validate session
    if not step1_validate_session(sess):
        print("\nSession validation failed. Update cookies.")
        sys.exit(1)

    # Step 2: Test inner page access
    if not step2_access_inner_page(sess):
        print("\nCloudflare is blocking inner pages. curl_cffi didn't bypass it.")
        sys.exit(1)

    # Step 3: Extract CSRF
    csrf = step3_extract_csrf(sess)
    if not csrf:
        print("\nFailed to extract CSRF token.")
        sys.exit(1)

    # Ask before submitting
    if "--submit" not in sys.argv:
        print("\n--- DRY RUN ---")
        print("Steps 1-3 passed! curl_cffi successfully bypasses Cloudflare.")
        print("Run with --submit flag to actually submit a solution.")
        return

    # Step 4: Submit
    result = step4_submit(sess, csrf)
    if not result:
        print("\nSubmission failed.")
        sys.exit(1)

    if result == "rate_limited":
        print("\nRate limited, but the mechanism works.")
        return

    # Step 5: Check verdict
    step5_check_verdict(sess)

    print("\n=== SUCCESS: Full submission pipeline works! ===")


if __name__ == "__main__":
    main()
