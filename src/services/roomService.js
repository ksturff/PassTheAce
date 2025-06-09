const { v4: uuidv4 } = require('uuid');

const rooms = new Map();

function initRoom(code) {
  if (!rooms.has(code)) {
    rooms.set(code, { players: [], gameState: null });
  }
  return rooms.get(code);
}

function joinRoom(socket, username, roomCode, io) {
  socket.join(roomCode);
  const room = initRoom(roomCode);
  if (room.players.length >= 10) {
    socket.emit('errorMessage', 'Room is full!');
    return;
  }
  const player = {
    id: socket.id,
    name: username,
    chips: 5,
    eliminated: false,
    seatIndex: room.players.length
  };
  room.players.push(player);
  io.to(roomCode).emit('playerList', room.players);
  io.emit('lobbyUpdate', getLobbyState()); // Broadcast lobby update
}

function removePlayer(socketId, io) {
  for (const [code, room] of rooms.entries()) {
    const idx = room.players.findIndex(p => p.id === socketId);
    if (idx !== -1) {
      room.players.splice(idx, 1);
      io.to(code).emit('playerList', room.players);
      io.emit('lobbyUpdate', getLobbyState()); // Update lobby
      if (room.players.length === 0) rooms.delete(code);
    }
  }
}

function getLobbyState() {
  return Array.from(rooms.entries()).map(([code, room]) => ({
    roomCode: code,
    playerCount: room.players.length,
    maxPlayers: 10,
    status: room.gameState ? 'In Progress' : 'Waiting'
  }));
}

module.exports = { rooms, initRoom, joinRoom, removePlayer, getLobbyState };