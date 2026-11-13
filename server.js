const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

// Serve apenas os arquivos do site (nada do servidor fica exposto)
for (const f of ['index.html', 'style.css', 'app.js']) {
  app.get(f === 'index.html' ? '/' : '/' + f, (req, res) =>
    res.sendFile(path.join(__dirname, f))
  );
}

/* ------------------------------------------------------------------ */
/* Baralho                                                             */
/* ------------------------------------------------------------------ */

const COLORS = ['roxo', 'marinho', 'ciano', 'branco'];
const COLOR_LABEL = {
  roxo: 'Roxo',
  marinho: 'Azul escuro',
  ciano: 'Azul claro',
  branco: 'Branco',
};
const VALUE_LABEL = {
  skip: 'Pular',
  reverse: 'Inverter',
  '+2': '+2',
  wild: 'Coringa',
  '+4': 'Coringa +4',
};

let nextCardId = 0;

function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildDeck() {
  const deck = [];
  const add = (color, value) => deck.push({ id: ++nextCardId, color, value });
  for (const c of COLORS) {
    add(c, '0');
    for (let n = 1; n <= 9; n++) {
      add(c, String(n));
      add(c, String(n));
    }
    for (const v of ['skip', 'reverse', '+2']) {
      add(c, v);
      add(c, v);
    }
  }
  for (let i = 0; i < 4; i++) {
    add(null, 'wild');
    add(null, '+4');
  }
  return shuffle(deck);
}

function cardName(card) {
  const v = VALUE_LABEL[card.value] || card.value;
  return card.color ? `${v} ${COLOR_LABEL[card.color]}` : v;
}

/* ------------------------------------------------------------------ */
/* Estado                                                              */
/* ------------------------------------------------------------------ */

const users = new Map(); // socket.id -> { name, roomId }
const rooms = new Map(); // roomId -> room

function addLog(room, text) {
  room.log.push(text);
  if (room.log.length > 30) room.log.shift();
}

function topCard(room) {
  return room.discard[room.discard.length - 1] || null;
}

function isPlayable(room, card) {
  const top = topCard(room);
  return (
    card.color === null ||
    card.color === room.currentColor ||
    (top && card.value === top.value)
  );
}

function advance(room, steps) {
  const n = room.players.length;
  room.turn = (((room.turn + room.dir * steps) % n) + n) % n;
}

function drawFromDeck(room) {
  if (room.deck.length === 0 && room.discard.length > 1) {
    const top = room.discard.pop();
    room.deck = shuffle(room.discard);
    room.discard = [top];
  }
  return room.deck.pop() || null;
}

function drawCards(room, player, count) {
  let drawn = 0;
  for (let i = 0; i < count; i++) {
    const c = drawFromDeck(room);
    if (!c) break;
    player.hand.push(c);
    drawn++;
  }
  return drawn;
}

function startGame(room) {
  room.deck = buildDeck();
  room.discard = [];
  room.players.forEach((p) => (p.hand = []));
  for (let i = 0; i < 7; i++) {
    for (const p of room.players) p.hand.push(room.deck.pop());
  }
  // Primeira carta da mesa: sempre uma carta numerada
  const idx = room.deck.findIndex((c) => /^\d$/.test(c.value));
  const first = room.deck.splice(idx, 1)[0];
  room.discard.push(first);
  room.currentColor = first.color;
  room.turn = Math.floor(Math.random() * room.players.length);
  room.dir = 1;
  room.drawn = false;
  room.winner = null;
  room.status = 'playing';
  room.log = [];
  addLog(room, `Partida iniciada! Carta inicial: ${cardName(first)}.`);
  addLog(room, `${room.players[room.turn].name} começa.`);
}

function finish(room, winner, extra) {
  room.status = 'finished';
  room.winner = winner.name;
  room.drawn = false;
  addLog(room, `🏆 ${winner.name} venceu${extra || ''}!`);
}

/* ------------------------------------------------------------------ */
/* Envio de estado                                                     */
/* ------------------------------------------------------------------ */

function roomList() {
  return [...rooms.values()].map((r) => ({
    id: r.id,
    name: r.name,
    host: (r.players.find((p) => p.id === r.hostId) || {}).name || '?',
    count: r.players.length,
    max: r.max,
    status: r.status === 'playing' ? 'playing' : 'open',
  }));
}

