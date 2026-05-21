'use strict';

// ── Load site config from admin API ──────────────────────────────────────────
async function loadSiteConfig() {
  try {
    const res = await fetch('/api/config');
    const config = await res.json();
    // Update title
    if (config.title) {
      const el = document.querySelector('.hero-title');
      if (el) el.textContent = config.title;
      document.title = '🎮 ' + config.title;
    }
    // Update subtitle
    if (config.subtitle) {
      const el = document.querySelector('.hero-sub');
      if (el) el.textContent = config.subtitle;
    }
    // Show announcement banner
    if (config.announcement) {
      let banner = document.getElementById('announcementBanner');
      if (!banner) {
        banner = document.createElement('div');
        banner.id = 'announcementBanner';
        banner.style.cssText = 'background:linear-gradient(135deg,rgba(212,168,67,.2),rgba(212,168,67,.1));border:1px solid rgba(212,168,67,.4);border-radius:8px;padding:10px 16px;font-size:13px;font-weight:600;color:#f5c842;text-align:center;width:100%;max-width:500px';
        const heroEl = document.querySelector('.lobby-hero');
        if (heroEl) heroEl.after(banner);
      }
      banner.textContent = '📢 ' + config.announcement;
      banner.style.display = 'block';
    }
    // Update affiliate links
    if (config.affiliates) {
      updateAffiliates(config.affiliates);
    }
  } catch(e) {
    console.log('Config load failed:', e);
  }
}

function updateAffiliates(affiliates) {
  // Update left sidebar
  const leftCards = document.querySelectorAll('.left-sidebar .aff-card');
  (affiliates.left || []).forEach((item, i) => {
    const card = leftCards[i];
    if (!card) return;
    card.href = item.link || '#';
    const img = card.querySelector('.aff-img span');
    if (img) {
      if (item.imageUrl) {
        // Replace span with img tag
        const imgEl = document.createElement('img');
        imgEl.src = item.imageUrl;
        imgEl.style.cssText = 'width:100%;height:100%;object-fit:cover';
        img.parentNode.replaceChild(imgEl, img);
      } else {
        img.textContent = item.emoji || '🛍';
      }
    }
    const name = card.querySelector('.aff-name');
    if (name) name.textContent = item.name || '';
    const desc = card.querySelector('.aff-desc');
    if (desc) desc.textContent = item.desc || '';
    const price = card.querySelector('.aff-price');
    if (price) price.textContent = item.price || '';
  });
  // Update right sidebar
  const rightCards = document.querySelectorAll('.right-sidebar .aff-card');
  (affiliates.right || []).forEach((item, i) => {
    const card = rightCards[i];
    if (!card) return;
    card.href = item.link || '#';
    const img = card.querySelector('.aff-img span, .aff-img img');
    if (img) {
      if (item.imageUrl) {
        if (img.tagName === 'SPAN') {
          const imgEl = document.createElement('img');
          imgEl.src = item.imageUrl;
          imgEl.style.cssText = 'width:100%;height:100%;object-fit:cover';
          img.parentNode.replaceChild(imgEl, img);
        } else { img.src = item.imageUrl; }
      } else if (img.tagName === 'SPAN') { img.textContent = item.emoji || '🔥'; }
    }
    const name = card.querySelector('.aff-name');
    if (name) name.textContent = item.name || '';
    const desc = card.querySelector('.aff-desc');
    if (desc) desc.textContent = item.desc || '';
    const price = card.querySelector('.aff-price');
    if (price) {
      if (item.oldPrice) {
        price.innerHTML = `${item.price} <s>${item.oldPrice}</s>`;
      } else {
        price.textContent = item.price || '';
      }
    }
  });
}

// Listen for live config updates from admin
// (socket is defined below, so we attach after socket init)


const socket = io();
let myName = '', roomId = null, isHost = false, currentGameType = null, isReady = false;
let selectedAvatar = '😊';

// ── Utilities ─────────────────────────────────────────────────────────────────
function show(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}
function esc(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
function showError(msg) {
  const el = document.getElementById('errorMsg');
  if (el) { el.textContent = msg; setTimeout(() => el.textContent = '', 3000); }
  showToast(msg);
}
function showToast(msg) {
  let t = document.getElementById('gameToast');
  if (!t) {
    t = document.createElement('div');
    t.id = 'gameToast';
    t.style.cssText = 'position:fixed;bottom:180px;left:50%;transform:translateX(-50%);background:rgba(231,76,60,.95);color:#fff;padding:10px 22px;border-radius:8px;font-size:13px;font-weight:600;z-index:9999;pointer-events:none;transition:opacity .3s;white-space:nowrap';
    document.body.appendChild(t);
  }
  t.textContent = msg; t.style.opacity = '1';
  clearTimeout(t._t);
  t._t = setTimeout(() => t.style.opacity = '0', 2500);
}
function addLog(id, msg, hl) {
  const el = document.getElementById(id);
  if (!el) return;
  const d = document.createElement('div');
  d.className = 'log-line' + (hl ? ' hl' : '');
  d.textContent = msg;
  el.appendChild(d);
  el.scrollTop = el.scrollHeight;
}

// ── Game Meta ─────────────────────────────────────────────────────────────────
const GAME_META = {
  mahjong:  { icon:'🀄', name:'Filipino Mahjong', maxPlayers:4, colors:['East','South','West','North'] },
  chess:    { icon:'♟',  name:'Chess',            maxPlayers:2, colors:['White','Black'] },
  checkers: { icon:'🔴', name:'Checkers',         maxPlayers:2, colors:['Red','Black'] },
  tongits:  { icon:'🃏', name:'Tongits',          maxPlayers:3, colors:['Player 1','Player 2','Player 3'] },
  pusoy:    { icon:'🂡', name:'Pusoy Dos',         maxPlayers:4, colors:['Player 1','Player 2','Player 3','Player 4'] },
  dominoes: { icon:'🁣', name:'Dominoes',         maxPlayers:4, colors:['Player 1','Player 2','Player 3','Player 4'] },
};

// ── Avatar Picker ─────────────────────────────────────────────────────────────
document.querySelectorAll('.avatar-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.avatar-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedAvatar = btn.dataset.avatar;
  });
});

// ── Lobby: Game Card Click ────────────────────────────────────────────────────
document.querySelectorAll('.game-card').forEach(card => {
  card.addEventListener('click', () => {
    myName = document.getElementById('playerName').value.trim() || 'Player';
    socket.emit('create_room', { playerName: myName, gameType: card.dataset.game, avatar: selectedAvatar });
  });
});

// ── Join Room ─────────────────────────────────────────────────────────────────
document.getElementById('btnJoin').addEventListener('click', () => {
  myName = document.getElementById('playerName').value.trim() || 'Player';
  const code = document.getElementById('roomCodeInput').value.trim().toUpperCase();
  if (!code) return showError('Enter a room code');
  socket.emit('join_room', { roomId: code, playerName: myName, avatar: selectedAvatar });
});
document.getElementById('roomCodeInput').addEventListener('keydown', e => {
  if (e.key === 'Enter') document.getElementById('btnJoin').click();
});

// ── Socket: Room Created ──────────────────────────────────────────────────────
socket.on('room_created', ({ roomId: id, gameType }) => {
  roomId = id; isHost = true; currentGameType = gameType;
  const meta = GAME_META[gameType] || { icon:'🎮', name: gameType };
  document.getElementById('displayRoomCode').textContent = id;
  const badge = document.getElementById('waitingGameBadge');
  if (badge) badge.textContent = meta.icon + ' ' + meta.name;
  document.getElementById('btnStart').classList.remove('hidden');
  const note = document.getElementById('waitingNote');
  if (note) {
    const p = meta.maxPlayers;
    note.textContent = `Need ${p} players · CPUs fill empty seats · Press Start to play now!`;
  }
  show('screen-waiting');
  setTimeout(() => makeQR('waitingQR', window.location.href), 100);
});

// ── Socket: Room Joined ───────────────────────────────────────────────────────
socket.on('room_joined', ({ roomId: id, gameType }) => {
  roomId = id; isHost = false; currentGameType = gameType;
  const meta = GAME_META[gameType] || { icon:'🎮', name: gameType };
  document.getElementById('displayRoomCode').textContent = id;
  const badge = document.getElementById('waitingGameBadge');
  if (badge) badge.textContent = meta.icon + ' ' + meta.name;
  document.getElementById('btnStart').classList.add('hidden');
  show('screen-waiting');
  setTimeout(() => makeQR('waitingQR', window.location.href), 100);
});

