import test from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {newDeck,isRoach,roachChainId,makeRoach,store,cardValue,playable} from "../server/game.js";
import {proRpc,proSweep} from "../server/pro.js";
import {serializeState,hydrateState} from "../server/persistence.js";

const call=(fn,args)=>proRpc(fn,args);
function match(n){
  const players=Array.from({length:n},(_,i)=>call("register_guest",{p_nickname:"Barata "+(i+1)}));
  const {code}=call("create_room",{p_token:players[0].token,p_name:"Teste de cadeias",p_max_players:n});
  for(const p of players.slice(1))call("join_room",{p_token:p.token,p_code:code});
  call("start_game",{p_token:players[0].token,p_code:code});
  const room=store.roomsByCode.get(code),g=room.game;
  g.turn_order=players.map(p=>p.guest_id);g.direction=1;
  for(const p of players)room.hands.get(p.guest_id).cards=["r2","g4","y6"];
  function prepare(player,card){
    g.turn_idx=g.turn_order.indexOf(player.guest_id);g.direction=1;
    g.current_color=card[0];g.discard_pile=["r7"];
    g.turn_cards=[];g.turn_mode=null;g.turn_step=0;g.has_drawn=false;
    g.drawn_card=null;g.pending_draw=0;g.nine=null;g.turn_started_at=Date.now();
    g.bot_move=null;g.bot_cut=null;g.skip_reaction=null;g.wild_pending_color=null;
  }
  function play(player,card){
    prepare(player,card);
    return call("play_card",{p_token:player.token,p_code:code,p_card:card});
  }
  return {players,room,g,code,prepare,play};
}

test("Barata: há exatamente uma original por cor, quatro cadeias distintas e 232 cartas",()=>{
  const first=newDeck(),second=newDeck();
  assert.equal(first.length,232);
  for(const color of ["r","y","g","b"]){
    const originals=first.filter(c=>isRoach(c)&&c[0]===color);
    assert.equal(originals.length,1,color);
    assert.equal(cardValue(originals[0]),"A");
    assert.ok(!second.includes(originals[0]),"novo baralho inicia uma cadeia com novo ID");
  }
  assert.equal(new Set(first.filter(isRoach).map(roachChainId)).size,4);
  assert.equal(first.filter(isRoach).length,4);
  const r=makeRoach("r"),g=makeRoach("g");
  assert.equal(playable(g,r,"r"),true,"tipos Barata combinam mesmo entre cadeias distintas");
  assert.equal(playable(r,"r7","r"),true);
  assert.equal(playable(r,"b7","g"),false);
});

