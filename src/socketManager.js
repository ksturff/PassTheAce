// socketManager.js
const { v4: uuidv4 } = require('uuid');
const {
  initRoom, setOptions, getRoom, joinRoom, addBots,
  removePlayer, getAllRooms
} = require('./services/roomService');
const { startGame, handlePassCard, handleKeepCard } = require('./game/gameengine');

module.exports = function (io) {
  io.on('connection', (socket) => {
    console.log(`🟢 Connected: ${socket.id}`);
    socket.emit('lobbyUpdate', getAllRooms());

    socket.on('requestLobbyState', () => {
      socket.emit('lobbyUpdate', getAllRooms());
      const joined = Array.from(socket.rooms).filter(r => r !== socket.id);
      if (joined.length) {
        const roomCode = joined[0];
        const room = getRoom(roomCode);
        if (room) socket.emit('playerList', room.players);
      }
    });

    socket.on('join', ({ username, room }) => {
      if (!username || !room) return;
      setOptions(room, {}); // ensure room exists with defaults
      joinRoom(socket, username, room, io);
      const roomData = getRoom(room);
      socket.emit('joinedRoom', {
        roomCode: room,
        player: roomData.players.find(p => p.id === socket.id),
        players: roomData.players
      });
      io.emit('lobbyUpdate', getAllRooms());
    });

    socket.on('createGame', ({ username, options, singlePlayer }) => {
      if (!username) return;
      const roomCode = uuidv4().slice(0, 6).toUpperCase();

      setOptions(roomCode, options || {});
      joinRoom(socket, username, roomCode, io);

      if (singlePlayer) {
        const room = getRoom(roomCode);
        const seats = (room && room.options && room.options.seats) || 10;
        const toAdd = Math.max(0, seats - room.players.length);
        addBots(roomCode, toAdd, io);

        socket.emit('joinedRoom', {
          roomCode,
          player: room.players.find(p => p.id === socket.id),
          players: room.players
        });

        startGame(roomCode, io); // auto-start single player
      } else {
        socket.emit('roomCreated', roomCode); // multiplayer flow
      }

      io.emit('lobbyUpdate', getAllRooms());
    });

    socket.on('startGame', (roomCode) => startGame(roomCode, io));
    socket.on('passCard', ({ room }) => handlePassCard(room, io));
    socket.on('keepCard', ({ room }) => handleKeepCard(room, io));

    socket.on('disconnect', () => {
      removePlayer(socket.id, io);
      io.emit('lobbyUpdate', getAllRooms());
      console.log(`🔴 Disconnected: ${socket.id}`);
    });
  });
};