// ── Socket: Room State ────────────────────────────────────────────────────────
socket.on('room_state', ({ players, host, gameType, maxPlayers }) => {
  isHost = host === socket.id;
  const bs = document.getElementById('btnStart');
  if (bs) bs.classList.toggle('hidden', !isHost);
  const meta = GAME_META[gameType] || {};
  const container = document.getElementById('playerSlots');
  if (!container) return;
  container.innerHTML = '';
  for (let i = 0; i < maxPlayers; i++) {
    const p = players[i];
    const slot = document.createElement('div');
    slot.className = 'slot' + (p ? ' filled' : ' empty');
    const colorLabel = meta.colors?.[i] || `Seat ${i+1}`;
    if (p) {
      slot.innerHTML = `
        <div class="slot-avatar">${p.avatar||'😊'}</div>
        <div class="slot-details">
          <div class="slot-name">${esc(p.name)}${p.id===socket.id?' (You)':''}</div>
          <div class="slot-color">${colorLabel}</div>
        </div>
        <div class="slot-status ${p.ready?'ready':'waiting'}">${p.ready?'✓ Ready':'Waiting…'}</div>`;
    } else {
      slot.innerHTML = `<div class="slot-avatar">🪑</div><div class="slot-details"><div class="slot-name">Empty seat</div><div class="slot-color">${colorLabel}</div></div><div class="slot-status waiting">—</div>`;
    }
    container.appendChild(slot);
  }
});

// ── Waiting Room Buttons ──────────────────────────────────────────────────────
document.getElementById('btnReady').addEventListener('click', function() {
  isReady = !isReady;
  this.textContent = isReady ? '✓ Ready!' : "I'm Ready";
  this.classList.toggle('is-active', isReady);
  socket.emit('set_ready', { ready: isReady });
});

document.getElementById('btnStart').addEventListener('click', () => {
  socket.emit('start_game');
});

document.getElementById('btnCopyCode').addEventListener('click', () => {
  navigator.clipboard?.writeText(roomId);
  document.getElementById('btnCopyCode').textContent = '✓ Copied!';
  setTimeout(() => document.getElementById('btnCopyCode').textContent = '📋 Copy', 1500);
});

const btnBackHome = document.getElementById('btnBackHome');
if (btnBackHome) {
  btnBackHome.addEventListener('click', () => {
    if (confirm('Leave the waiting room?')) location.reload();
  });
}

// ── Socket: Game Started ──────────────────────────────────────────────────────
socket.on('game_started', ({ gameType }) => {
  currentGameType = gameType;
  document.getElementById('overlay').classList.add('hidden');
  show('screen-' + gameType);
});

// ── Socket: Errors & Player Left ─────────────────────────────────────────────
socket.on('error', ({ message }) => showError(message));
socket.on('player_left', ({ message }) => {
  const logMap = { mahjong:'mjLog', chess:'chessLog', checkers:'checkersLog', dominoes:'domLog', tongits:'tongLog', pusoy:'pusoyLog' };
  const l = logMap[currentGameType];
  if (l) addLog(l, '⚠ ' + message);
});

// ── Overlay ───────────────────────────────────────────────────────────────────
function showOverlay(icon, title, msg) {
  document.getElementById('overlayIcon').textContent = icon;
  document.getElementById('overlayTitle').textContent = title;
  document.getElementById('overlayMsg').textContent = msg;
  document.getElementById('overlay').classList.remove('hidden');
  document.getElementById('btnNext').classList.toggle('hidden', !isHost);
}
document.getElementById('btnNext').addEventListener('click', () => {
  socket.emit('next_round');
  document.getElementById('overlay').classList.add('hidden');
});
document.getElementById('btnHome').addEventListener('click', () => {
  document.getElementById('overlay').classList.add('hidden');
  show('screen-lobby');
  roomId = null; isHost = false; currentGameType = null; isReady = false;
  document.getElementById('btnReady').textContent = "I'm Ready";
  document.getElementById('btnReady').classList.remove('is-active');
});

// ── Home button (in-game) ─────────────────────────────────────────────────────
window.goHome = function() {
  if (!confirm('Go back to home? You will leave the current game.')) return;
  socket.disconnect();
  location.reload();
};

// ── QR Codes ─────────────────────────────────────────────────────────────────
window.addEventListener('load', () => {
  makeQR('lobbyQR', window.location.href);
  loadSiteConfig();
});
socket.on('config_update', (config) => {
  if (config.title) {
    const el = document.querySelector('.hero-title');
    if (el) el.textContent = config.title;
    document.title = '🎮 ' + config.title;
  }
  if (config.subtitle) {
    const el = document.querySelector('.hero-sub');
    if (el) el.textContent = config.subtitle;
  }
  if (config.announcement) {
    let banner = document.getElementById('announcementBanner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'announcementBanner';
      banner.style.cssText = 'background:linear-gradient(135deg,rgba(212,168,67,.2),rgba(212,168,67,.1));border:1px solid rgba(212,168,67,.4);border-radius:8px;padding:10px 16px;font-size:13px;font-weight:600;color:#f5c842;text-align:center;width:100%;max-width:500px';
      const heroEl = document.querySelector('.lobby-hero');
      if (heroEl) heroEl.after(banner);
    }
    banner.textContent = '📢 ' + config.announcement;
    banner.style.display = 'block';
  } else {
    const banner = document.getElementById('announcementBanner');
    if (banner) banner.style.display = 'none';
  }
  if (config.affiliates) updateAffiliates(config.affiliates);
});
function makeQR(elementId, url) {
  const el = document.getElementById(elementId);
  if (!el || !window.QRCode) return;
  el.innerHTML = '';
  new QRCode(el, { text: url, width: 110, height: 110, colorDark: '#0a1208', colorLight: '#ffffff', correctLevel: QRCode.CorrectLevel.M });
}

// ── Chat ─────────────────────────────────────────────────────────────────────
window.sendChat = function(gameType) {
  const input = document.getElementById(`chatInput-${gameType}`);
  if (!input) return;
  const msg = input.value.trim();
  if (!msg) return;
  socket.emit('chat', { msg });
  input.value = '';
};
document.querySelectorAll('.chat-input').forEach(input => {
  input.addEventListener('keydown', e => {
    if (e.key === 'Enter') sendChat(input.id.replace('chatInput-', ''));
  });
});
socket.on('chat_msg', ({ from, msg }) => {
  const logId = `chatMsgs-${currentGameType}`;
  const el = document.getElementById(logId);
  if (!el) return;
  const line = document.createElement('div');
  line.className = 'chat-msg';
  line.innerHTML = `<span class="chat-from">${esc(from)}:</span> ${esc(msg)}`;
  el.appendChild(line);
  el.scrollTop = el.scrollHeight;
});
socket.on('chat_history', (history) => {
  for (const entry of history) {
    const logId = `chatMsgs-${currentGameType}`;
    const el = document.getElementById(logId);
    if (!el) continue;
    const line = document.createElement('div');
    line.className = 'chat-msg';
    line.innerHTML = `<span class="chat-from">${esc(entry.from)}:</span> ${esc(entry.msg)}`;
    el.appendChild(line);
  }
});

// ── Socket: Game State Router ─────────────────────────────────────────────────
socket.on('game_state', state => {
  if (!state.gameType) return;
  currentGameType = state.gameType;
  if (state.gameType === 'mahjong')    renderMahjong(state);
  else if (state.gameType === 'chess')     renderChess(state);
  else if (state.gameType === 'checkers')  renderCheckers(state);
  else if (state.gameType === 'dominoes')  renderDominoes(state);
  else if (state.gameType === 'tongits')   renderTongits(state);
  else if (state.gameType === 'pusoy')     renderPusoy(state);
});

