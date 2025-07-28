const { initRoom, joinRoom, removePlayer, getAllRooms } = require('./services/roomService');
const { startGame, handlePassCard, handleKeepCard } = require('./game/gameengine');

module.exports = function(io) {
  io.on('connection', (socket) => {
    console.log(`🟢 Connected: ${socket.id}`);

    socket.emit('lobbyUpdate', getAllRooms());

    socket.on('join', ({ username, room }) => {
      joinRoom(socket, username, room, io);
      const roomData = initRoom(room);
      socket.emit('joinedRoom', {
        roomCode: room,
        player: roomData.players.find(p => p.id === socket.id),
        players: roomData.players
      });
      io.emit('lobbyUpdate', getAllRooms()); // Broadcast updated lobby state
    });

    socket.on('requestLobbyState', () => {
      const roomCode = Array.from(socket.rooms).find(r => r !== socket.id);
      if (roomCode) {
        const room = initRoom(roomCode);
        socket.emit('playerList', room.players);
        socket.emit('lobbyUpdate', getAllRooms());
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
      io.emit('lobbyUpdate', getAllRooms());
      console.log(`🔴 Disconnected: ${socket.id}`);
    });
  });
};