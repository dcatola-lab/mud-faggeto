let ws = null;
let myId = null;
let mapData = null;

const joinScreen = document.getElementById('joinScreen');
const game = document.getElementById('game');
const log = document.getElementById('log');
const canvas = document.getElementById('mapCanvas');
const ctx = canvas.getContext('2d');

document.getElementById('joinBtn').onclick = join;
document.getElementById('nameInput').addEventListener('keydown', e => { if (e.key === 'Enter') join(); });
document.getElementById('sendBtn').onclick = sendCommand;
document.getElementById('cmdInput').addEventListener('keydown', e => { if (e.key === 'Enter') sendCommand(); });

function join() {
  const name = document.getElementById('nameInput').value.trim() || 'Vagabondo';
  const proto = location.protocol === 'https:' ? 'wss' : 'ws';
  ws = new WebSocket(`${proto}://${location.host}`);
  ws.onopen = () => ws.send(JSON.stringify({ type: 'join', name }));
  ws.onmessage = onMessage;
  ws.onclose = () => addLine('Connessione persa. Ricarica la pagina per riconnetterti.', 'sys');
}

function onMessage(evt) {
  const msg = JSON.parse(evt.data);
  if (msg.type === 'welcome') {
    myId = msg.id;
    joinScreen.style.display = 'none';
    game.style.display = 'flex';
  } else if (msg.type === 'room') {
    renderRoom(msg.room);
  } else if (msg.type === 'map') {
    mapData = msg;
    drawMap();
  } else if (msg.type === 'chat') {
    addLine(msg.text, msg.from === 'Sistema' ? 'sys' : 'chat', msg.from);
  }
}

function addLine(text, cls, from) {
  const d = document.createElement('div');
  d.className = 'line ' + (cls || '');
  d.innerHTML = from && cls === 'chat' ? `<b>${from}:</b> ${escapeHtml(text)}` : escapeHtml(text);
  log.appendChild(d);
  log.scrollTop = log.scrollHeight;
}
function escapeHtml(s) { return s.replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c])); }

function renderRoom(room) {
  document.getElementById('roomImage').innerHTML = ROOM_ART[room.icon] || '';
  document.getElementById('roomName').textContent = room.name;
  document.getElementById('roomDesc').textContent = room.desc;

  const itemsEl = document.getElementById('roomItems');
  itemsEl.innerHTML = room.items.length
    ? 'Oggetti qui: ' + room.items.map(i => `<button class="itemBtn" onclick="takeItem('${i}')">${i}</button>`).join(', ')
    : '';

  const playersEl = document.getElementById('roomPlayers');
  playersEl.textContent = room.players.length
    ? 'Presenti: ' + room.players.map(p => p.name).join(', ')
    : '';

  const exitsEl = document.getElementById('exits');
  exitsEl.innerHTML = '';
  room.exits.forEach(dir => {
    const b = document.createElement('button');
    b.className = 'exitBtn';
    b.textContent = '→ ' + dir;
    b.onclick = () => move(dir);
    exitsEl.appendChild(b);
  });
}

function move(dir) { ws.send(JSON.stringify({ type: 'move', dir })); }
function takeItem(item) { ws.send(JSON.stringify({ type: 'take', item })); }

function sendCommand() {
  const input = document.getElementById('cmdInput');
  const text = input.value.trim();
  if (!text) return;
  input.value = '';

  const parts = text.split(' ');
  const cmd = parts[0].toLowerCase();

  if (cmd === 'vai' && parts[1]) { move(parts[1]); return; }
  if (cmd === 'prendi' && parts[1]) { takeItem(parts.slice(1).join(' ')); return; }
  if (cmd === 'inventario') { ws.send(JSON.stringify({ type: 'inventory' })); return; }

  ws.send(JSON.stringify({ type: 'say', text }));
}

function drawMap() {
  if (!mapData) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  const cell = 60, offsetX = 30, offsetY = 30;

  // collegamenti
  ctx.strokeStyle = '#5a4530';
  ctx.lineWidth = 2;
  mapData.rooms.forEach(r => {
    Object.values(r.exits).forEach(destId => {
      const dest = mapData.rooms.find(x => x.id === destId);
      if (!dest) return;
      ctx.beginPath();
      ctx.moveTo(offsetX + r.x * cell, offsetY + r.y * cell);
      ctx.lineTo(offsetX + dest.x * cell, offsetY + dest.y * cell);
      ctx.stroke();
    });
  });

  // stanze
  mapData.rooms.forEach(r => {
    const x = offsetX + r.x * cell, y = offsetY + r.y * cell;
    ctx.fillStyle = r.id === mapData.you ? '#c9822f' : '#6a5238';
    ctx.beginPath();
    ctx.arc(x, y, r.id === mapData.you ? 10 : 7, 0, Math.PI * 2);
    ctx.fill();
  });

  // altri giocatori (piccoli puntini bianchi vicino alla stanza)
  mapData.others.forEach(p => {
    const r = mapData.rooms.find(x => x.id === p.room);
    if (!r) return;
    const x = offsetX + r.x * cell + 10, y = offsetY + r.y * cell - 10;
    ctx.fillStyle = '#f0e4d0';
    ctx.beginPath();
    ctx.arc(x, y, 4, 0, Math.PI * 2);
    ctx.fill();
  });
}