// ── Socket: Game Events ───────────────────────────────────────────────────────
socket.on('game_event', event => {
  const logMap = { mahjong:'mjLog', chess:'chessLog', checkers:'checkersLog', dominoes:'domLog', tongits:'tongLog', pusoy:'pusoyLog' };
  const logId = logMap[currentGameType];
  if (event.type === 'win')          { showOverlay('🀄','胡! Winner!',`${event.winnerName} wins! +${event.points} pts`); if(logId) addLog(logId,`🏆 ${event.winnerName} wins!`,true); }
  else if (event.type === 'chess_end')    { const msg=event.winner==='draw'?'Draw!':event.winnerName+' wins!'; showOverlay('♟',event.winner==='draw'?'Draw!':'Checkmate!',msg); if(logId) addLog(logId,msg,true); }
  else if (event.type === 'checkers_end') { showOverlay('🔴','Winner!',`${event.winnerName} wins!`); if(logId) addLog(logId,`🏆 ${event.winnerName} wins!`,true); }
  else if (event.type === 'dominoes_win') { showOverlay('🁣','Winner!',`${event.winnerName} wins! +${event.points} pts`); if(logId) addLog(logId,`🏆 ${event.winnerName} wins!`,true); }
  else if (event.type === 'tongits_win')  { showOverlay('🃏','Tongits!',`${event.winnerName} wins by ${event.winType}!`); if(logId) addLog(logId,`🏆 ${event.winnerName} wins!`,true); }
  else if (event.type === 'pusoy_win')    { showOverlay('🂡','Winner!',`${event.winnerName} wins!`); if(logId) addLog(logId,`🏆 ${event.winnerName} wins!`,true); }
  else if (event.type === 'draw_game')    { showOverlay('🤝','Draw!','No winner this round'); if(logId) addLog(logId,'Draw',true); }
  else if (event.type === 'check')        addLog('chessLog','⚠️ Check!',true);
  else if (event.type === 'pung')         addLog('mjLog','🔱 Pung!');
  else if (event.type === 'chow')         addLog('mjLog','🔀 Chow!');
});

// ── Chess socket events ───────────────────────────────────────────────────────
socket.on('chess_moves', ({ row, col, moves }) => {
  document.querySelectorAll('.chess-cell').forEach(c => {
    c.classList.remove('valid-move','valid-capture','selected');
  });
  const piece = chessBoard ? chessBoard[row][col] : null;
  const fromCell = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
  if (fromCell) fromCell.classList.add('selected');
  moves.forEach(([r,c]) => {
    const cell = document.querySelector(`[data-row="${r}"][data-col="${c}"]`);
    if (cell) {
      const hasPiece = cell.querySelector('.chess-piece');
      cell.classList.add(hasPiece ? 'valid-capture' : 'valid-move');
    }
  });
  selectedChessCell = [row, col];
  pendingMoves = moves;
});

socket.on('checkers_moves', ({ row, col, moves, jumps }) => {
  document.querySelectorAll('.chk-cell').forEach(c => c.classList.remove('valid-move','valid-jump','selected'));
  const fromCell = document.querySelector(`[data-row="${row}"][data-col="${col}"]`);
  if (fromCell) fromCell.classList.add('selected');
  moves.forEach(([r,c]) => {
    const cell = document.querySelector(`[data-row="${r}"][data-col="${c}"]`);
    if (cell) cell.classList.add('valid-move');
  });
  jumps.forEach(j => {
    const cell = document.querySelector(`[data-row="${j.to[0]}"][data-col="${j.to[1]}"]`);
    if (cell) cell.classList.add('valid-jump');
  });
  selectedCheckersCell = [row, col];
  pendingJumps = jumps;
});

// ── MAHJONG RENDERER ──────────────────────────────────────────────────────────
let mjSelectedTile = null, mjChowMode = false, mjChowSelected = [];
const TILE_DISPLAY = {
  b1:'🎍',b2:'🎋',b3:'🎋',b4:'🎋',b5:'🎋',b6:'🎋',b7:'🎋',b8:'🎋',b9:'🎋',
  c1:'⓵',c2:'⓶',c3:'⓷',c4:'⓸',c5:'⓹',c6:'⓺',c7:'⓻',c8:'⓼',c9:'⓽',
  m1:'一',m2:'二',m3:'三',m4:'四',m5:'五',m6:'六',m7:'七',m8:'八',m9:'九',
  wE:'東',wS:'南',wW:'西',wN:'北',
  dG:'發',dR:'中',dW:'白',
  f1:'春',f2:'夏',f3:'秋',f4:'冬',
  s1:'梅',s2:'蘭',s3:'菊',s4:'竹',
};
function tileClass(t) {
  if (!t) return '';
  if (t.startsWith('b')) return 'bamboo';
  if (t.startsWith('c')) return 'circles';
  if (t.startsWith('m')) return 'characters';
  if (t.startsWith('w')) return 'wind';
  if (t.startsWith('d')) return t==='dG'?'dragon-green':t==='dR'?'dragon-red':'dragon-white';
  if (t.startsWith('f')||t.startsWith('s')) return 'bonus-tile';
  return '';
}
function makeTileEl(tile, opts={}) {
  const el = document.createElement('div');
  const sz = opts.size||'';
  el.className = `tile ${tileClass(tile.type||tile.id)} ${sz}`.trim();
  if (opts.selected) el.classList.add('selected');
  if (opts.clickable) el.classList.add('clickable');
  if (opts.lastDiscard) el.classList.add('last-disc');
  el.textContent = TILE_DISPLAY[tile.type||tile.id] || (tile.type||tile.id);
  const sub = document.createElement('span');
  sub.className = 'tile-sub';
  const id = tile.type||tile.id||'';
  if (id.startsWith('b')||id.startsWith('c')||id.startsWith('m')) sub.textContent = id.slice(1);
  el.appendChild(sub);
  if (opts.onClick) el.addEventListener('click', opts.onClick);
  return el;
}
function makeBackTile(sz='small') {
  const el = document.createElement('div');
  el.className = `tile back ${sz}`;
  return el;
}
window.renderMahjong = function(state) {
  const { hands, discards, melds, currentTurn, myIndex, players, wallCount, roundWind, scores, lastDiscard, dealer } = state;
  const dirs = ['bottom','right','top','left'];
  const winds = ['東','南','西','北'];
  document.getElementById('mjWind').textContent = ['東','南','西','北'][['E','S','W','N'].indexOf(roundWind)]||roundWind;
  document.getElementById('mjCount').textContent = wallCount;
  players.forEach((pid, i) => {
    const rel = (i - myIndex + 4) % 4;
    const dir = dirs[rel];
    const isMe = i === myIndex;
    const isTurn = i === currentTurn;
    const seat = document.getElementById(`seat-${dir}`);
    if (seat) seat.classList.toggle('active-turn', isTurn);
    const infoEl = document.getElementById(`mj-info-${dir}`);
    if (infoEl) {
      const p = state.playerProfiles?.[pid] || {};
      infoEl.innerHTML = `<span class="seat-avatar">${p.avatar||'😊'}</span><span class="seat-name">${esc(p.name||`P${i+1}`)}</span><span class="wind-pill">${winds[i]}</span><span class="score-pill">${scores[pid]||0}pts</span>${i===dealer?'<span class="dealer-badge">莊</span>':''}`;
    }
    const handEl = document.getElementById(`mj-hand-${dir}`);
    if (handEl) {
      handEl.innerHTML = '';
      const hand = hands[pid] || [];
      if (isMe) {
        hand.forEach(tile => {
          const isSel = tile.id === mjSelectedTile;
          const isChowSel = mjChowSelected.includes(tile.id);
          handEl.appendChild(makeTileEl(tile, {
            clickable: true, selected: isSel || isChowSel,
            onClick: () => {
              if (mjChowMode) {
                const idx = mjChowSelected.indexOf(tile.id);
                if (idx !== -1) mjChowSelected.splice(idx,1); else if(mjChowSelected.length<2) mjChowSelected.push(tile.id);
              } else {
                mjSelectedTile = mjSelectedTile === tile.id ? null : tile.id;
              }
              renderMahjong(state);
            }
          }));
        });
      } else {
        hand.forEach(() => handEl.appendChild(makeBackTile(dir==='top'?'xs':'small')));
      }
    }
    const meldsEl = document.getElementById(`mj-melds-${dir}`);
    if (meldsEl) {
      meldsEl.innerHTML = '';
      (melds[pid]||[]).forEach(meld => {
        const setEl = document.createElement('div'); setEl.className = 'meld-set';
        meld.forEach(t => setEl.appendChild(makeTileEl(t, { size:'meld-tile' })));
        meldsEl.appendChild(setEl);
      });
    }
    const discEl = document.getElementById(`mj-disc-${dir}`);
    if (discEl) {
      discEl.innerHTML = '';
      (discards[pid]||[]).forEach((t,idx,arr) => {
        const isLast = idx === arr.length-1 && t.id === lastDiscard?.id;
        discEl.appendChild(makeTileEl(t, { size:'xs', lastDiscard: isLast }));
      });
    }
  });
  const actEl = document.getElementById('mj-actions');
  if (actEl) {
    actEl.innerHTML = '';
    const ab = (label, fn, win) => {
      const b = document.createElement('button');
      b.className = 'btn-action' + (win?' btn-win':'');
      b.textContent = label;
      b.addEventListener('click', fn);
      actEl.appendChild(b);
    };
    if (mjChowMode) {
      if (mjChowSelected.length===2) ab('✓ Chow',()=>{socket.emit('mahjong_chow',{tileIds:mjChowSelected});mjChowMode=false;mjChowSelected=[];});
      ab('✗ Cancel',()=>{mjChowMode=false;mjChowSelected=[];renderMahjong(state);});
    } else {
      if (myIndex === currentTurn && mjSelectedTile) ab('🗑 Discard',()=>{socket.emit('mahjong_discard',{tileId:mjSelectedTile});mjSelectedTile=null;});
      if (state.canWin) ab('🏆 Hu!',()=>socket.emit('mahjong_win'),true);
      if (state.canWinDiscard) ab('🏆 Hu!',()=>socket.emit('mahjong_win_discard'),true);
      if (state.canPung) ab('🔱 Pung',()=>socket.emit('mahjong_pung'));
      if (state.canChow) ab('🔀 Chow',()=>{mjChowMode=true;mjChowSelected=[];renderMahjong(state);});
    }
  }
  const myInfoEl = document.getElementById('mj-info-bottom');
  if (myInfoEl) {
    const p = state.playerProfiles?.[players[myIndex]] || {};
    myInfoEl.innerHTML = `<span class="seat-avatar">${p.avatar||'😊'}</span><span class="seat-name">${esc(p.name||'You')}</span><span class="wind-pill">${winds[myIndex]}</span><span class="score-pill">${scores[players[myIndex]]||0}pts</span>`;
  }
};

