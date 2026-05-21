'use strict';

// Tongits — Philippine card game
// Standard 52-card deck, 3 players
// Win by: Tong-its (empty hand), calling Fight/Draw, or lowest points

const SUITS = ['♠','♥','♦','♣'];
const RANKS = ['A','2','3','4','5','6','7','8','9','10','J','Q','K'];
const RANK_VALS = { A:1,'2':2,'3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,J:10,Q:10,K:10 };

function buildDeck() {
  const deck = [];
  let id = 0;
  for (const suit of SUITS)
    for (const rank of RANKS)
      deck.push({ id: id++, suit, rank, value: RANK_VALS[rank] });
  return deck;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function cardKey(card) { return `${card.rank}${card.suit}`; }
function handPoints(hand) { return hand.reduce((s, c) => s + c.value, 0); }

// Check if cards form a valid meld (set or sequence)
function isValidMeld(cards) {
  if (cards.length < 3) return false;
  // Set: same rank
  if (cards.every(c => c.rank === cards[0].rank)) return true;
  // Sequence: same suit, consecutive ranks
  if (cards.every(c => c.suit === cards[0].suit)) {
    const idxs = cards.map(c => RANKS.indexOf(c.rank)).sort((a,b) => a-b);
    for (let i = 1; i < idxs.length; i++) if (idxs[i] !== idxs[i-1]+1) return false;
    return true;
  }
  return false;
}

// Check if card can be added to existing meld
function canAddToMeld(card, meld) {
  const test = [...meld, card];
  if (isValidMeld(test)) return true;
  return false;
}

class TongitsGame {
  constructor(roomId, playerIds) {
    this.roomId = roomId;
    this.playerIds = playerIds.slice(0, 3);
    this.scores = {};
    for (const id of this.playerIds) this.scores[id] = 0;
    this.state = 'playing';
    this.winner = null;
    this.hands = {};
    this.melds = {}; // exposed melds per player
    this.stockpile = [];
    this.discardPile = [];
    this.currentTurn = 0;
    this.drawnThisTurn = false;
    this.fightCalled = false;
    this._deal();
  }

  _deal() {
    const deck = shuffle(buildDeck());
    // Dealer gets 13, others get 12
    this.hands[this.playerIds[0]] = deck.slice(0, 13);
    this.hands[this.playerIds[1]] = deck.slice(13, 25);
    this.hands[this.playerIds[2]] = deck.slice(25, 37);
    for (const id of this.playerIds) this.melds[id] = [];
    this.stockpile = deck.slice(37);
    this.discardPile = [];
    this.currentTurn = 0;
    this.drawnThisTurn = false;
  }

  draw(playerId) {
    if (this.playerIds[this.currentTurn] !== playerId) return { error: 'Not your turn' };
    if (this.drawnThisTurn) return { error: 'Already drew' };
    if (this.stockpile.length === 0) {
      this.state = 'finished';
      this._resolveNoStock();
      return { ok: true, stockEmpty: true };
    }
    const card = this.stockpile.pop();
    this.hands[playerId].push(card);
    this.drawnThisTurn = true;
    return { ok: true, card };
  }

  pickupDiscard(playerId) {
    if (this.playerIds[this.currentTurn] !== playerId) return { error: 'Not your turn' };
    if (this.drawnThisTurn) return { error: 'Already drew' };
    if (this.discardPile.length === 0) return { error: 'No discard' };
    const card = this.discardPile.pop();
    this.hands[playerId].push(card);
    this.drawnThisTurn = true;
    return { ok: true, card };
  }

  discard(playerId, cardId) {
    if (this.playerIds[this.currentTurn] !== playerId) return { error: 'Not your turn' };
    if (!this.drawnThisTurn) return { error: 'Draw first' };
    const hand = this.hands[playerId];
    const idx = hand.findIndex(c => c.id === cardId);
    if (idx === -1) return { error: 'Card not in hand' };
    const [card] = hand.splice(idx, 1);
    this.discardPile.push(card);
    this.drawnThisTurn = false;

    // Check Tong-its (empty hand)
    if (hand.length === 0) {
      this.state = 'finished';
      this.winner = playerId;
      return { ok: true, tongits: true };
    }

    this.currentTurn = (this.currentTurn + 1) % this.playerIds.length;
    return { ok: true };
  }

  exposeMeld(playerId, cardIds) {
    if (this.playerIds[this.currentTurn] !== playerId) return { error: 'Not your turn' };
    const hand = this.hands[playerId];
    const cards = cardIds.map(id => hand.find(c => c.id === id)).filter(Boolean);
    if (cards.length !== cardIds.length) return { error: 'Cards not in hand' };
    if (!isValidMeld(cards)) return { error: 'Invalid meld' };
    for (const c of cards) hand.splice(hand.indexOf(c), 1);
    this.melds[playerId].push(cards);
    return { ok: true };
  }

  callFight(playerId) {
    // Challenge others — lowest hand wins
    this.state = 'finished';
    let minPts = Infinity, winnerId = null;
    for (const id of this.playerIds) {
      const pts = handPoints(this.hands[id]);
      if (pts < minPts) { minPts = pts; winnerId = id; }
    }
    this.winner = winnerId;
    this.fightCalled = true;
    return { ok: true, winner: winnerId };
  }

  _resolveNoStock() {
    let minPts = Infinity, winnerId = null;
    for (const id of this.playerIds) {
      const pts = handPoints(this.hands[id]);
      if (pts < minPts) { minPts = pts; winnerId = id; }
    }
    this.winner = winnerId;
  }

  getView(playerId) {
    const myIndex = this.playerIds.indexOf(playerId);
    return {
      myHand: this.hands[playerId] || [],
      handCounts: Object.fromEntries(this.playerIds.map(id => [id, (this.hands[id]||[]).length])),
      melds: this.melds,
      topDiscard: this.discardPile[this.discardPile.length - 1] || null,
      discardCount: this.discardPile.length,
      stockCount: this.stockpile.length,
      currentTurn: this.currentTurn,
      myIndex,
      drawnThisTurn: this.drawnThisTurn,
      scores: this.scores,
      state: this.state,
      winner: this.winner,
      players: this.playerIds,
      handPoints: Object.fromEntries(this.playerIds.map(id => [id, handPoints(this.hands[id]||[])])),
    };
  }
}

module.exports = { TongitsGame, isValidMeld, SUITS, RANKS };
