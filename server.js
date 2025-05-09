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
    socket.on('startGame', (room) => {
  const humanPlayers = rooms[room];
  if (!humanPlayers || humanPlayers.length === 0) return;

  const deck = [];
  for (let s of ['S', 'H', 'D', 'C']) {
    for (let r of [2, 3, 4, 5, 6, 7, 8, 9, 10, 'J', 'Q', 'K', 'A']) {
      deck.push({ suit: s, rank: r });
    }
  }
  const shuffledDeck = deck.sort(() => Math.random() - 0.5);

  const totalSeats = 10;
  const aiNames = ["Zeta", "Omega", "Nova", "Botley", "Slick", "Echo", "Mimic", "Zero"];
  const allPlayers = [];

  for (let i = 0; i < totalSeats; i++) {
    if (i < humanPlayers.length) {
      allPlayers.push({
        id: i + 1,
        name: humanPlayers[i].username,
        isHuman: true,
        card: shuffledDeck.pop(),
        chips: 3,
        seatIndex: i
      });
    } else {
      allPlayers.push({
        id: i + 1,
        name: aiNames[i % aiNames.length],
        isHuman: false,
        card: shuffledDeck.pop(),
        chips: 3,
        seatIndex: i
      });
    }
  }

  io.to(room).emit('gameStarted', allPlayers);
});


  const fullPlayerList = [
  ...humanPlayers.map((p, index) => ({
    id: index + 1,
    seatIndex: index,
    name: p.username,
    card: shuffledDeck.pop(),
    chips: 3
  })),
  ...aiPlayers.map((p, index) => ({
    ...p,
    seatIndex: humanPlayers.length + index
  }))
];

  io.to(room).emit('gameStarted', fullPlayerList);
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
