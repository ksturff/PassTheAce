const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const socketManager = require('./socketManager');

const server = http.createServer((req, res) => {
  if (req.url === '/' || req.url === '/lobby.html') {
    fs.readFile(__dirname + '/../lobby.html', (err, data) => {
      if (err) {
        res.writeHead(500);
        res.end('Error loading lobby.html');
        return;
      }
      res.writeHead(200, { 'Content-Type': 'text/html' });
      res.end(data);
    });
  } else {
    res.writeHead(404);
    res.end('Not Found');
  }
});

const io = new Server(server);
socketManager(io);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT} at ${new Date().toLocaleString('en-US', { timeZone: 'America/New_York' })}`);
});