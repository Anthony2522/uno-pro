// Additional UNO Pro rules for the standalone Node/Render server.
import crypto from "node:crypto";
import {rpc as originalRpc, RPC_NAMES as basicNames, store, newDeck, LIMITS, sweep as basicSweep, onBump as basicOnBump, RpcError} from "./game.js";
const DEFAULT_RULES = Object.freeze({ repeat:true, sequence:true, nine:true, cut:true, stack:true });
const stateRules = input => Object.fromEntries(Object.keys(DEFAULT_RULES).map(k => [k,typeof input?.[k] === "boolean" ? input[k] : true]));
const fail = (message, status=400) => {throw new RpcError(message,status)};
const clock = () => Date.now();
const isDraw = c => c?.slice(1)==="D" || c==="W4";
const weight = c => c==="W4" ? 4 : c?.slice(1)==="D" ? 2 : 0;
const value = c => c==="W"||c==="W4" ? c : c.slice(1);
const wild = c => c==="W"||c==="W4";
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
  for(let k=0;k<n;k++){if(!g.draw_pile.length){if(g.discard_pile.length<=1)break;g.draw_pile=shuffle(g.discard_pile.slice(0,-1));g.discard_pile=[top(g)];}
    const card=g.draw_pile.shift();if(card)got.push(card);}
  h.cards.push(...got);h.uno_called=false;h.uno_since=null;return got;}
