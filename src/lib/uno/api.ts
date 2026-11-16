import { GameError, toGameError } from "./errors";
import type { CardColor } from "./cards";
import {DEFAULT_CARD_SETTINGS,type CardSettings} from "./cardSettings";
import {getLocalMatch,getSoloServerBackup,hasLocalRoom,localRpc,
  getRecoverableSoloRoom,rescueSoloMatch,saveSoloServerBackup,type SoloBackup} from "./offlineRuntime";

export type RuleSettings = { repeat: boolean; sequence: boolean; nine: boolean; cut: boolean; stack: boolean };
export type Guest = { guest_id: string; token: string; nickname: string;google_linked?:boolean };

export type Member = {
  id: string;
  nickname: string;
  online: boolean;
  is_host: boolean;
  card_count: number;
  uno_called: boolean;
  uno_since?: string | null;
  bot?: boolean;
  spectator?: boolean;
  bot_name_en?: string | null;
  difficulty?: "easy" | "hard" | null;
};

export type LastAction = {
  type: "start" | "play" | "draw" | "draw_pass" | "pass" | "uno" | "catch" | "auto" | "left" | "abandon" | "cut" | "end" | "nine" | "stack_take" | "auto_draw";
  count?: number;
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
  second_winner_id?: string | null;
  placements?: Array<{id:string;rank:number;name:string}>;
  winners_target?: number;
  private_notice?: {nonce:number;kind:string;message:string;at:string}|null;
  powerless_target?: string|null;
  powerless_remaining?: string[];
  shields?: Record<string,number>;
  swords?: Record<string,number>;
  lock_remaining?: string[];
  lock_color?: CardColor|null;
  lock_target?: CardColor|null;
  solo_paused?: boolean;
  local_only?:boolean;
  solo_recovery_until?: string|null;
  last_wild?: string|null;
  mirror_played_as?: string|null;
  beer_remaining?: string[];
  beer_due_at?: string|null;
  vortex_pending?: {actor:string;remaining:number;total:number}|null;
  wild_pending_color?: boolean;
  wild_color_pending_player?: string|null;
  detective_pending_color?: boolean;
  machine_gun_new?: {card:string;nonce:number;at:string}|null;
  skip_reaction?: {target:string|null;expires_at:string}|null;
  detective?: {target:string;target_name:string;cards:string[];expires_at:string}|null;
  card_moves?: Array<{id:number;by:string;name:string;card:string;mirror_as?:string|null;previous_top:string;at:number}>;
  offline_deadline_at?: string|null;
  last_action: LastAction;
  round: number;
  seq: number;
  turn_started_at: string;
  my_hand: string[];
  pending_uncounterable: boolean;
  action_locked_until?: string | null;
  effects: Array<{ id: number; type: "reverse"|"skip"|"draw2"|"draw4"|"draw5"|"wild"|"uno"|"cut"|"penalty"|"catch"|"color_wave"|"bomb"|"negation"|"powerless"|"machinegun"|"shield_armed"|"shield_defense"|"vortex"|"beer"|"beer_forced"|"lock"|"sword_armed"|"sword_boost"|"sword_strike"; by: string; name: string; card: string|null; color: string|null; at: number; show_at: number; reason?: "nine"|"skip"|"draw"|"powerless"|"bomb"|"detective"|"lock"; revealed?:Array<{target:string;target_name:string;card:string}>; targets?:string[]; target_names?:string[]; target?:string; target_name?:string; n?:number }>;
  last_draw: { card: string; nonce: number; at: string } | null;
  turn_cards: string[];
  pending_draw: number;
  can_catch_uno: boolean;
  nine: {source: string; count: number; eligible: string[]; pressed: string[]; deadline: string} | null;
};

export type RoomState = {
  me: string;
  is_dev?: boolean;
  server_now: string;
  room: {
    id: string;
    code: string;
    name: string;
    is_public: boolean;
    max_players: number;
    host_id: string;
    status: "waiting" | "playing";
    rules: RuleSettings;
    cards_enabled:CardSettings;
    initial_cards: number;
    winners_target: number;
    local_only?:boolean;
  };
  members: Member[];
  game: GameState | null;
};

export type RejoinableRoom = {code:string;name:string;solo:boolean;recovery_until:string|null;player_count:number;local_only?:boolean};

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
  const code=typeof args["p_code"]==="string"?(args["p_code"] as string).toUpperCase():null;
  if(code&&hasLocalRoom(code))return localRpc<T>(fn,args);
  const rescue=():T|null=>{
    if(code&&getRecoverableSoloRoom(code)&&rescueSoloMatch(code))return localRpc<T>(fn,args);
    return null;
  };
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
    const recovered=rescue();
    if(recovered!==null)return recovered;
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
    const codeFromServer=err?.code;
    if(!err||["ROOM_NOT_FOUND","INVALID_SESSION","NOT_MEMBER"].includes(codeFromServer||"")){
      const recovered=rescue();
      if(recovered!==null)return recovered;
    }
    if (!err) throw new GameError("NETWORK", `HTTP ${res.status}`);
    throw toGameError(new Error(err.message ?? err.code ?? `HTTP ${res.status}`));
  }
  return body.data as T;
}

