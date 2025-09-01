const { v4: uuidv4 } = require('uuid');

const rooms = new Map();

function initRoom(code, options = null) {
  if (!rooms.has(code)) {
    rooms.set(code, { players: [], gameState: null, options: options || {}, createdAt: Date.now() });
  } else if (options) {
    rooms.get(code).options = Object.assign({}, rooms.get(code).options, options);
  }
  return rooms.get(code);
}

function getRoom(code) {
  return rooms.get(code);
}

function setRoomOptions(code, options) {
  const room = initRoom(code);
  room.options = Object.assign({}, room.options || {}, options || {});
  return room;
}

function joinRoom(socket, username, roomCode, io) {
  socket.join(roomCode);
  const room = initRoom(roomCode);
  const limit = room.options?.seats || 10;
  if (room.players.length >= limit) {
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
  io.emit('lobbyUpdate', getAllRooms());
}

function removePlayer(socketId, io) {
  for (const [code, room] of rooms.entries()) {
    const idx = room.players.findIndex(p => p.id === socketId);
    if (idx !== -1) {
      room.players.splice(idx, 1);
      io.to(code).emit('playerList', room.players);
      io.emit('lobbyUpdate', getAllRooms());
      if (room.players.length === 0) rooms.delete(code);
    }
  }
}

function getAllRooms() {
  return Array.from(rooms.entries()).map(([code, room]) => ({
    roomCode: code,
    playerCount: room.players.length,
    maxPlayers: room.options?.seats || 10,
    status: room.gameState ? 'In Progress' : 'Waiting',
    mode: room.options?.mode || 'Classic',
    seats: room.options?.seats || 10,
    buyIn: room.options?.buyIn || '5 Chips'
  }));
}

module.exports = {
  rooms,
  initRoom,
  getRoom,              // <- added
  joinRoom,
  removePlayer,
  getAllRooms,
  setRoomOptions
};
