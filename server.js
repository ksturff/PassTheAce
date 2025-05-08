const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public')); // this will serve your frontend later

io.on('connection', (socket) => {
  console.log(`🟢 Player connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`🔴 Player disconnected: ${socket.id}`);
  });
});

const PORT = 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running at http://localhost:${PORT}`);
});

