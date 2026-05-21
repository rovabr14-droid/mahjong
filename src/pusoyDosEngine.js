'use strict';

// Pusoy Dos — Philippine card game (Big Two variant)
// 4 players, 52 cards. Play singles, pairs, triples, 5-card hands
// Lowest: 3♦, Highest: 2♠. Must beat previous play.

const SUIT_ORDER = ['♦','♣','♥','♠']; // ♦ lowest, ♠ highest
const RANK_ORDER = ['3','4','5','6','7','8','9','10','J','Q','K','A','2'];

function buildDeck() {
  const deck = [];
  let id = 0;
  for (const suit of SUIT_ORDER)
    for (const rank of RANK_ORDER)
      deck.push({ id: id++, suit, rank, rankIdx: RANK_ORDER.indexOf(rank), suitIdx: SUIT_ORDER.indexOf(suit) });
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

function cardScore(card) { return card.rankIdx * 4 + card.suitIdx; }

function handType(cards) {
  if (cards.length === 1) return { type: 'single', score: cardScore(cards[0]) };
  if (cards.length === 2) {
    if (cards[0].rank === cards[1].rank) {
      const score = Math.max(...cards.map(cardScore));
      return { type: 'pair', score };
    }
    return null;
  }
  if (cards.length === 3) {
    if (cards.every(c => c.rank === cards[0].rank)) {
      const score = Math.max(...cards.map(cardScore));
      return { type: 'triple', score };
    }
    return null;
  }
  if (cards.length === 5) return fiveCardType(cards);
  return null;
}

function fiveCardType(cards) {
  const ranks = cards.map(c => c.rankIdx).sort((a,b)=>a-b);
  const suits = cards.map(c => c.suitIdx);
  const isFlush = suits.every(s => s === suits[0]);
  const rankCounts = {};
  for (const r of ranks) rankCounts[r] = (rankCounts[r]||0)+1;
  const counts = Object.values(rankCounts).sort((a,b)=>b-a);
  const isStr = ranks[4]-ranks[0]===4 && new Set(ranks).size===5;
  const highCard = Math.max(...cards.map(cardScore));

  if (isFlush && isStr) return { type: 'straight-flush', score: highCard + 10000 };
  if (counts[0]===4) return { type: 'four-of-a-kind', score: highCard + 8000 };
  if (counts[0]===3&&counts[1]===2) return { type: 'full-house', score: highCard + 6000 };
  if (isFlush) return { type: 'flush', score: highCard + 4000 };
  if (isStr) return { type: 'straight', score: highCard + 2000 };
  if (counts[0]===3) return { type: 'three-of-a-kind', score: highCard };
  return null;
}

function beats(newPlay, lastPlay) {
  if (!lastPlay) return true;
  if (newPlay.cards.length !== lastPlay.cards.length) return false;
  const nh = handType(newPlay.cards);
  const lh = handType(lastPlay.cards);
  if (!nh || !lh) return false;
  if (nh.type !== lh.type) {
    // 5-card hands: straight < flush < full-house < four-of-a-kind < straight-flush
    const order = ['single','pair','triple','straight','flush','full-house','four-of-a-kind','straight-flush'];
    return order.indexOf(nh.type) > order.indexOf(lh.type);
  }
  return nh.score > lh.score;
}

class PusoyDosGame {
  constructor(roomId, playerIds) {
    this.roomId = roomId;
    this.playerIds = playerIds.slice(0, 4);
    this.scores = {};
    for (const id of this.playerIds) this.scores[id] = 0;
    this.state = 'playing';
    this.winner = null;
    this.hands = {};
    this.lastPlay = null;
    this.lastPlayerId = null;
    this.passCount = 0;
    this.currentTurn = 0;
    this._deal();
  }

  _deal() {
    const deck = shuffle(buildDeck());
    for (let i = 0; i < this.playerIds.length; i++) {
      this.hands[this.playerIds[i]] = deck.slice(i*13, (i+1)*13);
    }
    // Find who has 3♦ — they go first
    for (let i = 0; i < this.playerIds.length; i++) {
      if (this.hands[this.playerIds[i]].some(c => c.rank==='3'&&c.suit==='♦')) {
        this.currentTurn = i;
        break;
      }
    }
    this.lastPlay = null;
    this.lastPlayerId = null;
    this.passCount = 0;
  }

  play(playerId, cardIds) {
    if (this.playerIds[this.currentTurn] !== playerId) return { error: 'Not your turn' };
    const hand = this.hands[playerId];
    const cards = cardIds.map(id => hand.find(c => c.id === id)).filter(Boolean);
    if (cards.length !== cardIds.length) return { error: 'Cards not in hand' };

    // First play must include 3♦
    if (!this.lastPlay && this.passCount === 0) {
      if (!cards.some(c => c.rank==='3'&&c.suit==='♦')) return { error: 'First play must include 3♦' };
    }

    const play = { cards, playerId };
    if (!beats(play, this.lastPlay)) return { error: 'Does not beat last play' };

    for (const c of cards) hand.splice(hand.indexOf(c), 1);
    this.lastPlay = play;
    this.lastPlayerId = playerId;
    this.passCount = 0;

    if (hand.length === 0) {
      this.state = 'finished';
      this.winner = playerId;
      return { ok: true, won: true };
    }

    this._nextTurn();
    return { ok: true };
  }

  pass(playerId) {
    if (this.playerIds[this.currentTurn] !== playerId) return { error: 'Not your turn' };
    if (!this.lastPlay) return { error: 'Cannot pass on opening' };
    this.passCount++;
    this._nextTurn();
    // If everyone passed, last player leads new round
    if (this.passCount >= this.playerIds.length - 1) {
      this.lastPlay = null;
      this.passCount = 0;
      // Current turn is already set to the player after the last passer
      // Set to lastPlayerId
      this.currentTurn = this.playerIds.indexOf(this.lastPlayerId);
    }
    return { ok: true };
  }

  _nextTurn() {
    this.currentTurn = (this.currentTurn + 1) % this.playerIds.length;
  }

  getView(playerId) {
    const myIndex = this.playerIds.indexOf(playerId);
    return {
      myHand: this.hands[playerId] || [],
      handCounts: Object.fromEntries(this.playerIds.map(id => [id, (this.hands[id]||[]).length])),
      lastPlay: this.lastPlay ? { cards: this.lastPlay.cards, playerId: this.lastPlay.playerId } : null,
      currentTurn: this.currentTurn,
      myIndex,
      scores: this.scores,
      state: this.state,
      winner: this.winner,
      players: this.playerIds,
    };
  }
}

module.exports = { PusoyDosGame, handType, beats, RANK_ORDER, SUIT_ORDER };
