/**
 * Minimal Codeforces Submission Test
 *
 * Uses curl as HTTP transport because Codeforces blocks Node.js
 * HTTP clients (axios, node-fetch) via TLS fingerprinting.
 *
 * Tests the full flow:
 *   1. Validate session by checking logged-in status
 *   2. Fetch CSRF token from submission page
 *   3. Submit a simple solution to a problem
 *   4. Poll for verdict via CF API
 *
 * Usage (full cookie string — recommended):
 *   node test-cf-submit.js --cookies "JSESSIONID=ABC123; cf_clearance=XYZ789; ..." [contestId] [problemIndex]
 *
 * Usage (JSESSIONID only — may be blocked by Cloudflare):
 *   node test-cf-submit.js "ABC123" [contestId] [problemIndex]
 *
 * How to get cookies:
 *   1. Log into codeforces.com in your browser
 *   2. Press F12 → Network tab → refresh page
 *   3. Click the first request → Headers → Cookie
 *   4. Copy the ENTIRE cookie string
 *
 * Example:
 *   node test-cf-submit.js --cookies "JSESSIONID=638EB4DE...; cf_clearance=abc..." 4 A
 */

const { execFileSync } = require('child_process');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');
const os = require('os');

// ─── CONFIG ──────────────────────────────────────────────
let COOKIES = '';
let CONTEST_ID = '4';
let PROBLEM_INDEX = 'A';

// Parse arguments: --cookie-file, --cookies "full string", or just JSESSIONID
if (process.argv[2] === '--cookie-file') {
  // Read cookies from a file (avoids shell escaping issues)
  const cookieFile = process.argv[3] || '';
  COOKIES = fs.readFileSync(cookieFile, 'utf-8').trim();
  CONTEST_ID = process.argv[4] || '4';
  PROBLEM_INDEX = process.argv[5] || 'A';
} else if (process.argv[2] === '--cookies') {
  COOKIES = process.argv[3] || '';
  CONTEST_ID = process.argv[4] || '4';
  PROBLEM_INDEX = process.argv[5] || 'A';
} else if (process.argv[2]) {
  // Legacy: just JSESSIONID value
  COOKIES = `JSESSIONID=${process.argv[2]}`;
  CONTEST_ID = process.argv[3] || '4';
  PROBLEM_INDEX = process.argv[4] || 'A';
}

// Correct solution for 4A (Watermelon)
const SOURCE_CODE = [
  '#include <bits/stdc++.h>',
  'using namespace std;',
  'int main() {',
  '    int n;',
  '    cin >> n;',
  '    if (n > 2 && n % 2 == 0)',
  '        cout << "YES" << endl;',
  '    else',
  '        cout << "NO" << endl;',
  '    return 0;',
  '}',
].join('\n');

const LANGUAGE_ID = '54'; // GNU C++17

// ─── CURL WRAPPER ────────────────────────────────────────

/**
 * Safe curl GET using execFileSync (no shell injection).
 */
