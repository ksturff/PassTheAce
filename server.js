const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public')); // serve your frontend

io.on('connection', (socket) => {
  console.log(`🟢 Player connected: ${socket.id}`);

  socket.on('disconnect', () => {
    console.log(`🔴 Player disconnected: ${socket.id}`);
  });
});

// Use Render's assigned port or fall back to 3000 locally
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
