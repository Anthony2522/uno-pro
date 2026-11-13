(() => {
  const socket = io();
  const $ = (s) => document.querySelector(s);
  const el = (tag, cls, text) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text !== undefined) e.textContent = text;
    return e;
  };

  const COLORS = ['roxo', 'marinho', 'ciano', 'branco'];
  const COLOR_LABEL = { roxo: 'Roxo', marinho: 'Azul escuro', ciano: 'Azul claro', branco: 'Branco' };
  const COLOR_HEX = { roxo: '#7c3aed', marinho: '#14206b', ciano: '#38bdf8', branco: '#ffffff' };

  let myName = '';
  let registered = false;
  let rooms = [];
  let state = null;
  let pendingWild = null;
  let toastTimer = null;

  /* ---------- utilidades ---------- */
  function show(id) {
    document.querySelectorAll('.screen').forEach((s) => s.classList.toggle('active', s.id === id));
  }
  function toast(msg) {
    const t = $('#toast');
    t.textContent = msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.classList.remove('show'), 2600);
  }
  const done = (res) => {
    if (res && res.error) toast(res.error);
  };

  /* ---------- 1. nome ---------- */
  const nameInput = $('#name-input');
  nameInput.value = localStorage.getItem('unopro:name') || '';

  function register(name) {
    if (!name) return toast('Digite seu nome');
    socket.emit('setName', { name }, (res) => {
      if (res && res.error) return toast(res.error);
      myName = name;
      registered = true;
      localStorage.setItem('unopro:name', name);
      $('#hello').textContent = name;
      show('screen-home');
    });
  }

  $('#name-form').addEventListener('submit', (e) => {
    e.preventDefault();
    register(nameInput.value.trim());
  });

  socket.on('connect', () => {
    if (registered) {
      state = null;
      register(myName);
    }
  });
  socket.on('disconnect', () => toast('Conexão perdida. Reconectando…'));

  /* ---------- 2. início ---------- */
  document.querySelectorAll('.tab').forEach((t) =>
    t.addEventListener('click', () => {
      document.querySelectorAll('.tab').forEach((x) => x.classList.toggle('active', x === t));
      document.querySelectorAll('.pane').forEach((p) =>
        p.classList.toggle('active', p.id === 'pane-' + t.dataset.tab)
      );
    })
  );

  $('#create-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = $('#room-name').value.trim();
    if (!name) return toast('Dê um nome para a sala');
    socket.emit('createRoom', { name, max: $('#room-max').value }, (res) => {
      done(res);
      if (res && res.ok) $('#room-name').value = '';
    });
  });

  function renderRooms() {
    const box = $('#room-list');
    box.replaceChildren();
    if (!rooms.length) {
      box.appendChild(el('p', 'empty', 'Nenhuma sala por aqui ainda. Crie a primeira na aba “Criar sala”!'));
      return;
    }
    for (const r of rooms) {
      const row = el('div', 'room-row');
      const info = el('div', 'room-info');
      info.appendChild(el('strong', null, r.name));
      info.appendChild(el('span', 'muted', `Anfitrião: ${r.host} · ${r.count}/${r.max} jogadores`));
      const playing = r.status === 'playing';
      const badge = el('span', 'badge ' + (playing ? 'busy' : 'open'), playing ? 'Em jogo' : 'Aberta');
      const btn = el('button', 'btn small', 'Entrar');
      btn.disabled = playing || r.count >= r.max;
      btn.addEventListener('click', () => socket.emit('joinRoom', { roomId: r.id }, done));
      row.append(info, badge, btn);
      box.appendChild(row);
    }
  }

  socket.on('rooms', (list) => {
    rooms = list;
    renderRooms();
  });

  /* ---------- 3. sala ---------- */
  function renderLobby() {
    show('screen-room');
    $('#room-title').textContent = state.name;
    $('#room-sub').textContent = `${state.players.length}/${state.max} jogadores`;

    const w = $('#winner');
    w.hidden = !state.winner;
    if (state.winner) w.textContent = `🏆 ${state.winner} venceu a última partida!`;

    const ul = $('#room-players');
    ul.replaceChildren();
    for (const p of state.players) {
      const li = el('li');
      li.appendChild(el('span', null, (p.id === state.hostId ? '👑 ' : '') + p.name));
      if (p.id === state.you) li.appendChild(el('span', 'you', 'você'));
      ul.appendChild(li);
    }

    const isHost = state.hostId === state.you;
    const btn = $('#btn-start');
    btn.hidden = !isHost;
    btn.disabled = state.players.length < 2;
    btn.textContent = state.winner ? 'Jogar de novo' : 'Começar partida';
    $('#wait-msg').textContent = isHost
      ? state.players.length < 2 ? 'Aguardando mais jogadores…' : ''
      : 'Aguardando o anfitrião iniciar…';
  }

  $('#btn-start').addEventListener('click', () => socket.emit('startGame', {}, done));
  $('#btn-leave-room').addEventListener('click', () => socket.emit('leaveRoom', {}, done));
  $('#btn-leave-game').addEventListener('click', () => {
    if (confirm('Sair da partida?')) socket.emit('leaveRoom', {}, done);
  });

  /* ---------- 4. jogo ---------- */
  const SYMBOL = { skip: '⊘', reverse: '⇄', '+2': '+2', wild: '★', '+4': '+4' };
  const sym = (v) => SYMBOL[v] || v;

  function cardEl(card) {
    const c = el('div', 'card ' + (card.color ? 'c-' + card.color : 'c-wild'));
    const s = sym(card.value);
    c.append(el('span', 'corner', s), el('span', 'val', s), el('span', 'corner br', s));
    return c;
  }

  function canPlay(card) {
    return card.color === null || card.color === state.color || (state.top && card.value === state.top.value);
  }

  function sortHand(hand) {
    const rank = (c) => (c.color === null ? 99 : COLORS.indexOf(c.color));
    return [...hand].sort((a, b) => rank(a) - rank(b) || String(a.value).localeCompare(String(b.value), 'pt', { numeric: true }));
  }

  function renderGame() {
    show('screen-game');
    const myTurn = state.turnId === state.you;
    $('#game-room').textContent = state.name;

    // adversários
    const opp = $('#opponents');
    opp.replaceChildren();
    for (const p of state.players) {
      if (p.id === state.you) continue;
      const d = el('div', 'opp' + (p.id === state.turnId ? ' turn' : ''));
      d.append(el('div', 'n', p.name), el('div', 'c', `${p.count} carta${p.count === 1 ? '' : 's'}`));
      opp.appendChild(d);
    }

    // mesa
    const deck = $('#deck');
    deck.replaceChildren();
    const back = el('div', 'card back');
    back.appendChild(el('span', 'val', 'UNO'));
    deck.append(back, el('span', 'count', String(state.deckCount)));
    deck.disabled = !(myTurn && !state.drawn);
    deck.classList.toggle('can-draw', myTurn && !state.drawn);

    const pile = $('#pile');
    pile.replaceChildren();
    if (state.top) pile.appendChild(cardEl(state.top));

    $('#color-dot').style.background = COLOR_HEX[state.color] || 'transparent';
    $('#color-name').textContent = COLOR_LABEL[state.color] || '';
    $('#dir').textContent = state.dir === 1 ? '↻' : '↺';

    // vez
    const tm = $('#turn-msg');
    tm.classList.toggle('mine', myTurn);
    if (myTurn) {
      tm.textContent = state.drawn ? 'Jogue a carta ou passe a vez' : 'Sua vez!';
    } else {
      const p = state.players.find((x) => x.id === state.turnId);
      tm.textContent = p ? `Vez de ${p.name}` : '';
    }

    // log
    const log = $('#log');
    log.replaceChildren();
    for (const line of state.log) log.appendChild(el('div', null, line));

    // mão
    const hand = $('#hand');
    hand.replaceChildren();
    for (const card of sortHand(state.hand)) {
      const c = cardEl(card);
      const ok = myTurn && canPlay(card);
      c.classList.add(ok ? 'playable' : 'dim');
      if (ok) c.addEventListener('click', () => playCard(card));
      hand.appendChild(c);
    }
    $('#btn-pass').hidden = !(myTurn && state.drawn);
  }

  function playCard(card) {
    if (card.color === null) {
      pendingWild = card;
      $('#color-modal').hidden = false;
    } else {
      socket.emit('playCard', { cardId: card.id }, done);
    }
  }

  document.querySelectorAll('.choice').forEach((b) =>
    b.addEventListener('click', () => {
      if (!pendingWild) return;
      socket.emit('playCard', { cardId: pendingWild.id, color: b.dataset.color }, done);
      pendingWild = null;
      $('#color-modal').hidden = true;
    })
  );
  $('#color-cancel').addEventListener('click', () => {
    pendingWild = null;
    $('#color-modal').hidden = true;
  });

  $('#deck').addEventListener('click', () => socket.emit('drawCard', {}, done));
  $('#btn-pass').addEventListener('click', () => socket.emit('passTurn', {}, done));

  /* ---------- eventos do servidor ---------- */
  socket.on('room', (s) => {
    state = s;
    $('#color-modal').hidden = true;
    if (s.status === 'playing') renderGame();
    else renderLobby();
  });

  socket.on('left', () => {
    state = null;
    pendingWild = null;
    $('#color-modal').hidden = true;
    show('screen-home');
  });
})();
