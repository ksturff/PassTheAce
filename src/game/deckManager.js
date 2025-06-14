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
  const dealt = deck.slice(0, players.length);
  players.forEach((p, i) => p.card = dealt[i]);
  return players;
}

function findNextPlayer(players, index) {
  let i = (index + 1) % players.length;
  while (players[i].eliminated) {
    i = (i + 1) % players.length;
  }
  return i;
}

module.exports = {
  createDeck,
  dealCards,
  findNextPlayer
};
