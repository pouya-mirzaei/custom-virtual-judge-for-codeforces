const Submission = require('../models/Submission');
const Contest = require('../models/Contest');
const Standing = require('../models/Standing');

/**
 * Calculate ICPC-style score for a user in a contest.
 * - 1 point per solved problem
 * - Penalty = solveTime + (failedAttempts * penaltyTime)
 * - Only first AC counts, subsequent submissions ignored
 */
async function calculateICPCScore(contestId, userId) {
  const submissions = await Submission.find({
    contestId,
    userId,
    verdict: { $nin: ['PENDING', 'TESTING'] },
  }).sort({ submittedAt: 1 });

  const contest = await Contest.findById(contestId);
  if (!contest) return { problemsSolved: 0, totalPenalty: 0, problems: {} };

  const problems = {};

  for (const sub of submissions) {
    if (!problems[sub.problemId]) {
      problems[sub.problemId] = {
        problemId: sub.problemId,
        attempts: 0,
        solved: false,
        points: 0,
        penalty: 0,
        solveTime: 0,
      };
    }

    const prob = problems[sub.problemId];
    if (prob.solved) continue; // Already solved, skip

    prob.attempts++;

    if (sub.verdict === 'OK') {
      prob.solved = true;
      prob.points = 1;
      const minutesFromStart = (sub.submittedAt - contest.startTime) / 60000;
      prob.solveTime = Math.floor(minutesFromStart);
      prob.penalty = prob.solveTime + (prob.attempts - 1) * contest.penaltyTime;
    }
  }

  let totalSolved = 0;
  let totalPenalty = 0;

  for (const prob of Object.values(problems)) {
    if (prob.solved) {
      totalSolved++;
      totalPenalty += prob.penalty;
    }
  }

  return { problemsSolved: totalSolved, totalPenalty, problems };
}

/**
 * Recalculate and save standings for an entire contest.
 * Called after each verdict update.
 */
async function updateStandings(contestId) {
  const contest = await Contest.findById(contestId);
  if (!contest) return [];

  const allParticipants = contest.participants;

  // Calculate score for every participant
  const standings = [];
  for (const uid of allParticipants) {
    const score = contest.scoringType === 'ICPC' ? await calculateICPCScore(contestId, uid) : await calculateICPCScore(contestId, uid); // TODO: IOI scoring in future

    standings.push({
      userId: uid,
      problemsSolved: score.problemsSolved,
      totalPenalty: score.totalPenalty,
      totalPoints: score.problemsSolved, // ICPC: points = problems solved
      problems: Object.values(score.problems),
    });
  }

  // Sort: more solved first, then less penalty
  standings.sort((a, b) => {
    if (a.problemsSolved !== b.problemsSolved) return b.problemsSolved - a.problemsSolved;
    return a.totalPenalty - b.totalPenalty;
  });

  // Assign ranks and upsert
  for (let i = 0; i < standings.length; i++) {
    standings[i].rank = i + 1;

    await Standing.findOneAndUpdate(
      { contestId, userId: standings[i].userId },
      {
        ...standings[i],
        contestId,
        lastUpdated: new Date(),
      },
      { upsert: true, new: true },
    );
  }

  return standings;
}

module.exports = { calculateICPCScore, updateStandings };
