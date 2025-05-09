const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {}; // Track players by room

io.on('connection', (socket) => {
  console.log(`🟢 Player connected: ${socket.id}`);

  socket.on('join', ({ name, room }) => {
    socket.join(room);
    console.log(`👤 ${name} joined room: ${room}`);

    // Add player to the room list
    if (!rooms[room]) rooms[room] = [];
    rooms[room].push({ id: socket.id, name });

    // Broadcast updated player list to room
    io.to(room).emit('playerList', rooms[room]);
  });

  socket.on('disconnect', () => {
    // Remove player from all rooms
    for (const room in rooms) {
      rooms[room] = rooms[room].filter(p => p.id !== socket.id);
      io.to(room).emit('playerList', rooms[room]);
    }
    console.log(`🔴 Player disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
