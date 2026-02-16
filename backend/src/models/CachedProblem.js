const mongoose = require('mongoose');

const sampleSchema = new mongoose.Schema(
  {
    input: { type: String, required: true },
    output: { type: String, required: true },
  },
  { _id: false },
);

const cachedProblemSchema = new mongoose.Schema(
  {
    problemId: {
      type: String,
      required: true,
      unique: true, // e.g., "4A", "1234B"
    },
    contestId: {
      type: Number,
      required: true,
    },
    problemIndex: {
      type: String,
      required: true,
    },
    name: {
      type: String,
      default: '',
    },
    timeLimit: {
      type: String,
      default: '',
    },
    memoryLimit: {
      type: String,
      default: '',
    },
    htmlContent: {
      type: String, // Full problem statement HTML
      default: '',
    },
    samples: [sampleSchema],
    rating: {
      type: Number,
      default: null,
    },
    tags: [String],
    fetchedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

// TTL: consider problem stale after 24 hours
cachedProblemSchema.methods.isStale = function (maxAgeMs = 24 * 60 * 60 * 1000) {
  return Date.now() - this.fetchedAt.getTime() > maxAgeMs;
};

module.exports = mongoose.model('CachedProblem', cachedProblemSchema);