// ── CHESS RENDERER ────────────────────────────────────────────────────────────
let chessBoard = null, selectedChessCell = null, pendingMoves = [];
const CHESS_PIECES = { K:'♔',Q:'♕',R:'♖',B:'♗',N:'♘',P:'♙',k:'♚',q:'♛',r:'♜',b:'♝',n:'♞',p:'♟' };
window.renderChess = function(state) {
  chessBoard = state.board;
  const myColor = state.myColor;
  const boardEl = document.getElementById('chessBoard');
  if (!boardEl) return;
  boardEl.innerHTML = '';
  const rows = myColor === 'black' ? [...Array(8).keys()] : [...Array(8).keys()].reverse();
  const cols = myColor === 'black' ? [...Array(8).keys()].reverse() : [...Array(8).keys()];
  rows.forEach(r => {
    cols.forEach(c => {
      const cell = document.createElement('div');
      cell.className = `chess-cell ${(r+c)%2===0?'light':'dark'}`;
      cell.dataset.row = r; cell.dataset.col = c;
      if (state.lastMove) {
        if (state.lastMove[0][0]===r&&state.lastMove[0][1]===c) cell.classList.add('last-from');
        if (state.lastMove[1][0]===r&&state.lastMove[1][1]===c) cell.classList.add('last-to');
      }
      const piece = state.board[r][c];
      if (piece) {
        const span = document.createElement('span');
        span.className = 'chess-piece';
        span.textContent = CHESS_PIECES[piece] || piece;
        cell.appendChild(span);
      }
      cell.addEventListener('click', () => {
        if (selectedChessCell && pendingMoves.some(([mr,mc])=>mr===r&&mc===c)) {
          socket.emit('chess_move', { from: selectedChessCell, to: [r,c] });
          selectedChessCell = null; pendingMoves = [];
          document.querySelectorAll('.chess-cell').forEach(c=>c.classList.remove('valid-move','valid-capture','selected'));
        } else {
          socket.emit('chess_get_moves', { row:r, col:c });
        }
      });
      boardEl.appendChild(cell);
    });
  });
  const wp = document.getElementById('chess-white-panel');
  const bp = document.getElementById('chess-black-panel');
  if (wp) { wp.innerHTML = `<div class="pp-name">${esc(state.players?.white||'White')}</div><div class="pp-color">⬜ White</div>`; wp.classList.toggle('active-turn', state.turn==='white'); }
  if (bp) { bp.innerHTML = `<div class="pp-name">${esc(state.players?.black||'Black')}</div><div class="pp-color">⬛ Black</div>`; bp.classList.toggle('active-turn', state.turn==='black'); }
};

// ── CHECKERS RENDERER ─────────────────────────────────────────────────────────
let selectedCheckersCell = null, pendingJumps = [];
window.renderCheckers = function(state) {
  const boardEl = document.getElementById('checkersBoard');
  if (!boardEl) return;
  boardEl.innerHTML = '';
  const myColor = state.myColor;
  for (let r=7; r>=0; r--) {
    for (let c=0; c<8; c++) {
      const cell = document.createElement('div');
      cell.className = `chk-cell ${(r+c)%2===0?'light':'dark'}`;
      cell.dataset.row=r; cell.dataset.col=c;
      const piece = state.board[r][c];
      if (piece) {
        const wrap = document.createElement('div'); wrap.className='chk-piece-wrap';
        const disc = document.createElement('div');
        disc.className = `chk-disc ${piece.toLowerCase()==='r'?'red':'black-p'}${piece===piece.toUpperCase()?' is-king':''}`;
        wrap.appendChild(disc); cell.appendChild(wrap);
      }
      cell.addEventListener('click', () => {
        if (selectedCheckersCell && (
          document.querySelector(`[data-row="${r}"][data-col="${c}"]`)?.classList.contains('valid-move') ||
          document.querySelector(`[data-row="${r}"][data-col="${c}"]`)?.classList.contains('valid-jump')
        )) {
          socket.emit('checkers_move', { from: selectedCheckersCell, to: [r,c] });
          selectedCheckersCell = null;
          document.querySelectorAll('.chk-cell').forEach(c=>c.classList.remove('valid-move','valid-jump','selected'));
        } else {
          socket.emit('checkers_get_moves', { row:r, col:c });
        }
      });
      boardEl.appendChild(cell);
    }
  }
  const rp = document.getElementById('chk-red-panel');
  const bp = document.getElementById('chk-black-panel');
  if (rp) { rp.innerHTML=`<div class="pp-name">${esc(state.players?.red||'Red')}</div><div class="pp-color">🔴 Red</div>`; rp.classList.toggle('active-turn',state.redTurn); }
  if (bp) { bp.innerHTML=`<div class="pp-name">${esc(state.players?.black||'Black')}</div><div class="pp-color">⚫ Black</div>`; bp.classList.toggle('active-turn',!state.redTurn); }
};

// ── DOMINOES RENDERER ─────────────────────────────────────────────────────────
const PIP_COLORS = ['transparent','#e74c3c','#9b59b6','#2980b9','#27ae60','#e67e22','#6c3483'];
let domSelected = null, domLastState = null;
// Standard domino pip positions (3x3 grid, numbered 0-8 left-to-right, top-to-bottom)
// 0 1 2
// 3 4 5
// 6 7 8
const PIP_MAP = {
  0: [],
  1: [4],              // center
  2: [2, 6],           // top-right, bottom-left (diagonal)
  3: [2, 4, 6],        // top-right, center, bottom-left
  4: [0, 2, 6, 8],     // four corners
  5: [0, 2, 4, 6, 8],  // four corners + center
  6: [0, 3, 6, 2, 5, 8], // two columns: left col (0,3,6) + right col (2,5,8)
};

