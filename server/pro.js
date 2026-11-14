// Additional UNO Pro rules for the standalone Node/Render server.
import crypto from "node:crypto";
import {rpc as originalRpc, RPC_NAMES as basicNames, store, newDeck, LIMITS, sweep as basicSweep, onBump as basicOnBump, RpcError} from "./game.js";
const DEFAULT_RULES = Object.freeze({ repeat:true, sequence:true, nine:true, cut:true, stack:true });
export const BOT_NAMES = Object.freeze([
  "Sr. Batata", "Dona Pipoca", "Capitão Picles", "Rei da Coxinha",
  "Mestre Mingau", "Tio Wi-Fi", "Baronesa Biscoito", "Zé Marmita",
  "Doutor Pudim", "Professor Paçoca", "Ninja do Pastel", "Lady Farofa",
  "Major Tapioca", "Tubarão de Chinelo", "Conde do Ketchup",
  "Vovó Turbina", "Pinguim Atômico", "Mago do Miojo",
  "Café Sem Filtro", "Lorde Abacaxi"
]);
export function chooseBotMoveDelay(difficulty, random=Math.random) {
  const fast = random()< (difficulty==="hard" ? 0.80 : 0.20);
  return fast?5000:11000;
}
const stateRules = input => Object.fromEntries(Object.keys(DEFAULT_RULES).map(k => [k,typeof input?.[k] === "boolean" ? input[k] : true]));
const fail = (message, status=400) => {throw new RpcError(message,status)};
const clock = () => Date.now();
const isDraw = c => c?.slice(1)==="D" || c?.slice(1)==="T" || c==="W4";
export function chooseNineDelay(difficulty, random=Math.random) {
  const r=random();
  return difficulty==="hard" ? (r<.10?0:r<.50?2000:5000) : (r<.30?0:8000);
}
export function chooseCutDelay(difficulty, random=Math.random) {
  if(difficulty!=="hard")return 40000;
  return random()<.10?10000:25000;
}
const weight = c => c==="W5" ? 5 : c==="W4" ? 4 : c?.slice(1)==="D" || c?.slice(1)==="T" ? 2 : 0;
const value = c => c==="W"||c==="W4"||c==="W5" ? c : c.slice(1);
const wild = c => c==="W"||c==="W4"||c==="W5";
const playable=(c,g)=>wild(c)||c[0]===g.current_color||(!wild(top(g)) && value(c)===value(top(g)));
const top=g=>g.discard_pile.at(-1);
const advance=(idx,dir,steps,n)=>(idx+dir*steps%n+n*100)%n;
const name=id=>store.guestsById.get(id)?.nickname||"Jogador";
const isBot=id=>!!store.guestsById.get(id)?.bot;
const current=g=>g.turn_order[g.turn_idx];
const stamp = n => new Date(n).toISOString();
let send=()=>{};
export function onBumpPro(fn){send=fn;basicOnBump(fn);}
function bump(room,lobby=false){room.version=(room.version||0)+1;send("room",room.code);if(lobby)send("lobby");}
function member(room,id){return room.members.some(m=>m.guest_id===id);}
function authenticate(token){const me=originalRpc("whoami",{p_token:token});return store.guestsById.get(me.guest_id);}
function find(code){const r=store.roomsByCode.get(String(code||"").trim().toUpperCase());if(!r)fail("ROOM_NOT_FOUND",404);return r;}
function guard(args){const me=authenticate(args.p_token),r=find(args.p_code);if(!member(r,me.id))fail("NOT_MEMBER",403);return {me,r};}
function game(r){if(!r.game||r.game.status!=="playing")fail("GAME_NOT_ACTIVE");return r.game;}
function ready(room){if(!room.rules)room.rules={...DEFAULT_RULES};return room.rules;}
function hand(room,id){const h=room.hands.get(id);if(!h)fail("NOT_MEMBER",403);return h;}
function draw(room,id,n){const g=room.game,h=hand(room,id),got=[];
  for(let k=0;k<n;k++){if(!g.draw_pile.length){g.draw_pile=newDeck();}
    const card=g.draw_pile.shift();if(card)got.push(card);}
  h.cards.push(...got);h.uno_called=false;h.uno_since=null;h.bot_uno_plan=null;return got;}