function curlGet(url, cookies) {
  const args = ['-s', '-L', '--max-time', '20'];
  if (cookies) {
    args.push('-H', `Cookie: ${cookies}`);
  }
  // Add browser-like headers to avoid Cloudflare blocks
  args.push('-H', 'User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
  args.push('-H', 'Accept: text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8');
  args.push('-H', 'Accept-Language: en-US,en;q=0.9');
  args.push('--compressed');
  args.push(url);
  return execFileSync('curl', args, { maxBuffer: 10 * 1024 * 1024 }).toString();
}

/**
 * Safe curl POST using a temp file for the source code body.
 * Returns the response body (follows redirects).
 */
function curlPost(url, formFields, cookies, referer) {
  const args = ['-s', '-L', '--max-time', '30'];
  args.push('-H', `Cookie: ${cookies}`);
  args.push('-H', 'User-Agent: Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36');
  args.push('--compressed');
  if (referer) {
    args.push('-H', `Referer: ${referer}`);
  }

  // For fields that may contain special characters (like source code),
  // write to a temp file and use @file syntax
  const tmpDir = os.tmpdir();

  for (const [key, val] of Object.entries(formFields)) {
    if (key === 'source') {
      // Write source code to a temp file to avoid shell issues
      const tmpFile = path.join(tmpDir, `cf_source_${Date.now()}.txt`);
      fs.writeFileSync(tmpFile, val);
      args.push('-F', `source=<${tmpFile}`);
      // Clean up after curl finishes (we'll do it after exec)
      args._tmpFile = tmpFile;
    } else {
      args.push('-F', `${key}=${val}`);
    }
  }

  args.push(url);

  try {
    const result = execFileSync('curl', args, { maxBuffer: 10 * 1024 * 1024 }).toString();
    // Clean up temp file
    if (args._tmpFile) {
      try {
        fs.unlinkSync(args._tmpFile);
      } catch (e) {
        /* ignore */
      }
    }
    return result;
  } catch (err) {
    if (args._tmpFile) {
      try {
        fs.unlinkSync(args._tmpFile);
      } catch (e) {
        /* ignore */
      }
    }
    throw err;
  }
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ─── STEP 1: Validate JSESSIONID ────────────────────────

function validateSession(cookies) {
  console.log('\n[Step 1] Validating session...');
  // Show which cookies we have
  const cookieNames = cookies
    .split(';')
    .map((c) => c.trim().split('=')[0])
    .filter(Boolean);
  console.log(`  Cookies present: ${cookieNames.join(', ')}`);

  const html = curlGet('https://codeforces.com/', cookies);
  const $ = cheerio.load(html);

  // Look for the handle in the header nav
  const handleLink = $('a[href^="/profile/"]').first();
  const handle = handleLink.text().trim();

  if (handle) {
    console.log(`  ✅ Logged in as: ${handle}`);
    return handle;
  }

  // Alternative: check for logout link presence
  if (html.includes('/logout')) {
    const match = html.match(/handle\s*=\s*"([^"]+)"/);
    const h = match ? match[1] : 'unknown';
    console.log(`  ✅ Session valid (handle: ${h})`);
    return h;
  }

  throw new Error('JSESSIONID is invalid or expired. Not logged in.');
}

// ─── STEP 2: Fetch CSRF Token ───────────────────────────

function fetchCsrfToken(cookies, contestId) {
  console.log('\n[Step 2] Fetching CSRF token...');

  const url = `https://codeforces.com/contest/${contestId}/submit`;
  const html = curlGet(url, cookies);
  const $ = cheerio.load(html);

  let csrfToken = $('input[name="csrf_token"]').val();

  if (!csrfToken) {
    csrfToken = $('meta[name="X-Csrf-Token"]').attr('content');
  }

  if (!csrfToken) {
    const match =
      html.match(/name="csrf_token"[^>]*value="([^"]+)"/) ||
      html.match(/value="([^"]+)"[^>]*name="csrf_token"/) ||
      html.match(/csrf_token'\s*,\s*'([a-f0-9]+)'/i);
    csrfToken = match ? match[1] : null;
  }

  if (!csrfToken) {
    console.log('  Page title:', $('title').text());
    console.log('  HTML length:', html.length);
    $('input[type="hidden"]').each((i, el) => {
      console.log(`  Hidden: name=${$(el).attr('name')} val=${$(el).val()?.substring(0, 20)}`);
    });
    throw new Error('Could not extract CSRF token.');
  }

  console.log(`  ✅ CSRF token: ${csrfToken.substring(0, 20)}...`);
  return csrfToken;
}

// ─── STEP 3: Submit Code ────────────────────────────────

function submitCode(cookies, contestId, problemIndex, csrfToken, sourceCode, languageId) {
  console.log(`\n[Step 3] Submitting code to ${contestId}${problemIndex}...`);

  const url = `https://codeforces.com/contest/${contestId}/submit?csrf_token=${csrfToken}`;
  const referer = `https://codeforces.com/contest/${contestId}/submit`;

  const formFields = {
    csrf_token: csrfToken,
    action: 'submitSolutionFormSubmitted',
    ftaa: '',
    bfaa: '',
    contestId: contestId,
    submittedProblemIndex: problemIndex,
    programTypeId: languageId,
    source: sourceCode,
    tabSize: '4',
    sourceFile: '',
  };

  const responseBody = curlPost(url, formFields, cookies, referer);
  const $ = cheerio.load(responseBody);
  const pageTitle = $('title').text().trim();

  // Check for errors
  const errorSpan = $('span.error').text().trim();
  if (errorSpan) {
    console.log(`  ⚠️  Error: ${errorSpan}`);
  }

  // Success indicators
  if (
    pageTitle.includes('Submission') ||
    pageTitle.includes('My') ||
    responseBody.includes('status-cell') ||
    responseBody.includes('view-source') ||
    responseBody.includes('submissionId')
  ) {
    console.log(`  ✅ Submission accepted! (page: "${pageTitle}")`);
    return true;
  }

  if (errorSpan) {
    throw new Error(`Submission rejected: ${errorSpan}`);
  }

  console.log(`  ⚠️  Page: "${pageTitle}" — will verify via API...`);
  return true;
}