for(const numberOfPlayers of [2,3,4,20]){
  test(`Barata: cadeia independente circula por ${numberOfPlayers} jogadores, sem repetição nem retorno ao iniciador`,()=>{
    const {players,room,g,play}=match(numberOfPlayers),origin=players[0];
    const first=makeRoach("r"),id=roachChainId(first);
    room.hands.get(origin.guest_id).cards=[first,"y7","g2"];
    let actor=origin,card=first;
    const visited=new Set();
    for(let i=0;i<numberOfPlayers-1;i++){
      const transferCount=g.effects.filter(e=>e.type==="roach").length;
      play(actor,card);
      const chain=g.roach_chains[id],recent=g.effects.filter(e=>e.type==="roach").at(-1);
      assert.equal(g.effects.filter(e=>e.type==="roach").length,transferCount+1);
      assert.equal(chain.origin,origin.guest_id);
      assert.ok(recent.target&&recent.target!==origin.guest_id,"iniciador nunca recebe");
      assert.ok(!visited.has(recent.target),"o mesmo jogador nunca recebe duas vezes");
      assert.notEqual(recent.target,actor.guest_id,"cópia nunca volta a quem a jogou");
      assert.equal(recent.chain_id,id);
      assert.ok(["r","y","g","b"].includes(recent.copy_color));
      assert.deepEqual(new Set(chain.received),new Set([...visited,recent.target]));
      visited.add(recent.target);
      const next=players.find(p=>p.guest_id===recent.target);
      const copies=room.hands.get(next.guest_id).cards.filter(c=>isRoach(c)&&roachChainId(c)===id);
      assert.equal(copies.length,1);
      assert.equal(copies[0][0],recent.copy_color,"cor sorteada acompanha a cópia");
      assert.equal(chain.completed,false);
      actor=next;card=copies[0];
    }
    assert.equal(visited.size,numberOfPlayers-1);
    assert.equal(visited.has(origin.guest_id),false);
    const beforeCount=[...room.hands.values()].reduce((n,h)=>n+h.cards.filter(c=>roachChainId(c)===id).length,0);
    assert.equal(beforeCount,1,"em uma cadeia ativa existe somente uma cópia na mão");
    play(actor,card);
    assert.equal(g.roach_chains[id].completed,true,"última Barata não se replica");
    assert.equal(g.effects.filter(e=>e.type==="roach_end"&&e.chain_id===id).length,1);
    assert.equal(g.effects.filter(e=>e.type==="roach").length,numberOfPlayers-1);
    assert.equal([...room.hands.values()].flatMap(h=>h.cards).filter(c=>roachChainId(c)===id).length,0);
  });
}
test("Barata pode criar uma cópia da própria cor original",()=>{
  const {players,room,g,play}=match(2),first=makeRoach("r");
  room.hands.get(players[0].guest_id).cards=[first,"g2"];
  const old=crypto.randomInt;
  try{
    crypto.randomInt=()=>0; // COLORS[0] = vermelho; destino único.
    play(players[0],first);
  }finally{crypto.randomInt=old;}
  const event=g.effects.filter(e=>e.type==="roach").at(-1);
  assert.equal(event.copy_color,"r");
  assert.equal(room.hands.get(players[1].guest_id).cards.some(c=>isRoach(c)&&c[0]==="r"&&roachChainId(c)===roachChainId(first)),true);
});
test("Baratas originais diferentes mantêm histórico completamente independente",()=>{
  const {players,room,g,play}=match(3),[a,b,c]=players;
  const red=makeRoach("r"),blue=makeRoach("b"),redId=roachChainId(red),blueId=roachChainId(blue);
  room.hands.get(a.guest_id).cards=[red,blue,"y8"];
  play(a,red);
  const redSeen=[...g.roach_chains[redId].received];
  assert.equal(redSeen.length,1);
  play(a,blue);
  assert.equal(g.roach_chains[blueId].origin,a.guest_id);
  assert.equal(g.roach_chains[blueId].received.length,1);
  assert.equal(g.roach_chains[redId].received.length,1);
  assert.notEqual(redId,blueId);
  // Distinct chains can choose the same recipient, but never twice within one chain.
  assert.ok([b.guest_id,c.guest_id].includes(g.roach_chains[blueId].received[0]));
  assert.deepEqual(g.roach_chains[redId].received,redSeen);
});
test("Vórtice que joga uma Barata também envia a cópia e mantém o histórico",()=>{
  const {players,room,g,play}=match(3),[a,b,c]=players;
  const card=makeRoach("b"),id=roachChainId(card);
  room.hands.get(a.guest_id).cards=["bV",card,"g8","r4"];
  play(a,"bV");
  assert.ok(g.vortex_queue,"a primeira jogada abre uma fila de Vórtice");
  g.vortex_queue.next_at=Date.now()-1;
  assert.doesNotThrow(()=>proSweep());
  const transfer=g.effects.filter(e=>e.type==="roach"&&e.chain_id===id).at(-1);
  assert.ok(transfer);
  assert.equal(transfer.by,a.guest_id);
  assert.ok([b.guest_id,c.guest_id].includes(transfer.target));
  assert.equal(g.roach_chains[id].received[0],transfer.target);
  assert.equal(g.card_moves.at(-1).card,card,"cópia não altera a identidade física da Barata jogada");
});
test("histórico da Barata sobrevive ao salvamento e à restauração do servidor",()=>{
  const {players,room,g,code,play}=match(3),a=players[0],card=makeRoach("g");
  room.hands.get(a.guest_id).cards=[card,"r5"];
  play(a,card);
  const id=roachChainId(card),seen=[...g.roach_chains[id].received];
  const snapshot=JSON.parse(JSON.stringify(serializeState()));
  hydrateState(snapshot);
  const restored=store.roomsByCode.get(code);
  assert.deepEqual(restored.game.roach_chains[id].received,seen);
  const target=players.find(p=>p.guest_id===seen[0]);
  const copy=restored.hands.get(target.guest_id).cards.find(c=>roachChainId(c)===id);
  assert.ok(copy);
  const gg=restored.game;
  gg.turn_idx=gg.turn_order.indexOf(target.guest_id);
  gg.turn_cards=[];gg.turn_mode=null;gg.turn_step=0;gg.has_drawn=false;gg.pending_draw=0;gg.nine=null;
  gg.current_color=copy[0];gg.discard_pile=["r2"];
  assert.doesNotThrow(()=>call("play_card",{p_token:target.token,p_code:code,p_card:copy}));
  assert.equal(gg.roach_chains[id].received.length,2,"o próximo jogador recebe, sem reiniciar a cadeia");
});
test("baralho configurado sem Barata nunca a introduz, inclusive ao renovar",()=>{
  const deck=newDeck({A:false});
  assert.equal(deck.length,228);
  assert.equal(deck.some(isRoach),false);
  const fresh=newDeck();
  assert.equal(fresh.length,232);
});

