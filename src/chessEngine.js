'use strict';

// Simple Chess engine for multiplayer
const PIECES = {
  K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
  k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
};

function initBoard() {
  const b = Array(8).fill(null).map(() => Array(8).fill(null));
  // Black pieces
  b[0] = ['r','n','b','q','k','b','n','r'];
  b[1] = ['p','p','p','p','p','p','p','p'];
  // White pieces
  b[6] = ['P','P','P','P','P','P','P','P'];
  b[7] = ['R','N','B','Q','K','B','N','R'];
  return b;
}

function isWhite(p) { return p && p === p.toUpperCase(); }
function isBlack(p) { return p && p === p.toLowerCase(); }
function sameColor(a, b) {
  if (!a || !b) return false;
  return (isWhite(a) && isWhite(b)) || (isBlack(a) && isBlack(b));
}

function inBounds(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

function getMovesRaw(board, row, col) {
  const piece = board[row][col];
  if (!piece) return [];
  const moves = [];
  const white = isWhite(piece);
  const p = piece.toUpperCase();

  const slide = (dr, dc) => {
    let r = row + dr, c = col + dc;
    while (inBounds(r, c)) {
      if (board[r][c]) {
        if (!sameColor(piece, board[r][c])) moves.push([r, c]);
        break;
      }
      moves.push([r, c]);
      r += dr; c += dc;
    }
  };

  if (p === 'R') { [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr,dc]) => slide(dr,dc)); }
  if (p === 'B') { [[-1,-1],[-1,1],[1,-1],[1,1]].forEach(([dr,dc]) => slide(dr,dc)); }
  if (p === 'Q') { [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]].forEach(([dr,dc]) => slide(dr,dc)); }
  if (p === 'K') {
    [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(([dr,dc]) => {
      const r = row+dr, c = col+dc;
      if (inBounds(r,c) && !sameColor(piece, board[r][c])) moves.push([r,c]);
    });
  }
  if (p === 'N') {
    [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr,dc]) => {
      const r = row+dr, c = col+dc;
      if (inBounds(r,c) && !sameColor(piece, board[r][c])) moves.push([r,c]);
    });
  }
  if (p === 'P') {
    const dir = white ? -1 : 1;
    const startRow = white ? 6 : 1;
    // Forward
    if (inBounds(row+dir, col) && !board[row+dir][col]) {
      moves.push([row+dir, col]);
      if (row === startRow && !board[row+2*dir][col]) moves.push([row+2*dir, col]);
    }
    // Captures
    [-1, 1].forEach(dc => {
      const r = row+dir, c = col+dc;
      if (inBounds(r,c) && board[r][c] && !sameColor(piece, board[r][c])) moves.push([r,c]);
    });
  }
  return moves;
}

function applyMove(board, from, to) {
  const newBoard = board.map(r => [...r]);
  let piece = newBoard[from[0]][from[1]];
  newBoard[from[0]][from[1]] = null;
  // Pawn promotion
  if (piece === 'P' && to[0] === 0) piece = 'Q';
  if (piece === 'p' && to[0] === 7) piece = 'q';
  newBoard[to[0]][to[1]] = piece;
  return newBoard;
}

function findKing(board, white) {
  const k = white ? 'K' : 'k';
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++)
      if (board[r][c] === k) return [r, c];
  return null;
}

function isInCheck(board, white) {
  const king = findKing(board, white);
  if (!king) return false;
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) continue;
      if (white && isWhite(p)) continue;
      if (!white && isBlack(p)) continue;
      const moves = getMovesRaw(board, r, c);
      if (moves.some(([mr, mc]) => mr === king[0] && mc === king[1])) return true;
    }
  }
  return false;
}

function getLegalMoves(board, row, col) {
  const piece = board[row][col];
  if (!piece) return [];
  const raw = getMovesRaw(board, row, col);
  const white = isWhite(piece);
  return raw.filter(([tr, tc]) => {
    const nb = applyMove(board, [row, col], [tr, tc]);
    return !isInCheck(nb, white);
  });
}

function hasAnyMoves(board, white) {
  for (let r = 0; r < 8; r++)
    for (let c = 0; c < 8; c++) {
      const p = board[r][c];
      if (!p) continue;
      if (white && !isWhite(p)) continue;
      if (!white && !isBlack(p)) continue;
      if (getLegalMoves(board, r, c).length > 0) return true;
    }
  return false;
}

class ChessGame {
  constructor(roomId, players) {
    this.roomId = roomId;
    this.players = players; // [whiteId, blackId]
    this.board = initBoard();
    this.turn = 'white'; // white goes first
    this.state = 'playing';
    this.winner = null;
    this.lastMove = null;
    this.captured = { white: [], black: [] };
  }

  getView(playerId) {
    const color = this.players[0] === playerId ? 'white' : 'black';
    return {
      board: this.board,
      turn: this.turn,
      myColor: color,
      state: this.state,
      winner: this.winner,
      lastMove: this.lastMove,
      captured: this.captured,
      players: this.players,
    };
  }

  move(playerId, from, to) {
    const myColor = this.players[0] === playerId ? 'white' : 'black';
    if (myColor !== this.turn) return { error: 'Not your turn' };
    if (this.state !== 'playing') return { error: 'Game over' };

    const piece = this.board[from[0]][from[1]];
    if (!piece) return { error: 'No piece there' };
    if (myColor === 'white' && !isWhite(piece)) return { error: 'Not your piece' };
    if (myColor === 'black' && !isBlack(piece)) return { error: 'Not your piece' };

    const legal = getLegalMoves(this.board, from[0], from[1]);
    if (!legal.some(([r,c]) => r === to[0] && c === to[1])) return { error: 'Illegal move' };

    // Capture tracking
    const captured = this.board[to[0]][to[1]];
    if (captured) this.captured[myColor].push(captured);

    this.board = applyMove(this.board, from, to);
    this.lastMove = { from, to };

    const nextWhite = this.turn === 'white' ? false : true;
    const inCheck = isInCheck(this.board, nextWhite);
    const hasMoves = hasAnyMoves(this.board, nextWhite);

    if (!hasMoves) {
      this.state = 'finished';
      this.winner = inCheck ? myColor : 'draw';
    } else {
      this.turn = this.turn === 'white' ? 'black' : 'white';
    }

    return { ok: true, check: inCheck, gameOver: this.state === 'finished' };
  }

  getLegalMovesFor(playerId, row, col) {
    const myColor = this.players[0] === playerId ? 'white' : 'black';
    if (myColor !== this.turn) return [];
    const piece = this.board[row][col];
    if (!piece) return [];
    if (myColor === 'white' && !isWhite(piece)) return [];
    if (myColor === 'black' && !isBlack(piece)) return [];
    return getLegalMoves(this.board, row, col);
  }
}

module.exports = { ChessGame, PIECES, isWhite, isBlack };
