// socketManager.js
const { initRoom, joinRoom, removePlayer, getAllRooms } = require('./services/roomService');
const { startGame, handlePassCard, handleKeepCard } = require('./game/gameengine');

// Short readable room code like "F8J2QK"
function generateRoomCode() {
  return Math.random().toString(36).slice(2, 8).toUpperCase();
}

module.exports = function(io) {
  io.on('connection', (socket) => {
    console.log(`🟢 Connected: ${socket.id}`);

    // Send lobby snapshot to the new client
    socket.emit('lobbyUpdate', getAllRooms());

    // Client asks for the lobby again (e.g., on reconnect)
    socket.on('requestLobbyState', () => {
      // Always send lobby
      socket.emit('lobbyUpdate', getAllRooms());

      // If they’re already in a room, also refresh player list
      const currentRoom = [...socket.rooms].find(r => r !== socket.id);
      if (currentRoom) {
        const roomData = initRoom(currentRoom);
        socket.emit('playerList', roomData.players);
      }
    });

    // Create a room with Pass-the-Ace options and auto-join the creator
    socket.on('createGame', ({ username, options }) => {
      if (!username) {
        socket.emit('errorMessage', 'Missing username.');
        return;
      }

      const roomCode = generateRoomCode();

      // Create room + apply options (mode, seats, pace, buyIn). Also sets maxPlayers = seats.
      initRoom(roomCode, options);

      // Add creator to the room (joinRoom will broadcast playerList + lobbyUpdate)
      joinRoom(socket, username, roomCode, io);

      // Tell creator their code for the UI label
      socket.emit('roomCreated', roomCode);

      // Send payload the client expects to switch from lobby → table
      const roomData = initRoom(roomCode);
      socket.emit('joinedRoom', {
        roomCode,
        player: roomData.players.find(p => p.id === socket.id),
        players: roomData.players
      });

      // Update lobby for everyone (redundant if joinRoom already did, but safe)
      io.emit('lobbyUpdate', getAllRooms());

      console.log(`🆕 Room ${roomCode} created by ${username}`);
    });

    // Join an existing room by code
    socket.on('join', ({ username, room }) => {
      if (!username || !room) {
        socket.emit('errorMessage', 'Missing username or room.');
        return;
      }

      console.log(`➡️  Join request: ${username} → ${room}`);
      // joinRoom enforces capacity and emits errorMessage if full
      joinRoom(socket, username, room, io);

      // Only send joinedRoom if the player actually got added
      const roomData = initRoom(room);
      const me = roomData.players.find(p => p.id === socket.id);
      if (me) {
        socket.emit('joinedRoom', {
          roomCode: room,
          player: me,
          players: roomData.players
        });
        io.emit('lobbyUpdate', getAllRooms());
        console.log(`✅ ${username} joined ${room}`);
      } else {
        console.log(`⛔ ${username} could not join ${room} (likely full).`);
      }
    });

    // Game controls
    socket.on('startGame', (roomCode) => {
      startGame(roomCode, io);
    });

    socket.on('passCard', ({ room }) => {
      handlePassCard(room, io);
    });

    socket.on('keepCard', ({ room }) => {
      handleKeepCard(room, io);
    });

    // Cleanup
    socket.on('disconnect', () => {
      removePlayer(socket.id, io);
      io.emit('lobbyUpdate', getAllRooms());
      console.log(`🔴 Disconnected: ${socket.id}`);
    });
  });
};
