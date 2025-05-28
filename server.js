const express = require('express');
const app = express();
const http = require('http');
const server = http.createServer(app);
const { Server } = require('socket.io');
const io = new Server(server);
const { v4: uuidv4 } = require('uuid');

const PORT = process.env.PORT || 3000;
app.use(express.static('public'));

const rooms = new Map(); // roomCode -> { players, gameState }

function log(message, roomCode = 'N/A') {
  console.log(`[${new Date().toISOString()}] [Room: ${roomCode}] ${message}`);
}

function createDeck() {
  const suits = ['S', 'H', 'D', 'C'];
  const ranks = ['A', 2, 3, 4, 5, 6, 7, 8, 9, 10, 'J', 'Q', 'K'];
  const deck = [];
  for (let suit of suits) {
    for (let rank of ranks) {
      deck.push({ rank, suit });
    }
  }
  return deck.sort(() => Math.random() - 0.5);
}

function dealCards(players, deck) {
  const dealtCards = deck.slice(0, players.length);
  players.forEach((player, i) => {
    player.card = dealtCards[i];
  });
  return players;
}

function findNextPlayer(players, currentIndex) {
  let nextIndex = (currentIndex + 1) % players.length;
  while (players[nextIndex].eliminated) {
    nextIndex = (nextIndex + 1) % players.length;
  }
  return nextIndex;
}

function endRound(room) {
  const { players } = room.gameState;
  const losers = [];
  let aceCount = 0;
  let kingCount = 0;

  // First pass: Count aces and kings
  players.forEach(p => {
    if (!p.eliminated && p.card) {
      if (p.card.rank === 'A') aceCount++;
      if (p.card.rank === 'K') kingCount++;
    }
  });

  const hasAce = aceCount > 0;
  const allKings = kingCount === players.filter(p => !p.eliminated).length;

  // Define card values for comparison (A=1, 2=2, ..., 10=10, J=11, Q=12, K=13)
  const rankValues = {
    'A': 1, 2: 2, 3: 3, 4: 4, 5: 5, 6: 6, 7: 7, 8: 8, 9: 9, 10: 10,
    'J': 11, 'Q': 12, 'K': 13
  };

  if (hasAce) {
    // If there’s an ace, only ace holders lose a chip
    players.forEach(p => {
      if (p.eliminated) return;
      if (p.card.rank === 'A') {
        p.chips--;
        losers.push({ name: p.name, card: p.card });
        log(`Player ${p.name} loses a chip with ${p.card.rank}${p.card.suit}`, room.gameState.roomCode);
      }
    });
  } else if (allKings) {
    // If all players have kings, all lose a chip
    players.forEach(p => {
      if (p.eliminated) return;
      p.chips--;
      losers.push({ name: p.name, card: p.card });
      log(`Player ${p.name} loses a chip with ${p.card.rank}${p.card.suit} (all kings)`, room.gameState.roomCode);
    });
  } else {
    // Otherwise, the player with the lowest card loses a chip
    let minValue = Infinity;
    const activePlayers = players.filter(p => !p.eliminated && p.card);
    activePlayers.forEach(p => {
      const value = rankValues[p.card.rank];
      if (value < minValue) {
        minValue = value;
      }
    });

    // Deduct chips from players with the lowest card
    activePlayers.forEach(p => {
      if (p.eliminated) return;
      const value = rankValues[p.card.rank];
      if (value === minValue) {
        p.chips--;
        losers.push({ name: p.name, card: p.card });
        log(`Player ${p.name} loses a chip with ${p.card.rank}${p.card.suit} (lowest card)`, room.gameState.roomCode);
      }
    });
  }

  // Eliminate players with 0 chips
  const activePlayers = players.filter(p => !p.eliminated);
  activePlayers.forEach(p => {
    if (p.chips <= 0) p.eliminated = true;
  });

  return { updatedPlayers: players, losers };
}

function checkGameOver(players) {
  const activePlayers = players.filter(p => !p.eliminated && p.chips > 0);
  if (activePlayers.length === 1) {
    return activePlayers[0];
  }
  return null;
}

function addBotToRoom(roomCode) {
  const botId = `bot_${uuidv4()}`;
  const botName = `Bot_${Math.floor(Math.random() * 1000)}`;
  const player = { id: botId, name: botName, chips: 5, eliminated: false, seatIndex: null };
  
  const room = rooms.get(roomCode) || { players: [], gameState: null };
  room.players.push(player);
  rooms.set(roomCode, room);

  log(`Bot ${botName} joined`, roomCode);
  io.to(roomCode).emit('playerList', room.players);

  if (player.id.startsWith('bot_')) {
    setTimeout(() => botPlay(player, roomCode), 1000);
  }
}

