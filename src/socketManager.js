const { initRoom, joinRoom, removePlayer } = require('./services/roomService');
const {
  startGame,
  handlePassCard,
  handleKeepCard
} = require('./game/gameengine');

module.exports = function(io) {
  io.on('connection', (socket) => {
    console.log(`🟢 Connected: ${socket.id}`);

    socket.on('join', ({ username, room }) => {
      joinRoom(socket, username, room, io);
    });

    socket.on('requestLobbyState', () => {
      const roomCode = Array.from(socket.rooms).find(r => r !== socket.id);
      if (roomCode) {
        const room = initRoom(roomCode);
        socket.emit('playerList', room.players);
      }
    });

    socket.on('startGame', (roomCode) => {
      startGame(roomCode, io);
    });

    socket.on('passCard', ({ room }) => {
      handlePassCard(room, io);
    });

    socket.on('keepCard', ({ room }) => {
      handleKeepCard(room, io);
    });

    socket.on('disconnect', () => {
      removePlayer(socket.id, io);
      console.log(`🔴 Disconnected: ${socket.id}`);
    });
  });
};
