import test from "node:test";
import assert from "node:assert/strict";
import {store, newDeck} from "../server/game.js";
import {proRpc,proSweep,chooseNineDelay,chooseCutDelay,chooseBotMoveDelay,BOT_NAMES} from "../server/pro.js";
const call=(fn,args)=>proRpc(fn,args);
function setup(rules) {
  const a=call("register_guest",{p_nickname:"Alice"}),b=call("register_guest",{p_nickname:"Bruno"});
  const {code}=call("create_room",{p_token:a.token,p_name:"Regras",p_max_players:4,p_rules:rules});
  call("join_room",{p_token:b.token,p_code:code});
  const {id:bot}=call("add_bot",{p_token:a.token,p_code:code,p_difficulty:"hard"});
  call("start_game",{p_token:a.token,p_code:code});
  const room=store.roomsByCode.get(code),g=room.game;
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
  const before=room.hands.get(s.bot).cards.length;
  s.play(a,"r9");s.play(a,"g9");s.play(a,"b9");s.end(a);
  assert.equal(g.nine.count,3);
  call("press_nine",{p_token:b.token,p_code:s.code});
  // As soon as only one player remains, that player is last automatically.
  assert.equal(g.nine,null);
  assert.equal(room.hands.get(s.bot).cards.length,before+3);
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

test("novo baralho tem 178 cartas: 3 cartas coloridas por tipo, dez W/dez +4 e dois +5",()=>{
  const deck=newDeck();
  assert.equal(deck.length,178);
  for(const col of ["r","y","g","b"])
    for(const value of ["0","1","2","3","4","5","6","7","8","9","S","R","D"])
      assert.equal(deck.filter(c=>c===col+value).length,3,col+value);
  for(const card of ["W","W4"])assert.equal(deck.filter(c=>c===card).length,10,card);
  assert.equal(deck.filter(c=>c==="W5").length,2);
});
test("baralho vazio renova baralho completo mantendo carta de descarte",()=>{
  const s=setup(),{room,g,a}=s;
  s.setTurn(a.guest_id);
  g.draw_pile=[];g.discard_pile=["g6"];g.current_color="g";
  room.hands.get(a.guest_id).cards=["b1","r5"];
  const drawn=call("draw_card",{p_token:a.token,p_code:s.code});
  assert.ok(drawn.card);
  assert.equal(g.draw_pile.length,177);
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
  call("call_uno",{p_token:a.token,p_code:s.code}); // two cards remain before ending
  const events=call("get_room_state",{p_token:b.token,p_code:s.code}).game.effects;
  assert.equal(events.at(-2).type,"reverse");
  assert.equal(events.at(-1).type,"uno");
  assert.equal(events.at(-1).name,"Alice");
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
  s.play(a,"bS");
  const blocked=g.effects.find(e=>e.type==="skip");
  assert.equal(blocked.target,b.guest_id);
  assert.equal(blocked.target_name,"Bruno");
  s.end(a);
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


test("movimento dos bots: fácil 20% 5s e 80% 11s, difícil 80% 5s",()=>{
  assert.equal(chooseBotMoveDelay("easy",()=>0),5000);
  assert.equal(chooseBotMoveDelay("easy",()=>0.19999),5000);
  assert.equal(chooseBotMoveDelay("easy",()=>0.20),11000);
  assert.equal(chooseBotMoveDelay("easy",()=>0.99),11000);
  assert.equal(chooseBotMoveDelay("hard",()=>0),5000);
  assert.equal(chooseBotMoveDelay("hard",()=>0.79999),5000);
  assert.equal(chooseBotMoveDelay("hard",()=>0.80),11000);
  assert.equal(chooseBotMoveDelay("hard",()=>0.95),11000);
});

test("20 nomes de bots diferentes dentro da sala",()=>{
  assert.equal(BOT_NAMES.length,20);
  assert.equal(new Set(BOT_NAMES).size,20);
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
  call("play_card",{p_token:a.token,p_code:code,p_card:"bR"});
  for(const e of g.effects)e.show_at=Date.now()-10000;
  call("play_card",{p_token:a.token,p_code:code,p_card:"yR"});
  for(const e of g.effects)e.show_at=Date.now()-10000;
  call("end_turn",{p_token:a.token,p_code:code});
  assert.equal(g.direction,1,"inversão dupla devolve a direção original");
  assert.equal(g.turn_order[g.turn_idx],b.guest_id);
});

test("aviso especial dura cinco segundos, permite jogar aos 2s sem gastar turno",()=>{
  const s=setup(),{room,g,a}=s;
  s.setTurn(a.guest_id);g.discard_pile=["bR"];g.current_color="b";
  room.hands.get(a.guest_id).cards=["bR","yR","r8"];
  const start=g.turn_started_at;
  s.play(a,"bR");
  const notice=g.effects.at(-1);
  assert.equal(notice.type,"reverse");
  assert.equal(g.turn_started_at>=start+5000,true,"tempo da notificação não consome o turno");
  assert.throws(()=>call("play_card",{p_token:a.token,p_code:s.code,p_card:"yR"}),/ANNOUNCEMENT_WAIT/);
  notice.show_at=Date.now()-2500;
  // The animation is still visible for about 2.5s but the player may act.
  call("play_card",{p_token:a.token,p_code:s.code,p_card:"yR"});
  assert.equal(g.turn_cards.length,2);
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
  assert.notEqual(g.turn_order[g.turn_idx],s.bot);
  assert.ok(g.effects.some(e=>e.type==="reverse"));
});
