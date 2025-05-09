const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {};

io.on('connection', (socket) => {
  console.log(`🟢 Player connected: ${socket.id}`);

  socket.on("joinRoom", ({ name, room }) => {
    socket.join(room);

    if (!rooms[room]) {
      rooms[room] = [];
    }

    rooms[room].push({ id: socket.id, name });
    console.log(`👥 ${name} joined room ${room}`);

    // Update player list for everyone in the room
    io.to(room).emit("playerList", rooms[room]);

    // Send welcome to the joining client
    socket.emit("welcome", `Welcome to room ${room}, ${name}`);
  });

  socket.on('disconnect', () => {
    // Remove player from all rooms they were in
    for (const room in rooms) {
      rooms[room] = rooms[room].filter(p => p.id !== socket.id);
      io.to(room).emit("playerList", rooms[room]);
    }
    console.log(`🔴 Player disconnected: ${socket.id}`);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
