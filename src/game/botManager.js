const { v4: uuidv4 } = require('uuid');
const { findNextPlayer } = require('./deckManager');

function fillRoomWithBots(room, io, roomCode) {
  const maxPlayers = 10;
  const needed = maxPlayers - room.players.length;
  if (needed <= 0) return;

  for (let i = 0; i < needed; i++) {
    const botId = `bot_${uuidv4()}`;
    const botName = `Bot_${Math.floor(Math.random() * 9000 + 1000)}`;
    const bot = { id: botId, name: botName, chips: 5, eliminated: false, seatIndex: room.players.length };
    room.players.push(bot);
  }
  io.to(roomCode).emit('playerList', room.players);
  io.emit('lobbyUpdate', require('./services/roomService').getAllRooms()); // Updated to getAllRooms
}

function handleBotTurn(room, io, roomCode) {
  const { players, currentPlayerId } = room.gameState;
  const bot = players.find(p => p.id === currentPlayerId);

  if (!bot || !bot.id.startsWith('bot_') || bot.eliminated) return;

  const card = bot.card;
  let action = 'keep';

  if (card.rank === 'A') {
    action = Math.random() < 0.9 ? 'pass' : 'keep';
  } else if (card.rank === 'K') {
    action = 'keep';
  } else {
    action = Math.random() < 0.5 ? 'pass' : 'keep';
  }

  setTimeout(() => {
    if (action === 'pass') {
      console.log(`🤖 ${bot.name} (bot) passes`);
      const currIdx = players.findIndex(p => p.id === bot.id);
      const nextIdx = findNextPlayer(players, currIdx);
      const next = players[nextIdx];

      if (next.card?.rank === 'K') {
        console.log(`🛑 ${next.name} has a King — bot keeping instead`);
        action = 'keep';
      } else {
        const temp = bot.card;
        bot.card = null;
        next.card = temp;
        io.to(roomCode).emit('cardPassed', { fromIndex: currIdx, toIndex: nextIdx });
        room.gameState.currentPlayerId = players[findNextPlayer(players, currIdx)].id;
        io.to(roomCode).emit('turnUpdate', {
          currentPlayerId: room.gameState.currentPlayerId,
          players
        });
        return handleBotTurn(room, io, roomCode);
      }
    }

    if (action === 'keep') {
      console.log(`🤖 ${bot.name} (bot) keeps`);
      const currIdx = players.findIndex(p => p.id === bot.id);
      const nextIdx = findNextPlayer(players, currIdx);
      const isEndOfRound = nextIdx === room.gameState.startingPlayerIndex;

      if (isEndOfRound) {
        const { updatedPlayers, losers } = require('./gameengine').endRound(room);
        io.to(roomCode).emit('roundEnded', { updatedPlayers, losers });

        const winner = require('./gameengine').checkGameOver(updatedPlayers);
        if (winner) {
          io.to(roomCode).emit('gameOver', { winner });
          return;
        }

        const newDeck = require('./deckManager').createDeck();
        const redelt = require('./deckManager').dealCards(updatedPlayers, newDeck);
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

        return handleBotTurn(room, io, roomCode);
      } else {
        room.gameState.currentPlayerId = players[nextIdx].id;
        io.to(roomCode).emit('turnUpdate', {
          currentPlayerId: room.gameState.currentPlayerId,
          players
        });

        return handleBotTurn(room, io, roomCode);
      }
    }
  }, 1000);
}

module.exports = { fillRoomWithBots, handleBotTurn };