function botPlay(bot, roomCode) {
  const room = rooms.get(roomCode);
  if (!room || !room.gameState) return;

  const { players, currentPlayerId } = room.gameState;
  if (currentPlayerId !== bot.id) return;

  const botPlayer = players.find(p => p.id === bot.id);
  if (!botPlayer || botPlayer.eliminated || !botPlayer.card) return;

  log(`Bot ${bot.name} is deciding...`, roomCode);

  const hasAce = botPlayer.card.rank === 'A';
  const hasKing = botPlayer.card.rank === 'K';
  const shouldPass = !hasKing && hasAce && Math.random() < 0.9;

  setTimeout(() => {
    if (shouldPass) {
      log(`Bot ${bot.name} passes`, roomCode);
      io.to(roomCode).emit('passCard', { room: roomCode });
    } else {
      log(`Bot ${bot.name} keeps`, roomCode);
      io.to(roomCode).emit('keepCard', { room: roomCode });
    }
  }, 1500);
}

io.on('connection', (socket) => {
  log(`User connected: ${socket.id}`);

  socket.on('requestLobbyState', () => {
    const roomCode = Array.from(socket.rooms).find(room => room !== socket.id);
    if (roomCode && rooms.has(roomCode)) {
      socket.emit('playerList', rooms.get(roomCode).players);
    }
  });

  socket.on('join', ({ username, room }) => {
    socket.join(room);
    const player = { id: socket.id, name: username, chips: 5, eliminated: false, seatIndex: null };

    const roomData = rooms.get(room) || { players: [], gameState: null };
    roomData.players.push(player);
    rooms.set(room, roomData);

    log(`${username} joined`, room);
    io.to(room).emit('playerList', roomData.players);

    if (roomData.players.length === 1) {
      addBotToRoom(room);
    }

    if (player.id.startsWith('bot_')) {
      setTimeout(() => botPlay(player, room), 1000);
    }
  });

  socket.on('startGame', (roomCode) => {
    const room = rooms.get(roomCode);
    if (!room) return;

    const humanCount = room.players.filter(p => !p.id.startsWith('bot_')).length;
    if (humanCount < 2) {
      socket.emit('errorMessage', 'Need at least 2 human players to start the game.');
      return;
    }

    log('Starting game', roomCode);

    const deck = createDeck();
    room.players.forEach((p, i) => (p.seatIndex = i));
    const players = dealCards(room.players, deck);

    room.gameState = {
      players,
      currentPlayerId: players[0].id,
      deck,
      round: 1,
      dealerIndex: 0,
      startingPlayerIndex: 0,
      roomCode // Added for logging in endRound
    };

    rooms.set(roomCode, room);
    io.to(roomCode).emit('gameStarted', room.gameState);
    io.to(roomCode).emit('turnUpdate', {
      currentPlayerId: room.gameState.currentPlayerId,
      players: room.gameState.players
    });

    const firstPlayer = players.find(p => p.id === room.gameState.currentPlayerId);
    if (firstPlayer && firstPlayer.id.startsWith('bot_')) {
      setTimeout(() => botPlay(firstPlayer, roomCode), 1000);
    }
  });

  socket.on('passCard', ({ room: roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room || !room.gameState) {
      log('Room or game state not found', roomCode);
      socket.emit('errorMessage', 'Game state not found.');
      return;
    }

    const { players, currentPlayerId } = room.gameState;
    const currentIndex = players.findIndex(p => p.id === currentPlayerId);
    const currentPlayer = players[currentIndex];

    if (!currentPlayer || currentPlayer.eliminated) {
      log(`Invalid current player: ${currentPlayerId}`, roomCode);
      socket.emit('errorMessage', 'Invalid player state.');
      return;
    }

    log(`Player ${currentPlayer.name} attempts to pass. Card: ${currentPlayer.card ? currentPlayer.card.rank + currentPlayer.card.suit : 'None'}`, roomCode);

    if (currentPlayer.card && currentPlayer.card.rank === 'K') {
      log(`Blocked: ${currentPlayer.name} has a King and cannot pass`, roomCode);
      socket.emit('errorMessage', 'You have a King! You cannot pass.');
      io.to(roomCode).emit('turnUpdate', { currentPlayerId, players });
      return;
    }

    const nextIndex = findNextPlayer(players, currentIndex);
    const nextPlayer = players[nextIndex];

    if (nextPlayer.card && nextPlayer.card.rank === 'K') {
      log(`Blocked: ${nextPlayer.name} has a King and cannot be passed to`, roomCode);
      socket.emit('errorMessage', `${nextPlayer.name} has a King and cannot be passed to!`);
      io.to(roomCode).emit('turnUpdate', { currentPlayerId, players });
      return;
    }

    log(`Passing from ${currentPlayer.name} (index ${currentIndex}) to ${nextPlayer.name} (index ${nextIndex})`, roomCode);

    setTimeout(() => {
      const tempCard = currentPlayer.card;
      currentPlayer.card = null;
      nextPlayer.card = tempCard;

      io.to(roomCode).emit('cardPassed', { fromIndex: currentIndex, toIndex: nextIndex });

      const newCurrentIndex = findNextPlayer(players, currentIndex);
      room.gameState.currentPlayerId = players[newCurrentIndex].id;

      log(`New turn: ${players[newCurrentIndex].name} (ID: ${room.gameState.currentPlayerId})`, roomCode);

      io.to(roomCode).emit('turnUpdate', {
        currentPlayerId: room.gameState.currentPlayerId,
        players: room.gameState.players
      });

      const newCurrentPlayer = players[newCurrentIndex];
      if (newCurrentPlayer.id.startsWith('bot_')) {
        setTimeout(() => botPlay(newCurrentPlayer, roomCode), 1000);
      }
    }, 500);
  });

  socket.on('keepCard', ({ room: roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room || !room.gameState) {
      log('Room or game state not found', roomCode);
      socket.emit('errorMessage', 'Game state not found.');
      return;
    }

    const { players, currentPlayerId } = room.gameState;
    const currentIndex = players.findIndex(p => p.id === currentPlayerId);
    const currentPlayer = players[currentIndex];

    if (!currentPlayer || currentPlayer.eliminated) {
      log(`Invalid current player: ${currentPlayerId}`, roomCode);
      socket.emit('errorMessage', 'Invalid player state.');
      return;
    }

    log(`Player ${currentPlayer.name} keeps their card`, roomCode);

    setTimeout(() => {
      const activePlayers = players.filter(p => !p.eliminated);
      const nextIndex = findNextPlayer(players, currentIndex);

      if (nextIndex === room.gameState.startingPlayerIndex) {
        const { updatedPlayers, losers } = endRound(room);
        io.to(roomCode).emit('roundEnded', { updatedPlayers, losers });

        const winner = checkGameOver(updatedPlayers);
        if (winner) {
          io.to(roomCode).emit('gameOver', { winner });
          rooms.delete(roomCode);
          return;
        }

        const deck = createDeck();
        room.gameState.players = dealCards(updatedPlayers, deck);
        room.gameState.deck = deck;
        room.gameState.round++;
        room.gameState.dealerIndex = (room.gameState.dealerIndex + 1) % activePlayers.length;
        room.gameState.startingPlayerIndex = findNextPlayer(room.gameState.players, room.gameState.dealerIndex);
        room.gameState.currentPlayerId = room.gameState.players[room.gameState.startingPlayerIndex].id;

        setTimeout(() => {
          io.to(roomCode).emit('turnUpdate', {
            currentPlayerId: room.gameState.currentPlayerId,
            players: room.gameState.players
          });

          const newCurrentPlayer = room.gameState.players[room.gameState.startingPlayerIndex];
          if (newCurrentPlayer.id.startsWith('bot_')) {
            setTimeout(() => botPlay(newCurrentPlayer, roomCode), 1000);
          }
        }, 6500);
      } else {
        room.gameState.currentPlayerId = players[nextIndex].id;
        io.to(roomCode).emit('turnUpdate', {
          currentPlayerId: room.gameState.currentPlayerId,
          players: room.gameState.players
        });

        const newCurrentPlayer = players[nextIndex];
        if (newCurrentPlayer.id.startsWith('bot_')) {
          setTimeout(() => botPlay(newCurrentPlayer, roomCode), 1000);
        }
      }
    }, 500);
  });

  socket.on('disconnect', () => {
    log(`User disconnected: ${socket.id}`);
    rooms.forEach((room, roomCode) => {
      const playerIndex = room.players.findIndex(p => p.id === socket.id);
      if (playerIndex !== -1) {
        const player = room.players[playerIndex];
        log(`${player.name} left`, roomCode);
        room.players.splice(playerIndex, 1);
        io.to(roomCode).emit('playerList', room.players);
        if (room.players.length === 0) {
          rooms.delete(roomCode);
        }
      }
    });
  });
});

server.listen(PORT, () => {
  log(`✅ Server running on port ${PORT}`, 'BOOT');
});