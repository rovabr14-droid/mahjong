'use strict';

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const { MahjongGame }    = require('./src/mahjongEngine');
const { ChessGame }      = require('./src/chessEngine');
const { CheckersGame }   = require('./src/checkersEngine');
const { DominoesGame }   = require('./src/dominoesEngine');
const { TongitsGame }    = require('./src/tongitsEngine');
const { PusoyDosGame }   = require('./src/pusoyDosEngine');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });
app.use(express.static(path.join(__dirname, 'public')));

const rooms = {};
const playerRoom = {};
const playerProfiles = {}; // socketId → { name, wins, losses, avatar }

const GAME_CONFIGS = {
  mahjong:   { name: 'Filipino Mahjong', maxPlayers: 4 },
  chess:     { name: 'Chess',            maxPlayers: 2 },
  checkers:  { name: 'Checkers',         maxPlayers: 2 },
  dominoes:  { name: 'Dominoes',         maxPlayers: 4 },
  tongits:   { name: 'Tongits',          maxPlayers: 3 },
  pusoy:     { name: 'Pusoy Dos',        maxPlayers: 4 },
};

// ── Helpers ────────────────────────────────────────────────────────────────────
function broadcastGameState(roomId) {
  const room = rooms[roomId];
  if (!room?.game) return;
  for (const p of room.players) {
    if (p.isBot) continue;
    let view;
    const gt = room.gameType;
    if (gt === 'mahjong') view = room.game.getPlayerView(p.id);
    else view = room.game.getView(p.id);
    io.to(p.id).emit('game_state', { gameType: gt, ...view });
  }
}

function broadcastRoomState(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  const max = GAME_CONFIGS[room.gameType]?.maxPlayers ?? 4;
  for (const p of room.players) {
    if (p.isBot) continue;
    io.to(p.id).emit('room_state', {
      roomId, gameType: room.gameType,
      maxPlayers: max,
      players: room.players.map(q => ({
        id: q.id, name: q.name, ready: q.ready, isBot: q.isBot,
        avatar: q.avatar || '😊',
        wins: playerProfiles[q.id]?.wins || 0,
      })),
      host: room.host,
    });
  }
}

function broadcastChat(roomId, from, msg) {
  const room = rooms[roomId];
  if (!room) return;
  for (const p of room.players) {
    if (!p.isBot) io.to(p.id).emit('chat_msg', { from, msg, ts: Date.now() });
  }
}

// ── Bot logic ──────────────────────────────────────────────────────────────────
function scheduleBot(roomId) {
  setTimeout(() => runBot(roomId), 1000 + Math.random() * 800);
}

