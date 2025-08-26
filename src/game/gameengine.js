// game/gameengine.js
const { getRoom, initRoom } = require('../services/roomService');
const { deriveRules } = require('../services/rules');

const stateByRoom = new Map();

const SUITS = ['S', 'H', 'D', 'C'];
const RANKS = [2,3,4,5,6,7,8,9,10,'J','Q','K','A'];
const RANK_VALUE = new Map([
  [2,2],[3,3],[4,4],[5,5],[6,6],[7,7],[8,8],[9,9],[10,10],
  ['J',11],['Q',12],['K',13],['A',14]
]);

function makeDeck() {
  const d = [];
  for (const s of SUITS) for (const r of RANKS) d.push({ rank: r, suit: s });
  for (let i = d.length - 1; i > 0; i--) { const j = (Math.random() * (i + 1)) | 0; [d[i], d[j]] = [d[j], d[i]]; }
  return d;
}

function alivePlayers(room) { return room.players.filter(p => !p.eliminated && (p.chips ?? 0) > 0); }

function nextActiveIndex(room, fromIndex, step) {
  const n = room.players.length; if (!n) return -1;
  let idx = fromIndex;
  for (let hops = 0; hops < n * 2; hops++) {
    idx = (idx + step + n) % n;
    const p = room.players[idx];
    if (p && !p.eliminated && p.chips > 0) return idx;
  }
  return -1;
}

function isBot(p){ return typeof p?.id === 'string' && p.id.startsWith('bot_'); }

function clearTurnTimer(roomCode) {
  const s = stateByRoom.get(roomCode);
  if (s?.turnTimer) { clearTimeout(s.turnTimer); s.turnTimer = null; }
}

function scheduleTurnTimer(roomCode, io) {
  const room = getRoom(roomCode);
  const s = stateByRoom.get(roomCode);
  clearTurnTimer(roomCode);
  if (!room || !s || s.rules.turnTimerMs <= 0) return;

  s.turnTimer = setTimeout(() => {
    const cur = room.players[s.currentIndex];
    if (!cur) return;
    // if timer hits on bot, just act like bot
    if (isBot(cur)) return botAct(roomCode, io);
    // human timeout falls back to default
    if (s.rules.timeoutAction === 'pass') handlePassCard(roomCode, io, { isTimeout: true });
    else handleKeepCard(roomCode, io, { isTimeout: true });
  }, s.rules.turnTimerMs);
}

function dealOneEach(room) {
  const s = stateByRoom.get(room.code);
  s.deck = makeDeck();
  alivePlayers(room).forEach(p => { p.card = s.deck.pop(); });
}

function startRound(roomCode, io) {
  const room = initRoom(roomCode);
  const s = stateByRoom.get(roomCode);
  if (s.dealerIndex == null) {
    s.dealerIndex = room.players.findIndex(p => !p.eliminated && p.chips > 0);
    if (s.dealerIndex < 0) s.dealerIndex = 0;
  } else {
    s.dealerIndex = nextActiveIndex(room, s.dealerIndex, +1);
  }

  dealOneEach(room);

  const step = s.rules.passStep >= 0 ? +1 : -1;
  s.currentIndex = nextActiveIndex(room, s.dealerIndex, step);
  s.turnsTaken = 0;

  io.to(roomCode).emit('gameStarted', {
    players: room.players,
    currentPlayerId: room.players[s.currentIndex]?.id,
    mode: room.options.mode,
    pace: room.options.pace,
    seats: room.options.seats
  });

  emitTurnUpdate(roomCode, io);
}

function emitTurnUpdate(roomCode, io) {
  const room = getRoom(roomCode);
  const s = stateByRoom.get(roomCode);
  if (!room || !s) return;
  const currentPlayer = room.players[s.currentIndex];
  const currentPlayerId = currentPlayer?.id;

  io.to(roomCode).emit('turnUpdate', {
    currentPlayerId,
    players: room.players,
    peekAllowed: s.rules.allowPeekOnTurn
  });

  // If it's a bot, let it think briefly and act
  if (isBot(currentPlayer)) {
    setTimeout(() => botAct(roomCode, io), 600);
    return;
  }

  scheduleTurnTimer(roomCode, io);
}

