const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public')); // serve your frontend

// 🔹 Keep track of connected players
const players = [];

io.on('connection', (socket) => {
  console.log(`🟢 Player connected: ${socket.id}`);

  socket.on('join', (name) => {
    const player = { id: socket.id, name };
    players.push(player);

    // 🔄 Broadcast updated player list to all clients
    io.emit('playerList', players);
    console.log(`👤 ${name} joined the game.`);
  });

  socket.on('disconnect', () => {
    const index = players.findIndex(p => p.id === socket.id);
    if (index !== -1) {
      console.log(`🔴 ${players[index].name} disconnected`);
      players.splice(index, 1);
      io.emit('playerList', players); // update everyone
    } else {
      console.log(`🔴 Player disconnected: ${socket.id}`);
    }
  });
});

// Use Render's assigned port or fall back to 3000 locally
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
