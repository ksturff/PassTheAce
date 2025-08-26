// services/roomService.js
const rooms = new Map();

/** sanitize & default the lobby options */
function normalizeOptions(options = {}) {
  const seatsNum = parseInt(options.seats, 10);
  const seats = Number.isFinite(seatsNum) ? Math.max(2, Math.min(10, seatsNum)) : 8;
  return {
    mode:  options.mode  || 'Classic',
    seats: seats,
    pace:  options.pace  || 'Regular',
    buyIn: options.buyIn || '5 Chips'
  };
}

function getRoom(code) {
  return rooms.get(code) || null;
}

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
      maxPlayers: opts.seats
    };
    rooms.set(code, room);
  } else if (options) {
    const merged = normalizeOptions({ ...room.options, ...options });
    room.options = merged;
    room.maxPlayers = merged.seats;
  }
  return room;
}

function joinRoom(socket, username, roomCode, io) {
  const room = initRoom(roomCode);
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
    seatIndex: room.players.length
  };

  room.players.push(player);

  io.to(roomCode).emit('playerList', room.players);
  io.emit('lobbyUpdate', getAllRooms());
}

/** Add N bots to a room and broadcast */
function addBots(roomCode, count, io) {
  const room = initRoom(roomCode);
  const toAdd = Math.max(0, Math.min(count || 0, (room.maxPlayers || 10) - room.players.length));
  for (let i = 0; i < toAdd; i++) {
    const id = `bot_${roomCode}_${i}_${Math.random().toString(36).slice(2,6)}`;
    room.players.push({
      id,
      name: `BOT ${i + 1}`,
      chips: 5,
      eliminated: false,
      seatIndex: room.players.length
    });
  }
  if (io) {
    io.to(roomCode).emit('playerList', room.players);
    io.emit('lobbyUpdate', getAllRooms());
  }
  return room;
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
  return Array.from(rooms.values()).map(room => {
    const full = room.players.length >= (room.maxPlayers || 10);
    return {
      roomCode: room.code,
      playerCount: room.players.length,
      maxPlayers: room.maxPlayers || 10,
      status: room.gameState ? 'In Progress' : (full ? 'Full' : 'Waiting'),
      mode: room.options?.mode,
      seats: room.options?.seats,
      pace: room.options?.pace,
      buyIn: room.options?.buyIn
    };
  });
}

module.exports = {
  rooms,
  getRoom,
  initRoom,
  joinRoom,
  addBots,
  removePlayer,
  getAllRooms
};