function makePipGrid(value, size=36) {
  const color = PIP_COLORS[value] || '#333';
  const active = PIP_MAP[value] || [];
  const pipSize = Math.max(6, Math.round(size * 0.24));
  const grid = document.createElement('div');
  grid.style.cssText = `display:grid;grid-template-columns:repeat(3,1fr);grid-template-rows:repeat(3,1fr);width:${size}px;height:${size}px;padding:${Math.round(size*0.08)}px;gap:${Math.round(size*0.04)}px`;
  for (let i = 0; i < 9; i++) {
    const cell = document.createElement('div');
    cell.style.cssText = 'display:flex;align-items:center;justify-content:center';
    if (active.includes(i)) {
      const pip = document.createElement('div');
      pip.style.cssText = `width:${pipSize}px;height:${pipSize}px;border-radius:50%;background:${color};box-shadow:0 1px 3px rgba(0,0,0,.4),inset 0 1px 0 rgba(255,255,255,.3)`;
      cell.appendChild(pip);
    }
    grid.appendChild(cell);
  }
  return grid;
}
function makeDominoEl(tile, opts={}) {
  const half = opts.halfSize || 46;
  const isDouble = tile.a === tile.b;
  const vertical = opts.vertical || (isDouble && !opts.hand);
  const wrap = document.createElement('div');
  const flexDir = vertical ? 'column' : 'row';
  wrap.style.cssText = `display:inline-flex;flex-direction:${flexDir};flex-shrink:0;border-radius:10px;overflow:hidden;border:2px solid ${opts.selected?'#ffd700':'#aaa'};box-shadow:${opts.selected?'0 0 0 3px rgba(255,215,0,.5),':''}2px 4px 10px rgba(0,0,0,.5);transition:transform .12s,box-shadow .12s,border-color .12s;cursor:${opts.clickable?'pointer':'default'}`;
  if (opts.selected) wrap.style.transform = 'translateY(-10px)';
  const makeHalf = (val) => {
    const h = document.createElement('div');
    h.style.cssText = `width:${half}px;height:${half}px;background:#e8e8e8;display:flex;align-items:center;justify-content:center`;
    h.appendChild(makePipGrid(val, Math.round(half * 0.82)));
    return h;
  };
  const divEl = document.createElement('div');
  divEl.style.cssText = vertical ? `height:3px;background:#999;flex-shrink:0` : `width:3px;background:#999;flex-shrink:0`;
  wrap.appendChild(makeHalf(tile.a));
  wrap.appendChild(divEl);
  wrap.appendChild(makeHalf(tile.b));
  if (opts.clickable) {
    wrap.addEventListener('mouseenter', () => { if (!opts.selected) wrap.style.transform = 'translateY(-6px)'; });
    wrap.addEventListener('mouseleave', () => { if (!opts.selected) wrap.style.transform = ''; });
  }
  if (opts.draggable) {
    wrap.setAttribute('draggable', true);
    wrap.addEventListener('dragstart', e => { wrap.style.opacity='0.4'; e.dataTransfer.setData('text/plain', String(tile.id)); e.dataTransfer.effectAllowed='move'; });
    wrap.addEventListener('dragend', () => { wrap.style.opacity='1'; });
  }
  if (opts.onClick) wrap.addEventListener('click', opts.onClick);
  return wrap;
}
function makeArrowDrop(side) {
  const el=document.createElement('div');
  el.style.cssText='width:44px;height:46px;border:2px dashed rgba(255,255,215,.3);border-radius:8px;display:flex;align-items:center;justify-content:center;color:rgba(255,255,215,.4);font-size:22px;flex-shrink:0;transition:all .15s;cursor:pointer';
  el.textContent=side==='left'?'←':'→';
  el.addEventListener('mouseenter',()=>{ el.style.background='rgba(255,215,0,.12)'; el.style.borderColor='rgba(255,215,0,.5)'; el.style.color='#ffd700'; });
  el.addEventListener('mouseleave',()=>{ el.style.background=''; el.style.borderColor=''; el.style.color='rgba(255,255,215,.4)'; });
  el.addEventListener('click',()=>{ if(domSelected!==null){ socket.emit('dominoes_play',{tileId:domSelected,side}); domSelected=null; } else showToast('Click a tile first'); });
  addDropTarget(el,side);
  return el;
}
function addDropTarget(el,side) {
  el.addEventListener('dragover',e=>{ e.preventDefault(); el.style.background='rgba(255,215,0,.18)'; el.style.borderColor='#ffd700'; });
  el.addEventListener('dragleave',()=>{ el.style.background=''; el.style.borderColor=''; });
  el.addEventListener('drop',e=>{ e.preventDefault(); el.style.background=''; el.style.borderColor=''; const id=parseInt(e.dataTransfer.getData('text/plain')); if(!isNaN(id)){ socket.emit('dominoes_play',{tileId:id,side}); domSelected=null; } });
}
window.renderDominoes = function(state) {
  domLastState=state;
  const { board,myHand,handCounts,boneyardCount,currentTurn,myIndex,scores,players }=state;
  const isMyTurn=currentTurn===myIndex;
  const tb=document.getElementById('domTurn');
  if(tb){ tb.textContent=isMyTurn?'⭐ YOUR TURN':`Player ${currentTurn+1}'s turn`; tb.style.color=isMyTurn?'#2ecc71':'rgba(255,255,255,.5)'; }
  const by=document.getElementById('domBoneyard');
  if(by) by.textContent=`🁣 ${boneyardCount} left`;
  const oppEl=document.getElementById('domOpponents');
  if(oppEl){ oppEl.innerHTML=''; for(let i=0;i<players.length;i++){ if(i===myIndex)continue; const pid=players[i]; const count=handCounts[pid]||0; const block=document.createElement('div'); block.className='dom-opp-block'; const handRow=document.createElement('div'); handRow.className='dom-opp-hand'; for(let t=0;t<Math.min(count,8);t++){ const bt=document.createElement('div'); bt.style.cssText='width:28px;height:46px;background:linear-gradient(135deg,#2c3e6b,#1a2744);border-radius:5px;border:1.5px solid rgba(255,255,255,.2);box-shadow:1px 2px 4px rgba(0,0,0,.5)'; handRow.appendChild(bt); } const lbl=document.createElement('div'); lbl.className='dom-opp-label'; lbl.innerHTML=`<b>Player ${i+1}</b> &nbsp;${count} tiles &nbsp;<span style="color:var(--gold)">${scores[pid]||0}pts</span>`; block.appendChild(handRow); block.appendChild(lbl); oppEl.appendChild(block); } }
  const boardEl=document.getElementById('domBoard');
  if(boardEl){ boardEl.innerHTML=''; if(board.length===0){ const dz=document.createElement('div'); dz.style.cssText='padding:20px 30px;border:2px dashed rgba(255,255,255,.2);border-radius:14px;color:rgba(255,255,255,.3);font-size:13px;text-align:center'; dz.textContent=isMyTurn?'⬇ Click a tile then click here, or drag tile here':'Waiting for first play...'; if(isMyTurn) addDropTarget(dz,'right'); boardEl.appendChild(dz); } else { if(isMyTurn) boardEl.appendChild(makeArrowDrop('left')); for(const entry of board) boardEl.appendChild(makeDominoEl(entry.tile,{halfSize:52})); if(isMyTurn) boardEl.appendChild(makeArrowDrop('right')); } }
  const sc=document.getElementById('domMyScore'); if(sc) sc.textContent=`${scores[players[myIndex]]||0} PTS`;
  const handEl=document.getElementById('domHand');
  if(handEl){ handEl.innerHTML=''; for(const tile of(myHand||[])){ const isSel=domSelected===tile.id;
    // Check if this tile can be played
    const canPlay = !isMyTurn ? false : board.length === 0 ? true :
      [tile.a, tile.b].includes(state.leftEnd) || [tile.a, tile.b].includes(state.rightEnd);
    const el=makeDominoEl(tile,{ halfSize:52, hand:true, clickable:isMyTurn, draggable:isMyTurn&&canPlay, selected:isSel,
      onClick:()=>{ if(!isMyTurn) return; domSelected=domSelected===tile.id?null:tile.id; renderDominoes(state); } });
    if (isMyTurn && !canPlay && board.length > 0) el.style.opacity = '0.4';
    handEl.appendChild(el); } }
  const actEl=document.getElementById('domActions');
  if(actEl){ actEl.innerHTML=''; if(isMyTurn){
    // Show what ends need to be matched
    if (board.length > 0) {
      const hint2 = document.createElement('span');
      hint2.style.cssText='font-size:11px;color:rgba(255,255,255,.5);background:rgba(255,255,255,.08);padding:4px 10px;border-radius:6px';
      hint2.textContent = `Match: ←${state.leftEnd}  or  ${state.rightEnd}→`;
      actEl.appendChild(hint2);
    }
    if(domSelected!==null&&board.length>0){ const bL=document.createElement('button'); bL.className='btn-action play'; bL.textContent='⬅ Play Left'; bL.onclick=()=>{ socket.emit('dominoes_play',{tileId:domSelected,side:'left'}); domSelected=null; }; const bR=document.createElement('button'); bR.className='btn-action play'; bR.textContent='Play Right ➡'; bR.onclick=()=>{ socket.emit('dominoes_play',{tileId:domSelected,side:'right'}); domSelected=null; }; actEl.appendChild(bL); actEl.appendChild(bR); } else if(domSelected!==null&&board.length===0){ const bP=document.createElement('button'); bP.className='btn-action play'; bP.textContent='▶ Play First Tile'; bP.onclick=()=>{ socket.emit('dominoes_play',{tileId:domSelected,side:'right'}); domSelected=null; }; actEl.appendChild(bP); } else if(boneyardCount>0){ const bD=document.createElement('button'); bD.className='btn-action draw'; bD.textContent='🁣 Draw Tile'; bD.onclick=()=>socket.emit('dominoes_draw'); actEl.appendChild(bD); } else { const bPs=document.createElement('button'); bPs.className='btn-action pass'; bPs.textContent='⏭ Pass'; bPs.onclick=()=>socket.emit('dominoes_pass'); actEl.appendChild(bPs); }
    const hint=document.createElement('span'); hint.style.cssText='font-size:11px;color:rgba(255,255,255,.3)'; hint.textContent=domSelected?'Or drag to ← → arrows':'Click a bright tile to select'; actEl.appendChild(hint); } else { const w=document.createElement('span'); w.style.cssText='font-size:13px;color:rgba(255,255,255,.35)'; w.textContent=`Waiting for Player ${currentTurn+1}...`; actEl.appendChild(w); } }
};

