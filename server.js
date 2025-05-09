const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {}; // Tracks players per room
const gameStarted = {}; // Tracks if the game has started for each room

io.on('connection', (socket) => {
  console.log(`🟢 Player connected: ${socket.id}`);

  socket.on('join', ({ username, room }) => {
    socket.join(room);
    console.log(`👤 ${username} joined room: ${room}`);

    if (!rooms[room]) rooms[room] = [];
    rooms[room].push({ id: socket.id, username });

    socket.emit('welcome', `Welcome ${username}!`);
    io.to(room).emit('playerList', rooms[room]);
  });

  socket.on('startGame', (room) => {
    if (gameStarted[room]) return; // ✅ Prevent duplicate starts
    const humanPlayers = rooms[room];
    if (!humanPlayers || humanPlayers.length === 0) return;

    gameStarted[room] = true; // ✅ Mark game as started

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

  socket.on('disconnect', () => {
    console.log(`🔴 Player disconnected: ${socket.id}`);
    for (const room in rooms) {
      const index = rooms[room].findIndex(p => p.id === socket.id);
      if (index !== -1) {
        rooms[room].splice(index, 1);
        io.to(room).emit('playerList', rooms[room]);
      }
      if (rooms[room].length === 0) {
        delete rooms[room];
        delete gameStarted[room]; // ✅ Reset game state if room is empty
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
