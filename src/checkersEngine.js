'use strict';

// Filipino/International Draughts-style Checkers
// r = red piece, R = red king, b = black piece, B = black king

function initBoard() {
  const board = Array(8).fill(null).map(() => Array(8).fill(null));
  for (let row = 0; row < 8; row++) {
    for (let col = 0; col < 8; col++) {
      if ((row + col) % 2 === 1) {
        if (row < 3) board[row][col] = 'b';
        if (row > 4) board[row][col] = 'r';
      }
    }
  }
  return board;
}

function isRed(p) { return p === 'r' || p === 'R'; }
function isBlack(p) { return p === 'b' || p === 'B'; }
function isKing(p) { return p === 'R' || p === 'B'; }
function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

function getJumps(board, row, col, piece) {
  const jumps = [];
  const dirs = isKing(piece)
    ? [[-1,-1],[-1,1],[1,-1],[1,1]]
    : isRed(piece) ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]];

  for (const [dr, dc] of dirs) {
    const mr = row + dr, mc = col + dc;
    const lr = row + 2*dr, lc = col + 2*dc;
    if (!inBounds(lr, lc)) continue;
    const mid = board[mr]?.[mc];
    const land = board[lr][lc];
    if (!mid || !land === false) continue; // land must be empty
    if (land !== null) continue;
    if (isRed(piece) && isBlack(mid)) jumps.push({ to: [lr, lc], captured: [mr, mc] });
    if (isBlack(piece) && isRed(mid)) jumps.push({ to: [lr, lc], captured: [mr, mc] });
  }
  return jumps;
}

function getMoves(board, row, col) {
  const piece = board[row][col];
  if (!piece) return { moves: [], jumps: [] };

  const jumps = getJumps(board, row, col, piece);
  const moves = [];

  if (jumps.length === 0) {
    const dirs = isKing(piece)
      ? [[-1,-1],[-1,1],[1,-1],[1,1]]
      : isRed(piece) ? [[-1,-1],[-1,1]] : [[1,-1],[1,1]];
    for (const [dr, dc] of dirs) {
      const r = row+dr, c = col+dc;
      if (inBounds(r, c) && !board[r][c]) moves.push([r, c]);
    }
  }

  return { moves, jumps };
}

function applyMove(board, from, to, captured) {
  const nb = board.map(r => [...r]);
  let piece = nb[from[0]][from[1]];
  nb[from[0]][from[1]] = null;
  if (captured) nb[captured[0]][captured[1]] = null;
  // Kinging
  if (piece === 'r' && to[0] === 0) piece = 'R';
  if (piece === 'b' && to[0] === 7) piece = 'B';
  nb[to[0]][to[1]] = piece;
  return nb;
}

function hasAnyMoves(board, redTurn) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) continue;
      if (redTurn && !isRed(p)) continue;
      if (!redTurn && !isBlack(p)) continue;
      const { moves, jumps } = getMoves(board, r, c);
      if (moves.length > 0 || jumps.length > 0) return true;
    }
  }
  return false;
}

function mustJump(board, redTurn) {
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) continue;
      if (redTurn && !isRed(p)) continue;
      if (!redTurn && !isBlack(p)) continue;
      if (getJumps(board, r, c, p).length > 0) return true;
    }
  }
  return false;
}

class CheckersGame {
  constructor(roomId, players) {
    this.roomId = roomId;
    this.players = players; // [redId, blackId]
    this.board = initBoard();
    this.redTurn = true;
    this.state = 'playing';
    this.winner = null;
    this.lastMove = null;
    this.multiJumpPiece = null; // position of piece doing multi-jump
  }

  getView(playerId) {
    const color = this.players[0] === playerId ? 'red' : 'black';
    return {
      board: this.board,
      redTurn: this.redTurn,
      myColor: color,
      state: this.state,
      winner: this.winner,
      lastMove: this.lastMove,
      players: this.players,
      multiJumpPiece: this.multiJumpPiece,
    };
  }

  getValidMoves(playerId, row, col) {
    const myColor = this.players[0] === playerId ? 'red' : 'black';
    const isMyTurn = (myColor === 'red') === this.redTurn;
    if (!isMyTurn) return { moves: [], jumps: [] };

    const piece = this.board[row][col];
    if (!piece) return { moves: [], jumps: [] };
    if (myColor === 'red' && !isRed(piece)) return { moves: [], jumps: [] };
    if (myColor === 'black' && !isBlack(piece)) return { moves: [], jumps: [] };

    // If multi-jump in progress, only that piece can move
    if (this.multiJumpPiece && (this.multiJumpPiece[0] !== row || this.multiJumpPiece[1] !== col)) {
      return { moves: [], jumps: [] };
    }

    const { moves, jumps } = getMoves(this.board, row, col);

    // Must jump if available
    if (!this.multiJumpPiece && mustJump(this.board, this.redTurn)) {
      return { moves: [], jumps };
    }

    return { moves: this.multiJumpPiece ? [] : moves, jumps };
  }

  move(playerId, from, to) {
    const myColor = this.players[0] === playerId ? 'red' : 'black';
    const isMyTurn = (myColor === 'red') === this.redTurn;
    if (!isMyTurn) return { error: 'Not your turn' };
    if (this.state !== 'playing') return { error: 'Game over' };

    const { moves, jumps } = this.getValidMoves(playerId, from[0], from[1]);
    const isJump = jumps.some(j => j.to[0] === to[0] && j.to[1] === to[1]);
    const isMove = moves.some(([r,c]) => r === to[0] && c === to[1]);

    if (!isJump && !isMove) return { error: 'Invalid move' };

    let capturedPos = null;
    if (isJump) {
      const jump = jumps.find(j => j.to[0] === to[0] && j.to[1] === to[1]);
      capturedPos = jump.captured;
    }

    this.board = applyMove(this.board, from, to, capturedPos);
    this.lastMove = { from, to };

    // Check for multi-jump
    if (isJump) {
      const moreJumps = getJumps(this.board, to[0], to[1], this.board[to[0]][to[1]]);
      if (moreJumps.length > 0) {
        this.multiJumpPiece = to;
        return { ok: true, multiJump: true };
      }
    }

    this.multiJumpPiece = null;
    this.redTurn = !this.redTurn;

    if (!hasAnyMoves(this.board, this.redTurn)) {
      this.state = 'finished';
      this.winner = myColor;
    }

    return { ok: true };
  }
}

module.exports = { CheckersGame, isRed, isBlack, isKing };
