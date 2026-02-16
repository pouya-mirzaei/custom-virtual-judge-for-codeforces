const mongoose = require('mongoose');

const problemStandingSchema = new mongoose.Schema(
  {
    problemId: { type: String, required: true },
    attempts: { type: Number, default: 0 },
    solved: { type: Boolean, default: false },
    points: { type: Number, default: 0 },
    penalty: { type: Number, default: 0 }, // Minutes
    solveTime: { type: Number, default: 0 }, // Minutes from contest start
  },
  { _id: false },
);

const standingSchema = new mongoose.Schema(
  {
    contestId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Contest',
      required: true,
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    rank: {
      type: Number,
      default: 0,
    },
    totalPoints: {
      type: Number,
      default: 0,
    },
    totalPenalty: {
      type: Number, // ICPC penalty time in minutes
      default: 0,
    },
    problemsSolved: {
      type: Number,
      default: 0,
    },
    problems: [problemStandingSchema],
    lastUpdated: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

// Compound unique index — one standing per user per contest
standingSchema.index({ contestId: 1, userId: 1 }, { unique: true });
// Fast lookup for leaderboard sorted by rank
standingSchema.index({ contestId: 1, rank: 1 });

module.exports = mongoose.model('Standing', standingSchema);
