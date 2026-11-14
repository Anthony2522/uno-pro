import test from "node:test";
import assert from "node:assert/strict";
import {store} from "../server/game.js";
import {proRpc,proSweep} from "../server/pro.js";
const call=(fn,args)=>proRpc(fn,args);
function setup(rules) {
  const a=call("register_guest",{p_nickname:"Alice"}),b=call("register_guest",{p_nickname:"Bruno"});
  const {code}=call("create_room",{p_token:a.token,p_name:"Regras",p_max_players:4,p_rules:rules});
  call("join_room",{p_token:b.token,p_code:code});
  const {id:bot}=call("add_bot",{p_token:a.token,p_code:code,p_difficulty:"hard"});
  call("start_game",{p_token:a.token,p_code:code});
  const room=store.roomsByCode.get(code),g=room.game;
  const setTurn=id=>{g.turn_idx=g.turn_order.indexOf(id);g.turn_cards=[];g.turn_mode=null;g.turn_step=0;g.has_drawn=false;g.drawn_card=null;g.pending_draw=0;g.nine=null;g.turn_started_at=Date.now();};
  const play=(player,card,color)=>call("play_card",{p_token:player.token,p_code:code,p_card:card,p_color:color});
  const end=player=>call("end_turn",{p_token:player.token,p_code:code});
  return {a,b,bot,code,room,g,setTurn,play,end};
}
test("criação, bots, privacidade e regras ativadas por padrão",()=>{
  const s=setup();
  const alice=call("get_room_state",{p_token:s.a.token,p_code:s.code});
  const bruno=call("get_room_state",{p_token:s.b.token,p_code:s.code});
  assert.equal(alice.members.length,3);
  assert.equal(alice.members.filter(m=>m.bot).length,1);
  assert.deepEqual(alice.room.rules,{repeat:true,sequence:true,nine:true,cut:true,stack:true});
  assert.equal(alice.game.my_hand.length,7);
  assert.equal(bruno.game.my_hand.length,7);
  assert.equal("draw_pile" in alice.game,false);
  assert.equal("cards" in alice.members[1],false);
});
test("repetições, sequências numéricas e terminar vez",()=>{
  const s=setup(); const {room,g,a,b}=s;
  s.setTurn(a.guest_id);g.discard_pile=["b5"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["b5","y5","r5","r8"];
  s.play(a,"b5");s.play(a,"y5");s.play(a,"r5");
  assert.equal(g.turn_idx,0,"a vez não avança enquanto lança uma sequência");
  assert.equal(g.turn_cards.length,3);s.end(a);assert.equal(g.turn_cards.length,0);
  s.setTurn(b.guest_id);g.discard_pile=["g3"];g.current_color="g";
  room.hands.get(b.guest_id).cards=["g3","g4","g5","r0"];
  s.play(b,"g3");s.play(b,"g4");s.play(b,"g5");assert.equal(g.turn_cards.length,3);
  s.end(b);assert.equal(g.turn_cards.length,0);
});
test("corte rouba a vez e passa para o jogador seguinte",()=>{
  const s=setup(); const {room,g,a,b}=s;
  s.setTurn(a.guest_id);g.discard_pile=["b1"];g.current_color="b";
  room.hands.get(b.guest_id).cards=["b1","g2","r2"];
  s.play(b,"b1");assert.equal(g.turn_order[g.turn_idx],b.guest_id);
  s.end(b);assert.equal(g.turn_order[g.turn_idx],s.bot);
});
test("rebater compra acumula e pessoa sem defesa compra automaticamente",()=>{
  const s=setup(),{room,g,a,b}=s;s.setTurn(a.guest_id);
  g.discard_pile=["bD"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["bD","r1"];room.hands.get(b.guest_id).cards=["yD","g4"];
  room.hands.get(s.bot).cards=["r0","y8","b7"];
  s.play(a,"bD");s.end(a);assert.equal(g.pending_draw,2);
  s.play(b,"yD");s.end(b);assert.equal(g.pending_draw,0);
  assert.equal(room.hands.get(s.bot).cards.length,7);
});
test("desafio do 9 com três jogadores penaliza último que apertou",()=>{
  const s=setup(),{room,g,a,b}=s;s.setTurn(a.guest_id);
  g.discard_pile=["r9"];g.current_color="r";
  room.hands.get(a.guest_id).cards=["r9","g9","b9","r2"];
  const before=room.hands.get(b.guest_id).cards.length;
  s.play(a,"r9");s.play(a,"g9");s.play(a,"b9");s.end(a);
  assert.equal(g.nine.count,3);
  call("press_nine",{p_token:b.token,p_code:s.code});
  assert.equal(g.nine,null);assert.equal(room.hands.get(b.guest_id).cards.length,before+3);
});
test("denúncia somente após oito segundos de UNO",()=>{
  const s=setup(),{room,a,b}=s; const h=room.hands.get(a.guest_id);
  h.cards=["b1"];h.uno_called=false;h.uno_since=Date.now();
  assert.throws(()=>call("catch_uno",{p_token:b.token,p_code:s.code}),/CATCH_NOT_ALLOWED/);
  h.uno_since=Date.now()-9000;
  call("catch_uno",{p_token:b.token,p_code:s.code});assert.equal(h.cards.length,3);
});
test("passagem automática após um minuto, mesmo com jogador online",()=>{
  const s=setup(),{room,g,a}=s;
  s.setTurn(a.guest_id);const before=room.hands.get(a.guest_id).cards.length;
  g.turn_started_at=Date.now()-61000;
  proSweep();
  assert.equal(room.hands.get(a.guest_id).cards.length,before+1);
  assert.notEqual(g.turn_order[g.turn_idx],a.guest_id);
});
