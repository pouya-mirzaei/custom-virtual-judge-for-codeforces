const express = require('express');
const bcrypt = require('bcryptjs');
const Contest = require('../models/Contest');
const { auth, adminOnly } = require('../middleware/auth');
const { contestValidation, validate } = require('../utils/validators');

const router = express.Router();

// GET /api/contests — list all contests (public)
router.get('/', async (req, res) => {
  try {
    const contests = await Contest.find().select('-participants').sort({ startTime: -1 }).populate('createdBy', 'username');

    // Update status on the fly
    const result = contests.map((c) => {
      const obj = c.toJSON();
      obj.status = c.computeStatus();
      return obj;
    });

    res.json(result);
  } catch (err) {
    console.error('List contests error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /api/contests/:id — get single contest
router.get('/:id', async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.id).populate('createdBy', 'username').populate('participants', 'username');

    if (!contest) {
      return res.status(404).json({ error: 'Contest not found' });
    }

    const obj = contest.toJSON();
    obj.status = contest.computeStatus();
    res.json(obj);
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(404).json({ error: 'Contest not found' });
    }
    console.error('Get contest error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/contests — create contest (admin only)
router.post('/', auth, adminOnly, contestValidation, validate, async (req, res) => {
  try {
    const { title, description, startTime, duration, problems, scoringType, penaltyTime, freezeTime, visibility, password } = req.body;

    // Validate required fields
    if (!title || !startTime || !duration) {
      return res.status(400).json({ error: 'Title, startTime, and duration are required' });
    }

    if (!problems || !Array.isArray(problems) || problems.length === 0) {
      return res.status(400).json({ error: 'At least one problem is required' });
    }

    // Validate each problem
    for (const p of problems) {
      if (!p.contestId || !p.problemIndex || !p.order) {
        return res.status(400).json({ error: 'Each problem needs contestId, problemIndex, and order' });
      }
      p.problemId = `${p.contestId}${p.problemIndex}`;
    }

    // Hash password if password-protected
    let hashedPassword = null;
    if (visibility === 'password') {
      if (!password) {
        return res.status(400).json({ error: 'Password is required for password-protected contests' });
      }
      hashedPassword = await bcrypt.hash(password, 10);
    }

    const contest = new Contest({
      title,
      description: description || '',
      createdBy: req.userId,
      startTime: new Date(startTime),
      duration,
      problems,
      scoringType: scoringType || 'ICPC',
      penaltyTime: penaltyTime ?? 20,
      freezeTime: freezeTime ?? 0,
      visibility: visibility || 'public',
      password: hashedPassword,
    });

    await contest.save();

    res.status(201).json(contest.toJSON());
  } catch (err) {
    console.error('Create contest error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// PUT /api/contests/:id — update contest (admin only)
router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.id);
    if (!contest) {
      return res.status(404).json({ error: 'Contest not found' });
    }

    const { title, description, startTime, duration, problems, scoringType, penaltyTime, freezeTime, visibility, password } = req.body;

    if (title) contest.title = title;
    if (description !== undefined) contest.description = description;
    if (startTime) contest.startTime = new Date(startTime);
    if (duration) contest.duration = duration;
    if (scoringType) contest.scoringType = scoringType;
    if (penaltyTime !== undefined) contest.penaltyTime = penaltyTime;
    if (freezeTime !== undefined) contest.freezeTime = freezeTime;
    if (visibility) contest.visibility = visibility;

    if (problems && Array.isArray(problems)) {
      for (const p of problems) {
        if (!p.contestId || !p.problemIndex || !p.order) {
          return res.status(400).json({ error: 'Each problem needs contestId, problemIndex, and order' });
        }
        p.problemId = `${p.contestId}${p.problemIndex}`;
      }
      contest.problems = problems;
    }

    // Handle password change
    if (visibility === 'password' && password) {
      contest.password = await bcrypt.hash(password, 10);
    } else if (visibility && visibility !== 'password') {
      contest.password = null;
    }

    await contest.save();
    res.json(contest.toJSON());
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(404).json({ error: 'Contest not found' });
    }
    console.error('Update contest error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// DELETE /api/contests/:id — delete contest (admin only)
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const contest = await Contest.findByIdAndDelete(req.params.id);
    if (!contest) {
      return res.status(404).json({ error: 'Contest not found' });
    }
    res.json({ message: 'Contest deleted' });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(404).json({ error: 'Contest not found' });
    }
    console.error('Delete contest error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// POST /api/contests/:id/join — join a contest (authenticated)
router.post('/:id/join', auth, async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.id);
    if (!contest) {
      return res.status(404).json({ error: 'Contest not found' });
    }

    // Check password for password-protected contests
    if (contest.visibility === 'password') {
      const { password } = req.body;
      if (!password) {
        return res.status(400).json({ error: 'Password is required to join this contest' });
      }
      const isMatch = await bcrypt.compare(password, contest.password);
      if (!isMatch) {
        return res.status(401).json({ error: 'Incorrect contest password' });
      }
    }

    // Check if already joined
    if (contest.participants.some((p) => p.toString() === req.userId.toString())) {
      return res.status(409).json({ error: 'Already joined this contest' });
    }

    contest.participants.push(req.userId);
    await contest.save();

    res.json({ message: 'Joined contest successfully' });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(404).json({ error: 'Contest not found' });
    }
    console.error('Join contest error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