function runBot(roomId) {
  const room = rooms[roomId];
  if (!room?.game || room.game.state !== 'playing') return;
  const gt = room.gameType;

  if (gt === 'mahjong') {
    const game = room.game;
    const cp = room.players[game.currentTurn];
    if (!cp?.isBot) return;
    const hand = game.hands[cp.id];
    if (!hand?.length) return;
    game.discard(cp.id, hand[Math.floor(Math.random()*hand.length)].id);
    broadcastGameState(roomId);
    if (room.players[game.currentTurn]?.isBot) scheduleBot(roomId);
  }

  else if (gt === 'chess') {
    const game = room.game;
    const botIdx = room.players[0].isBot ? 0 : 1;
    const botId = room.players[botIdx].id;
    const botColor = botIdx === 0 ? 'white' : 'black';
    if (game.turn !== botColor) return;
    const moves = [];
    const PIECE_VALUES = { p:1, n:3, b:3, r:5, q:9, k:0 };
    for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
      const p = game.board[r][c];
      if (!p) continue;
      if (botColor==='white'&&p!==p.toUpperCase()) continue;
      if (botColor==='black'&&p!==p.toLowerCase()) continue;
      for (const to of game.getLegalMovesFor(botId,r,c)) {
        const target = game.board[to[0]][to[1]];
        const captureVal = target ? (PIECE_VALUES[target.toLowerCase()]||0) : 0;
        // Prefer center squares
        const centerBonus = (to[0]>=2&&to[0]<=5&&to[1]>=2&&to[1]<=5) ? 0.5 : 0;
        moves.push({ from:[r,c], to, score: captureVal + centerBonus + Math.random()*0.3 });
      }
    }
    if (!moves.length) return;
    moves.sort((a,b) => b.score - a.score);
    const chosen = moves[0];
    const result = game.move(botId, chosen.from, chosen.to);
    broadcastGameState(roomId);
    if (result.gameOver) {
      const winner = game.winner;
      const winnerName = winner==='draw'?null:room.players[winner==='white'?0:1]?.name;
      for (const p of room.players) if (!p.isBot) io.to(p.id).emit('game_event',{type:'chess_end',winner,winnerName});
    } else {
      if (result.check) for (const p of room.players) if (!p.isBot) io.to(p.id).emit('game_event',{type:'check'});
    }
  }

  else if (gt === 'checkers') {
    const game = room.game;
    const botColor = room.players[0].isBot ? 'red' : 'black';
    const botId = room.players[0].isBot ? room.players[0].id : room.players[1].id;
    if ((botColor==='red') !== game.redTurn) return;
    const allMoves=[], allJumps=[];
    for (let r=0;r<8;r++) for (let c=0;c<8;c++) {
      const p=game.board[r][c]; if (!p) continue;
      if (botColor==='red'&&p!=='r'&&p!=='R') continue;
      if (botColor==='black'&&p!=='b'&&p!=='B') continue;
      const {moves,jumps}=game.getValidMoves(botId,r,c);
      moves.forEach(to=>allMoves.push({from:[r,c],to}));
      jumps.forEach(j=>allJumps.push({from:[r,c],to:j.to}));
    }
    const opts = allJumps.length ? allJumps : allMoves;
    if (!opts.length) return;
    const chosen = opts[Math.floor(Math.random()*opts.length)];
    const result = game.move(botId, chosen.from, chosen.to);
    broadcastGameState(roomId);
    if (game.state==='finished') {
      const winnerName = room.players[game.winner==='red'?0:1]?.name;
      for (const p of room.players) if (!p.isBot) io.to(p.id).emit('game_event',{type:'checkers_end',winner:game.winner,winnerName});
    } else if (result.multiJump) scheduleBot(roomId);
  }

  else if (gt === 'dominoes') {
    const game = room.game;
    const cp = room.players[game.currentTurn];
    if (!cp?.isBot) return;
    const moves = game.getValidMoves(cp.id);
    if (moves.length) {
      const m = moves[Math.floor(Math.random()*moves.length)];
      const result = game.play(cp.id, m.tile.id, m.side==='any'?'right':m.side);
      broadcastGameState(roomId);
      if (result.won) {
        for (const p of room.players) if (!p.isBot) io.to(p.id).emit('game_event',{type:'dominoes_win',winnerName:cp.name,points:result.points});
      } else if (room.players[game.currentTurn]?.isBot) scheduleBot(roomId);
    } else if (game.canDraw(cp.id)) {
      game.draw(cp.id);
      broadcastGameState(roomId);
      scheduleBot(roomId);
    } else {
      game.pass(cp.id);
      broadcastGameState(roomId);
      if (room.players[game.currentTurn]?.isBot) scheduleBot(roomId);
    }
  }

  else if (gt === 'tongits') {
    const game = room.game;
    const cp = room.players[game.currentTurn];
    if (!cp?.isBot) return;
    if (!game.drawnThisTurn) {
      game.draw(cp.id);
      broadcastGameState(roomId);
      scheduleBot(roomId);
    } else {
      const hand = game.hands[cp.id];
      const card = hand[Math.floor(Math.random()*hand.length)];
      const result = game.discard(cp.id, card.id);
      broadcastGameState(roomId);
      if (result.tongits) {
        for (const p of room.players) if (!p.isBot) io.to(p.id).emit('game_event',{type:'tongits_win',winnerName:cp.name,winType:'tongits'});
      } else if (room.players[game.currentTurn]?.isBot) scheduleBot(roomId);
    }
  }

  else if (gt === 'pusoy') {
    const game = room.game;
    const cp = room.players[game.currentTurn];
    if (!cp?.isBot) return;
    const hand = game.hands[cp.id];
    // Try to play singles
    const sorted = [...hand].sort((a,b) => a.rankIdx - b.rankIdx);
    let played = false;
    for (const card of sorted) {
      const result = game.play(cp.id, [card.id]);
      if (result.ok) {
        played = true;
        broadcastGameState(roomId);
        if (result.won) {
          for (const p of room.players) if (!p.isBot) io.to(p.id).emit('game_event',{type:'pusoy_win',winnerName:cp.name});
        } else if (room.players[game.currentTurn]?.isBot) scheduleBot(roomId);
        break;
      }
    }
    if (!played) {
      const result = game.pass(cp.id);
      if (result.ok) {
        broadcastGameState(roomId);
        if (room.players[game.currentTurn]?.isBot) scheduleBot(roomId);
      }
    }
  }
}

