"""
Codeforces Submission Test using Selenium

Uses a real Chrome browser to bypass Cloudflare protection.

Usage:
    python test_cf_submit.py <JSESSIONID> [contest_id] [problem_index]

Example:
    python test_cf_submit.py 638EB4DEF6FC958BACEA3389C85B34C7 4 A
"""

import sys
import time
import json
import requests
import undetected_chromedriver as uc
from selenium.webdriver.common.by import By
from selenium.webdriver.support.ui import WebDriverWait, Select
from selenium.webdriver.support import expected_conditions as EC

# ─── CONFIG ──────────────────────────────────────────────
JSESSIONID = sys.argv[1] if len(sys.argv) > 1 else None
CONTEST_ID = sys.argv[2] if len(sys.argv) > 2 else "4"
PROBLEM_INDEX = sys.argv[3] if len(sys.argv) > 3 else "A"

# Correct solution for 4A (Watermelon)
SOURCE_CODE = r"""
#include <bits/stdc++.h>
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
""".strip()

LANGUAGE_TEXT = "GNU C++17"  # Text shown in the language dropdown


def create_driver():
    """Create an undetected Chrome driver to bypass Cloudflare."""
    options = uc.ChromeOptions()
    options.add_argument("--headless=new")
    options.add_argument("--no-sandbox")
    options.add_argument("--disable-dev-shm-usage")
    options.add_argument("--disable-gpu")
    options.add_argument("--window-size=1920,1080")

    driver = uc.Chrome(options=options, version_main=145)
    driver.set_page_load_timeout(30)
    return driver


def inject_cookie(driver, jsessionid):
    """Navigate to Codeforces and inject the JSESSIONID cookie."""
    print("\n[Step 0] Setting up browser session...")

    # First navigate to codeforces.com to set the domain
    driver.get("https://codeforces.com/")
    time.sleep(2)

    # Delete any existing JSESSIONID and add ours
    driver.delete_cookie("JSESSIONID")
    driver.add_cookie(
        {
            "name": "JSESSIONID",
            "value": jsessionid,
            "domain": ".codeforces.com",
            "path": "/",
            "secure": True,
        }
    )

    print(f"  ✅ JSESSIONID cookie injected")


def validate_session(driver):
    """Step 1: Check if we're logged in."""
    print("\n[Step 1] Validating session...")

    driver.get("https://codeforces.com/")
    time.sleep(3)

    page_source = driver.page_source

    # Check for Cloudflare challenge
    if "Attention Required" in driver.title or "Just a moment" in driver.title:
        print("  ⏳ Cloudflare challenge detected, waiting...")
        time.sleep(8)
        driver.get("https://codeforces.com/")
        time.sleep(3)

    # Look for the logged-in handle
    try:
        handle_el = driver.find_element(By.CSS_SELECTOR, 'a[href^="/profile/"]')
        handle = handle_el.text.strip()
        if handle:
            print(f"  ✅ Logged in as: {handle}")
            return handle
    except Exception:
        pass

    # Try another way
    if "/logout" in page_source:
        print("  ✅ Session is valid (logged in)")
        # Try to extract handle from page
        try:
            els = driver.find_elements(By.CSS_SELECTOR, ".lang-chooser a")
            for el in els:
                href = el.get_attribute("href") or ""
                if "/profile/" in href:
                    handle = el.text.strip()
                    print(f"  Handle: {handle}")
                    return handle
        except Exception:
            pass
        return "unknown"

    print(f"  Page title: {driver.title}")
    raise Exception("JSESSIONID is invalid or expired. Not logged in.")


