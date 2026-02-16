const { Server } = require('socket.io');
const { FRONTEND_URL } = require('../config/env');

let io;

/**
 * Initialize Socket.io on the HTTP server.
 * Call this once from server.js after creating the HTTP server.
 */
function init(server) {
  io = new Server(server, {
    cors: {
      origin: FRONTEND_URL || 'http://localhost:3000',
      credentials: true,
    },
  });

  io.on('connection', (socket) => {
    console.log(`[Socket.io] Client connected: ${socket.id}`);

    socket.on('join-contest', (contestId) => {
      socket.join(`contest-${contestId}`);
      console.log(`[Socket.io] ${socket.id} joined contest-${contestId}`);
    });

    socket.on('leave-contest', (contestId) => {
      socket.leave(`contest-${contestId}`);
      console.log(`[Socket.io] ${socket.id} left contest-${contestId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.io] Client disconnected: ${socket.id}`);
    });
  });

  console.log('✓ Socket.io initialized');
}

/**
 * Emit a submission verdict update to all clients in a contest room.
 */
function emitSubmissionUpdate(contestId, submission) {
  if (io) {
    io.to(`contest-${contestId}`).emit('submission-update', {
      _id: submission._id,
      problemId: submission.problemId,
      userId: submission.userId,
      verdict: submission.verdict,
      testsPassed: submission.testsPassed,
      timeTaken: submission.timeTaken,
      memoryUsed: submission.memoryUsed,
      submittedAt: submission.submittedAt,
    });
  }
}

/**
 * Emit updated standings to all clients in a contest room.
 */
function emitStandingsUpdate(contestId, standings) {
  if (io) {
    io.to(`contest-${contestId}`).emit('standings-update', standings);
  }
}

/**
 * Get the io instance (for advanced use / testing).
 */
function getIO() {
  return io;
}

module.exports = { init, emitSubmissionUpdate, emitStandingsUpdate, getIO };
