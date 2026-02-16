const { body, validationResult } = require('express-validator');

/**
 * Middleware to check validation results.
 * Use after express-validator chains.
 */
const validate = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map((e) => ({
        field: e.path,
        message: e.msg,
      })),
    });
  }
  next();
};

// Auth validators
const registerValidation = [
  body('username')
    .trim()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be 3-30 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  body('email').trim().isEmail().withMessage('Valid email is required').normalizeEmail(),
  body('password').isLength({ min: 6, max: 128 }).withMessage('Password must be 6-128 characters'),
  validate,
];

const loginValidation = [
  body('login').trim().notEmpty().withMessage('Login (username or email) is required'),
  body('password').notEmpty().withMessage('Password is required'),
  validate,
];

// Submission validators
const submitValidation = [
  body('contestId').isMongoId().withMessage('Valid contestId is required'),
  body('problemId')
    .matches(/^\d+[A-Z]\d?$/)
    .withMessage('problemId must match format like "4A" or "1234B1"'),
  body('code').isLength({ min: 1, max: 100000 }).withMessage('Code must be 1-100000 characters'),
  body('language').notEmpty().withMessage('Language is required'),
  body('languageId').matches(/^\d+$/).withMessage('languageId must be a numeric string'),
  validate,
];

// Contest validators
const contestValidation = [
  body('title').trim().isLength({ min: 3, max: 200 }).withMessage('Title must be 3-200 characters'),
  body('startTime').isISO8601().withMessage('startTime must be a valid ISO 8601 date'),
  body('duration').isInt({ min: 1 }).withMessage('Duration must be a positive integer (minutes)'),
  body('problems').isArray({ min: 1 }).withMessage('At least one problem is required'),
  body('problems.*.contestId').isInt({ min: 1 }).withMessage('Each problem must have a valid contestId (positive integer)'),
  body('problems.*.problemIndex')
    .matches(/^[A-Z]\d?$/)
    .withMessage('Each problem must have a valid problemIndex (e.g. A, B, B1)'),
  body('problems.*.order')
    .matches(/^[A-Z]$/)
    .withMessage('Each problem must have an order letter (A-Z)'),
  validate,
];

// Cookie linking validator
const linkCookiesValidation = [
  body('cookies').isString().isLength({ min: 10, max: 5000 }).withMessage('Cookies must be a string (10-5000 characters)'),
  validate,
];

module.exports = {
  validate,
  registerValidation,
  loginValidation,
  submitValidation,
  contestValidation,
  linkCookiesValidation,
};
