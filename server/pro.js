// Additional UNO Pro rules for the standalone Node/Render server.
import crypto from "node:crypto";
import { BOT_NAMES, BOT_NAMES_EN } from "./botNames.js";
import { chooseHardPlan } from "./hardBotStrategy.js";
export { BOT_NAMES, BOT_NAMES_EN } from "./botNames.js";
import {rpc as originalRpc, RPC_NAMES as basicNames, store, newDeck, LIMITS, sweep as basicSweep, onBump as basicOnBump, RpcError} from "./game.js";
const DEFAULT_RULES = Object.freeze({ repeat:true, sequence:true, nine:true, cut:true, stack:true });
const BEER_DELAY_MS = 3000;
const VORTEX_CARD_DELAY_MS = 1250;
export function chooseBotMoveDelay(difficulty) {
  return difficulty==="hard"?3000:5000;
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
const value = c => wild(c) ? c : c.slice(1);
const wild = c => c==="W"||c==="W4"||c==="W5"||c==="X"||c==="B"||c==="N"||c==="P"||c==="M";
const COLORS = ["r","y","g","b"];
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
  g.offline_since=null;
  // Do not consume the 50-second turn clock during queued 5-second notifications.
  g.turn_started_at=Math.max(now,g.visual_until||now);
  g.bot_move=null; // The next bot turn draws its delay exactly once.
  g.beer_due=(g.beer_remaining||[]).includes(current(g)) ? now+BEER_DELAY_MS : null;
  g.turn_start_color=g.current_color;
  g.powerless_target=(g.powerless_remaining||[]).includes(current(g))?current(g):null;
}
function activeNotification(g,at=clock()) {
  return (g.effects||[]).find(e=>e.show_at<=at && at<e.show_at+5000);
}
function actionLocked(_g,_at=clock()) {return false;}
function assertActionOpen(_r) {
  // Announcements are now non-blocking: no input cooldown.
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
  // A player who has finished the match cannot influence active competitors.
  if(!g || g.status!=="playing" || !g.turn_order.includes(actor))return caught;
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
    if(!isBot(id)||!g.turn_order.includes(id))continue;
    const delay=store.guestsById.get(id)?.difficulty==="hard"?4000:15000;
    catchUnoBy(r,id,delay);
  }
}
function effect(r,kind,by,card,color,details={}){
  const g=r.game,now=clock();
  // Related events share a five-second window, never a sequential queue.
  const show_at=now;
  if(now>=(g.visual_until||0)){
    if(g.status==="playing")g.turn_started_at=(g.turn_started_at??now)+5000;
    g.visual_until=now+5000;
  }
  const event={id:++g.event_seq,type:kind,by,name:name(by),card:card||null,color:color||null,at:now,show_at,...details};
  g.effects.push(event);if(g.effects.length>64)g.effects.shift();
}
// A multi-card move announces its special action ONCE, at End Turn.
function skipSequence(g,actor,dir,count){
  const n=g.turn_order.length,at=g.turn_order.indexOf(actor);
  if(at<0||!count)return {targets:[],next:advance(g.turn_idx,dir,1,n)};
  // A skip never targets its caster, even when multiple skips wrap around.
  const others=Array.from({length:n-1},(_,i)=>g.turn_order[advance(at,dir,i+1,n)]);
  const targets=Array.from({length:count},(_,i)=>others[i%others.length]);
  const remainder=count%others.length;
  return {targets,next:remainder===0?at:g.turn_order.indexOf(others[remainder])};
}
function consumeShield(r,id,reason){
  const g=r.game;
  if(!(g.shields?.[id]>0))return false;
  g.shields[id]--;
  if(!g.shields[id])delete g.shields[id];
  effect(r,"shield_defense",id,null,null,{target:id,target_name:name(id),reason});
  return true;
}
function completePowerlessTurn(g,id){
  g.powerless_remaining=(g.powerless_remaining||[]).filter(p=>p!==id);
  if(g.powerless_target===id)g.powerless_target=null;
}
function emitTurnEffect(r,actor,cards,finalDirection){
  if(!cards.length)return;
  const g=r.game,n=g.turn_order.length,topCard=cards.at(-1);
  const skips=cards.filter(c=>value(c)==="S").length;
  const reverses=cards.filter(c=>value(c)==="R" || value(c)==="T").length;
  if(cards.includes("B")){
    const targets=g.turn_order.filter(id=>id!==actor);
    effect(r,"bomb",actor,"B",g.current_color,{n:2,targets,target_names:targets.map(name)});
  }else if(cards.includes("M")){
    effect(r,"machinegun",actor,"M",g.current_color,{
      targets:(g.machine_gun_hits||[]).map(hit=>hit.target),revealed:g.machine_gun_hits||[],n:(g.machine_gun_hits||[]).length
    });
    g.machine_gun_hits=[];
  }else if(cards.includes("P")){
    effect(r,"powerless",actor,"P",g.current_color,{targets:[...(g.powerless_remaining||[])],target_names:(g.powerless_remaining||[]).map(name)});
  }else if(skips){
    const targets=skipSequence(g,actor,finalDirection,skips).targets;
    effect(r,"skip",actor,topCard,g.current_color,{n:skips,targets,target:targets[0],
      target_name:name(targets[0]),target_names:targets.map(name)});
  }else if(reverses){
    effect(r,"reverse",actor,topCard,g.current_color,{n:reverses,direction:finalDirection});
  }else if(cards.some(c=>value(c)==="H")){
    effect(r,"shield_armed",actor,topCard,g.current_color,{target:actor,target_name:name(actor),n:g.shields?.[actor]||0});
  }else if(cards.some(wild)){
    effect(r,"color_wave",actor,topCard,g.current_color);
  }
}
// Public-only per-player history, retaining at most five observations each.
function observePublic(r,id,entry){
  const g=r.game;
  if(!g||!id)return;
  g.public_history??={};
  const events=g.public_history[id]??=[];
  events.push({at:clock(),...entry});
  if(events.length>5)events.splice(0,events.length-5);
}
function isNumberCard(card){return /^[rygb][0-9]$/.test(card);}
function allowedDuringPowerless(g,card,id=current(g)){
  return !((g.powerless_remaining||[]).includes(id)||g.powerless_target===id)||isNumberCard(card);
}
function machineGun(r,actor){
  const g=r.game,hits=[],removed=[];
  const wildCards=c=>wild(c);
  const drawCards=c=>isDraw(c)||c==="W5";
  for(const victim of g.turn_order.filter(p=>p!==actor)){
    const h=hand(r,victim);
    let candidates=h.cards.filter(wildCards);
    if(!candidates.length)candidates=h.cards.filter(drawCards);
    if(!candidates.length)candidates=h.cards.filter(c=>["S","R","H"].includes(value(c)));
    if(!candidates.length)continue;
    const chosen=candidates[crypto.randomInt(candidates.length)];
    if(!g.draw_pile?.some(isNumberCard))g.draw_pile.push(...newDeck());
    const numbers=g.draw_pile.map((card,i)=>isNumberCard(card)?i:-1).filter(i=>i>=0);
    const index=numbers[crypto.randomInt(numbers.length)];
    const replacement=g.draw_pile.splice(index,1)[0];
    h.cards.splice(h.cards.indexOf(chosen),1,replacement);
    removed.push(chosen);
    g.machine_gun_seq=(g.machine_gun_seq||0)+1;
    g.machine_gun_new_by_id??={};
    g.machine_gun_new_by_id[victim]={card:replacement,nonce:g.machine_gun_seq,at:clock()};
    hits.push({target:victim,target_name:name(victim),card:chosen});
  }
  // Revealed specials are returned to the DRAW deck, never played into discard.
  if(removed.length)g.draw_pile=shuffle([...g.draw_pile,...removed]);
  return hits;
}
function privateNotice(r,id,kind,message){
  const g=r.game;if(!g||!id)return;
  g.private_notices??={};g.private_notice_seq=(g.private_notice_seq||0)+1;
  g.private_notices[id]={nonce:g.private_notice_seq,kind,message,at:clock()};
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
    observePublic(r,id,{kind:"forced_draw",color:g.current_color,n:n.count});
    draw(r,id,n.count);
    effect(r,"penalty",id,null,null,{target:id,target_name:name(id),n:n.count,reason:"nine"});
  }
  g.nine=null;
  g.last_action={type:"nine",by:n.source,name:name(n.source),target:losers[0]||null,
    target_name:losers.length===1?name(losers[0]):losers.map(name).join(", "),
    targets:losers,n:n.count,count:losers.length};
  g.seq++;bump(r);resolveDebt(r);
}
// A skip with Negation requires a real choice. Process each blocked player
// in order; the caster can never be one of the victims.
function continueSkips(r,actor,remaining,cursor,declined=[]){
  const g=r.game,n=g.turn_order.length,seen=new Set(declined);
  let idx=cursor;
  while(remaining>0){
    idx=advance(idx,g.direction,1,n);
    if(g.turn_order[idx]===actor)continue;
    const target=g.turn_order[idx];
    if(consumeShield(r,target,"skip")){
      nextTurn(g,idx);
      g.skip_carry=remaining>1?{source:actor,remaining:remaining-1}:null;
      g.seq++;bump(r);return;
    }
    if(!seen.has(target)&&hand(r,target).cards.includes("N")){
      nextTurn(g,idx);
      g.skip_reaction={actor,target,cursor:idx,remaining,declined:[...seen],
        deadline:clock()+9000};
      g.seq++;bump(r);return;
    }
    remaining--;
  }
  nextTurn(g,advance(idx,g.direction,1,n));
  g.seq++;bump(r);
}
function declineSkip(r,id){
  const g=game(r),sr=g.skip_reaction;
  if(!sr||sr.target!==id)fail("SKIP_NOT_PENDING");
  g.skip_reaction=null;
  continueSkips(r,sr.actor,sr.remaining-1,sr.cursor,[...sr.declined,id]);
}
function negateEffect(r,id,color){
  const g=game(r),h=hand(r,id);
  if(!h.cards.includes("N"))fail("NEGATION_NOT_IN_HAND");
  if(!["r","y","g","b"].includes(color))fail("COLOR_REQUIRED");
  const reaction=g.skip_reaction?.target===id;
  const debt=g.pending_draw>0&&current(g)===id&&!g.turn_cards.length;
  const powerless=(g.powerless_remaining||[]).includes(id)&&current(g)===id&&!g.turn_cards.length;
  if(!reaction&&!debt&&!powerless)fail("NEGATION_NOT_ALLOWED");
  const cause=reaction?"skip":debt?"draw":"powerless";
  if(reaction){
    const sr=g.skip_reaction;g.skip_reaction=null;
    // Any unconsumed skips are applied after the defending player's turn.
    g.skip_carry=sr.remaining>1?{source:sr.actor,remaining:sr.remaining-1}:null;
    nextTurn(g,g.turn_order.indexOf(id));
  }
  if(debt){
    g.pending_draw=0;g.pending_uncounterable=false;g.pending_source=null;
  }
  if(powerless){g.powerless_remaining=[];g.powerless_target=null;}
  const result=play(r,id,"N",color);
  // Negation is a reaction, not the player's regular move. After defending,
  // the player may still start a legal play or draw from the new color.
  if(g.status==="playing"&&current(g)===id){
    g.turn_cards=[];g.turn_mode=null;g.turn_step=0;
    g.has_drawn=false;g.drawn_card=null;
  }
  effect(r,"negation",id,"N",color,{reason:cause});
  g.seq++;bump(r);
  return result;
}
function resolveDebt(r){const g=r.game;if(!g||!g.pending_draw||g.nine)return;
  // Beer decides whether to counter or accept the debt after its visible countdown.
  if((g.beer_remaining||[]).includes(current(g))&&!g.beer_resolving)return;
  // Disconnects preserve the seat for the reduced turn window. An
  // unresolved draw penalty is accepted only when that window expires.
  const actor=current(g),guest=store.guestsById.get(actor);
  if(g.turn_cards?.length)return; // A player already responded; never charge them during an unfinished combo.
  if(consumeShield(r,actor,"draw")){
    g.pending_draw=0;g.pending_uncounterable=false;g.pending_source=null;
    g.seq++;bump(r);return;
  }
  if(!isBot(actor)&&(!guest||guest.last_seen<clock()-LIMITS.onlineMs))return;
  if(hand(r,current(g)).cards.includes("N"))return;
  if((g.pending_uncounterable || ready(r).stack) && counter(r,current(g)))return;
  const loser=current(g),n=g.pending_draw,attacker=g.pending_source||loser;
  observePublic(r,loser,{kind:"forced_draw",color:g.current_color,n});
  draw(r,loser,n);g.pending_draw=0;g.pending_uncounterable=false;g.pending_source=null;
  g.last_action={type:"stack_take",by:loser,name:name(loser),n};
  effect(r,"penalty",attacker,null,null,{target:loser,target_name:name(loser),n});g.seq++;
  nextTurn(g,advance(g.turn_idx,g.direction,1,g.turn_order.length));bump(r);
}
function finish(r,automatic=false,deferDebt=false){const g=game(r);if(g.nine)fail("NINE_ACTIVE");
  if(g.vortex_queue)fail("VORTEX_RESOLVING");
  if(g.wild_pending_color)fail("WILD_COLOR_PENDING");
  if(g.detective_pending_color)fail("DETECTIVE_COLOR_PENDING");
  const actor=current(g),cards=g.turn_cards||[],n=g.turn_order.length;
  if(!cards.length){
    if(g.skip_carry?.remaining){
      completePowerlessTurn(g,actor);
      const pending=g.skip_carry;g.skip_carry=null;
      if(!g.has_drawn)draw(r,actor,1);
      g.last_action={type:automatic?"auto":"pass",by:actor,name:name(actor)};
      continueSkips(r,pending.source,pending.remaining,g.turn_idx);
      return;
    }
    completePowerlessTurn(g,actor);
    if(g.pending_draw){const owed=g.pending_draw,attacker=g.pending_source||actor;
      observePublic(r,actor,{kind:"forced_draw",color:g.current_color,n:owed});draw(r,actor,owed);g.pending_draw=0;g.pending_uncounterable=false;g.pending_source=null;g.last_action={type:"stack_take",by:actor,name:name(actor),n:owed};effect(r,"penalty",attacker,null,null,{target:actor,target_name:name(actor),n:owed});}
    else {if(!g.has_drawn)draw(r,actor,1);
      observePublic(r,actor,{kind:"pass",color:g.turn_start_color??g.current_color});
      g.last_action={type:automatic?"auto":"pass",by:actor,name:name(actor)};}
    nextTurn(g,advance(g.turn_idx,g.direction,1,n));g.seq++;bump(r);return;
  }
  const inherited=g.skip_carry;
  let dir=g.direction,skips=0,added=0,hasFive=false;
  g.skip_carry=null;
  for(const card of cards){const v=value(card);
    if(v==="R"){if(n===2)skips++;else dir*=-1;}
    else if(v==="S")skips++;
    else if(v==="T"){if(n>2)dir*=-1;added+=2;}
    else if(isDraw(card)||card==="W5"){added+=weight(card);if(card==="W5")hasFive=true;}
  }
  if(g.pending_draw && !added)fail("MUST_COUNTER_OR_DRAW");
  const nines=cards.slice().reverse().findIndex(c=>value(c)!=="9");
  const trailingNines=nines<0?cards.length:nines;
  g.direction=dir;g.pending_draw+=added;
  if(added>0)g.pending_source=actor;
  if(hasFive)g.pending_uncounterable=true;
  const restrictNext=cards.includes("P");
  if(restrictNext)g.powerless_remaining=g.turn_order.filter(id=>id!==actor);
  if(cards.some(c=>value(c)==="C")){
    g.beer_remaining=g.turn_order.filter(id=>id!==actor);
    effect(r,"beer",actor,cards.find(c=>value(c)==="C"),g.current_color,{
      targets:[...g.beer_remaining],target_names:g.beer_remaining.map(name)
    });
  }
  observePublic(r,actor,{kind:"play",color:g.turn_start_color??g.current_color,
    cards:[...cards],chosen_color:g.current_color});
  emitTurnEffect(r,actor,cards,dir);

  g.last_action={type:"end",by:actor,name:name(actor),count:cards.length};g.seq++;
  // In a 2-player match, any number of Skip cards skips the one opponent.
  const nextIndex=skips?skipSequence(g,actor,dir,skips).next:advance(g.turn_idx,dir,1,n);
  if(inherited?.remaining && !skips){
    completePowerlessTurn(g,actor);
    continueSkips(r,inherited.source,inherited.remaining,g.turn_idx);
    bump(r);return;
  }
  if(inherited?.remaining)skips+=inherited.remaining;
  completePowerlessTurn(g,actor);
  if(skips&&cards.some(c=>value(c)==="S")){
    continueSkips(r,actor,skips,g.turn_idx);
  }else{
    nextTurn(g,nextIndex);
  }
  if(trailingNines && ready(r).nine && n>=3){const eligible=g.turn_order.filter(id=>id!==actor),start=clock();
    const botTimes={};
    for(const id of eligible)if(isBot(id))botTimes[id]=start+chooseNineDelay(store.guestsById.get(id)?.difficulty);
    // 8s easy bots still have time to respond, with a short network/sweep grace period.
    g.nine={source:actor,count:trailingNines,eligible,pressed:[],botTimes,started_at:start,deadline:start+9200};}
  bump(r);if(!g.nine&&!deferDebt)resolveDebt(r);
}
function play(r,id,card,color,targetId){
  const g=game(r),rules=ready(r),h=hand(r,id);let series=g.turn_cards||[];
  if(g.detective_pending_color)fail("DETECTIVE_COLOR_PENDING");
  if(g.wild_pending_color)fail("WILD_COLOR_PENDING");
  if(g.vortex_queue)fail("VORTEX_RESOLVING");
  if(current(g)===id && (g.beer_remaining||[]).includes(id) && !g.beer_resolving)fail("BEER_FORCED");
  const cutting=current(g)!==id||(g.skip_reaction?.target===id&&card===top(g));
  if(g.skip_reaction && !cutting)fail("SKIP_DECISION_PENDING");
  // No cooldown for initial plays or cuts while an announcement is shown.
  if(g.nine)fail("NINE_ACTIVE");
  if(!h.cards.includes(card)||!(/^(?:[rygb](?:[0-9]|S|R|D|T|H|V|C)|W|W4|W5|X|B|N|P|M)$/).test(card))fail("CARD_NOT_IN_HAND");
  const cutVictim=cutting?current(g):null;
  if(cutting){
    const debt=g.pending_draw>0;
    if(g.skip_reaction)g.skip_reaction=null;
    if(!rules.cut||!g.turn_order.includes(id)||card!==top(g))fail("CUT_NOT_ALLOWED");
    if(debt && !canCounter(g,card))fail("CUT_NOT_ALLOWED");
    if(series.length)finish(r,false,true);
    if(g.status!=="playing"||g.nine||(g.pending_draw && !canCounter(g,card)))fail("CUT_NOT_ALLOWED");
    nextTurn(g,g.turn_order.indexOf(id));series=[];
  }
  if(g.pending_draw && !series.length && !canCounter(g,card))fail("MUST_COUNTER_OR_DRAW");
  if(!allowedDuringPowerless(g,card,id))fail("POWERLESS_NUMBER_ONLY");
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
  if(wild(card)&&color!=null&&!COLORS.includes(color))fail("COLOR_REQUIRED");
  if(card==="X"&&(!targetId||targetId===id||!g.turn_order.includes(targetId)))fail("INVALID_DETECTIVE_TARGET");
  h.cards.splice(h.cards.indexOf(card),1);
  if(h.cards.length===1&&!h.uno_called){h.uno_since=clock();h.bot_uno_plan=null;}
  else if(h.cards.length!==1){h.uno_called=false;h.uno_since=null;h.bot_uno_plan=null;}

  const previousTop=top(g);
  g.discard_pile.push(card);g.current_color=wild(card)?(color||g.current_color):card[0];
  g.card_moves??=[];g.card_move_seq=(g.card_move_seq||0)+1;
  g.card_moves.push({id:g.card_move_seq,by:id,name:name(id),card,previous_top:previousTop,at:clock()});
  if(g.card_moves.length>40)g.card_moves.shift();
  // Commit the wild (including a jump-in) before asking its owner for the color.
  if(wild(card)&&card!=="X"&&!color){g.wild_pending_color=id;g.wild_pending_since=clock();}
  if(card==="X"){
    const defended=consumeShield(r,targetId,"detective");
    g.detective=defended?null:{viewer:id,target:targetId,until:clock()+10000};
    if(!color){
      g.detective_pending_color=id;
      // Inspection gets its own ten seconds and does not eat the turn clock.
      g.turn_started_at+=10000;
    }
  }
  if(card==="B"){
    for(const victim of g.turn_order.filter(pid=>pid!==id))
      if(!consumeShield(r,victim,"bomb"))draw(r,victim,2);
  }
  if(value(card)==="H"){
    g.shields??={};g.shields[id]=1; // A Shield is a binary effect; playing another never adds a charge.
  }
  if(card==="M")g.machine_gun_hits=machineGun(r,id);
  g.turn_cards=[...series,card];
  // The server reveals one pulled card at a time, allowing all clients to see it.
  if(value(card)==="V"){
    const pulled=shuffle(h.cards.filter(c=>c[0]===card[0]));
    if(pulled.length)g.vortex_queue={actor:id,cards:pulled,next_at:clock()+VORTEX_CARD_DELAY_MS,total:pulled.length};
    effect(r,"vortex",id,card,g.current_color,{n:pulled.length});
  }
  g.last_action={type:cutting?"cut":"play",by:id,name:name(id),card,color:g.current_color,left:h.cards.length};
  g.seq++;
  // A cut itself remains immediate; card-specific effects wait for End Turn.
  if(cutting && cutVictim)effect(r,"cut",id,card,g.current_color,{target:cutVictim,target_name:name(cutVictim)});
  planBotCut(r,id);
  bump(r);
  if(g.wild_pending_color)return {ok:true,pending_color:true};
  if(g.vortex_queue)return {ok:true,vortex:true,pending:true};
  if(h.cards.length===0){
    // A final Detective cannot claim victory until its viewer chooses a color.
    if(g.detective_pending_color)return {ok:true,pending_color:true};
    return finishEmptyHand(r,id);
  }
  if(value(card)==="V"){finish(r);return {ok:true,vortex:true,pulled:0};}
  // In duels, Reverse returns to the same player immediately.
  if(g.turn_order.length===2&&card[1]==="R"&&g.turn_cards.length===1&&
     !g.pending_draw&&!cutting)finish(r);
  return {ok:true};
}
// Drains Vortex across successive sweep ticks; no timers can race inside a game.
function vortexTick(r){
  const g=r.game,q=g?.vortex_queue;
  if(!q||g.status!=="playing"||clock()<q.next_at)return;
  const actor=q.actor;
  if(current(g)!==actor){g.vortex_queue=null;return;}
  if(!q.cards.length){
    g.vortex_queue=null;
    if(hand(r,actor).cards.length===0)finishEmptyHand(r,actor);
    else finish(r);
    planBotCut(r,actor);
    return;
  }
  const card=q.cards.shift(),h=hand(r,actor),idx=h.cards.indexOf(card);
  if(idx<0){q.next_at=clock()+VORTEX_CARD_DELAY_MS;return;}
  h.cards.splice(idx,1);
  const previousTop=top(g);
  g.discard_pile.push(card);g.current_color=card[0];
  g.card_move_seq=(g.card_move_seq||0)+1;
  g.card_moves.push({id:g.card_move_seq,by:actor,name:name(actor),card,previous_top:previousTop,at:clock()});
  if(g.card_moves.length>40)g.card_moves.shift();
  if(value(card)==="H"){g.shields??={};g.shields[actor]=1;}
  g.turn_cards.push(card);
  if(h.cards.length===1&&!h.uno_called){h.uno_since=clock();h.bot_uno_plan=null;}
  else if(h.cards.length!==1){h.uno_called=false;h.uno_since=null;h.bot_uno_plan=null;}
  g.last_action={type:"play",by:actor,name:name(actor),card,color:g.current_color,left:h.cards.length};
  q.next_at=clock()+VORTEX_CARD_DELAY_MS;
  g.seq++;bump(r);
}
function resolveWildColor(r,id,color){
  const g=game(r);
  if(g.wild_pending_color!==id||current(g)!==id)fail("WILD_COLOR_NOT_PENDING");
  if(!COLORS.includes(color))fail("COLOR_REQUIRED");
  // Choosing a color does not consume the owner’s normal turn time.
  g.turn_started_at+=Math.max(0,clock()-(g.wild_pending_since||clock()));
  g.current_color=color;g.wild_pending_color=null;g.wild_pending_since=null;
  g.last_action={type:"wild_color",by:id,name:name(id),color};
  g.seq++;bump(r);
  if(hand(r,id).cards.length===0)return finishEmptyHand(r,id);
  return {ok:true};
}
function finishEmptyHand(r,id){
  const g=game(r);
  g.placements??=[];
  g.placements.push({id,rank:g.placements.length+1,name:name(id)});
  g.winner_id=g.placements[0]?.id??id;
  const remaining=g.turn_order.filter(pid=>pid!==id);
  const onlyBotsRemain=remaining.length>0&&remaining.every(isBot);
  if(g.placements.length>=(g.winners_target??2)||g.turn_order.length===2||onlyBotsRemain){
    if(g.placements.length===1){
      const runnerUp=remaining.slice().sort((a,b)=>hand(r,a).cards.length-hand(r,b).cards.length)[0];
      if(runnerUp)g.placements.push({id:runnerUp,rank:2,name:name(runnerUp)});
    }
    g.second_winner_id=g.placements[1]?.id??null;
    observePublic(r,id,{kind:"play",color:g.turn_start_color??g.current_color,
      cards:[...g.turn_cards],chosen_color:g.current_color});
    emitTurnEffect(r,id,g.turn_cards||[],g.direction);
    g.status="finished";
    g.last_action={type:"placement",by:id,name:name(id),rank:g.placements.at(-1)?.rank??1,win:true};
    g.pending_draw=0;g.nine=null;r.status="waiting";bump(r,true);return {ok:true,won:true};
  }
  finish(r,false,true);
  const target=current(g);
  g.turn_order=g.turn_order.filter(p=>p!==id);
  g.turn_idx=Math.max(0,g.turn_order.indexOf(target));
  g.last_action={type:"placement",by:id,name:name(id),rank:g.placements.at(-1)?.rank??1};
  if(g.nine)g.nine.eligible=g.nine.eligible.filter(p=>p!==id);
  resolveDebt(r);bump(r);return {ok:true,won:true,continued:true};
}
function resolveDetective(r,id,color){
  const g=game(r);
  if(g.detective_pending_color!==id||current(g)!==id)fail("DETECTIVE_NOT_PENDING");
  if(!COLORS.includes(color))fail("COLOR_REQUIRED");
  g.current_color=color;
  g.detective_pending_color=null;
  g.detective=null;
  g.last_action={type:"detective_color",by:id,name:name(id),color};
  g.seq++;bump(r);
  if(hand(r,id).cards.length===0)return finishEmptyHand(r,id);
  return {ok:true};
}
function hardBotTick(r,id,h){
  const g=r.game,turn=g.bot_move;
  if(!turn.plan){
    const counts=Object.fromEntries(g.turn_order.filter(p=>p!==id)
      .map(p=>[p,r.hands.get(p)?.cards.length??0]));
    const decision=chooseHardPlan({
      hand:g.powerless_target===id?h.cards.filter(isNumberCard):[...h.cards],topCard:top(g),currentColor:g.current_color,
      direction:g.direction,turnOrder:[...g.turn_order],turnIndex:g.turn_idx,
      selfId:id,counts,history:g.public_history||{},rules:ready(r),
      pendingDraw:g.pending_draw,pendingUncounterable:g.pending_uncounterable,
      random:Math.random
    });
    if(decision.kind==="accept"){finish(r,true);return;}
    if(decision.kind==="draw"||!decision.cards.length){
      if(g.pending_draw){finish(r,true);return;}
      if(g.has_drawn){finish(r,true);return;}
      const previousColor=g.current_color;
      const drawn=draw(r,id,1)[0]||null;
      g.has_drawn=true;g.drawn_card=drawn;
      rememberDraw(r,id,drawn);
      observePublic(r,id,{kind:"no_play_draw",color:previousColor});
      g.last_action={type:"auto_draw",by:id,name:name(id)};g.seq++;bump(r);
      turn.plan=null;turn.due=clock()+2000;
      return;
    }
    turn.plan=[...decision.cards];turn.color=decision.color;
    turn.target=decision.target;turn.score=decision.score;
  }
  const card=turn.plan.shift();
  if(!h.cards.includes(card))throw new Error("INVALID_HARD_BOT_PLAN");
  play(r,id,card,wild(card)?turn.color:undefined,card==="X"?turn.target:undefined);
  if(g.status!=="playing"||current(g)!==id||!g.turn_cards?.length)return;
  if(turn.plan.length===0){finish(r);return;}
  turn.due=clock()+2000;
}
// One random, server-authoritative move for each opponent affected by Beer.
function beerTick(r){
  const g=r.game;
  if(!g || g.status!=="playing" || g.nine || g.skip_reaction || g.detective_pending_color || g.wild_pending_color || g.vortex_queue ||
     g.turn_cards?.length || !(g.beer_remaining||[]).includes(current(g)))return false;
  if(g.beer_due===null||g.beer_due===undefined)g.beer_due=clock()+BEER_DELAY_MS;
  if(clock()<g.beer_due)return true; // All viewers see three seconds before the forced move.
  const actor=current(g),h=hand(r,actor);
  // A shield cancels a stacked debt before Beer selects the forced move.
  if(g.pending_draw && consumeShield(r,actor,"draw")){
    g.pending_draw=0;g.pending_uncounterable=false;g.pending_source=null;
  }
  // Remove the effect first: a Vortex or duel Reverse can end a move inside play().
  g.beer_remaining=g.beer_remaining.filter(id=>id!==actor);
  let options=h.cards.filter(c=>allowedDuringPowerless(g,c,actor) &&
    (g.pending_draw?canCounter(g,c):playable(c,g)));
  if(!options.length && !g.pending_draw){
    const previousColor=g.current_color;
    const newCard=draw(r,actor,1)[0]||null;
    g.has_drawn=true;g.drawn_card=newCard;
    rememberDraw(r,actor,newCard);
    observePublic(r,actor,{kind:"no_play_draw",color:previousColor});
    options=newCard&&playable(newCard,g)&&allowedDuringPowerless(g,newCard,actor)?[newCard]:[];
  }
  const chosen=options.length?options[crypto.randomInt(options.length)]:null;
  effect(r,"beer_forced",actor,chosen,g.current_color,{target:actor,target_name:name(actor)});
  g.beer_resolving=true;
  try{
    if(chosen){
      const color=wild(chosen)?COLORS[crypto.randomInt(COLORS.length)]:undefined;
      const others=g.turn_order.filter(id=>id!==actor);
      const targetId=chosen==="X"?others[crypto.randomInt(others.length)]:undefined;
      play(r,actor,chosen,color,targetId);
      if(g.status==="playing"&&current(g)===actor&&g.turn_cards?.length&&!g.vortex_queue)finish(r);
    }else{
      // No legal card: accept a pending draw penalty or pass after drawing once.
      finish(r,true);
    }
  }finally{g.beer_resolving=false;}
  return true;
}
function botTick(r){
  const g=r.game;
  if(!g || g.status!=="playing" || g.nine || g.skip_reaction || g.detective_pending_color || !isBot(current(g)))return;
  const id=current(g),h=hand(r,id),bot=store.guestsById.get(id),rules=ready(r);
  const hard=bot.difficulty==="hard";
  const colorForNegation=()=>{
    const counts=Object.fromEntries(["b","r","y","g"].map(c=>[c,h.cards.filter(x=>x[0]===c).length]));
    return Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];
  };
  if((g.powerless_remaining||[]).includes(id)&&h.cards.includes("N")){
    negateEffect(r,id,colorForNegation());return;
  }
  if(g.pending_draw>0&&h.cards.includes("N")&&!g.turn_cards.length&&
    (g.pending_uncounterable||!counter(r,id)||g.pending_draw>=5)){
    negateEffect(r,id,colorForNegation());return;
  }
  if(!g.bot_move || g.bot_move.id!==id){
    g.bot_move={id,due:clock()+chooseBotMoveDelay(bot.difficulty),played:0};
  }
  if(clock()<g.bot_move.due || (g.turn_cards.length===0 && actionLocked(g)))return;
  if(hard&&bot.ai_variant!=="legacy")return hardBotTick(r,id,h);
  if(g.pending_draw && g.turn_cards.length===0 && !counter(r,id)&&!h.cards.includes("N")){finish(r,true);return;}
  const score=c=>{
    const match=h.cards.filter(x=>x!==c && value(x)===value(c)).length;
    const run=h.cards.filter(x=>x[0]===c[0] && /^[0-9]$/.test(value(x)) && /^[0-9]$/.test(value(c)) &&
      Math.abs(Number(value(x))-Number(value(c)))===1).length;
    return match*4+run*2+weight(c)*3+(value(c)==="S"?4:0)+(value(c)==="R"?2:0)-(wild(c)?2:0);
  };
  const chooseColor=()=>{
    const counts={r:0,y:0,g:0,b:0};
    h.cards.forEach(c=>{if(counts[c[0]]!==undefined)counts[c[0]]++});
    return Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];
  };
  let options;
  if(!g.turn_cards.length){
    options=h.cards.filter(c=>allowedDuringPowerless(g,c)&&(g.pending_draw?canCounter(g,c):playable(c,g)));
    if(!options.length && !g.pending_draw){
      const previousColor=g.current_color;
      const drawn=draw(r,id,1)[0];g.has_drawn=true;g.drawn_card=drawn||null;rememberDraw(r,id,drawn);
      observePublic(r,id,{kind:"no_play_draw",color:previousColor});
      if(drawn && playable(drawn,g)&&allowedDuringPowerless(g,drawn))options=[drawn];
    }
  }else{
    const series=g.turn_cards,first=series[0],prev=series.at(-1);
    options=h.cards.filter(c=>{
      const same=value(first)===value(c),delta=Number(value(c))-Number(value(prev));
      const run=/^\d$/.test(value(c)) && /^\d$/.test(value(prev)) && c[0]===prev[0] &&
        Math.abs(delta)===1 && (!g.turn_step || Math.sign(delta)===g.turn_step);
      if(!allowedDuringPowerless(g,c))return false;
      if(!allowedDuringPowerless(g,c))return false;
    return g.turn_mode==="repeat"?same:g.turn_mode==="sequence"?run:
        (same&&rules.repeat)||(run&&rules.sequence);
    });
  }
  if(!options.length){finish(r,true);return;}
  options.sort((a,b)=>score(b)-score(a));
  const pick=hard || Math.random()<.6 ? options[0] : options[Math.floor(Math.random()*options.length)];
  const target=pick==="X"?g.turn_order.filter(p=>p!==id)
    .sort((a,b)=>hand(r,a).cards.length-hand(r,b).cards.length)[0]:undefined;
  play(r,id,pick,chooseColor(),target);
  if(g.status!=="playing" || current(g)!==id||!g.turn_cards?.length)return;
  g.bot_move={id,due:clock()+(hard?2000:5000),played:(g.bot_move?.played||0)+1};
  // Keep the turn open for an additional card only when a valid combo exists.
  const series=g.turn_cards,first=series[0],prev=series.at(-1);
  const hasCombo=h.cards.some(c=>{
    const same=value(first)===value(c),delta=Number(value(c))-Number(value(prev));
    const run=/^\d$/.test(value(c))&&/^\d$/.test(value(prev))&&c[0]===prev[0]&&
      Math.abs(delta)===1&&(!g.turn_step||Math.sign(delta)===g.turn_step);
    return g.turn_mode==="repeat"?same:g.turn_mode==="sequence"?run:
      (same&&rules.repeat)||(run&&rules.sequence);
  });
  if(!hasCombo)finish(r);
}
// When every active contestant is a bot, conclude instead of running an
// unattended bot-only tournament. Keep any already-earned human placement.
function finishWhenOnlyBots(r){
  const g=r.game;
  if(!g||g.status!=="playing"||!g.turn_order.length||g.turn_order.some(id=>!isBot(id)))return false;
  g.placements??=[];
  const ranking=g.turn_order.slice().sort((a,b)=>hand(r,a).cards.length-hand(r,b).cards.length);
  while(g.placements.length<(g.winners_target??2) && ranking.length){
    const id=ranking.shift();
    if(g.placements.some(p=>p.id===id))continue;
    g.placements.push({id,rank:g.placements.length+1,name:name(id)});
  }
  g.winner_id=g.placements[0]?.id??null;
  g.second_winner_id=g.placements[1]?.id??null;
  g.status="finished";r.status="waiting";g.nine=null;g.pending_draw=0;
  g.last_action={type:"bots_only_end",by:g.winner_id,name:name(g.winner_id),win:true};
  g.seq++;bump(r,true);
  return true;
}
function removeForTimeout(r,id){
  const g=r.game;
  const old=g.turn_order,idx=old.indexOf(id);
  if(idx<0)return;
  const nextId=old[advance(idx,g.direction,1,old.length)];
  r.members=r.members.filter(m=>m.guest_id!==id);
  r.hands.delete(id);
  g.turn_order=old.filter(p=>p!==id);
  delete g.timeout_counts[id];
  if(r.host_id===id)r.host_id=r.members.find(m=>!isBot(m.guest_id)&&!m.spectator)?.guest_id??null;
  if(g.turn_order.length<2){
    const remaining=g.turn_order[0]??null;
    if(remaining&&!g.placements.some(p=>p.id===remaining))
      g.placements.push({id:remaining,rank:g.placements.length+1,name:name(remaining)});
    g.status="finished";r.status="waiting";
    g.winner_id=g.placements[0]?.id??remaining;
    g.second_winner_id=g.placements[1]?.id??null;
    g.nine=null;g.pending_draw=0;
  }else{
    const target=nextId===id?g.turn_order[0]:nextId;
    nextTurn(g,Math.max(0,g.turn_order.indexOf(target)));
    finishWhenOnlyBots(r);
  }
  g.last_action={type:"abandon",by:id,name:name(id),reason:"two_timeouts"};
  g.seq++;bump(r,true);
}
let lastBasicSweep=0;
export function proSweep(){LIMITS.autoPassMs=50_000;const time=clock();
  for(const r of store.rooms.values()){
    for(const m of r.members){const b=store.guestsById.get(m.guest_id);if(b?.bot)b.last_seen=time;}
    const g=r.game;
    if(!g||g.status!=="playing")continue;
    if(finishWhenOnlyBots(r))continue;
    if(g.vortex_queue){vortexTick(r);continue;}
    if(g.wild_pending_color){
      if(time-(g.wild_pending_since||time)>=20000){
        const id=g.wild_pending_color;
        const counts=Object.fromEntries(COLORS.map(c=>[c,hand(r,id).cards.filter(x=>x[0]===c).length]));
        resolveWildColor(r,id,COLORS.slice().sort((a,b)=>counts[b]-counts[a])[0]);
      }
      continue;
    }
    if(g.detective_pending_color && time>=g.turn_started_at+50000 &&
      g.detective_pending_color===current(g))resolveDetective(r,current(g),g.current_color);
    if(g.nine){
      for(const [id,due] of Object.entries(g.nine.botTimes||{})){
        if(!g.nine.pressed.includes(id) && time>=due && time<g.nine.deadline){
          g.nine.pressed.push(id);g.seq++;bump(r);
        }
      }
      if(time>=g.nine.deadline||g.nine.eligible.filter(id=>!g.nine.pressed.includes(id)).length<=1)finishNine(r);
    }
    if(g.nine)continue;
    if(g.skip_reaction){
      const sr=g.skip_reaction;
      if(isBot(sr.target)){
        if(hand(r,sr.target).cards.includes("N")){
          const myCards=hand(r,sr.target).cards.filter(c=>c!=="N");
          const best=["b","r","g","y"].sort((a,b)=>myCards.filter(c=>c[0]===b).length-myCards.filter(c=>c[0]===a).length)[0];
          negateEffect(r,sr.target,best);
        }else declineSkip(r,sr.target);
      }else if(time>=sr.deadline)declineSkip(r,sr.target);
      if(g.skip_reaction||g.status!=="playing")continue;
    }
    botUnoAndCatchTick(r);
    botCutTick(r);
    if(g.nine||g.skip_reaction)continue; // A jump-in or skip response is pending.
    if(beerTick(r))continue;
    resolveDebt(r);
    if(g.nine||g.skip_reaction||g.status!=="playing")continue;
    // Auto-draw once when there is no playable card anywhere in the hand.
    if(!actionLocked(g)&&!g.pending_draw&&!g.has_drawn&&!g.turn_cards?.length&&!isBot(current(g))&&
       (store.guestsById.get(current(g))?.last_seen??0)>=time-LIMITS.onlineMs){
      const id=current(g),h=hand(r,id);
      if(!h.cards.some(c=>playable(c,g)&&allowedDuringPowerless(g,c)) &&
         !((g.powerless_remaining||[]).includes(id)&&h.cards.includes("N"))){
        const priorColor=g.current_color;
        const drawn=draw(r,id,1)[0]||null;g.has_drawn=true;g.drawn_card=drawn;
        rememberDraw(r,id,drawn);
        observePublic(r,id,{kind:"no_play_draw",color:priorColor});
        g.last_action={type:"auto_draw",by:id,name:name(id)};
        g.seq++;bump(r);
        if(!drawn||!playable(drawn,g)||!allowedDuringPowerless(g,drawn)){
          privateNotice(r,id,"auto_pass","Você não tinha cartas para jogar. Comprou uma carta automaticamente e sua vez passou.");
          finish(r,true);
        }
      }
    }
    botTick(r);
    if(g.nine)continue; // A bot may have just finished a nine combination.

    if(g.status==="playing"){
      const player=current(g),guest=store.guestsById.get(player);
      const online=!!guest && (isBot(player) || guest.last_seen>=time-LIMITS.onlineMs);
      if(online)g.offline_since=null;
      else if(!g.offline_since)g.offline_since=Math.max(g.turn_started_at,(guest?.last_seen||g.turn_started_at)+LIMITS.onlineMs);
      const normalDeadline=g.turn_started_at+50000;
      const disconnectedDeadline=!online && g.offline_since
        ?Math.min(normalDeadline,g.offline_since+30000):normalDeadline;
      if(time>=disconnectedDeadline){
        const inactive=!isBot(player)&&!g.turn_cards?.length&&!g.has_drawn;
        g.timeout_counts??={};
        if(inactive){
          g.timeout_counts[player]=(g.timeout_counts[player]||0)+1;
          if(g.timeout_counts[player]>=2){removeForTimeout(r,player);continue;}
          privateNotice(r,player,"timeout","Tempo esgotado: sua vez passou automaticamente. Duas vezes seguidas removem o jogador.");
        }else g.timeout_counts[player]=0;
        finish(r,true);
      }
    }
  }
  if(time-lastBasicSweep>=3000){lastBasicSweep=time;basicSweep();}
}
export const RPC_NAMES=[...new Set([...basicNames,"end_turn","accept_draw","press_nine","add_bot","remove_bot","dev_auth","dev_status","dev_delete_public_room","update_room_settings","update_winners","negate_effect","accept_skip","resolve_detective","resolve_wild_color"])];
export function proRpc(fn,args={}){
  if(fn==="dev_auth"){
    const me=authenticate(args.p_token);
    const configured=process.env.DEV_ACCESS_KEY;
    if(me.nickname.trim().toLocaleLowerCase("pt-BR")!=="toninho")fail("DEV_NAME_REQUIRED",403);
    // The nickname is not authentication. The Render secret must be configured.
    if(!configured || configured.length<16)fail("DEV_NOT_CONFIGURED",503);
    const input=typeof args.p_key==="string"?args.p_key:"";
    const digestA=crypto.createHash("sha256").update(input).digest();
    const digestB=crypto.createHash("sha256").update(configured).digest();
    if(!crypto.timingSafeEqual(digestA,digestB))fail("DEV_INVALID_KEY",403);
    me.is_dev=true;
    for(const r of store.rooms.values())if(member(r,me.id)){r.host_id=me.id;bump(r,true);}
    return {is_dev:true};
  }
  if(fn==="dev_status"){
    const me=authenticate(args.p_token);
    return {is_dev:!!me.is_dev && me.nickname.trim().toLocaleLowerCase("pt-BR")==="toninho"};
  }
  if(fn==="dev_delete_public_room"){
    const me=authenticate(args.p_token);
    if(!me.is_dev || me.nickname.trim().toLocaleLowerCase("pt-BR")!=="toninho")fail("DEV_ACCESS_DENIED",403);
    const r=find(args.p_code);
    if(!r.is_public)fail("ROOM_NOT_PUBLIC");
    store.rooms.delete(r.id);store.roomsByCode.delete(r.code);
    bump(r,true);
    return {ok:true};
  }
  if(fn==="join_room"){
    const me=authenticate(args.p_token);
    const r=find(args.p_code);
    if(me.is_dev && me.nickname.trim().toLocaleLowerCase("pt-BR")==="toninho" &&
      !member(r,me.id) && (r.status==="playing" || r.members.filter(m=>!m.spectator).length>=r.max_players)){
      // Allow the authenticated developer to host and spectate even full rooms.
      // Spectators do not receive cards and do not occupy a player seat.
      r.members.push({guest_id:me.id,joined_at:Math.max(clock(),(r.members.at(-1)?.joined_at||0)+1),spectator:true});
      r.host_id=me.id;bump(r,true);return {code:r.code,already:false};
    }
    const result=originalRpc(fn,args);
    if(me.is_dev && me.nickname.trim().toLocaleLowerCase("pt-BR")==="toninho" && r.host_id!==me.id){
      r.host_id=me.id;bump(r,true);
    }
    return result;
  }
  if(fn==="leave_room"){
    const r=store.roomsByCode.get(String(args.p_code||"").trim().toUpperCase());
    const result=originalRpc(fn,args);
    if(r&&store.rooms.has(r.id))finishWhenOnlyBots(r);
    return result;
  }
  if(fn==="create_room"){
    const count=args.p_starting_cards===undefined?8:args.p_starting_cards;
    if(!Number.isInteger(count)||count<2||count>20)fail("INVALID_STARTING_CARDS");
    const result=originalRpc(fn,args),r=find(result.code);
    r.rules=stateRules(args.p_rules);r.initial_cards=count;
    const target=args.p_winners===undefined?2:Number(args.p_winners);
    r.winners_target=Math.max(1,Math.min(r.max_players-1,Number.isFinite(target)?Math.floor(target):2));
    return result;
  }
  if(fn==="update_winners"){
    const {me,r}=guard(args);
    if(r.host_id!==me.id)fail("NOT_HOST",403);
    if(r.status!=="waiting"||r.game?.status==="playing")fail("GAME_STARTED",409);
    const requested=Number(args.p_winners);
    if(!Number.isFinite(requested))fail("INVALID_WINNERS");
    r.winners_target=Math.max(1,Math.min(r.max_players-1,Math.floor(requested)));
    bump(r);return {ok:true,winners_target:r.winners_target};
  }
  if(fn==="update_room_settings"){
    const {me,r}=guard(args);
    if(r.host_id!==me.id)fail("NOT_HOST",403);
    if(r.status!=="waiting" || r.game?.status==="playing")fail("GAME_STARTED",409);
    const count=args.p_starting_cards;
    if(!Number.isInteger(count)||count<2||count>20)fail("INVALID_STARTING_CARDS");
    if(!args.p_rules||Object.keys(DEFAULT_RULES).some(k=>typeof args.p_rules[k]!=="boolean"))
      fail("INVALID_RULE_SETTINGS");
    r.initial_cards=count;r.rules=stateRules(args.p_rules);
    bump(r);
    return {ok:true,initial_cards:count,rules:r.rules};
  }
  if(fn==="start_game"){const result=originalRpc(fn,args),r=find(args.p_code),g=r.game;
    r.winners_target=Math.min(r.winners_target??2,g.turn_order.length-1);
    Object.assign(g,{turn_cards:[],turn_mode:null,turn_step:0,pending_draw:0,pending_uncounterable:false,pending_source:null,nine:null,effects:[],event_seq:0,last_draw_by_id:{},draw_nonce:0,bot_cut:null,bot_move:null,visual_until:0,offline_since:null,card_moves:[],card_move_seq:0,public_history:{},turn_start_color:g.current_color,winners_target:r.winners_target,timeout_counts:{},private_notices:{},private_notice_seq:0,powerless_target:null,powerless_remaining:[],shields:{},beer_remaining:[],beer_resolving:false,beer_due:null,vortex_queue:null,wild_pending_color:null,wild_pending_since:null,detective_pending_color:null,machine_gun_hits:[],machine_gun_new_by_id:{},machine_gun_seq:0,skip_reaction:null,skip_carry:0});
    planBotCut(r,null);
    for(const h of r.hands.values())h.uno_since=null;
    return result;
  }
  if(fn==="get_room_state"){const result=originalRpc(fn,args),r=find(args.p_code),g=r.game;result.room.rules=ready(r);result.room.initial_cards=r.initial_cards??8;result.room.winners_target=r.winners_target??2;
    result.is_dev=!!authenticate(args.p_token).is_dev;
    result.members=result.members.map(m=>({ ...m,bot:isBot(m.id),difficulty:store.guestsById.get(m.id)?.difficulty||null,spectator:!!r.members.find(x=>x.guest_id===m.id)?.spectator}));
    if(g&&result.game){result.game.turn_cards=[...(g.turn_cards||[])];result.game.pending_draw=g.pending_draw||0;
      result.game.nine=g.nine?{source:g.nine.source,count:g.nine.count,eligible:[...g.nine.eligible],pressed:[...g.nine.pressed],deadline:stamp(g.nine.deadline)}:null;
      result.game.effects=[...(g.effects||[])];
      result.game.action_locked_until=activeNotification(g) && actionLocked(g)
        ? stamp(activeNotification(g).show_at+2000) : null;
      result.game.last_draw=g.last_draw_by_id?.[result.me]?{...g.last_draw_by_id[result.me],at:stamp(g.last_draw_by_id[result.me].at)}:null;
      result.game.winners_target=g.winners_target??2;
      result.game.powerless_target=g.powerless_target??null;
      result.game.powerless_remaining=[...(g.powerless_remaining||[])];
      result.game.shields=Object.fromEntries(Object.entries(g.shields||{}).filter(([,count])=>count>0).map(([id])=>[id,1]));
       result.game.beer_remaining=[...(g.beer_remaining||[])];
      result.game.beer_due_at=g.beer_due?stamp(g.beer_due):null;
      result.game.vortex_pending=g.vortex_queue?{actor:g.vortex_queue.actor,remaining:g.vortex_queue.cards.length,total:g.vortex_queue.total}:null;
      result.game.wild_pending_color=g.wild_pending_color===result.me;
      result.game.wild_color_pending_player=g.wild_pending_color||null;
      result.game.machine_gun_new=g.machine_gun_new_by_id?.[result.me]
        ?{...g.machine_gun_new_by_id[result.me],at:stamp(g.machine_gun_new_by_id[result.me].at)}:null;
      result.game.detective_pending_color=g.detective_pending_color===result.me;
      result.game.skip_reaction=g.skip_reaction
        ?(g.skip_reaction.target===result.me
          ?{target:g.skip_reaction.target,expires_at:stamp(g.skip_reaction.deadline)}
          :{target:null,expires_at:stamp(g.skip_reaction.deadline)})
        :null;
      const personal=g.private_notices?.[result.me];
      result.game.private_notice=personal?{...personal,at:stamp(personal.at)}:null;
      result.game.pending_uncounterable=!!g.pending_uncounterable;
      result.game.card_moves=[...(g.card_moves||[])];
      result.game.offline_deadline_at=g.offline_since && current(g)===result.game.current_player
        ?stamp(Math.min(g.turn_started_at+50000,g.offline_since+30000)):null;
      result.game.detective=g.detective?.viewer===result.me&&clock()<g.detective.until
        ?{target:g.detective.target,target_name:name(g.detective.target),cards:[...(r.hands.get(g.detective.target)?.cards??[])],expires_at:stamp(g.detective.until)}:null;
      result.members=result.members.map(m=>({...m,bot_name_en:isBot(m.id)?BOT_NAMES_EN[BOT_NAMES.indexOf(m.nickname)]??m.nickname:null}));
      result.game.can_catch_uno=g.status==="playing"&&g.turn_order.includes(result.me)&&r.members.some(m=>m.guest_id!==result.me&&r.hands.get(m.guest_id)?.cards.length===1&&!r.hands.get(m.guest_id)?.uno_called&&clock()-(r.hands.get(m.guest_id)?.uno_since||clock())>=4000);
      result.members=result.members.map(m=>({...m,uno_since:r.hands.get(m.id)?.uno_since?stamp(r.hands.get(m.id).uno_since):null}));}
    return result;
  }
  if(fn==="add_bot"){const {me,r}=guard(args);if(r.host_id!==me.id)fail("NOT_HOST");if(r.status!=="waiting")fail("GAME_STARTED");
    if(r.members.filter(m=>!m.spectator).length>=r.max_players)fail("ROOM_FULL");
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
  if(fn==="negate_effect"){
    const {me,r}=guard(args);
    return negateEffect(r,me.id,args.p_color);
  }
  if(fn==="resolve_detective"){
    const {me,r}=guard(args);
    return resolveDetective(r,me.id,args.p_color);
  }
  if(fn==="resolve_wild_color"){
    const {me,r}=guard(args);
    return resolveWildColor(r,me.id,args.p_color);
  }
  if(fn==="accept_skip"){
    const {me,r}=guard(args);
    declineSkip(r,me.id);return {ok:true};
  }
  if(fn==="play_card"){const {me,r}=guard(args);const result=play(r,me.id,args.p_card,args.p_color,args.p_target_id);
    if(r.game?.timeout_counts)r.game.timeout_counts[me.id]=0;
    return result;}
  if(fn==="end_turn"||fn==="pass_turn"){const {me,r}=guard(args),g=game(r);if(current(g)!==me.id)fail("NOT_YOUR_TURN");if((g.beer_remaining||[]).includes(me.id))fail("BEER_FORCED");g.timeout_counts[me.id]=0;finish(r);return {ok:true};}
  if(fn==="draw_card"){const {me,r}=guard(args),g=game(r);if(current(g)!==me.id)fail("NOT_YOUR_TURN");if((g.beer_remaining||[]).includes(me.id))fail("BEER_FORCED");assertActionOpen(r);
    if(g.nine)fail("NINE_ACTIVE");if(g.pending_draw)fail("MUST_COUNTER_OR_DRAW");
    if(g.turn_cards?.length)fail("ALREADY_PLAYED");if(g.has_drawn)fail("ALREADY_DRAWN");
    const hadPlayable=hand(r,me.id).cards.some(c=>playable(c,g)&&allowedDuringPowerless(g,c));
    const card=draw(r,me.id,1)[0]||null;g.has_drawn=true;g.drawn_card=card;rememberDraw(r,me.id,card);g.timeout_counts[me.id]=0;
    observePublic(r,me.id,{kind:"voluntary_draw",color:g.current_color});
    g.last_action={type:"draw",by:me.id,name:me.nickname};g.seq++;bump(r);
    const canPlayDrawn=!!card&&playable(card,g)&&allowedDuringPowerless(g,card);
    if(!hadPlayable&&!canPlayDrawn){
      privateNotice(r,me.id,"auto_pass","A carta comprada não podia ser jogada. Sua vez passou automaticamente.");
      finish(r,true);
    }
    return {card,playable:canPlayDrawn,auto_passed:!hadPlayable&&!canPlayDrawn};}
  if(fn==="accept_draw"){const {me,r}=guard(args),g=game(r);if(current(g)!==me.id)fail("NOT_YOUR_TURN");if((g.beer_remaining||[]).includes(me.id))fail("BEER_FORCED");
    if(!g.pending_draw||g.turn_cards.length)fail("NOTHING_TO_ACCEPT");const n=g.pending_draw;g.timeout_counts[me.id]=0;finish(r);return {ok:true,n};}
  if(fn==="call_uno"){const {me,r}=guard(args),g=game(r),h=hand(r,me.id);
    if(!(h.cards.length===1||(h.cards.length===2&&current(g)===me.id)))fail("UNO_NOT_ALLOWED");
    if(!h.uno_called){announceUno(r,me.id);}return {ok:true};}
  if(fn==="catch_uno"){
    const {me,r}=guard(args),g=game(r);
    if(!g.turn_order.includes(me.id))fail("CATCH_NOT_ALLOWED",403);
    const caught=catchUnoBy(r,me.id,4000);
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
