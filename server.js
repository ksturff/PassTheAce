const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public')); // Serve frontend from /public

const rooms = {}; // Track players per room

io.on('connection', (socket) => {
  console.log(`🟢 Player connected: ${socket.id}`);

  socket.on('join', ({ username, room }) => {
    socket.join(room);
    console.log(`👤 ${username} joined room: ${room}`);

    // Track player
    if (!rooms[room]) rooms[room] = [];
    rooms[room].push({ id: socket.id, username });

    // Send welcome and updated player list
    socket.emit('welcome', `Welcome ${username}!`);
    io.to(room).emit('playerList', rooms[room]);
  });

  socket.on('startGame', (room) => {
    const players = rooms[room];
    if (!players || players.length === 0) return;

    // Create a shuffled deck
    const deck = [];
    for (let s of ['S', 'H', 'D', 'C']) {
      for (let r of [2, 3, 4, 5, 6, 7, 8, 9, 10, 'J', 'Q', 'K', 'A']) {
        deck.push({ suit: s, rank: r });
      }
    }
    const shuffledDeck = deck.sort(() => Math.random() - 0.5);

    // Assign 1 card to each player
    const playerCards = players.map((p, index) => ({
      name: p.username,
      id: index + 1,
      card: shuffledDeck.pop(),
      chips: 3
    }));

    // Send the cards and players to all clients in the room
    io.to(room).emit('gameStarted', playerCards);
  });

  socket.on('disconnect', () => {
    console.log(`🔴 Player disconnected: ${socket.id}`);

    // Remove from all rooms
    for (const room in rooms) {
      const index = rooms[room].findIndex(p => p.id === socket.id);
      if (index !== -1) {
        rooms[room].splice(index, 1);
        io.to(room).emit('playerList', rooms[room]);
      }

      // If room is empty, delete it
      if (rooms[room].length === 0) {
        delete rooms[room];
      }
    }
  });
});

// Use Render's assigned port or default to 3000 locally
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
