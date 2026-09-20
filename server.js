const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');
const world = require('./world.json');

const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

// Stato di gioco in memoria: { id: { name, room, ws } }
const players = {};
let nextId = 1;

function broadcastAll(msg, excludeId) {
  const data = JSON.stringify(msg);
  for (const id in players) {
    if (id === excludeId) continue;
    const p = players[id];
    if (p.ws.readyState === p.ws.OPEN) p.ws.send(data);
  }
}

function playersInRoom(roomId, excludeId) {
  return Object.entries(players)
    .filter(([id, p]) => p.room === roomId && id !== excludeId)
    .map(([id, p]) => ({ id, name: p.name }));
}

function allPlayersPublic() {
  return Object.entries(players).map(([id, p]) => ({ id, name: p.name, room: p.room }));
}

function sendRoom(id) {
  const p = players[id];
  const room = world.rooms[p.room];
  p.ws.send(JSON.stringify({
    type: 'room',
    room: {
      id: p.room,
      name: room.name,
      desc: room.desc,
      icon: room.icon,
      exits: Object.keys(room.exits),
      items: room.items,
      players: playersInRoom(p.room, id)
    }
  }));
}

function sendMap(id) {
  players[id].ws.send(JSON.stringify({
    type: 'map',
    rooms: Object.entries(world.rooms).map(([rid, r]) => ({ id: rid, x: r.x, y: r.y, icon: r.icon, exits: r.exits })),
    you: players[id].room,
    others: allPlayersPublic().filter(p => p.id !== id)
  }));
}

function sendMapToAll() {
  for (const id in players) sendMap(id);
}

wss.on('connection', (ws) => {
  const id = String(nextId++);

  ws.on('message', (raw) => {
    let msg;
    try { msg = JSON.parse(raw); } catch { return; }

    if (msg.type === 'join') {
      const name = (msg.name || 'Vagabondo').slice(0, 20).trim() || 'Vagabondo';
      players[id] = { name, room: world.start, ws };
      ws.send(JSON.stringify({ type: 'welcome', id, name }));
      sendRoom(id);
      sendMapToAll();
      broadcastAll({ type: 'chat', from: 'Sistema', text: `${name} è entrato/a nel mondo.` }, id);
      return;
    }

    const p = players[id];
    if (!p) return;

    if (msg.type === 'move') {
      const room = world.rooms[p.room];
      const dest = room.exits[msg.dir];
      if (!dest) {
        ws.send(JSON.stringify({ type: 'chat', from: 'Sistema', text: 'Non puoi andare in quella direzione.' }));
        return;
      }
      broadcastAll({ type: 'chat', from: 'Sistema', text: `${p.name} se ne va.` }, id);
      p.room = dest;
      sendRoom(id);
      broadcastAll({ type: 'chat', from: 'Sistema', text: `${p.name} arriva.` }, id);
      // aggiorna la stanza per chi resta nella stanza vecchia/nuova
      for (const otherId in players) {
        if (players[otherId].room === dest || otherId === id) sendRoom(otherId === id ? id : otherId);
      }
      sendMapToAll();
      return;
    }

    if (msg.type === 'say') {
      const text = String(msg.text || '').slice(0, 300);
      if (!text) return;
      const payload = { type: 'chat', from: p.name, text };
      for (const otherId in players) {
        if (players[otherId].room === p.room) players[otherId].ws.send(JSON.stringify(payload));
      }
      return;
    }

    if (msg.type === 'take') {
      const room = world.rooms[p.room];
      const idx = room.items.indexOf(msg.item);
      if (idx === -1) {
        ws.send(JSON.stringify({ type: 'chat', from: 'Sistema', text: 'Non vedi questo oggetto qui.' }));
        return;
      }
      room.items.splice(idx, 1);
      p.inventory = p.inventory || [];
      p.inventory.push(msg.item);
      ws.send(JSON.stringify({ type: 'chat', from: 'Sistema', text: `Hai preso: ${msg.item}` }));
      for (const otherId in players) {
        if (players[otherId].room === p.room) sendRoom(otherId);
      }
      return;
    }

    if (msg.type === 'inventory') {
      const inv = (p.inventory || []);
      ws.send(JSON.stringify({ type: 'chat', from: 'Sistema', text: inv.length ? `Inventario: ${inv.join(', ')}` : 'Il tuo inventario è vuoto.' }));
      return;
    }
  });

  ws.on('close', () => {
    const p = players[id];
    if (p) {
      broadcastAll({ type: 'chat', from: 'Sistema', text: `${p.name} se ne è andato/a.` }, id);
      delete players[id];
      sendMapToAll();
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`MUD in ascolto sulla porta ${PORT}`));
