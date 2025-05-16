// ✅ Full server.js with Lobby + Game Logic
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

app.get('/', (req, res) => {
  res.sendFile(__dirname + '/public/lobby.html');
});

app.use(express.static('public'));

const rooms = {};
const roomsMetadata = {};

function log(type, message) {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [${type}] ${message}`);
}

function updateLobby() {
  const visibleRooms = Object.entries(roomsMetadata)
    .filter(([_, meta]) => !meta.isPrivate)
    .map(([roomId, meta]) => ({ roomId, ...meta }));
  io.emit('lobbyUpdate', visibleRooms);
}

io.on('connection', (socket) => {
  log('CONNECT', `🟢 Player connected: ${socket.id}`);

  socket.on('requestLobbyState', () => updateLobby());

  socket.on('createPrivateRoom', ({ username }) => {
    const roomCode = uuidv4();
    rooms[roomCode] = { players: [], gameStarted: false };
    roomsMetadata[roomCode] = { status: 'waiting', seatsTaken: 0, maxSeats: 10, isPrivate: true };
    socket.emit('roomCreated', { room: roomCode });
    log('ROOM', `Private room created: ${roomCode}`);
  });

  socket.on('joinRandomRoom', ({ username }) => {
    const joinableRoom = Object.entries(roomsMetadata).find(
      ([_, meta]) => meta.status === 'waiting' && !meta.isPrivate && meta.seatsTaken < meta.maxSeats
    );

    let roomCode;
    if (joinableRoom) {
      roomCode = joinableRoom[0];
    } else {
      roomCode = uuidv4();
      rooms[roomCode] = { players: [], gameStarted: false };
      roomsMetadata[roomCode] = { status: 'waiting', seatsTaken: 0, maxSeats: 10, isPrivate: false };
    }

    socket.emit('roomFound', { room: roomCode });
  });

  socket.on('join', ({ username, room }) => {
    socket.join(room);
    log('JOIN', `👤 ${username} joined room: ${room}`);

    if (!rooms[room]) rooms[room] = { players: [], gameStarted: false };
    if (!roomsMetadata[room]) roomsMetadata[room] = { status: 'waiting', seatsTaken: 0, maxSeats: 10, isPrivate: false };

    if (!rooms[room].players.find(p => p.id === socket.id)) {
      rooms[room].players.push({ id: socket.id, username });
      roomsMetadata[room].seatsTaken++;
    }

    socket.emit('welcome', `Welcome ${username}!`);
    io.to(room).emit('playerList', rooms[room].players);
    updateLobby();

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

    log('GAME', `Starting game in room: ${room}`);

    const totalSeats = 10;
    const aiNames = ["Zeta", "Omega", "Nova", "Botley", "Slick", "Echo", "Mimic", "Zero"];

    const humanPlayers = roomData.players.map((p, i) => ({
      id: p.id,
      name: p.username || `Player${i + 1}`,
      isHuman: true,
      chips: 3,
      eliminated: false,
      seatIndex: i
    }));

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

    const deck = [];
    for (let s of ['S', 'H', 'D', 'C']) {
      for (let r of [2, 3, 4, 5, 6, 7, 8, 9, 10, 'J', 'Q', 'K', 'A']) {
        deck.push({ suit: s, rank: r });
      }
    }
    const shuffledDeck = deck.sort(() => Math.random() - 0.5);

    fullPlayerList.forEach(p => {
      p.card = shuffledDeck.pop();
      log('DEAL', `Dealt ${p.card.rank}${p.card.suit} to ${p.name}`);
    });

    const ranks = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 1 };
    const highestValue = Math.max(...fullPlayerList.map(p => ranks[p.card.rank]));
    const dealer = fullPlayerList.filter(p => ranks[p.card.rank] === highestValue).reduce((a, b) => a.seatIndex < b.seatIndex ? a : b);
    const dealerIndex = dealer.seatIndex;
    const startingIndex = getNextActiveIndex(fullPlayerList, dealerIndex);

    roomData.gameStarted = true;
    roomData.gameState = {
      players: fullPlayerList,
      currentTurnIndex: startingIndex,
      roundStartIndex: startingIndex,
      deck: shuffledDeck,
      dealerIndex: dealerIndex,
      turnCount: 0
    };

    roomsMetadata[room].status = 'playing';
    io.to(room).emit('gameStarted', roomData.gameState);
    setTimeout(() => emitTurn(room), 1000);
  });

  socket.on('passCard', ({ room }) => {
    const state = rooms[room]?.gameState;
    if (!state) return;
    const current = state.players[state.currentTurnIndex];
    if (current.id !== socket.id) return;

    const nextIndex = getNextActiveIndex(state.players, state.currentTurnIndex);
    if (nextIndex === -1) return;

    [current.card, state.players[nextIndex].card] = [state.players[nextIndex].card, current.card];
    log('ACTION', `${current.name} passed card to ${state.players[nextIndex].name}`);

    io.to(room).emit('cardPassed', {
      fromIndex: state.currentTurnIndex,
      toIndex: nextIndex
    });

    state.currentTurnIndex = nextIndex;
    setTimeout(() => emitTurn(room), 6000);
  });

  socket.on('keepCard', ({ room }) => {
    const state = rooms[room]?.gameState;
    if (!state) return;
    const current = state.players[state.currentTurnIndex];
    if (current.id !== socket.id) return;
    const nextIndex = getNextActiveIndex(state.players, state.currentTurnIndex);
    if (nextIndex === -1) return;
    log('ACTION', `${current.name} kept their card`);
    state.currentTurnIndex = nextIndex;
    emitTurn(room);
  });

  socket.on('disconnect', () => {
    log('DISCONNECT', `🔴 Player disconnected: ${socket.id}`);
    for (const room in rooms) {
      const playerIndex = rooms[room].players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        rooms[room].players.splice(playerIndex, 1);
        roomsMetadata[room].seatsTaken--;
        io.to(room).emit('playerList', rooms[room].players);
        break;
      }
    }
  });
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
  const state = rooms[room].gameState;
  const current = state.players[state.currentTurnIndex];
  const activePlayers = state.players.filter(p => !p.eliminated);

  if (!current || current.eliminated) return;

  if (state.turnCount >= activePlayers.length) {
    log('ROUND', `✅ All players acted. Ending round.`);
    setTimeout(() => endRound(room), 1500);
    return;
  }

  io.to(room).emit('turnUpdate', {
    currentPlayerId: current.id,
    players: state.players
  });

  log('TURN', `Now it's ${current.name}'s turn`);
  state.turnCount++;

  if (!current.isHuman && !current.eliminated) {
    setTimeout(() => handleAIMove(room, current), 1200);
  }
}

function handleAIMove(room, player) {
  const state = rooms[room].gameState;
  const current = state.players[state.currentTurnIndex];
  if (player.id !== current.id) return;

  const nextIndex = getNextActiveIndex(state.players, state.currentTurnIndex);
  if (nextIndex === -1 || !player.card || !state.players[nextIndex].card) return;

  const ranks = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 1 };
  const myVal = ranks[player.card.rank];
  const nextVal = ranks[state.players[nextIndex].card.rank];
  const shouldPass = myVal < 8 && nextVal !== 13;

  if (shouldPass) {
    [player.card, state.players[nextIndex].card] = [state.players[nextIndex].card, player.card];
    log('AI', `${player.name} passed to ${state.players[nextIndex].name}`);

    io.to(room).emit('cardPassed', {
      fromIndex: state.currentTurnIndex,
      toIndex: nextIndex
    });

    setTimeout(() => {
      state.currentTurnIndex = nextIndex;
      emitTurn(room);
    }, 600);
  } else {
    log('AI', `${player.name} kept their card`);

    setTimeout(() => {
      state.currentTurnIndex = nextIndex;
      emitTurn(room);
    }, 400);
  }
}

function endRound(room) {
  const state = rooms[room].gameState;
  const ranks = { '2': 2, '3': 3, '4': 4, '5': 5, '6': 6, '7': 7, '8': 8, '9': 9, '10': 10, 'J': 11, 'Q': 12, 'K': 13, 'A': 1 };
  let lowest = Infinity;
  let losers = [];

  console.log("🔎 ROUND END CARDS:");
  const roundSnapshot = state.players.map(p => ({
    name: p.name,
    card: { ...p.card },
    chips: p.chips
  }));

  state.players.forEach(p => {
    const value = ranks[p.card?.rank];
    const summary = value !== undefined ? `Value: ${value}` : `❗ Invalid rank: ${p.card?.rank}`;
    console.log(`${p.name}: ${p.card?.rank}${p.card?.suit} | ${summary} | Chips: ${p.chips} | Eliminated: ${p.eliminated}`);

    if (!p.eliminated && value !== undefined) {
      if (value < lowest) {
        lowest = value;
        losers = [p];
      } else if (value === lowest) {
        losers.push(p);
      }
    }
  });

  if (lowest === Infinity || losers.length === 0) {
    log('WARN', 'No valid lowest card found — skipping chip loss');
    return;
  }

  log(`❌ Lowest Value: ${lowest}`);
  log(`💥 Losers: ${losers.map(p => p.name).join(", ")}`);

  losers.forEach(p => {
    p.chips--;
    if (p.chips <= 0) {
      p.eliminated = true;
      log('ELIMINATED', `${p.name} is out of the game`);
    } else {
      log('PENALTY', `${p.name} lost a chip (${p.chips} left)`);
    }
  });

  const activePlayers = state.players.filter(p => !p.eliminated);
  if (activePlayers.length === 1) {
    log('GAME', `🏆 Winner: ${activePlayers[0].name}`);
    io.to(room).emit('gameOver', { winner: activePlayers[0] });
    return;
  }

  if (state.deck.length < activePlayers.length) {
    const newDeck = [];
    for (let s of ['S', 'H', 'D', 'C']) {
      for (let r of [2, 3, 4, 5, 6, 7, 8, 9, 10, 'J', 'Q', 'K', 'A']) {
        newDeck.push({ suit: s, rank: r });
      }
    }
    state.deck = newDeck.sort(() => Math.random() - 0.5);
    log('DECK', '♻️ Deck reshuffled');
  }

  io.to(room).emit('roundEnded', {
    updatedPlayers: roundSnapshot,
    losers
  });

  // 🕒 ⏳ Delay everything until AFTER face-up time
  setTimeout(() => {
    activePlayers.forEach(p => {
      const newCard = state.deck.pop();
      if (newCard) {
        p.card = newCard;
        log('DEAL', `New card to ${p.name}: ${newCard.rank}${newCard.suit}`);
      }
    });

    state.dealerIndex = getNextActiveIndex(state.players, state.dealerIndex);
    state.currentTurnIndex = getNextActiveIndex(state.players, state.dealerIndex);
    state.roundStartIndex = state.currentTurnIndex;
    state.turnCount = 0;

    log('DEALER', `New dealer: ${state.players[state.dealerIndex].name} (seat ${state.dealerIndex})`);
    log('TURN START', `First to act: ${state.players[state.currentTurnIndex].name}`);

    emitTurn(room);
  }, 7000); // ⏱ Delay to match client flip timeout
} // ✅ CLOSE the endRound function here

// ✅ START of server setup
const PORT = process.env.PORT;
server.listen(PORT, () => {
  log('BOOT', `✅ Server running on port ${PORT}`);
});

