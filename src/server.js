const express = require('express');
const { Server } = require('socket.io');
const path = require('path');
const socketManager = require('./socketManager');

const app = express();
const server = require('http').createServer(app);

const io = new Server(server, {
  cors: { origin: '*', methods: ['GET', 'POST'] }
});

// Static files
app.use('/assets', express.static(path.join(__dirname, '..', 'public', 'assets'))); // explicit
app.use(express.static(path.join(__dirname, '..', 'public'))); // index.html, etc.

// Health check for Render
app.get('/health', (req, res) => res.type('text').send('ok'));

// Root → index.html
app.get('/', (req, res) => {
  const indexPath = path.join(__dirname, '..', 'public', 'index.html');
  res.sendFile(indexPath);
});

// Wire sockets
socketManager(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
