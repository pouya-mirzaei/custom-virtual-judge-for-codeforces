const http = require('http');
const app = require('./app');
const connectDB = require('./config/db');
const { PORT } = require('./config/env');
const socketService = require('./services/socketService');

async function start() {
  // Connect to MongoDB
  await connectDB();

  // Create HTTP server (shared with Socket.io)
  const server = http.createServer(app);

  // Initialize Socket.io
  socketService.init(server);

  server.listen(PORT, () => {
    console.log(`✓ Backend server running on http://localhost:${PORT}`);
  });
}

start().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