function shuffle(a){const b=[...a];for(let k=b.length-1;k>0;k--){const j=crypto.randomInt(k+1);[b[k],b[j]]=[b[j],b[k]];}return b;}
// A +5 is always stackable only by another +5. It can also answer +2/+4.
const canCounter=(g,c)=>g.pending_uncounterable ? c==="W5" : (isDraw(c)||c==="W5");
const counter=(r,id)=>hand(r,id).cards.some(c=>canCounter(r.game,c));
function planBotCut(r,source) {
  const g=r.game;
  if(!g || g.status!=="playing")return;
  const topCard=top(g),start=clock();
  const due={};
  if(ready(r).cut)for(const id of g.turn_order) {
    if(id===source || !isBot(id) || !hand(r,id).cards.includes(topCard))continue;
    const difficulty=store.guestsById.get(id)?.difficulty;
    due[id]=start+chooseCutDelay(difficulty);
  }
  g.bot_cut={top:topCard,source,at:start,due};
}
function botCutTick(r) {
  const g=r.game,w=g?.bot_cut;
  if(!w || g.status!=="playing" || g.nine || actionLocked(g) || !ready(r).cut || w.top!==top(g))return;
  for(const [id,due] of Object.entries(w.due)) {
    if(clock()<due || id===current(g) || !g.turn_order.includes(id) || !hand(r,id).cards.includes(w.top))continue;
    if(g.pending_draw && !canCounter(g,w.top))continue;
    try {
      const counts={r:0,y:0,g:0,b:0};
      for(const card of hand(r,id).cards)if(counts[card[0]]!==undefined)counts[card[0]]++;
      const color=Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];
      play(r,id,w.top,color);
      if(g.status==="playing" && current(g)===id) finish(r);
    } catch (e) { if(!(e instanceof RpcError))throw e; }
    break;
  }
}
function nextTurn(g,idx){
  g.turn_idx=idx;g.turn_cards=[];g.turn_mode=null;g.turn_step=0;g.has_drawn=false;g.drawn_card=null;
  const now=clock();
  // Do not consume the 60-second turn clock during queued 5-second notifications.
  g.turn_started_at=Math.max(now,g.visual_until||now);
  g.bot_move=null; // The next bot turn draws its delay exactly once.
}
function activeNotification(g,at=clock()) {
  return (g.effects||[]).find(e=>e.show_at<=at && at<e.show_at+5000);
}
function actionLocked(g,at=clock()) {
  const e=activeNotification(g,at);
  return !!e && at<e.show_at+2000;
}
function assertActionOpen(r) {
  if(actionLocked(r.game))fail("ANNOUNCEMENT_WAIT",409);
}
function announceUno(r,id) {
  const g=r.game,h=hand(r,id);
  if(h.uno_called || !(h.cards.length===1 || (h.cards.length===2 && current(g)===id)))return;
  h.uno_called=true;h.uno_since=null;h.bot_uno_plan=null;
  effect(r,"uno",id,null,null);
  g.last_action={type:"uno",by:id,name:name(id)};
  g.seq++;bump(r);
}
export function chooseBotUnoDelay(difficulty,random=Math.random){
  if(difficulty==="hard")return 0;
  const roll=random();
  return roll<.20?0:roll<.80?8000:null; // null = forget to shout UNO
}
function catchUnoBy(r,actor,delayMs) {
  const g=r.game,caught=[];
  for(const m of r.members){
    if(m.guest_id===actor)continue;
    const h=r.hands.get(m.guest_id);
    if(h && h.cards.length===1 && !h.uno_called && h.uno_since &&
       clock()-h.uno_since>=delayMs){
      draw(r,m.guest_id,2);
      h.bot_uno_plan=null;
      caught.push(m.guest_id);
    }
  }
  if(caught.length){
    for(const id of caught)effect(r,"catch",actor,null,null,{target:id,target_name:name(id),n:2});
    g.last_action={type:"catch",by:actor,name:name(actor),target:caught[0],target_name:name(caught[0]),n:2,count:caught.length};
    g.seq++;bump(r);
  }
  return caught;
}
function botUnoAndCatchTick(r) {
  const g=r.game;
  if(!g || g.status!=="playing")return;
  // Plan each UNO shout exactly once, when the bot first reaches one card.
  for(const m of r.members){
    const id=m.guest_id,h=r.hands.get(id);
    if(!h || !isBot(id))continue;
    if(h.cards.length!==1 || h.uno_called || !h.uno_since){
      h.bot_uno_plan=null;continue;
    }
    if(!h.bot_uno_plan || h.bot_uno_plan.since!==h.uno_since){
      const delay=chooseBotUnoDelay(store.guestsById.get(id)?.difficulty);
      h.bot_uno_plan={since:h.uno_since,due:delay===null?null:h.uno_since+delay};
    }
    if(h.bot_uno_plan.due!==null && clock()>=h.bot_uno_plan.due)
      announceUno(r,id);
  }
  // Easy bots notice after 15 seconds, difficult bots after four. Humans
  // keep their existing eight-second window plus the five-second hold.
  for(const m of r.members){
    const id=m.guest_id;
    if(!isBot(id))continue;
    const delay=store.guestsById.get(id)?.difficulty==="hard"?4000:15000;
    catchUnoBy(r,id,delay);
  }
}
function effect(r,kind,by,card,color,details={}){
  const g=r.game,now=clock();
  // Events display in the same order on every client, each for five seconds.
  const show_at=Math.max(now,g.visual_until||now);
  g.visual_until=show_at+5000;
  // Keep previously elapsed turn time unchanged while the notification is visible.
  if(g.status==="playing") {
    g.turn_started_at=(g.turn_started_at??now)+5000;
    if(g.bot_move)g.bot_move.due+=5000;
  }
  const event={id:++g.event_seq,type:kind,by,name:name(by),card:card||null,color:color||null,at:now,show_at,...details};
  g.effects.push(event);if(g.effects.length>64)g.effects.shift();
}
function rememberDraw(r,id,card){
  if(!card)return;
  const g=r.game;
  g.last_draw_by_id ??= {};
  g.draw_nonce=(g.draw_nonce||0)+1;
  g.last_draw_by_id[id]={card,nonce:g.draw_nonce,at:clock()};
}
function finishNine(r){const g=r.game,n=g?.nine;if(!n)return;
  const missing=n.eligible.filter(id=>!n.pressed.includes(id));
  const expired=clock()>=n.deadline;
  // The challenge itself is not deducted from the next player\u0027s 60 seconds.
  g.turn_started_at+=Math.max(0,clock()-(n.started_at||clock()));
  // As soon as only one person hasn't pressed, they have already lost.
  if(missing.length>1 && !expired)return;
  const losers=missing.length
    ? (expired ? missing : [missing[0]])
    : [n.pressed.at(-1)].filter(Boolean);
  for(const id of losers) {
    draw(r,id,n.count);
    effect(r,"penalty",id,null,null,{target:id,target_name:name(id),n:n.count});
  }
  g.nine=null;
  g.last_action={type:"nine",by:n.source,name:name(n.source),target:losers[0]||null,
    target_name:losers.length===1?name(losers[0]):losers.map(name).join(", "),
    targets:losers,n:n.count,count:losers.length};
  g.seq++;bump(r);resolveDebt(r);
}
function resolveDebt(r){const g=r.game;if(!g||!g.pending_draw||g.nine)return;
  if(g.turn_cards?.length)return; // A player already responded; never charge them during an unfinished combo.
  if((g.pending_uncounterable || ready(r).stack) && counter(r,current(g)))return;
  const loser=current(g),n=g.pending_draw,attacker=g.pending_source||loser;
  draw(r,loser,n);g.pending_draw=0;g.pending_uncounterable=false;g.pending_source=null;
  g.last_action={type:"stack_take",by:loser,name:name(loser),n};
  effect(r,"penalty",attacker,null,null,{target:loser,target_name:name(loser),n});g.seq++;
  nextTurn(g,advance(g.turn_idx,g.direction,1,g.turn_order.length));bump(r);
}
function finish(r,automatic=false,deferDebt=false){const g=game(r);if(g.nine)fail("NINE_ACTIVE");
  const actor=current(g),cards=g.turn_cards||[],n=g.turn_order.length;
  if(!cards.length){
    if(g.pending_draw){const owed=g.pending_draw,attacker=g.pending_source||actor;draw(r,actor,owed);g.pending_draw=0;g.pending_uncounterable=false;g.pending_source=null;g.last_action={type:"stack_take",by:actor,name:name(actor),n:owed};effect(r,"penalty",attacker,null,null,{target:actor,target_name:name(actor),n:owed});}
    else {if(!g.has_drawn)draw(r,actor,1);g.last_action={type:automatic?"auto":"pass",by:actor,name:name(actor)};}
    nextTurn(g,advance(g.turn_idx,g.direction,1,n));g.seq++;bump(r);return;
  }
  let dir=g.direction,skips=0,added=0,hasFive=false;
  for(const card of cards){const v=value(card);
    if(v==="R"){if(n===2)skips++;else dir*=-1;}
    else if(v==="S")skips++;
    else if(v==="T"){dir*=-1;added+=2;}
    else if(isDraw(card)||card==="W5"){added+=weight(card);if(card==="W5")hasFive=true;}
  }
  if(g.pending_draw && !added)fail("MUST_COUNTER_OR_DRAW");
  const nines=cards.slice().reverse().findIndex(c=>value(c)!=="9");
  const trailingNines=nines<0?cards.length:nines;
  g.direction=dir;g.pending_draw+=added;
  if(added>0)g.pending_source=actor;
  if(hasFive)g.pending_uncounterable=true;
  g.last_action={type:"end",by:actor,name:name(actor),count:cards.length};g.seq++;
  nextTurn(g,advance(g.turn_idx,dir,1+skips,n));
  if(trailingNines && ready(r).nine && n>=3){const eligible=g.turn_order.filter(id=>id!==actor),start=clock();
    const botTimes={};
    for(const id of eligible)if(isBot(id))botTimes[id]=start+chooseNineDelay(store.guestsById.get(id)?.difficulty);
    // 8s easy bots still have time to respond, with a short network/sweep grace period.
    g.nine={source:actor,count:trailingNines,eligible,pressed:[],botTimes,started_at:start,deadline:start+9200};}
  bump(r);if(!g.nine&&!deferDebt)resolveDebt(r);
}
function play(r,id,card,color){
  const g=game(r),rules=ready(r),h=hand(r,id);let series=g.turn_cards||[];
  const cutting=current(g)!==id;
  // The first card (or an out-of-turn cut) waits two seconds. Once a turn
  // has begun, its remaining cards and End Turn stay usable during the notice.
  if((cutting || series.length===0) && actionLocked(g))assertActionOpen(r);
  if(g.nine)fail("NINE_ACTIVE");
  if(!h.cards.includes(card)||!(/^(?:[rygb](?:[0-9]|S|R|D|T)|W|W4|W5)$/).test(card))fail("CARD_NOT_IN_HAND");
  const cutVictim=cutting?current(g):null;
  if(cutting){
    const debt=g.pending_draw>0;
    if(!rules.cut||!g.turn_order.includes(id)||card!==top(g))fail("CUT_NOT_ALLOWED");
    if(debt && !canCounter(g,card))fail("CUT_NOT_ALLOWED");
    if(series.length)finish(r,false,true);
    if(g.status!=="playing"||g.nine||(g.pending_draw && !canCounter(g,card)))fail("CUT_NOT_ALLOWED");
    nextTurn(g,g.turn_order.indexOf(id));series=[];
  }
  if(g.pending_draw && !series.length && !canCounter(g,card))fail("MUST_COUNTER_OR_DRAW");
  // After buying, the player may select ANY compatible card from their hand.
  if(!series.length){if(!g.pending_draw && !playable(card,g))fail("INVALID_CARD");}
  else{
    const first=series[0],prev=series.at(-1);
    const same=value(first)===value(card);
    const a=Number(value(card)),b=Number(value(prev));
    const delta=a-b;const run=/^[0-9]$/.test(value(card))&&/^[0-9]$/.test(value(prev))&&card[0]===prev[0]&&Math.abs(delta)===1&&(!g.turn_step||Math.sign(delta)===g.turn_step);
    if(g.turn_mode==="repeat"){if(!same)fail("INVALID_COMBO");}
    else if(g.turn_mode==="sequence"){if(!run)fail("INVALID_COMBO");}
    else if(same&&rules.repeat)g.turn_mode="repeat";
    else if(run&&rules.sequence){g.turn_mode="sequence";g.turn_step=Math.sign(delta);}
    else fail("INVALID_COMBO");
  }
  if(wild(card)&&!["r","y","g","b"].includes(color))fail("COLOR_REQUIRED");
  h.cards.splice(h.cards.indexOf(card),1);
  if(h.cards.length===1&&!h.uno_called){h.uno_since=clock();h.bot_uno_plan=null;}
  else if(h.cards.length!==1){h.uno_called=false;h.uno_since=null;h.bot_uno_plan=null;}
  g.discard_pile.push(card);g.current_color=wild(card)?color:card[0];
  g.turn_cards=[...series,card];
  g.last_action={type:cutting?"cut":"play",by:id,name:name(id),card,color:g.current_color,left:h.cards.length};
  g.seq++;
  const kind=wild(card)?"color_wave":
    value(card)==="R"?"reverse":value(card)==="S"?"skip":null;
  if(cutting && cutVictim)effect(r,"cut",id,card,g.current_color,{target:cutVictim,target_name:name(cutVictim)});
  if(kind){
    const details={};
    if(kind==="skip"){
      const prior=g.turn_cards.slice(0,-1);
      let dir=g.direction;
      if(g.turn_order.length>2 && prior.filter(c=>value(c)==="R").length%2)dir*=-1;
      const blocked=g.turn_order[advance(g.turn_idx,dir,1,g.turn_order.length)];
      details.target=blocked;details.target_name=name(blocked);
    }
    effect(r,kind,id,card,g.current_color,details);
  }
  planBotCut(r,id);
  bump(r);
  if(h.cards.length===0){g.status="finished";g.winner_id=id;g.last_action.win=true;g.pending_draw=0;g.nine=null;
    r.status="waiting";bump(r,true);return {ok:true,won:true};}
  return {ok:true};
}
function botTick(r){
  const g=r.game;
  if(!g||g.status!=="playing"||g.nine||!isBot(current(g)))return;
  const id=current(g),h=hand(r,id),bot=store.guestsById.get(id),rules=ready(r);
  if(!g.bot_move || g.bot_move.id!==id) {
    g.bot_move={id,due:g.turn_started_at+chooseBotMoveDelay(bot.difficulty)};
  }
  if(clock()<g.bot_move.due || actionLocked(g))return;
  if(g.pending_draw&&!counter(r,id)){finish(r,true);return;}
  let options=h.cards.filter(c=>g.pending_draw?canCounter(g,c):playable(c,g));
  if(!options.length&&!g.pending_draw){const drawn=draw(r,id,1)[0];g.has_drawn=true;g.drawn_card=drawn||null;rememberDraw(r,id,drawn);
    if(drawn&&playable(drawn,g))options=[drawn];}
  const score=c=>{const match=h.cards.filter(x=>x!==c&&value(x)===value(c)).length;
    const run=h.cards.filter(x=>x[0]===c[0]&&/^[0-9]$/.test(value(x))&&/^[0-9]$/.test(value(c))&&Math.abs(Number(value(x))-Number(value(c)))===1).length;
    return match*4+run*2+weight(c)*3+(value(c)==="S"?4:0)+(value(c)==="R"?2:0)-(wild(c)?2:0);};
  options.sort((a,b)=>score(b)-score(a));
  let pick=bot.difficulty==="hard"||Math.random()<0.6?options[0]:options[Math.floor(Math.random()*options.length)];
  const chooseColor=()=>{const counts={r:0,y:0,g:0,b:0};h.cards.forEach(c=>{if(counts[c[0]]!==undefined)counts[c[0]]++});
    return Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];};
  if(pick){play(r,id,pick,chooseColor());
    for(let i=0;i<10&&g.status==="playing"&&!actionLocked(g);i++){const series=g.turn_cards,first=series[0],prev=series.at(-1);
      const combos=h.cards.filter(c=>{const same=value(first)===value(c),delta=Number(value(c))-Number(value(prev));
        const run=/^\d$/.test(value(c))&&/^\d$/.test(value(prev))&&c[0]===prev[0]&&Math.abs(delta)===1&&(!g.turn_step||Math.sign(delta)===g.turn_step);
        return g.turn_mode==="repeat"?same:g.turn_mode==="sequence"?run:(same&&rules.repeat)||(run&&rules.sequence);});
      if(!combos.length)break;combos.sort((a,b)=>score(b)-score(a));play(r,id,combos[0],chooseColor());
    }
  }
  if(g.status==="playing")finish(r);
}
let lastBasicSweep=0;
export function proSweep(){LIMITS.autoPassMs=60_000;const time=clock();
  for(const r of store.rooms.values()){
    for(const m of r.members){const b=store.guestsById.get(m.guest_id);if(b?.bot)b.last_seen=time;}
    const g=r.game;
    if(!g||g.status!=="playing")continue;
    if(g.nine){
      for(const [id,due] of Object.entries(g.nine.botTimes||{})){
        if(!g.nine.pressed.includes(id) && time>=due && time<g.nine.deadline){
          g.nine.pressed.push(id);g.seq++;bump(r);
        }
      }
      if(time>=g.nine.deadline||g.nine.eligible.filter(id=>!g.nine.pressed.includes(id)).length<=1)finishNine(r);
    }
    if(g.nine)continue;
    botUnoAndCatchTick(r);
    botCutTick(r);
    resolveDebt(r);
    if(g.status!=="playing")continue;
    // Auto-draw once when there is no playable card anywhere in the hand.
    if(!actionLocked(g)&&!g.pending_draw&&!g.has_drawn&&!g.turn_cards?.length&&!isBot(current(g))){
      const id=current(g),h=hand(r,id);
      if(!h.cards.some(c=>playable(c,g))){
        const drawn=draw(r,id,1)[0]||null;g.has_drawn=true;g.drawn_card=drawn;
        rememberDraw(r,id,drawn);
        g.last_action={type:"auto_draw",by:id,name:name(id)};
        g.seq++;bump(r);
        if(!drawn||!playable(drawn,g))finish(r,true);
      }
    }
    botTick(r);
    if(g.status==="playing"&&time-g.turn_started_at>=60_000)finish(r,true);
  }
  if(time-lastBasicSweep>=3000){lastBasicSweep=time;basicSweep();}
}
export const RPC_NAMES=[...new Set([...basicNames,"end_turn","accept_draw","press_nine","add_bot","remove_bot"])];
export function proRpc(fn,args={}){
  if(fn==="create_room"){
    const count=args.p_starting_cards===undefined?8:args.p_starting_cards;
    if(!Number.isInteger(count)||count<2||count>20)fail("INVALID_STARTING_CARDS");
    const result=originalRpc(fn,args),r=find(result.code);
    r.rules=stateRules(args.p_rules);r.initial_cards=count;
    return result;
  }
  if(fn==="start_game"){const result=originalRpc(fn,args),r=find(args.p_code),g=r.game;
    Object.assign(g,{turn_cards:[],turn_mode:null,turn_step:0,pending_draw:0,pending_uncounterable:false,pending_source:null,nine:null,effects:[],event_seq:0,last_draw_by_id:{},draw_nonce:0,bot_cut:null,bot_move:null,visual_until:0});
    planBotCut(r,null);
    for(const h of r.hands.values())h.uno_since=null;
    return result;
  }
  if(fn==="get_room_state"){const result=originalRpc(fn,args),r=find(args.p_code),g=r.game;result.room.rules=ready(r);result.room.initial_cards=r.initial_cards??8;
    result.members=result.members.map(m=>({ ...m,bot:isBot(m.id),difficulty:store.guestsById.get(m.id)?.difficulty||null}));
    if(g&&result.game){result.game.turn_cards=[...(g.turn_cards||[])];result.game.pending_draw=g.pending_draw||0;
      result.game.nine=g.nine?{source:g.nine.source,count:g.nine.count,eligible:[...g.nine.eligible],pressed:[...g.nine.pressed],deadline:stamp(g.nine.deadline)}:null;
      result.game.effects=[...(g.effects||[])];
      result.game.action_locked_until=activeNotification(g) && actionLocked(g)
        ? stamp(activeNotification(g).show_at+2000) : null;
      result.game.last_draw=g.last_draw_by_id?.[result.me]?{...g.last_draw_by_id[result.me],at:stamp(g.last_draw_by_id[result.me].at)}:null;
      result.game.pending_uncounterable=!!g.pending_uncounterable;
      result.game.can_catch_uno=r.members.some(m=>m.guest_id!==result.me&&r.hands.get(m.guest_id)?.cards.length===1&&!r.hands.get(m.guest_id)?.uno_called&&clock()-(r.hands.get(m.guest_id)?.uno_since||clock())>=8000);
      result.members=result.members.map(m=>({...m,uno_since:r.hands.get(m.id)?.uno_since?stamp(r.hands.get(m.id).uno_since):null}));}
    return result;
  }
  if(fn==="add_bot"){const {me,r}=guard(args);if(r.host_id!==me.id)fail("NOT_HOST");if(r.status!=="waiting")fail("GAME_STARTED");
    if(r.members.length>=r.max_players)fail("ROOM_FULL");
    const id=crypto.randomUUID(),t=clock(),difficulty=args.p_difficulty==="hard"?"hard":"easy";
    const taken=new Set(r.members.map(m=>name(m.guest_id).toLocaleLowerCase("pt-BR")));
    const choices=BOT_NAMES.filter(n=>!taken.has(n.toLocaleLowerCase("pt-BR")));
    if(!choices.length)fail("ROOM_FULL");
    const nickname=choices[crypto.randomInt(choices.length)];
    const bot={id,tokenHash:"bot:"+id,nickname,last_seen:t,bot:true,difficulty};
    store.guestsById.set(id,bot);r.members.push({guest_id:id,joined_at:Math.max(t,(r.members.at(-1)?.joined_at||0)+1)});bump(r,true);return {id};
  }
  if(fn==="remove_bot"){const {me,r}=guard(args);if(r.host_id!==me.id)fail("NOT_HOST");if(r.status!=="waiting")fail("GAME_STARTED");
    const id=args.p_bot_id;if(!member(r,id)||!isBot(id))fail("NOT_BOT");r.members=r.members.filter(m=>m.guest_id!==id);store.guestsById.delete(id);bump(r,true);return {ok:true};}
  if(fn==="play_card"){const {me,r}=guard(args);return play(r,me.id,args.p_card,args.p_color);}
  if(fn==="end_turn"||fn==="pass_turn"){const {me,r}=guard(args),g=game(r);if(current(g)!==me.id)fail("NOT_YOUR_TURN");finish(r);return {ok:true};}
  if(fn==="draw_card"){const {me,r}=guard(args),g=game(r);if(current(g)!==me.id)fail("NOT_YOUR_TURN");assertActionOpen(r);
    if(g.nine)fail("NINE_ACTIVE");if(g.pending_draw)fail("MUST_COUNTER_OR_DRAW");
    if(g.turn_cards?.length)fail("ALREADY_PLAYED");if(g.has_drawn)fail("ALREADY_DRAWN");
    const hadPlayable=hand(r,me.id).cards.some(c=>playable(c,g));
    const card=draw(r,me.id,1)[0]||null;g.has_drawn=true;g.drawn_card=card;rememberDraw(r,me.id,card);
    g.last_action={type:"draw",by:me.id,name:me.nickname};g.seq++;bump(r);
    const canPlayDrawn=!!card&&playable(card,g);
    if(!hadPlayable&&!canPlayDrawn)finish(r,true);
    return {card,playable:canPlayDrawn,auto_passed:!hadPlayable&&!canPlayDrawn};}
  if(fn==="accept_draw"){const {me,r}=guard(args),g=game(r);if(current(g)!==me.id)fail("NOT_YOUR_TURN");
    if(!g.pending_draw||g.turn_cards.length)fail("NOTHING_TO_ACCEPT");const n=g.pending_draw;finish(r);return {ok:true,n};}
  if(fn==="call_uno"){const {me,r}=guard(args),g=game(r),h=hand(r,me.id);
    if(!(h.cards.length===1||(h.cards.length===2&&current(g)===me.id)))fail("UNO_NOT_ALLOWED");
    if(!h.uno_called){announceUno(r,me.id);}return {ok:true};}
  if(fn==="catch_uno"){
    const {me,r}=guard(args);game(r);
    const caught=catchUnoBy(r,me.id,8000);
    if(!caught.length)fail("CATCH_NOT_ALLOWED");
    return {ok:true,count:caught.length};
  }
  if(fn==="press_nine"){const {me,r}=guard(args),g=game(r),n=g.nine;
    if(!n||clock()>=n.deadline||!n.eligible.includes(me.id)||n.pressed.includes(me.id))fail("NINE_NOT_ALLOWED");
    n.pressed.push(me.id);g.seq++;bump(r);
    if(n.eligible.filter(id=>!n.pressed.includes(id)).length<=1)finishNine(r);
    return {ok:true};}
  return originalRpc(fn,args);
}