test("duas Baratas de cadeias distintas podem ser jogadas na sequência de repetidas",()=>{
  const {players,room,g,prepare,code}=match(3),a=players[0];
  const red=makeRoach("r"),green=makeRoach("g");
  room.hands.get(a.guest_id).cards=[red,green,"y8"];
  prepare(a,red);
  call("play_card",{p_token:a.token,p_code:code,p_card:red});
  assert.equal(g.turn_cards.length,1);
  assert.doesNotThrow(()=>call("play_card",{p_token:a.token,p_code:code,p_card:green}));
  assert.equal(g.turn_cards.length,2);
  assert.equal(g.turn_mode,"repeat");
  assert.equal(g.roach_chains[roachChainId(red)].received.length,1);
  assert.equal(g.roach_chains[roachChainId(green)].received.length,1);
});

test("corte aceita Baratas visualmente iguais mesmo quando pertencem a cadeias distintas",()=>{
  const {players,room,g,code}=match(3),[a,b]=players;
  const played=makeRoach("r"),other=makeRoach("r");
  assert.notEqual(roachChainId(played),roachChainId(other));
  g.turn_idx=g.turn_order.indexOf(a.guest_id);
  g.turn_cards=[];g.turn_mode=null;g.turn_step=0;g.has_drawn=false;
  g.pending_draw=0;g.nine=null;g.skip_reaction=null;
  g.current_color="r";g.discard_pile=[played];
  room.hands.get(b.guest_id).cards=[other,"g2","y4"];
  const result=call("play_card",{p_token:b.token,p_code:code,p_card:other});
  assert.equal(result.ok,true);
  assert.equal(g.turn_order[g.turn_idx],b.guest_id,"o corte rouba a vez");
  assert.equal(g.card_moves.at(-1).card,other,"mantém a identidade física da própria cadeia");
  assert.equal(g.roach_chains[roachChainId(other)].origin,b.guest_id);
  assert.notEqual(g.roach_chains[roachChainId(other)].origin,a.guest_id);
});

test("receber Barata desfaz UNO gritado e a contagem aumenta corretamente",()=>{
  const {players,room,g,play}=match(2),[a,b]=players;
  const first=makeRoach("y");
  room.hands.get(a.guest_id).cards=[first,"g4"];
  const recipient=room.hands.get(b.guest_id);
  recipient.cards=["b3"];recipient.uno_called=true;recipient.uno_since=null;
  recipient.bot_uno_plan={since:Date.now(),due:Date.now()+8000};
  play(a,first);
  assert.equal(recipient.cards.length,2);
  assert.equal(recipient.uno_called,false);
  assert.equal(recipient.uno_since,null);
  assert.equal(recipient.bot_uno_plan,null);
  const snapshot=call("get_room_state",{p_token:b.token,p_code:room.code});
  assert.equal(snapshot.game.my_hand.length,2);
  assert.equal(snapshot.members.find(x=>x.id===b.guest_id).card_count,2);
  assert.ok(g.effects.some(e=>e.type==="roach"&&e.target===b.guest_id));
});