function stateFor(room, sid) {
  const me = room.players.find((p) => p.id === sid);
  return {
    id: room.id,
    name: room.name,
    hostId: room.hostId,
    max: room.max,
    status: room.status,
    you: sid,
    players: room.players.map((p) => ({ id: p.id, name: p.name, count: p.hand.length })),
    hand: me ? me.hand : [],
    top: topCard(room),
    color: room.currentColor,
    turnId: room.status === 'playing' ? room.players[room.turn].id : null,
    dir: room.dir,
    deckCount: room.deck.length,
    drawn: room.drawn,
    log: room.log.slice(-6),
    winner: room.winner,
  };
}

function pushRoom(room) {
  for (const p of room.players) io.to(p.id).emit('room', stateFor(room, p.id));
}

function pushRooms() {
  io.emit('rooms', roomList());
}

/* ------------------------------------------------------------------ */
/* Sair da sala                                                        */
/* ------------------------------------------------------------------ */

function removeFromRoom(sid) {
  const user = users.get(sid);
  if (!user || !user.roomId) return;
  const room = rooms.get(user.roomId);
  user.roomId = null;
  if (!room) return;

  const idx = room.players.findIndex((p) => p.id === sid);
  if (idx < 0) return;
  const [leaving] = room.players.splice(idx, 1);

  if (room.players.length === 0) {
    rooms.delete(room.id);
    pushRooms();
    return;
  }
  if (room.hostId === sid) room.hostId = room.players[0].id;

  if (room.status === 'playing') {
    room.deck.unshift(...leaving.hand);
    addLog(room, `${leaving.name} saiu da partida.`);
    if (room.players.length < 2) {
      finish(room, room.players[0], ' porque os outros saíram');
    } else {
      const n = room.players.length;
      if (idx < room.turn) {
        room.turn--;
      } else if (idx === room.turn) {
        room.turn = room.dir === 1 ? room.turn % n : (room.turn - 1 + n) % n;
        room.drawn = false;
      }
      room.turn = ((room.turn % n) + n) % n;
    }
  }
  pushRoom(room);
  pushRooms();
}

/* ------------------------------------------------------------------ */
/* Sockets                                                             */
/* ------------------------------------------------------------------ */

function handle(socket, event, fn) {
  socket.on(event, (payload, cb) => {
    const reply = typeof cb === 'function' ? cb : () => {};
    try {
      fn(payload && typeof payload === 'object' ? payload : {}, reply);
    } catch (e) {
      console.error(e);
      reply({ error: 'Erro no servidor.' });
    }
  });
}

