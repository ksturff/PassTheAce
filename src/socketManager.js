// src/socketManager.js  (or server/socketManager.js if that's your layout)
const { rooms, initRoom, joinRoom, removePlayer, getAllRooms, setRoomOptions } = require('./services/roomService');
const { startGame, handlePassCard, handleKeepCard } = require('./game/gameengine');
const { fillRoomWithBots } = require('./services/botService');
const { v4: uuidv4 } = require('uuid');

module.exports = function(io) {
  io.on('connection', (socket) => {
    console.log(`🟢 Connected: ${socket.id}`);
    // Send current lobby snapshot on connect
    socket.emit('lobbyUpdate', getAllRooms());

    // --- JOIN EXISTING ROOM ---
    socket.on('join', ({ username, room }) => {
      try {
        joinRoom(socket, username, room, io);
        const roomData = initRoom(room);
        socket.emit('joinedRoom', {
          roomCode: room,
          player: roomData.players.find(p => p.id === socket.id),
          players: roomData.players
        });
        io.emit('lobbyUpdate', getAllRooms());
      } catch (e) {
        console.error('join error:', e);
        socket.emit('errorMessage', 'Failed to join room.');
      }
    });

    // --- CREATE GAME (single or multi) ---
    socket.on('createGame', ({ username, options = {}, singlePlayer = false } = {}) => {
      try {
        const roomCode = uuidv4().slice(0, 6).toUpperCase();
        const seats = Number(options.seats) || 10;

        setRoomOptions(roomCode, { ...options, seats });
        joinRoom(socket, username, roomCode, io);

        // Tell the client right away so UI swaps from splash/lobby to table
        const roomData = initRoom(roomCode);
        socket.emit('roomCreated', roomCode);
        socket.emit('joinedRoom', {
          roomCode,
          player: roomData.players.find(p => p.id === socket.id),
          players: roomData.players,
          singlePlayer: !!singlePlayer
        });

        if (singlePlayer) {
          // Fill table and auto-start
          fillRoomWithBots(roomCode, seats, io);
          setTimeout(() => startGame(roomCode, io), 150);
        } else {
          // Multiplayer: update lobby list; host can hit "Start Game" when ready
          io.emit('lobbyUpdate', getAllRooms());
        }
      } catch (e) {
        console.error('createGame error:', e);
        socket.emit('errorMessage', 'Failed to create game.');
      }
    });

    // --- LOBBY SNAPSHOT / WHO'S IN MY ROOM? ---
    socket.on('requestLobbyState', () => {
      socket.emit('lobbyUpdate', getAllRooms());
      const roomCode = Array.from(socket.rooms).find(r => r !== socket.id);
      if (roomCode) {
        const room = initRoom(roomCode);
        socket.emit('playerList', room.players);
      }
    });

    // --- START GAME (multiplayer host presses button) ---
    socket.on('startGame', (roomCode) => {
      try {
        startGame(roomCode, io);
      } catch (e) {
        console.error('startGame error:', e);
        socket.emit('errorMessage', 'Failed to start game.');
      }
    });

    // --- PLAYER ACTIONS ---
    socket.on('passCard', ({ room }) => {
      try {
        handlePassCard(room, io);
      } catch (e) {
        console.error('passCard error:', e);
      }
    });

    socket.on('keepCard', ({ room }) => {
      try {
        handleKeepCard(room, io);
      } catch (e) {
        console.error('keepCard error:', e);
      }
    });

    // --- NEW: FILL WITH BOTS FROM CLIENT UI ---
    socket.on('addBots', ({ roomCode, seats }) => {
      try {
        const code = roomCode || Array.from(socket.rooms).find(r => r !== socket.id);
        const desiredSeats = Math.max(2, Math.min(10, Number(seats) || 10));
        if (!code) return socket.emit('errorMessage', 'No room joined.');
        fillRoomWithBots(code, desiredSeats, io);
      } catch (e) {
        console.error('addBots error:', e);
        socket.emit('errorMessage', 'Failed to add bots.');
      }
    });

    // --- DISCONNECT ---
    socket.on('disconnect', () => {
      removePlayer(socket.id, io);
      io.emit('lobbyUpdate', getAllRooms());
      console.log(`🔴 Disconnected: ${socket.id}`);
    });
  });
};