function shuffle(a){const b=[...a];for(let k=b.length-1;k>0;k--){const j=crypto.randomInt(k+1);[b[k],b[j]]=[b[j],b[k]];}return b;}
const counter=(r,id)=>hand(r,id).cards.some(isDraw);
function nextTurn(g,idx){g.turn_idx=idx;g.turn_cards=[];g.turn_mode=null;g.turn_step=0;g.has_drawn=false;g.drawn_card=null;g.turn_started_at=clock();}
function finishNine(r){const g=r.game,n=g?.nine;if(!n)return;
  const missing=n.eligible.filter(id=>!n.pressed.includes(id));
  if(missing.length && clock()<n.deadline)return;
  const loser=missing.at(-1)||n.pressed.at(-1);
  if(loser)draw(r,loser,n.count);
  g.nine=null;g.last_action={type:"nine",by:n.source,name:name(n.source),target:loser,target_name:name(loser),n:n.count};g.seq++;bump(r);resolveDebt(r);
}
function resolveDebt(r){const g=r.game;if(!g||!g.pending_draw||g.nine)return;
  if(ready(r).stack && counter(r,current(g)))return;
  const loser=current(g),n=g.pending_draw;draw(r,loser,n);g.pending_draw=0;
  g.last_action={type:"stack_take",by:loser,name:name(loser),n};g.seq++;
  nextTurn(g,advance(g.turn_idx,g.direction,1,g.turn_order.length));bump(r);
}
function finish(r,automatic=false){const g=game(r);if(g.nine)fail("NINE_ACTIVE");
  const actor=current(g),cards=g.turn_cards||[],n=g.turn_order.length;
  if(!cards.length){
    if(g.pending_draw){const owed=g.pending_draw;draw(r,actor,owed);g.pending_draw=0;g.last_action={type:"stack_take",by:actor,name:name(actor),n:owed};}
    else {if(!g.has_drawn)draw(r,actor,1);g.last_action={type:automatic?"auto":"pass",by:actor,name:name(actor)};}
    nextTurn(g,advance(g.turn_idx,g.direction,1,n));g.seq++;bump(r);return;
  }
  let dir=g.direction,skips=0,added=0,nines=0;
  for(const card of cards){const v=value(card);
    if(v==="R"){if(n===2)skips++;else dir*=-1;}
    else if(v==="S")skips++;
    else if(isDraw(card))added+=weight(card);
    else if(v==="9")nines++;
  }
  if(g.pending_draw && !added)fail("MUST_COUNTER_OR_DRAW");
  g.direction=dir;g.pending_draw+=added;
  g.last_action={type:"end",by:actor,name:name(actor),count:cards.length};g.seq++;
  nextTurn(g,advance(g.turn_idx,dir,1+skips,n));
  if(nines && ready(r).nine && n>=3){const eligible=g.turn_order.filter(id=>id!==actor);
    g.nine={source:actor,count:nines,eligible,pressed:eligible.filter(isBot),deadline:clock()+8000};}
  bump(r);if(!g.nine)resolveDebt(r);
}
function play(r,id,card,color){const g=game(r),rules=ready(r),h=hand(r,id);let series=g.turn_cards||[];
  if(g.nine)fail("NINE_ACTIVE");
  const cutting=current(g)!==id;
  if(cutting){if(!rules.cut||!g.turn_order.includes(id)||g.pending_draw||card!==top(g))fail("CUT_NOT_ALLOWED");
    if(series.length)finish(r);if(g.nine||g.pending_draw)fail("CUT_NOT_ALLOWED");
    nextTurn(g,g.turn_order.indexOf(id));series=[];
  }
  if(!h.cards.includes(card)||!(/^(?:[rygb](?:[0-9]|S|R|D)|W|W4)$/).test(card))fail("CARD_NOT_IN_HAND");
  if(g.pending_draw && !series.length && !isDraw(card))fail("MUST_COUNTER_OR_DRAW");
  if(g.has_drawn && !series.length && g.drawn_card!==card)fail("MUST_PLAY_DRAWN");
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
  if(h.cards.length===1&&!h.uno_called)h.uno_since=clock();
  else if(h.cards.length!==1){h.uno_called=false;h.uno_since=null;}
  g.discard_pile.push(card);g.current_color=wild(card)?color:card[0];
  g.turn_cards=[...series,card];
  g.last_action={type:cutting?"cut":"play",by:id,name:name(id),card,color:g.current_color,left:h.cards.length};
  g.seq++;bump(r);
  if(h.cards.length===0){g.status="finished";g.winner_id=id;g.last_action.win=true;g.pending_draw=0;g.nine=null;
    r.status="waiting";bump(r,true);return {ok:true,won:true};}
  return {ok:true};
}
function botTick(r){const g=r.game;if(!g||g.status!=="playing"||g.nine||!isBot(current(g))||clock()-g.turn_started_at<750)return;
  const id=current(g),h=hand(r,id),bot=store.guestsById.get(id),rules=ready(r);
  if(h.cards.length<=2){h.uno_called=true;h.uno_since=null;}
  if(g.pending_draw&&!counter(r,id)){finish(r,true);return;}
  let options=h.cards.filter(c=>g.pending_draw?isDraw(c):playable(c,g));
  if(!options.length&&!g.pending_draw){const drawn=draw(r,id,1)[0];g.has_drawn=true;g.drawn_card=drawn||null;
    if(drawn&&playable(drawn,g))options=[drawn];}
  const score=c=>{const match=h.cards.filter(x=>x!==c&&value(x)===value(c)).length;
    const run=h.cards.filter(x=>x[0]===c[0]&&/^[0-9]$/.test(value(x))&&/^[0-9]$/.test(value(c))&&Math.abs(Number(value(x))-Number(value(c)))===1).length;
    return match*4+run*2+weight(c)*3+(value(c)==="S"?4:0)+(value(c)==="R"?2:0)-(wild(c)?2:0);};
  options.sort((a,b)=>score(b)-score(a));
  let pick=bot.difficulty==="hard"||Math.random()<0.6?options[0]:options[Math.floor(Math.random()*options.length)];
  const chooseColor=()=>{const counts={r:0,y:0,g:0,b:0};h.cards.forEach(c=>{if(counts[c[0]]!==undefined)counts[c[0]]++});
    return Object.keys(counts).sort((a,b)=>counts[b]-counts[a])[0];};
  if(pick){play(r,id,pick,chooseColor());if(h.cards.length===1){h.uno_called=true;h.uno_since=null;}
    for(let i=0;i<10&&g.status==="playing";i++){const series=g.turn_cards,first=series[0],prev=series.at(-1);
      const combos=h.cards.filter(c=>{const same=value(first)===value(c),delta=Number(value(c))-Number(value(prev));
        const run=/^\d$/.test(value(c))&&/^\d$/.test(value(prev))&&c[0]===prev[0]&&Math.abs(delta)===1&&(!g.turn_step||Math.sign(delta)===g.turn_step);
        return g.turn_mode==="repeat"?same:g.turn_mode==="sequence"?run:(same&&rules.repeat)||(run&&rules.sequence);});
      if(!combos.length)break;combos.sort((a,b)=>score(b)-score(a));play(r,id,combos[0],chooseColor());
      if(h.cards.length===1){h.uno_called=true;h.uno_since=null;}
    }
  }
  if(g.status==="playing")finish(r);
}
export function proSweep(){LIMITS.autoPassMs=60_000;const time=clock();
  for(const r of store.rooms.values()){
    for(const m of r.members){const b=store.guestsById.get(m.guest_id);if(b?.bot)b.last_seen=time;}
    const g=r.game;
    if(!g||g.status!=="playing")continue;
    if(g.nine&&(time>=g.nine.deadline||g.nine.eligible.every(id=>g.nine.pressed.includes(id))))finishNine(r);
    if(g.nine)continue;
    resolveDebt(r);botTick(r);
    if(g.status==="playing"&&time-g.turn_started_at>=60_000)finish(r,true);
  }
  basicSweep();
}
export const RPC_NAMES=[...new Set([...basicNames,"end_turn","accept_draw","press_nine","add_bot","remove_bot"])];
export function proRpc(fn,args={}){
  if(fn==="create_room"){const result=originalRpc(fn,args),r=find(result.code);r.rules=stateRules(args.p_rules);return result;}
  if(fn==="start_game"){const result=originalRpc(fn,args),r=find(args.p_code),g=r.game;
    Object.assign(g,{turn_cards:[],turn_mode:null,turn_step:0,pending_draw:0,nine:null});
    for(const h of r.hands.values())h.uno_since=null;
    return result;
  }
  if(fn==="get_room_state"){const result=originalRpc(fn,args),r=find(args.p_code),g=r.game;result.room.rules=ready(r);
    result.members=result.members.map(m=>({ ...m,bot:isBot(m.id),difficulty:store.guestsById.get(m.id)?.difficulty||null}));
    if(g&&result.game){result.game.turn_cards=[...(g.turn_cards||[])];result.game.pending_draw=g.pending_draw||0;
      result.game.nine=g.nine?{...g.nine,deadline:stamp(g.nine.deadline)}:null;
      result.game.can_catch_uno=r.members.some(m=>m.guest_id!==result.me&&r.hands.get(m.guest_id)?.cards.length===1&&!r.hands.get(m.guest_id)?.uno_called&&clock()-(r.hands.get(m.guest_id)?.uno_since||clock())>=8000);
      result.members=result.members.map(m=>({...m,uno_since:r.hands.get(m.id)?.uno_since?stamp(r.hands.get(m.id).uno_since):null}));}
    return result;
  }
  if(fn==="add_bot"){const {me,r}=guard(args);if(r.host_id!==me.id)fail("NOT_HOST");if(r.status!=="waiting")fail("GAME_STARTED");
    if(r.members.length>=r.max_players)fail("ROOM_FULL");
    const id=crypto.randomUUID(),t=clock(),difficulty=args.p_difficulty==="hard"?"hard":"easy";
    const bot={id,tokenHash:"bot:"+id,nickname:"Bot "+(r.members.filter(m=>isBot(m.guest_id)).length+1),last_seen:t,bot:true,difficulty};
    store.guestsById.set(id,bot);r.members.push({guest_id:id,joined_at:Math.max(t,(r.members.at(-1)?.joined_at||0)+1)});bump(r,true);return {id};
  }
  if(fn==="remove_bot"){const {me,r}=guard(args);if(r.host_id!==me.id)fail("NOT_HOST");if(r.status!=="waiting")fail("GAME_STARTED");
    const id=args.p_bot_id;if(!member(r,id)||!isBot(id))fail("NOT_BOT");r.members=r.members.filter(m=>m.guest_id!==id);store.guestsById.delete(id);bump(r,true);return {ok:true};}
  if(fn==="play_card"){const {me,r}=guard(args);return play(r,me.id,args.p_card,args.p_color);}
  if(fn==="end_turn"||fn==="pass_turn"){const {me,r}=guard(args),g=game(r);if(current(g)!==me.id)fail("NOT_YOUR_TURN");finish(r);return {ok:true};}
  if(fn==="draw_card"){const {me,r}=guard(args),g=game(r);if(current(g)!==me.id)fail("NOT_YOUR_TURN");
    if(g.nine)fail("NINE_ACTIVE");if(g.pending_draw)fail("MUST_COUNTER_OR_DRAW");
    if(g.turn_cards?.length)fail("ALREADY_PLAYED");if(g.has_drawn)fail("ALREADY_DRAWN");
    const card=draw(r,me.id,1)[0]||null;g.has_drawn=true;g.drawn_card=card;
    g.last_action={type:"draw",by:me.id,name:me.nickname};g.seq++;bump(r);
    return {card,playable:!!card&&playable(card,g)};}
  if(fn==="accept_draw"){const {me,r}=guard(args),g=game(r);if(current(g)!==me.id)fail("NOT_YOUR_TURN");
    if(!g.pending_draw||g.turn_cards.length)fail("NOTHING_TO_ACCEPT");const n=g.pending_draw;finish(r);return {ok:true,n};}
  if(fn==="call_uno"){const {me,r}=guard(args),g=game(r),h=hand(r,me.id);
    if(!(h.cards.length===1||(h.cards.length===2&&current(g)===me.id)))fail("UNO_NOT_ALLOWED");
    h.uno_called=true;h.uno_since=null;g.last_action={type:"uno",by:me.id,name:me.nickname};g.seq++;bump(r);return {ok:true};}
  if(fn==="catch_uno"){const {me,r}=guard(args),g=game(r),caught=[];
    for(const m of r.members){if(m.guest_id===me.id)continue;const h=r.hands.get(m.guest_id);
      if(h&&h.cards.length===1&&!h.uno_called&&h.uno_since&&clock()-h.uno_since>=8000){draw(r,m.guest_id,2);caught.push(m.guest_id);}}
    if(!caught.length)fail("CATCH_NOT_ALLOWED");
    g.last_action={type:"catch",by:me.id,name:me.nickname,target:caught[0],target_name:name(caught[0]),n:2,count:caught.length};
    g.seq++;bump(r);return {ok:true,count:caught.length};}
  if(fn==="press_nine"){const {me,r}=guard(args),g=game(r),n=g.nine;
    if(!n||clock()>=n.deadline||!n.eligible.includes(me.id)||n.pressed.includes(me.id))fail("NINE_NOT_ALLOWED");
    n.pressed.push(me.id);g.seq++;bump(r);if(n.eligible.every(id=>n.pressed.includes(id)))finishNine(r);return {ok:true};}
  return originalRpc(fn,args);
}