io.on('connection', (socket) => {
  users.set(socket.id, { name: null, roomId: null });

  const user = () => users.get(socket.id);
  const roomOf = () => {
    const u = user();
    return u && u.roomId ? rooms.get(u.roomId) : null;
  };

  handle(socket, 'setName', ({ name }, reply) => {
    const clean = String(name || '').trim().slice(0, 16);
    if (!clean) return reply({ error: 'Digite seu nome.' });
    user().name = clean;
    reply({ ok: true });
    socket.emit('rooms', roomList());
  });

  handle(socket, 'createRoom', ({ name, max }, reply) => {
    const u = user();
    if (!u.name) return reply({ error: 'Defina seu nome primeiro.' });
    const roomName = String(name || '').trim().slice(0, 24);
    if (!roomName) return reply({ error: 'Dê um nome para a sala.' });
    const maxPlayers = Math.min(6, Math.max(2, parseInt(max, 10) || 4));

    removeFromRoom(socket.id);

    const room = {
      id: Math.random().toString(36).slice(2, 8),
      name: roomName,
      hostId: socket.id,
      max: maxPlayers,
      status: 'waiting',
      players: [{ id: socket.id, name: u.name, hand: [] }],
      deck: [],
      discard: [],
      turn: 0,
      dir: 1,
      currentColor: null,
      drawn: false,
      winner: null,
      log: [],
    };
    rooms.set(room.id, room);
    u.roomId = room.id;
    reply({ ok: true });
    pushRoom(room);
    pushRooms();
  });

  handle(socket, 'joinRoom', ({ roomId }, reply) => {
    const u = user();
    if (!u.name) return reply({ error: 'Defina seu nome primeiro.' });
    const room = rooms.get(roomId);
    if (!room) return reply({ error: 'Essa sala não existe mais.' });
    if (u.roomId === room.id) return reply({ ok: true });
    if (room.status === 'playing') return reply({ error: 'A partida já começou.' });
    if (room.players.length >= room.max) return reply({ error: 'A sala está cheia.' });

    removeFromRoom(socket.id);
    room.players.push({ id: socket.id, name: u.name, hand: [] });
    u.roomId = room.id;
    reply({ ok: true });
    pushRoom(room);
    pushRooms();
  });

  handle(socket, 'leaveRoom', (_p, reply) => {
    removeFromRoom(socket.id);
    socket.emit('left');
    reply({ ok: true });
  });

  handle(socket, 'startGame', (_p, reply) => {
    const room = roomOf();
    if (!room) return reply({ error: 'Você não está em uma sala.' });
    if (room.hostId !== socket.id) return reply({ error: 'Só o anfitrião inicia a partida.' });
    if (room.status === 'playing') return reply({ error: 'A partida já está rolando.' });
    if (room.players.length < 2) return reply({ error: 'Precisa de pelo menos 2 jogadores.' });
    startGame(room);
    reply({ ok: true });
    pushRoom(room);
    pushRooms();
  });

  handle(socket, 'playCard', ({ cardId, color }, reply) => {
    const room = roomOf();
    if (!room || room.status !== 'playing') return reply({ error: 'Não há partida em andamento.' });
    const player = room.players[room.turn];
    if (player.id !== socket.id) return reply({ error: 'Não é a sua vez.' });
    const card = player.hand.find((c) => c.id === cardId);
    if (!card) return reply({ error: 'Carta inválida.' });
    if (!isPlayable(room, card)) return reply({ error: 'Essa carta não pode ser jogada agora.' });
    if (card.color === null && !COLORS.includes(color)) return reply({ error: 'Escolha uma cor.' });

    player.hand.splice(player.hand.indexOf(card), 1);
    room.discard.push(card);
    room.currentColor = card.color || color;
    room.drawn = false;
    addLog(
      room,
      `${player.name} jogou ${cardName(card)}` +
        (card.color === null ? ` (cor: ${COLOR_LABEL[color]})` : '')
    );

    if (player.hand.length === 0) {
      finish(room, player);
    } else {
      if (player.hand.length === 1) addLog(room, `🔔 ${player.name} gritou UNO!`);
      const n = room.players.length;
      if (card.value === 'skip') {
        const victim = room.players[(room.turn + room.dir + n) % n];
        addLog(room, `${victim.name} perdeu a vez.`);
        advance(room, 2);
      } else if (card.value === 'reverse') {
        room.dir *= -1;
        addLog(room, 'O sentido do jogo foi invertido.');
        advance(room, n === 2 ? 2 : 1);
      } else if (card.value === '+2' || card.value === '+4') {
        const victim = room.players[(room.turn + room.dir + n) % n];
        const got = drawCards(room, victim, card.value === '+2' ? 2 : 4);
        addLog(room, `${victim.name} comprou ${got} cartas e perdeu a vez.`);
        advance(room, 2);
      } else {
        advance(room, 1);
      }
    }
    reply({ ok: true });
    pushRoom(room);
    pushRooms();
  });

  handle(socket, 'drawCard', (_p, reply) => {
    const room = roomOf();
    if (!room || room.status !== 'playing') return reply({ error: 'Não há partida em andamento.' });
    const player = room.players[room.turn];
    if (player.id !== socket.id) return reply({ error: 'Não é a sua vez.' });
    if (room.drawn) return reply({ error: 'Você já comprou nesta rodada.' });

    const c = drawFromDeck(room);
    if (!c) {
      addLog(room, 'Não há mais cartas para comprar.');
      advance(room, 1);
    } else {
      player.hand.push(c);
      addLog(room, `${player.name} comprou uma carta.`);
      if (isPlayable(room, c)) {
        room.drawn = true;
      } else {
        addLog(room, `${player.name} não pôde jogar e passou a vez.`);
        advance(room, 1);
      }
    }
    reply({ ok: true });
    pushRoom(room);
  });

  handle(socket, 'passTurn', (_p, reply) => {
    const room = roomOf();
    if (!room || room.status !== 'playing') return reply({ error: 'Não há partida em andamento.' });
    const player = room.players[room.turn];
    if (player.id !== socket.id) return reply({ error: 'Não é a sua vez.' });
    if (!room.drawn) return reply({ error: 'Compre uma carta antes de passar.' });
    room.drawn = false;
    addLog(room, `${player.name} passou a vez.`);
    advance(room, 1);
    reply({ ok: true });
    pushRoom(room);
  });

  socket.on('disconnect', () => {
    removeFromRoom(socket.id);
    users.delete(socket.id);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`UNO Pro rodando em http://localhost:${PORT}`));
