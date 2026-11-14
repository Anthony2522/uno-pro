import { GameError, toGameError } from "./errors";

export type Guest = { guest_id: string; token: string; nickname: string };

export type Member = {
  id: string;
  nickname: string;
  online: boolean;
  is_host: boolean;
  card_count: number;
  uno_called: boolean;
};

export type LastAction = {
  type: "start" | "play" | "draw" | "draw_pass" | "pass" | "uno" | "catch" | "auto" | "left" | "abandon";
  by?: string;
  name?: string;
  card?: string;
  color?: string;
  target?: string;
  target_name?: string;
  n?: number;
  win?: boolean;
  empty?: boolean;
  left?: number;
} | null;

export type GameState = {
  status: "playing" | "finished";
  top_card: string;
  current_color: string;
  direction: 1 | -1;
  current_player: string | null;
  turn_order: string[];
  draw_count: number;
  discard_count: number;
  has_drawn: boolean;
  drawn_card: string | null;
  winner_id: string | null;
  last_action: LastAction;
  round: number;
  seq: number;
  turn_started_at: string;
  my_hand: string[];
};

export type RoomState = {
  me: string;
  server_now: string;
  room: {
    id: string;
    code: string;
    name: string;
    is_public: boolean;
    max_players: number;
    host_id: string;
    status: "waiting" | "playing";
  };
  members: Member[];
  game: GameState | null;
};

export type PublicRoom = {
  code: string;
  name: string;
  status: "waiting" | "playing";
  max_players: number;
  host_name: string;
  player_count: number;
};

/** POSTs to the Node server (server.js). Errors carry the same codes the original backend raised. */
async function call<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  let res: Response;
  try {
    res = await fetch(`/api/rpc/${fn}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(args),
      signal: ctrl.signal,
      cache: "no-store",
    });
  } catch (e) {
    throw e instanceof DOMException && e.name === "AbortError" ? new GameError("NETWORK", "timeout") : toGameError(e);
  } finally {
    clearTimeout(timer);
  }
  let body: { data?: T; error?: { code?: string; message?: string } } | null = null;
  try {
    body = await res.json();
  } catch {
    /* non-JSON (proxy error page, server waking up) */
  }
  if (!res.ok || !body || body.error) {
    const err = body?.error;
    if (!err) throw new GameError("NETWORK", `HTTP ${res.status}`);
    throw toGameError(new Error(err.message ?? err.code ?? `HTTP ${res.status}`));
  }
  return body.data as T;
}

export const api = {
  registerGuest: (nickname: string) => call<Guest>("register_guest", { p_nickname: nickname }),
  whoami: (token: string) =>
    call<{ guest_id: string; nickname: string; room_code: string | null }>("whoami", { p_token: token }),
  updateNickname: (token: string, nickname: string) =>
    call<{ guest_id: string; nickname: string }>("update_nickname", { p_token: token, p_nickname: nickname }),
  listPublicRooms: () => call<PublicRoom[]>("list_public_rooms"),
  createRoom: (token: string, name: string, isPublic: boolean, maxPlayers: number) =>
    call<{ code: string }>("create_room", {
      p_token: token,
      p_name: name,
      p_is_public: isPublic,
      p_max_players: maxPlayers,
    }),
  joinRoom: (token: string, code: string) =>
    call<{ code: string; already: boolean }>("join_room", { p_token: token, p_code: code }),
  leaveRoom: (token: string, code: string) => call("leave_room", { p_token: token, p_code: code }),
  getRoomState: (token: string, code: string) =>
    call<RoomState>("get_room_state", { p_token: token, p_code: code }),
  startGame: (token: string, code: string) => call("start_game", { p_token: token, p_code: code }),
  playCard: (token: string, code: string, card: string, color?: string) =>
    call("play_card", { p_token: token, p_code: code, p_card: card, p_color: color ?? null }),
  drawCard: (token: string, code: string) =>
    call<{ card: string | null; playable: boolean }>("draw_card", { p_token: token, p_code: code }),
  passTurn: (token: string, code: string) => call("pass_turn", { p_token: token, p_code: code }),
  callUno: (token: string, code: string) => call("call_uno", { p_token: token, p_code: code }),
  catchUno: (token: string, code: string, target: string) =>
    call("catch_uno", { p_token: token, p_code: code, p_target: target }),
};

export { GameError };