// ── Socket handlers ────────────────────────────────────────────────────────────
io.on('connection', (socket) => {
  playerProfiles[socket.id] = { wins: 0, losses: 0, avatar: '😊' };

  socket.on('set_profile', ({ name, avatar }) => {
    if (playerProfiles[socket.id]) {
      playerProfiles[socket.id].name = name;
      playerProfiles[socket.id].avatar = avatar || '😊';
    }
  });

  socket.on('create_room', ({ playerName, gameType, avatar }) => {
    if (!GAME_CONFIGS[gameType]) return socket.emit('error', { message: 'Unknown game' });
    const roomId = uuidv4().slice(0,6).toUpperCase();
    rooms[roomId] = {
      gameType,
      players: [{ id: socket.id, name: playerName||'Player 1', ready: false, avatar: avatar||'😊' }],
      host: socket.id,
      game: null,
      chat: [],
    };
    playerRoom[socket.id] = roomId;
    socket.join(roomId);
    socket.emit('room_created', { roomId, gameType });
    broadcastRoomState(roomId);
  });

  socket.on('join_room', ({ roomId, playerName, avatar }) => {
    const room = rooms[roomId];
    if (!room) return socket.emit('error', { message: 'Room not found' });
    const max = GAME_CONFIGS[room.gameType]?.maxPlayers ?? 4;
    if (room.players.filter(p=>!p.isBot).length >= max) return socket.emit('error', { message: 'Room is full' });
    if (room.game) return socket.emit('error', { message: 'Game already started' });
    room.players.push({ id: socket.id, name: playerName||`Player ${room.players.length+1}`, ready: false, avatar: avatar||'😊' });
    playerRoom[socket.id] = roomId;
    socket.join(roomId);
    socket.emit('room_joined', { roomId, gameType: room.gameType });
    // Send chat history
    socket.emit('chat_history', room.chat.slice(-50));
    broadcastRoomState(roomId);
  });

  socket.on('set_ready', ({ ready }) => {
    const roomId = playerRoom[socket.id];
    if (!roomId) return;
    const room = rooms[roomId];
    const player = room.players.find(p=>p.id===socket.id);
    if (player) player.ready = ready;
    const max = GAME_CONFIGS[room.gameType]?.maxPlayers ?? 4;
    if (room.players.length >= max && room.players.every(p=>p.ready)) startGame(roomId);
    else broadcastRoomState(roomId);
  });

  socket.on('start_game', () => {
    const roomId = playerRoom[socket.id];
    if (!roomId) return;
    const room = rooms[roomId];
    if (room.host !== socket.id) return socket.emit('error', { message: 'Only host can start' });
    startGame(roomId);
  });

  socket.on('chat', ({ msg }) => {
    const roomId = playerRoom[socket.id];
    if (!roomId) return;
    const room = rooms[roomId];
    const player = room.players.find(p=>p.id===socket.id);
    const name = player?.name || 'Player';
    const entry = { from: name, msg: msg.slice(0,200), ts: Date.now() };
    room.chat.push(entry);
    if (room.chat.length > 100) room.chat.shift();
    broadcastChat(roomId, name, msg.slice(0,200));
  });

  // ── Mahjong ──────────────────────────────────────────────────────────────
  socket.on('mahjong_discard',({tileId})=>{
    const roomId=playerRoom[socket.id]; const room=rooms[roomId];
    if(!room||room.gameType!=='mahjong'||!room.game)return;
    const result=room.game.discard(socket.id,tileId);
    if(result.error)return socket.emit('error',result);
    if(result.event==='draw_game')for(const p of room.players)if(!p.isBot)io.to(p.id).emit('game_event',{type:'draw_game'});
    broadcastGameState(roomId); scheduleBot(roomId);
  });
  socket.on('mahjong_win',()=>{
    const roomId=playerRoom[socket.id]; const room=rooms[roomId];
    if(!room||room.gameType!=='mahjong')return;
    const result=room.game.declareSelfDraw(socket.id);
    if(result.error)return socket.emit('error',result);
    const name=room.players.find(p=>p.id===socket.id)?.name;
    for(const p of room.players)if(!p.isBot)io.to(p.id).emit('game_event',{type:'win',winner:socket.id,winType:'self-draw',winnerName:name,points:result.points});
    broadcastGameState(roomId);
  });
  socket.on('mahjong_win_discard',()=>{
    const roomId=playerRoom[socket.id]; const room=rooms[roomId];
    if(!room||room.gameType!=='mahjong')return;
    const result=room.game.declareWin(socket.id);
    if(result.error)return socket.emit('error',result);
    const name=room.players.find(p=>p.id===socket.id)?.name;
    for(const p of room.players)if(!p.isBot)io.to(p.id).emit('game_event',{type:'win',winner:socket.id,winType:'discard',winnerName:name,points:result.points});
    broadcastGameState(roomId);
  });
  socket.on('mahjong_pung',()=>{
    const roomId=playerRoom[socket.id]; const room=rooms[roomId];
    if(!room||room.gameType!=='mahjong')return;
    const result=room.game.declarePung(socket.id);
    if(result.error)return socket.emit('error',result);
    for(const p of room.players)if(!p.isBot)io.to(p.id).emit('game_event',{type:'pung',playerId:socket.id});
    broadcastGameState(roomId);
  });
  socket.on('mahjong_chow',({tileIds})=>{
    const roomId=playerRoom[socket.id]; const room=rooms[roomId];
    if(!room||room.gameType!=='mahjong')return;
    const result=room.game.declareChow(socket.id,tileIds);
    if(result.error)return socket.emit('error',result);
    for(const p of room.players)if(!p.isBot)io.to(p.id).emit('game_event',{type:'chow',playerId:socket.id});
    broadcastGameState(roomId);
  });

  // ── Chess ─────────────────────────────────────────────────────────────────
  socket.on('chess_get_moves',({row,col})=>{
    const room=rooms[playerRoom[socket.id]];
    if(!room||room.gameType!=='chess'||!room.game)return;
    socket.emit('chess_moves',{row,col,moves:room.game.getLegalMovesFor(socket.id,row,col)});
  });
  socket.on('chess_move',({from,to})=>{
    const roomId=playerRoom[socket.id]; const room=rooms[roomId];
    if(!room||room.gameType!=='chess'||!room.game)return;
    const result=room.game.move(socket.id,from,to);
    if(result.error)return socket.emit('error',result);
    broadcastGameState(roomId);
    if(result.gameOver){const w=room.game.winner;const wn=w==='draw'?null:room.players[w==='white'?0:1]?.name;for(const p of room.players)if(!p.isBot)io.to(p.id).emit('game_event',{type:'chess_end',winner:w,winnerName:wn});}
    else{if(result.check)for(const p of room.players)if(!p.isBot)io.to(p.id).emit('game_event',{type:'check'});scheduleBot(roomId);}
  });

  // ── Checkers ──────────────────────────────────────────────────────────────
  socket.on('checkers_get_moves',({row,col})=>{
    const room=rooms[playerRoom[socket.id]];
    if(!room||room.gameType!=='checkers'||!room.game)return;
    const r=room.game.getValidMoves(socket.id,row,col);
    socket.emit('checkers_moves',{row,col,moves:r.moves,jumps:r.jumps});
  });
  socket.on('checkers_move',({from,to})=>{
    const roomId=playerRoom[socket.id]; const room=rooms[roomId];
    if(!room||room.gameType!=='checkers'||!room.game)return;
    const result=room.game.move(socket.id,from,to);
    if(result.error)return socket.emit('error',result);
    broadcastGameState(roomId);
    if(room.game.state==='finished'){const wn=room.players[room.game.winner==='red'?0:1]?.name;for(const p of room.players)if(!p.isBot)io.to(p.id).emit('game_event',{type:'checkers_end',winner:room.game.winner,winnerName:wn});}
    else if(!result.multiJump)scheduleBot(roomId);
  });

  // ── Dominoes ──────────────────────────────────────────────────────────────
  socket.on('dominoes_play',({tileId,side})=>{
    const roomId=playerRoom[socket.id]; const room=rooms[roomId];
    if(!room||room.gameType!=='dominoes'||!room.game)return;
    const result=room.game.play(socket.id,tileId,side);
    if(result.error)return socket.emit('error',result);
    broadcastGameState(roomId);
    if(result.won){const name=room.players.find(p=>p.id===socket.id)?.name;for(const p of room.players)if(!p.isBot)io.to(p.id).emit('game_event',{type:'dominoes_win',winnerName:name,points:result.points});}
    else scheduleBot(roomId);
  });
  socket.on('dominoes_draw',()=>{
    const roomId=playerRoom[socket.id]; const room=rooms[roomId];
    if(!room||room.gameType!=='dominoes'||!room.game)return;
    const result=room.game.draw(socket.id);
    if(result.error)return socket.emit('error',result);
    broadcastGameState(roomId);
  });
  socket.on('dominoes_pass',()=>{
    const roomId=playerRoom[socket.id]; const room=rooms[roomId];
    if(!room||room.gameType!=='dominoes'||!room.game)return;
    const result=room.game.pass(socket.id);
    if(result.error)return socket.emit('error',result);
    broadcastGameState(roomId);
    scheduleBot(roomId);
  });

  // ── Tongits ───────────────────────────────────────────────────────────────
  socket.on('tongits_draw',()=>{
    const roomId=playerRoom[socket.id]; const room=rooms[roomId];
    if(!room||room.gameType!=='tongits'||!room.game)return;
    const result=room.game.draw(socket.id);
    if(result.error)return socket.emit('error',result);
    broadcastGameState(roomId);
  });
  socket.on('tongits_pickup',()=>{
    const roomId=playerRoom[socket.id]; const room=rooms[roomId];
    if(!room||room.gameType!=='tongits'||!room.game)return;
    const result=room.game.pickupDiscard(socket.id);
    if(result.error)return socket.emit('error',result);
    broadcastGameState(roomId);
  });
  socket.on('tongits_discard',({cardId})=>{
    const roomId=playerRoom[socket.id]; const room=rooms[roomId];
    if(!room||room.gameType!=='tongits'||!room.game)return;
    const result=room.game.discard(socket.id,cardId);
    if(result.error)return socket.emit('error',result);
    broadcastGameState(roomId);
    if(result.tongits){const name=room.players.find(p=>p.id===socket.id)?.name;for(const p of room.players)if(!p.isBot)io.to(p.id).emit('game_event',{type:'tongits_win',winnerName:name,winType:'tongits'});}
    else scheduleBot(roomId);
  });
  socket.on('tongits_meld',({cardIds})=>{
    const roomId=playerRoom[socket.id]; const room=rooms[roomId];
    if(!room||room.gameType!=='tongits'||!room.game)return;
    const result=room.game.exposeMeld(socket.id,cardIds);
    if(result.error)return socket.emit('error',result);
    broadcastGameState(roomId);
  });
  socket.on('tongits_fight',()=>{
    const roomId=playerRoom[socket.id]; const room=rooms[roomId];
    if(!room||room.gameType!=='tongits'||!room.game)return;
    const result=room.game.callFight(socket.id);
    const winnerName=room.players.find(p=>p.id===result.winner)?.name;
    for(const p of room.players)if(!p.isBot)io.to(p.id).emit('game_event',{type:'tongits_win',winnerName,winType:'fight'});
    broadcastGameState(roomId);
  });

  // ── Pusoy Dos ─────────────────────────────────────────────────────────────
  socket.on('pusoy_play',({cardIds})=>{
    const roomId=playerRoom[socket.id]; const room=rooms[roomId];
    if(!room||room.gameType!=='pusoy'||!room.game)return;
    const result=room.game.play(socket.id,cardIds);
    if(result.error)return socket.emit('error',result);
    broadcastGameState(roomId);
    if(result.won){const name=room.players.find(p=>p.id===socket.id)?.name;for(const p of room.players)if(!p.isBot)io.to(p.id).emit('game_event',{type:'pusoy_win',winnerName:name});}
    else scheduleBot(roomId);
  });
  socket.on('pusoy_pass',()=>{
    const roomId=playerRoom[socket.id]; const room=rooms[roomId];
    if(!room||room.gameType!=='pusoy'||!room.game)return;
    const result=room.game.pass(socket.id);
    if(result.error)return socket.emit('error',result);
    broadcastGameState(roomId); scheduleBot(roomId);
  });

  // ── Next round ────────────────────────────────────────────────────────────
  socket.on('next_round',()=>{
    const roomId=playerRoom[socket.id]; const room=rooms[roomId];
    if(!room||room.host!==socket.id)return;
    const ids=room.players.map(p=>p.id);
    if(room.gameType==='mahjong')room.game.nextRound();
    else if(room.gameType==='chess'){room.players.reverse();room.game=new ChessGame(roomId,room.players.map(p=>p.id));}
    else if(room.gameType==='checkers'){room.players.reverse();room.game=new CheckersGame(roomId,room.players.map(p=>p.id));}
    else if(room.gameType==='dominoes')room.game=new DominoesGame(roomId,ids);
    else if(room.gameType==='tongits')room.game=new TongitsGame(roomId,ids);
    else if(room.gameType==='pusoy')room.game=new PusoyDosGame(roomId,ids);
    broadcastGameState(roomId); scheduleBot(roomId);
  });

  socket.on('disconnect',()=>{
    const roomId=playerRoom[socket.id];
    if(!roomId)return;
    const room=rooms[roomId];
    if(!room)return;
    room.players=room.players.filter(p=>p.id!==socket.id);
    delete playerRoom[socket.id];
    delete playerProfiles[socket.id];
    if(room.players.length===0){delete rooms[roomId];return;}
    if(room.host===socket.id)room.host=room.players.find(p=>!p.isBot)?.id||room.players[0].id;
    for(const p of room.players)if(!p.isBot)io.to(p.id).emit('player_left',{message:'A player disconnected.'});
    broadcastRoomState(roomId);
  });
});

