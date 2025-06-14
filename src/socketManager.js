const { initRoom, joinRoom, removePlayer, getAllRooms } = require('./services/roomService');
const {
  startGame,
  handlePassCard,
  handleKeepCard
} = require('./game/gameengine');

module.exports = function(io) {
  io.on('connection', (socket) => {
    console.log(`🟢 Connected: ${socket.id}`);

    // Emit initial lobby state to the connected client
    socket.emit('lobbyUpdate', getAllRooms());

    socket.on('join', ({ username, room }) => {
      joinRoom(socket, username, room, io);
      io.emit('lobbyUpdate', getAllRooms()); // Broadcast updated lobby state
    });

    socket.on('requestLobbyState', () => {
      const roomCode = Array.from(socket.rooms).find(r => r !== socket.id);
      if (roomCode) {
        const room = initRoom(roomCode);
        socket.emit('playerList', room.players); // Room-specific player list
        socket.emit('lobbyUpdate', getAllRooms()); // Also send lobby state
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
      io.emit('lobbyUpdate', getAllRooms()); // Update lobby when a player leaves
      console.log(`🔴 Disconnected: ${socket.id}`);
    });
  });
};