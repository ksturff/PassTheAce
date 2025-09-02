const express = require('express');
const { Server } = require('socket.io');
const path = require('path');
const http = require('http');
const socketManager = require('./socketManager');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// ---- Absolute path to /public
const PUBLIC_DIR = path.resolve(__dirname, '..', 'public');

// Serve /assets with cache (many images at once)
app.use('/assets', express.static(path.join(PUBLIC_DIR, 'assets'), { maxAge: '1d', etag: true }));

// Socket.io client script and any other static (like /index.html)
app.use(express.static(PUBLIC_DIR, { index: false }));

// Health check (useful when debugging 502s)
app.get('/health', (_req, res) => res.status(200).send('ok'));

// Root: serve index.html
app.get('/', (_req, res, next) => {
  const indexPath = path.join(PUBLIC_DIR, 'index.html');
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error('Failed to send index.html:', err.message);
      next(err);
    }
  });
});

// Wire sockets
socketManager(io);

// Start
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server listening on ${PORT}. PUBLIC_DIR=${PUBLIC_DIR}`);
});