// ── TONGITS RENDERER ──────────────────────────────────────────────────────────
let tongSelected = [];
function makeCard(card, opts={}) {
  const isRed=card.suit==='♥'||card.suit==='♦';
  const el=document.createElement('div');
  el.className=`playing-card ${isRed?'red-suit':'black-suit'}${opts.small?' small':''}`;
  if(opts.clickable) el.classList.add('clickable');
  if(opts.selected) el.classList.add('selected');
  el.innerHTML=`<span class="card-rank">${card.rank}</span><span class="card-suit">${card.suit}</span><span class="card-rank-bot">${card.rank}</span>`;
  if(opts.onClick) el.addEventListener('click',opts.onClick);
  return el;
}
window.renderTongits = function(state) {
  const { myHand,handCounts,melds,topDiscard,stockCount,currentTurn,myIndex,drawnThisTurn,players,scores }=state;
  document.getElementById('tongStockCount').textContent=stockCount;
  const sidebar=document.getElementById('tong-players');
  if(sidebar){ sidebar.innerHTML=''; for(let i=0;i<players.length;i++){ const pid=players[i]; const panel=document.createElement('div'); panel.className='card-player-panel'+(i===currentTurn?' active':''); panel.innerHTML=`<div class="cpp-avatar">🃏</div><div class="cpp-info"><div class="cpp-name">${pid===socket.id?'You':`Player ${i+1}`}</div><div class="cpp-score">${scores[pid]||0} pts</div></div><div class="cpp-cards">${handCounts[pid]||0} cards</div>`; sidebar.appendChild(panel); } }
  const discEl=document.getElementById('tongDiscard'); if(discEl){ discEl.innerHTML=''; if(topDiscard) discEl.appendChild(makeCard(topDiscard)); }
  const meldsEl=document.getElementById('tongMelds'); if(meldsEl){ meldsEl.innerHTML=''; for(const[pid,playerMelds]of Object.entries(melds)){ for(const meld of playerMelds){ const grp=document.createElement('div'); grp.className='meld-group'; for(const c of meld) grp.appendChild(makeCard(c,{small:true})); meldsEl.appendChild(grp); } } }
  const handEl=document.getElementById('tongHand');
  if(handEl){ handEl.innerHTML=''; for(const card of(myHand||[])){ const isSel=tongSelected.includes(card.id); handEl.appendChild(makeCard(card,{ clickable:true, selected:isSel, onClick:()=>{ const idx=tongSelected.indexOf(card.id); if(idx!==-1) tongSelected.splice(idx,1); else tongSelected.push(card.id); renderTongits(state); } })); } }
  const actEl=document.getElementById('tongActions');
  if(actEl){ actEl.innerHTML=''; const isMyTurn=currentTurn===myIndex; if(isMyTurn){ if(!drawnThisTurn){ const bD=document.createElement('button'); bD.className='btn-action'; bD.textContent='🂠 Draw'; bD.onclick=()=>socket.emit('tongits_draw'); actEl.appendChild(bD); if(topDiscard){ const bP=document.createElement('button'); bP.className='btn-action'; bP.textContent='⬆ Pickup Discard'; bP.onclick=()=>socket.emit('tongits_pickup'); actEl.appendChild(bP); } } else { if(tongSelected.length===1){ const bDis=document.createElement('button'); bDis.className='btn-action'; bDis.textContent='🗑 Discard'; bDis.onclick=()=>{ socket.emit('tongits_discard',{cardId:tongSelected[0]}); tongSelected=[]; }; actEl.appendChild(bDis); } if(tongSelected.length>=3){ const bM=document.createElement('button'); bM.className='btn-action'; bM.textContent='🃏 Expose Meld'; bM.onclick=()=>{ socket.emit('tongits_meld',{cardIds:tongSelected}); tongSelected=[]; }; actEl.appendChild(bM); } } const bF=document.createElement('button'); bF.className='btn-action btn-win'; bF.textContent='⚔ Fight!'; bF.onclick=()=>socket.emit('tongits_fight'); actEl.appendChild(bF); } }
};

// ── PUSOY DOS RENDERER ────────────────────────────────────────────────────────
let pusoySelected = [];
window.renderPusoy = function(state) {
  const { myHand,handCounts,lastPlay,currentTurn,myIndex,players,scores }=state;
  const sidebar=document.getElementById('pusoy-players');
  if(sidebar){ sidebar.innerHTML=''; for(let i=0;i<players.length;i++){ const pid=players[i]; const panel=document.createElement('div'); panel.className='card-player-panel'+(i===currentTurn?' active':''); panel.innerHTML=`<div class="cpp-avatar">🂡</div><div class="cpp-info"><div class="cpp-name">${pid===socket.id?'You':`Player ${i+1}`}</div><div class="cpp-score">${scores[pid]||0} pts</div></div><div class="cpp-cards">${handCounts[pid]||0} cards</div>`; sidebar.appendChild(panel); } }
  const lpEl=document.getElementById('pusoyLastPlay');
  if(lpEl){ lpEl.innerHTML=''; if(lastPlay) for(const c of lastPlay.cards) lpEl.appendChild(makeCard(c,{small:true})); else lpEl.innerHTML='<span style="font-size:12px;color:rgba(255,255,255,.3)">No play yet</span>'; }
  const handEl=document.getElementById('pusoyHand');
  if(handEl){ handEl.innerHTML=''; const sorted=[...(myHand||[])].sort((a,b)=>a.rankIdx-b.rankIdx||a.suitIdx-b.suitIdx); for(const card of sorted){ const isSel=pusoySelected.includes(card.id); handEl.appendChild(makeCard(card,{ clickable:true, selected:isSel, onClick:()=>{ const idx=pusoySelected.indexOf(card.id); if(idx!==-1) pusoySelected.splice(idx,1); else pusoySelected.push(card.id); renderPusoy(state); } })); } }
  const actEl=document.getElementById('pusoyActions');
  if(actEl){ actEl.innerHTML=''; const isMyTurn=currentTurn===myIndex; if(isMyTurn){ if(pusoySelected.length>0){ const bP=document.createElement('button'); bP.className='btn-action play'; bP.textContent=`▶ Play (${pusoySelected.length})`; bP.onclick=()=>{ socket.emit('pusoy_play',{cardIds:pusoySelected}); pusoySelected=[]; }; actEl.appendChild(bP); } if(lastPlay){ const bPs=document.createElement('button'); bPs.className='btn-action pass'; bPs.textContent='⏭ Pass'; bPs.onclick=()=>socket.emit('pusoy_pass'); actEl.appendChild(bPs); } } }
};

