const mongoose = require('mongoose');

const submissionSchema = new mongoose.Schema(
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
    problemId: {
      type: String, // e.g., "4A"
      required: true,
    },
    code: {
      type: String,
      required: true,
    },
    language: {
      type: String, // e.g., "cpp17"
      required: true,
    },
    languageId: {
      type: String, // CF programTypeId e.g., "54"
      required: true,
    },
    submittedAt: {
      type: Date,
      default: Date.now,
    },
    cfSubmissionId: {
      type: Number, // Codeforces submission ID
      default: null,
    },
    verdict: {
      type: String,
      default: 'PENDING',
    },
    testsPassed: {
      type: Number,
      default: 0,
    },
    timeTaken: {
      type: Number, // milliseconds
      default: 0,
    },
    memoryUsed: {
      type: Number, // bytes
      default: 0,
    },
    points: {
      type: Number, // Points awarded
      default: 0,
    },
    penalty: {
      type: Number, // Time penalty in minutes (ICPC)
      default: 0,
    },
  },
  {
    timestamps: true,
  },
);

// Index for fast queries
submissionSchema.index({ contestId: 1, userId: 1, problemId: 1 });
submissionSchema.index({ contestId: 1, problemId: 1 });
submissionSchema.index({ cfSubmissionId: 1 });

module.exports = mongoose.model('Submission', submissionSchema);
