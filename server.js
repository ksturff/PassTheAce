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

    if (rooms[room].gameStarted) {
      socket.emit('gameStarted', rooms[room].gameState);
    }
  });

  socket.on('startGame', (room) => {
    const roomData = rooms[room];
    if (!roomData || roomData.gameStarted) return;

    if (roomData.players.length < 2) {
      return socket.emit("errorMessage", "You need at least 2 human players to start.");
    }

    const totalSeats = 10;
    const aiNames = ["Zeta", "Omega", "Nova", "Botley", "Slick", "Echo", "Mimic", "Zero"];

    const humanPlayers = roomData.players.map((p, i) => ({
      id: p.id,
      name: p.username,
      isHuman: true,
      chips: 3,
      eliminated: false,
      seatIndex: i
    }));

    const deck = [];
    for (let s of ['S', 'H', 'D', 'C']) {
      for (let r of [2, 3, 4, 5, 6, 7, 8, 9, 10, 'J', 'Q', 'K', 'A']) {
        deck.push({ suit: s, rank: r });
      }
    }
    const shuffledDeck = deck.sort(() => Math.random() - 0.5);

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

    fullPlayerList.forEach(p => {
      p.card = shuffledDeck.pop();
    });

    const dealerIndex = Math.floor(Math.random() * fullPlayerList.length);
    const startingIndex = getNextActiveIndex(fullPlayerList, dealerIndex);

    roomData.gameStarted = true;
    roomData.gameState = {
      players: fullPlayerList,
      currentTurnIndex: startingIndex,
      roundStartIndex: startingIndex,
      deck: shuffledDeck,
      dealerIndex
    };

    io.to(room).emit('gameStarted', roomData.gameState);

    // ✅ Delay start so clients load before turns begin
    setTimeout(() => {
      emitTurn(room);
    }, 1500);
  });

  socket.on('passCard', ({ room }) => {
    const roomData = rooms[room];
    if (!roomData || !roomData.gameStarted) return;

    const state = roomData.gameState;
    const current = state.players[state.currentTurnIndex];

    let nextIndex = getNextActiveIndex(state.players, state.currentTurnIndex);
    if (nextIndex === -1) return;

    const temp = current.card;
    current.card = state.players[nextIndex].card;
    state.players[nextIndex].card = temp;

    state.currentTurnIndex = nextIndex;
    emitTurn(room);
  });

  socket.on('keepCard', ({ room }) => {
    const roomData = rooms[room];
    if (!roomData || roomData.gameStarted === false) return;

    const state = roomData.gameState;
    const nextIndex = getNextActiveIndex(state.players, state.currentTurnIndex);
    if (nextIndex === -1) return;

    state.currentTurnIndex = nextIndex;
    emitTurn(room);
  });

  socket.on('endRound', (room) => {
    endRound(room);
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

  function emitTurn(room) {
    const roomData = rooms[room];
    const state = roomData.gameState;
    const current = state.players[state.currentTurnIndex];

    // ✅ Fix: prevent round from ending too early
    if (state.roundStartIndex === undefined) {
      state.roundStartIndex = state.currentTurnIndex;
    } else {
      const active = state.players.filter(p => !p.eliminated);
      if (active.length > 1 && state.currentTurnIndex === state.roundStartIndex) {
        return endRound(room);
      }
    }

    io.to(room).emit('turnUpdate', {
      currentPlayerId: current.id,
      players: state.players
    });

    if (!current.isHuman && !current.eliminated) {
      setTimeout(() => {
        handleAIMove(room, current);
      }, 1500);
    }
  }

  function handleAIMove(room, player) {
    const roomData = rooms[room];
    const state = roomData.gameState;
    const current = state.players[state.currentTurnIndex];
    if (player.id !== current.id) return;

    const nextIndex = getNextActiveIndex(state.players, state.currentTurnIndex);
    if (nextIndex === -1) return;

    const ranks = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 1 };
    const myVal = ranks[player.card.rank];
    const nextVal = ranks[state.players[nextIndex].card.rank];

    const shouldPass = myVal < 8 && nextVal !== 13;

    if (shouldPass) {
      const temp = player.card;
      player.card = state.players[nextIndex].card;
      state.players[nextIndex].card = temp;
    }

    state.currentTurnIndex = nextIndex;
    emitTurn(room);
  }

  function endRound(room) {
    const roomData = rooms[room];
    const state = roomData.gameState;

    const ranks = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 1 };
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
    if (activePlayers.length === 1) {
      io.to(room).emit('gameOver', { winner: activePlayers[0] });
      return;
    }

    activePlayers.forEach(p => {
      const newCard = state.deck.pop();
      if (!newCard) return;
      p.card = newCard;
    });

    state.currentTurnIndex = getNextActiveIndex(state.players, state.dealerIndex);
    state.roundStartIndex = state.currentTurnIndex;

    io.to(room).emit('roundEnded', {
      updatedPlayers: state.players,
      losers
    });

    emitTurn(room);
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`✅ Server running on port ${PORT}`);
});
