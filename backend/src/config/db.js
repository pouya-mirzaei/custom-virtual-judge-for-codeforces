const mongoose = require('mongoose');
const { MONGODB_URI } = require('./env');

async function connectDB() {
  try {
    await mongoose.connect(MONGODB_URI);
    console.log(`✓ MongoDB connected: ${MONGODB_URI}`);
  } catch (err) {
    console.error('✗ MongoDB connection error:', err.message);
    process.exit(1);
  }

  mongoose.connection.on('error', (err) => {
    console.error('MongoDB error:', err.message);
  });

  mongoose.connection.on('disconnected', () => {
    console.warn('MongoDB disconnected');
  });
}

module.exports = connectDB;
