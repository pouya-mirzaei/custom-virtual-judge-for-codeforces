# Research Findings: How vjudge Works with Codeforces

## Summary

After researching vjudge's architecture and Codeforces integration, here's what I found:

## vjudge Architecture

### 1. Account Linking System

- vjudge has a "My Account" section where users link their online judge accounts
- For Codeforces, users provide their **JSESSIONID** cookie
- This cookie is stored (encrypted) in vjudge's database
- JSESSIONID is a session identifier that Codeforces uses to maintain user sessions

### 2. How JSESSIONID Works

- When you log into Codeforces, the server creates a session
- A cookie named `JSESSIONID` is set in your browser
- This cookie authenticates all subsequent requests
- vjudge uses this cookie to impersonate the user when submitting code

### 3. Problem Fetching

vjudge fetches problems from Codeforces in two ways:

- **Codeforces API** (for metadata): Contest info, problem lists
- **Web Scraping** (for problem statements): HTML parsing to get problem description, samples, constraints

### 4. Submission Process

When a user submits code through vjudge:

1. User writes code in vjudge's editor
2. User clicks "Submit"
3. vjudge retrieves the stored JSESSIONID for that user
4. vjudge makes an HTTP POST request to Codeforces submission endpoint
5. Request includes:
   - CSRF token (scraped from submission page)
   - Problem ID
   - Source code
   - Language ID
   - User's JSESSIONID cookie
6. Codeforces processes it as if the user submitted directly
7. vjudge polls Codeforces API to get submission status
8. vjudge updates its own database and displays result

### 5. Verdict Tracking

- vjudge runs background jobs that poll Codeforces API
- Checks submission status every few seconds
- Updates verdict (Accepted, Wrong Answer, TLE, etc.)
- Updates leaderboard accordingly

## Important Technical Details

### Codeforces Submission Endpoint

```
POST https://codeforces.com/contest/{contestId}/submit
```

### Required Form Data

- `csrf_token`: CSRF protection token
- `action`: "submitSolutionFormSubmitted"
- `contestId`: Contest ID
- `submittedProblemIndex`: Problem letter (A, B, C...)
- `programTypeId`: Language ID (54 for C++17, 73 for C++20, etc.)
- `source`: Source code
- `tabSize`: Usually 4

### Language IDs (Codeforces)

| Language   | ID  |
| ---------- | --- |
| GNU C11    | 43  |
| Clang++17  | 52  |
| GNU C++17  | 54  |
| Python 3   | 31  |
| Java       | 60  |
| JavaScript | 55  |
| GNU C++20  | 73  |

### CSRF Token

- Must be extracted from the submission page HTML
- Changes per session
- Required for POST requests to prevent CSRF attacks

## Key Challenges

### 1. No Official Submission API

- Codeforces API is **read-only**
- No official way to submit code via API
- Must use web scraping/automation

### 2. Session Management

- JSESSIONID can expire
- Need to handle expired sessions gracefully
- May need to prompt user to re-authenticate

### 3. Rate Limiting

- Codeforces has rate limits
- Too many requests = temporary ban
- Need to implement request throttling

### 4. Website Structure Changes

- Codeforces can change HTML structure
- Scraping code may break
- Need to maintain and update

### 5. Security Concerns

- Storing user credentials/cookies is risky
- Must encrypt JSESSIONID
- Need secure storage practices

## Alternative Approach: Browser Extension

Instead of storing JSESSIONID server-side, you could:

1. Create a browser extension
2. Extension captures JSESSIONID from user's browser
3. Extension sends it with each submission
4. More secure (cookie never leaves user's machine permanently)

## Legal & Ethical Considerations

### Codeforces Terms of Service

- Check if automation is allowed
- Respect rate limits
- Don't abuse the platform

### Best Practices

1. **Rate Limiting**: Max 1 request per 2 seconds per user
2. **User Consent**: Clearly explain what JSESSIONID is used for
3. **Security**: Encrypt all stored credentials
4. **Error Handling**: Handle Codeforces downtime gracefully
5. **Attribution**: Make it clear submissions go to Codeforces

## Comparison with Other Platforms

### LeetCode

- Has official API for submissions
- OAuth integration available

### HackerRank

- API available for custom challenges
- Better for hosting your own problems

### AtCoder

- Similar to Codeforces (no submission API)
- Would need same scraping approach

### UVa Online Judge

- Very old platform
- Easier to scrape
- Has unofficial APIs

## Recommendations for Your Platform

### Security

1. ✅ Use HTTPS everywhere
2. ✅ Encrypt JSESSIONID with AES-256
3. ✅ Implement JWT for platform authentication
4. ✅ Rate limit submission attempts
5. ✅ Validate all input server-side

### Reliability

1. ✅ Cache problem statements (reduce Codeforces load)
2. ✅ Queue submissions (don't overwhelm Codeforces)
3. ✅ Implement retry logic with exponential backoff
4. ✅ Store submission code (in case need to resubmit)
5. ✅ Health check endpoint to monitor Codeforces availability

### User Experience

1. ✅ Clear instructions for getting JSESSIONID
2. ✅ Visual guide with screenshots
3. ✅ Validation that JSESSIONID works
4. ✅ Notifications when submission is judged
5. ✅ Fallback for when Codeforces is down

### Scalability

1. ✅ Use Redis for caching
2. ✅ Background job queue (Bull, BullMQ)
3. ✅ WebSocket for real-time updates
4. ✅ Database indexing
5. ✅ Horizontal scaling if needed

## How to Get JSESSIONID (User Guide)

### Method 1: Chrome DevTools

1. Go to codeforces.com and log in
2. Press F12 to open DevTools
3. Go to "Application" tab
4. Click "Cookies" → "https://codeforces.com"
5. Find "JSESSIONID"
6. Copy the value

### Method 2: Browser Extension

1. Install "Cookie Editor" extension
2. Go to codeforces.com
3. Click extension icon
4. Find and copy JSESSIONID

### Method 3: EditThisCookie

1. Install EditThisCookie extension
2. Click icon on Codeforces
3. Export cookies
4. Find JSESSIONID in JSON

## Testing Your Integration

### Test Submission

```bash
# Test if JSESSIONID works
curl -X POST "https://codeforces.com/contest/1234/submit" \
  -H "Cookie: JSESSIONID=your_jsessionid" \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "csrf_token=XXX&action=submitSolutionFormSubmitted&contestId=1234&submittedProblemIndex=A&programTypeId=54&source=your_code"
```

### Test Problem Fetch

```bash
# Get problem list
curl "https://codeforces.com/api/problemset.problems"

# Get contest info
curl "https://codeforces.com/api/contest.standings?contestId=1234&from=1&count=1"
```

## Reference Projects

### 1. vjudge-to-oj

- GitHub: https://github.com/m-s-abeer/vjudge-to-oj
- Python implementation
- Shows how to automate submissions

### 2. Competitive Companion

- Browser extension for parsing problems
- Can be used as reference

### 3. CF Tool

- CLI for Codeforces
- Shows parsing techniques

## Expected Issues & Solutions

| Issue                      | Solution                                   |
| -------------------------- | ------------------------------------------ |
| JSESSIONID expires         | Catch 401/403, notify user to update       |
| CSRF token invalid         | Re-fetch token before each submission      |
| Codeforces down            | Queue submissions, retry later             |
| Rate limit hit             | Implement exponential backoff              |
| Problem fetch fails        | Use cached version                         |
| Submission stuck "Running" | Set timeout, mark as error after X minutes |
| HTML structure changed     | Regular maintenance, update parsers        |

## Timeline for Implementation

### Week 1-2: Research & Setup ✅

- [x] Research vjudge architecture
- [x] Understand Codeforces integration
- [x] Plan database schema
- [x] Set up development environment

### Week 3-4: Core Backend

- [ ] User authentication
- [ ] Contest management
- [ ] Database models

### Week 5-6: Codeforces Integration

- [ ] Problem fetching
- [ ] Submission mechanism
- [ ] Verdict polling

### Week 7-8: Frontend

- [ ] Contest pages
- [ ] Submission interface
- [ ] Leaderboard

### Week 9-10: Advanced Features

- [ ] Real-time updates
- [ ] Virtual contests
- [ ] Admin panel

### Week 11-12: Testing & Polish

- [ ] Integration testing
- [ ] Load testing
- [ ] Documentation

## Additional Resources

### Tutorials

- "Web Scraping with Puppeteer" - Learn scraping techniques
- "Building Real-time Apps with Socket.io" - For leaderboard
- "Securing API Keys in Node.js" - For JSESSIONID encryption

### Tools

- Postman - API testing
- MongoDB Compass - Database GUI
- Redis Commander - Redis GUI
- Chrome DevTools - Debugging submissions

### Communities

- Codeforces Groups
- r/competitiveprogramming
- Stack Overflow

## Conclusion

vjudge works by:

1. Storing user Codeforces JSESSIONID cookies
2. Using those cookies to submit code on user's behalf
3. Polling Codeforces API for submission results
4. Maintaining its own contest/leaderboard system

Your custom platform will follow the same approach. The mega prompt provided contains complete implementation details.

**Key Takeaway**: Since Codeforces has no submission API, you MUST use web scraping/automation with user credentials. This comes with security and maintenance responsibilities.

Good luck with your project! 🎯