export const api = {
  registerGuest: (nickname: string) => call<Guest>("register_guest", { p_nickname: nickname }),
  authConfig: () => call<{google_client_id:string;persistent_rooms_configured:boolean}>("auth_config"),
  googleLogin: (credential:string,token?:string) => call<Guest>("google_login",{p_credential:credential,p_token:token??null}),
  whoami: (token: string) =>
    call<{ guest_id: string; nickname: string; room_code: string | null;google_linked:boolean }>("whoami", { p_token: token }),
  updateNickname: (token: string, nickname: string) =>
    call<{ guest_id: string; nickname: string }>("update_nickname", { p_token: token, p_nickname: nickname }),
  listPublicRooms: () => call<PublicRoom[]>("list_public_rooms"),
  listRejoinableRooms: async (token:string) => {
    let online:RejoinableRoom[]=[];
    try{online=await call<RejoinableRoom[]>("list_rejoinable_rooms",{p_token:token})}catch{/* offline matches remain visible without a backend */}
    const local=getLocalMatch();
    const backup=getSoloServerBackup();
    const localRows:RejoinableRoom[]=[];
    if(local&&local.playing)localRows.push({code:local.code,name:local.name,solo:true,
      recovery_until:null,player_count:3,local_only:true});
    if(backup&&!localRows.some(r=>r.code===backup.code)&&!online.some(r=>r.code===backup.code))
      localRows.push({code:backup.code,name:backup.name,solo:true,recovery_until:null,
        player_count:3,local_only:true});
    return [...localRows,...online.filter(r=>!localRows.some(local=>local.code===r.code))];
  },
  devStatus: (token:string)=>call<{is_dev:boolean}>("dev_status",{p_token:token}),
  devAuth: (token:string,key:string)=>call<{is_dev:boolean}>("dev_auth",{p_token:token,p_key:key}),
  devDeletePublicRoom: (token:string,code:string)=>call("dev_delete_public_room",{p_token:token,p_code:code}),
  createRoom: (token: string, name: string, isPublic: boolean, maxPlayers: number, rules: RuleSettings, startingCards = 8, winners = 2, cards:CardSettings=DEFAULT_CARD_SETTINGS) =>
    call<{ code: string }>("create_room", {
      p_token: token,
      p_name: name,
      p_is_public: isPublic,
      p_max_players: maxPlayers,
      p_rules: rules,
      p_cards_enabled: cards,
      p_starting_cards: startingCards,
      p_winners: winners,
    }),
  joinRoom: (token: string, code: string) =>
    call<{ code: string; already: boolean }>("join_room", { p_token: token, p_code: code }),
  leaveRoom: (token: string, code: string) => call("leave_room", { p_token: token, p_code: code }),
  getRoomState: async (token:string,code:string)=>{
    const state=await call<RoomState>("get_room_state",{p_token:token,p_code:code});
    // Save a complete bot-only snapshot (including deck and bot hands) before any outage.
    if(!state.room.local_only && state.game?.status==="playing" &&
      state.members.filter(member=>!member.bot&&!member.spectator).length===1 &&
      state.members.some(member=>member.bot)){
      void call<SoloBackup>("export_solo_snapshot",{p_token:token,p_code:code})
        .then(backup=>saveSoloServerBackup(backup,token)).catch(()=>{});
    }
    return state;
  },
  startGame: (token: string, code: string) => call("start_game", { p_token: token, p_code: code }),
  updateWinners: (token:string,code:string,winners:number)=>
    call<{ok:boolean;winners_target:number}>("update_winners",{p_token:token,p_code:code,p_winners:winners}),
  resolveDetective: (token:string,code:string,color:CardColor)=>
    call("resolve_detective",{p_token:token,p_code:code,p_color:color}),
  resolveWildColor: (token:string,code:string,color:CardColor)=>
    call("resolve_wild_color",{p_token:token,p_code:code,p_color:color}),
  negateEffect: (token:string,code:string,color:CardColor)=>
    call("negate_effect",{p_token:token,p_code:code,p_color:color}),
  acceptSkip: (token:string,code:string)=>
    call("accept_skip",{p_token:token,p_code:code}),
  updateRoomSettings: (token:string,code:string,startingCards:number,rules:RuleSettings,cards:CardSettings=DEFAULT_CARD_SETTINGS)=>
    call("update_room_settings",{p_token:token,p_code:code,p_starting_cards:startingCards,p_rules:rules,p_cards_enabled:cards}),
  playCard: (token: string, code: string, card: string, color?: string, targetId?: string) =>
    call("play_card", { p_token: token, p_code: code, p_card: card, p_color: color ?? null, p_target_id: targetId ?? null }),
  drawCard: (token: string, code: string) =>
    call<{ card: string | null; playable: boolean; auto_passed?: boolean }>("draw_card", { p_token: token, p_code: code }),
  passTurn: (token: string, code: string) => call("pass_turn", { p_token: token, p_code: code }),
  endTurn: (token: string, code: string) => call("end_turn", { p_token: token, p_code: code }),
  acceptDraw: (token: string, code: string) => call("accept_draw", { p_token: token, p_code: code }),
  pressNine: (token: string, code: string) => call("press_nine", { p_token: token, p_code: code }),
  addBot: (token: string, code: string, difficulty: "easy" | "hard") => call("add_bot", { p_token: token, p_code: code, p_difficulty: difficulty }),
  removeBot: (token: string, code: string, botId: string) => call("remove_bot", { p_token: token, p_code: code, p_bot_id: botId }),
  callUno: (token: string, code: string) => call("call_uno", { p_token: token, p_code: code }),
  catchUno: (token: string, code: string) =>
    call("catch_uno", { p_token: token, p_code: code }),
};

export { GameError };