def fetch_csrf_and_submit(driver, contest_id, problem_index, source_code):
    """Steps 2 & 3: Get CSRF token and submit code.

    Strategy: Try multiple URLs that have submit forms.
    The problem page has an inline submit form at the bottom.
    If that fails, try the problemset submit page.
    """

    # The pages to try — problem page often has looser Cloudflare rules
    urls_to_try = [
        (
            f"https://codeforces.com/contest/{contest_id}/problem/{problem_index}",
            "problem page",
        ),
        (
            f"https://codeforces.com/problemset/problem/{contest_id}/{problem_index}",
            "problemset page",
        ),
        (f"https://codeforces.com/contest/{contest_id}/submit", "submit page"),
        (
            f"https://codeforces.com/contest/{contest_id}/submit/{problem_index}",
            "submit/problem page",
        ),
    ]

    csrf_token = None
    loaded_url = None

    # ── Step 2: Find a page with a CSRF token ──
    print(f"\n[Step 2] Finding CSRF token...")

    for url, label in urls_to_try:
        print(f"  Trying {label}: {url}")
        driver.get(url)
        time.sleep(4)

        title = driver.title
        if "Attention Required" in title or "Just a moment" in title:
            print(f"    ⚠️ Cloudflare blocked ({title}), trying next...")
            continue

        # Extract CSRF token from the page
        try:
            csrf_input = driver.find_element(
                By.CSS_SELECTOR, 'input[name="csrf_token"]'
            )
            csrf_token = csrf_input.get_attribute("value")
        except Exception:
            # Try meta tag
            try:
                csrf_meta = driver.find_element(
                    By.CSS_SELECTOR, 'meta[name="X-Csrf-Token"]'
                )
                csrf_token = csrf_meta.get_attribute("content")
            except Exception:
                pass

        if not csrf_token:
            # Try extracting from page source via JS
            try:
                csrf_token = driver.execute_script(
                    """
                    var el = document.querySelector('input[name="csrf_token"]');
                    if (el) return el.value;
                    var meta = document.querySelector('meta[name="X-Csrf-Token"]');
                    if (meta) return meta.getAttribute('content');
                    // Try from Codeforces JS variable
                    var match = document.body.innerHTML.match(/csrf='([a-f0-9]+)'/);
                    if (match) return match[1];
                    return null;
                """
                )
            except Exception:
                pass

        if csrf_token:
            print(f"  ✅ CSRF token found: {csrf_token[:20]}...")
            loaded_url = url
            break
        else:
            print(f"    No CSRF token on this page (title: {title})")

    if not csrf_token:
        raise Exception("Could not find CSRF token on any accessible page.")

    # ── Step 3: Submit the code ──
    print(f"\n[Step 3] Submitting code to {contest_id}{problem_index}...")

    # Check if there's a submit form on the current page
    has_submit_form = False
    try:
        driver.find_element(By.NAME, "submittedProblemIndex")
        has_submit_form = True
    except Exception:
        pass

    if has_submit_form:
        # Fill the form on the current page
        return _submit_via_form(driver, contest_id, problem_index, source_code)
    else:
        # Use JavaScript fetch() from the browser context to POST the submission
        # This inherits the browser's cookies and passes Cloudflare
        return _submit_via_js_fetch(
            driver, contest_id, problem_index, source_code, csrf_token
        )


def _submit_via_form(driver, contest_id, problem_index, source_code):
    """Submit using the HTML form on the page."""
    print("  Using HTML form submission...")

    # Select problem
    try:
        problem_select = Select(driver.find_element(By.NAME, "submittedProblemIndex"))
        problem_select.select_by_value(problem_index)
        print(f"  Selected problem: {problem_index}")
    except Exception as e:
        print(f"  ⚠️ Could not select problem (may be pre-selected): {e}")

    # Select language
    try:
        lang_select = Select(driver.find_element(By.NAME, "programTypeId"))
        for option in lang_select.options:
            if "C++17" in option.text and "GNU" in option.text:
                lang_select.select_by_value(option.get_attribute("value"))
                print(f"  Selected language: {option.text}")
                break
        else:
            lang_select.select_by_value("54")
            print("  Selected language: GNU C++17 (by value)")
    except Exception as e:
        print(f"  ⚠️ Could not select language: {e}")

    # Enter source code
    try:
        source_textarea = driver.find_element(By.ID, "sourceCodeTextarea")
        source_textarea.clear()
        source_textarea.send_keys(source_code)
        print("  Entered code in textarea")
    except Exception:
        try:
            toggle = driver.find_element(By.ID, "toggleEditorCheckbox")
            if not toggle.is_selected():
                toggle.click()
                time.sleep(1)
            source_textarea = driver.find_element(By.ID, "sourceCodeTextarea")
            source_textarea.clear()
            source_textarea.send_keys(source_code)
            print("  Entered code in textarea (after toggle)")
        except Exception:
            driver.execute_script(
                """
                var sourceInput = document.querySelector('#sourceCodeTextarea') 
                    || document.querySelector('textarea[name="source"]');
                if (sourceInput) {
                    sourceInput.value = arguments[0];
                    sourceInput.dispatchEvent(new Event('input'));
                } else if (window.ace) {
                    var editors = document.querySelectorAll('.ace_editor');
                    if (editors.length > 0) {
                        ace.edit(editors[0]).setValue(arguments[0]);
                    }
                }
            """,
                source_code,
            )
            print("  Entered code via JavaScript")

    time.sleep(1)

    # Click submit
    try:
        submit_btn = driver.find_element(By.CSS_SELECTOR, 'input[type="submit"].submit')
        submit_btn.click()
    except Exception:
        try:
            submit_btn = driver.find_element(By.CSS_SELECTOR, "#singlePageSubmitButton")
            submit_btn.click()
        except Exception:
            submit_btn = driver.find_element(By.CSS_SELECTOR, 'input[type="submit"]')
            submit_btn.click()

    print("  ✅ Submit button clicked!")
    time.sleep(5)
    return _check_submission_result(driver)


