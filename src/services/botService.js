const { v4: uuidv4 } = require('uuid');
const { rooms, getAllRooms } = require('./roomService');

/** Fill a room up to desiredSeats with bots */
function fillRoomWithBots(roomCode, desiredSeats = 10, io) {
  const room = rooms.get(roomCode);
  if (!room) return;

  const needed = Math.max(0, desiredSeats - room.players.length);
  for (let i = 0; i < needed; i++) {
    const botId = `bot_${uuidv4()}`;
    const botName = `Bot_${Math.floor(Math.random() * 9000 + 1000)}`;
    room.players.push({
      id: botId,
      name: botName,
      chips: 5,
      eliminated: false,
      seatIndex: room.players.length
    });
  }

  io.to(roomCode).emit('playerList', room.players);
  io.emit('lobbyUpdate', getAllRooms());
}

module.exports = { fillRoomWithBots };