// ── SOUND EFFECTS ─────────────────────────────────────────────────────────────
const AudioCtx = window.AudioContext || window.webkitAudioContext;
let audioCtx = null;
let soundEnabled = true;

function getAudioCtx() {
  if (!audioCtx) audioCtx = new AudioCtx();
  return audioCtx;
}

function playSound(type) {
  if (!soundEnabled) return;
  try {
    const ctx = getAudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);

    const sounds = {
      click:   { freq:[300,200], dur:0.08, vol:0.15, type:'sine' },
      card:    { freq:[500,300], dur:0.12, vol:0.12, type:'sine' },
      tile:    { freq:[400,250], dur:0.1,  vol:0.15, type:'triangle' },
      win:     { freq:[523,659,784,1047], dur:0.15, vol:0.2, type:'sine' },
      error:   { freq:[200,150], dur:0.15, vol:0.1, type:'sawtooth' },
      deal:    { freq:[600,400], dur:0.08, vol:0.1, type:'sine' },
      turn:    { freq:[440,550], dur:0.1,  vol:0.1, type:'sine' },
      domino:  { freq:[350,220], dur:0.12, vol:0.18, type:'triangle' },
    };

    const s = sounds[type] || sounds.click;
    const freqs = Array.isArray(s.freq) ? s.freq : [s.freq];
    osc.type = s.type;

    freqs.forEach((f, i) => {
      setTimeout(() => {
        osc.frequency.setValueAtTime(f, ctx.currentTime);
      }, i * s.dur * 1000 * 0.8);
    });

    gain.gain.setValueAtTime(s.vol, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + s.dur * freqs.length);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + s.dur * freqs.length + 0.05);
  } catch(e) {}
}

// Sound toggle button
function addSoundToggle() {
  const btn = document.createElement('button');
  btn.id = 'soundToggle';
  btn.style.cssText = 'position:fixed;bottom:12px;right:12px;z-index:500;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);border-radius:50%;width:36px;height:36px;font-size:16px;cursor:pointer;transition:all .2s';
  btn.textContent = '🔊';
  btn.title = 'Toggle sound';
  btn.addEventListener('click', () => {
    soundEnabled = !soundEnabled;
    btn.textContent = soundEnabled ? '🔊' : '🔇';
    btn.style.opacity = soundEnabled ? '1' : '0.5';
  });
  document.body.appendChild(btn);
}
addSoundToggle();

// Patch socket emit to play sounds
const origEmit = socket.emit.bind(socket);
socket.emit = function(event, ...args) {
  if (event === 'mahjong_discard') playSound('tile');
  else if (event === 'chess_move') playSound('click');
  else if (event === 'checkers_move') playSound('click');
  else if (event === 'dominoes_play') playSound('domino');
  else if (event === 'dominoes_draw') playSound('deal');
  else if (['tongits_draw','tongits_discard','pusoy_play'].includes(event)) playSound('card');
  return origEmit(event, ...args);
};

// ── CONFETTI & WIN ANIMATION ──────────────────────────────────────────────────
function launchConfetti() {
  playSound('win');
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'position:fixed;inset:0;z-index:99;pointer-events:none;width:100%;height:100%';
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  document.body.appendChild(canvas);
  const ctx2 = canvas.getContext('2d');
  const pieces = [];
  const colors = ['#ffd700','#ff6b6b','#4ecdc4','#45b7d1','#96ceb4','#f9ca24','#6c5ce7','#fd79a8'];

  for (let i = 0; i < 150; i++) {
    pieces.push({
      x: Math.random() * canvas.width,
      y: -10 - Math.random() * 200,
      w: 8 + Math.random() * 10,
      h: 4 + Math.random() * 6,
      color: colors[Math.floor(Math.random() * colors.length)],
      vx: (Math.random() - 0.5) * 6,
      vy: 2 + Math.random() * 4,
      rot: Math.random() * Math.PI * 2,
      rSpeed: (Math.random() - 0.5) * 0.2,
    });
  }

  let frame = 0;
  function animate() {
    ctx2.clearRect(0, 0, canvas.width, canvas.height);
    pieces.forEach(p => {
      p.x += p.vx; p.y += p.vy; p.rot += p.rSpeed; p.vy += 0.05;
      ctx2.save();
      ctx2.translate(p.x, p.y);
      ctx2.rotate(p.rot);
      ctx2.fillStyle = p.color;
      ctx2.fillRect(-p.w/2, -p.h/2, p.w, p.h);
      ctx2.restore();
    });
    frame++;
    if (frame < 200) requestAnimationFrame(animate);
    else canvas.remove();
  }
  animate();
}

// Override showOverlay to add confetti
const _origShowOverlay = showOverlay;
window.showOverlay = function(icon, title, msg) {
  _origShowOverlay(icon, title, msg);
  launchConfetti();
};

// ── PLAYER STATS ──────────────────────────────────────────────────────────────
const sessionStats = { wins: 0, losses: 0, games: 0, startTime: Date.now() };

socket.on('game_started', ({ gameType }) => {
  sessionStats.games++;
});

// Patch showOverlay to track wins
const _trackOverlay = window.showOverlay;
window.showOverlay = function(icon, title, msg) {
  _trackOverlay(icon, title, msg);
  if (title.includes('Winner') || title.includes('Tongits') || title.includes('Checkmate') || title.includes('胡')) {
    if (msg && !msg.includes('CPU') && !msg.includes('Player 2') && !msg.includes('Player 3') && !msg.includes('Player 4')) {
      sessionStats.wins++;
    } else {
      sessionStats.losses++;
    }
    updateStatsDisplay();
  }
};

function updateStatsDisplay() {
  let el = document.getElementById('sessionStats');
  if (!el) {
    el = document.createElement('div');
    el.id = 'sessionStats';
    el.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:400;background:rgba(0,0,0,.7);border:1px solid rgba(255,255,255,.15);border-radius:20px;padding:5px 14px;font-size:11px;font-weight:700;color:rgba(255,255,255,.7);display:flex;gap:12px;pointer-events:none';
    document.body.appendChild(el);
  }
  const mins = Math.floor((Date.now() - sessionStats.startTime) / 60000);
  el.innerHTML = `🎮 ${sessionStats.games} games &nbsp;|&nbsp; 🏆 ${sessionStats.wins} wins &nbsp;|&nbsp; ⏱ ${mins}m`;
}
setInterval(updateStatsDisplay, 30000);

// ── REACTION EMOJIS ───────────────────────────────────────────────────────────
function addReactionBar() {
  const bar = document.createElement('div');
  bar.id = 'reactionBar';
  bar.style.cssText = 'position:fixed;bottom:56px;right:12px;z-index:500;display:flex;flex-direction:column;gap:4px;display:none';
  const reactions = ['😂','🔥','👏','😮','😤','💪','🤦','🎉'];
  reactions.forEach(emoji => {
    const btn = document.createElement('button');
    btn.textContent = emoji;
    btn.style.cssText = 'width:36px;height:36px;border-radius:50%;border:none;background:rgba(255,255,255,.15);font-size:18px;cursor:pointer;transition:transform .15s';
    btn.addEventListener('mouseenter', () => btn.style.transform = 'scale(1.2)');
    btn.addEventListener('mouseleave', () => btn.style.transform = '');
    btn.addEventListener('click', () => {
      socket.emit('chat', { msg: emoji });
      showFloatingReaction(emoji);
      bar.style.display = 'none';
      reactionOpen = false;
    });
    bar.appendChild(btn);
  });
  document.body.appendChild(bar);

  // Toggle button
  const toggle = document.createElement('button');
  toggle.style.cssText = 'position:fixed;bottom:56px;right:12px;z-index:501;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);border-radius:50%;width:36px;height:36px;font-size:16px;cursor:pointer';
  toggle.textContent = '😊';
  toggle.title = 'React';
  let reactionOpen = false;
  toggle.addEventListener('click', () => {
    reactionOpen = !reactionOpen;
    bar.style.display = reactionOpen ? 'flex' : 'none';
    // Position bar above toggle
    bar.style.bottom = '96px';
    bar.style.right = '12px';
  });
  document.body.appendChild(toggle);
}
addReactionBar();