function startGame(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  const max = GAME_CONFIGS[room.gameType]?.maxPlayers ?? 4;
  while (room.players.length < max) {
    room.players.push({ id:`bot_${uuidv4().slice(0,4)}`, name:`CPU ${room.players.length}`, ready:true, isBot:true, avatar:'🤖' });
  }
  const ids = room.players.map(p=>p.id);
  const gt = room.gameType;
  if (gt==='mahjong') room.game=new MahjongGame(roomId,ids);
  else if (gt==='chess') room.game=new ChessGame(roomId,ids);
  else if (gt==='checkers') room.game=new CheckersGame(roomId,ids);
  else if (gt==='dominoes') room.game=new DominoesGame(roomId,ids);
  else if (gt==='tongits') room.game=new TongitsGame(roomId,ids);
  else if (gt==='pusoy') room.game=new PusoyDosGame(roomId,ids);
  for (const p of room.players) if (!p.isBot) io.to(p.id).emit('game_started',{gameType:gt});
  broadcastGameState(roomId);
  scheduleBot(roomId);
}

const PORT = parseInt(process.env.PORT) || 8080;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n🎮 Game Hub v2 running on port ${PORT}\n`);
});

// ── Admin Panel ────────────────────────────────────────────────────────────────
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'pinoygames2024';

// In-memory site config (persists until server restart)
let siteConfig = {
  title: 'PinoyGames Hub',
  subtitle: 'Play Filipino games with friends online',
  announcement: '',
  affiliates: {
    left: [
      { emoji:'🀄', name:'Mahjong Set', desc:'144-piece classic set', price:'$29.99', link:'YOUR_LINK' },
      { emoji:'♟', name:'Chess Set', desc:'Wooden board & pieces', price:'$49.99', link:'YOUR_LINK' },
      { emoji:'🎲', name:'Dominoes Set', desc:'Double-6 set, 28 tiles', price:'$15.99', link:'YOUR_LINK' },
    ],
    right: [
      { emoji:'🃏', name:'Card Game Bundle', desc:'Tongits, Pusoy & more', price:'$24.99', oldPrice:'$39.99', link:'YOUR_LINK', sale:true },
      { emoji:'⏱', name:'Chess Clock', desc:'Digital tournament timer', price:'$22.99', link:'YOUR_LINK' },
      { emoji:'📚', name:'Strategy Guide', desc:'Master Filipino card games', price:'$12.99', link:'YOUR_LINK' },
      { emoji:'🎯', name:'Game Night Pack', desc:'Everything you need', price:'$34.99', link:'YOUR_LINK' },
    ]
  }
};

// API routes
app.use(express.json());

app.get('/api/config', (req, res) => res.json(siteConfig));

app.post('/api/admin/login', (req, res) => {
  const { password } = req.body;
  if (password === ADMIN_PASSWORD) {
    res.json({ ok: true, token: Buffer.from(ADMIN_PASSWORD).toString('base64') });
  } else {
    res.status(401).json({ error: 'Wrong password' });
  }
});

function adminAuth(req, res, next) {
  const token = req.headers['x-admin-token'];
  if (token === Buffer.from(ADMIN_PASSWORD).toString('base64')) return next();
  res.status(401).json({ error: 'Unauthorized' });
}

app.post('/api/admin/config', adminAuth, (req, res) => {
  const { title, subtitle, announcement, affiliates } = req.body;
  if (title) siteConfig.title = title;
  if (subtitle !== undefined) siteConfig.subtitle = subtitle;
  if (announcement !== undefined) siteConfig.announcement = announcement;
  if (affiliates) siteConfig.affiliates = affiliates;
  // Notify all clients of config update
  io.emit('config_update', siteConfig);
  res.json({ ok: true, config: siteConfig });
});