function endRound(roomCode, io) {
  const room = getRoom(roomCode);
  const s = stateByRoom.get(roomCode);
  if (!room || !s) return;

  let minVal = Infinity;
  for (const p of alivePlayers(room)) {
    const v = RANK_VALUE.get(p.card?.rank);
    if (v != null) minVal = Math.min(minVal, v);
  }
  const losers = [];
  for (const p of alivePlayers(room)) {
    const v = RANK_VALUE.get(p.card?.rank);
    if (v === minVal) {
      const penalty = (s.rules.kingPenalty && p.card?.rank === 'K') ? s.rules.kingPenalty : 1;
      p.chips = Math.max(0, (p.chips || 0) - penalty);
      if (p.chips === 0) p.eliminated = true;
      losers.push({ name: p.name });
    }
  }

  io.to(roomCode).emit('roundEnded', { updatedPlayers: room.players, losers });

  const alive = alivePlayers(room);
  if (alive.length <= 1) {
    const winner = alive[0] || room.players[0];
    io.to(roomCode).emit('gameOver', { winner });
    clearTurnTimer(roomCode);
    stateByRoom.delete(roomCode);
    return;
  }

  clearTurnTimer(roomCode);
  setTimeout(() => startRound(roomCode, io), 1800);
}

function startGame(roomCode, io) {
  const room = initRoom(roomCode);
  const rules = deriveRules(room.options);
  stateByRoom.set(roomCode, { rules, deck: [], currentIndex: 0, dealerIndex: null, turnsTaken: 0, turnTimer: null });

  // (Re)initialize chips for all players according to mode (so Sudden Death = 1, etc.)
  if (rules.livesPerPlayer != null) {
    room.players.forEach(p => { p.chips = rules.livesPerPlayer; p.eliminated = false; });
  }

  startRound(roomCode, io);
}

function handleKeepCard(roomCode, io, meta = {}) {
  const room = getRoom(roomCode);
  const s = stateByRoom.get(roomCode);
  if (!room || !s) return;
  clearTurnTimer(roomCode);

  s.turnsTaken++;
  s.currentIndex = nextActiveIndex(room, s.currentIndex, s.rules.passStep >= 0 ? +1 : -1);

  const aliveCount = alivePlayers(room).length;
  if (s.turnsTaken >= aliveCount) endRound(roomCode, io);
  else emitTurnUpdate(roomCode, io);
}

function handlePassCard(roomCode, io, meta = {}) {
  const room = getRoom(roomCode);
  const s = stateByRoom.get(roomCode);
  if (!room || !s) return;
  clearTurnTimer(roomCode);

  const fromIndex = s.currentIndex;
  const toIndex = nextActiveIndex(room, fromIndex, s.rules.passStep >= 0 ? +1 : -1);
  const fromPlayer = room.players[fromIndex];
  const toPlayer   = room.players[toIndex];
  if (!fromPlayer || !toPlayer) return;

  if (fromPlayer.card?.rank === 'K') {
    io.to(fromPlayer.id).emit('errorMessage', 'You have a King! You cannot pass.');
    scheduleTurnTimer(roomCode, io);
    return;
  }
  if (toPlayer.card?.rank === 'K') {
    io.to(fromPlayer.id).emit('errorMessage', `${toPlayer.name} has a King and cannot be passed to!`);
    scheduleTurnTimer(roomCode, io);
    return;
  }

  const tmp = fromPlayer.card; fromPlayer.card = toPlayer.card; toPlayer.card = tmp;
  io.to(roomCode).emit('cardPassed', { fromIndex, toIndex });

  s.turnsTaken++;
  s.currentIndex = toIndex;

  const aliveCount = alivePlayers(room).length;
  if (s.turnsTaken >= aliveCount) endRound(roomCode, io);
  else emitTurnUpdate(roomCode, io);
}

// ---------- very simple bot logic ----------
function botAct(roomCode, io) {
  const room = getRoom(roomCode);
  const s = stateByRoom.get(roomCode);
  if (!room || !s) return;

  const cur = room.players[s.currentIndex];
  if (!isBot(cur)) { scheduleTurnTimer(roomCode, io); return; }

  const rank = cur.card?.rank;
  if (rank === 'K') return handleKeepCard(roomCode, io); // cannot pass

  const val = RANK_VALUE.get(rank) || 0;

  // Decide: pass if low (<=8), keep if high (>=10), coin-flip on 9
  let wantPass = (val <= 8) || (val === 9 && Math.random() < 0.5);
  // avoid passing to a King (server enforces this too)
  const toIndex = nextActiveIndex(room, s.currentIndex, s.rules.passStep >= 0 ? +1 : -1);
  const toPlayer = room.players[toIndex];
  if (toPlayer?.card?.rank === 'K') wantPass = false;

  if (wantPass) handlePassCard(roomCode, io);
  else handleKeepCard(roomCode, io);
}

module.exports = { startGame, handlePassCard, handleKeepCard };
