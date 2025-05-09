// ✅ server.js (Fixed Multiplayer Game Logic)
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

    // If the game already started, sync late joiner
    if (rooms[room].gameStarted) {
      socket.emit('gameStarted', rooms[room].gameState);
    }
  });

  socket.on('startGame', (room) => {
  const roomData = rooms[room];
  if (!roomData || roomData.gameStarted) return;

  const totalSeats = 10;
  const aiNames = ["Zeta", "Omega", "Nova", "Botley", "Slick", "Echo", "Mimic", "Zero"];

  // 🧍 Get all current players and label them as human with proper name
  const humanPlayers = roomData.players.map((p, i) => ({
    id: p.id,
    name: p.username, // ✅ not `username:`, we need to assign to `name`
    isHuman: true,
    chips: 3,
    eliminated: false,
    seatIndex: i
  }));

  // 🎴 Build full 52-card deck
  const deck = [];
  for (let s of ['S', 'H', 'D', 'C']) {
    for (let r of [2, 3, 4, 5, 6, 7, 8, 9, 10, 'J', 'Q', 'K', 'A']) {
      deck.push({ suit: s, rank: r });
    }
  }
  const shuffledDeck = deck.sort(() => Math.random() - 0.5);

  // 👥 Add AI players to fill out remaining seats
  const fullPlayerList = [...humanPlayers];
  for (let i = humanPlayers.length; i < totalSeats; i++) {
    fullPlayerList.push({
      id: `bot_${i}`,
      name: aiNames[i % aiNames.length],
      isHuman: false,
      chips: 3,
      eliminated: false,
      seatIndex: i
    });
  }

  // 🃏 Deal initial cards
  fullPlayerList.forEach(p => {
    p.card = shuffledDeck.pop();
  });

  // ✅ Update and broadcast state
  roomData.gameStarted = true;
  roomData.gameState = {
    players: fullPlayerList,
    currentTurnIndex: 0,
    deck: shuffledDeck
  };

  io.to(room).emit('gameStarted', roomData.gameState);
  emitTurn(room);
});

  socket.on('passCard', ({ room }) => {
    const roomData = rooms[room];
    if (!roomData || !roomData.gameStarted) return;

    const state = roomData.gameState;
    const currentPlayer = state.players[state.currentTurnIndex];

    let nextIndex = getNextActiveIndex(state.players, state.currentTurnIndex);
    if (nextIndex === -1) return;

    // Swap cards
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
    const nextIndex = getNextActiveIndex(state.players, state.currentTurnIndex);
    if (nextIndex === -1) return;

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

    // Game over check
    if (activePlayers.length === 1) {
      io.to(room).emit('gameOver', { winner: activePlayers[0] });
      return;
    }

    // Deal new cards
    activePlayers.forEach(p => {
      const newCard = state.deck.pop();
      if (!newCard) return;
      p.card = newCard;
    });

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
      const index = rooms[room].players.findIndex(p => p.id === socket.id);
      if (index !== -1) {
        rooms[room].players.splice(index, 1);
        io.to(room).emit('playerList', rooms[room].players);
      }
      if (rooms[room].players.length === 0) {
        delete rooms[room];
      }
    }
  });

  function getNextActiveIndex(players, currentIndex) {
    const total = players.length;
    let next = (currentIndex + 1) % total;
    for (let i = 0; i < total; i++) {
      if (!players[next].eliminated) return next;
      next = (next + 1) % total;
    }
    return -1;
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});

