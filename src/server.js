const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');
const socketManager = require('./socketManager');

const rootDir = path.resolve(__dirname, '..');
const filePath = path.join(rootDir, 'index.html');
console.log('Resolved index.html path:', filePath); // Debug the exact path

const server = http.createServer((req, res) => {
  console.log('Request URL:', req.url); // Debug the requested URL
  if (req.url === '/' || req.url === '/index.html') {
    fs.readFile(filePath, (err, data) => {
      if (err) {
        console.error('File read error:', err.message);
        res.writeHead(500);
        res.end('Error loading index.html: ' + err.message);
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