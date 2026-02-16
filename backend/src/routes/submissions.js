const express = require('express');
const axios = require('axios');
const Submission = require('../models/Submission');
const Contest = require('../models/Contest');
const { auth } = require('../middleware/auth');
const { CF_SERVICE_URL } = require('../config/env');
const { pollVerdict } = require('../services/verdictPoller');
const { submitLimiter } = require('../middleware/rateLimiter');
const { submitValidation } = require('../utils/validators');
const { getAdminCfCredentials } = require('../services/adminCfService');

const router = express.Router();

// POST /api/submissions — submit a solution
router.post('/', auth, submitLimiter, submitValidation, async (req, res) => {
  try {
    const { contestId, problemId, code, language, languageId } = req.body;

    // Validate required fields
    if (!contestId || !problemId || !code || !language || !languageId) {
      return res.status(400).json({
        error: 'contestId, problemId, code, language, and languageId are required',
      });
    }

    // Check contest exists and is running
    const contest = await Contest.findById(contestId);
    if (!contest) {
      return res.status(404).json({ error: 'Contest not found' });
    }

    const status = contest.computeStatus();
    if (status !== 'RUNNING') {
      return res.status(400).json({
        error: `Contest is ${status}. Submissions only allowed during running contests`,
      });
    }

    // Check user is a participant
    const isParticipant = contest.participants.some((p) => p.toString() === req.userId.toString());
    if (!isParticipant) {
      return res.status(403).json({ error: 'You must join the contest first' });
    }

    // Check problem belongs to contest
    const contestProblem = contest.problems.find((p) => p.problemId === problemId);
    if (!contestProblem) {
      return res.status(400).json({ error: 'Problem not in this contest' });
    }

    // Get admin's CF credentials (all submissions go through admin's account)
    let adminCf;
    try {
      adminCf = await getAdminCfCredentials();
    } catch (err) {
      if (err.message === 'NO_ADMIN_CF') {
        return res.status(503).json({ error: 'Platform Codeforces account not configured. Contact an admin.' });
      }
      return res.status(500).json({ error: 'Failed to load platform credentials. Contact an admin.' });
    }
    const cookies = adminCf.cookies;

    // Build problem_code for CF service (e.g., "4A" → "4/A")
    const problemCode = `${contestProblem.contestId}/${contestProblem.problemIndex}`;

    // Submit to CF via Python service
    let cfResponse;
    try {
      cfResponse = await axios.post(`${CF_SERVICE_URL}/cf/submit`, {
        cookies,
        problem_code: problemCode,
        source_code: code,
        language_id: languageId,
      });
    } catch (err) {
      if (err.response) {
        const msg = err.response.data?.detail || 'Submission failed on Codeforces';
        return res.status(err.response.status === 401 ? 401 : 502).json({ error: msg });
      }
      console.error('CF service error:', err.message);
      return res.status(502).json({ error: 'Codeforces service unavailable' });
    }

    const cfSubmissionId = cfResponse.data.submission_id;

    // Create submission record
    const submission = new Submission({
      contestId,
      userId: req.userId,
      problemId,
      code,
      language,
      languageId,
      cfSubmissionId,
      verdict: 'PENDING',
      submittedAt: new Date(),
    });

    await submission.save();

    // Start verdict polling in background using admin's CF handle
    pollVerdict(submission._id, adminCf.handle, cfSubmissionId, contestId).catch((err) =>
      console.error('[VerdictPoller] Unexpected error:', err),
    );

    res.status(201).json({
      _id: submission._id,
      contestId: submission.contestId,
      problemId: submission.problemId,
      language: submission.language,
      cfSubmissionId: submission.cfSubmissionId,
      verdict: submission.verdict,
      submittedAt: submission.submittedAt,
    });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid contest or problem ID' });
    }
    console.error('Submit error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/submissions?contestId=...&userId=...&problemId=...
router.get('/', auth, async (req, res) => {
  try {
    const filter = {};
    if (req.query.contestId) filter.contestId = req.query.contestId;
    if (req.query.userId) filter.userId = req.query.userId;
    if (req.query.problemId) filter.problemId = req.query.problemId;

    // Non-admin users can only see their own submissions
    if (req.user.role !== 'admin' && !req.query.userId) {
      filter.userId = req.userId;
    }

    const submissions = await Submission.find(filter)
      .select('-code') // Don't send source code in list
      .sort({ submittedAt: -1 })
      .limit(100)
      .populate('userId', 'username');

    res.json(submissions);
  } catch (err) {
    console.error('List submissions error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/submissions/:id — get single submission (with code)
router.get('/:id', auth, async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.id).populate('userId', 'username');

    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    // Only owner or admin can see the code
    if (submission.userId._id.toString() !== req.userId.toString() && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied' });
    }

    res.json(submission);
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(404).json({ error: 'Submission not found' });
    }
    console.error('Get submission error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