function showFloatingReaction(emoji) {
  const el = document.createElement('div');
  el.textContent = emoji;
  el.style.cssText = `position:fixed;bottom:100px;right:60px;font-size:40px;z-index:600;pointer-events:none;animation:floatUp 2s ease-out forwards`;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2000);
}

// Add float animation
if (!document.getElementById('reactionStyle')) {
  const style = document.createElement('style');
  style.id = 'reactionStyle';
  style.textContent = `@keyframes floatUp{0%{opacity:1;transform:translateY(0) scale(1)}100%{opacity:0;transform:translateY(-120px) scale(1.5)}}`;
  document.head.appendChild(style);
}

// Show incoming reactions as floating emojis
socket.on('chat_msg', ({ from, msg }) => {
  if (['😂','🔥','👏','😮','😤','💪','🤦','🎉'].includes(msg)) {
    showFloatingReaction(msg);
  }
});

// ── GAME TURN TIMER ───────────────────────────────────────────────────────────
let turnTimerInterval = null;
let turnTimeLeft = 30;

function startTurnTimer(seconds = 30) {
  stopTurnTimer();
  turnTimeLeft = seconds;
  let el = document.getElementById('turnTimer');
  if (!el) {
    el = document.createElement('div');
    el.id = 'turnTimer';
    el.style.cssText = 'position:fixed;top:12px;right:12px;z-index:400;background:rgba(0,0,0,.7);border:1px solid rgba(255,255,255,.15);border-radius:12px;padding:6px 14px;font-size:13px;font-weight:700;color:#fff;min-width:60px;text-align:center;display:none';
    document.body.appendChild(el);
  }
  el.style.display = 'block';
  updateTimerDisplay(el, turnTimeLeft);
  turnTimerInterval = setInterval(() => {
    turnTimeLeft--;
    updateTimerDisplay(el, turnTimeLeft);
    if (turnTimeLeft <= 5) {
      el.style.color = '#e74c3c';
      el.style.borderColor = 'rgba(231,76,60,.5)';
      playSound('error');
    }
    if (turnTimeLeft <= 0) stopTurnTimer();
  }, 1000);
}

function stopTurnTimer() {
  clearInterval(turnTimerInterval);
  turnTimerInterval = null;
  const el = document.getElementById('turnTimer');
  if (el) { el.style.display = 'none'; el.style.color = '#fff'; el.style.borderColor = 'rgba(255,255,255,.15)'; }
}

function updateTimerDisplay(el, secs) {
  el.textContent = `⏱ ${secs}s`;
}

// Start timer when it's your turn
socket.on('game_state', state => {
  if (!state.gameType) return;
  const isMyTurn = state.currentTurn === state.myIndex;
  if (isMyTurn) { startTurnTimer(30); playSound('turn'); }
  else stopTurnTimer();
});

// ── HOW TO PLAY BUTTON ────────────────────────────────────────────────────────
const HOW_TO_PLAY = {
  mahjong:  { title:'Filipino Mahjong', rules:'Draw tiles from the wall. Form 4 sets (Pung/Chow) + 1 pair to win. Click a tile to select, then Discard. Call Pung to claim 3-of-a-kind, Chow to claim a sequence. Flowers/Seasons are bonus tiles.' },
  chess:    { title:'Chess', rules:'Move pieces to checkmate the opponent\'s King. Click a piece to see valid moves (green dots), click destination to move. White goes first.' },
  checkers: { title:'Checkers', rules:'Move diagonally on dark squares. Jump over opponent pieces to capture. Reach the far end to become a King (can move backwards). Must jump if possible.' },
  dominoes: { title:'Dominoes', rules:'Match tile ends to the board. Click a tile to select it, then click ← or → arrows to play. Draw from boneyard if stuck. First to empty hand wins.' },
  tongits:  { title:'Tongits', rules:'Draw a card each turn, then discard one. Form melds (sets of 3+ same rank, or runs of 3+ same suit). Empty your hand for Tong-its, or call Fight to compare scores.' },
  pusoy:    { title:'Pusoy Dos', rules:'3♦ plays first. Play singles, pairs, triples, or 5-card hands that beat the last play. Pass if you can\'t beat it. First to empty hand wins.' },
};

function showHowToPlay(gameType) {
  const info = HOW_TO_PLAY[gameType];
  if (!info) return;
  let modal = document.getElementById('howToPlayModal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'howToPlayModal';
    modal.style.cssText = 'position:fixed;inset:0;z-index:800;background:rgba(0,0,0,.8);display:flex;align-items:center;justify-content:center;backdrop-filter:blur(6px)';
    modal.addEventListener('click', e => { if(e.target===modal) modal.style.display='none'; });
    document.body.appendChild(modal);
  }
  modal.innerHTML = `
    <div style="background:#0f1a0d;border:1px solid rgba(212,168,67,.3);border-radius:16px;padding:32px;max-width:420px;width:90%;display:flex;flex-direction:column;gap:16px">
      <div style="font-size:22px;font-weight:700;color:#d4a843">📖 ${info.title}</div>
      <div style="font-size:14px;line-height:1.7;color:rgba(240,237,228,.8)">${info.rules}</div>
      <button onclick="document.getElementById('howToPlayModal').style.display='none'" style="background:linear-gradient(135deg,#d4a843,#f5c842);color:#0a1208;border:none;border-radius:8px;padding:10px 24px;font-size:14px;font-weight:700;cursor:pointer;font-family:inherit;align-self:flex-end">Got it! ✓</button>
    </div>`;
  modal.style.display = 'flex';
}

// Add ? button to game screens
function addHelpButton(gameType) {
  const btn = document.createElement('button');
  btn.style.cssText = 'position:fixed;top:12px;left:12px;z-index:400;background:rgba(255,255,255,.1);border:1px solid rgba(255,255,255,.2);border-radius:50%;width:34px;height:34px;font-size:15px;cursor:pointer;color:#fff;font-weight:700';
  btn.textContent = '?';
  btn.title = 'How to play';
  btn.addEventListener('click', () => showHowToPlay(gameType));
  return btn;
}

// Attach help buttons when game starts
socket.on('game_started', ({ gameType }) => {
  setTimeout(() => {
    document.querySelectorAll('.help-btn').forEach(b => b.remove());
    const btn = addHelpButton(gameType);
    btn.classList.add('help-btn');
    document.body.appendChild(btn);
  }, 500);
});

// ── FRIEND INVITE LINK ────────────────────────────────────────────────────────
socket.on('room_created', ({ roomId: id }) => {
  // Add shareable invite link to waiting room
  setTimeout(() => {
    const existing = document.getElementById('inviteLink');
    if (existing) existing.remove();
    const inviteUrl = `${window.location.origin}?join=${id}`;
    const div = document.createElement('div');
    div.id = 'inviteLink';
    div.style.cssText = 'font-size:11px;color:rgba(240,237,228,.4);text-align:center;margin-top:-8px';
    div.innerHTML = `🔗 Share: <span style="color:rgba(212,168,67,.7);cursor:pointer" onclick="navigator.clipboard?.writeText('${inviteUrl}');this.textContent='Copied! ✓';setTimeout(()=>this.textContent='${inviteUrl.slice(0,40)}...',2000)">${inviteUrl.slice(0,40)}...</span>`;
    const note = document.getElementById('waitingNote');
    if (note) note.after(div);
  }, 300);
});

// Auto-join from URL param
window.addEventListener('load', () => {
  const params = new URLSearchParams(window.location.search);
  const joinCode = params.get('join');
  if (joinCode) {
    document.getElementById('roomCodeInput').value = joinCode;
    document.getElementById('roomCodeInput').focus();
    showToast(`Room code ${joinCode} ready — enter your name and click Join!`);
  }
});

// ── DEAL ANIMATION ────────────────────────────────────────────────────────────
socket.on('game_started', ({ gameType }) => {
  playSound('deal');
  // Flash screen briefly
  const flash = document.createElement('div');
  flash.style.cssText = 'position:fixed;inset:0;background:rgba(255,215,0,.08);z-index:50;pointer-events:none;animation:flashIn .4s ease-out forwards';
  if (!document.getElementById('flashStyle')) {
    const s = document.createElement('style');
    s.id = 'flashStyle';
    s.textContent = '@keyframes flashIn{0%{opacity:1}100%{opacity:0}}';
    document.head.appendChild(s);
  }
  document.body.appendChild(flash);
  setTimeout(() => flash.remove(), 400);
});
