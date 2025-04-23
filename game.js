
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const suits = ["♠", "♥", "♦", "♣"];
const ranks = [2, 3, 4, 5, 6, 7, 8, 9, 10, "J", "Q", "K", "A"];

let players = [];
let dealerCard = null;
let currentPlayerIndex = 0;

function createDeck() {
  let deck = [];
  for (let suit of suits) {
    for (let rank of ranks) {
      deck.push({ suit, rank });
    }
  }
  return deck.sort(() => Math.random() - 0.5);
}

function dealCards(deck, count) {
  return deck.splice(0, count);
}

function getCardValue(card) {
  if (typeof card.rank === "number") return card.rank;
  return { "J": 11, "Q": 12, "K": 13, "A": 14 }[card.rank];
}

function drawPlayers() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  players.forEach((p, i) => {
    ctx.fillText(`Player ${i + 1}: ${p.card ? p.card.rank + p.card.suit : '?'}`, 20, 30 + i * 20);
  });
  if (dealerCard) {
    ctx.fillText(`Dealer: ${dealerCard.rank + dealerCard.suit}`, 800, 30);
  }
}

function startGame() {
  let deck = createDeck();
  players = Array.from({ length: 10 }, (_, i) => ({ id: i + 1, card: null }));
  players.forEach(p => p.card = dealCards(deck, 1)[0]);
  dealerCard = dealCards(deck, 1)[0];

  players.sort((a, b) => getCardValue(b.card) - getCardValue(a.card));
  currentPlayerIndex = 0;

  drawPlayers();
  document.getElementById("nextBtn").style.display = "inline";
}

function nextTurn() {
  if (currentPlayerIndex < players.length) {
    console.log(`Player ${players[currentPlayerIndex].id} takes their turn...`);
    currentPlayerIndex++;
  } else {
    console.log("Round complete. Show cards.");
  }
}
