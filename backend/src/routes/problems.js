const express = require('express');
const axios = require('axios');
const CachedProblem = require('../models/CachedProblem');
const { auth } = require('../middleware/auth');
const { CF_SERVICE_URL } = require('../config/env');

const router = express.Router();

// GET /api/problems/:contestId/:problemIndex
// Fetches problem from cache or proxies to Python CF service
router.get('/:contestId/:problemIndex', auth, async (req, res) => {
  try {
    const { contestId, problemIndex } = req.params;
    const problemId = `${contestId}${problemIndex.toUpperCase()}`;

    // Check cache first
    let cached = await CachedProblem.findOne({ problemId });

    if (cached && !cached.isStale()) {
      return res.json(cached);
    }

    // Fetch from Python CF service
    let cfResponse;
    try {
      cfResponse = await axios.get(`${CF_SERVICE_URL}/cf/problem/${contestId}/${problemIndex.toUpperCase()}`);
    } catch (err) {
      if (err.response && err.response.status === 404) {
        return res.status(404).json({ error: 'Problem not found on Codeforces' });
      }
      console.error('CF service error:', err.message);
      return res.status(502).json({ error: 'Codeforces service unavailable' });
    }

    const data = cfResponse.data;

    // Upsert into cache
    cached = await CachedProblem.findOneAndUpdate(
      { problemId },
      {
        problemId,
        contestId: parseInt(contestId),
        problemIndex: problemIndex.toUpperCase(),
        name: data.name || '',
        timeLimit: data.timeLimit || '',
        memoryLimit: data.memoryLimit || '',
        htmlContent: data.statementHtml || '',
        samples: (data.sampleTests || []).map((s) => ({
          input: s.input,
          output: s.output,
        })),
        rating: data.rating || null,
        tags: data.tags || [],
        fetchedAt: new Date(),
      },
      { upsert: true, new: true },
    );

    res.json(cached);
  } catch (err) {
    console.error('Fetch problem error:', err);
    res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;
