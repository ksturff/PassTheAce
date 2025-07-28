const express = require('express');
const { Server } = require('socket.io');
const path = require('path');
const socketManager = require('./socketManager');

const app = express();
const server = require('http').createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // Allow all origins for testing; restrict in production
    methods: ["GET", "POST"]
  }
});

app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, '..', 'public', 'index.html');
  console.log(`Attempting to serve: ${indexPath}`); // Debug log
  res.sendFile(indexPath, (err) => {
    if (err) {
      console.error(`Failed to load index.html: ${err.message}`);
      res.status(500).send('Server error: Index file not found');
    }
  });
});

socketManager(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} at ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}`);
}).on('error', (err) => {
  console.error('Server error:', err.message);
});