const express = require('express');
const { Server } = require('socket.io');
const path = require('path');
const socketManager = require('./socketManager');

const app = express();
const server = require('http').createServer(app);
const io = new Server(server);

// Serve static files from the public directory (including assets)
app.use(express.static(path.join(__dirname, '..', '..', 'public')));

// Fallback to index.html for root route, pointing to the correct location
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '..', '..', 'public', 'assets', 'index.html'));
});

socketManager(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} at ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}`);
});