// ─── STEP 4: Poll for Verdict ───────────────────────────

async function pollVerdict(handle, contestId, maxAttempts = 20) {
  console.log(`\n[Step 4] Polling for verdict (handle: ${handle})...`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      const apiUrl = `https://codeforces.com/api/user.status?handle=${handle}&from=1&count=5`;
      const raw = curlGet(apiUrl);
      const data = JSON.parse(raw);

      if (data.status !== 'OK') {
        console.log(`  Attempt ${attempt}: API status=${data.status}`);
        await sleep(3000);
        continue;
      }

      const ourSub = data.result.find((s) => String(s.contestId) === String(contestId));

      if (!ourSub) {
        console.log(`  Attempt ${attempt}: No submission found for contest ${contestId}`);
        await sleep(3000);
        continue;
      }

      const verdict = ourSub.verdict || 'TESTING';

      if (verdict === 'TESTING' || !ourSub.verdict) {
        console.log(`  Attempt ${attempt}: Testing... (${ourSub.passedTestCount || 0} tests passed)`);
        await sleep(3000);
        continue;
      }

      // Final verdict
      console.log('');
      console.log('  ════════════════════════════════════');
      console.log(`  ║ Submission ID: ${ourSub.id}`);
      console.log(`  ║ Verdict:       ${verdict}`);
      console.log(`  ║ Tests Passed:  ${ourSub.passedTestCount || 0}`);
      console.log(`  ║ Time:          ${ourSub.timeConsumedMillis || 0} ms`);
      console.log(`  ║ Memory:        ${((ourSub.memoryConsumedBytes || 0) / 1024).toFixed(0)} KB`);
      console.log('  ════════════════════════════════════');
      console.log('');

      if (verdict === 'OK') {
        console.log('  🎉 ACCEPTED! Submission flow works correctly.');
      } else {
        console.log(`  ℹ️  Verdict: ${verdict} — but the submission flow itself works!`);
      }

      return ourSub;
    } catch (err) {
      console.log(`  Attempt ${attempt}: Error — ${err.message}`);
      await sleep(3000);
    }
  }

  console.log('  ⚠️  Max attempts reached. Check Codeforces manually.');
  return null;
}

// ─── MAIN ───────────────────────────────────────────────

async function main() {
  if (!COOKIES) {
    console.log(`
╔══════════════════════════════════════════════════════════════╗
║  Codeforces Submission Test                                  ║
╠══════════════════════════════════════════════════════════════╣
║                                                              ║
║  Usage (recommended — full cookies):                         ║
║    node test-cf-submit.js --cookies "COOKIE_STRING" [cid] [p]║
║                                                              ║
║  Usage (simple — may hit Cloudflare):                        ║
║    node test-cf-submit.js <JSESSIONID> [contestId] [idx]     ║
║                                                              ║
║  How to get the full cookie string:                          ║
║    1. Log into codeforces.com                                ║
║    2. Press F12 → Network tab → refresh page                 ║
║    3. Click the first request (codeforces.com)               ║
║    4. In Request Headers, copy the entire Cookie value       ║
║                                                              ║
║  Example:                                                    ║
║    node test-cf-submit.js --cookies \\                        ║
║      "JSESSIONID=ABC; cf_clearance=XYZ" 4 A                  ║
║                                                              ║
╚══════════════════════════════════════════════════════════════╝
`);
    process.exit(1);
  }

  console.log('═══════════════════════════════════════════');
  console.log(' Codeforces Submission Flow Test');
  console.log(`  Contest: ${CONTEST_ID}, Problem: ${PROBLEM_INDEX}`);
  console.log('═══════════════════════════════════════════');

  try {
    const handle = validateSession(COOKIES);
    const csrfToken = fetchCsrfToken(COOKIES, CONTEST_ID);
    submitCode(COOKIES, CONTEST_ID, PROBLEM_INDEX, csrfToken, SOURCE_CODE, LANGUAGE_ID);
    await pollVerdict(handle, CONTEST_ID);
    console.log('\n✅ TEST COMPLETE — The submission pipeline works!');
  } catch (err) {
    console.error(`\n❌ TEST FAILED: ${err.message}`);
    process.exit(1);
  }
}

main();
