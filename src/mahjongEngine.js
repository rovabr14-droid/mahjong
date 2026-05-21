'use strict';

// ── Tile Definitions ──────────────────────────────────────────────────────────
// Filipino Mahjong: Bamboo, Characters, Circles + Honors + Flowers/Seasons
const SUITS = ['bamboo', 'characters', 'circles'];
const WINDS = ['East', 'South', 'West', 'North'];
const DRAGONS = ['White', 'Green', 'Red']; // Haku, Hatsu, Chun
const FLOWERS = ['Plum', 'Orchid', 'Chrysanthemum', 'Bamboo']; // bonus
const SEASONS = ['Spring', 'Summer', 'Autumn', 'Winter'];       // bonus

const SUIT_SYMBOLS = { bamboo: '🎋', characters: '萬', circles: '●' };
const WIND_SYMBOLS = { East: '東', South: '南', West: '西', North: '北' };
const DRAGON_SYMBOLS = { White: '白', Green: '發', Red: '中' };

function buildTileSet() {
  const tiles = [];
  let id = 0;

  // Suited tiles: 4 copies of 1-9 in each suit
  for (const suit of SUITS) {
    for (let n = 1; n <= 9; n++) {
      for (let copy = 0; copy < 4; copy++) {
        tiles.push({ id: id++, type: 'suited', suit, number: n });
      }
    }
  }

  // Wind tiles: 4 copies each
  for (const wind of WINDS) {
    for (let copy = 0; copy < 4; copy++) {
      tiles.push({ id: id++, type: 'wind', wind });
    }
  }

  // Dragon tiles: 4 copies each
  for (const dragon of DRAGONS) {
    for (let copy = 0; copy < 4; copy++) {
      tiles.push({ id: id++, type: 'dragon', dragon });
    }
  }

  // Flower tiles: 1 copy each (bonus)
  for (const flower of FLOWERS) {
    tiles.push({ id: id++, type: 'flower', flower, bonus: true });
  }

  // Season tiles: 1 copy each (bonus)
  for (const season of SEASONS) {
    tiles.push({ id: id++, type: 'season', season, bonus: true });
  }

  return tiles; // 144 tiles total
}

function tileKey(tile) {
  if (tile.type === 'suited') return `${tile.suit}_${tile.number}`;
  if (tile.type === 'wind') return `wind_${tile.wind}`;
  if (tile.type === 'dragon') return `dragon_${tile.dragon}`;
  if (tile.type === 'flower') return `flower_${tile.flower}`;
  if (tile.type === 'season') return `season_${tile.season}`;
  return 'unknown';
}

