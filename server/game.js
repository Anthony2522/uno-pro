// UNO Pro — in-memory game engine.
// Ported 1:1 from the original database functions (register_guest … catch_uno).
// All state lives in this Node process: a restart (e.g. Render Free going to sleep) wipes it.
import crypto from "node:crypto";

export class RpcError extends Error {
  constructor(code, status = 400) {
    super(code);
    this.code = code;
    this.status = status;
  }
}
const fail = (code, status) => {
  throw new RpcError(code, status);
};

// ---------- tunables (same values as the original SQL) ----------
export const LIMITS = {
  onlineMs: 25_000, // member shown as online
  waitingIdleMs: 120_000, // removed from a waiting room after this
  playingIdleMs: 300_000, // removed from a running game after ~5 minutes
  autoPassMs: 30_000, // disconnected player's turn is auto-passed
  lobbyVisibleMs: 60_000, // public room listed only if someone was seen recently
  roomExpireMs: 15 * 60_000, // abandoned rooms are deleted
  guestExpireMs: 24 * 60 * 60_000, // guests not seen for a day (and in no room) are forgotten
  maxGuests: 20_000,
  maxRooms: 2_000,
};

// ---------- state ----------
export const store = {
  guestsById: new Map(), // id -> { id, tokenHash, nickname, last_seen }
  guestsByHash: new Map(), // tokenHash -> guest
  rooms: new Map(), // id -> room
  roomsByCode: new Map(), // CODE -> room
};

let notify = () => {};
/** server.js registers a callback that pushes a data-free "bump" to SSE subscribers. */
export function onBump(fn) {
  notify = fn;
}
const bump = (room) => {
  room.version += 1;
  notify("room", room.code);
};
const bumpLobby = () => notify("lobby");

let clock = () => Date.now();
/** Test hook: lets tests fast-forward time. */
export function setClock(fn) {
  clock = fn;
}
const now = () => clock();
const iso = (ms) => new Date(ms).toISOString();

// ---------- helpers ----------
const hashToken = (t) => crypto.createHash("sha256").update(t, "utf8").digest("hex");
const len = (s) => [...s].length;

