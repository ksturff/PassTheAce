// ✅ server.js (Multiplayer Game Logic Centralized)
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.use(express.static('public'));

const rooms = {}; // { roomCode: { players: [], gameStarted: false, gameState: {} } }

io.on('connection', (socket) => {
  console.log(`🟢 Player connected: ${socket.id}`);

  socket.on('join', ({ username, room }) => {
    socket.join(room);
    console.log(`👤 ${username} joined room: ${room}`);

    if (!rooms[room]) {
      rooms[room] = { players: [], gameStarted: false };
    }

    if (!rooms[room].players.find(p => p.id === socket.id)) {
      rooms[room].players.push({ id: socket.id, username });
    }

    socket.emit('welcome', `Welcome ${username}!`);
    io.to(room).emit('playerList', rooms[room].players);

    // ✅ Sync late joiners if game already started
    if (rooms[room].gameStarted) {
      socket.emit('gameStarted', rooms[room].gameState);
    }
  });

  socket.on('startGame', (room) => {
    const roomData = rooms[room];
    if (!roomData || roomData.gameStarted) return;

    const humanPlayers = roomData.players;
    const totalSeats = 10;
    const aiNames = ["Zeta", "Omega", "Nova", "Botley", "Slick", "Echo", "Mimic", "Zero"];

    const deck = [];
    for (let s of ['S', 'H', 'D', 'C']) {
      for (let r of [2, 3, 4, 5, 6, 7, 8, 9, 10, 'J', 'Q', 'K', 'A']) {
        deck.push({ suit: s, rank: r });
      }
    }
    const shuffledDeck = deck.sort(() => Math.random() - 0.5);

    const fullPlayerList = [];
    for (let i = 0; i < totalSeats; i++) {
      if (i < humanPlayers.length) {
        fullPlayerList.push({
          id: humanPlayers[i].id,
          name: humanPlayers[i].username,
          isHuman: true,
          card: shuffledDeck.pop(),
          chips: 3,
          seatIndex: i,
          eliminated: false
        });
      } else {
        fullPlayerList.push({
          id: `bot_${i}`,
          name: aiNames[i % aiNames.length],
          isHuman: false,
          card: shuffledDeck.pop(),
          chips: 3,
          seatIndex: i,
          eliminated: false
        });
      }
    }

    roomData.gameStarted = true;
    roomData.gameState = {
      players: fullPlayerList,
      currentTurnIndex: 0,
      deck: shuffledDeck
    };

    io.to(room).emit('gameStarted', roomData.gameState);
    emitTurn(room);
  });

  function emitTurn(room) {
    const roomData = rooms[room];
    const { currentTurnIndex, players } = roomData.gameState;
    const currentPlayer = players[currentTurnIndex];
    io.to(room).emit('turnUpdate', {
      currentPlayerId: currentPlayer.id,
      players
    });
  }

  socket.on('passCard', ({ room }) => {
    const roomData = rooms[room];
    if (!roomData || !roomData.gameStarted) return;

    const state = roomData.gameState;
    const currentPlayer = state.players[state.currentTurnIndex];

    let nextIndex = (state.currentTurnIndex + 1) % state.players.length;
    while (state.players[nextIndex].eliminated) {
      nextIndex = (nextIndex + 1) % state.players.length;
    }

    const temp = currentPlayer.card;
    currentPlayer.card = state.players[nextIndex].card;
    state.players[nextIndex].card = temp;

    state.currentTurnIndex = nextIndex;
    emitTurn(room);
  });

  socket.on('keepCard', ({ room }) => {
    const roomData = rooms[room];
    if (!roomData || !roomData.gameStarted) return;

    const state = roomData.gameState;

    let nextIndex = (state.currentTurnIndex + 1) % state.players.length;
    while (state.players[nextIndex].eliminated) {
      nextIndex = (nextIndex + 1) % state.players.length;
    }

    state.currentTurnIndex = nextIndex;
    emitTurn(room);
  });

  socket.on('endRound', (room) => {
    const roomData = rooms[room];
    if (!roomData || !roomData.gameStarted) return;

    const state = roomData.gameState;
    const ranks = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 14 };
    let lowest = Infinity;
    let losers = [];

    state.players.forEach(p => {
      if (!p.eliminated) {
        const value = ranks[p.card.rank];
        if (value < lowest) {
          lowest = value;
          losers = [p];
        } else if (value === lowest) {
          losers.push(p);
        }
      }
    });

    losers.forEach(p => {
      p.chips--;
      if (p.chips <= 0) p.eliminated = true;
    });

    const activePlayers = state.players.filter(p => !p.eliminated);
    activePlayers.forEach(p => p.card = state.deck.pop());

    state.currentTurnIndex = state.players.findIndex(p => !p.eliminated);
    io.to(room).emit('roundEnded', {
      updatedPlayers: state.players,
      losers
    });

    emitTurn(room);
  });

  socket.on('disconnect', () => {
    console.log(`🔴 Player disconnected: ${socket.id}`);
    for (const room in rooms) {
      const playerIndex = rooms[room].players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        rooms[room].players.splice(playerIndex, 1);
        io.to(room).emit('playerList', rooms[room].players);
      }
      if (rooms[room].players.length === 0) {
        delete rooms[room];
      }
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
