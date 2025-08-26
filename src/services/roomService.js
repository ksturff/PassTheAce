// room.js
const rooms = new Map();

/** Clamp and default the options that come from the client UI */
function normalizeOptions(options = {}) {
  const seatsNum = Number.parseInt(options.seats, 10);
  const seats = Number.isFinite(seatsNum) ? Math.max(2, Math.min(10, seatsNum)) : 8;

  return {
    mode:  options.mode  || 'Classic',
    seats: seats,
    pace:  options.pace  || 'Regular',
    buyIn: options.buyIn || '5 Chips',
  };
}

/** Create room if missing; if options provided, (re)apply metadata */
function initRoom(code, options) {
  let room = rooms.get(code);
  if (!room) {
    const opts = normalizeOptions(options);
    room = {
      code,
      players: [],
      gameState: null,
      createdAt: Date.now(),
      options: opts,
      maxPlayers: opts.seats,
    };
    rooms.set(code, room);
  } else if (options) {
    const opts = normalizeOptions({ ...room.options, ...options });
    room.options = opts;
    room.maxPlayers = opts.seats;
  }
  return room;
}

/** Add a player (respects room.maxPlayers) */
function joinRoom(socket, username, roomCode, io) {
  const room = initRoom(roomCode); // ensure it exists
  if (room.players.length >= (room.maxPlayers || 10)) {
    socket.emit('errorMessage', 'Room is full!');
    return;
  }

  socket.join(roomCode);
  const player = {
    id: socket.id,
    name: username,
    chips: 5,
    eliminated: false,
    seatIndex: room.players.length,
  };
  room.players.push(player);

  io.to(roomCode).emit('playerList', room.players);
  io.emit('lobbyUpdate', getAllRooms());
}

/** Remove player from whichever room they’re in */
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

/** Build data for the lobby list */
function getAllRooms() {
  return Array.from(rooms.values()).map(room => {
    const full = room.players.length >= (room.maxPlayers || 10);
    return {
      roomCode: room.code,
      playerCount: room.players.length,
      maxPlayers: room.maxPlayers || 10,
      status: room.gameState ? 'In Progress' : (full ? 'Full' : 'Waiting'),
      // expose new fields for the polished lobby
      mode: room.options?.mode,
      seats: room.options?.seats,
      pace: room.options?.pace,
      buyIn: room.options?.buyIn,
    };
  });
}

module.exports = { rooms, initRoom, joinRoom, removePlayer, getAllRooms };
