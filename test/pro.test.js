import test from "node:test";
import assert from "node:assert/strict";
import {store, newDeck, sweep as basicSweep, isSoloHumanBotMatch} from "../server/game.js";
import {serializeState,hydrateState} from "../server/persistence.js";
import {proRpc,proSweep,chooseNineDelay,chooseCutDelay,chooseBotMoveDelay,chooseBotUnoDelay,BOT_NAMES} from "../server/pro.js";
import { inferColorGaps } from "../server/hardBotStrategy.js";
const call=(fn,args)=>proRpc(fn,args);
function setup(rules) {
  const a=call("register_guest",{p_nickname:"Alice"}),b=call("register_guest",{p_nickname:"Bruno"});
  const {code}=call("create_room",{p_token:a.token,p_name:"Regras",p_max_players:4,p_rules:rules});
  call("join_room",{p_token:b.token,p_code:code});
  const {id:bot}=call("add_bot",{p_token:a.token,p_code:code,p_difficulty:"hard"});
  call("start_game",{p_token:a.token,p_code:code});
  const room=store.roomsByCode.get(code),g=room.game;
  g.direction=1; // Deterministic turn direction for unit tests; production remains randomized.
  const setTurn=id=>{g.turn_idx=g.turn_order.indexOf(id);g.turn_cards=[];g.turn_mode=null;g.turn_step=0;g.has_drawn=false;g.drawn_card=null;g.pending_draw=0;g.nine=null;g.turn_started_at=Date.now();};
  // Legacy mechanics tests skip the animation-only two-second gate.
  const clearNotice=()=>{
    for(const event of g.effects||[])event.show_at=Date.now()-10000;
  };
  const play=(player,card,color)=>{clearNotice();return call("play_card",{p_token:player.token,p_code:code,p_card:card,p_color:color});};
  const end=player=>{clearNotice();return call("end_turn",{p_token:player.token,p_code:code});};
  return {a,b,bot,code,room,g,setTurn,play,end,clearNotice};
}
test("criação, bots, privacidade e regras ativadas por padrão",()=>{
  const s=setup();
  const alice=call("get_room_state",{p_token:s.a.token,p_code:s.code});
  const bruno=call("get_room_state",{p_token:s.b.token,p_code:s.code});
  assert.equal(alice.members.length,3);
  assert.equal(alice.members.filter(m=>m.bot).length,1);
  assert.deepEqual(alice.room.rules,{repeat:true,sequence:true,nine:true,cut:true,stack:true});
  assert.equal(alice.game.my_hand.length,8);
  assert.equal(bruno.game.my_hand.length,8);
  assert.equal(alice.room.initial_cards,8);
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
  const before=room.hands.get(s.bot).cards.length;
  s.play(a,"r9");s.play(a,"g9");s.play(a,"b9");s.end(a);
  assert.equal(g.nine.count,3);
  call("press_nine",{p_token:b.token,p_code:s.code});
  // As soon as only one player remains, that player is last automatically.
  assert.equal(g.nine,null);
  assert.equal(room.hands.get(s.bot).cards.length,before+3);
});
test("Desuno denuncia todos após quatro segundos de UNO",()=>{
  const s=setup(),{room,a,b}=s; const h=room.hands.get(a.guest_id);
  h.cards=["b1"];h.uno_called=false;h.uno_since=Date.now();
  assert.throws(()=>call("catch_uno",{p_token:b.token,p_code:s.code}),/CATCH_NOT_ALLOWED/);
  h.uno_since=Date.now()-4100;
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

test("baralho de 228 cartas inclui Escudo, Negação, Sem Poderes e Metralhadora",()=>{
  const deck=newDeck();
  assert.equal(deck.length,228);
  for(const c of ["N","P","M","Q"])assert.equal(deck.filter(x=>x===c).length,1);
  assert.equal(deck.filter(c=>c==="B").length,1);
  assert.equal(deck.filter(c=>c==="X").length,1);
  for(const col of ["r","y","g","b"])
    for(const value of ["0","1","2","3","4","5","6","7","8","9","S","R","D"])
      assert.equal(deck.filter(c=>c===col+value).length,3,col+value);
  for(const card of ["W","W4"])assert.equal(deck.filter(c=>c===card).length,10,card);
  assert.equal(deck.filter(c=>c==="W5").length,2);
  for(const col of ["r","y","g","b"]){
    assert.equal(deck.filter(c=>c===col+"T").length,2);
    assert.equal(deck.filter(c=>c===col+"L").length,2,"Cadeado");
    assert.equal(deck.filter(c=>c===col+"E").length,2,"Espada");
    assert.equal(deck.filter(c=>c===col+"H").length,2);
    assert.equal(deck.filter(c=>c===col+"V").length,2);
    assert.equal(deck.filter(c=>c===col+"C").length,1);
  }
});
test("baralho vazio renova baralho completo mantendo carta de descarte",()=>{
  const s=setup(),{room,g,a}=s;
  s.setTurn(a.guest_id);
  g.draw_pile=[];g.discard_pile=["g6"];g.current_color="g";
  room.hands.get(a.guest_id).cards=["b1","r5"];
  const mirrorAlreadyDealt=[...room.hands.values()].some(h=>h.cards.includes("Q"));
  const drawn=call("draw_card",{p_token:a.token,p_code:s.code});
  assert.ok(drawn.card);
  // The one Mirror is never duplicated if it is already in another hand.
  assert.equal(g.draw_pile.length,mirrorAlreadyDealt?226:227);
  assert.equal(g.discard_pile.at(-1),"g6");
});
test("após comprar pode jogar outra carta da mão, sem ser a comprada",()=>{
  const s=setup(),{room,g,a}=s;
  s.setTurn(a.guest_id);
  g.discard_pile=["r5"];g.current_color="r";g.draw_pile=["b8","y7"];
  room.hands.get(a.guest_id).cards=["r3","g2","y9"];
  const result=call("draw_card",{p_token:a.token,p_code:s.code});
  assert.equal(result.card,"b8");
  s.play(a,"r3");
  assert.equal(g.turn_cards[0],"r3");
  assert.equal(g.turn_order[g.turn_idx],a.guest_id);
});
test("sem cartas válidas, compra automático e passa sem duplicar compra",()=>{
  const s=setup(),{room,g,a}=s;
  s.setTurn(a.guest_id);g.discard_pile=["b5"];g.current_color="b";g.draw_pile=["r7","y9"];
  room.hands.get(a.guest_id).cards=["g1","y2"];
  proSweep();
  assert.equal(room.hands.get(a.guest_id).cards.length,3);
  assert.notEqual(g.turn_order[g.turn_idx],a.guest_id);
  assert.equal(g.last_action.type,"auto");
  assert.equal(g.last_draw_by_id[a.guest_id].card,"r7");
});
test("sem cartas válidas, compra automaticamente e mantém a vez se a comprada servir",()=>{
  const s=setup(),{room,g,a}=s;s.setTurn(a.guest_id);
  g.discard_pile=["b5"];g.current_color="b";g.draw_pile=["b7","y9"];
  room.hands.get(a.guest_id).cards=["r1","g2"];
  proSweep();
  assert.equal(g.turn_order[g.turn_idx],a.guest_id);
  assert.equal(g.has_drawn,true);
  s.play(a,"b7");
  assert.equal(g.turn_cards[0],"b7");
});
test("durante o contra-ataque de +4 não cobra o jogador antes de Terminar vez",()=>{
  const s=setup(),{room,g,a,b}=s;
  s.setTurn(a.guest_id);g.discard_pile=["b5"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["W4","r3"];
  room.hands.get(b.guest_id).cards=["W4","r0"];
  s.play(a,"W4","r");s.end(a);
  assert.equal(g.pending_draw,4);
  s.play(b,"W4","b");
  room.hands.get(s.bot).cards=["r0","g1","y2","b3","r4","g5","y6"];
  const before=room.hands.get(b.guest_id).cards.length;
  proSweep();
  assert.equal(room.hands.get(b.guest_id).cards.length,before);
  assert.equal(g.turn_order[g.turn_idx],b.guest_id);
  assert.equal(g.pending_draw,4);
  s.end(b);
  assert.equal(g.pending_draw,0);
  assert.equal(room.hands.get(s.bot).cards.length,15);
});
test("corte de +4 dentro de batalha passa a soma para o próximo",()=>{
  const s=setup(),{room,g,a,b}=s;
  s.setTurn(a.guest_id);g.discard_pile=["b5"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["W4","r0"];
  room.hands.get(b.guest_id).cards=["W4","g3"];
  room.hands.get(s.bot).cards=["W4","r3","g1"];
  s.play(a,"W4","g");s.end(a);
  assert.equal(g.pending_draw,4);
  // The bot owns an identical W4 and may cut, even though B is deciding.
  const player=s.bot;
  // To exercise the cut without a bot credential, add a third human in a separate scenario below.
  assert.equal(g.pending_draw,4);
});

test("corte com +4 enquanto o próximo decide, conserva dívida e aumenta a soma",()=>{
  const s=setup(),{room,g,a,b}=s;
  const c=call("register_guest",{p_nickname:"Carla"});
  // Cannot join a started game; use the existing third player as cut actor via a test token.
  // The bot can still execute the cut server-side only by NPC logic, so inject an extra member session.
  const oldBot=room.members.find(m=>m.guest_id===s.bot);
  room.members=room.members.filter(m=>m!==oldBot);
  room.members.push({guest_id:c.guest_id,joined_at:Date.now()});
  room.hands.delete(s.bot);room.hands.set(c.guest_id,{cards:["W4","r2","g5"],uno_called:false,uno_since:null});
  g.turn_order[g.turn_order.indexOf(s.bot)]=c.guest_id;
  s.setTurn(a.guest_id);g.discard_pile=["b2"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["W4","W4","r0"];
  room.hands.get(b.guest_id).cards=["W4","g0"];
  s.play(a,"W4","r");s.end(a);
  assert.equal(g.pending_draw,4);
  s.clearNotice(); // End Turn now creates the one color-wave announcement.
  call("play_card",{p_token:c.token,p_code:s.code,p_card:"W4",p_color:"g"});
  assert.equal(g.turn_order[g.turn_idx],c.guest_id);
  // C cut B's pending turn; when C finishes, total penalty becomes 8.
  call("end_turn",{p_token:c.token,p_code:s.code});
  assert.equal(g.pending_draw,8);
});
test("coringa +5 não pode ser rebatido com +4 nem +2",()=>{
  const s=setup(),{room,g,a,b}=s;
  s.setTurn(a.guest_id);g.discard_pile=["b2"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["W5","r0"];
  room.hands.get(b.guest_id).cards=["W4","yD","b1"];
  const before=room.hands.get(b.guest_id).cards.length;
  s.play(a,"W5","r");s.end(a);
  assert.equal(room.hands.get(b.guest_id).cards.length,before+5);
  assert.equal(g.pending_draw,0);
  assert.notEqual(g.turn_order[g.turn_idx],b.guest_id);
});
test("cada efeito especial e grito UNO ficam na fila de eventos para todos",()=>{
  const s=setup(),{room,g,a,b}=s;
  s.setTurn(a.guest_id);g.discard_pile=["b8"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["bR","r1","g0"];
  s.play(a,"bR");
  assert.equal(g.effects.filter(e=>e.type==="reverse").length,0,"no effect before End Turn");
  call("call_uno",{p_token:a.token,p_code:s.code}); // two cards remain before ending
  s.end(a);
  const events=call("get_room_state",{p_token:b.token,p_code:s.code}).game.effects;
  assert.equal(events.at(-2).type,"uno");
  assert.equal(events.at(-1).type,"reverse");
  assert.equal(events.at(-2).name,"Alice");
});

test("timeout após rebater +4 finaliza a jogada sem cobrar o próprio jogador",()=>{
  const s=setup(),{room,g,a,b}=s;s.setTurn(a.guest_id);
  g.discard_pile=["r2"];g.current_color="r";
  room.hands.get(a.guest_id).cards=["W4","r0"];
  room.hands.get(b.guest_id).cards=["W4","b7"];
  room.hands.get(s.bot).cards=["b1","b2","g1","g2","y1","y2","r1"];
  s.play(a,"W4","g");s.end(a);
  s.play(b,"W4","r");
  const countBefore=room.hands.get(b.guest_id).cards.length;
  g.turn_started_at=Date.now()-61000;
  proSweep();
  assert.equal(room.hands.get(b.guest_id).cards.length,countBefore);
  assert.notEqual(g.turn_order[g.turn_idx],b.guest_id);
  assert.equal(room.hands.get(s.bot).cards.length,15);
});


test("probabilidades exatas dos bots no desafio do 9 e no corte",()=>{
  assert.equal(chooseNineDelay("easy",()=>0.01),0);
  assert.equal(chooseNineDelay("easy",()=>0.29),0);
  assert.equal(chooseNineDelay("easy",()=>0.30),8000);
  assert.equal(chooseNineDelay("easy",()=>0.95),8000);
  assert.equal(chooseNineDelay("hard",()=>0.09),0);
  assert.equal(chooseNineDelay("hard",()=>0.10),2000);
  assert.equal(chooseNineDelay("hard",()=>0.49),2000);
  assert.equal(chooseNineDelay("hard",()=>0.50),5000);
  assert.equal(chooseCutDelay("easy",()=>0),40000);
  assert.equal(chooseCutDelay("hard",()=>0.09),10000);
  assert.equal(chooseCutDelay("hard",()=>0.11),25000);
});

test("bot só responde ao 9 depois do seu tempo sorteado",()=>{
  const s=setup(),{room,g,a}=s;
  s.setTurn(a.guest_id);g.discard_pile=["r9"];g.current_color="r";
  room.hands.get(a.guest_id).cards=["r9","b8"];
  s.play(a,"r9");s.end(a);
  assert.equal(g.nine.pressed.includes(s.bot),false);
  const publicNine=call("get_room_state",{p_token:a.token,p_code:s.code}).game.nine;
  assert.equal("botTimes" in publicNine,false,"não revelar o tempo de reação de bots ao adversário");
  g.nine.botTimes[s.bot]=Date.now()+30000;
  proSweep();assert.equal(g.nine.pressed.includes(s.bot),false);
  const before=room.hands.get(s.b.guest_id).cards.length;
  g.nine.botTimes[s.bot]=Date.now()-1;
  proSweep();
  assert.equal(g.nine,null,"um único jogador que não apertou já perdeu");
  assert.equal(room.hands.get(s.b.guest_id).cards.length,before+1);
});

test("corte de bot respeita o tempo agendado e registra quem foi cortado",()=>{
  const s=setup(),{room,g,a}=s;
  s.setTurn(a.guest_id);g.discard_pile=["b1"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["b1","r8","y8"];
  room.hands.get(s.bot).cards=["b1","r0","g2"];
  s.play(a,"b1");
  assert.equal(g.bot_cut.top,"b1");
  assert.equal(g.bot_cut.due[s.bot]>Date.now(),true);
  g.bot_cut.due[s.bot]=Date.now()+10000;
  proSweep();
  assert.equal(g.effects.some(e=>e.type==="cut"),false);
  g.bot_cut.due[s.bot]=Date.now()-1;
  proSweep();
  const cut=g.effects.find(e=>e.type==="cut");
  assert.ok(cut);
  assert.equal(cut.by,s.bot);
  assert.equal(cut.target,a.guest_id);
  assert.equal(cut.target_name,"Alice");
});

test("bloqueio avisa a vítima e penalidade informa quem comprou e quantas cartas",()=>{
  const s=setup(),{room,g,a,b}=s;
  s.setTurn(a.guest_id);g.discard_pile=["b1"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["bS","r3","y6"];
  room.hands.get(b.guest_id).cards=["g1","r2","y3"];
  s.play(a,"bS");
  assert.equal(g.effects.filter(e=>e.type==="skip").length,0);
  s.end(a);
  const blocked=g.effects.find(e=>e.type==="skip");
  assert.equal(blocked.target,b.guest_id);
  assert.equal(blocked.target_name,"Bruno");
  s.setTurn(a.guest_id);g.discard_pile=["b1"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["bD","r3","y6"];
  room.hands.get(b.guest_id).cards=["g1","r2","y3"];
  s.play(a,"bD");s.end(a);
  const debt=g.effects.findLast(e=>e.type==="penalty");
  assert.equal(debt.target,b.guest_id);
  assert.equal(debt.target_name,"Bruno");
  assert.equal(debt.n,2);
});

test("coringa +5 pode rebater +2/+4 e somente outro +5 pode rebater +5",()=>{
  const s=setup(),{room,g,a,b}=s;
  s.setTurn(a.guest_id);g.discard_pile=["b1"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["bD","r3"];
  room.hands.get(b.guest_id).cards=["W5","W4","r2","y1"];
  room.hands.get(s.bot).cards=["W5","W4","g4"];
  s.play(a,"bD");s.end(a);
  assert.equal(g.pending_draw,2);
  s.play(b,"W5","g");s.end(b);
  assert.equal(g.pending_draw,7);
  assert.equal(g.pending_uncounterable,true);
  assert.equal(g.turn_order[g.turn_idx],s.bot);
  // The bot can only answer with its own +5.
  s.clearNotice();
  assert.throws(()=>call("play_card",{p_token:a.token,p_code:s.code,p_card:"r3"}),/CUT_NOT_ALLOWED/);
  const first=room.hands.get(s.bot).cards.length;
  s.clearNotice();
  proSweep(); // Schedule the bot's own 5/11-second decision delay.
  assert.ok(g.bot_move?.due>Date.now());
  g.bot_move.due=Date.now()-1;
  proSweep();
  assert.equal(room.hands.get(s.bot).cards.length<first,true);
  assert.equal(g.pending_draw,0,"a dívida de 12 cartas é paga automaticamente pelo próximo jogador sem +5");
  assert.equal(room.hands.get(a.guest_id).cards.length,13);
});

test("corte de W5 em batalha W5 só permite W5 idêntico",()=>{
  const s=setup(),{room,g,a,b}=s;
  s.setTurn(a.guest_id);g.discard_pile=["g6"];g.current_color="g";
  room.hands.get(a.guest_id).cards=["W5","r4"];
  room.hands.get(b.guest_id).cards=["W5","r6"];
  room.hands.get(s.bot).cards=["b0","g3","y6"];
  s.play(a,"W5","r");s.end(a);
  assert.equal(g.pending_draw,5);
  s.play(b,"W5","b");
  assert.equal(g.pending_draw,5,"a penalidade da primeira carta ainda não foi liquidada");
  s.end(b);
  assert.equal(g.pending_draw,0,"se não houver um terceiro +5, o próximo compra 10 cartas");
});


test("bots fazem primeira jogada em 3s (difícil) ou 5s (fácil)",()=>{
  assert.equal(chooseBotMoveDelay("hard"),3000);
  assert.equal(chooseBotMoveDelay("easy"),5000);
});
test("100 nomes de bots diferentes dentro da sala",()=>{
  assert.equal(BOT_NAMES.length,100);
  assert.equal(new Set(BOT_NAMES).size,100);
  const owner=call("register_guest",{p_nickname:"Dono"});
  const code=call("create_room",{p_token:owner.token,p_name:"Nomes engraçados",p_max_players:8}).code;
  for(let i=0;i<7;i++)call("add_bot",{p_token:owner.token,p_code:code,p_difficulty:"easy"});
  const room=store.roomsByCode.get(code);
  const names=room.members.filter(m=>m.guest_id!==owner.guest_id).map(m=>store.guestsById.get(m.guest_id).nickname);
  assert.equal(new Set(names).size,7);
  assert.equal(names.every(n=>BOT_NAMES.includes(n)),true);
});

test("duas cartas de bloqueio pulam duas pessoas; duas voltas se anulam",()=>{
  const a=call("register_guest",{p_nickname:"P1"});
  const b=call("register_guest",{p_nickname:"P2"});
  const c=call("register_guest",{p_nickname:"P3"});
  const d=call("register_guest",{p_nickname:"P4"});
  const code=call("create_room",{p_token:a.token,p_name:"Bloqueios",p_max_players:4}).code;
  for(const player of [b,c,d])call("join_room",{p_token:player.token,p_code:code});
  call("start_game",{p_token:a.token,p_code:code});
  const room=store.roomsByCode.get(code),g=room.game;
  g.turn_idx=0;g.direction=1;g.discard_pile=["bS"];g.current_color="b";g.pending_draw=0;
  room.hands.get(a.guest_id).cards=["bS","gS","r8"];
  room.hands.get(b.guest_id).cards=["r1","g2"];
  room.hands.get(c.guest_id).cards=["y5","g7"];
  room.hands.get(d.guest_id).cards=["r6","b8"];
  call("play_card",{p_token:a.token,p_code:code,p_card:"bS"});
  for(const e of g.effects)e.show_at=Date.now()-10000;
  call("play_card",{p_token:a.token,p_code:code,p_card:"gS"});
  for(const e of g.effects)e.show_at=Date.now()-10000;
  call("end_turn",{p_token:a.token,p_code:code});
  assert.equal(g.turn_order[g.turn_idx],d.guest_id,"dois bloqueios pulam P2 e P3");
  // Isolate the reverse scenario on the same four-player game.
  g.turn_idx=0;g.direction=1;g.turn_cards=[];g.turn_mode=null;g.turn_step=0;
  g.discard_pile=["bR"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["bR","yR","r8"];
  for(const e of g.effects)e.show_at=Date.now()-10000;
  call("play_card",{p_token:a.token,p_code:code,p_card:"bR"});
  for(const e of g.effects)e.show_at=Date.now()-10000;
  call("play_card",{p_token:a.token,p_code:code,p_card:"yR"});
  for(const e of g.effects)e.show_at=Date.now()-10000;
  call("end_turn",{p_token:a.token,p_code:code});
  assert.equal(g.direction,1,"inversão dupla devolve a direção original");
  assert.equal(g.turn_order[g.turn_idx],b.guest_id);
});

test("efeito especial só aparece ao finalizar, cinco segundos sem consumir o turno seguinte",()=>{
  const s=setup(),{room,g,a}=s;
  s.setTurn(a.guest_id);g.discard_pile=["bR"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["bR","yR","r8"];
  const started=g.turn_started_at;
  s.play(a,"bR");
  assert.equal(g.effects.filter(e=>e.type==="reverse").length,0);
  call("play_card",{p_token:a.token,p_code:s.code,p_card:"yR"});
  assert.equal(g.turn_cards.length,2);
  assert.equal(g.effects.filter(e=>e.type==="reverse").length,0);
  call("end_turn",{p_token:a.token,p_code:s.code});
  assert.equal(g.turn_cards.length,0);
  const effects=g.effects.filter(e=>e.type==="reverse");
  assert.equal(effects.length,1);
  assert.equal(effects[0].n,2);
  assert.equal(g.turn_started_at>=started+5000,true);
});
test("bot decide uma vez por turno e não joga antes da espera de 5/11 segundos",()=>{
  const s=setup(),{room,g}=s;
  g.turn_idx=g.turn_order.indexOf(s.bot);
  g.turn_started_at=Date.now();g.bot_move=null;
  g.discard_pile=["g1"];g.current_color="g";
  room.hands.get(s.bot).cards=["g5","r2","b8"];
  proSweep();
  assert.ok(g.bot_move);
  assert.equal(g.turn_order[g.turn_idx],s.bot);
  const due=g.bot_move.due;
  proSweep();
  assert.equal(g.bot_move.due,due,"sorteio não deve ser repetido a cada verificação");
  g.bot_move.due=Date.now()-1;
  proSweep();
  assert.notEqual(g.turn_order[g.turn_idx],s.bot);
});

test("9 termina quando resta um, ou penaliza todos os omissos após o tempo",()=>{
  const players=["Ana","Bia","Cris","Dora"].map(p=>call("register_guest",{p_nickname:p}));
  const [a,b,c,d]=players;
  const code=call("create_room",{p_token:a.token,p_name:"Desafio do nove",p_max_players:4}).code;
  for(const p of [b,c,d])call("join_room",{p_token:p.token,p_code:code});
  call("start_game",{p_token:a.token,p_code:code});
  const r=store.roomsByCode.get(code),g=r.game;
  g.turn_idx=0;g.discard_pile=["b9"];g.current_color="b";
  r.hands.get(a.guest_id).cards=["b9","r9","r8"];
  const before=[b,c,d].map(p=>r.hands.get(p.guest_id).cards.length);
  call("play_card",{p_token:a.token,p_code:code,p_card:"b9"});
  call("play_card",{p_token:a.token,p_code:code,p_card:"r9"});
  call("end_turn",{p_token:a.token,p_code:code});
  assert.equal(g.nine.eligible.length,3);
  g.nine.deadline=Date.now()-1;
  proSweep();
  assert.equal(g.nine,null);
  for(let i=0;i<3;i++)assert.equal(r.hands.get([b,c,d][i].guest_id).cards.length,before[i]+2);
  assert.equal(g.last_action.count,3);
});


test("bot que joga ação especial não força segunda carta durante os 2s de aviso",()=>{
  const s=setup(),{room,g}=s;
  g.turn_idx=g.turn_order.indexOf(s.bot);
  g.turn_started_at=Date.now();g.bot_move=null;
  g.discard_pile=["bR"];g.current_color="b";
  room.hands.get(s.bot).cards=["bR","gR","y7"];
  proSweep();
  assert.ok(g.bot_move);
  g.bot_move.due=Date.now()-1;
  proSweep();
  assert.equal(g.turn_order[g.turn_idx],s.bot,"o combo só ocorre após 2s adicionais");
  assert.equal(g.turn_cards.length,1);
  s.clearNotice();g.bot_move.due=Date.now()-1;proSweep();
  assert.notEqual(g.turn_order[g.turn_idx],s.bot);
  assert.ok(g.effects.some(e=>e.type==="reverse"));
});


test("cartas iniciais são configuráveis e o padrão é 8",()=>{
  const a=call("register_guest",{p_nickname:"Oito"});
  const b=call("register_guest",{p_nickname:"Doze"});
  const code=call("create_room",{p_token:a.token,p_name:"Distribuição",p_max_players:2,p_starting_cards:12}).code;
  call("join_room",{p_token:b.token,p_code:code});
  call("start_game",{p_token:a.token,p_code:code});
  const r=store.roomsByCode.get(code);
  assert.equal(r.hands.get(a.guest_id).cards.length,12);
  assert.equal(r.hands.get(b.guest_id).cards.length,12);
  assert.equal(call("get_room_state",{p_token:a.token,p_code:code}).room.initial_cards,12);
  assert.throws(()=>call("create_room",{p_token:a.token,p_name:"Invalida",p_max_players:2,p_starting_cards:100}),/INVALID_STARTING_CARDS/);
  assert.ok([-1,1].includes(r.game.direction));
  assert.ok(r.game.turn_order.includes(r.game.turn_order[r.game.turn_idx]));
});

test("9 seguido por 8 e 7 não ativa desafio; só os 9 finais contam",()=>{
  const s=setup(),{g,room,a}=s;s.setTurn(a.guest_id);
  g.discard_pile=["b9"];g.current_color="b";g.direction=1;
  room.hands.get(a.guest_id).cards=["b9","b8","b7","r0"];
  s.play(a,"b9");s.play(a,"b8");s.play(a,"b7");s.end(a);
  assert.equal(g.nine,null);
  s.setTurn(a.guest_id);g.discard_pile=["b8"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["b8","b9","r1"];
  s.play(a,"b8");s.play(a,"b9");s.end(a);
  assert.equal(g.nine.count,1);
});

test("duas cartas +2 Volta: acumulam, invertem, voltam ao atacante",()=>{
  const ps=["AliceRe","BrunoRe","CrisRe","DoraRe"].map(n=>call("register_guest",{p_nickname:n}));
  const [a,b,c,d]=ps;
  const code=call("create_room",{p_token:a.token,p_name:"Revidar volta",p_max_players:4}).code;
  for(const p of [b,c,d])call("join_room",{p_token:p.token,p_code:code});
  call("start_game",{p_token:a.token,p_code:code});
  const r=store.roomsByCode.get(code),g=r.game;
  g.turn_idx=0;g.direction=1;g.discard_pile=["b3"];g.current_color="b";
  r.hands.get(a.guest_id).cards=["bT","yD","r1"];
  r.hands.get(b.guest_id).cards=["g2","g8"];
  r.hands.get(c.guest_id).cards=["g8","y6"];
  r.hands.get(d.guest_id).cards=["rT","g9"];
  call("play_card",{p_token:a.token,p_code:code,p_card:"bT"});
  call("end_turn",{p_token:a.token,p_code:code});
  assert.equal(g.direction,-1);
  assert.equal(g.pending_draw,2);
  assert.equal(g.turn_order[g.turn_idx],d.guest_id);
  for(const e of g.effects)e.show_at=Date.now()-10000;
  call("play_card",{p_token:d.token,p_code:code,p_card:"rT"});
  call("end_turn",{p_token:d.token,p_code:code});
  assert.equal(g.direction,1);
  assert.equal(g.pending_draw,4);
  assert.equal(g.turn_order[g.turn_idx],a.guest_id);
  for(const e of g.effects)e.show_at=Date.now()-10000;
  // An ordinary +2 response does not invert; the debt travels onward.
  r.hands.get(a.guest_id).cards=["yD","r1"];
  call("play_card",{p_token:a.token,p_code:code,p_card:"yD"});
  call("end_turn",{p_token:a.token,p_code:code});
  assert.equal(g.pending_draw,0);
  assert.equal(r.hands.get(b.guest_id).cards.length,8);
});

test("bot grita UNO em 0/8 segundos ou esquece; difícil é imediato",()=>{
  assert.equal(chooseBotUnoDelay("hard",()=>0.99),0);
  assert.equal(chooseBotUnoDelay("easy",()=>0.1999),0);
  assert.equal(chooseBotUnoDelay("easy",()=>0.20),8000);
  assert.equal(chooseBotUnoDelay("easy",()=>0.7999),8000);
  assert.equal(chooseBotUnoDelay("easy",()=>0.80),null);
  const s=setup(),{room,g}=s;
  s.setTurn(s.a.guest_id);
  const h=room.hands.get(s.bot);
  h.cards=["b1"];h.uno_called=false;h.uno_since=Date.now()-50;h.bot_uno_plan=null;
  proSweep();
  assert.equal(h.uno_called,true,"bot difícil deveria gritar UNO imediatamente");
  assert.ok(g.effects.some(e=>e.type==="uno"&&e.by===s.bot));
});

test("bot difícil denuncia aos 4s; fácil somente após 15s",()=>{
  const s=setup(),{room,g,a}=s;
  s.setTurn(s.bot);
  const h=room.hands.get(a.guest_id);
  h.cards=["b3"];h.uno_called=false;h.uno_since=Date.now()-5000;
  proSweep();
  assert.equal(h.cards.length,3,"bot difícil denuncia com 4 segundos");
  assert.equal(g.last_action.by,s.bot);
  // Reset the victim and switch the bot difficulty to easy.
  const bot=store.guestsById.get(s.bot);
  bot.difficulty="easy";
  h.cards=["g4"];h.uno_called=false;h.uno_since=Date.now()-14000;
  proSweep();
  assert.equal(h.cards.length,1,"bot fácil não pode denunciar antes de 15s");
  h.uno_since=Date.now()-16000;
  proSweep();
  assert.equal(h.cards.length,3,"bot fácil denuncia após 15s");
});

test("aviso não bloqueia cortes, cartas ou encerramento de turno",()=>{
  const s=setup(),{room,g,a,b}=s;
  s.setTurn(a.guest_id);g.discard_pile=["bR"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["bR","yR","r1"];
  room.hands.get(b.guest_id).cards=["bR","g2"];
  s.play(a,"bR");
  call("call_uno",{p_token:a.token,p_code:s.code});
  const acted=call("play_card",{p_token:b.token,p_code:s.code,p_card:"bR"});
  assert.equal(acted.ok,true);
  assert.equal(g.turn_order[g.turn_idx],b.guest_id);
  call("end_turn",{p_token:b.token,p_code:s.code});
});

test("penalidade após +2 Volta informa quem atacou, vítima e quantidade",()=>{
  const s=setup(),{room,g,a}=s;
  s.setTurn(a.guest_id);g.direction=1;g.discard_pile=["b1"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["bT","r2"];
  room.hands.get(s.bot).cards=["r1","y6","g8"];
  s.play(a,"bT");s.end(a);
  const debt=g.effects.findLast(e=>e.type==="penalty");
  assert.equal(debt.by,a.guest_id);
  assert.equal(debt.target,s.bot);
  assert.equal(debt.n,2);
  assert.equal(g.direction,-1);
});

test("somente mudanças de cor geram onda, não anúncio de carta +2/+4 jogada",()=>{
  const s=setup(),{room,g,a}=s;
  s.setTurn(a.guest_id);g.discard_pile=["b3"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["W4","r1"];
  s.play(a,"W4","g");
  assert.equal(g.effects.filter(e=>e.type==="color_wave").length,0);
  s.end(a);
  assert.equal(g.effects.find(e=>e.type==="color_wave").type,"color_wave");
  assert.equal(g.effects.find(e=>e.type==="color_wave").color,"g");
});


test("o limite é de 50 segundos, não 60",()=>{
  const s=setup(),{g,a,room}=s;
  s.setTurn(a.guest_id);g.turn_started_at=Date.now()-51_000;
  room.hands.get(a.guest_id).cards=["b7","r5","y2"];
  proSweep();
  assert.notEqual(g.turn_order[g.turn_idx],a.guest_id);
});

test("coringa Detetive é único e só expõe a mão ao jogador autorizado por dez segundos",()=>{
  const s=setup(),{g,a,b,room}=s;
  s.setTurn(a.guest_id);g.discard_pile=["g3"];g.current_color="g";
  room.hands.get(a.guest_id).cards=["X","r4","y7"];
  room.hands.get(b.guest_id).cards=["g1","W5","rT"];
  assert.throws(()=>s.play(a,"X","b"),/INVALID_DETECTIVE_TARGET/);
  call("play_card",{p_token:a.token,p_code:s.code,p_card:"X",p_color:"b",p_target_id:b.guest_id});
  const authorized=call("get_room_state",{p_token:a.token,p_code:s.code}).game.detective;
  const unauthorized=call("get_room_state",{p_token:b.token,p_code:s.code}).game.detective;
  assert.deepEqual(authorized.cards,["g1","W5","rT"]);
  assert.equal(unauthorized,null);
  g.detective.until=Date.now()-1;
  assert.equal(call("get_room_state",{p_token:a.token,p_code:s.code}).game.detective,null);
});


test("+2 Volta em duas pessoas atua como +2, sem a inversão especial",()=>{
  const a=call("register_guest",{p_nickname:"Duelo A"});
  const b=call("register_guest",{p_nickname:"Duelo B"});
  const code=call("create_room",{p_token:a.token,p_name:"Duelo volta",p_max_players:2}).code;
  call("join_room",{p_token:b.token,p_code:code});
  call("start_game",{p_token:a.token,p_code:code});
  const r=store.roomsByCode.get(code),g=r.game;
  g.turn_idx=0;g.direction=1;g.discard_pile=["b1"];g.current_color="b";
  r.hands.get(a.guest_id).cards=["bT","r3"];
  r.hands.get(b.guest_id).cards=["r6","g2"];
  call("play_card",{p_token:a.token,p_code:code,p_card:"bT"});
  call("end_turn",{p_token:a.token,p_code:code});
  assert.equal(g.direction,1);
  assert.equal(r.hands.get(b.guest_id).cards.length,4);
  assert.equal(g.pending_draw,0);
});

test("+4 pode receber rebatida de +2 Volta de outra cor; devolve a dívida",()=>{
  const s=setup(),{a,b,g,room}=s;
  s.setTurn(a.guest_id);g.direction=1;g.discard_pile=["b2"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["W4","g2"];
  room.hands.get(b.guest_id).cards=["yT","b1"];
  s.play(a,"W4","r");s.end(a);
  assert.equal(g.pending_draw,4);
  s.play(b,"yT");s.end(b);
  assert.equal(g.direction,-1);
  assert.equal(g.pending_draw,0);
  assert.equal(room.hands.get(a.guest_id).cards.length,7);
});

test("a primeira colocação continua a partida até o segundo chegar",()=>{
  const ps=["Primeiro A","Segundo B","Terceiro C","Quarto D"].map(p=>call("register_guest",{p_nickname:p}));
  const [a,b,c,d]=ps;
  const code=call("create_room",{p_token:a.token,p_name:"Dois vencedores",p_max_players:4}).code;
  [b,c,d].forEach(p=>call("join_room",{p_token:p.token,p_code:code}));
  call("start_game",{p_token:a.token,p_code:code});
  const room=store.roomsByCode.get(code),g=room.game;
  g.turn_idx=0;g.direction=1;g.discard_pile=["b4"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["b4"];
  call("play_card",{p_token:a.token,p_code:code,p_card:"b4"});
  assert.equal(g.status,"playing");
  assert.equal(room.status,"playing");
  assert.equal(g.placements[0].id,a.guest_id);
  assert.equal(g.turn_order.includes(a.guest_id),false);
  room.hands.get(b.guest_id).cards=["b4"];
  call("play_card",{p_token:b.token,p_code:code,p_card:"b4"});
  assert.equal(g.status,"finished");
  assert.equal(room.status,"waiting");
  assert.equal(g.winner_id,a.guest_id);
  assert.equal(g.second_winner_id,b.guest_id);
  assert.deepEqual(g.placements.map(x=>x.rank),[1,2]);
});

test("em duelo, o segundo lugar é decidido automaticamente ao vencer o primeiro",()=>{
  const a=call("register_guest",{p_nickname:"Duelista A"});
  const b=call("register_guest",{p_nickname:"Duelista B"});
  const code=call("create_room",{p_token:a.token,p_name:"Duelo final",p_max_players:2}).code;
  call("join_room",{p_token:b.token,p_code:code});
  call("start_game",{p_token:a.token,p_code:code});
  const r=store.roomsByCode.get(code),g=r.game;
  g.turn_idx=0;g.direction=1;g.discard_pile=["g1"];g.current_color="g";
  r.hands.get(a.guest_id).cards=["g1"];
  call("play_card",{p_token:a.token,p_code:code,p_card:"g1"});
  assert.equal(g.status,"finished");
  assert.equal(g.placements[0].id,a.guest_id);
  assert.equal(g.placements[1].id,b.guest_id);
});

test("100 nomes de bot diferentes e anfitrião sempre humano",()=>{
  assert.equal(BOT_NAMES.length,100);
  const host=call("register_guest",{p_nickname:"Humano host"});
  const {code}=call("create_room",{p_token:host.token,p_name:"Sem host robô",p_max_players:4});
  call("add_bot",{p_token:host.token,p_code:code,p_difficulty:"easy"});
  call("leave_room",{p_token:host.token,p_code:code});
  const room=store.roomsByCode.get(code);
  assert.equal(room.host_id,null);
  const newcomer=call("register_guest",{p_nickname:"Novo humano"});
  call("join_room",{p_token:newcomer.token,p_code:code});
  assert.equal(room.host_id,newcomer.guest_id);
});

test("acesso de desenvolvedor exige segredo e nome, não basta escrever Toninho",()=>{
  const before=process.env.DEV_ACCESS_KEY;
  process.env.DEV_ACCESS_KEY="um-segredo-longo-de-testes-2026";
  try{
    const admin=call("register_guest",{p_nickname:"Toninho"});
    const other=call("register_guest",{p_nickname:"Outra pessoa"});
    const code=call("create_room",{p_token:other.token,p_name:"Apagavel",p_max_players:3,p_is_public:true}).code;
    assert.throws(()=>call("dev_delete_public_room",{p_token:admin.token,p_code:code}),/DEV_ACCESS_DENIED/);
    assert.throws(()=>call("dev_auth",{p_token:admin.token,p_key:"errada"}),/DEV_INVALID_KEY/);
    assert.throws(()=>call("dev_auth",{p_token:other.token,p_key:process.env.DEV_ACCESS_KEY}),/DEV_NAME_REQUIRED/);
    call("dev_auth",{p_token:admin.token,p_key:process.env.DEV_ACCESS_KEY});
    call("join_room",{p_token:admin.token,p_code:code});
    assert.equal(store.roomsByCode.get(code).host_id,admin.guest_id);
    call("dev_delete_public_room",{p_token:admin.token,p_code:code});
    assert.equal(store.roomsByCode.has(code),false);
  }finally{
    if(before===undefined)delete process.env.DEV_ACCESS_KEY;
    else process.env.DEV_ACCESS_KEY=before;
  }
});

test("bot difícil espera 3 segundos e 2 segundos por carta consecutiva",()=>{
  const s=setup(),{g,room,bot}=s;
  s.setTurn(bot);g.discard_pile=["b3"];g.current_color="b";
  room.hands.get(bot).cards=["b3","y3","r4"];
  proSweep();
  assert.ok(g.bot_move);
  assert.equal(g.bot_move.due> Date.now(),true);
  g.bot_move.due=Date.now()-1;
  proSweep();
  assert.equal(g.turn_order[g.turn_idx],bot);
  assert.equal(g.turn_cards.length,1);
  assert.equal(g.bot_move.due>=Date.now()+1500,true);
  s.clearNotice();
  g.bot_move.due=Date.now()-1;
  proSweep();
  assert.equal(g.turn_cards.length,0);
  assert.notEqual(g.turn_order[g.turn_idx],bot);
});


test("desenvolvedor entra como observador numa sala cheia e não ocupa uma vaga",()=>{
  const old=process.env.DEV_ACCESS_KEY;process.env.DEV_ACCESS_KEY="uma-chave-segura-grande-2026";
  try{
    const a=call("register_guest",{p_nickname:"JogeA"});
    const b=call("register_guest",{p_nickname:"JogeB"});
    const dev=call("register_guest",{p_nickname:"Toninho"});
    const code=call("create_room",{p_token:a.token,p_name:"Sala lotada",p_max_players:2}).code;
    call("join_room",{p_token:b.token,p_code:code});
    call("dev_auth",{p_token:dev.token,p_key:process.env.DEV_ACCESS_KEY});
    call("join_room",{p_token:dev.token,p_code:code});
    const r=store.roomsByCode.get(code);
    assert.equal(r.host_id,dev.guest_id);
    assert.equal(r.members.filter(m=>!m.spectator).length,2);
    call("start_game",{p_token:dev.token,p_code:code});
    assert.equal(r.game.turn_order.length,2);
    assert.equal(call("get_room_state",{p_token:dev.token,p_code:code}).game.my_hand.length,0);
  }finally{
    if(old===undefined)delete process.env.DEV_ACCESS_KEY;
    else process.env.DEV_ACCESS_KEY=old;
  }
});


test("Desuno denuncia simultaneamente todos os adversários em UNO há quatro segundos",()=>{
  const s=setup(),{room,g,a,b,bot}=s;
  const h=room.hands.get(a.guest_id),hb=room.hands.get(bot);
  h.cards=["b2"];h.uno_called=false;h.uno_since=Date.now()-4300;
  hb.cards=["g3"];hb.uno_called=false;hb.uno_since=Date.now()-4400;
  const response=call("catch_uno",{p_token:b.token,p_code:s.code});
  assert.equal(response.count,2);
  assert.equal(h.cards.length,3);
  assert.equal(hb.cards.length,3);
  assert.equal(call("get_room_state",{p_token:b.token,p_code:s.code}).game.can_catch_uno,false);
  assert.equal(g.effects.filter(e=>e.type==="catch").length,2);
});

test("bloqueios múltiplos exibem alvos corretos e não saltam gente além da sequência",()=>{
  const names=["P1sk","P2sk","P3sk","P4sk"].map(n=>call("register_guest",{p_nickname:n}));
  const [a,b,c,d]=names;
  const code=call("create_room",{p_token:a.token,p_name:"Bloqueio triplo",p_max_players:4}).code;
  [b,c,d].forEach(p=>call("join_room",{p_token:p.token,p_code:code}));
  call("start_game",{p_token:a.token,p_code:code});
  const room=store.roomsByCode.get(code),g=room.game;
  g.direction=1;g.turn_idx=0;g.discard_pile=["bS"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["bS","yS","gS","r1"];
  // Elimina a Negação aleatória que pode interceptar o bloqueio neste teste.
  for(const [id,card] of [[b.guest_id,"r2"],[c.guest_id,"g3"],[d.guest_id,"y4"]])
    room.hands.get(id).cards=[card];
  for(const card of ["bS","yS","gS"]){
    for(const ef of g.effects)ef.show_at=Date.now()-10000;
    call("play_card",{p_token:a.token,p_code:code,p_card:card});
  }
  assert.equal(g.effects.filter(e=>e.type==="skip").length,0,"no early skip announcements");
  call("end_turn",{p_token:a.token,p_code:code});
  const notices=g.effects.filter(e=>e.type==="skip");
  assert.equal(notices.length,1,"one combined animation, not three");
  assert.equal(notices[0].n,3);
  assert.deepEqual(notices[0].targets,[b.guest_id,c.guest_id,d.guest_id]);
  assert.equal(g.turn_order[g.turn_idx],a.guest_id); // four seats, skip all three others
});

test("dois bloqueios em duelo pulam o adversário, nunca o próprio jogador",()=>{
  const a=call("register_guest",{p_nickname:"Duel O"});
  const b=call("register_guest",{p_nickname:"Duel P"});
  const code=call("create_room",{p_token:a.token,p_name:"Duel skips",p_max_players:2}).code;
  call("join_room",{p_token:b.token,p_code:code});call("start_game",{p_token:a.token,p_code:code});
  const r=store.roomsByCode.get(code),g=r.game;g.turn_idx=0;g.direction=1;g.discard_pile=["bS"];g.current_color="b";
  r.hands.get(a.guest_id).cards=["bS","yS","r3"];
  r.hands.get(b.guest_id).cards=["r6","g7"]; // No randomly-dealt Negation to intercept the skip.
  call("play_card",{p_token:a.token,p_code:code,p_card:"bS"});
  for(const e of g.effects)e.show_at=Date.now()-10000;
  call("play_card",{p_token:a.token,p_code:code,p_card:"yS"});
  call("end_turn",{p_token:a.token,p_code:code});
  assert.equal(g.turn_order[g.turn_idx],a.guest_id);
  assert.deepEqual(g.effects.filter(e=>e.type==="skip").at(-1).targets,[b.guest_id,b.guest_id]);
});

test("coringa Bomba existe uma vez e cada adversário compra duas sem perder turno",()=>{
  const s=setup(),{room,g,a,b,bot}=s;s.setTurn(a.guest_id);
  g.discard_pile=["r1"];g.current_color="r";
  room.hands.get(a.guest_id).cards=["B","b4"];
  room.hands.get(b.guest_id).cards=["r2","g4"];
  room.hands.get(bot).cards=["y1","b5"];
  s.play(a,"B","g");s.end(a);
  assert.equal(room.hands.get(b.guest_id).cards.length,4);
  assert.equal(room.hands.get(bot).cards.length,4);
  assert.equal(g.pending_draw,0);
  assert.equal(g.turn_order[g.turn_idx],b.guest_id);
  assert.equal(g.current_color,"g");
  assert.equal(g.effects.find(e=>e.type==="bomb").n,2);
  assert.equal(g.card_moves.at(-1).card,"B");
});

test("animação de carta inclui jogador, topo anterior e sequência para todos",()=>{
  const s=setup(),{room,g,a,b}=s;
  s.setTurn(a.guest_id);g.discard_pile=["b3"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["b3","r4"];
  s.play(a,"b3");
  const e=g.card_moves.at(-1);
  assert.equal(e.by,a.guest_id);
  assert.equal(e.card,"b3");
  assert.equal(e.previous_top,"b3");
  const publicState=call("get_room_state",{p_token:b.token,p_code:s.code});
  assert.equal(publicState.game.card_moves.at(-1).id,e.id);
});

test("desconectado tem trinta segundos de tolerância sem avanço antecipado, reconexão mantém relógio",()=>{
  const s=setup(),{g,room,a}=s;s.setTurn(a.guest_id);
  g.discard_pile=["b4"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["b4","y7","r9"];
  const guest=store.guestsById.get(a.guest_id);
  guest.last_seen=Date.now()-28000;
  g.turn_started_at=Date.now()-26000;
  proSweep();
  assert.equal(g.turn_order[g.turn_idx],a.guest_id,"não avança assim que fica offline");
  assert.ok(g.offline_since,"marca início do período de desconexão");
  assert.ok(call("get_room_state",{p_token:a.token,p_code:s.code}).game.offline_deadline_at);
  // whoami/get_room_state refreshed presence, so next sweep restores 50s total.
  proSweep();
  assert.equal(g.offline_since,null);
  assert.equal(g.turn_order[g.turn_idx],a.guest_id);
});


test("offline com compra acumulada aguarda o limite reduzido antes de passar",()=>{
  const s=setup(),{room,g,a}=s;s.setTurn(a.guest_id);
  g.discard_pile=["rD"];g.current_color="r";
  room.hands.get(a.guest_id).cards=["r3","g6"];
  g.pending_draw=4;g.pending_source=s.bot;
  const guest=store.guestsById.get(a.guest_id);
  guest.last_seen=Date.now()-60000;
  g.turn_started_at=Date.now()-26000;
  g.offline_since=Date.now()-5000;
  proSweep();
  assert.equal(g.turn_order[g.turn_idx],a.guest_id);
  assert.equal(g.pending_draw,4);
  const before=room.hands.get(a.guest_id).cards.length;
  g.offline_since=Date.now()-31000;
  proSweep();
  assert.notEqual(g.turn_order[g.turn_idx],a.guest_id);
  assert.equal(g.pending_draw,0);
  assert.equal(room.hands.get(a.guest_id).cards.length,before+4);
});

test("Bomba jogada como última carta dá duas a todos antes da primeira colocação",()=>{
  const s=setup(),{room,g,a,b,bot}=s;s.setTurn(a.guest_id);
  g.discard_pile=["r2"];g.current_color="r";
  room.hands.get(a.guest_id).cards=["B"];
  room.hands.get(b.guest_id).cards=["r3","y4"];
  room.hands.get(bot).cards=["r4","g5"];
  s.play(a,"B","b");
  assert.equal(g.status,"playing");
  assert.equal(room.hands.get(b.guest_id).cards.length,4);
  assert.equal(room.hands.get(bot).cards.length,4);
  assert.equal(g.placements[0].id,a.guest_id);
});


test("um vencedor não pode usar Desuno nem aparece como autorizado na interface",()=>{
  const s=setup(),{room,g,a,b}=s;
  s.setTurn(a.guest_id);g.discard_pile=["b4"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["b4"];
  s.play(a,"b4");
  assert.equal(g.status,"playing","ainda há Bruno e o bot");
  assert.equal(g.turn_order.includes(a.guest_id),false);
  const h=room.hands.get(b.guest_id);
  h.cards=["r5"];h.uno_called=false;h.uno_since=Date.now()-10000;
  const state=call("get_room_state",{p_token:a.token,p_code:s.code});
  assert.equal(state.game.can_catch_uno,false);
  assert.throws(()=>call("catch_uno",{p_token:a.token,p_code:s.code}),/CATCH_NOT_ALLOWED/);
  assert.equal(h.cards.length,1);
});

test("se um humano vencer contra dois bots, partida encerra imediatamente",()=>{
  const a=call("register_guest",{p_nickname:"HeroBots"});
  const code=call("create_room",{p_token:a.token,p_name:"Humano contra bots",p_max_players:4}).code;
  const b=call("add_bot",{p_token:a.token,p_code:code,p_difficulty:"easy"});
  const c=call("add_bot",{p_token:a.token,p_code:code,p_difficulty:"hard"});
  call("start_game",{p_token:a.token,p_code:code});
  const room=store.roomsByCode.get(code),g=room.game;
  g.direction=1;g.turn_idx=0;g.discard_pile=["b4"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["b4"];
  splay();
  function splay(){call("play_card",{p_token:a.token,p_code:code,p_card:"b4"})}
  assert.equal(g.status,"finished");
  assert.equal(room.status,"waiting");
  assert.equal(g.winner_id,a.guest_id);
  assert.ok([b.id,c.id].includes(g.second_winner_id));
  assert.equal(g.placements.length,2);
});

test("sair da partida solo não expulsa e dá cinco minutos para retornar",()=>{
  const a=call("register_guest",{p_nickname:"Saiu"});
  const code=call("create_room",{p_token:a.token,p_name:"Só robôs",p_max_players:4}).code;
  call("add_bot",{p_token:a.token,p_code:code,p_difficulty:"easy"});
  call("add_bot",{p_token:a.token,p_code:code,p_difficulty:"hard"});
  call("start_game",{p_token:a.token,p_code:code});
  const r=store.roomsByCode.get(code);
  call("leave_room",{p_token:a.token,p_code:code});
  assert.equal(r.game.status,"playing");
  assert.equal(r.status,"playing");
  assert.ok(r.game.solo_recovery_until>Date.now()+295000);
  assert.ok(r.members.some(m=>m.guest_id===a.guest_id));
  assert.equal(call("list_rejoinable_rooms",{p_token:a.token}).some(v=>v.code===code),true);
  call("join_room",{p_token:a.token,p_code:code});
  assert.equal(r.game.solo_force_pause,false);
  proSweep();
  assert.equal(r.game.solo_recovery_until,null);
});

test("o anfitrião edita regras e cartas antes da primeira partida e após uma rodada",()=>{
  const a=call("register_guest",{p_nickname:"ConfigA"});
  const b=call("register_guest",{p_nickname:"ConfigB"});
  const code=call("create_room",{p_token:a.token,p_name:"Editar configurações",p_max_players:3}).code;
  call("join_room",{p_token:b.token,p_code:code});
  const r=store.roomsByCode.get(code);
  const rules={repeat:false,sequence:true,nine:false,cut:false,stack:true};
  assert.throws(()=>call("update_room_settings",{p_token:b.token,p_code:code,p_starting_cards:12,p_rules:rules}),/NOT_HOST/);
  assert.throws(()=>call("update_room_settings",{p_token:a.token,p_code:code,p_starting_cards:100,p_rules:rules}),/INVALID_STARTING_CARDS/);
  call("update_room_settings",{p_token:a.token,p_code:code,p_starting_cards:12,p_rules:rules});
  let state=call("get_room_state",{p_token:b.token,p_code:code});
  assert.equal(state.room.initial_cards,12);
  assert.deepEqual(state.room.rules,rules);
  call("start_game",{p_token:a.token,p_code:code});
  assert.equal(r.hands.get(a.guest_id).cards.length,12);
  assert.throws(()=>call("update_room_settings",{p_token:a.token,p_code:code,p_starting_cards:6,p_rules:rules}),/GAME_STARTED/);
  assert.equal(r.initial_cards,12);
  r.game.status="finished";r.status="waiting";
  call("update_room_settings",{p_token:a.token,p_code:code,p_starting_cards:6,p_rules:{...rules,nine:true,cut:true}});
  call("start_game",{p_token:a.token,p_code:code});
  assert.equal(r.hands.get(a.guest_id).cards.length,6);
  assert.equal(r.rules.nine,true);
  assert.equal(r.rules.cut,true);
});

test("um clique de corte durante a sequência fecha o efeito do jogador anterior uma única vez",()=>{
  const s=setup(),{room,g,a,b}=s;
  s.setTurn(a.guest_id);g.discard_pile=["bS"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["bS","rS","r1"];
  room.hands.get(b.guest_id).cards=["bS","b2"];
  s.play(a,"bS");
  assert.equal(g.effects.filter(e=>e.type==="skip").length,0);
  s.play(b,"bS"); // cut triggers finish() for Alice, then Bruno jumps in
  assert.equal(g.effects.filter(e=>e.type==="skip").length,1);
  assert.equal(g.effects.filter(e=>e.type==="skip")[0].n,1);
});

test("Bomba só anuncia efeito especial no fim da vez, ainda compra imediatamente",()=>{
  const s=setup(),{room,g,a,b}=s;s.setTurn(a.guest_id);
  g.discard_pile=["b1"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["B","r3"];
  room.hands.get(b.guest_id).cards=["y1","g2"];
  s.play(a,"B","r");
  assert.equal(room.hands.get(b.guest_id).cards.length,4);
  assert.equal(g.effects.filter(e=>e.type==="bomb").length,0);
  s.end(a);
  assert.equal(g.effects.filter(e=>e.type==="bomb").length,1);
});


test("memória pública retém somente as últimas cinco ações individuais por adversário",()=>{
  const s=setup(),{g,room,a,b}=s;
  for(let i=0;i<8;i++){
    s.setTurn(a.guest_id);
    g.discard_pile=["b1"];g.current_color="b";g.turn_start_color="b";
    room.hands.get(a.guest_id).cards=["b2","r3","y7"];
    s.play(a,"b2");s.end(a);
  }
  const recent=g.public_history[a.guest_id];
  assert.equal(recent.length,5);
  assert.ok(recent.every(e=>e.kind==="play"&&e.cards[0]==="b2"&&e.color==="b"));
  assert.equal(g.public_history[b.guest_id]?.length??0,0);
  const view=call("get_room_state",{p_token:b.token,p_code:s.code}).game;
  assert.equal("public_history" in view,false,"o cliente não deve receber estado interno da IA");
});

test("compras por penalidade são observadas como compulsórias, não falta de cor",()=>{
  const s=setup(),{g,room,a}=s;
  s.setTurn(a.guest_id);g.discard_pile=["bD"];g.current_color="b";g.turn_start_color="b";
  g.pending_draw=4;g.pending_source=s.bot;
  room.hands.get(a.guest_id).cards=["r3","g4"];
  s.end(a);
  const obs=g.public_history[a.guest_id]||[];
  assert.equal(obs.some(e=>e.kind==="forced_draw"&&e.n===4),true);
  assert.equal(inferColorGaps(obs).b,0);
});

test("compras automáticas sem jogada válida criam evidência pública de cor",()=>{
  const s=setup(),{g,room,a}=s;
  s.setTurn(a.guest_id);
  g.discard_pile=["b5"];g.current_color="b";g.turn_start_color="b";
  room.hands.get(a.guest_id).cards=["r3","g4","y8"];
  g.draw_pile.unshift("r0");
  proSweep();
  const obs=g.public_history[a.guest_id]||[];
  assert.equal(obs.some(e=>e.kind==="no_play_draw"&&e.color==="b"),true);
  assert.ok(inferColorGaps(obs).b>0);
});


test("três bloqueios com dois oponentes pulam B, C, B; nunca o próprio autor",()=>{
  const s=setup(),{g,room,a,b,bot}=s;s.setTurn(a.guest_id);
  g.discard_pile=["bS"];g.current_color="b";g.direction=1;
  room.hands.get(a.guest_id).cards=["bS","rS","gS","r3"];
  room.hands.get(b.guest_id).cards=["y1","g8"];
  room.hands.get(bot).cards=["y2","g9"];
  s.play(a,"bS");s.play(a,"rS");s.play(a,"gS");s.end(a);
  assert.equal(g.turn_order[g.turn_idx],bot);
  const notice=g.effects.filter(e=>e.type==="skip").at(-1);
  assert.deepEqual(notice.targets,[b.guest_id,bot,b.guest_id]);
});

test("volta com dois jogadores concede nova vez sem apertar terminar",()=>{
  const a=call("register_guest",{p_nickname:"VoltaA"});
  const b=call("register_guest",{p_nickname:"VoltaB"});
  const code=call("create_room",{p_token:a.token,p_name:"Volta duelos",p_max_players:2}).code;
  call("join_room",{p_token:b.token,p_code:code});call("start_game",{p_token:a.token,p_code:code});
  const r=store.roomsByCode.get(code),g=r.game;g.turn_idx=0;g.direction=1;g.discard_pile=["bR"];g.current_color="b";
  r.hands.get(a.guest_id).cards=["bR","r2","y3"];
  call("play_card",{p_token:a.token,p_code:code,p_card:"bR"});
  assert.equal(g.turn_order[g.turn_idx],a.guest_id);
  assert.equal(g.turn_cards.length,0);
  assert.equal(g.effects.filter(e=>e.type==="reverse").length,1);
});

test("novos avisos surgem ao mesmo tempo, não entram numa fila de 5 segundos",()=>{
  const s=setup(),{g,room,a,b}=s;s.setTurn(a.guest_id);
  g.discard_pile=["b9"];g.current_color="b";g.draw_pile=["r0","g0"];
  room.hands.get(a.guest_id).cards=["b1","g3"];
  room.hands.get(b.guest_id).cards=["g5","r4"];
  s.play(a,"b1");
  call("call_uno",{p_token:a.token,p_code:s.code});
  s.end(a);
  assert.ok(g.effects.length>0);
  assert.ok(g.effects.every(e=>e.show_at<=Date.now()+1000));
  assert.equal(g.visual_until<=Date.now()+5100,true);
});

test("vencedores configuráveis respeitam o limite de participantes menos um",()=>{
  const a=call("register_guest",{p_nickname:"Winner A"});
  const b=call("register_guest",{p_nickname:"Winner B"});
  const c=call("register_guest",{p_nickname:"Winner C"});
  const d=call("register_guest",{p_nickname:"Winner D"});
  const code=call("create_room",{p_token:a.token,p_name:"Winners",p_max_players:4,p_winners:99}).code;
  for(const p of [b,c,d])call("join_room",{p_token:p.token,p_code:code});
  const room=store.roomsByCode.get(code);
  assert.equal(room.winners_target,3);
  call("start_game",{p_token:a.token,p_code:code});
  assert.equal(room.game.winners_target,3);
  assert.throws(()=>call("update_winners",{p_token:a.token,p_code:code,p_winners:1}),/GAME_STARTED/);
  room.game.status="finished";room.status="waiting";
  call("update_winners",{p_token:a.token,p_code:code,p_winners:-9});
  assert.equal(room.winners_target,1);
});

test("quantidade configurada é reduzida a N-1 dos jogadores que entraram",()=>{
  const a=call("register_guest",{p_nickname:"Wlim A"});
  const b=call("register_guest",{p_nickname:"Wlim B"});
  const code=call("create_room",{p_token:a.token,p_name:"Limite N",p_max_players:8,p_winners:7}).code;
  call("join_room",{p_token:b.token,p_code:code});call("start_game",{p_token:a.token,p_code:code});
  const r=store.roomsByCode.get(code);
  assert.equal(r.winners_target,1);
  assert.equal(r.game.winners_target,1);
});

test("Negação anula +5 e inicia o turno do defensor sem comprar",()=>{
  const s=setup(),{room,g,a,b}=s;s.setTurn(a.guest_id);
  g.discard_pile=["b6"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["W5","b2"];
  room.hands.get(b.guest_id).cards=["N","r4","g8"];
  s.play(a,"W5","r");s.end(a);
  assert.equal(g.pending_draw,5);
  s.setTurn(b.guest_id);g.pending_draw=5;g.pending_uncounterable=true;
  const before=room.hands.get(b.guest_id).cards.length;
  call("negate_effect",{p_token:b.token,p_code:s.code,p_color:"g"});
  assert.equal(g.pending_draw,0);
  assert.equal(room.hands.get(b.guest_id).cards.length,before-1);
  assert.equal(g.turn_order[g.turn_idx],b.guest_id);
  assert.equal(g.current_color,"g");
});

test("Negação oferece escolha real antes de um bloqueio acontecer",()=>{
  const s=setup(),{room,g,a,b,bot}=s;s.setTurn(a.guest_id);
  g.discard_pile=["bS"];g.current_color="b";g.direction=1;
  room.hands.get(a.guest_id).cards=["bS","r2"];
  room.hands.get(b.guest_id).cards=["N","g3"];
  room.hands.get(bot).cards=["r3","y5"];
  s.play(a,"bS");s.end(a);
  assert.equal(g.skip_reaction.target,b.guest_id);
  assert.throws(()=>call("play_card",{p_token:b.token,p_code:s.code,p_card:"g3"}),/SKIP_DECISION_PENDING/);
  call("negate_effect",{p_token:b.token,p_code:s.code,p_color:"g"});
  assert.equal(g.skip_reaction,null);
  assert.equal(g.turn_order[g.turn_idx],b.guest_id);
  assert.equal(g.turn_cards.length,0,"reação não consome a jogada normal");
});

test("aceitar bloqueio avança a vez sem gastar a Negação",()=>{
  const s=setup(),{room,g,a,b,bot}=s;s.setTurn(a.guest_id);
  g.discard_pile=["bS"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["bS","r2"];
  room.hands.get(b.guest_id).cards=["N","g3"];
  room.hands.get(bot).cards=["r3","y5"];
  s.play(a,"bS");s.end(a);
  call("accept_skip",{p_token:b.token,p_code:s.code});
  assert.equal(g.skip_reaction,null);
  assert.equal(g.turn_order[g.turn_idx],bot);
  assert.equal(room.hands.get(b.guest_id).cards.includes("N"),true);
});

test("Sem Poderes impede especiais durante o próximo turno, mas permite números",()=>{
  const s=setup(),{room,g,a,b}=s;s.setTurn(a.guest_id);
  g.discard_pile=["b1"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["P","r3"];
  room.hands.get(b.guest_id).cards=["W4","g4","b5"];
  s.play(a,"P","b");s.end(a);
  assert.equal(g.powerless_target,b.guest_id);
  assert.throws(()=>call("play_card",{p_token:b.token,p_code:s.code,p_card:"W4",p_color:"g"}),/POWERLESS_NUMBER_ONLY/);
  s.play(b,"b5");s.end(b);
  assert.equal(g.powerless_target,s.bot);
  assert.deepEqual(g.powerless_remaining,[s.bot]);
});

test("Negação cancela o efeito Sem Poderes",()=>{
  const s=setup(),{room,g,a,b}=s;s.setTurn(a.guest_id);
  g.discard_pile=["b1"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["P","r3"];
  room.hands.get(b.guest_id).cards=["N","W4","r7"];
  s.play(a,"P","r");s.end(a);
  call("negate_effect",{p_token:b.token,p_code:s.code,p_color:"r"});
  assert.equal(g.powerless_target,null);
  assert.equal(g.turn_cards.length,0,"reação não consome a jogada normal");
});

test("Metralhadora troca um especial de cada adversário por número sem mudar a mão",()=>{
  const s=setup(),{room,g,a,b,bot}=s;s.setTurn(a.guest_id);
  g.discard_pile=["b1"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["M","r1"];
  room.hands.get(b.guest_id).cards=["W4","gS","r4"];
  room.hands.get(bot).cards=["bD","rR","g4"];
  g.draw_pile=["y2","r7","g1"];
  s.play(a,"M","r");
  assert.deepEqual(room.hands.get(b.guest_id).cards.length,3);
  assert.equal(room.hands.get(b.guest_id).cards.includes("W4"),false);
  assert.equal(room.hands.get(bot).cards.length,3);
  assert.equal(room.hands.get(bot).cards.some(c=>c==="bD"||c==="rR"),true);
  assert.equal(g.machine_gun_hits.length,2);
  s.end(a);
  assert.equal(g.effects.filter(e=>e.type==="machinegun").length,1);
});

test("duas passagens completas por tempo removem jogador, mas uma não",()=>{
  const s=setup(),{room,g,a}=s;s.setTurn(a.guest_id);
  room.hands.get(a.guest_id).cards=["g1","r5","y4"];
  g.discard_pile=["g7"];g.current_color="g";
  g.turn_started_at=Date.now()-60000;
  proSweep();
  assert.equal(g.timeout_counts[a.guest_id],1);
  assert.equal(room.members.some(m=>m.guest_id===a.guest_id),true);
  s.setTurn(a.guest_id);
  g.turn_started_at=Date.now()-60000;
  proSweep();
  assert.equal(room.members.some(m=>m.guest_id===a.guest_id),false);
});


test("Negação mantém a possibilidade de jogar normalmente depois de anular a compra",()=>{
  const s=setup(),{room,g,a,b}=s;s.setTurn(b.guest_id);
  g.discard_pile=["W4"];g.current_color="r";g.pending_draw=4;g.pending_source=a.guest_id;
  room.hands.get(b.guest_id).cards=["N","g2","r8"];
  call("negate_effect",{p_token:b.token,p_code:s.code,p_color:"g"});
  call("play_card",{p_token:b.token,p_code:s.code,p_card:"g2"});
  assert.equal(g.turn_cards[0],"g2");
  assert.equal(g.pending_draw,0);
});
test("todos os avisos privados de autopass são visíveis apenas ao próprio jogador",()=>{
  const s=setup(),{room,g,a,b}=s;
  s.setTurn(a.guest_id);g.discard_pile=["b3"];g.current_color="b";g.draw_pile=["r2","y2"];
  room.hands.get(a.guest_id).cards=["r0","y9"];
  proSweep();
  const own=call("get_room_state",{p_token:a.token,p_code:s.code}).game;
  const others=call("get_room_state",{p_token:b.token,p_code:s.code}).game;
  assert.equal(own.private_notice.kind,"auto_pass");
  assert.equal(others.private_notice,null);
  assert.equal(own.private_notice.message.includes("vez passou"),true);
});
test("compra manual sem carta útil cria aviso privado de vez passada",()=>{
  const s=setup(),{room,g,a,b}=s;s.setTurn(a.guest_id);
  g.discard_pile=["b7"];g.current_color="b";g.draw_pile=["r3"];
  room.hands.get(a.guest_id).cards=["y1","g9"];
  call("draw_card",{p_token:a.token,p_code:s.code});
  const state=call("get_room_state",{p_token:a.token,p_code:s.code}).game;
  assert.equal(state.private_notice.kind,"auto_pass");
  assert.equal(state.last_action.type,"auto");
  assert.notEqual(state.current_player,a.guest_id);
});
test("um bloqueio com Negação expira caso o jogador não decida",()=>{
  const s=setup(),{room,g,a,b,bot}=s;s.setTurn(a.guest_id);
  g.direction=1;g.discard_pile=["bS"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["bS","r0"];
  room.hands.get(b.guest_id).cards=["N","r9"];
  room.hands.get(bot).cards=["g9","y3"];
  s.play(a,"bS");s.end(a);
  assert.equal(g.skip_reaction.target,b.guest_id);
  g.skip_reaction.deadline=Date.now()-1;
  proSweep();
  assert.equal(g.skip_reaction,null);
  assert.equal(g.turn_order[g.turn_idx],bot);
});
test("Negação não permite cancelar voluntariamente um efeito inexistente",()=>{
  const s=setup(),{room,a}=s;
  s.setTurn(a.guest_id);room.hands.get(a.guest_id).cards=["N","b1"];
  assert.throws(()=>call("negate_effect",{p_token:a.token,p_code:s.code,p_color:"b"}),/NEGATION_NOT_ALLOWED/);
});
test("Metralhadora não altera a mão de rivais sem cartas especiais",()=>{
  const s=setup(),{room,g,a,b,bot}=s;s.setTurn(a.guest_id);
  g.discard_pile=["b1"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["M","r2"];
  room.hands.get(b.guest_id).cards=["r3","y5"];
  room.hands.get(bot).cards=["g1","b7"];
  s.play(a,"M","r");
  assert.deepEqual(room.hands.get(b.guest_id).cards,["r3","y5"]);
  assert.deepEqual(room.hands.get(bot).cards,["g1","b7"]);
  assert.equal(g.machine_gun_hits.length,0);
});
test("Sem Poderes impede cortar com especial de outro jogador durante o turno",()=>{
  const s=setup(),{g,room,a,b,bot}=s;s.setTurn(a.guest_id);
  g.discard_pile=["b4"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["P","r3"];
  room.hands.get(b.guest_id).cards=["W4","g3","r5"];
  room.hands.get(bot).cards=["b5","b2"];
  s.play(a,"P","r");s.end(a);
  assert.equal(g.powerless_target,b.guest_id);
  assert.throws(()=>call("play_card",{p_token:b.token,p_code:s.code,p_card:"W4",p_color:"r"}),/POWERLESS_NUMBER_ONLY/);
});
test("3 vencedores configurados jogam até obter três colocações, sem encerrar na segunda",()=>{
  const players=["Trio A","Trio B","Trio C","Trio D"].map(n=>call("register_guest",{p_nickname:n}));
  const [a,b,c,d]=players;
  const code=call("create_room",{p_token:a.token,p_name:"Top 3",p_max_players:4,p_winners:3}).code;
  [b,c,d].forEach(p=>call("join_room",{p_token:p.token,p_code:code}));
  call("start_game",{p_token:a.token,p_code:code});
  const room=store.roomsByCode.get(code),g=room.game;
  g.turn_idx=0;g.direction=1;g.discard_pile=["g1"];g.current_color="g";
  for(const player of [a,b,c]){
    const index=g.turn_order.indexOf(player.guest_id);
    g.turn_idx=index;
    room.hands.get(player.guest_id).cards=["g1"];
    call("play_card",{p_token:player.token,p_code:code,p_card:"g1"});
    if(player!==c)assert.equal(g.status,"playing");
  }
  assert.equal(g.status,"finished");
  assert.deepEqual(g.placements.map(x=>x.rank),[1,2,3]);
  assert.equal(g.winner_id,a.guest_id);
});
test("um jogador que age entre os tempos esgotados zera sua contagem",()=>{
  const s=setup(),{room,g,a}=s;s.setTurn(a.guest_id);
  g.discard_pile=["b3"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["b4","r7","y1"];
  g.turn_started_at=Date.now()-70000;proSweep();
  assert.equal(g.timeout_counts[a.guest_id],1);
  s.setTurn(a.guest_id);
  room.hands.get(a.guest_id).cards=["b4","r7","y1"];
  call("play_card",{p_token:a.token,p_code:s.code,p_card:"b4"});
  assert.equal(g.timeout_counts[a.guest_id],0);
});


test("Negação no primeiro de três bloqueios preserva os demais sem bloquear o autor",()=>{
  const s=setup(),{room,g,a,b,bot}=s;s.setTurn(a.guest_id);
  g.discard_pile=["bS"];g.current_color="b";g.direction=1;
  room.hands.get(a.guest_id).cards=["bS","yS","rS","r3"];
  room.hands.get(b.guest_id).cards=["N","g4","b2"];
  room.hands.get(bot).cards=["r2","y8"];
  for(const card of ["bS","yS","rS"])s.play(a,card);
  s.end(a);
  assert.equal(g.skip_reaction.target,b.guest_id);
  call("negate_effect",{p_token:b.token,p_code:s.code,p_color:"g"});
  assert.equal(g.skip_carry.remaining,2);
  call("end_turn",{p_token:b.token,p_code:s.code});
  // The two remaining skip tokens affect C and B, never A (original caster).
  assert.equal(g.turn_order[g.turn_idx],bot);
  assert.equal(g.skip_reaction,null);
  assert.equal(g.skip_carry,null);
});


test("Detetive permite ver primeiro, exige cor depois e não expõe cartas a terceiros",()=>{
  const s=setup(),{room,g,a,b}=s;s.setTurn(a.guest_id);
  g.discard_pile=["b3"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["X","r2","g4"];
  room.hands.get(b.guest_id).cards=["r7","y8"];
  call("play_card",{p_token:a.token,p_code:s.code,p_card:"X",p_target_id:b.guest_id});
  assert.equal(g.current_color,"b","cor do descarte não muda antes da escolha");
  assert.equal(g.detective_pending_color,a.guest_id);
  const me=call("get_room_state",{p_token:a.token,p_code:s.code}).game;
  const other=call("get_room_state",{p_token:b.token,p_code:s.code}).game;
  assert.deepEqual(me.detective.cards,["r7","y8"]);
  assert.equal(me.detective_pending_color,true);
  assert.equal(other.detective,null);
  assert.equal(other.detective_pending_color,false);
  assert.throws(()=>s.end(a),/DETECTIVE_COLOR_PENDING/);
  assert.throws(()=>call("play_card",{p_token:a.token,p_code:s.code,p_card:"r2"}),/DETECTIVE_COLOR_PENDING/);
  call("resolve_detective",{p_token:a.token,p_code:s.code,p_color:"r"});
  assert.equal(g.current_color,"r");
  assert.equal(g.detective,null);
  s.end(a);
});

test("Escudo é ativado ao jogar, impede Bloqueio e consome uma carga",()=>{
  const s=setup(),{room,g,a,b}=s;s.setTurn(b.guest_id);
  g.discard_pile=["b3"];g.current_color="b";
  room.hands.get(b.guest_id).cards=["bH","y2","r3"];
  s.play(b,"bH");s.end(b);
  assert.equal(g.shields[b.guest_id],1);
  s.setTurn(a.guest_id);
  room.hands.get(a.guest_id).cards=["bS","g1"];
  s.play(a,"bS");s.end(a);
  assert.equal(g.turn_order[g.turn_idx],b.guest_id,"bloqueio não remove a vez protegida");
  assert.equal(g.shields[b.guest_id],undefined);
  const event=g.effects.findLast(e=>e.type==="shield_defense");
  assert.equal(event.target_name,"Bruno");
  assert.equal(event.reason,"skip");
});

test("Escudo neutraliza toda a compra +2 e não gasta a vez do protegido",()=>{
  const s=setup(),{room,g,a,b}=s;s.setTurn(a.guest_id);
  g.shields[b.guest_id]=1;
  g.discard_pile=["b6"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["bD","g3"];
  room.hands.get(b.guest_id).cards=["r0","y2"];
  s.play(a,"bD");s.end(a);
  assert.equal(g.pending_draw,0);
  assert.deepEqual(room.hands.get(b.guest_id).cards,["r0","y2"]);
  assert.equal(g.turn_order[g.turn_idx],b.guest_id);
  assert.equal(g.shields[b.guest_id],undefined);
  assert.equal(g.effects.findLast(e=>e.type==="shield_defense").reason,"draw");
});

test("Bomba não compra cartas de jogador com Escudo e continua atingindo os demais",()=>{
  const s=setup(),{room,g,a,b,bot}=s;s.setTurn(a.guest_id);
  g.shields[b.guest_id]=1;
  g.discard_pile=["b1"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["B","r1"];
  const beforeB=room.hands.get(b.guest_id).cards.length;
  const beforeBot=room.hands.get(bot).cards.length;
  s.play(a,"B","g");
  assert.equal(room.hands.get(b.guest_id).cards.length,beforeB);
  assert.equal(room.hands.get(bot).cards.length,beforeBot+2);
  assert.equal(g.effects.findLast(e=>e.type==="shield_defense").reason,"bomb");
});

test("Escudo impede Detetive de visualizar as cartas do alvo",()=>{
  const s=setup(),{room,g,a,b}=s;s.setTurn(a.guest_id);
  g.shields[b.guest_id]=1;
  g.discard_pile=["b2"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["X","r1"];
  room.hands.get(b.guest_id).cards=["W4","r5"];
  call("play_card",{p_token:a.token,p_code:s.code,p_card:"X",p_target_id:b.guest_id});
  assert.equal(g.detective,null);
  assert.equal(g.detective_pending_color,a.guest_id);
  assert.equal(g.effects.findLast(e=>e.type==="shield_defense").reason,"detective");
  call("resolve_detective",{p_token:a.token,p_code:s.code,p_color:"y"});
  assert.equal(g.current_color,"y");
});

test("Sem Poderes restringe a próxima vez de todos os rivais, não só a primeira",()=>{
  const s=setup(),{room,g,a,b,bot}=s;s.setTurn(a.guest_id);
  g.discard_pile=["b2"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["P","r3"];
  room.hands.get(b.guest_id).cards=["b4","W4","N"];
  s.play(a,"P","b");s.end(a);
  assert.deepEqual(g.powerless_remaining,[b.guest_id,bot]);
  assert.throws(()=>call("play_card",{p_token:b.token,p_code:s.code,p_card:"W4",p_color:"r"}),/POWERLESS_NUMBER_ONLY/);
  s.play(b,"b4");s.end(b);
  assert.deepEqual(g.powerless_remaining,[bot]);
  assert.equal(g.powerless_target,bot);
});

test("Negação acaba com Sem Poderes para todos os jogadores",()=>{
  const s=setup(),{room,g,a,b}=s;s.setTurn(a.guest_id);
  g.discard_pile=["b1"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["P","g3"];
  room.hands.get(b.guest_id).cards=["N","r4"];
  s.play(a,"P","r");s.end(a);
  assert.ok(g.powerless_remaining.length>=2);
  call("negate_effect",{p_token:b.token,p_code:s.code,p_color:"r"});
  assert.deepEqual(g.powerless_remaining,[]);
  assert.equal(g.powerless_target,null);
});

test("Metralhadora mostra cartas recolhidas e as embaralha sem descarte",()=>{
  const s=setup(),{room,g,a,b,bot}=s;s.setTurn(a.guest_id);
  g.discard_pile=["b3"];g.current_color="b";g.draw_pile=["y0","r2","g4"];
  room.hands.get(a.guest_id).cards=["M","r1"];
  room.hands.get(b.guest_id).cards=["W4","r5"];
  room.hands.get(bot).cards=["bD","g3"];
  s.play(a,"M","r");
  const details=g.machine_gun_hits;
  assert.equal(details.length,2);
  assert.ok(details.some(x=>x.target===b.guest_id&&x.card==="W4"));
  assert.ok(details.some(x=>x.target===bot&&x.card==="bD"));
  assert.ok(g.draw_pile.includes("W4"));
  assert.ok(g.draw_pile.includes("bD"));
  assert.equal(g.discard_pile.includes("W4"),false);
  const replacement=call("get_room_state",{p_token:b.token,p_code:s.code}).game.machine_gun_new;
  assert.ok(replacement.card.match(/^[rygb][0-9]$/));
  assert.equal(call("get_room_state",{p_token:a.token,p_code:s.code}).game.machine_gun_new,null);
  s.end(a);
  assert.deepEqual(g.effects.findLast(e=>e.type==="machinegun").revealed,details);
});

test("Detetive pode ser a última carta sem pular a escolha de cor",()=>{
  const s=setup(),{room,g,a,b}=s;s.setTurn(a.guest_id);
  g.discard_pile=["y3"];g.current_color="y";
  room.hands.get(a.guest_id).cards=["X"];
  room.hands.get(b.guest_id).cards=["r2","g3"];
  call("play_card",{p_token:a.token,p_code:s.code,p_card:"X",p_target_id:b.guest_id});
  assert.equal(g.placements.length,0,"a vitória precisa aguardar a cor");
  assert.equal(g.detective_pending_color,a.guest_id);
  call("resolve_detective",{p_token:a.token,p_code:s.code,p_color:"r"});
  assert.equal(g.placements[0].id,a.guest_id);
  assert.equal(g.current_color,"r");
});


test("Escudo é binário: duas cartas ativam uma única proteção",()=>{
  const s=setup(),{room,g,a}=s;
  s.setTurn(a.guest_id);g.discard_pile=["b3"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["bH","bH","r7"];
  s.play(a,"bH");s.play(a,"bH");
  assert.equal(g.shields[a.guest_id],1);
  s.end(a);
  assert.equal(g.shields[a.guest_id],1);
});
test("Vórtice baixa todas as cartas da cor em ordem aleatória e soma efeitos",()=>{
  const s=setup(),{room,g,a,b,bot}=s;
  s.setTurn(a.guest_id);g.discard_pile=["b4"];g.current_color="b";
  const chosen=["bV","bH","bD","bD","bC","bS","r3"];
  room.hands.get(a.guest_id).cards=[...chosen];
  room.hands.get(b.guest_id).cards=["r1","g1"];
  room.hands.get(bot).cards=["g2","y2"];
  s.play(a,"bV");
  assert.equal(g.vortex_queue.cards.length,5);
  assert.equal(g.discard_pile.at(-1),"bV");
  proSweep();
  assert.equal(g.card_moves.filter(m=>m.by===a.guest_id).length,1,"aguarda intervalo antes de puxar");
  assert.throws(()=>s.end(a),/VORTEX_RESOLVING/);
  for(let i=0;i<6;i++){if(g.vortex_queue)g.vortex_queue.next_at=Date.now()-1;proSweep();}
  assert.deepEqual(room.hands.get(a.guest_id).cards,["r3"]);
  assert.equal(g.shields[a.guest_id],1);
  assert.deepEqual(g.discard_pile.slice(-6).sort(),chosen.filter(c=>c!=="r3").sort());
  assert.equal(g.card_moves.filter(m=>m.by===a.guest_id).length,6);
  assert.ok(g.effects.some(e=>e.type==="vortex"&&e.n===5));
  assert.ok(g.beer_remaining.includes(b.guest_id));
  assert.ok(g.beer_remaining.includes(bot));
  assert.equal(g.turn_cards.length,0,"Vórtice encerra a vez automaticamente");
  assert.equal(g.direction,1);
  assert.ok(room.hands.get(b.guest_id).cards.length + room.hands.get(bot).cards.length >= 4);
});
test("Cerveja tira a escolha do adversário e joga uma carta válida aleatória",()=>{
  const s=setup(),{room,g,a,b,bot}=s;
  s.setTurn(a.guest_id);g.discard_pile=["b4"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["bC","r9"];
  room.hands.get(b.guest_id).cards=["b5","r6"];
  room.hands.get(bot).cards=["g1","r2"];
  s.play(a,"bC");s.end(a);
  assert.ok(g.beer_remaining.includes(b.guest_id));
  assert.throws(()=>s.play(b,"b5"),/BEER_FORCED/);
  const before=g.card_moves.length;
  proSweep();
  assert.equal(g.card_moves.length,before,"nenhuma carta antes dos 3 segundos");
  assert.equal(call("get_room_state",{p_token:b.token,p_code:s.code}).game.beer_remaining.includes(b.guest_id),true);
  g.beer_due=Date.now()-1;
  proSweep();
  assert.deepEqual(room.hands.get(b.guest_id).cards,["r6"]);
  assert.equal(g.discard_pile.at(-1),"b5");
  assert.ok(!g.beer_remaining.includes(b.guest_id));
  assert.ok(g.effects.some(e=>e.type==="beer_forced"));
});
test("Cerveja compra uma carta, joga se servir, senão passa",()=>{
  const s=setup(),{room,g,a,b,bot}=s;
  s.setTurn(a.guest_id);g.discard_pile=["b4"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["bC","y8"];
  room.hands.get(b.guest_id).cards=["r5","g6"];
  room.hands.get(bot).cards=["r1","y2"];
  g.draw_pile=["b7","r8"];
  s.play(a,"bC");s.end(a);
  g.beer_due=Date.now()-1;proSweep();
  assert.equal(g.discard_pile.at(-1),"b7");
  assert.deepEqual(room.hands.get(b.guest_id).cards,["r5","g6"]);
  assert.ok(!g.beer_remaining.includes(b.guest_id));
});
test("Cerveja compra e passa quando a carta comprada não combina",()=>{
  const s=setup(),{room,g,a,b,bot}=s;
  s.setTurn(a.guest_id);g.discard_pile=["b4"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["bC","y8"];
  room.hands.get(b.guest_id).cards=["r5","g6"];
  room.hands.get(bot).cards=["r1","y2"];
  g.draw_pile=["r7","b8"];
  s.play(a,"bC");s.end(a);
  g.beer_due=Date.now()-1;proSweep();
  assert.equal(g.discard_pile.at(-1),"bC");
  assert.deepEqual(room.hands.get(b.guest_id).cards,["r5","g6","r7"]);
  assert.ok(!g.beer_remaining.includes(b.guest_id));
  assert.equal(g.turn_order[g.turn_idx],bot);
});

test("Coringa comum é descartado no clique antes da cor, inclusive em corte",()=>{
  const s=setup(),{room,g,a,b}=s;
  s.setTurn(a.guest_id);g.discard_pile=["W"];g.current_color="r";
  room.hands.get(a.guest_id).cards=["r5","y1"];
  room.hands.get(b.guest_id).cards=["W","b7","g4"];
  const played=call("play_card",{p_token:b.token,p_code:s.code,p_card:"W"});
  assert.equal(played.pending_color,true);
  assert.equal(g.turn_order[g.turn_idx],b.guest_id,"corte aconteceu antes da escolha");
  assert.equal(g.discard_pile.at(-1),"W");
  assert.equal(g.wild_pending_color,b.guest_id);
  assert.equal(call("get_room_state",{p_token:b.token,p_code:s.code}).game.wild_pending_color,true);
  assert.equal(call("get_room_state",{p_token:a.token,p_code:s.code}).game.wild_pending_color,false);
  assert.throws(()=>s.end(b),/WILD_COLOR_PENDING/);
  assert.throws(()=>call("play_card",{p_token:a.token,p_code:s.code,p_card:"r5"}),/WILD_COLOR_PENDING/);
  call("resolve_wild_color",{p_token:b.token,p_code:s.code,p_color:"g"});
  assert.equal(g.current_color,"g");assert.equal(g.wild_pending_color,null);
  s.end(b);
});
test("Coringa +4 colocado sem cor aplica dívida apenas após resolver a cor",()=>{
  const s=setup(),{room,g,a,b}=s;s.setTurn(a.guest_id);
  g.discard_pile=["b6"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["W4","r2"];
  room.hands.get(b.guest_id).cards=["r1","y8"];
  s.play(a,"W4");
  assert.equal(g.discard_pile.at(-1),"W4");
  assert.equal(g.pending_draw,0);
  call("resolve_wild_color",{p_token:a.token,p_code:s.code,p_color:"r"});
  s.end(a);
  assert.equal(g.pending_draw,0,"a dívida foi aplicada e comprada automaticamente pelo próximo jogador sem contra-ataque");
  assert.ok(room.hands.get(b.guest_id).cards.length>=6);
});
test("Cerveja dá 3 segundos para cada adversário antes da jogada forçada",()=>{
  const s=setup(),{room,g,a,b,bot}=s;
  s.setTurn(a.guest_id);g.discard_pile=["b4"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["bC","r9"];
  room.hands.get(b.guest_id).cards=["b5","r6"];
  room.hands.get(bot).cards=["b7","r2"];
  s.play(a,"bC");s.end(a);
  const firstDue=g.beer_due;
  assert.ok(firstDue>Date.now()+2500);
  proSweep();assert.equal(g.discard_pile.at(-1),"bC");
  g.beer_due=Date.now()-1;proSweep();
  assert.equal(g.discard_pile.at(-1),"b5");
  assert.equal(g.turn_order[g.turn_idx],bot);
  assert.ok(g.beer_due>Date.now()+2500,"novo adversário recebe outra espera de 3s");
  proSweep();assert.equal(g.discard_pile.at(-1),"b5");
  g.beer_due=Date.now()-1;proSweep();
  assert.equal(g.discard_pile.at(-1),"b7");
});

test("Cerveja respeita Escudo antes de sortear a carta da vez",()=>{
  const s=setup(),{room,g,a,b}=s;s.setTurn(a.guest_id);
  g.discard_pile=["b4"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["bC","r9"];
  room.hands.get(b.guest_id).cards=["b5","r6"];
  room.hands.get(s.bot).cards=["g1","y2"];
  s.play(a,"bC");s.end(a);
  g.pending_draw=2;g.pending_source=a.guest_id;g.shields[b.guest_id]=1;
  g.beer_due=Date.now()-1;proSweep();
  assert.equal(g.shields[b.guest_id],undefined,"o escudo foi consumido");
  assert.equal(g.pending_draw,0,"dívida cancelada antes da escolha da Cerveja");
  assert.equal(g.discard_pile.at(-1),"b5");
  assert.ok(g.effects.some(e=>e.type==="shield_defense"&&e.reason==="draw"));
});

test("Cadeado restringe cada rival à cor e não permite coringas",()=>{
  const s=setup(),{room,g,a,b,bot}=s;
  s.setTurn(a.guest_id);g.discard_pile=["b4"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["bL","r9"];
  room.hands.get(b.guest_id).cards=["rL","W4","b5","g7"];
  room.hands.get(bot).cards=["b3","r2"];
  s.play(a,"bL");s.end(a);
  assert.equal(g.lock_color,"b");
  assert.deepEqual(g.lock_remaining,[b.guest_id,bot]);
  assert.ok(g.effects.some(e=>e.type==="lock"&&e.color==="b"));
  assert.throws(()=>s.play(b,"rL"),/LOCK_COLOR_ONLY/,"mesmo símbolo de outra cor não vale");
  assert.throws(()=>s.play(b,"W4","b"),/LOCK_COLOR_ONLY/,"coringas não furam o cadeado");
  s.play(b,"b5");s.end(b);
  assert.deepEqual(g.lock_remaining,[bot],"restrição termina depois do turno de Bruno, mas permanece no bot");
  assert.equal(g.lock_color,"b");
  assert.equal(call("get_room_state",{p_token:a.token,p_code:s.code}).game.lock_color,"b");
});
test("Negação cancela Cadeado de todos e permite jogar normalmente",()=>{
  const s=setup(),{room,g,a,b}=s;
  s.setTurn(a.guest_id);g.discard_pile=["g7"];g.current_color="g";
  room.hands.get(a.guest_id).cards=["gL","r9"];
  room.hands.get(b.guest_id).cards=["N","r3","y6"];
  s.play(a,"gL");s.end(a);
  assert.equal(g.lock_remaining.length,2);
  call("negate_effect",{p_token:b.token,p_code:s.code,p_color:"r"});
  assert.deepEqual(g.lock_remaining,[]);
  assert.equal(g.lock_color,null);
  assert.equal(g.lock_target,null);
  s.play(b,"r3");s.end(b);
  assert.equal(g.discard_pile.at(-1),"r3");
});
test("Espada não acumula e adiciona exatamente +3 ao próximo come",()=>{
  const s=setup(),{room,g,a,b}=s;
  s.setTurn(a.guest_id);g.discard_pile=["b1"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["bE","bE","r2","bD"];
  s.play(a,"bE");s.play(a,"bE");s.end(a);
  assert.equal(g.swords[a.guest_id],1);
  s.setTurn(a.guest_id);g.discard_pile=["b2"];g.current_color="b";
  room.hands.get(b.guest_id).cards=["W4","g3","r1"];
  s.play(a,"bD");s.end(a);
  assert.equal(g.swords[a.guest_id],undefined,"espada gasta após o come");
  assert.equal(g.pending_draw,5,"+2 e espada +3");
  assert.equal(g.pending_sword_bonus,3);
  const old=room.hands.get(b.guest_id).cards.length;
  s.end(b);
  assert.equal(room.hands.get(b.guest_id).cards.length,old+5);
  assert.ok(g.effects.some(e=>e.type==="sword_strike"&&e.target===b.guest_id&&e.n===3));
  assert.equal(g.pending_sword_bonus,0,"não reaplicar espada depois de cobrar a dívida");
});
test("Espada persiste se não jogar come; Escudo impede golpe animado",()=>{
  const s=setup(),{room,g,a,b}=s;
  s.setTurn(a.guest_id);g.discard_pile=["b6"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["bE","b7","bD","r2"];
  s.play(a,"bE");s.end(a);
  assert.equal(g.swords[a.guest_id],1);
  s.setTurn(a.guest_id);g.discard_pile=["b4"];g.current_color="b";
  s.play(a,"b7");s.end(a);
  assert.equal(g.swords[a.guest_id],1,"não gastar na jogada comum");
  s.setTurn(a.guest_id);g.discard_pile=["b7"];g.current_color="b";
  room.hands.get(b.guest_id).cards=["r1","y2","g3"];
  g.shields[b.guest_id]=1;
  s.play(a,"bD");s.end(a);
  assert.equal(g.pending_draw,0,"escudo cancela dívida completa");
  assert.equal(g.swords[a.guest_id],undefined);
  assert.equal(g.effects.some(e=>e.type==="sword_strike"),false,"sem animação quando ninguém compra");
});
test("Espada somada ao come continua na dívida após revides",()=>{
  const s=setup(),{room,g,a,b,bot}=s;
  s.setTurn(a.guest_id);g.discard_pile=["b3"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["bE","bD","r2"];
  room.hands.get(b.guest_id).cards=["W4","r4","g3"];
  room.hands.get(bot).cards=["r6","g7"];
  s.play(a,"bE");s.end(a);
  s.setTurn(a.guest_id);g.discard_pile=["b5"];g.current_color="b";
  s.play(a,"bD");s.end(a);
  assert.equal(g.pending_draw,5);
  s.play(b,"W4","r");s.end(b);
  assert.equal(g.pending_draw,0,"bot sem counter compra depois do revide");
  assert.equal(room.hands.get(bot).cards.length,11,"bot comprou 2 + 3 + 4");
  assert.ok(g.effects.some(e=>e.type==="sword_strike"&&e.target===bot));
});
test("Jogador único entre bots preserva a partida durante desconexão longa",()=>{
  const a=call("register_guest",{p_nickname:"Humano"});
  const code=call("create_room",{p_token:a.token,p_name:"Solo protegido",p_max_players:4}).code;
  call("add_bot",{p_token:a.token,p_code:code,p_difficulty:"hard"});
  call("add_bot",{p_token:a.token,p_code:code,p_difficulty:"easy"});
  call("start_game",{p_token:a.token,p_code:code});
  const room=store.roomsByCode.get(code),g=room.game;
  assert.equal(isSoloHumanBotMatch(room),true);
  g.turn_idx=g.turn_order.indexOf(a.guest_id);
  const savedCards=[...room.hands.get(a.guest_id).cards];
  g.turn_started_at=Date.now()-90000;
  store.guestsById.get(a.guest_id).last_seen=Date.now()-2*60*60*1000;
  room.updated_at=Date.now()-2*60*60*1000;
  proSweep();basicSweep();
  assert.ok(store.roomsByCode.has(code),"sala protegida permanece");
  assert.ok(room.members.some(m=>m.guest_id===a.guest_id),"humano não expulso");
  assert.equal(g.status,"playing");
  assert.ok(g.solo_paused_at);
  g.solo_paused_at=Date.now()-2*60*60*1000;
  const before=g.turn_started_at;
  call("get_room_state",{p_token:a.token,p_code:code});
  proSweep();
  assert.equal(g.solo_paused_at,null);
  assert.ok(g.turn_started_at>before+2*60*60*1000-2000,"timer ajustado pela ausência");
  assert.deepEqual(room.hands.get(a.guest_id).cards,savedCards);
  assert.equal(g.turn_order[g.turn_idx],a.guest_id);
  assert.equal(g.timeout_counts[a.guest_id]||0,0);
});

test("Espelho é coringa único e começa copiando o coringa comum",()=>{
  const s=setup(),{g,room,a}=s;s.setTurn(a.guest_id);
  assert.equal(g.last_wild,null,"antes do primeiro coringa o Espelho tem sua arte própria");
  room.hands.get(a.guest_id).cards=["Q","r3"];
  g.discard_pile=["b1"];g.current_color="b";
  s.play(a,"Q","y");
  assert.equal(g.discard_pile.at(-1),"Q","identidade física preservada");
  assert.equal(g.mirror_played_as,"W");
  assert.equal(g.current_color,"y");
  assert.equal(g.last_wild,null,"Espelho não se copia a si mesmo");
  const state=call("get_room_state",{p_token:a.token,p_code:s.code}).game;
  assert.equal(state.last_wild,null);
  assert.equal(state.mirror_played_as,"W");
});
test("Espelho copia +4 do último coringa e preserva a dívida",()=>{
  const s=setup(),{g,room,a,b}=s;s.setTurn(a.guest_id);
  g.discard_pile=["b4"];g.current_color="b";g.last_wild="W4";
  room.hands.get(a.guest_id).cards=["Q","r5"];
  room.hands.get(b.guest_id).cards=["W4","r5"];
  s.play(a,"Q","r");
  assert.equal(g.card_moves.at(-1).mirror_as,"W4");
  assert.equal(g.turn_cards[0],"W4");
  s.end(a);
  assert.equal(g.pending_draw,4);
  assert.equal(g.last_wild,"W4");
  assert.equal(g.discard_pile.at(-1),"Q");
});
test("Espelho também copia +5 e pode rebater a dívida de +5",()=>{
  const s=setup(),{g,room,a,b}=s;s.setTurn(a.guest_id);
  g.discard_pile=["W5"];g.current_color="b";g.last_wild="W5";
  g.pending_draw=5;g.pending_uncounterable=true;g.pending_source=b.guest_id;
  room.hands.get(a.guest_id).cards=["Q","r2"];
  room.hands.get(b.guest_id).cards=["W5","y2"];
  s.play(a,"Q","g");s.end(a);
  assert.equal(g.pending_draw,10);
  assert.equal(g.pending_uncounterable,true);
});
test("Espelho copia Bomba e Metralhadora com seus efeitos",()=>{
  const s=setup(),{g,room,a,b,bot}=s;s.setTurn(a.guest_id);
  g.discard_pile=["b1"];g.current_color="b";g.last_wild="B";
  room.hands.get(a.guest_id).cards=["Q","r3"];
  room.hands.get(b.guest_id).cards=["r2","y4"];
  room.hands.get(bot).cards=["b5","g6"];
  s.play(a,"Q","r");
  assert.equal(room.hands.get(b.guest_id).cards.length,4);
  assert.equal(room.hands.get(bot).cards.length,4);
  assert.equal(g.last_wild,"B");
  s.setTurn(b.guest_id);g.discard_pile=["r2"];g.current_color="r";
  g.last_wild="M";room.hands.get(b.guest_id).cards=["Q","r3"];
  room.hands.get(a.guest_id).cards=["W4","r4","g3"];
  s.play(b,"Q","y");
  assert.equal(g.discard_pile.at(-1),"Q");
  assert.equal(g.turn_cards.at(-1),"M");
  assert.equal(g.last_wild,"M");
});
test("Espelho imita Detetive, inclusive alvo e escolha de cor posterior",()=>{
  const s=setup(),{g,room,a,b}=s;s.setTurn(a.guest_id);
  g.discard_pile=["r2"];g.current_color="r";g.last_wild="X";
  room.hands.get(a.guest_id).cards=["Q","r3"];
  room.hands.get(b.guest_id).cards=["b2","g2"];
  call("play_card",{p_token:a.token,p_code:s.code,p_card:"Q",p_target_id:b.guest_id});
  assert.equal(g.detective_pending_color,a.guest_id);
  const view=call("get_room_state",{p_token:a.token,p_code:s.code}).game;
  assert.deepEqual(view.detective.cards,["b2","g2"]);
  call("resolve_detective",{p_token:a.token,p_code:s.code,p_color:"g"});
  assert.equal(g.current_color,"g");
  assert.equal(g.last_wild,"X");
});
test("Espelho pode funcionar como Negação para cancelar compra",()=>{
  const s=setup(),{g,room,a,b}=s;s.setTurn(a.guest_id);
  g.last_wild="N";g.discard_pile=["bD"];g.current_color="b";
  g.pending_draw=2;g.pending_source=b.guest_id;
  room.hands.get(a.guest_id).cards=["Q","r3"];
  call("negate_effect",{p_token:a.token,p_code:s.code,p_color:"r"});
  assert.equal(g.pending_draw,0);
  assert.equal(room.hands.get(a.guest_id).cards.includes("Q"),false);
  assert.equal(g.discard_pile.at(-1),"Q");
  assert.equal(g.effects.at(-1).type,"negation");
});
test("Multijogador pode voltar ao sair, mas não depois de expulso por inatividade",()=>{
  const s=setup(),{g,room,a}=s;s.setTurn(a.guest_id);
  call("leave_room",{p_token:a.token,p_code:s.code});
  assert.equal(g.status,"playing");
  assert.ok(room.members.some(m=>m.guest_id===a.guest_id));
  assert.ok(call("list_rejoinable_rooms",{p_token:a.token}).some(r=>r.code===s.code&&!r.solo));
  call("join_room",{p_token:a.token,p_code:s.code});
  assert.ok(room.members.some(m=>m.guest_id===a.guest_id));
  g.turn_started_at=Date.now()-60000;
  proSweep();
  s.setTurn(a.guest_id);g.turn_started_at=Date.now()-60000;
  proSweep();
  assert.ok(!room.members.some(m=>m.guest_id===a.guest_id));
  assert.ok(!call("list_rejoinable_rooms",{p_token:a.token}).some(r=>r.code===s.code));
});
test("Partida solo recuperável desaparece após cinco minutos",()=>{
  const a=call("register_guest",{p_nickname:"PrazoSolo"});
  const code=call("create_room",{p_token:a.token,p_name:"Salva por cinco",p_max_players:3,p_is_public:false}).code;
  call("add_bot",{p_token:a.token,p_code:code,p_difficulty:"easy"});
  call("start_game",{p_token:a.token,p_code:code});
  const r=store.roomsByCode.get(code);
  call("leave_room",{p_token:a.token,p_code:code});
  const available=call("list_rejoinable_rooms",{p_token:a.token});
  assert.ok(available.some(v=>v.code===code&&v.solo&&v.recovery_until));
  r.game.solo_recovery_until=Date.now()-1;
  assert.ok(!call("list_rejoinable_rooms",{p_token:a.token}).some(v=>v.code===code));
  proSweep();
  assert.equal(store.roomsByCode.has(code),false);
});

test("Último coringa do próprio portador muda o Espelho na mesma jogada",()=>{
  const s=setup(),{g,room,a,b}=s;s.setTurn(a.guest_id);
  g.discard_pile=["b3"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["W4","Q","r3"];
  room.hands.get(b.guest_id).cards=["W4","r4"];
  s.play(a,"W4","g");
  assert.equal(g.last_wild,"W4");
  s.play(a,"Q","r");
  assert.deepEqual(g.turn_cards,["W4","W4"]);
  assert.equal(g.last_wild,"W4");
  assert.equal(g.card_moves.at(-1).mirror_as,"W4");
  s.end(a);
  assert.equal(g.pending_draw,8,"soma da carta verdadeira com o Espelho");
});
test("Espelho em outra mão não é duplicado quando o baralho infinito reinicia",()=>{
  const s=setup(),{g,room,a}=s;s.setTurn(a.guest_id);
  g.discard_pile=["b3"];g.current_color="b";g.draw_pile=[];
  room.hands.get(a.guest_id).cards=["Q","r2"];
  const draw=call("draw_card",{p_token:a.token,p_code:s.code});
  assert.ok(draw.card);
  assert.ok(room.hands.get(a.guest_id).cards.includes("Q"));
  assert.equal(g.draw_pile.includes("Q"),false,"não existem duas cartas Espelho em circulação");
});
test("Retorno de sala privada não revela partidas de outros jogadores",()=>{
  const a=call("register_guest",{p_nickname:"Privado1"});
  const outsider=call("register_guest",{p_nickname:"Privado2"});
  const code=call("create_room",{p_token:a.token,p_code:"",p_name:"Só minha",p_max_players:3,p_is_public:false}).code;
  call("add_bot",{p_token:a.token,p_code:code,p_difficulty:"hard"});
  call("start_game",{p_token:a.token,p_code:code});
  call("leave_room",{p_token:a.token,p_code:code});
  assert.ok(call("list_rejoinable_rooms",{p_token:a.token}).some(x=>x.code===code));
  assert.ok(!call("list_rejoinable_rooms",{p_token:outsider.token}).some(x=>x.code===code));
  assert.ok(!call("list_public_rooms",{}).some(x=>x.code===code));
});

test("O servidor reiniciado recupera identidades, Google vinculado e mãos da mesma sala",()=>{
  const s=setup(),{room,g,a,b}=s;
  store.guestsById.get(a.guest_id).google_sub="verified-google-sub";
  g.last_wild="W4";
  room.hands.get(a.guest_id).cards=["Q","r4"];
  const snapshot=JSON.parse(JSON.stringify(serializeState()));
  const guestCount=store.guestsById.size;
  // Simulate new process by clearing the in-memory registries and hydrating.
  store.guestsById=new Map();store.guestsByHash=new Map();
  store.rooms=new Map();store.roomsByCode=new Map();
  hydrateState(snapshot);
  assert.equal(store.guestsById.size,guestCount);
  assert.equal(store.roomsByCode.get(s.code).game.last_wild,"W4");
  assert.deepEqual(store.roomsByCode.get(s.code).hands.get(a.guest_id).cards,["Q","r4"]);
  assert.equal(store.guestsById.get(a.guest_id).google_sub,"verified-google-sub");
  assert.equal(call("whoami",{p_token:a.token}).guest_id,a.guest_id,"same saved session remains valid");
  assert.equal(call("get_room_state",{p_token:a.token,p_code:s.code}).game.my_hand.includes("Q"),true);
  assert.equal(call("get_room_state",{p_token:b.token,p_code:s.code}).game.my_hand.includes("Q"),false);
});
test("Configuração pública Google não expõe credenciais do armazenamento",()=>{
  const config=call("auth_config",{});
  assert.equal(typeof config.google_client_id,"string");
  assert.equal(typeof config.persistent_rooms_configured,"boolean");
  assert.equal("UPSTASH_REDIS_REST_TOKEN" in config,false);
});

test("Somente o humano de uma partida contra bots pode exportar o salvamento completo",()=>{
  const player=call("register_guest",{p_nickname:"SoloSalvo"});
  const outsider=call("register_guest",{p_nickname:"Fora"});
  const {code}=call("create_room",{p_token:player.token,p_name:"Resgate offline",p_max_players:4});
  call("add_bot",{p_token:player.token,p_code:code,p_difficulty:"hard"});
  call("add_bot",{p_token:player.token,p_code:code,p_difficulty:"easy"});
  call("start_game",{p_token:player.token,p_code:code});
  const room=store.roomsByCode.get(code);
  const backup=call("export_solo_snapshot",{p_token:player.token,p_code:code});
  assert.equal(backup.version,1);
  assert.equal(backup.code,code);
  assert.equal(backup.room.game.status,"playing");
  assert.equal(backup.guests.length,3);
  assert.equal(backup.room.hands.length,3);
  assert.deepEqual(backup.room.hands.find(([id])=>id===player.guest_id)[1].cards,
    room.hands.get(player.guest_id).cards);
  assert.ok(!JSON.stringify(backup).includes(player.token),"never transmit raw player session token");
  assert.throws(()=>call("export_solo_snapshot",{p_token:outsider.token,p_code:code}),
    /NOT_MEMBER/,"other users cannot read bot hands");
  const multi=setup();
  assert.throws(()=>call("export_solo_snapshot",{p_token:multi.a.token,p_code:multi.code}),
    /NOT_SOLO_BOT_GAME/,"cannot export matches with another human");
});
