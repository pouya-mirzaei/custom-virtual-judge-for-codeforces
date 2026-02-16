const express = require('express');
const Standing = require('../models/Standing');
const Contest = require('../models/Contest');
const { auth } = require('../middleware/auth');

const router = express.Router();

// GET /api/standings/:contestId — get contest standings
router.get('/:contestId', auth, async (req, res) => {
  try {
    const contest = await Contest.findById(req.params.contestId);
    if (!contest) {
      return res.status(404).json({ error: 'Contest not found' });
    }

    const standings = await Standing.find({ contestId: req.params.contestId }).sort({ rank: 1 }).populate('userId', 'username');

    res.json({
      contestId: contest._id,
      contestTitle: contest.title,
      scoringType: contest.scoringType,
      problems: contest.problems.map((p) => ({
        problemId: p.problemId,
        order: p.order,
        problemName: p.problemName,
      })),
      standings,
    });
  } catch (err) {
    if (err.name === 'CastError') {
      return res.status(400).json({ error: 'Invalid contest ID' });
    }
    console.error('Get standings error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
