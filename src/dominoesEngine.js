'use strict';

function buildDominoes() {
  const tiles = [];
  let id = 0;
  for (let a = 0; a <= 6; a++)
    for (let b = a; b <= 6; b++)
      tiles.push({ id: id++, a, b });
  return tiles;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

class DominoesGame {
  constructor(roomId, playerIds) {
    this.roomId = roomId;
    this.playerIds = playerIds;
    this.scores = {};
    for (const id of playerIds) this.scores[id] = 0;
    this.state = 'playing';
    this.winner = null;
    this.board = [];
    this.leftEnd = null;
    this.rightEnd = null;
    this.hands = {};
    this.boneyard = [];
    this.currentTurn = 0;
    this.passCount = 0;
    this._deal();
  }

  _deal() {
    const all = shuffle(buildDominoes());
    const perPlayer = this.playerIds.length === 2 ? 7 : 6;
    for (let i = 0; i < this.playerIds.length; i++) {
      this.hands[this.playerIds[i]] = all.slice(i * perPlayer, (i + 1) * perPlayer);
    }
    this.boneyard = all.slice(this.playerIds.length * perPlayer);
    // Find who has highest double to go first
    let bestPlayer = 0, bestVal = -1;
    for (let i = 0; i < this.playerIds.length; i++) {
      for (const t of this.hands[this.playerIds[i]]) {
        if (t.a === t.b && t.a > bestVal) { bestVal = t.a; bestPlayer = i; }
      }
    }
    this.currentTurn = bestPlayer;
  }

  getValidMoves(playerId) {
    const hand = this.hands[playerId];
    if (!hand) return [];
    if (this.board.length === 0) return hand.map(t => ({ tile: t, side: 'any' }));
    const moves = [];
    const seen = new Set();
    for (const tile of hand) {
      if ([tile.a, tile.b].includes(this.leftEnd)) {
        const k = `${tile.id}-left`;
        if (!seen.has(k)) { seen.add(k); moves.push({ tile, side: 'left' }); }
      }
      if ([tile.a, tile.b].includes(this.rightEnd)) {
        const k = `${tile.id}-right`;
        if (!seen.has(k)) { seen.add(k); moves.push({ tile, side: 'right' }); }
      }
    }
    return moves;
  }

  canDraw(playerId) {
    return this.boneyard.length > 0 && this.getValidMoves(playerId).length === 0;
  }

  draw(playerId) {
    if (!this.canDraw(playerId)) return { error: 'Cannot draw' };
    const tile = this.boneyard.pop();
    this.hands[playerId].push(tile);
    return { ok: true, tile };
  }

  play(playerId, tileId, side) {
    if (this.playerIds[this.currentTurn] !== playerId) return { error: 'Not your turn' };
    const hand = this.hands[playerId];
    // Convert tileId to number to ensure type match
    const numId = Number(tileId);
    const idx = hand.findIndex(t => t.id === numId);
    if (idx === -1) return { error: 'Tile not in hand' };
    const tile = hand[idx];

    if (this.board.length === 0) {
      hand.splice(idx, 1);
      this.board.push({ tile, flipped: false });
      this.leftEnd = tile.a;
      this.rightEnd = tile.b;
    } else if (side === 'left') {
      if (tile.a === this.leftEnd) {
        hand.splice(idx, 1);
        this.board.unshift({ tile, flipped: true });
        this.leftEnd = tile.b;
      } else if (tile.b === this.leftEnd) {
        hand.splice(idx, 1);
        this.board.unshift({ tile, flipped: false });
        this.leftEnd = tile.a;
      } else return { error: `Tile ${tile.a}|${tile.b} doesn't match left end ${this.leftEnd}` };
    } else {
      // right or any
      if (tile.a === this.rightEnd) {
        hand.splice(idx, 1);
        this.board.push({ tile, flipped: false });
        this.rightEnd = tile.b;
      } else if (tile.b === this.rightEnd) {
        hand.splice(idx, 1);
        this.board.push({ tile, flipped: true });
        this.rightEnd = tile.a;
      } else return { error: `Tile ${tile.a}|${tile.b} doesn't match right end ${this.rightEnd}` };
    }

    this.passCount = 0;

    if (hand.length === 0) {
      this.state = 'finished';
      this.winner = playerId;
      let pts = 0;
      for (const id of this.playerIds) {
        if (id !== playerId) pts += this.hands[id].reduce((s, t) => s + t.a + t.b, 0);
      }
      this.scores[playerId] = (this.scores[playerId] || 0) + pts;
      return { ok: true, won: true, points: pts };
    }

    this._nextTurn();
    return { ok: true };
  }

  pass(playerId) {
    if (this.playerIds[this.currentTurn] !== playerId) return { error: 'Not your turn' };
    if (this.getValidMoves(playerId).length > 0) return { error: 'You have valid moves — play or draw first' };
    if (this.boneyard.length > 0) return { error: 'Draw from boneyard first' };
    this.passCount++;
    if (this.passCount >= this.playerIds.length) {
      this.state = 'finished';
      let minPips = Infinity, winnerId = null;
      for (const id of this.playerIds) {
        const pips = this.hands[id].reduce((s, t) => s + t.a + t.b, 0);
        if (pips < minPips) { minPips = pips; winnerId = id; }
      }
      this.winner = winnerId;
      return { ok: true, blocked: true };
    }
    this._nextTurn();
    return { ok: true };
  }

  _nextTurn() {
    this.currentTurn = (this.currentTurn + 1) % this.playerIds.length;
  }

  getView(playerId) {
    const myIndex = this.playerIds.indexOf(playerId);
    return {
      board: this.board,
      leftEnd: this.leftEnd,
      rightEnd: this.rightEnd,
      myHand: this.hands[playerId],
      handCounts: Object.fromEntries(this.playerIds.map(id => [id, this.hands[id].length])),
      boneyardCount: this.boneyard.length,
      currentTurn: this.currentTurn,
      myIndex,
      scores: this.scores,
      state: this.state,
      winner: this.winner,
      players: this.playerIds,
    };
  }
}

module.exports = { DominoesGame };