function tileLabel(tile) {
  if (tile.type === 'suited') return `${tile.number}${SUIT_SYMBOLS[tile.suit]}`;
  if (tile.type === 'wind') return WIND_SYMBOLS[tile.wind];
  if (tile.type === 'dragon') return DRAGON_SYMBOLS[tile.dragon];
  if (tile.type === 'flower') return `🌸${tile.flower[0]}`;
  if (tile.type === 'season') return `🍂${tile.season[0]}`;
  return '?';
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// ── Hand Analysis ─────────────────────────────────────────────────────────────
function groupByKey(tiles) {
  const map = {};
  for (const t of tiles) {
    const k = tileKey(t);
    if (!map[k]) map[k] = [];
    map[k].push(t);
  }
  return map;
}

function canFormSequence(suit, number, groups) {
  const k1 = `${suit}_${number}`;
  const k2 = `${suit}_${number + 1}`;
  const k3 = `${suit}_${number + 2}`;
  return groups[k1]?.length >= 1 && groups[k2]?.length >= 1 && groups[k3]?.length >= 1;
}

function removeFromGroups(keys, groups) {
  const newG = {};
  for (const [k, v] of Object.entries(groups)) newG[k] = [...v];
  for (const k of keys) {
    if (newG[k]) {
      newG[k].splice(0, 1);
      if (newG[k].length === 0) delete newG[k];
    }
  }
  return newG;
}

function isCompleteHand(tiles) {
  // Standard: 4 sets (pung/kong/chow) + 1 pair = 14 tiles (excl. bonus)
  const mainTiles = tiles.filter(t => !t.bonus);
  if (mainTiles.length !== 14) return false;
  const groups = groupByKey(mainTiles);
  return tryComplete(groups, false);
}

function tryComplete(groups, foundPair) {
  const keys = Object.keys(groups);
  if (keys.length === 0) return foundPair;

  const key = keys[0];
  const tile = groups[key][0];

  // Try as pair
  if (!foundPair && groups[key].length >= 2) {
    const ng = removeFromGroups([key, key], groups);
    if (tryComplete(ng, true)) return true;
  }

  // Try as pung (triplet)
  if (groups[key].length >= 3) {
    const ng = removeFromGroups([key, key, key], groups);
    if (tryComplete(ng, foundPair)) return true;
  }

  // Try as chow (sequence) - suited tiles only
  if (tile.type === 'suited' && tile.number <= 7) {
    const { suit, number } = tile;
    if (canFormSequence(suit, number, groups)) {
      const ng = removeFromGroups(
        [`${suit}_${number}`, `${suit}_${number + 1}`, `${suit}_${number + 2}`],
        groups
      );
      if (tryComplete(ng, foundPair)) return true;
    }
  }

  return false;
}

// Check if can pung (3 of same tile from discard)
function canPung(hand, discardedTile) {
  const k = tileKey(discardedTile);
  return hand.filter(t => tileKey(t) === k).length >= 2;
}

// Check if can kong (4 of same tile)
function canKong(hand, discardedTile) {
  const k = tileKey(discardedTile);
  return hand.filter(t => tileKey(t) === k).length >= 3;
}

// Check if can chow (sequence from left player only)
function canChow(hand, discardedTile, playerIndex, discardPlayerIndex) {
  if ((discardPlayerIndex + 1) % 4 !== playerIndex) return false;
  if (discardedTile.type !== 'suited') return false;
  const { suit, number } = discardedTile;
  const nums = hand.filter(t => t.type === 'suited' && t.suit === suit).map(t => t.number);
  return [
    [number - 2, number - 1],
    [number - 1, number + 1],
    [number + 1, number + 2],
  ].some(([a, b]) => a >= 1 && b <= 9 && nums.includes(a) && nums.includes(b));
}

// ── Scoring ───────────────────────────────────────────────────────────────────
function scoreHand(hand, bonusTiles, winType, seatWind, prevailingWind, melds) {
  let points = 0;
  const bonusCount = bonusTiles.length;

  // Base points for win
  points += winType === 'self-draw' ? 2 : 1;

  // Bonus tiles
  points += bonusCount;

  // Pungs/Kongs in melds
  for (const meld of melds) {
    if (meld.type === 'pung') {
      const t = meld.tiles[0];
      const isHonor = t.type === 'wind' || t.type === 'dragon';
      points += isHonor ? 2 : 1;
    }
    if (meld.type === 'kong') {
      const t = meld.tiles[0];
      const isHonor = t.type === 'wind' || t.type === 'dragon';
      points += isHonor ? 4 : 2;
    }
  }

  return Math.max(points, 1);
}

// ── Game State ────────────────────────────────────────────────────────────────
class MahjongGame {
  constructor(roomId, playerIds) {
    this.roomId = roomId;
    this.playerIds = [...playerIds];
    this.scores = {};
    for (const id of playerIds) this.scores[id] = 2000; // start with 2000 pts
    this.prevailingWind = 'East';
    this.dealerIndex = 0;
    this.round = 0;
    this.state = 'waiting';
    this.startRound();
  }

  startRound() {
    this.round++;
    const allTiles = shuffle(buildTileSet());
    this.wall = allTiles;
    this.wallIndex = 0;
    this.discardPile = []; // [{tile, playerId}]
    this.lastDiscard = null;
    this.lastDiscardPlayer = null;
    this.currentTurn = this.dealerIndex;
    this.state = 'playing';
    this.winner = null;
    this.winType = null;
    this.winTile = null;
    this.pendingClaim = null; // {type, playerId} when someone can claim discard

    // Hands, melds, bonus tiles
    this.hands = {};
    this.melds = {};
    this.bonusTiles = {};
    for (const id of this.playerIds) {
      this.hands[id] = [];
      this.melds[id] = [];
      this.bonusTiles[id] = [];
    }

    // Deal 13 tiles to each player
    for (let i = 0; i < 13; i++) {
      for (const id of this.playerIds) {
        this.drawAndHandleBonus(id);
      }
    }

    // Dealer gets 14th tile
    const dealer = this.playerIds[this.dealerIndex];
    this.drawAndHandleBonus(dealer);
  }

  drawTile() {
    if (this.wallIndex >= this.wall.length) return null;
    return this.wall[this.wallIndex++];
  }

  // Draw tile, automatically set aside bonus tiles and draw replacement
  drawAndHandleBonus(playerId) {
    let tile = this.drawTile();
    while (tile && tile.bonus) {
      this.bonusTiles[playerId].push(tile);
      tile = this.drawTile();
    }
    if (tile) this.hands[playerId].push(tile);
    return tile;
  }

  get wallRemaining() {
    return this.wall.length - this.wallIndex;
  }

  getPlayerView(playerId) {
    const myIndex = this.playerIds.indexOf(playerId);
    const players = this.playerIds.map((id, i) => ({
      id,
      seatWind: WINDS[i],
      isDealer: i === this.dealerIndex,
      handCount: id === playerId ? null : this.hands[id].length,
      hand: id === playerId ? this.hands[id] : null,
      melds: this.melds[id],
      bonusTiles: this.bonusTiles[id],
      score: this.scores[id],
      isCurrentTurn: i === this.currentTurn,
      seatIndex: i,
    }));

    return {
      roomId: this.roomId,
      round: this.round,
      state: this.state,
      prevailingWind: this.prevailingWind,
      wallRemaining: this.wallRemaining,
      discardPile: this.discardPile,
      lastDiscard: this.lastDiscard,
      lastDiscardPlayer: this.lastDiscardPlayer,
      currentTurn: this.currentTurn,
      myIndex,
      players,
      winner: this.winner,
      winType: this.winType,
    };
  }

  discard(playerId, tileId) {
    if (this.playerIds[this.currentTurn] !== playerId) return { error: 'Not your turn' };
    const hand = this.hands[playerId];
    const idx = hand.findIndex(t => t.id === tileId);
    if (idx === -1) return { error: 'Tile not in hand' };

    const [tile] = hand.splice(idx, 1);
    this.discardPile.push({ tile, playerId });
    this.lastDiscard = tile;
    this.lastDiscardPlayer = playerId;

    // Advance to next player
    this.currentTurn = (this.currentTurn + 1) % 4;
    const nextPlayer = this.playerIds[this.currentTurn];

    if (this.wallRemaining === 0) {
      this.state = 'draw';
      return { ok: true, event: 'draw_game' };
    }

    this.drawAndHandleBonus(nextPlayer);
    return { ok: true };
  }

  declareSelfDraw(playerId) {
    if (this.playerIds[this.currentTurn] !== playerId) return { error: 'Not your turn' };
    const hand = this.hands[playerId];
    if (!isCompleteHand([...hand, ...this.melds[playerId].flatMap(m => m.tiles)])) {
      // Try with just the hand (melds already removed)
      if (!isCompleteHand(hand)) return { error: 'Hand not complete' };
    }
    const pts = scoreHand(hand, this.bonusTiles[playerId], 'self-draw',
      WINDS[this.playerIds.indexOf(playerId)], this.prevailingWind, this.melds[playerId]);
    // Everyone pays self-draw winner
    for (const id of this.playerIds) {
      if (id !== playerId) {
        this.scores[id] -= pts;
        this.scores[playerId] += pts;
      }
    }
    this.state = 'finished';
    this.winner = playerId;
    this.winType = 'self-draw';
    return { ok: true, points: pts };
  }

  declareWin(playerId) {
    // Win on last discard
    const lastEntry = this.discardPile[this.discardPile.length - 1];
    if (!lastEntry) return { error: 'No discard to win on' };
    if (lastEntry.playerId === playerId) return { error: 'Cannot win on own discard' };
    const hand = [...this.hands[playerId], lastEntry.tile];
    if (!isCompleteHand(hand)) return { error: 'Hand not complete' };
    const pts = scoreHand(hand, this.bonusTiles[playerId], 'discard',
      WINDS[this.playerIds.indexOf(playerId)], this.prevailingWind, this.melds[playerId]);
    // Only discarder pays
    this.scores[lastEntry.playerId] -= pts * 3;
    this.scores[playerId] += pts * 3;
    this.state = 'finished';
    this.winner = playerId;
    this.winType = 'discard';
    this.winTile = lastEntry.tile;
    return { ok: true, points: pts };
  }

  declarePung(playerId) {
    const lastEntry = this.discardPile[this.discardPile.length - 1];
    if (!lastEntry) return { error: 'No discard' };
    if (!canPung(this.hands[playerId], lastEntry.tile)) return { error: 'Cannot pung' };

    const k = tileKey(lastEntry.tile);
    const hand = this.hands[playerId];
    const matching = [];
    for (let i = 0; i < hand.length && matching.length < 2; i++) {
      if (tileKey(hand[i]) === k) matching.push(i);
    }
    // Remove 2 matching tiles from hand
    const removed = matching.reverse().map(i => hand.splice(i, 1)[0]);
    const meldTiles = [...removed, lastEntry.tile];
    this.melds[playerId].push({ type: 'pung', tiles: meldTiles });
    // Remove from discard pile
    this.discardPile.pop();
    this.lastDiscard = null;

    // Set turn to punger
    this.currentTurn = this.playerIds.indexOf(playerId);
    return { ok: true };
  }

  declareChow(playerId, tileIds) {
    const lastEntry = this.discardPile[this.discardPile.length - 1];
    if (!lastEntry) return { error: 'No discard' };
    const lastDiscardPlayerIndex = this.playerIds.indexOf(lastEntry.playerId);
    const myIndex = this.playerIds.indexOf(playerId);
    if ((lastDiscardPlayerIndex + 1) % 4 !== myIndex) return { error: 'Can only chow from left player' };

    const hand = this.hands[playerId];
    // tileIds: the 2 tiles from hand to use with the discard
    const fromHand = tileIds.map(id => hand.find(t => t.id === id)).filter(Boolean);
    if (fromHand.length !== 2) return { error: 'Invalid chow tiles' };

    const allThree = [...fromHand, lastEntry.tile].sort((a, b) => a.number - b.number);
    if (allThree[0].suit !== allThree[1].suit || allThree[1].suit !== allThree[2].suit) return { error: 'Not a valid sequence' };
    if (allThree[2].number - allThree[0].number !== 2) return { error: 'Not a valid sequence' };

    // Remove tiles from hand
    for (const t of fromHand) {
      const i = hand.findIndex(h => h.id === t.id);
      if (i !== -1) hand.splice(i, 1);
    }
    this.melds[playerId].push({ type: 'chow', tiles: allThree });
    this.discardPile.pop();
    this.lastDiscard = null;
    this.currentTurn = myIndex;
    return { ok: true };
  }

  nextRound() {
    // Rotate dealer
    this.dealerIndex = (this.dealerIndex + 1) % 4;
    if (this.dealerIndex === 0) {
      const windIdx = WINDS.indexOf(this.prevailingWind);
      this.prevailingWind = WINDS[(windIdx + 1) % WINDS.length];
    }
    this.startRound();
  }
}

module.exports = { MahjongGame, tileKey, tileLabel, WINDS, DRAGONS, FLOWERS, SEASONS, SUITS };
