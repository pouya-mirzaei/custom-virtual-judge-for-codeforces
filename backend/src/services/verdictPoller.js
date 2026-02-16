const axios = require('axios');
const Submission = require('../models/Submission');
const { CF_SERVICE_URL } = require('../config/env');
const { updateStandings } = require('./scoringService');
const { emitSubmissionUpdate, emitStandingsUpdate } = require('./socketService');

const MAX_ATTEMPTS = 60; // 60 x 5s = 5 minutes max
const POLL_INTERVAL = 5000; // 5 seconds

// Track active polls for debugging/testing
const activePolls = new Map();

/**
 * Poll CF API for verdict updates.
 * Runs in background after submission — do NOT await this.
 */
async function pollVerdict(submissionDbId, cfHandle, cfSubmissionId, contestId) {
  const key = `${cfHandle}:${cfSubmissionId}`;
  activePolls.set(key, { submissionDbId, startedAt: new Date(), attempts: 0 });

  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));

    activePolls.get(key).attempts = i + 1;

    try {
      const res = await axios.get(`${CF_SERVICE_URL}/cf/verdict/${cfHandle}/${cfSubmissionId}`);

      const { verdict, testsPassed, timeMs, memoryBytes } = res.data;

      console.log(`[VerdictPoller] ${cfSubmissionId} attempt ${i + 1}: ${verdict}`);

      if (verdict && verdict !== 'TESTING') {
        // Final verdict received — update the submission
        await Submission.findByIdAndUpdate(submissionDbId, {
          verdict,
          testsPassed: testsPassed || 0,
          timeTaken: timeMs || 0,
          memoryUsed: memoryBytes || 0,
        });

        console.log(`[VerdictPoller] ${cfSubmissionId} final verdict: ${verdict}`);

        // Update standings
        try {
          const standings = await updateStandings(contestId);
          console.log(`[VerdictPoller] Standings updated for contest ${contestId}`);

          // Emit real-time events
          const updatedSub = await Submission.findById(submissionDbId);
          emitSubmissionUpdate(contestId, updatedSub);
          emitStandingsUpdate(contestId, standings);
        } catch (standingsErr) {
          console.error(`[VerdictPoller] Standings update failed:`, standingsErr.message);
        }

        activePolls.delete(key);
        return;
      }
    } catch (error) {
      console.error(`[VerdictPoller] Error polling ${cfSubmissionId} (attempt ${i + 1}):`, error.message);
    }
  }

  // Timed out — mark as VERDICT_TIMEOUT
  await Submission.findByIdAndUpdate(submissionDbId, {
    verdict: 'VERDICT_TIMEOUT',
  });

  console.warn(`[VerdictPoller] ${cfSubmissionId} timed out after ${MAX_ATTEMPTS} attempts`);

  activePolls.delete(key);
}

/**
 * Get count of active polls (for health/debug).
 */
function getActivePollCount() {
  return activePolls.size;
}

module.exports = { pollVerdict, getActivePollCount };
