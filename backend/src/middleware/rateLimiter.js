const rateLimit = require('express-rate-limit');

// Global: 100 requests per minute
const globalLimiter = rateLimit({
  windowMs: 60000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later' },
});

// Submissions: 3 per minute per user (CF itself limits ~1 per 10s)
const submitLimiter = rateLimit({
  windowMs: 60000,
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many submissions, please wait before submitting again' },
});

// Auth: 10 per minute (login/register)
const authLimiter = rateLimit({
  windowMs: 60000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many auth attempts, please try again later' },
});

module.exports = { globalLimiter, submitLimiter, authLimiter };
