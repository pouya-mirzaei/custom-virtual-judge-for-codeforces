const mongoose = require('mongoose');

const problemSchema = new mongoose.Schema(
  {
    problemId: { type: String, required: true }, // e.g., "4A", "1234B"
    contestId: { type: Number, required: true }, // CF contest ID
    problemIndex: { type: String, required: true }, // CF problem index ("A")
    problemName: { type: String, default: '' }, // Cached name
    points: { type: Number, default: 1 }, // Max points
    order: { type: String, required: true }, // Display order: "A", "B", "C"
    customStatement: { type: String, default: '' }, // Custom problem statement (markdown)
  },
  { _id: false },
);

const contestSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      required: true,
      trim: true,
      minlength: 3,
      maxlength: 200,
    },
    description: {
      type: String,
      default: '',
      maxlength: 5000,
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    startTime: {
      type: Date,
      required: true,
    },
    duration: {
      type: Number, // in minutes
      required: true,
      min: 1,
    },
    endTime: {
      type: Date, // computed: startTime + duration
    },
    problems: [problemSchema],
    participants: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    scoringType: {
      type: String,
      enum: ['ICPC', 'IOI'],
      default: 'ICPC',
    },
    penaltyTime: {
      type: Number, // ICPC: minutes per wrong submission
      default: 20,
    },
    freezeTime: {
      type: Number, // minutes before end to freeze leaderboard
      default: 0,
    },
    visibility: {
      type: String,
      enum: ['public', 'private', 'password'],
      default: 'public',
    },
    password: {
      type: String, // hashed if password-protected
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

// Auto-compute endTime before saving
contestSchema.pre('save', function (next) {
  if (this.isModified('startTime') || this.isModified('duration')) {
    this.endTime = new Date(this.startTime.getTime() + this.duration * 60000);
  }
  next();
});

// Auto-compute status based on current time
contestSchema.methods.computeStatus = function () {
  const now = new Date();
  if (now < this.startTime) return 'UPCOMING';
  if (now >= this.startTime && now < this.endTime) return 'RUNNING';
  return 'ENDED';
};

// Remove password from JSON
contestSchema.methods.toJSON = function () {
  const contest = this.toObject();
  delete contest.password;
  delete contest.__v;
  return contest;
};

module.exports = mongoose.model('Contest', contestSchema);