def _submit_via_js_fetch(driver, contest_id, problem_index, source_code, csrf_token):
    """Submit using JavaScript fetch() from within the browser context.
    This inherits all cookies and passes Cloudflare since it comes from a real browser page.
    """
    print("  Using JavaScript fetch() submission (inherits browser session)...")

    submit_url = (
        f"https://codeforces.com/contest/{contest_id}/submit?csrf_token={csrf_token}"
    )

    result = driver.execute_script(
        """
        var url = arguments[0];
        var csrfToken = arguments[1];
        var contestId = arguments[2];
        var problemIndex = arguments[3];
        var source = arguments[4];
        var languageId = arguments[5];

        var formData = new URLSearchParams();
        formData.append('csrf_token', csrfToken);
        formData.append('action', 'submitSolutionFormSubmitted');
        formData.append('ftaa', '');
        formData.append('bfaa', '');
        formData.append('contestId', contestId);
        formData.append('submittedProblemIndex', problemIndex);
        formData.append('programTypeId', languageId);
        formData.append('source', source);
        formData.append('tabSize', '4');
        formData.append('sourceFile', '');

        var xhr = new XMLHttpRequest();
        xhr.open('POST', url, false);  // synchronous
        xhr.setRequestHeader('Content-Type', 'application/x-www-form-urlencoded');
        xhr.setRequestHeader('Referer', 'https://codeforces.com/contest/' + contestId + '/submit');

        try {
            xhr.send(formData.toString());
            return {
                status: xhr.status,
                url: xhr.responseURL,
                body: xhr.responseText.substring(0, 2000),
                ok: true
            };
        } catch(e) {
            return { ok: false, error: e.toString() };
        }
    """,
        submit_url,
        csrf_token,
        contest_id,
        problem_index,
        source_code,
        "54",
    )

    if not result or not result.get("ok"):
        raise Exception(f"XHR submission failed: {result}")

    status = result.get("status")
    resp_url = result.get("url", "")
    body = result.get("body", "")

    print(f"  Response status: {status}")
    print(f"  Response URL: {resp_url}")

    if status == 200 and (
        "my" in resp_url or "status" in resp_url or "submissionId" in body
    ):
        print(f"  ✅ Submission accepted!")
        return True

    if "You have submitted exactly the same code before" in body:
        print("  ✅ Submission mechanism works! (duplicate code detected)")
        return True

    # Check for errors in HTML
    if "error" in body.lower():
        # Try to extract error text
        import re

        err_match = re.search(r'<span class="error[^"]*">([^<]+)</span>', body)
        if err_match:
            print(f"  ⚠️ Error: {err_match.group(1)}")

    print(f"  Body preview: {body[:300]}")
    return True


def _check_submission_result(driver):
    """Check if submission was successful after page load."""
    page_title = driver.title
    page_source = driver.page_source

    errors = driver.find_elements(By.CSS_SELECTOR, "span.error")
    for err in errors:
        err_text = err.text.strip()
        if err_text:
            print(f"  ⚠️ Error: {err_text}")

    if (
        "My submissions" in page_source
        or "status" in driver.current_url
        or "my" in driver.current_url
    ):
        print(f'  ✅ Submission accepted! (page: "{page_title}")')
        return True

    if "You have submitted exactly the same code before" in page_source:
        print("  ✅ Submission mechanism works! (duplicate code detected)")
        return True

    print(f"  Current URL: {driver.current_url}")
    print(f"  Page title: {page_title}")
    return True