export function cleanText(p) {
  return String(p ?? "")
    .slice(0, 200)
    .replace(/[\u0000-\u001F\u007F-\u009F]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}
const cleanCode = (c) => cleanText(c).toUpperCase();

const CARD_RE = /^(?:[rygb](?:[0-9]|S|R|D|T|H|V|C|L|E)|W|W4|W5|X|B|N|P|M|Q)$/;
const isWild = (c) => c === "W" || c === "W4" || c === "W5" || c === "X" || c === "B" || c === "N" || c === "P" || c === "M" || c === "Q";
export const cardValue = (c) => (isWild(c) ? c : c.slice(1));
export function playable(c, top, color) {
  return isWild(c) || c[0] === color || (!isWild(top) && c.slice(1) === top.slice(1));
}
const advance = (idx, dir, steps, n) => (((idx + dir * steps) % n) + n) % n;

/** Fisher–Yates with a cryptographically secure RNG. */
export function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** UNO Pro: 3 of each number/action, two +2 Reverse per color, 10 wilds, 10 +4, two +5, one Detective, one Bomb, one Negation, one Powerless, one Machine Gun, and two Shields, two Vortex, one Beer, two Locks and two Swords per color = 228 cards (including one Mirror Wild). */
export const CUSTOM_CARD_KEYS=Object.freeze(["T","H","E","L","V","C","W5","X","B","N","P","M","Q"]);
export const DEFAULT_CARDS_ENABLED=Object.freeze(Object.fromEntries(CUSTOM_CARD_KEYS.map(k=>[k,true])));
export function normalizeCardsEnabled(value){
  return Object.fromEntries(CUSTOM_CARD_KEYS.map(k=>[k,value?.[k]!==false]));
}
function customCardKey(card){
  const value=card.startsWith("W")?card:card.length>1?card.slice(1):card;
  return CUSTOM_CARD_KEYS.includes(value)?value:null;
}
export function newDeck(cardsEnabled=DEFAULT_CARDS_ENABLED) {
  const d = [];
  for (const col of ["r", "y", "g", "b"]) {
    for (const v of ["0", "1", "2", "3", "4", "5", "6", "7", "8", "9", "S", "R", "D"]) {
      for (let i = 0; i < 3; i++) d.push(col + v);
    }
  }
  for (let i = 0; i < 10; i++) d.push("W", "W4");
  for (let i = 0; i < 2; i++) d.push("W5");
  d.push("X", "B", "N", "P", "M", "Q"); // One of each custom wild per fresh deck.
  for (const col of ["r", "y", "g", "b"]) d.push(col + "T", col + "T", col + "H", col + "H", col + "V", col + "V", col + "C", col + "L", col + "L", col + "E", col + "E");
  return shuffle(d.filter(card=>{
    const custom=customCardKey(card);
    return !custom || cardsEnabled[custom]!==false;
  }));
}

const CODE_ALPHA = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
function genCode() {
  for (;;) {
    let c = "";
    for (let i = 0; i < 6; i++) c += CODE_ALPHA[crypto.randomInt(CODE_ALPHA.length)];
    if (!store.roomsByCode.has(c)) return c;
  }
}

function auth(token) {
  if (typeof token !== "string" || token.length < 32 || token.length > 128) fail("INVALID_SESSION", 401);
  const g = store.guestsByHash.get(hashToken(token));
  if (!g) fail("INVALID_SESSION", 401);
  g.last_seen = now();
  return g;
}

function findRoom(code) {
  const r = store.roomsByCode.get(cleanCode(code));
  if (!r) fail("ROOM_NOT_FOUND", 404);
  return r;
}
const isMember = (room, gid) => room.members.some((m) => m.guest_id === gid);
const nick = (gid) => store.guestsById.get(gid)?.nickname ?? null;
const currentPlayer = (g) => g.turn_order[g.turn_idx];
const touch = (room) => {
  room.updated_at = now();
};

function draw(room, gid, n) {
  const g = room.game;
  const drawn = [];
  for (let k = 0; k < n; k++) {
    if (g.draw_pile.length === 0) {
      // Endless fresh deck; keep discard history so the visible top card never changes.
      g.draw_pile = newDeck(room.cards_enabled);
      if(g.discard_pile.includes("Q")||[...room.hands.values()].some(h=>h.cards.includes("Q")))
        g.draw_pile=g.draw_pile.filter(c=>c!=="Q");
    }
    drawn.push(g.draw_pile.shift());
  }
  const h = room.hands.get(gid);
  if (h) {
    h.cards.push(...drawn);
    h.uno_called = false;
    h.uno_since = null;
  }
  return drawn;
}

function removeMember(room, gid) {
  if (!store.rooms.has(room.id) || !isMember(room, gid)) return;
  const name = nick(gid);
  const hand = room.hands.get(gid);
  const g = room.game;
  if (g && g.status === "playing" && g.turn_order.includes(gid)) {
    const pos = g.turn_order.indexOf(gid);
    const order = g.turn_order.filter((x) => x !== gid);
    const n = order.length;
    if (n < 2) {
      Object.assign(g, {
        status: "finished",
        winner_id: n === 1 ? order[0] : null,
        turn_order: order,
        turn_idx: 0,
        has_drawn: false,
        drawn_card: null,
        last_action: { type: "abandon", by: gid, name },
      });
      g.seq += 1;
      room.status = "waiting";
      touch(room);
    } else {
      let idx = g.turn_idx;
      if (pos < g.turn_idx) idx = g.turn_idx - 1;
      else if (pos === g.turn_idx && g.direction === -1) idx = g.turn_idx - 1;
      idx = ((idx % n) + n) % n;
      if (pos === g.turn_idx) {
        g.has_drawn = false;
        g.drawn_card = null;
        g.turn_started_at = now();
      }
      g.turn_order = order;
      g.turn_idx = idx;
      g.draw_pile.push(...(hand?.cards ?? []));
      g.last_action = { type: "left", by: gid, name };
      g.seq += 1;
    }
  }
  room.hands.delete(gid);
  room.members = room.members.filter((m) => m.guest_id !== gid);
  bump(room);
  bumpLobby();
  if (room.members.length === 0) {
    deleteRoom(room);
  } else if (room.host_id === gid) {
    room.host_id = room.members.find(m=>!m.spectator && !store.guestsById.get(m.guest_id)?.bot)?.guest_id ?? null; // a bot cannot host
    touch(room);
  } else {
    touch(room);
  }
}

function deleteRoom(room) {
  store.rooms.delete(room.id);
  store.roomsByCode.delete(room.code);
  notify("room", room.code);
}

function leaveOtherRooms(gid, keepId) {
  for (const r of [...store.rooms.values()]) {
    if (r.id !== keepId && isMember(r, gid)) removeMember(r, gid);
  }
}

function autoPass(room) {
  const g = room.game;
  if (!g || g.status !== "playing") return;
  const cur = currentPlayer(g);
  if (!g.has_drawn) draw(room, cur, 1);
  g.turn_idx = advance(g.turn_idx, g.direction, 1, g.turn_order.length);
  g.has_drawn = false;
  g.drawn_card = null;
  g.turn_started_at = now();
  g.last_action = { type: "auto", by: cur, name: nick(cur) };
  g.seq += 1;
  bump(room);
}

/** A single human against bots gets an indefinite in-memory reconnection grace. */
export function isSoloHumanBotMatch(room) {
  const ids=room.game?.status==="playing"?room.game.turn_order:[];
  const humans=ids.filter(id=>!store.guestsById.get(id)?.bot);
  return humans.length===1 && ids.length>1 && ids.some(id=>store.guestsById.get(id)?.bot);
}

/** Periodic housekeeping (replaces the SQL _cleanup / list_public_rooms deletes). */
export function sweep() {
  const t = now();
  for (const room of [...store.rooms.values()]) {
    const protectedMatch=isSoloHumanBotMatch(room) && (!room.game.solo_recovery_until || room.game.solo_recovery_until>t);
    const idle = room.status === "waiting" ? LIMITS.waitingIdleMs : LIMITS.playingIdleMs;
    for (const m of [...room.members]) {
      // Do not evict the only human while their bot-only match is alive.
      if(protectedMatch)continue;
      const g = store.guestsById.get(m.guest_id);
      if (!g || g.last_seen < t - idle) removeMember(room, m.guest_id);
    }
    if (!store.rooms.has(room.id)) continue;
    const game = room.game;
    // A loss of connection never immediately changes turns. The advanced
    // engine alone applies an offline grace deadline and normal turn limit.
    const anyRecent = room.members.some((m) => (store.guestsById.get(m.guest_id)?.last_seen ?? 0) > t - LIMITS.roomExpireMs);
    if (!protectedMatch && room.updated_at < t - LIMITS.roomExpireMs && !anyRecent) {
      deleteRoom(room);
      bumpLobby();
    }
  }
  // Forget long-gone guests that are in no room.
  const inRoom = new Set();
  for (const r of store.rooms.values()) for (const m of r.members) inRoom.add(m.guest_id);
  for (const g of [...store.guestsById.values()]) {
    if (g.last_seen < t - LIMITS.guestExpireMs && !inRoom.has(g.id)) {
      store.guestsById.delete(g.id);
      store.guestsByHash.delete(g.tokenHash);
    }
  }
}

function lockedGame(room) {
  const g = room.game;
  if (!g || g.status !== "playing") fail("GAME_NOT_ACTIVE");
  return g;
}

// ---------- RPC handlers (same names & payloads as src/lib/uno/api.ts) ----------
const handlers = {
  register_guest({ p_nickname }) {
    const nm = cleanText(p_nickname);
    if (len(nm) < 2 || len(nm) > 18) fail("INVALID_NAME");
    if (store.guestsById.size >= LIMITS.maxGuests) sweep();
    if (store.guestsById.size >= LIMITS.maxGuests) fail("SERVER_BUSY", 503);
    const token = crypto.randomBytes(32).toString("hex");
    const g = { id: crypto.randomUUID(), tokenHash: hashToken(token), nickname: nm, last_seen: now() };
    store.guestsById.set(g.id, g);
    store.guestsByHash.set(g.tokenHash, g);
    return { guest_id: g.id, token, nickname: nm };
  },

  whoami({ p_token }) {
    const me = auth(p_token);
    let code = null;
    let best = -1;
    for (const r of store.rooms.values()) {
      const m = r.members.find((x) => x.guest_id === me.id);
      if (m && m.joined_at > best) {
        best = m.joined_at;
        code = r.code;
      }
    }
    return { guest_id: me.id, nickname: me.nickname, room_code: code,google_linked:!!me.google_sub };
  },

  update_nickname({ p_token, p_nickname }) {
    const me = auth(p_token);
    const nm = cleanText(p_nickname);
    if (len(nm) < 2 || len(nm) > 18) fail("INVALID_NAME");
    me.nickname = nm;
    for (const r of store.rooms.values()) if (isMember(r, me.id)) bump(r);
    bumpLobby();
    return { guest_id: me.id, nickname: nm };
  },

  list_rejoinable_rooms({p_token}) {
    const me=auth(p_token),t=now();
    return [...store.rooms.values()].filter(r=>r.status==="playing" && r.game?.status==="playing" &&
      r.members.some(m=>m.guest_id===me.id) &&
      (!isSoloHumanBotMatch(r)||!r.game.solo_recovery_until||r.game.solo_recovery_until>t))
      .sort((a,b)=>b.created_at-a.created_at)
      .map(r=>({code:r.code,name:r.name,solo:isSoloHumanBotMatch(r),
        recovery_until:r.game.solo_recovery_until?iso(r.game.solo_recovery_until):null,
        player_count:r.game.turn_order.length}));
  },

  list_public_rooms() {
    const t = now();
    const rows = [];
    for (const r of store.rooms.values()) {
      if (!r.is_public) continue;
      const recent = r.members.some((m) => (store.guestsById.get(m.guest_id)?.last_seen ?? 0) > t - LIMITS.lobbyVisibleMs);
      if (!recent) continue;
      rows.push(r);
    }
    rows.sort((a, b) => (a.status === "waiting" ? 0 : 1) - (b.status === "waiting" ? 0 : 1) || b.created_at - a.created_at);
    return rows.slice(0, 50).map((r) => ({
      code: r.code,
      name: r.name,
      status: r.status,
      max_players: r.max_players,
      host_name: nick(r.host_id),
      player_count: r.members.filter(m=>!m.spectator).length,
    }));
  },

  create_room({ p_token, p_name, p_is_public, p_max_players }) {
    const me = auth(p_token);
    const nm = cleanText(p_name);
    if (len(nm) < 2 || len(nm) > 32) fail("INVALID_ROOM_NAME");
    const max = p_max_players;
    if (typeof max !== "number" || !Number.isInteger(max) || max < 2 || max > 8) fail("INVALID_MAX_PLAYERS");
    if (store.rooms.size >= LIMITS.maxRooms) sweep();
    if (store.rooms.size >= LIMITS.maxRooms) fail("SERVER_BUSY", 503);
    leaveOtherRooms(me.id, null);
    const t = now();
    const room = {
      id: crypto.randomUUID(),
      code: genCode(),
      name: nm,
      is_public: p_is_public === false ? false : true,
      max_players: max,
      host_id: me.id,
      status: "waiting",
      created_at: t,
      updated_at: t,
      members: [{ guest_id: me.id, joined_at: t }],
      cards_enabled: {...DEFAULT_CARDS_ENABLED},
      hands: new Map(),
      game: null,
      version: 0,
    };
    store.rooms.set(room.id, room);
    store.roomsByCode.set(room.code, room);
    bump(room);
    bumpLobby();
    return { code: room.code };
  },

  join_room({ p_token, p_code }) {
    const me = auth(p_token);
    const r = findRoom(p_code);
    if (isMember(r, me.id)) {
      if (isSoloHumanBotMatch(r) && r.game.solo_recovery_until && now()>=r.game.solo_recovery_until) fail("ROOM_NOT_FOUND",404);
      if (isSoloHumanBotMatch(r))r.game.solo_force_pause=false;
      return { code: r.code, already: true };
    }
    if (r.status === "playing") fail("GAME_STARTED");
    if (r.members.filter(m=>!m.spectator).length >= r.max_players) fail("ROOM_FULL");
    leaveOtherRooms(me.id, r.id);
    // joined_at strictly increasing keeps host succession deterministic
    const last = r.members[r.members.length - 1]?.joined_at ?? 0;
    r.members.push({ guest_id: me.id, joined_at: Math.max(now(), last + 1) });
    if (!r.host_id || store.guestsById.get(r.host_id)?.bot) r.host_id = me.id;
    touch(r);
    bump(r);
    bumpLobby();
    return { code: r.code, already: false };
  },

  leave_room({ p_token, p_code }) {
    const me = auth(p_token);
    const r = store.roomsByCode.get(cleanCode(p_code));
    if (r) removeMember(r, me.id);
    return { ok: true };
  },

  get_room_state({ p_token, p_code }) {
    const me = auth(p_token);
    const r = findRoom(p_code);
    if (!isMember(r, me.id)) fail("NOT_MEMBER", 403);
    const t = now();
    const members = r.members.map((m) => {
      const g = store.guestsById.get(m.guest_id);
      const h = r.hands.get(m.guest_id);
      return {
        id: m.guest_id,
        nickname: g?.nickname ?? "?",
        online: (g?.last_seen ?? 0) > t - LIMITS.onlineMs,
        is_host: m.guest_id === r.host_id,
        card_count: h ? h.cards.length : 0,
        uno_called: h ? h.uno_called : false,
      };
    });
    let game = null;
    const g = r.game;
    if (g) {
      const cur = g.status === "playing" && g.turn_order.length > 0 ? currentPlayer(g) : null;
      game = {
        status: g.status,
        top_card: g.discard_pile[g.discard_pile.length - 1],
        current_color: g.current_color,
        direction: g.direction,
        current_player: cur,
        turn_order: [...g.turn_order],
        draw_count: g.draw_pile.length,
        discard_count: g.discard_pile.length,
        has_drawn: g.has_drawn,
        drawn_card: cur === me.id ? g.drawn_card : null, // only the drawer sees it
        winner_id: g.winner_id,
        second_winner_id: g.second_winner_id ?? null,
        placements: [...(g.placements ?? [])],
        last_action: g.last_action,
        round: g.round,
        seq: g.seq,
        turn_started_at: iso(g.turn_started_at),
        my_hand: [...(r.hands.get(me.id)?.cards ?? [])], // ONLY the caller's own hand
      };
    }
    return {
      me: me.id,
      server_now: iso(t),
      room: {
        id: r.id,
        code: r.code,
        name: r.name,
        is_public: r.is_public,
        max_players: r.max_players,
        host_id: r.host_id,
        status: r.status,
      },
      members,
      game,
    };
  },

  start_game({ p_token, p_code }) {
    const me = auth(p_token);
    const r = findRoom(p_code);
    if (!isMember(r, me.id)) fail("NOT_MEMBER", 403);
    if (r.host_id !== me.id) fail("NOT_HOST", 403);
    if (r.status !== "waiting") fail("GAME_STARTED");
    const players = r.members.filter(m=>!m.spectator).map((m) => m.guest_id);
    if (players.length < 2) fail("NOT_ENOUGH_PLAYERS");
    let dp = newDeck(r.cards_enabled);
    r.hands = new Map();
    for (const p of players) r.hands.set(p, { cards: dp.splice(0, r.initial_cards ?? 8), uno_called: false, uno_since: null });
    let top;
    for (;;) {
      top = dp.shift();
      if (/^[0-9]$/.test(cardValue(top))) break;
      dp.push(top);
    }
    const prev = r.game;
    r.game = {
      status: "playing",
      draw_pile: dp,
      discard_pile: [top],
      current_color: top[0],
      turn_order: players,
      turn_idx: crypto.randomInt(players.length),
      direction: crypto.randomInt(2) === 0 ? 1 : -1,
      has_drawn: false,
      drawn_card: null,
      winner_id: null,
      second_winner_id: null,
      placements: [],
      last_action: { type: "start" },
      turn_started_at: now(),
      round: (prev?.round ?? 0) + 1,
      seq: prev ? prev.seq + 1 : 1,
    };
    r.status = "playing";
    touch(r);
    bump(r);
    bumpLobby();
    return { ok: true };
  },

  play_card({ p_token, p_code, p_card, p_color }) {
    const me = auth(p_token);
    const r = findRoom(p_code);
    const g = lockedGame(r);
    if (currentPlayer(g) !== me.id) fail("NOT_YOUR_TURN");
    const h = r.hands.get(me.id);
    if (!h || typeof p_card !== "string" || !CARD_RE.test(p_card) || !h.cards.includes(p_card)) fail("CARD_NOT_IN_HAND");
    if (g.has_drawn && p_card !== g.drawn_card) fail("MUST_PLAY_DRAWN");
    const top = g.discard_pile[g.discard_pile.length - 1];
    if (!playable(p_card, top, g.current_color)) fail("INVALID_CARD");
    let color;
    if (isWild(p_card)) {
      if (!["r", "y", "g", "b"].includes(p_color)) fail("COLOR_REQUIRED");
      color = p_color;
    } else color = p_card[0];

    h.cards.splice(h.cards.indexOf(p_card), 1);
    const n = h.cards.length;
    if (n !== 1) h.uno_called = false;
    g.discard_pile.push(p_card);
    g.current_color = color;
    const action = { type: "play", by: me.id, name: me.nickname, card: p_card, color, left: n };

    if (n === 0) {
      Object.assign(g, { status: "finished", winner_id: me.id, has_drawn: false, drawn_card: null, last_action: { ...action, win: true } });
      g.seq += 1;
      r.status = "waiting";
      touch(r);
      bump(r);
      bumpLobby();
      return { ok: true, won: true };
    }

    const pc = g.turn_order.length;
    let dir = g.direction;
    let steps = 1;
    let drawN = null;
    const v = cardValue(p_card);
    if (v === "R") {
      if (pc === 2) steps = 2;
      else dir = -dir;
    } else if (v === "S") steps = 2;
    else if (v === "D" || v === "W4") {
      steps = 2;
      drawN = v === "D" ? 2 : 4;
    }
    if (steps === 2) {
      const victim = g.turn_order[advance(g.turn_idx, dir, 1, pc)];
      action.target = victim;
      action.target_name = nick(victim);
      if (drawN !== null) {
        draw(r, victim, drawN);
        action.n = drawN;
      }
    }
    g.direction = dir;
    g.turn_idx = advance(g.turn_idx, dir, steps, pc);
    g.has_drawn = false;
    g.drawn_card = null;
    g.turn_started_at = now();
    g.last_action = action;
    g.seq += 1;
    touch(r);
    bump(r);
    return { ok: true };
  },

  draw_card({ p_token, p_code }) {
    const me = auth(p_token);
    const r = findRoom(p_code);
    const g = lockedGame(r);
    if (currentPlayer(g) !== me.id) fail("NOT_YOUR_TURN");
    if (g.has_drawn) fail("ALREADY_DRAWN");
    const pc = g.turn_order.length;
    const drawn = draw(r, me.id, 1);
    const top = g.discard_pile[g.discard_pile.length - 1];
    const next = () => {
      g.turn_idx = advance(g.turn_idx, g.direction, 1, pc);
      g.has_drawn = false;
      g.drawn_card = null;
      g.turn_started_at = now();
    };
    if (drawn.length === 0) {
      next();
      g.last_action = { type: "pass", by: me.id, name: me.nickname, empty: true };
      g.seq += 1;
      bump(r);
      return { card: null, playable: false };
    }
    const card = drawn[0];
    if (playable(card, top, g.current_color)) {
      g.has_drawn = true;
      g.drawn_card = card;
      g.last_action = { type: "draw", by: me.id, name: me.nickname };
      g.seq += 1;
      bump(r);
      return { card, playable: true };
    }
    next();
    g.last_action = { type: "draw_pass", by: me.id, name: me.nickname };
    g.seq += 1;
    bump(r);
    return { card, playable: false };
  },

  pass_turn({ p_token, p_code }) {
    const me = auth(p_token);
    const r = findRoom(p_code);
    const g = lockedGame(r);
    if (currentPlayer(g) !== me.id) fail("NOT_YOUR_TURN");
    if (!g.has_drawn) fail("MUST_DRAW_FIRST");
    g.turn_idx = advance(g.turn_idx, g.direction, 1, g.turn_order.length);
    g.has_drawn = false;
    g.drawn_card = null;
    g.turn_started_at = now();
    g.last_action = { type: "pass", by: me.id, name: me.nickname };
    g.seq += 1;
    bump(r);
    return { ok: true };
  },

  call_uno({ p_token, p_code }) {
    const me = auth(p_token);
    const r = findRoom(p_code);
    const g = lockedGame(r);
    const h = r.hands.get(me.id);
    if (!h) fail("NOT_MEMBER", 403);
    const n = h.cards.length;
    if (!(n === 1 || (n === 2 && currentPlayer(g) === me.id))) fail("UNO_NOT_ALLOWED");
    h.uno_called = true;
    g.last_action = { type: "uno", by: me.id, name: me.nickname };
    g.seq += 1;
    bump(r);
    return { ok: true };
  },

  catch_uno({ p_token, p_code, p_target }) {
    const me = auth(p_token);
    const r = findRoom(p_code);
    if (!isMember(r, me.id)) fail("NOT_MEMBER", 403);
    const g = lockedGame(r);
    if (p_target === me.id) fail("CATCH_NOT_ALLOWED");
    const h = typeof p_target === "string" ? r.hands.get(p_target) : undefined;
    if (!h || h.cards.length !== 1 || h.uno_called) fail("CATCH_NOT_ALLOWED");
    draw(r, p_target, 2);
    g.last_action = { type: "catch", by: me.id, name: me.nickname, target: p_target, target_name: nick(p_target), n: 2 };
    g.seq += 1;
    bump(r);
    return { ok: true };
  },
};

export const RPC_NAMES = Object.keys(handlers);

/** Runs one RPC synchronously (Node's single thread makes each call atomic). */
export function rpc(fn, args) {
  const h = Object.prototype.hasOwnProperty.call(handlers, fn) ? handlers[fn] : null;
  if (!h) fail("UNKNOWN_FUNCTION", 404);
  return h(args && typeof args === "object" ? args : {});
}