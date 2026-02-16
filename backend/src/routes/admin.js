const express = require('express');
const axios = require('axios');
const User = require('../models/User');
const Submission = require('../models/Submission');
const Contest = require('../models/Contest');
const { auth, adminOnly } = require('../middleware/auth');
const { pollVerdict } = require('../services/verdictPoller');
const { encrypt } = require('../utils/encryption');
const { CF_SERVICE_URL } = require('../config/env');
const { getAdminCfCredentials } = require('../services/adminCfService');

const router = express.Router();

// All admin routes require auth + admin role
router.use(auth, adminOnly);

// GET /api/admin/users — list all users
router.get('/users', async (req, res) => {
  try {
    const users = await User.find().select('-passwordHash -codeforcesCookies').sort({ createdAt: -1 });

    res.json(users);
  } catch (err) {
    console.error('Admin list users error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/admin/users/:id/role — change user role
router.put('/users/:id/role', async (req, res) => {
  try {
    const { role } = req.body;

    if (!role || !['admin', 'user'].includes(role)) {
      return res.status(400).json({ error: 'role must be "admin" or "user"' });
    }

    // Prevent self-demotion
    if (req.params.id === req.userId.toString()) {
      return res.status(400).json({ error: 'Cannot change your own role' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    user.role = role;
    await user.save();

    res.json({
      _id: user._id,
      username: user.username,
      role: user.role,
    });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid user ID' });
    }
    console.error('Admin change role error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/rejudge/:submissionId — rejudge a submission
router.post('/rejudge/:submissionId', async (req, res) => {
  try {
    const submission = await Submission.findById(req.params.submissionId);
    if (!submission) {
      return res.status(404).json({ error: 'Submission not found' });
    }

    if (!submission.cfSubmissionId) {
      return res.status(400).json({ error: 'Submission has no Codeforces submission ID' });
    }

    // Get admin's CF credentials for re-polling
    let adminCf;
    try {
      adminCf = await getAdminCfCredentials();
    } catch (err) {
      return res.status(503).json({ error: 'Platform Codeforces account not configured' });
    }

    // Reset verdict to PENDING
    submission.verdict = 'PENDING';
    submission.testsPassed = 0;
    submission.timeTaken = 0;
    submission.memoryUsed = 0;
    await submission.save();

    // Re-poll the verdict from CF using admin's handle
    pollVerdict(submission._id, adminCf.handle, submission.cfSubmissionId, submission.contestId).catch((err) =>
      console.error('[Admin Rejudge] Poll error:', err.message),
    );

    res.json({
      message: 'Rejudge started',
      submissionId: submission._id,
      cfSubmissionId: submission.cfSubmissionId,
      verdict: 'PENDING',
    });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid submission ID' });
    }
    console.error('Admin rejudge error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// ================================================================
// CF Cookie Management (admin-only)
// ================================================================

// GET /api/admin/cf-status — get current platform CF account status
router.get('/cf-status', async (req, res) => {
  try {
    const admin = await User.findOne({
      role: 'admin',
      codeforcesCookies: { $ne: null },
      codeforcesHandle: { $ne: null },
    });

    if (!admin) {
      return res.json({ linked: false });
    }

    res.json({
      linked: true,
      codeforcesHandle: admin.codeforcesHandle,
      cookiesValidatedAt: admin.cookiesValidatedAt,
      linkedBy: admin.username,
    });
  } catch (err) {
    console.error('CF status error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/admin/cf-cookies — link platform CF account (stores on requesting admin)
router.post('/cf-cookies', async (req, res) => {
  try {
    const { cookies } = req.body;

    if (!cookies || typeof cookies !== 'string' || cookies.trim().length === 0) {
      return res.status(400).json({ error: 'Cookies string is required' });
    }

    // Validate cookies via Python CF service
    let cfResponse;
    try {
      cfResponse = await axios.post(`${CF_SERVICE_URL}/cf/validate-cookies`, {
        cookies: cookies.trim(),
      });
    } catch (err) {
      if (err.response && err.response.status === 401) {
        return res.status(401).json({ error: 'Invalid or expired Codeforces cookies' });
      }
      console.error('CF service error:', err.message);
      return res.status(502).json({ error: 'Codeforces service unavailable' });
    }

    const { handle } = cfResponse.data;

    // Clear any existing admin CF cookies (only one admin account should be linked)
    await User.updateMany(
      { role: 'admin', codeforcesCookies: { $ne: null } },
      { $set: { codeforcesHandle: null, codeforcesCookies: null, cookiesValidatedAt: null } },
    );

    // Encrypt cookies and save to this admin
    const encryptedCookies = encrypt(cookies.trim());

    req.user.codeforcesHandle = handle;
    req.user.codeforcesCookies = encryptedCookies;
    req.user.cookiesValidatedAt = new Date();
    await req.user.save();

    res.json({
      message: 'Platform Codeforces account linked successfully',
      codeforcesHandle: handle,
      cookiesValidatedAt: req.user.cookiesValidatedAt,
    });
  } catch (err) {
    console.error('Admin link CF error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/admin/cf-cookies — unlink platform CF account
router.delete('/cf-cookies', async (req, res) => {
  try {
    // Clear all admin CF cookies
    await User.updateMany(
      { role: 'admin', codeforcesCookies: { $ne: null } },
      { $set: { codeforcesHandle: null, codeforcesCookies: null, cookiesValidatedAt: null } },
    );

    res.json({ message: 'Platform Codeforces account unlinked' });
  } catch (err) {
    console.error('Admin unlink CF error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