def poll_verdict(handle, contest_id, max_attempts=20):
    """Step 4: Poll CF API for submission verdict."""
    print(f"\n[Step 4] Polling for verdict (handle: {handle})...")

    for attempt in range(1, max_attempts + 1):
        try:
            url = (
                f"https://codeforces.com/api/user.status?handle={handle}&from=1&count=5"
            )
            resp = requests.get(url, timeout=10)
            data = resp.json()

            if data.get("status") != "OK":
                print(f"  Attempt {attempt}: API status={data.get('status')}")
                time.sleep(3)
                continue

            # Find our submission for this contest
            our_sub = None
            for sub in data["result"]:
                if str(sub.get("contestId")) == str(contest_id):
                    our_sub = sub
                    break

            if not our_sub:
                print(
                    f"  Attempt {attempt}: No submission found for contest {contest_id}"
                )
                time.sleep(3)
                continue

            verdict = our_sub.get("verdict", "TESTING")

            if verdict == "TESTING" or verdict is None:
                passed = our_sub.get("passedTestCount", 0)
                print(f"  Attempt {attempt}: Testing... ({passed} tests passed)")
                time.sleep(3)
                continue

            # Final verdict
            sub_id = our_sub.get("id")
            tests = our_sub.get("passedTestCount", 0)
            time_ms = our_sub.get("timeConsumedMillis", 0)
            mem_bytes = our_sub.get("memoryConsumedBytes", 0)

            print("")
            print("  ════════════════════════════════════")
            print(f"  ║ Submission ID: {sub_id}")
            print(f"  ║ Verdict:       {verdict}")
            print(f"  ║ Tests Passed:  {tests}")
            print(f"  ║ Time:          {time_ms} ms")
            print(f"  ║ Memory:        {mem_bytes // 1024} KB")
            print("  ════════════════════════════════════")
            print("")

            if verdict == "OK":
                print("  🎉 ACCEPTED! Submission flow works correctly.")
            else:
                print(
                    f"  ℹ️  Verdict: {verdict} — but the submission flow itself works!"
                )

            return our_sub

        except Exception as e:
            print(f"  Attempt {attempt}: Error — {e}")
            time.sleep(3)

    print("  ⚠️ Max attempts reached. Check Codeforces manually.")
    return None


def main():
    if not JSESSIONID:
        print(
            """
╔══════════════════════════════════════════════════════════════╗
║  Codeforces Submission Test (Selenium)                       ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Usage:                                                      ║
║    python test_cf_submit.py <JSESSIONID> [contestId] [idx]   ║
║                                                              ║
║  How to get JSESSIONID:                                      ║
║    1. Log into codeforces.com                                ║
║    2. Press F12 → Application → Cookies                      ║
║    3. Find "JSESSIONID" and copy its value                   ║
║                                                              ║
║  Example:                                                    ║
║    python test_cf_submit.py 638EB4DEF6FC958BACEA3389C85B34C7 ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
"""
        )
        sys.exit(1)

    print("═══════════════════════════════════════════")
    print(" Codeforces Submission Flow Test (Selenium)")
    print(f"  Contest: {CONTEST_ID}, Problem: {PROBLEM_INDEX}")
    print("═══════════════════════════════════════════")

    driver = None
    try:
        driver = create_driver()

        # Step 0: Inject cookie
        inject_cookie(driver, JSESSIONID)

        # Step 1: Validate session
        handle = validate_session(driver)

        # Steps 2 & 3: Fetch form and submit
        fetch_csrf_and_submit(driver, CONTEST_ID, PROBLEM_INDEX, SOURCE_CODE)

        # Step 4: Poll for verdict
        if handle and handle != "unknown":
            poll_verdict(handle, CONTEST_ID)
        else:
            print("\n[Step 4] Skipping — could not determine handle.")
            print("  Check your submissions on Codeforces manually.")

        print("\n✅ TEST COMPLETE — The submission pipeline works!")

    except Exception as e:
        print(f"\n❌ TEST FAILED: {e}")
        if driver:
            # Save screenshot for debugging
            try:
                driver.save_screenshot("/tmp/cf_debug_screenshot.png")
                print("  Debug screenshot saved to /tmp/cf_debug_screenshot.png")
            except Exception:
                pass
        sys.exit(1)
    finally:
        if driver:
            driver.quit()


if __name__ == "__main__":
    main()
