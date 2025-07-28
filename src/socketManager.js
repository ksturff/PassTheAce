const { initRoom, joinRoom, removePlayer, getAllRooms } = require('./services/roomService');
const { startGame, handlePassCard, handleKeepCard } = require('./game/gameengine');

module.exports = function(io) {
  io.on('connection', (socket) => {
    console.log(`🟢 Connected: ${socket.id}`);
    socket.emit('lobbyUpdate', getAllRooms());

    socket.on('join', ({ username, room }) => {
      console.log(`Received join request: ${username} to ${room}`); // Debug log
      joinRoom(socket, username, room, io);
      const roomData = initRoom(room);
      socket.emit('joinedRoom', {
        roomCode: room,
        player: roomData.players.find(p => p.id === socket.id),
        players: roomData.players
      });
      console.log(`Emitted joinedRoom for ${socket.id} in ${room}`); // Debug log
      io.emit('lobbyUpdate', getAllRooms());
    });

    socket.on('createGame', ({ username }) => {
      console.log(`Received createGame request from ${username}`); // Debug log
      const roomCode = require('uuid').v4().slice(0, 6);
      joinRoom(socket, username, roomCode, io);
      socket.emit('roomCreated', roomCode);
      console.log(`Created and joined room ${roomCode} for ${username}`); // Debug log
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