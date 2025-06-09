const { rooms } = require('../services/roomService');
const { createDeck, dealCards, findNextPlayer } = require('./deckManager');

function startGame(roomCode, io) {
  const room = rooms.get(roomCode);
  if (!room) return;

  const deck = createDeck();
  room.players.forEach((p, i) => p.seatIndex = i);
  const players = dealCards(room.players, deck);

  room.gameState = {
    players,
    deck,
    round: 1,
    dealerIndex: 0,
    startingPlayerIndex: 0,
    currentPlayerId: players[0].id
  };

  io.to(roomCode).emit('gameStarted', room.gameState);
  io.to(roomCode).emit('turnUpdate', {
    currentPlayerId: room.gameState.currentPlayerId,
    players: room.gameState.players
  });
}

function handlePassCard(roomCode, io) {
  const room = rooms.get(roomCode);
  if (!room || !room.gameState) return;

  const { players, currentPlayerId } = room.gameState;
  const currIdx = players.findIndex(p => p.id === currentPlayerId);
  const nextIdx = findNextPlayer(players, currIdx);

  if (players[nextIdx].card.rank === 'K') {
    io.to(roomCode).emit('errorMessage', `${players[nextIdx].name} has a King and cannot be passed to!`);
    return;
  }

  const temp = players[currIdx].card;
  players[currIdx].card = null;
  players[nextIdx].card = temp;

  io.to(roomCode).emit('cardPassed', { fromIndex: currIdx, toIndex: nextIdx });

  const newIdx = findNextPlayer(players, currIdx);
  room.gameState.currentPlayerId = players[newIdx].id;

  io.to(roomCode).emit('turnUpdate', {
    currentPlayerId: room.gameState.currentPlayerId,
    players: room.gameState.players
  });
}

function handleKeepCard(roomCode, io) {
  const room = rooms.get(roomCode);
  if (!room || !room.gameState) return;

  const { players, currentPlayerId } = room.gameState;
  const currIdx = players.findIndex(p => p.id === currentPlayerId);
  const nextIdx = findNextPlayer(players, currIdx);

  if (nextIdx === room.gameState.startingPlayerIndex) {
    const { updatedPlayers, losers } = endRound(room);
    io.to(roomCode).emit('roundEnded', { updatedPlayers, losers });

    const winner = checkGameOver(updatedPlayers);
    if (winner) {
      io.to(roomCode).emit('gameOver', { winner });
      rooms.delete(roomCode);
      return;
    }

    const newDeck = createDeck();
    const redelt = dealCards(updatedPlayers, newDeck);
    const newDealer = (room.gameState.dealerIndex + 1) % redelt.length;

    room.gameState.players = redelt;
    room.gameState.deck = newDeck;
    room.gameState.dealerIndex = newDealer;
    room.gameState.startingPlayerIndex = findNextPlayer(redelt, newDealer);
    room.gameState.currentPlayerId = redelt[room.gameState.startingPlayerIndex].id;
    room.gameState.round++;

    io.to(roomCode).emit('turnUpdate', {
      currentPlayerId: room.gameState.currentPlayerId,
      players: redelt
    });

  } else {
    room.gameState.currentPlayerId = players[nextIdx].id;
    io.to(roomCode).emit('turnUpdate', {
      currentPlayerId: room.gameState.currentPlayerId,
      players
    });
  }
}

function endRound(room) {
  const { players } = room.gameState;
  const rankMap = { 'A': 1, 'J': 11, 'Q': 12, 'K': 13 };
  const value = c => typeof c.rank === 'number' ? c.rank : rankMap[c.rank];

  const active = players.filter(p => !p.eliminated && p.card);
  const minVal = Math.min(...active.map(p => value(p.card)));
  const losers = active.filter(p => value(p.card) === minVal);

  losers.forEach(p => p.chips--);
  players.forEach(p => {
    if (p.chips <= 0) p.eliminated = true;
  });

  return { updatedPlayers: players, losers };
}

function checkGameOver(players) {
  const alive = players.filter(p => !p.eliminated);
  return alive.length === 1 ? alive[0] : null;
}

module.exports = {
  startGame,
  handlePassCard,
  handleKeepCard
};
